"""Compose Laya's public model, router, and HTTP APIs around one pinned checkpoint."""
from __future__ import annotations

import os

# A request may only use the preverified local checkpoint; no implicit Hub loads.
os.environ["HF_HUB_OFFLINE"] = "1"

import laya  # noqa: E402
import uvicorn  # noqa: E402
from laya import Router  # noqa: E402
from laya.serve import create_app  # noqa: E402

from model_store import MANIFEST, CHECKPOINT, verify  # noqa: E402


class PinnedMultilingualRouter(Router):
    """Keep the public Laya router on the one checked local checkpoint."""

    def predict(self, state, questions, model=None, **kwargs):
        if model not in (None, "multilingual"):
            raise ValueError("本机 Laya 服务仅加载已校验的 multilingual 检查点")
        return super().predict(state, questions, model="multilingual", **kwargs)


def main() -> None:
    if laya.__version__ != "0.3.11":
        raise RuntimeError("Laya 版本与锁文件不一致")
    if len(os.environ.get("LAYA_API_KEY", "")) < 32:
        raise RuntimeError("Laya 本机服务令牌未配置")
    if os.environ.get("LAYA_DEVICE", "cpu") not in {"cpu", "mps"}:
        raise RuntimeError("Laya 本机服务只允许 cpu 或 mps")
    verified = verify()
    device = os.environ.get("LAYA_DEVICE", "cpu")
    agent = laya.load(str(CHECKPOINT), device=device)
    router = PinnedMultilingualRouter(models={"multilingual": str(CHECKPOINT)}, device=device,
                                      max_loaded=1, default="multilingual", preload=False)
    router.attach("multilingual", agent)
    print(f"已验证并加载 {MANIFEST['id']} {verified['revision']} ({device})", flush=True)
    uvicorn.run(create_app(router), host="127.0.0.1", port=19085, log_level="warning")


if __name__ == "__main__":
    main()
