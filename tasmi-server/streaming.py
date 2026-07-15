"""Small, model-free helpers for the Tasmi streaming transport."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import secrets
import time
import wave
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Collection


STREAM_PROTOCOL = "tasmi-stream-v1"
PCM_SAMPLE_RATE = 16_000
PCM_SAMPLE_WIDTH = 2
PCM_CHANNELS = 1

DEFAULT_ALLOWED_ORIGINS = frozenset(
    {
        "https://miftah.app",
        "https://miftah-six.vercel.app",
    }
)
_CONTROL_TYPES = {
    "auth",
    "speech_start",
    "speech_end",
    "pause",
    "resume",
    "stop",
    "ping",
}


class InferenceBusy(RuntimeError):
    """The bounded inference queue could not accept or finish a request."""


@dataclass(order=True)
class _InferenceJob:
    priority: int
    sequence: int
    wav_bytes: bytes = field(compare=False, repr=False)
    vad_filter: bool = field(compare=False)
    result: asyncio.Future[tuple[str, int]] = field(compare=False, repr=False)
    started_signal: asyncio.Event = field(compare=False, repr=False)


class BoundedInferenceCoordinator:
    """Serialize a native model runner independently from request cancellation."""

    def __init__(
        self,
        runner: Callable[[bytes, bool], tuple[str, int]],
        *,
        max_pending: int,
        result_timeout_seconds: float,
    ) -> None:
        if max_pending < 1:
            raise ValueError("max_pending must be at least one")
        if result_timeout_seconds <= 0:
            raise ValueError("result_timeout_seconds must be positive")
        self._runner = runner
        self._queue: asyncio.PriorityQueue[_InferenceJob] = asyncio.PriorityQueue(
            maxsize=max_pending
        )
        self._result_timeout_seconds = result_timeout_seconds
        self._worker: asyncio.Task[None] | None = None
        self._sequence = 0
        self._closing = False

    @property
    def queue_depth(self) -> int:
        return self._queue.qsize()

    def start(self) -> None:
        if self._worker is not None:
            raise RuntimeError("inference coordinator already started")
        self._worker = asyncio.create_task(self._run(), name="tasmi-inference-worker")

    async def submit(
        self,
        wav_bytes: bytes,
        vad_filter: bool,
        *,
        priority: int,
        started_signal: asyncio.Event | None = None,
    ) -> tuple[str, int]:
        if self._closing or self._worker is None:
            raise InferenceBusy("inference-busy")

        loop = asyncio.get_running_loop()
        result: asyncio.Future[tuple[str, int]] = loop.create_future()
        self._sequence += 1
        job = _InferenceJob(
            priority=priority,
            sequence=self._sequence,
            wav_bytes=wav_bytes,
            vad_filter=vad_filter,
            result=result,
            started_signal=started_signal or asyncio.Event(),
        )
        self._discard_cancelled_pending()
        try:
            self._queue.put_nowait(job)
        except asyncio.QueueFull as exc:
            raise InferenceBusy("inference-busy") from exc

        try:
            return await asyncio.wait_for(
                asyncio.shield(result), timeout=self._result_timeout_seconds
            )
        except asyncio.TimeoutError as exc:
            result.cancel()
            raise InferenceBusy("inference-busy") from exc
        except asyncio.CancelledError:
            result.cancel()
            raise

    async def close(self) -> None:
        self._closing = True
        while True:
            try:
                pending = self._queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            pending.result.cancel()
            self._queue.task_done()

        await self._queue.join()
        if self._worker is not None:
            self._worker.cancel()
            await asyncio.gather(self._worker, return_exceptions=True)
            self._worker = None

    async def _run(self) -> None:
        while True:
            job = await self._queue.get()
            try:
                if job.result.cancelled():
                    continue
                job.started_signal.set()
                try:
                    completed = await asyncio.to_thread(
                        self._runner, job.wav_bytes, job.vad_filter
                    )
                except Exception as exc:
                    if not job.result.done():
                        job.result.set_exception(exc)
                else:
                    if not job.result.done():
                        job.result.set_result(completed)
            finally:
                self._queue.task_done()

    def _discard_cancelled_pending(self) -> None:
        """Free queue slots held by requests cancelled before native execution."""

        retained: list[_InferenceJob] = []
        while True:
            try:
                job = self._queue.get_nowait()
            except asyncio.QueueEmpty:
                break
            if job.result.cancelled():
                self._queue.task_done()
            else:
                retained.append(job)

        for job in retained:
            self._queue.put_nowait(job)
            # Re-adding increments unfinished work; retire the original queue
            # entry so each retained job is still counted exactly once.
            self._queue.task_done()


def should_cancel_partial_before_final(
    *,
    task_pending: bool,
    pending_pcm_size: int,
    final_pcm_size: int,
    inference_started: bool,
) -> bool:
    """Promote queued/stale partial work while reusing identical active work."""

    return task_pending and (
        pending_pcm_size != final_pcm_size or not inference_started
    )


class OrderedAsyncTaskChain:
    """Run connection-local finalizers in append order, even after a failure."""

    def __init__(self) -> None:
        self._tail: asyncio.Task[None] | None = None

    def append(
        self,
        operation: Callable[[], Awaitable[None]],
        *,
        name: str,
    ) -> asyncio.Task[None]:
        previous = self._tail

        async def run_in_order() -> None:
            if previous is not None:
                try:
                    await asyncio.shield(previous)
                except asyncio.CancelledError:
                    current = asyncio.current_task()
                    if current is not None and current.cancelling():
                        raise
                except Exception:
                    # The previous task's done callback records the failure. A
                    # failed utterance must not permanently block later finals.
                    pass
            await operation()

        task = asyncio.create_task(run_in_order(), name=name)
        self._tail = task
        return task


def parse_allowed_origins(raw: str | None) -> frozenset[str]:
    """Parse an exact, comma-separated WebSocket Origin allowlist."""

    if raw is None:
        return DEFAULT_ALLOWED_ORIGINS
    return frozenset(origin.strip() for origin in raw.split(",") if origin.strip())


def origin_allowed(
    origin: str | None,
    allowed_origins: Collection[str] = DEFAULT_ALLOWED_ORIGINS,
) -> bool:
    """Validate Origin by exact membership; wildcard preview origins are forbidden."""

    return bool(origin and origin in allowed_origins)


def parse_control_message(raw: str) -> dict[str, object] | None:
    """Validate the intentionally tiny browser-to-server control protocol."""

    if not raw or len(raw) > 2_048:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict) or payload.get("type") not in _CONTROL_TYPES:
        return None

    message_type = payload["type"]
    if message_type == "auth":
        ticket = payload.get("ticket")
        if not isinstance(ticket, str) or not 32 <= len(ticket) <= 256:
            return None
        return {"type": "auth", "ticket": ticket}

    if message_type in {"speech_start", "speech_end"}:
        utterance_id = payload.get("utterance_id")
        if (
            not isinstance(utterance_id, int)
            or isinstance(utterance_id, bool)
            or not 0 <= utterance_id <= 1_000_000_000
        ):
            return None
        return {"type": message_type, "utterance_id": utterance_id}

    return {"type": message_type}


def pcm16le_to_wav(pcm: bytes, sample_rate: int = PCM_SAMPLE_RATE) -> bytes:
    """Wrap raw mono PCM16LE frames in an in-memory WAV container."""

    if len(pcm) % PCM_SAMPLE_WIDTH != 0:
        raise ValueError("PCM16LE audio must contain complete two-byte samples")
    if sample_rate <= 0:
        raise ValueError("sample rate must be positive")

    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(PCM_CHANNELS)
        wav_file.setsampwidth(PCM_SAMPLE_WIDTH)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm)
    return output.getvalue()


def audio_duration_ms(pcm: bytes) -> int:
    if len(pcm) % PCM_SAMPLE_WIDTH != 0:
        raise ValueError("PCM16LE audio must contain complete two-byte samples")
    bytes_per_second = PCM_SAMPLE_RATE * PCM_SAMPLE_WIDTH * PCM_CHANNELS
    return round(len(pcm) / bytes_per_second * 1_000)


def validate_wav_upload(wav_bytes: bytes, max_audio_seconds: float) -> int:
    """Validate the browser fallback's mono, 16 kHz, PCM16 WAV contract."""

    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wav_file:
            if wav_file.getnchannels() != PCM_CHANNELS:
                raise ValueError("WAV audio must be mono")
            if wav_file.getsampwidth() != PCM_SAMPLE_WIDTH:
                raise ValueError("WAV audio must be PCM16")
            if wav_file.getframerate() != PCM_SAMPLE_RATE:
                raise ValueError("WAV audio must use a 16 kHz sample rate")
            if wav_file.getcomptype() != "NONE":
                raise ValueError("WAV audio must be uncompressed PCM")
            frame_count = wav_file.getnframes()
            frame_bytes = wav_file.readframes(frame_count)
    except (EOFError, wave.Error) as exc:
        raise ValueError("invalid WAV audio") from exc

    duration_seconds = frame_count / PCM_SAMPLE_RATE
    if duration_seconds <= 0:
        raise ValueError("WAV audio is empty")
    if len(frame_bytes) != frame_count * PCM_SAMPLE_WIDTH * PCM_CHANNELS:
        raise ValueError("WAV audio data is truncated")
    if duration_seconds > max_audio_seconds:
        raise ValueError("WAV audio duration exceeds the configured limit")
    return round(duration_seconds * 1_000)


