"""Pinned Laya checkpoint layout and integrity checks; inference stays in laya."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MANIFEST = json.loads((ROOT / "model-manifest.json").read_text(encoding="utf-8"))
REGISTRY = json.loads((ROOT.parent / "model-registry.json").read_text(encoding="utf-8"))
storage = Path(REGISTRY["storageRoot"]).expanduser()
directory = Path(MANIFEST["directory"])
if not storage.is_absolute() or directory.is_absolute() or ".." in directory.parts:
    raise ValueError("模型存储路径无效")
STORAGE_ROOT = storage.resolve()
MODEL_ROOT = STORAGE_ROOT / directory.parent
CHECKPOINT = STORAGE_ROOT / directory


def verify() -> dict:
    if not CHECKPOINT.is_dir():
        raise FileNotFoundError(f"Laya 权重目录不存在：{CHECKPOINT}")
    total = 0
    for entry in MANIFEST["files"]:
        path = CHECKPOINT / entry["file"]
        if not path.is_file() or path.is_symlink():
            raise FileNotFoundError(f"Laya 权重文件缺失或是符号链接：{entry['file']}")
        size = path.stat().st_size
        if size != entry["bytes"]:
            raise ValueError(f"Laya 权重文件大小不匹配：{entry['file']}")
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != entry["sha256"]:
            raise ValueError(f"Laya 权重 SHA-256 不匹配：{entry['file']}")
        total += size
    return {"model": MANIFEST["id"], "revision": MANIFEST["revision"],
            "path": str(CHECKPOINT), "files": len(MANIFEST["files"]), "bytes": total}


if __name__ == "__main__":
    print(json.dumps(verify(), ensure_ascii=False))
