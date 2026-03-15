"""
Tasmi transcription server — FastAPI + faster-whisper.
Accepts WAV audio, returns normalized Arabic transcription.
"""

import os
import logging
import tempfile
from contextlib import asynccontextmanager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("tasmi")

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel

from normalizer import normalize_arabic

# ---- Config from env ----

TASMI_API_KEY = os.environ.get("TASMI_API_KEY", "")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v3")
WHISPER_DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_CPU_THREADS = int(os.environ.get("WHISPER_CPU_THREADS", "2"))

# ---- Model singleton ----

model: WhisperModel | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global model
    print(f"Loading whisper model: {WHISPER_MODEL} ({WHISPER_COMPUTE_TYPE}, {WHISPER_DEVICE})")
    model = WhisperModel(
        WHISPER_MODEL,
        device=WHISPER_DEVICE,
        compute_type=WHISPER_COMPUTE_TYPE,
        cpu_threads=WHISPER_CPU_THREADS,
    )
    print("Model loaded.")
    yield
    model = None


app = FastAPI(title="Tasmi Transcription Server", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https://(miftah\.app|miftah(-[a-z0-9]+)?(-khayrouls-projects)?\.vercel\.app)",
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ---- Routes ----


@app.get("/health")
async def health():
    return {"status": "ok", "model": WHISPER_MODEL}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    x_api_key: str = Header(...),
):
    if not TASMI_API_KEY:
        raise HTTPException(500, "Server API key not configured")
    if x_api_key != TASMI_API_KEY:
        raise HTTPException(401, "Invalid API key")

    # Write uploaded WAV to temp file for faster-whisper
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp.flush()

        segments, info = model.transcribe(
            tmp.name,
            language="ar",
            beam_size=5,
            vad_filter=True,
            without_timestamps=True,
        )
        raw_text = " ".join(seg.text for seg in segments).strip()

    normalized = normalize_arabic(raw_text)
    logger.info("RAW: %s", raw_text)
    logger.info("NORMALIZED: %s", normalized)
    return {"normalized_text": normalized}
