"""Tasmi transcription server: HTTP fallback plus near-live WebSocket transport."""

from __future__ import annotations

import asyncio
import hmac
import logging
import os
import tempfile
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field

from fastapi import FastAPI, File, Header, HTTPException, UploadFile, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websockets import WebSocketDisconnect
from faster_whisper import WhisperModel

from normalizer import normalize_arabic
from streaming import (
    BoundedInferenceCoordinator,
    InferenceBusy,
    OrderedAsyncTaskChain,
    PCM_SAMPLE_RATE,
    STREAM_PROTOCOL,
    StreamTicketStore,
    audio_duration_ms,
    origin_allowed,
    parse_allowed_origins,
    parse_control_message,
    pcm16le_to_wav,
    should_cancel_partial_before_final,
    validate_wav_upload,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tasmi")


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


TASMI_API_KEY = os.environ.get("TASMI_API_KEY", "")
WHISPER_MODEL = os.environ.get(
    "WHISPER_MODEL", "OdyAsh/faster-whisper-base-ar-quran"
)
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_CPU_THREADS = int(os.environ.get("WHISPER_CPU_THREADS", "2"))
WHISPER_BEAM_SIZE = int(os.environ.get("WHISPER_BEAM_SIZE", "1"))
WHISPER_HTTP_VAD_FILTER = _env_bool("WHISPER_HTTP_VAD_FILTER", True)
WHISPER_STREAM_VAD_FILTER = _env_bool("WHISPER_STREAM_VAD_FILTER", False)

MAX_UPLOAD_BYTES = int(os.environ.get("TASMI_MAX_UPLOAD_BYTES", str(5 * 1024 * 1024)))
MAX_HTTP_AUDIO_SECONDS = float(os.environ.get("TASMI_MAX_AUDIO_SECONDS", "30"))
MAX_CONCURRENT_STREAMS = int(os.environ.get("TASMI_MAX_CONCURRENT_STREAMS", "2"))
MAX_STREAM_SECONDS = float(os.environ.get("TASMI_STREAM_MAX_AUDIO_SECONDS", "30"))
MIN_PARTIAL_SECONDS = float(os.environ.get("TASMI_STREAM_MIN_PARTIAL_SECONDS", "0.8"))
PARTIAL_INTERVAL_SECONDS = float(os.environ.get("TASMI_STREAM_PARTIAL_INTERVAL_SECONDS", "0.8"))
INFERENCE_QUEUE_TIMEOUT_SECONDS = float(os.environ.get("TASMI_INFERENCE_QUEUE_TIMEOUT_SECONDS", "8"))
MAX_PENDING_INFERENCES = int(os.environ.get("TASMI_MAX_PENDING_INFERENCES", "3"))
MAX_PENDING_FINALS = int(os.environ.get("TASMI_STREAM_MAX_PENDING_FINALS", "2"))
MAX_PENDING_HANDSHAKES = int(os.environ.get("TASMI_STREAM_MAX_PENDING_HANDSHAKES", "8"))
STREAM_IDLE_TIMEOUT_SECONDS = float(os.environ.get("TASMI_STREAM_IDLE_TIMEOUT_SECONDS", "60"))
STREAM_CONNECTION_TIMEOUT_SECONDS = float(
    os.environ.get("TASMI_STREAM_CONNECTION_TIMEOUT_SECONDS", "900")
)
ALLOWED_ORIGINS = parse_allowed_origins(os.environ.get("TASMI_ALLOWED_ORIGINS"))

MAX_STREAM_BYTES = round(MAX_STREAM_SECONDS * PCM_SAMPLE_RATE * 2)
MIN_PARTIAL_BYTES = round(MIN_PARTIAL_SECONDS * PCM_SAMPLE_RATE * 2)
PRE_ROLL_BYTES = round(0.25 * PCM_SAMPLE_RATE * 2)

model: WhisperModel | None = None
inference: BoundedInferenceCoordinator | None = None
stream_slots: asyncio.Semaphore | None = None
handshake_slots: asyncio.Semaphore | None = None
tickets = StreamTicketStore(ttl_seconds=60, max_tickets=128)


def _api_key_valid(candidate: str) -> bool:
    return bool(
        TASMI_API_KEY
        and candidate
        and hmac.compare_digest(candidate.encode(), TASMI_API_KEY.encode())
    )


def _transcribe_wav(wav_bytes: bytes, vad_filter: bool) -> tuple[str, int]:
    if model is None:
        raise RuntimeError("Whisper model is not loaded")
    started_at = time.perf_counter()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
        tmp.write(wav_bytes)
        tmp.flush()
        segments, _ = model.transcribe(
            tmp.name,
            language="ar",
            beam_size=WHISPER_BEAM_SIZE,
            vad_filter=vad_filter,
            without_timestamps=True,
        )
        raw_text = " ".join(segment.text for segment in segments).strip()
    inference_ms = round((time.perf_counter() - started_at) * 1_000)
    return normalize_arabic(raw_text), inference_ms


async def _run_inference(
    wav_bytes: bytes,
    vad_filter: bool,
    *,
    priority: int,
    started_signal: asyncio.Event | None = None,
) -> tuple[str, int]:
    if inference is None:
        raise RuntimeError("Inference coordinator is not initialized")
    return await inference.submit(
        wav_bytes,
        vad_filter,
        priority=priority,
        started_signal=started_signal,
    )


async def _warm_model() -> None:
    silence = b"\x00\x00" * round(0.25 * PCM_SAMPLE_RATE)
    try:
        await _run_inference(pcm16le_to_wav(silence), False, priority=0)
    except Exception:
        logger.exception("Whisper warmup failed")
        raise


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model, inference, stream_slots, handshake_slots
    logger.info(
        "Loading model=%s compute=%s device=%s beam=%d",
        WHISPER_MODEL,
        WHISPER_COMPUTE_TYPE,
        WHISPER_DEVICE,
        WHISPER_BEAM_SIZE,
    )
    model = await asyncio.to_thread(
        WhisperModel,
        WHISPER_MODEL,
        device=WHISPER_DEVICE,
        compute_type=WHISPER_COMPUTE_TYPE,
        cpu_threads=WHISPER_CPU_THREADS,
    )
    inference = BoundedInferenceCoordinator(
        _transcribe_wav,
        max_pending=MAX_PENDING_INFERENCES,
        result_timeout_seconds=INFERENCE_QUEUE_TIMEOUT_SECONDS,
    )
    inference.start()
    stream_slots = asyncio.Semaphore(MAX_CONCURRENT_STREAMS)
    handshake_slots = asyncio.Semaphore(MAX_PENDING_HANDSHAKES)
    try:
        await _warm_model()
        logger.info("Tasmi model ready")
        yield
    finally:
        if inference is not None:
            await inference.close()
        inference = None
        model = None
        stream_slots = None
        handshake_slots = None


app = FastAPI(title="Tasmi Transcription Server", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model": WHISPER_MODEL,
        "beam_size": WHISPER_BEAM_SIZE,
        "streaming": True,
        "stream_protocol": STREAM_PROTOCOL,
        "max_concurrent_streams": MAX_CONCURRENT_STREAMS,
        "inference_queue_depth": inference.queue_depth if inference is not None else 0,
    }


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...), x_api_key: str = Header(...)):
    if not TASMI_API_KEY:
        raise HTTPException(500, "Server API key not configured")
    if not _api_key_valid(x_api_key):
        raise HTTPException(401, "Invalid API key")

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Audio too large")
    try:
        validate_wav_upload(content, MAX_HTTP_AUDIO_SECONDS)
    except ValueError as exc:
        status = 413 if "limit" in str(exc) else 400
        raise HTTPException(status, str(exc)) from exc
    try:
        normalized, inference_ms = await _run_inference(
            content, WHISPER_HTTP_VAD_FILTER, priority=0
        )
    except InferenceBusy as exc:
        raise HTTPException(503, "Transcription queue is busy") from exc

    logger.info(
        "HTTP transcription complete bytes=%d inference_ms=%d has_text=%s",
        len(content),
        inference_ms,
        bool(normalized),
    )
    return {"normalized_text": normalized, "inference_ms": inference_ms}


