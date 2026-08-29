from __future__ import annotations

import logging
import os
import re
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List

import librosa
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("x-audio-model")

MODEL_NAME = os.getenv("MODEL_NAME", "MIT/ast-finetuned-audioset-10-10-0.4593")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
SAMPLE_RATE = 16000
TOP_K = int(os.getenv("TOP_K", "10"))

# Keep CPU inference from oversubscribing cores, which makes latency spiky.
if DEVICE == "cpu":
    torch.set_num_threads(max(1, min(4, os.cpu_count() or 4)))

# ---------------------------------------------------------------------------
# Event vocabulary.
#
# These strings are AudioSet class names exactly as the AST model emits them in
# `model.config.id2label`. The eventKey handed to the API is just the slug of the
# label, produced by the same rule the server uses (see `slugifyModelLabel` in
# server/src/utils/catalog.ts). Deriving the key instead of hand-mapping it means
# a prediction can never land on a toggle that does not exist.
# ---------------------------------------------------------------------------
SUPPORTED_LABELS: List[str] = [
    "Baby cry, infant cry",
    "Doorbell",
    "Knock",
    "Bark",
    "Thunder",
    "Rain",
    "Fire alarm",
    "Siren",
    # AudioSet has no "Emergency alarm" class; "Alarm" is the generic siren/klaxon
    # class and is what the UI surfaces as "Emergency Alarm".
    "Alarm",
    "Glass",
    "Breaking",
    "Vehicle",
    "Vehicle horn, car horn, honking",
    "Motorcycle",
    "Train",
    "Bicycle bell",
    "Speech",
]


def slugify_model_label(label: str) -> str:
    """Lowercase, collapse every non-alphanumeric run to one underscore, trim."""
    return re.sub(r"^_+|_+$", "", re.sub(r"[^a-z0-9]+", "_", label.lower()))


app = FastAPI(title="X Audio Model Service")

log.info("loading %s on %s", MODEL_NAME, DEVICE)
_load_started = time.perf_counter()
extractor = AutoFeatureExtractor.from_pretrained(MODEL_NAME)
model = AutoModelForAudioClassification.from_pretrained(MODEL_NAME).to(DEVICE)
model.eval()
log.info("model ready in %.1fs", time.perf_counter() - _load_started)

# label -> class index, resolved once so inference is a tensor gather, not a scan.
_LABEL_TO_INDEX: Dict[str, int] = {label: index for index, label in model.config.id2label.items()}

SUPPORTED_INDICES: List[int] = []
SUPPORTED_RESOLVED: List[str] = []
MISSING_LABELS: List[str] = []
for _label in SUPPORTED_LABELS:
    _index = _LABEL_TO_INDEX.get(_label)
    if _index is None:
        MISSING_LABELS.append(_label)
        continue
    SUPPORTED_INDICES.append(_index)
    SUPPORTED_RESOLVED.append(_label)

if MISSING_LABELS:
    # Loud but non-fatal: the remaining labels still work, and /health reports this
    # so a mismatch surfaces instead of looking like a silent detection failure.
    log.error("labels absent from %s and permanently unmatchable: %s", MODEL_NAME, MISSING_LABELS)
log.info("watching %d/%d AudioSet classes", len(SUPPORTED_RESOLVED), len(SUPPORTED_LABELS))

_SUPPORTED_INDEX_TENSOR = torch.tensor(SUPPORTED_INDICES, dtype=torch.long, device=DEVICE)
_SUPPORTED_INDEX_SET = set(SUPPORTED_INDICES)


def _entry(label: str, score: float) -> Dict[str, Any]:
    return {
        "eventKey": slugify_model_label(label),
        "modelLabel": label,
        "confidence": round(score, 4),
    }


