"""Download only the pinned multilingual checkpoint with Hugging Face's public SDK."""
from __future__ import annotations

import json
import os

from huggingface_hub import snapshot_download

from model_store import MANIFEST, MODEL_ROOT, verify


def main() -> None:
    endpoint = os.environ.get("HF_ENDPOINT", "https://huggingface.co")
    print(f"下载来源：{endpoint}；仓库：{MANIFEST['repository']}；revision：{MANIFEST['revision']}", flush=True)
    snapshot_download(
        repo_id=MANIFEST["repository"], revision=MANIFEST["revision"],
        allow_patterns=[f"{MANIFEST['variant']}/*"], local_dir=MODEL_ROOT,
    )
    print(json.dumps(verify(), ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