@app.post("/stream-ticket")
async def stream_ticket(x_api_key: str = Header(...)):
    if not TASMI_API_KEY:
        raise HTTPException(500, "Server API key not configured")
    if not _api_key_valid(x_api_key):
        raise HTTPException(401, "Invalid API key")
    issued = tickets.issue()
    return {
        "ticket": issued.value,
        "expires_at": issued.expires_at_epoch_ms,
        "protocol": STREAM_PROTOCOL,
    }


@dataclass
class Utterance:
    utterance_id: int
    pcm: bytearray
    revision: int = 0
    last_partial_started_at: float = 0.0
    last_partial_size: int = 0
    last_partial_text: str = ""
    pending_partial_size: int = 0
    partial_inference_started: asyncio.Event | None = field(default=None, repr=False)
    partial_task: asyncio.Task[None] | None = field(default=None, repr=False)


async def _send_json(
    websocket: WebSocket,
    send_lock: asyncio.Lock,
    payload: dict[str, object],
) -> None:
    async with send_lock:
        await websocket.send_json(payload)


async def _transcribe_stream_snapshot(
    websocket: WebSocket,
    send_lock: asyncio.Lock,
    utterance: Utterance,
    pcm: bytes,
    message_type: str,
    started_signal: asyncio.Event | None = None,
) -> None:
    try:
        normalized, inference_ms = await _run_inference(
            pcm16le_to_wav(pcm),
            WHISPER_STREAM_VAD_FILTER,
            priority=10 if message_type == "partial" else 0,
            started_signal=started_signal,
        )
    except InferenceBusy:
        await _send_json(
            websocket,
            send_lock,
            {
                "type": "error",
                "code": "inference-busy",
                "recoverable": True,
            },
        )
        return
    except Exception:
        logger.exception(
            "Stream inference failed utterance_id=%d type=%s",
            utterance.utterance_id,
            message_type,
        )
        await _send_json(
            websocket,
            send_lock,
            {
                "type": "error",
                "code": "inference-failed",
                "recoverable": True,
            },
        )
        return

    utterance.last_partial_size = len(pcm)
    utterance.last_partial_text = normalized
    await _send_json(
        websocket,
        send_lock,
        {
            "type": message_type,
            "utterance_id": utterance.utterance_id,
            "revision": utterance.revision,
            "normalized_text": normalized,
            "audio_ms": audio_duration_ms(pcm),
            "inference_ms": inference_ms,
        },
    )


