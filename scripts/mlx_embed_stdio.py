#!/usr/bin/env python3
"""Stdio bridge for local MLX text embeddings.

Reads one JSON request per line from stdin:
  {"texts":["..."],"dimensions":1536}

Writes one JSON response per line to stdout:
  {"embeddings":[[...], ...]}
"""

from __future__ import annotations

import json
import os
import sys
from typing import Any

import mlx.core as mx
from mlx_embeddings import generate, load


MODEL_ID = os.environ.get("GBRAIN_MLX_EMBED_MODEL", "mlx-community/Qwen3-Embedding-4B-mxfp8")


def _normalize_to_dimensions(embeddings: mx.array, dimensions: int) -> mx.array:
    if dimensions <= 0:
        raise ValueError("dimensions must be positive")
    if embeddings.shape[1] < dimensions:
        raise ValueError(
            f"model returned {embeddings.shape[1]} dimensions; cannot expand to {dimensions}"
        )
    trimmed = embeddings[:, :dimensions]
    norms = mx.linalg.norm(trimmed, axis=1, keepdims=True)
    return trimmed / norms


def _write(payload: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def main() -> int:
    print(f"loading {MODEL_ID}", file=sys.stderr, flush=True)
    model, processor = load(MODEL_ID)
    print(f"ready {MODEL_ID}", file=sys.stderr, flush=True)

    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            texts = request["texts"]
            dimensions = int(request.get("dimensions", 1536))
            if not isinstance(texts, list) or not all(isinstance(text, str) for text in texts):
                raise ValueError("texts must be a list of strings")
            output = generate(model, processor, texts=texts)
            embeddings = _normalize_to_dimensions(output.text_embeds, dimensions)
            _write({"embeddings": embeddings.tolist()})
        except Exception as exc:  # noqa: BLE001 - return structured error to TypeScript caller.
            _write({"error": str(exc)})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
