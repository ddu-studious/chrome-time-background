# 本机模型与 Laya 管理手册

本手册记录 2026-09-24 已核对的机器和模型状态。统一**存储位置**为 `/Users/liuqingwen/.lmstudio/models/`，但推理服务各自负责加载自己的格式。LM Studio 只管理它支持的 LLM；StepAudio 由 `mlx-speech` 运行，Laya 由官方 `laya` 包运行。把权重放进 LM Studio 文件夹，并不等于 LM Studio 能运行该模型。模型清单见 `local-ai/model-registry.json`，可随时在项目根目录执行：

```bash
./local-ai/models.sh list
```

当前清单包括 LM Studio 管理的 Qwen3.8 27B、Gemma 4 26B-A4B、社区 Qwen3.8 4B 蒸馏版；语音运行时管理的 StepAudio；以及本手册管理的 Laya 多语言版。`list` 实时扫描目录并列出尺寸，也会提示尚未登记的新目录。它不下载、加载或删除模型。LM Studio 的准确运行实例仍以它的 Developer 页面或 `/api/v1/models` 为准；`list` 只反映磁盘文件。

总目录只在 `local-ai/model-registry.json` 的 `storageRoot` 指定，管理脚本和 Laya 下载、加载、校验都读取它。若以后迁移磁盘，先停止相应服务并在 LM Studio 设置中完成其自身目录迁移，再整体移动非 LM Studio 模型目录，最后修改 `storageRoot`、执行 `list/verify/start/test`；仅改清单而不移动文件会使校验明确失败。

## Laya 的安装身份与目录

