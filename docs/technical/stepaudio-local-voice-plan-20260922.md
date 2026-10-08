# StepAudio 本机下载与语音接入方案

> 这份文档记录 2026-09-22 的下载和实施前分析。已实现内容与 2026-09-23 的分层验证见 [AI 工作台本机语音接入](assistant-voice-stepaudio-20260923.md)。

日期：2026-09-22。范围：下载适合 Apple Silicon 的 StepAudio 权重、核验已发布运行库、只读分析项目接入方式。本次不修改业务实现，不启动模型推理或真实麦克风录音。

## 选型与下载

选择 `appautomaton/step-audio-editx-8bit-mlx`：基于阶跃 Step-Audio-EditX 的社区 Apple Silicon 转换版，主语言模型采用 int8，部分音频组件采用 bf16。它负责语音生成和编辑，不替代助手的文字推理模型或 Whisper 语音识别。

| 项目 | 核验结果 |
| --- | --- |
| 权重来源 | [Hugging Face 模型仓库](https://huggingface.co/appautomaton/step-audio-editx-8bit-mlx) |
| 固定 revision | `3890eb13396c8bb791ff982987e9d3bbdecfab25` |
| 完整仓库 | 21 个文件，共 4,438,160,700 字节，约 4.44 GB / 4.13 GiB |
| 运行所需内容 | 19 个组件文件，另有 README 与 Git 属性文件 |
| 存放位置 | `/Users/liuqingwen/.lmstudio/models/appautomaton/step-audio-editx-8bit-mlx` |
| 权重许可 | 模型卡声明 Apache-2.0；属于社区转换，不能表述为阶跃官方 MLX 发行版 |
| 下载方式 | 先使用 LM Studio 官方 `lms get`；其下载超时后，从同一来源的固定 revision 补齐，并比对上游大小与哈希 |
| 完成凭据 | **已完成**；21 个文件的大小及上游 LFS SHA256 / Git blob SHA1 全部匹配，本机 SHA256 清单见 `local-ai/.local/stepaudio-download/verification.json` |

LM Studio 当前版本为 `0.4.23+1`。下载器接受了该仓库，但下载能力与推理支持需要分开判断：权重声明 `model_type=step1`，当前安装的 MLX 引擎 `app-mlx-generate-mac14-arm64@34` 未包含 `mlx_lm.models.step1`，也没有该类型的重映射；其公开模型加载路径对缺少架构实现会报“不支持”。另外，生成声音还需要 VQ、flow、HiFT 等音频流水线。因此不能把“放在 LM Studio 模型目录”称为“LM Studio 已能语音聊天”。本次未点击加载模型来影响现有文字模型。

下载后尝试 `lms ls --json` 读取列表时，LM Studio daemon 连接超时。因此本次确认的是磁盘文件与上游哈希，未确认 LM Studio 界面列表已刷新，也未重启应用。

阶跃[官方 EditX 实现](https://github.com/stepfun-ai/Step-Audio-EditX)要求 CUDA；Mac 接入采用社区独立 runtime，而非移植官方 CUDA 执行器。内存是否足够并发、中文音质和生成延迟仍需通过受控入口实测。

## 优先复用的运行库

已经下载并静态检查 [PyPI `mlx-speech==0.5.2`](https://pypi.org/project/mlx-speech/0.5.2/) wheel，保存在 `local-ai/.local/stepaudio-download/mlx_speech-0.5.2-py3-none-any.whl`，未安装到项目或系统 Python 环境。

- Python 要求 `>=3.13`，库许可 MIT。声明依赖包括 `mlx>=0.31.1`、NumPy、safetensors、soundfile、tokenizers、huggingface-hub。实施时应建立独立环境，把全部传递依赖精确锁定，不能只固定顶层包。
- wheel SHA256：`0d267bc891953fcb67b0d5bea7a85bd4459195be60f5770918fd5d95e7215590`，已与 PyPI 发布元数据比对一致。
- 正式导出：`from mlx_speech.generation import StepAudioEditXModel`。`generation.__all__` 明确列出该类；自有代码只做受控调用、输入输出校验和进程管理，不复制模型实现。
- 使用 `StepAudioEditXModel.from_dir(固定绝对路径)`，已检查的调用路径只加载本地组件。不要使用自动下载模型的 alias；执行环境另外启用离线设置，运行前检查完整文件和锁定的 revision。
- `clone()` 接收参考音频、其准确文字和目标文字；支持 `max_new_tokens`、`temperature`、`seed`、`flow_steps`。返回波形、采样率、停止原因及运行指标。

上游[模型 API 文档](https://github.com/appautomaton/mlx-speech/blob/main/docs/step-audio-editx.md)和发布 wheel 的实现一致，主要限制如下：

1. **需要参考音频与对应文字**，没有内置默认音色。产品首版需要明确选择一段有使用权限的音色样本，不能偷偷读取用户录音或克隆他人声音。
2. **非流式生成，没有取消回调或超时参数**。采用受控子进程，取消时真实终止进程，不能仅让前端停止等待。
3. 达到 token 上限后仍可能返回一段音频。必须检查 `stop_reached` 和 `stop_reason`，不能把截断音频当完整播报成功。
4. 实际 HiFT 配置输出 24 kHz 单声道；原始返回波形为 NumPy float32。适配层需限制长度、样本值、编码格式和输出字节。
5. 通用 `tts.load(...).generate()` 的 StepAudio 适配器不透传 `seed/temperature/flow_steps`，且丢弃停止原因。因此选正式导出的模型级 API，不依赖这些被忽略的通用参数。
6. 上游 `rtf` 用“音频秒数 / 耗时秒数”计算；项目应明确显示生成耗时、音频时长及定义，不能与常见的反向 RTF 混用。

## 项目当前实际能力

| 环节 | 当前实现 | 接入判断 |
| --- | --- | --- |
| 录音和编码 | `js/voice-input.js` | 已有约 29 秒录音、16 kHz 单声道 PCM16 WAV、取消和输入框回填；复用 |
| 语音识别 | `js/local-ai-client.js` → `/v1/speech/transcribe` → `local-ai/gateway.mjs` → `speech-provider.mjs` | 已调用本地 whisper-cli，经过场景开关与准入统计；复用 |
| 新助手输入 | `assistant.html`、`js/assistant.js` | 尚未加载或挂载 VoiceInput；旧音乐助手已使用 |
| 助手输出 | `js/assistant-engine.js`、`js/assistant-timeline.js` | 消息带 ID/turnId；使用已保存的答复作为朗读原文 |
| 现有朗读 | `js/main.js` 的诗词电台 | 使用浏览器 SpeechSynthesis，尚未接到助手或本机模型网关 |
| 音频播放 | `js/offscreen.js`、`js/background.js` | 已有唯一 Offscreen 文档、音乐和提醒通道；需要新增独立语音通道时复用该文档 |

## 建议的一期交互与调用路径

先做“点击录音 → 转写可编辑 → 提交现有助手 → 点击朗读/停止”。自动朗读默认关闭，暂不做唤醒词、持续监听、VAD、全双工和边听边说。

```text
用户录音 → 已有 Whisper → 输入框 → 现有助手 Engine / Qwen / 业务工具
                                      ↓
                              已落账的助手文字答复
                                      ↓ 点击朗读
                    鉴权 API → speech.synthesize → admission / job
                                      ↓
                  独立受控子进程 → mlx-speech 0.5.2 → EditX 本地权重
                                      ↓
                        有期限的音频结果 → 独立播放通道
```

新增 `speech.synthesize` 场景及薄 Provider，纳入现有 `server.mjs`、`gateway.mjs`、`control-store.mjs`、`admission.mjs` 的控制边界。语音模型有独立身份与配置，不覆盖文字模型的 `policy.model`。浏览器不能传入任意 Python 命令、文件路径、下载地址或 Provider URL。

实施中必须保留：

- 总开关、场景开关、每日预算、失败冷却、超时、取消、策略版本与迟到结果丢弃；新场景默认关闭。
- 语音请求绑定消息 ID 和任务版本。朗读只消费真实答复，合成失败不重做提醒、音乐或其他业务动作，也不改变已完成的业务回执。
- 超时后终止子进程，取消后停止播放；失败、取消、过期均清理临时音频。音频和本机临时路径不进入任务快照、个人记忆或默认历史正文。
- 记录模型 ID/revision、runtime、耗时、音频秒数、结果及失败原因，区分语音 token 与文字 token。
- 若扩展页需后台朗读，在已有 Offscreen 文档增设独立语音元素和消息类型。不能调用现有 `offscreen_play`，否则会改音乐播放器和队列 revision。
- 不在 EditX 失败时静默切换云端或系统声音；如果保留系统朗读，必须作为用户可见、明确选择的独立后端。

现有链路仍有需一起处理的缺口：Whisper Provider 写死 90 秒超时，未使用控制策略的 timeoutMs；ASR 日志没有完整真实模型身份；admission 尚无跨 Provider 全局内存/并发调度。新 TTS 接入不能声称这些已有。建议首版合成串行执行，并实测与 Qwen 同时驻留时的内存压力，再确定模型卸载和闲置回收策略。

新助手网页浮层的 iframe 当前没有 microphone allow，能否录音还受宿主页 Permissions-Policy 约束。先验证顶层扩展工作台，浮层另做真实 Chrome 验收。

## 验证边界与实施顺序

本次已完成完整模型下载和逐文件校验、版本/公开 API/许可静态核验、项目调用路径分析，`git diff --check` 及新增文档空白检查通过。没有安装运行库、运行真实 EditX、测试音质/速度、测试真实 Chrome 麦克风，或实现新的业务入口。旧业务未修改，因此不宣称业务回归测试通过。

后续实施顺序：

1. 在独立环境锁定 runtime 和依赖，选定参考音色；新增受控语音 Provider、场景和有限输出合同。
2. 用替身验证开关、预算、超时、取消、进程终止、策略更新、截断输出、清理、迟到结果及业务副作用次数。
3. 通过项目受控入口运行短中文样本，分别记录冷加载/热调用耗时、峰值内存和音质，确认可用后再接助手按钮。
4. 复用 VoiceInput 和助手消息展示；验证朗读失败不会改变业务状态，音乐队列及 revision 保持稳定。
5. 最后进行真实 Chrome 的麦克风、播放、取消、关页与后台恢复验证；不以 HTTP 预览替代扩展验收。

一期预计涉及约 8–12 个源文件触点，另加 runtime 依赖锁文件、部署说明与针对性测试，属于独立的中等规模接入。下载成功只完成模型准备阶段。