def predict_file(path: str) -> Dict[str, Any]:
    timings: Dict[str, float] = {}

    started = time.perf_counter()
    try:
        audio, _sr = librosa.load(path, sr=SAMPLE_RATE, mono=True)
    except Exception as error:  # noqa: BLE001 - surfaced to the caller as a 400
        raise HTTPException(status_code=400, detail={"stage": "decode", "message": str(error)}) from error
    timings["decodeMs"] = round((time.perf_counter() - started) * 1000, 1)

    if audio.size == 0:
        raise HTTPException(status_code=400, detail={"stage": "decode", "message": "audio contains no samples"})

    started = time.perf_counter()
    inputs = extractor(audio, sampling_rate=SAMPLE_RATE, return_tensors="pt")
    inputs = {key: value.to(DEVICE) for key, value in inputs.items()}
    timings["featureMs"] = round((time.perf_counter() - started) * 1000, 1)

    started = time.perf_counter()
    with torch.inference_mode():
        outputs = model(**inputs)
    # AST is multi-label, so each logit is an independent sigmoid, not a softmax.
    probabilities = torch.sigmoid(outputs.logits)[0]
    timings["inferenceMs"] = round((time.perf_counter() - started) * 1000, 1)

    # Ranked over the watched classes only: the caller wants the first entry here
    # to be a directly actionable event, not "Music" or some other unwatched class.
    supported_scores = probabilities.index_select(0, _SUPPORTED_INDEX_TENSOR)
    order = torch.argsort(supported_scores, descending=True)[:TOP_K]
    candidates = [
        _entry(SUPPORTED_RESOLVED[position], float(supported_scores[position].item()))
        for position in order.tolist()
    ]

    # Unfiltered ranking, returned purely so a miss can be diagnosed from the
    # response instead of by re-running the clip by hand.
    overall_values, overall_indices = torch.topk(probabilities, TOP_K)
    top_overall = [
        {
            "modelLabel": model.config.id2label[index],
            "confidence": round(float(value), 4),
            "watched": index in _SUPPORTED_INDEX_SET,
        }
        for value, index in zip(overall_values.tolist(), overall_indices.tolist())
    ]

    audio_seconds = round(float(audio.size) / SAMPLE_RATE, 3)

    if not candidates:
        return {
            "eventKey": None,
            "modelLabel": None,
            "confidence": 0.0,
            "candidates": [],
            "topOverall": top_overall,
            "audioSeconds": audio_seconds,
            "timings": timings,
        }

    best = candidates[0]
    log.info(
        "predicted %s (%.4f) in %.0fms over %.2fs of audio",
        best["modelLabel"],
        best["confidence"],
        sum(timings.values()),
        audio_seconds,
    )
    return {
        "eventKey": best["eventKey"],
        "modelLabel": best["modelLabel"],
        "confidence": best["confidence"],
        "candidates": candidates,
        "topOverall": top_overall,
        "audioSeconds": audio_seconds,
        "timings": timings,
    }


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "success": True,
        "data": {
            "service": "x-audio-model",
            "device": DEVICE,
            "model": MODEL_NAME,
            "watchedLabels": len(SUPPORTED_RESOLVED),
            "missingLabels": MISSING_LABELS,
        },
    }


@app.get("/catalog")
def catalog() -> Dict[str, Any]:
    """The exact label -> eventKey contract, so the server can verify it agrees."""
    available = [{**_entry(label, 0.0), "available": True} for label in SUPPORTED_RESOLVED]
    missing = [{**_entry(label, 0.0), "available": False} for label in MISSING_LABELS]
    return {"success": True, "data": available + missing}


@app.post("/predict")
async def predict(file: UploadFile = File(...)) -> Dict[str, Any]:
    suffix = Path(file.filename or "audio.wav").suffix or ".wav"
    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail={"stage": "upload", "message": "uploaded file is empty"})

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(payload)
        temp_path = tmp.name
    try:
        return predict_file(temp_path)
    finally:
        try:
            os.remove(temp_path)
        except OSError:
            pass


if __name__ == "__main__":
    import socket
    import sys

    import uvicorn

    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8020"))

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(1.0)
        if probe.connect_ex((host, port)) == 0:
            log.error(
                "port %s is already in use on %s - another copy of this service is probably "
                "still running. Stop it (netstat -ano | findstr :%s, then taskkill /PID <pid> /F) "
                "or start this one on a free port with PORT=<port>.",
                port,
                host,
                port,
            )
            sys.exit(1)

    uvicorn.run(app, host=host, port=port)
