# AI 工作台本机语音接入

日期：2026-09-23。第一期交互为“录音 → 可编辑文字 → 用户提交”和“点击已生成的助手答复 → 朗读/停止”。语音录入不自动触发业务动作，朗读不修改助手任务、音乐队列或提醒状态。

## 上游组件及固定版本

| 能力 | 组件 | 本机固定内容 |
| --- | --- | --- |
| 语音转文字 | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) 官方 CLI，通过 Homebrew 安装并 `brew pin` 固定的 Apple Silicon `1.9.2` | `/opt/homebrew/bin/whisper-cli`；优先于已有 x86 程序 |
| 识别权重 | [ggerganov/whisper.cpp](https://huggingface.co/ggerganov/whisper.cpp) 多语言 `ggml-small-q5_1.bin` | revision `5359861c739e955e79d9a303bcbc70fb988958b1`；190,085,487 字节；SHA256 `ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb`；位于 `local-ai/.local/whisper/` |
| 语音合成 | [mlx-speech](https://pypi.org/project/mlx-speech/0.5.2/) 的正式公开 `StepAudioEditXModel.from_dir()` / `clone()` | `mlx-speech==0.5.2`；Python `3.13.13` ARM；全部传递依赖见 `local-ai/voice-runtime/uv.lock`，独立环境位于 `local-ai/.local/stepaudio-runtime/.venv` |
| 合成权重 | [社区 Step-Audio-EditX MLX 8bit](https://huggingface.co/appautomaton/step-audio-editx-8bit-mlx) | revision `3890eb13396c8bb791ff982987e9d3bbdecfab25`；全部 21 个文件上游哈希匹配，放于 LM Studio 模型目录；运行时由 `mlx-speech` 本地加载 |
| 默认音色 | 阶跃官方 Step-Audio-EditX 仓库中文示例 `examples/whisper_prompt.wav` | revision `a652e87052c109e26f616d60971376ff47a829d4`；SHA256、准确对应文字和许可证记录于 `local-ai/voice-runtime/reference.json`；位于 `local-ai/.local/stepaudio-runtime/reference/` |

`mlx-speech` 许可为 MIT，社区权重模型卡声明 Apache-2.0。模型需要参考音频和对应文字；没有内置默认音色。已按用户选择使用上游公开中文示例，不读取或克隆用户录音。通用 `tts.load(...).generate()` 对此模型不透传部分控制参数且丢弃停止原因，故只调用公开模型级 API。运行前逐文件核对权重哈希与参考样本；关闭 Hugging Face 在线访问，不使用模型 alias 自动下载、全局插件或云端模型。

## 项目调用路径

语音输入复用 `js/voice-input.js`：在 `assistant.html` 挂载，最多录 29 秒，浏览器转为 16 kHz 单声道 PCM16 WAV。`js/local-ai-client.js` 通过原有鉴权 `/v1/speech/transcribe` 提交；`gateway.mjs` 和 `admission.mjs` 检查开关、预算、超时并记录实际 Whisper 模型名。`speech-provider.mjs` 使用固定 CLI 参数及受控临时目录，取消后杀死进程并删除音频。返回的文字仅填入可编辑输入框，用户确认后才进入现有 `AssistantEngine.submit()`。

回答朗读只选 `AssistantEngine` 已落账的 `messages[].content`。`js/assistant-voice-background.js` 按当前任务 ID、版本、助手消息 ID、正文哈希和页面来源核对每一段；只能读真实答复中的连续片段。前端每段最多 200 字，整条超过 2000 字明确提示。`local-ai-client.js` 固定调用 `/v1/speech/synthesize`；浏览器不能指定 Python 命令、权重路径、参考音频或 Provider 地址。`speech.synthesize` 是独立场景，沿用总开关、专属 `speechSynthesisEnabled`、场景禁用、每日预算、冷却、90 秒以内的控制策略超时、取消与策略版本校验。新场景对旧策略默认关闭；本机此次按用户授权启用，其他策略字段保持不变。

`speech-synthesis-provider.mjs` 以固定参数启动 `voice-runtime/synthesize.py`，该脚本只调用 SDK 公共 API，输出 24 kHz 单声道 PCM16 WAV。达到生成 token 上限而未正常停止时拒绝返回；音频最多 45 秒。模型非流式，无 SDK 取消回调，故取消、超时会终止独立进程。音频结果只在有期限的 HTTP job 中短暂存在；后台绑定仅保存最多 32 条、5 分钟内有效的回执索引和取消墓碑，不保存正文或音频。成功取回后立即释放服务端音频 job。页面播放使用独立 `Audio` 和 `Blob` URL，不占用 Offscreen 音乐通道；停止、任务变化、关闭页面或浮层时撤销 URL，并阻止迟到结果继续播放。

浮层 iframe 已声明麦克风允许来源；宿主页的 `Permissions-Policy` 仍可能拒绝麦克风。顶层扩展工作台和网页浮层要分别验收，权限拒绝时保留文字输入。数字静音在浏览器编码阶段和后端校验阶段直接报“没有录到声音”，不会再进入最长 90 秒的 Whisper 推理。

语音输入失败在按钮下方显示完整的高对比度错误提示和浏览器错误名/简短原文。`NotAllowedError` 会提示检查 Chrome/系统授权；若页面权限策略明确禁用麦克风，则提示改用扩展独立工作台。下一次录音开始时清除旧错误。原始浏览器错误只能说明本次权限请求被拒绝，不能单凭该错误断定是 Chrome、macOS 还是宿主页导致。

录音按钮先读取本机控制状态，再请求浏览器麦克风。等待麦克风时明确显示尚未开始录音，并提供独立扩展页面入口，供浮层权限受阻时使用；控制状态 10 秒无回执、麦克风授权或设备启动 30 秒无结果时恢复按钮并显示对应原因。超时后才到达的媒体流立即停止，不提交转写。此处的超时只结束工作台等待，浏览器权限弹窗需由用户自行处理。

## 环境与验证

在项目根目录执行 `cd local-ai && npm ci` 安装 Node 锁定依赖。语音 Python 环境由 `local-ai/voice-runtime/pyproject.toml` 与 `uv.lock` 固定，项目本机路径为 `local-ai/.local/stepaudio-runtime/.venv/bin/python`；在 `local-ai/voice-runtime` 下以 `UV_PROJECT_ENVIRONMENT=../.local/stepaudio-runtime/.venv uv sync --locked --python ../.local/stepaudio-runtime/bin/python3.13 --no-dev` 复原。权重和参考样本另按上表固定 revision/SHA 下载至 `.local` 与 LM Studio 模型目录。代码更新后运行 `./local-ai/service.sh restart` 并重载扩展；控制台会分别显示语音输入及回答朗读是否就绪。

验证层级须分开理解：

- **静态与业务替身**：本次语音及受影响助手路径的 127 项回归全部通过。覆盖公开 API 调用路径、输入输出校验、预算、超时、真实子进程取消、任务版本、来源绑定、迟到音频、临时文件清理；16 个 JS/MJS 文件和 Python 工作脚本语法、离线 `uv.lock` 校验及 `git diff --check` 通过。
- **真实本机模型**：经项目鉴权网关，短中文合成约 12 秒，生成 3.36 秒/24 kHz WAV；多语言 Whisper small-q5_1 对公开 7 秒样本约 15–17 秒，能识别主要中文内容但有少数字词错误。合成音频的再次转写与目标句基本一致。性能只代表这两次短样本；未测峰值内存、并发和长回答。
- **HTTP 预览**：隔离页面以替身 Chrome 状态完成“朗读 → 音频播放 → 完成”、停止及 390px 布局检查，浏览器控制台无错误或警告。它不代表真实扩展。
- **真实扩展**：在独立 Chromium 配置加载当前未打包扩展；隔离测试任务的真实助手消息通过后台和常驻网关完成朗读，页面显示“朗读完成”。第二次合成中点击停止，网关记录为 `cancelled` 且无待处理 job。未对真实账号、音乐队列或提醒执行操作。
- **麦克风边界**：真实 Chromium 的虚拟麦克风测试录到 7.2 秒全零数据；修复后页面立即提示静音、不向模型提交。已重启的常驻服务也拒绝了规范静音 WAV，AI 请求预算未增加。换用原始 48 kHz 示例后隔离 Chromium 仍返回全零，可确定这是本次虚拟音源没有提供声音，不能据此评价实体麦克风。规范公开 WAV 已经通过受控 Whisper 入口；真实麦克风、网页浮层的权限策略和用户本人语音质量仍待实体环境验收。

本次模型生成没有绕开本机网关。LM Studio 仍负责助手文字推理；StepAudio 音频流水线由独立 SDK 执行。LM Studio 文字模型在本次扩展验收时显示未加载，因此验收消息是隔离配置内固定的测试答复；不把它称为真实 Qwen 对话验收。

2026-09-24 补充：针对“正在检查语音输入”长时间不变，核对到该状态同时覆盖控制面读取和 `getUserMedia()` 等待，麦克风未成功返回前不会录音。当前沙箱外的常驻入口 `/v1/control` 返回 200，`speech.transcribe` 已启用且 Whisper 已配置；沙箱内 `service.sh status` 的“未就绪”是本机端口访问限制导致的误报，没有重启服务。等待态与独立页面入口已在隔离 HTTP 预览中检查，20 项语音相关测试通过；真实 Chrome 麦克风授权、实体声音与浮层权限仍需在用户浏览器中验收。

## 工作台逐步转写（2026-09-24）

工作台使用 `js/voice-live.js` 和 `js/voice-capture-worklet.js` 从浏览器已授权的 `MediaStream` 采集 PCM；约 3 秒后开始预览，之后约每 2.3 秒以截至当前的整段音频重新识别并修正可编辑输入框。约 1.7 秒安静后自动停止，最长 29 秒；按钮仍可手动提前完成或取消。停止后以整段音频做最终转写，预览文字不是执行事实，不能自动提交助手任务。用户编辑输入时取消录音，迟到回执受任务版本约束。每个预览和最终识别都复用现有 `/v1/speech/transcribe`、WhisperProvider、Gateway 控制开关/预算/取消/超时和临时文件清理；预览调用会消耗每日请求次数，最多约十余次加一次最终识别。

上游核查：本机固定 whisper.cpp `1.9.2` 的官方 `whisper-cli` 已支持现有受控文件识别；[官方 `whisper-stream`](https://github.com/ggml-org/whisper.cpp/blob/master/examples/stream/README.md) 直接从 SDL 麦克风采集，不接收扩展已有的浏览器音频流，也不经过本项目鉴权与预算。故浏览器端仅自有采样、停顿判断和回填适配；识别仍由上游 CLI 执行，没有新增模型引擎或依赖。公开合成中文样本 1.8 秒和 3.36 秒在本机直调 CLI 分别约 0.32 秒、0.54 秒；这是当前机器和样本的测量，实际用户录音受麦克风权限、噪声及网关排队影响。

验证：Worklet 分块、逐步文字、停顿结束、取消、最终修正及不自动提交的替身测试通过；隔离 HTTP 浏览器用合成音源跑通真实 AudioWorklet → 逐步回填 → 停顿自动结束 → 最终文字。此预览没有读取实体麦克风，也没有调用真实 Whisper 或业务动作。真实 Chrome 扩展中的麦克风授权和实体声音仍需单独验收。

## 取消按钮与简体转写（2026-09-24）

启动录音时短暂出现的红字是“取消等待”按钮：原样式把所有取消按钮标为危险色，进入录音后又改成“取消录音”。现改成固定的中性“取消”，避免启动阶段的红字和文字跳动；真正的错误仍显示在独立的高对比度错误区。

Whisper 的 `-l zh` 指定中文识别语言，不指定简繁字形。`local-ai/speech-provider.mjs` 在读取上游 `whisper-cli 1.9.2` 的输出后调用 OpenCC 推荐的纯 JS 包 [`opencc-js@1.4.2`](https://github.com/nk2028/opencc-js) 公共 `Converter({ from: 'tw', to: 'cn' })` API，再交还现有 Gateway；预览和最终识别都会得到简体，用户手写文字及其他 AI 回答不经过此转换。版本和完整性固定在 `local-ai/package-lock.json`，包许可证为 MIT AND Apache-2.0，无传递依赖。自有代码只负责调用转换器和前后各 500 字校验，没有复制词典或自写字符映射。转换是字词规范化，不负责修正 Whisper 本身的识别错误。

## 朗读等待与页面隐藏（2026-09-24）

截图中的“停止合成”说明朗读请求已进入本机合成，音频尚未返回。当前受控服务已就绪，StepAudio 场景已启用；最近两条朗读执行记录分别在约 12.7 秒、14.9 秒时取消。对截图所示约 30 字回答经同一常驻网关做一次真实合成，31 秒返回 5.64 秒、24 kHz WAV，随后释放临时任务。这证明本机模型能生成该句音频，不能证明用户原页面的播放已成功。

答复旁现在直接显示“正在本机合成…完成后自动播放；可能需要数十秒”，并在播放、完成、停止或失败时更新原位提示；错误同时标红，避免只在页面输入区显示。切换窗口或标签导致页面暂时隐藏时，保留用户主动发起的朗读；明确停止、任务变化、关闭页面或浮层仍沿原有取消路径释放本机任务和音频。没有更改 StepAudio SDK、模型、预算、服务端鉴权或任务回执绑定。

验证：语音前后台及 HTTP 端点测试 33/33，通过隔离监听验证鉴权、取消和音频过期；助手与语音输入相关测试 67/67；修改过的 JavaScript 语法检查及 `git diff --check` 通过。隔离 Playwright 页面可看到原位合成提示和播放状态，音频为静音替身；本机真实模型生成由受控网关单独验证。尚未在用户当前 Chrome 扩展页面核验扬声器实际播放，更新代码后需重载扩展。