async def _finalize_utterance(
    websocket: WebSocket,
    send_lock: asyncio.Lock,
    utterance: Utterance,
) -> None:
    if utterance.partial_task is not None:
        if should_cancel_partial_before_final(
            task_pending=not utterance.partial_task.done(),
            pending_pcm_size=utterance.pending_partial_size,
            final_pcm_size=len(utterance.pcm),
            inference_started=bool(
                utterance.partial_inference_started
                and utterance.partial_inference_started.is_set()
            ),
        ):
            await _cancel_partial(utterance)
        try:
            if not utterance.partial_task.cancelled():
                await utterance.partial_task
        except asyncio.CancelledError:
            current_task = asyncio.current_task()
            if current_task is not None and current_task.cancelling():
                raise
        except (WebSocketDisconnect, RuntimeError):
            pass

    pcm = bytes(utterance.pcm)
    utterance.revision += 1
    if utterance.last_partial_size == len(pcm):
        await _send_json(
            websocket,
            send_lock,
            {
                "type": "final",
                "utterance_id": utterance.utterance_id,
                "revision": utterance.revision,
                "normalized_text": utterance.last_partial_text,
                "audio_ms": audio_duration_ms(pcm),
                "inference_ms": 0,
            },
        )
        return
    await _transcribe_stream_snapshot(
        websocket, send_lock, utterance, pcm, "final"
    )


