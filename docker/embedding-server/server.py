"""
OpenAI-compatible /v1/embeddings server
Uses sentence-transformers on CPU (no GPU required).

Endpoints:
  GET  /health          → {"status": "ok", "model": "...", "dim": N}
  GET  /v1/models       → OpenAI-style model list
  POST /v1/embeddings   → OpenAI-compatible embeddings response

Environment variables:
  MODEL_NAME   sentence-transformers model (default: all-MiniLM-L6-v2)
  PORT         server port (default: 8765)
"""

import os
import time
import logging
from typing import Union

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer
import uvicorn

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

MODEL_NAME = os.getenv("MODEL_NAME", "all-MiniLM-L6-v2")
PORT = int(os.getenv("PORT", "8765"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Model (loaded once at startup)
# ---------------------------------------------------------------------------

log.info(f"Loading model: {MODEL_NAME}")
model = SentenceTransformer(MODEL_NAME)
DIM = model.get_sentence_embedding_dimension()
log.info(f"Model ready — dim={DIM}")

# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------

app = FastAPI(title="spec-gen embedding server", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class EmbeddingRequest(BaseModel):
    input: Union[str, list[str]]
    model: str = MODEL_NAME
    encoding_format: str = "float"


class EmbeddingObject(BaseModel):
    object: str = "embedding"
    index: int
    embedding: list[float]


class EmbeddingResponse(BaseModel):
    object: str = "list"
    model: str
    data: list[EmbeddingObject]
    usage: dict


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL_NAME, "dim": DIM}


@app.get("/v1/models")
def list_models():
    return {
        "object": "list",
        "data": [
            {
                "id": MODEL_NAME,
                "object": "model",
                "created": 0,
                "owned_by": "local",
            }
        ],
    }


@app.post("/v1/embeddings", response_model=EmbeddingResponse)
def create_embeddings(req: EmbeddingRequest):
    texts = req.input if isinstance(req.input, list) else [req.input]

    if not texts:
        raise HTTPException(status_code=400, detail="input must not be empty")
    if len(texts) > 2048:
        raise HTTPException(status_code=400, detail="max 2048 texts per request")

    t0 = time.perf_counter()
    # normalize_embeddings=True → cosine similarity works correctly
    vectors = model.encode(texts, normalize_embeddings=True, convert_to_numpy=True)
    elapsed = time.perf_counter() - t0

    log.info(f"Encoded {len(texts)} texts in {elapsed*1000:.1f}ms (model={req.model})")

    data = [
        EmbeddingObject(index=i, embedding=vec.tolist())
        for i, vec in enumerate(vectors)
    ]

    total_tokens = sum(len(t.split()) for t in texts)

    return EmbeddingResponse(
        model=MODEL_NAME,
        data=data,
        usage={
            "prompt_tokens": total_tokens,
            "total_tokens": total_tokens,
        },
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