@dataclass(frozen=True)
class IssuedTicket:
    value: str
    expires_at_epoch_ms: int


class StreamTicketStore:
    """Process-local, short-lived, single-use WebSocket tickets."""

    def __init__(
        self,
        ttl_seconds: int = 60,
        max_tickets: int = 128,
        monotonic: Callable[[], float] = time.monotonic,
        wall_time: Callable[[], float] = time.time,
    ) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_tickets = max_tickets
        self._monotonic = monotonic
        self._wall_time = wall_time
        self._tickets: dict[bytes, float] = {}

    def issue(self) -> IssuedTicket:
        now = self._monotonic()
        self._remove_expired(now)
        if len(self._tickets) >= self._max_tickets:
            oldest = min(self._tickets, key=self._tickets.__getitem__)
            self._tickets.pop(oldest, None)

        value = secrets.token_urlsafe(32)
        ticket_key = self._ticket_key(value)
        self._tickets = {**self._tickets, ticket_key: now + self._ttl_seconds}
        return IssuedTicket(
            value=value,
            expires_at_epoch_ms=round((self._wall_time() + self._ttl_seconds) * 1_000),
        )

    def consume(self, value: str) -> bool:
        now = self._monotonic()
        self._remove_expired(now)
        ticket_key = self._ticket_key(value)
        expires_at = self._tickets.get(ticket_key)
        if expires_at is None or expires_at <= now:
            return False
        self._tickets = {
            stored_key: expiry
            for stored_key, expiry in self._tickets.items()
            if stored_key != ticket_key
        }
        return True

    def _remove_expired(self, now: float) -> None:
        self._tickets = {
            ticket: expiry
            for ticket, expiry in self._tickets.items()
            if expiry > now
        }

    @staticmethod
    def _ticket_key(value: str) -> bytes:
        return hashlib.sha256(value.encode("utf-8")).digest()