def _schedule_partial(
    websocket: WebSocket,
    send_lock: asyncio.Lock,
    utterance: Utterance,
) -> None:
    now = time.monotonic()
    if len(utterance.pcm) < MIN_PARTIAL_BYTES:
        return
    if now - utterance.last_partial_started_at < PARTIAL_INTERVAL_SECONDS:
        return
    if utterance.partial_task is not None and not utterance.partial_task.done():
        return

    utterance.last_partial_started_at = now
    utterance.revision += 1
    snapshot = bytes(utterance.pcm)
    utterance.pending_partial_size = len(snapshot)
    started_signal = asyncio.Event()
    utterance.partial_inference_started = started_signal
    utterance.partial_task = asyncio.create_task(
        _transcribe_stream_snapshot(
            websocket,
            send_lock,
            utterance,
            snapshot,
            "partial",
            started_signal,
        ),
        name=f"tasmi-partial-{utterance.utterance_id}-{utterance.revision}",
    )
    utterance.partial_task.add_done_callback(_log_task_failure)


def _log_task_failure(task: asyncio.Task[None]) -> None:
    if task.cancelled():
        return
    try:
        exception = task.exception()
    except asyncio.CancelledError:
        return
    if exception is not None and not isinstance(exception, WebSocketDisconnect):
        logger.error(
            "Tasmi background task failed",
            exc_info=(type(exception), exception, exception.__traceback__),
        )


def _task_finished(task: asyncio.Task[None], tasks: set[asyncio.Task[None]]) -> None:
    tasks.discard(task)
    _log_task_failure(task)


async def _cancel_partial(utterance: Utterance) -> None:
    task = utterance.partial_task
    if task is None or task.done():
        return
    task.cancel()
    await asyncio.gather(task, return_exceptions=True)