| 项目 | 固定值与责任方 |
| --- | --- |
| 推理包 | [PyPI Laya](https://pypi.org/project/laya/) `laya[serve]==0.3.11`；所有 Python 依赖固定在 `local-ai/laya-runtime/uv.lock` |
| 检查点 | [Hugging Face Laya](https://huggingface.co/convaiinnovations/laya) revision `aa8c91ca088ec597df95a0d1c76b3063cb2ae5e8`，只取 `multilingual/` |
| 权重 | `~/.lmstudio/models/convaiinnovations/laya/multilingual/`，5 个文件，共 678,201,636 字节 |
| 权重校验 | `local-ai/laya-runtime/model-manifest.json`；主文件 SHA-256 为 `9d628fd971b700382ac6f65920a86f149777b2e748e0c955fb3b19695aa8f204`，与[官方文件页](https://huggingface.co/convaiinnovations/laya/blob/main/multilingual/model.safetensors)一致 |
| Python 环境 | `local-ai/.local/laya-runtime/.venv/`，只供 Laya 使用 |
| 下载缓存 | `local-ai/.local/model-cache/huggingface/`；这是传输缓存，权重成品以模型目录和 manifest 为准 |
| 服务 | 当前用户的按需 `launchd` 项 `local.chrome-time-background.laya`，仅绑定 `127.0.0.1:19085`，不加入登录自启 |
| 令牌、日志、启动配置 | `local-ai/.local/laya-runtime/`；该目录被 Git 忽略，令牌及日志权限为当前用户可读写 |

主权重来自显式选定的 `hf-mirror.com` 传输路径，因为本机直连 `huggingface.co` 被重置。模型身份和 revision 按 Hugging Face 官方仓库固定，下载完成后五个文件按 manifest 核验；镜像的“下载成功”不等于完整性通过。模型的 Apache-2.0 许可见上游模型卡。后续下载默认尝试官方源，只有明确指定 `--mirror` 才改用镜像，不静默切换。

## 日常命令

以下命令均在仓库根目录执行，或使用脚本的绝对路径。`start` 重用健康的现有服务；代码或锁文件更新后用 `restart`。启动后服务持续运行到 `stop` 或本次用户登录结束，没有登录自动启动。

```bash
./local-ai/models.sh laya status    # launchd 和 HTTP 健康状态
./local-ai/models.sh laya verify    # 离线核对 5 个文件的大小和 SHA-256
./local-ai/models.sh laya test      # 一条合成中文意图判断，不执行提醒
./local-ai/models.sh laya logs      # 最近 40 行标准日志与错误日志
./local-ai/models.sh laya stop      # 停止 Laya，保留权重、环境、令牌、日志
./local-ai/models.sh laya start     # 再次按需启动
./local-ai/models.sh laya restart   # 已修改运行时后重启
```

当前固定用 CPU 做质量基线。若需单独测 Apple GPU，可执行 `LAYA_DEVICE=mps ./local-ai/models.sh laya restart`，然后以 `status` 确认实际设备，重新记录同一批样本的耗时与内存。回到 CPU 执行 `LAYA_DEVICE=cpu ./local-ai/models.sh laya restart`。`start` 对健康服务会直接复用，不会悄悄改变设备。

HTTP 接口为 `POST http://127.0.0.1:19085/v1/systemone`。管理命令使用独立的本机令牌请求测试接口；客户端若要调用，需从 `.local/laya-runtime/token` 读取令牌并发送 `Authorization: Bearer <token>`。`/health` 返回实际已加载检查点；服务进程启用 `HF_HUB_OFFLINE=1`，请求不会触发另一检查点的隐式外部下载。模型输出是判断建议，不能替代工作台的授权、工具合同和真实回执。当前仅接入默认关闭的工具组预加载建议链，未接入业务工具执行；开关与降级见 [技术说明](assistant-laya-prefetch-20260924.md)。

## 恢复安装与复核下载

锁文件和运行脚本在仓库，实际环境和权重不入 Git。换机器、环境损坏或删除 `.venv` 后，用本机 Python 3.12 恢复：

```bash
cd local-ai/laya-runtime
UV_PROJECT_ENVIRONMENT=../.local/laya-runtime/.venv \
UV_CACHE_DIR=../.local/uv-cache \
uv sync --locked --python /Users/liuqingwen/.local/bin/python3.12 --no-dev
cd ../..
./local-ai/models.sh laya verify
```

若权重尚未下载，先看 `model-manifest.json` 的仓库与 revision，再执行 `./local-ai/models.sh laya download`。官方源连接不可用时，手动选择 `./local-ai/models.sh laya download --mirror`。命令只下载该固定 revision 的多语言文件，结束时自动按 manifest 验证。已校验的权重无需重复下载。恢复后运行 `start`、`status`、`test`。

## 新模型加入与清理

以后每增加一个模型，先在 `model-registry.json` 写明**模型身份、运行时归属、目录与用途**。应用模型下载器管理的 LLM 由 LM Studio 更新/卸载；非 LM Studio 能运行的模型也可存放于该总目录，但要有自己的固定版本运行环境、权重 revision、许可与逐文件校验 manifest。不同运行时不得互相覆盖模型文件，避免把同一权重另拷一份到项目目录。模型调用接入工作台时须走现有 Gateway 的开关、预算、取消、超时、日志与权限；先完成只读影子评估，再决定是否改变执行行为。

需要腾出空间时，先用 `list` 确定目录的**实际运行时归属**，停止该模型的服务并核对 `verify/status`。LM Studio 管理的模型在 LM Studio 中处理；Laya 的目录是 `convaiinnovations/laya/`，不是 LM Studio 的卸载对象。当前管理脚本不提供自动删除，以免误清理别的模型或共享缓存。Laya 权重可从固定 revision 重新下载，删除前仍应保留 manifest、uv 锁文件和实验报告。

## 本次验证与尚未覆盖的范围

- 静态：`uv.lock` 固定了 Laya 0.3.11 的全部依赖；Python 脚本语法、管理命令帮助/清单及 manifest 校验通过。
- 真实本机模型：Python 3.12 + 官方 Laya SDK 从上述本地目录加载多语言检查点成功。两条合成中文意图中，“把开会提醒延后十分钟”被选为 `update`，“明天四点提醒我开会”被选为 `disable`；这只是烟雾测试，也展示了错误判断的可能。
- HTTP：本机 `launchd` 服务健康返回 `loaded: ["multilingual"]`、设备 `cpu`；无令牌请求返回 401，带令牌的合成请求返回 200，请求其他检查点明确返回 422；停止、再次启动、重复启动复用及已下载权重的再次校验均已实测。
- 资源：CPU 常驻进程在这次验收后的 RSS 约 759 MiB。M3 Max 的 MPS 路径也成功加载相同权重，对同一条合成输入连续五次均选 `update`；HTTP 端到端耗时为首次 9352 ms、随后 125/40/43/40 ms。此数字只对应短输入和单一检查点，不能推为稳定吞吐或中文业务质量；验收后已恢复 CPU 服务。
- 浏览器扩展、真实账号、提醒写入及 AI 工作台模型对照均未在本次执行。公开 T4、M4 或作者 demo 的性能数字不能当本机 M3 Max 的质量或吞吐量结论。
