# spec-gen embedding server
# CPU-only, x86_64 (Intel iMac 2017+)
# Model: all-MiniLM-L6-v2 (384 dims, ~22 MB, fast on CPU)

FROM --platform=linux/amd64 python:3.11-slim

# System deps (BLAS for faster CPU matrix ops)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libopenblas-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps — pin versions for reproducibility
RUN pip install --no-cache-dir \
    fastapi==0.115.6 \
    uvicorn[standard]==0.32.1 \
    sentence-transformers==3.3.1 \
    torch==2.5.1+cpu \
    --extra-index-url https://download.pytorch.org/whl/cpu

# Copy server code
COPY server.py .

# Pre-download the model into the image so the container starts instantly
# (no network access needed at runtime)
ARG MODEL_NAME=all-MiniLM-L6-v2
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('${MODEL_NAME}')"

ENV MODEL_NAME=${MODEL_NAME}
ENV PORT=8765

EXPOSE 8765

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8765/health')"

CMD ["python", "server.py"]