@app.websocket("/ws/transcribe")
async def websocket_transcribe(websocket: WebSocket):
    if not origin_allowed(websocket.headers.get("origin"), ALLOWED_ORIGINS):
        await websocket.close(code=1008, reason="Origin not allowed")
        return
    if stream_slots is None or handshake_slots is None:
        await websocket.close(code=1013, reason="Server not ready")
        return

    try:
        await asyncio.wait_for(handshake_slots.acquire(), timeout=0.05)
    except asyncio.TimeoutError:
        await websocket.close(code=1013, reason="Too many pending handshakes")
        return

    handshake_acquired = True
    stream_acquired = False
    send_lock = asyncio.Lock()
    final_chain = OrderedAsyncTaskChain()
    final_tasks: set[asyncio.Task[None]] = set()
    current: Utterance | None = None
    pre_roll = bytearray()
    paused = False
    last_utterance_id = -1

    try:
        await websocket.accept()
        try:
            auth_message = await asyncio.wait_for(websocket.receive(), timeout=5)
        except asyncio.TimeoutError:
            await websocket.close(code=1008, reason="Authentication timed out")
            return
        raw_auth = auth_message.get("text")
        if not isinstance(raw_auth, str):
            await websocket.close(code=1008, reason="Authentication must be JSON")
            return
        auth = parse_control_message(raw_auth)
        if auth is None or auth.get("type") != "auth":
            await websocket.close(code=1008, reason="Invalid or expired ticket")
            return

        try:
            await asyncio.wait_for(stream_slots.acquire(), timeout=0.05)
        except asyncio.TimeoutError:
            await websocket.close(code=1013, reason="All stream slots are busy")
            return
        stream_acquired = True

        if not tickets.consume(str(auth.get("ticket", ""))):
            await websocket.close(code=1008, reason="Invalid or expired ticket")
            return

        handshake_slots.release()
        handshake_acquired = False

        await _send_json(
            websocket,
            send_lock,
            {
                "type": "ready",
                "protocol": STREAM_PROTOCOL,
                "sample_rate": PCM_SAMPLE_RATE,
            },
        )
        connection_deadline = time.monotonic() + STREAM_CONNECTION_TIMEOUT_SECONDS

        while True:
            remaining_connection_seconds = connection_deadline - time.monotonic()
            if remaining_connection_seconds <= 0:
                await websocket.close(code=1000, reason="Stream duration limit")
                break
            try:
                message = await asyncio.wait_for(
                    websocket.receive(),
                    timeout=min(
                        STREAM_IDLE_TIMEOUT_SECONDS, remaining_connection_seconds
                    ),
                )
            except asyncio.TimeoutError:
                await websocket.close(code=1001, reason="Stream idle timeout")
                break
            if message.get("type") == "websocket.disconnect":
                break

            binary = message.get("bytes")
            if isinstance(binary, bytes):
                if not binary or len(binary) > 64 * 1024 or len(binary) % 2 != 0:
                    await _send_json(
                        websocket,
                        send_lock,
                        {"type": "error", "code": "invalid-audio-frame", "recoverable": False},
                    )
                    await websocket.close(code=1009, reason="Invalid audio frame")
                    break
                if paused:
                    continue
                if current is None:
                    pre_roll.extend(binary)
                    if len(pre_roll) > PRE_ROLL_BYTES:
                        pre_roll = pre_roll[-PRE_ROLL_BYTES:]
                    continue
                if len(current.pcm) + len(binary) > MAX_STREAM_BYTES:
                    await _send_json(
                        websocket,
                        send_lock,
                        {"type": "error", "code": "utterance-too-long", "recoverable": False},
                    )
                    await websocket.close(code=1009, reason="Utterance too long")
                    break
                current.pcm.extend(binary)
                _schedule_partial(websocket, send_lock, current)
                continue

            raw_control = message.get("text")
            if not isinstance(raw_control, str):
                continue
            control = parse_control_message(raw_control)
            if control is None:
                await _send_json(
                    websocket,
                    send_lock,
                    {"type": "error", "code": "invalid-control", "recoverable": True},
                )
                continue

            message_type = control["type"]
            if message_type == "speech_start":
                utterance_id = int(control["utterance_id"])
                if paused:
                    await _send_json(
                        websocket,
                        send_lock,
                        {"type": "error", "code": "stream-paused", "recoverable": True},
                    )
                    continue
                if current is not None or utterance_id <= last_utterance_id:
                    await _send_json(
                        websocket,
                        send_lock,
                        {"type": "error", "code": "utterance-order", "recoverable": True},
                    )
                    continue
                last_utterance_id = utterance_id
                current = Utterance(utterance_id, bytearray(pre_roll))
                pre_roll = bytearray()
            elif message_type == "speech_end":
                utterance_id = int(control["utterance_id"])
                if current is None or current.utterance_id != utterance_id:
                    await _send_json(
                        websocket,
                        send_lock,
                        {"type": "error", "code": "utterance-order", "recoverable": True},
                    )
                    continue
                completed = current
                current = None
                if len(final_tasks) >= MAX_PENDING_FINALS:
                    await _cancel_partial(completed)
                    await _send_json(
                        websocket,
                        send_lock,
                        {"type": "error", "code": "stream-backpressure", "recoverable": True},
                    )
                    continue
                task = final_chain.append(
                    lambda completed=completed: _finalize_utterance(
                        websocket, send_lock, completed
                    ),
                    name=f"tasmi-final-{completed.utterance_id}",
                )
                final_tasks.add(task)
                task.add_done_callback(
                    lambda completed_task: _task_finished(completed_task, final_tasks)
                )
            elif message_type == "pause":
                paused = True
                if current is not None:
                    await _cancel_partial(current)
                current = None
                pre_roll = bytearray()
                await _send_json(websocket, send_lock, {"type": "paused"})
            elif message_type == "resume":
                paused = False
                await _send_json(websocket, send_lock, {"type": "resumed"})
            elif message_type == "ping":
                await _send_json(websocket, send_lock, {"type": "pong"})
            elif message_type == "stop":
                await websocket.close(code=1000, reason="Stream stopped")
                break
    except WebSocketDisconnect:
        pass
    finally:
        tasks_to_cancel = list(final_tasks)
        if current is not None and current.partial_task is not None:
            current.partial_task.cancel()
            tasks_to_cancel.append(current.partial_task)
        for task in tasks_to_cancel:
            task.cancel()
        if tasks_to_cancel:
            await asyncio.gather(*tasks_to_cancel, return_exceptions=True)
        if stream_acquired:
            stream_slots.release()
        if handshake_acquired:
            handshake_slots.release()
