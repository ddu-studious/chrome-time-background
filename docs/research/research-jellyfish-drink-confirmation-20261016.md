---
title: "水母“确认喝了水”调研：自报、空闲时间、摄像头、可穿戴与智能杯"
type: research
status: completed
version: "1.0"
created: "2026-10-16"
updated: "2026-10-16"
author: "AI 助手（调研与本机小实验，无业务实现）"
tags: [水母, 喝水提醒, 摄像头, Vision, TCC, 可穿戴, 智能杯, 调研]
related:
  - docs/technical/jellyfish-pomodoro-water-music-grow-20261015.md
  - docs/technical/alarm-countdown-companion-20261015.md
  - docs/technical/jellyfish-resident-companion-20261016.md
changelog:
  - date: "2026-10-16"
    desc: "初始创建：用户要求调研“怎么确认我已经喝水了”（摄像头等能力都可以）。本机能力探测（Vision 词表 / 手部姿态 / 人脸关键点 / 空闲时间 / 摄像头授权状态）、18 张 CC 授权公开照片的 Vision 小实验、文献与产品调研、macOS 摄像头授权归属（TCC 负责进程）分析、分级建议与需要用户同意后才能做的验证清单。没有打开过摄像头，没有修改任何业务实现。"
---

# 水母“确认喝了水”调研

## 1. 结论先行

1. **能做，但“确认”只能降级成“看到你在喝东西”**。没有任何一种方法能证明杯子里是水：摄像头只能看到杯子靠近嘴，称重只能知道重量变轻，手腕传感器只能知道抬手的动作。所以水母的文案和记录必须区分“你告诉我喝了”和“我看到你举杯了”，不能写成“已确认喝水”，更不能写成喝了多少毫升。
2. **摄像头是现实可行的“更高级”方案**：本机 Apple Vision 框架（系统自带、离线、不新增依赖）就有人脸关键点、手部姿态和 1303 类图像分类（含 `cup`、`mug`、`bottle`、`drinking_glass`、`straw_drinking`、`thermos`）。我用 18 张公开照片做了小实验，“嘴边有杯子”这个信号能被稳定抓到，细节与局限见 §4.3。文献里同类方法的 F1 约 0.84–0.94。
3. **摄像头有一个必须先解决的授权问题**：这个原生宿主是 Chrome 拉起来的子进程。按 macOS 的 TCC 规则，子进程申请摄像头会算在“负责进程”（Chrome）头上。所以不能让现在的宿主直接开摄像头，要做一个**独立的小 App 经 LaunchServices 启动**，让授权弹窗、系统设置里的开关都写着它自己的名字（见 §4.4）。
4. **建议路线**（每一步都能单独停下）：
   - **现在**：气泡上的“喝了”按钮自报（本次随“水母常驻”一起做）。
   - **可选的低成本一步**：用系统空闲时间判断“你刚离开过座位”，回来时问一句“刚才去喝水了吗？”。这只是选对提问时机，仍是自报。
   - **进阶**：摄像头“举杯入镜”识别。**用户主动点开始、只开最多 20 秒**，画面不落盘不外传，只产出一个“看到举杯”的事件。动手前先要你同意做一次真机验证（§7）。
5. **不推荐**：常开摄像头、麦克风听吞咽声、把画面交给本地多模态模型逐帧判断、为这件事买智能杯（除非你想要精确的饮水量）。理由见 §5。

## 2. “确认”到底指什么：证据层级

| 层级 | 含义 | 谁能给 | 能不能写成“确认” |
|---|---|---|---|
| L0 | 你自己说喝了 | 气泡按钮 | 可以，来源标“手动” |
| L1 | 你刚离开过座位（时机线索） | 系统空闲时间 | 不能，只用来决定何时问 |
| L2 | 看到杯子/瓶子贴近你的嘴并持续几帧 | 摄像头 + 本机视觉 | 只能写“看到你举杯” |
| L3 | 杯子重量减少了 | 称重杯垫 / 智能瓶 | 可以写“少了 N 克”，不知道是不是水 |
| L4 | 吞咽了 | 没有消费级可用方案 | 不可能 |

## 3. 方案总览

| 方案 | 能证明什么 | 不能证明什么 | 隐私/权限 | 需要新增 | 对本项目的适配 |
|---|---|---|---|---|---|
| A 自报按钮（现状） | 用户说喝了 | 真假 | 无 | 无 | 已在设计内 |
| B 系统空闲时间 | 刚离开过键鼠 | 去干嘛了 | 无弹窗（实测） | 无 | 极低成本，可选 |
| C 摄像头 + Vision | 杯子贴嘴并持续 | 是不是水、喝了多少 | 摄像头授权 + 绿点 | 独立小 App | 推荐的进阶方案 |
| D 本地多模态模型 | 同 C，可描述画面 | 同 C，且慢 | 同 C | 网关图像通道 | 不推荐连续使用 |
| E 可穿戴（手表/耳机） | 抬手/仰头动作 | 同上；吸管、另一只手会漏 | 手表/耳机 App | watchOS/iOS 程序 | 扩展无路径，不推荐 |
| F 称重杯垫/智能瓶 | 重量变化（最准） | 液体种类 | 蓝牙授权 | 硬件 + 蓝牙程序 | 想要容量时才值得 |
| G 麦克风/HealthKit/雷达 | — | — | — | — | 不推荐 |

## 4. 各方案调研

### 4.1 A 自报（现状）

气泡上两个按钮“喝了 / 10 分钟后”，计数与稍后提醒仍由 Chrome 记账。最可靠的反而是它：用户说喝了就是喝了。缺点只是要点一下。后面所有“自动”方案都应当被看作**减少点击**，而不是取代自报。

### 4.2 B 系统空闲时间

- 本机实测：`CGEventSource.secondsSinceLastEventType(.combinedSessionState, …)` 返回 0.0755 秒，**没有任何授权弹窗**。
- 项目已有规则“不使用 `chrome.idle`”（要新增权限且无法知道人是否坐着），这里说的是原生端读取，两者不矛盾，但**同样不能证明喝水**。
- 可用方式：提醒到点时人不在，就让气泡等人回来再开始计 90 秒；或者提醒后检测到“离开 ≥ 1 分钟再回来”，问一句“刚才去喝水了吗？”。仍是自报，只是少打扰、问得更准。

### 4.3 C 摄像头 + 本机视觉

**文献（同类方法能做到什么）**

| 方法 | 结果 | 来源 |
|---|---|---|
| 深度/RGB 摄像头 + 3D CNN 判断“喝水事件” | 10 折交叉验证 F1 94.3%（RGB）；**对没见过的人**（留一人验证）84.2%（RGB）/ 86.2%（深度） | IEEE，“Contactless Drink Intake Monitoring Using Depth Data” |
| 第一视角摄像头 + YOLOv8 检测容器与手的位置关系 | F1 91.7%，加入干扰动作后降到 86.3%；开始喝的识别延迟约 0.24 秒 | IEEE JBHI 2025，doi:10.1109/jbhi.2025.3548512 |
| 同一团队估算饮水量 | 平均绝对百分比误差 28.5%（10 折）/ 42.4%（留一人） | ScienceDirect，“Estimating Fluid Intake Volume Using a Novel Vision-Based Approach” |
| 浏览器内 Hydrovisor（实践博客） | 杯/瓶检测 + MediaPipe FaceMesh 嘴部关键点 + 重叠度 + 时间平滑，约 5 帧/秒，全程本机 | Roboflow 博客 |

读法：**检测“喝水动作”可达 0.84–0.94，估容量不可靠（误差 28%–42%）**。视觉只看到“容器碰到嘴”，看不到吞咽，也看不出里面是什么。

**本机能力探测（没有打开摄像头）**

- 系统：macOS 26.5；构建用的是 Command Line Tools SDK 13.3、Swift 5.8.1（只能用经典 `VN*` API，不能用 macOS 15 之后的新 Swift Vision API，这没有影响）。
- 硬件：内置“FaceTime高清相机”。当前终端进程的摄像头授权状态是 `notDetermined`（没问过）。
- `VNClassifyImageRequest`：词表 1303 项（revision 2），与“喝”相关的有 `cup`、`mug`、`bottle`、`drinking_glass`、`thermos`、`straw_drinking`、`tea_drink`、`coffee`、`juice`、`soda`、`jug`、`wine_bottle`、`drink` 等。
- `VNDetectFaceLandmarksRequest`（revision 1–3）、`VNDetectHumanHandPoseRequest`（revision 1）、`VNDetectHumanBodyPoseRequest`（revision 1）可用。

**小实验：18 张 CC 授权公开照片跑 Vision 流水线**

流水线：人脸关键点取嘴中心 → 手部姿态算“最近的手部关节到嘴”的距离（除以脸宽）→ 对嘴周围 2.4 倍脸宽的方形裁剪做图像分类，取容器类标签的最高置信度。照片来自 Wikimedia Commons（CC BY 2.0 / CC0 / 公有领域），只放在 `/tmp`，未入库。我逐张看过照片核对真值：

- **6 张正例**：杯子或瓶子贴嘴喝水。
- **3 张难负例**：举着杯子但没喝、桌上有咖啡杯。
- **9 张普通负例**：对着笔记本打字（其中 1 张桌上有咖啡杯）。

| 检查项 | 正例 6 | 难负例 3 | 普通负例 9 |
|---|---|---|---|
| 找到人脸 | 6/6 | 0/3（脸被虚化或裁掉） | 4/9 |
| 手到嘴 ≤ 0.15 脸宽 | 5/6 | — | 0/4（找到脸的里最近是 1.76 脸宽） |
| 嘴周围分类出容器 ≥ 0.25 | 5/6 | — | 0/4（置信度 ≤ 0.01） |
| “手到嘴”或“嘴周围有容器”任一满足 | **6/6** | 0/3 | 0/9 |
| 两者同时满足 | 4/6 | 0/3 | 0/9 |

读法与结论：

1. **两个信号互补**：手部姿态在侧脸、手被杯子挡住时失效（1 张正例手距 1.26 脸宽），嘴周围分类在人脸很小或瓶子遮挡时偏弱（一张正例容器分类只有 0.15）。任一信号即可、再加时间平滑，比任何单一信号稳。这与 Hydrovisor 的做法一致。
2. **整帧分类不能当证据**：整张图分类，两张难负例分别给出 `drink` 0.94、`drinking_glass` 0.89，一张桌上有咖啡杯的打字照给出 `cup` 0.73。**必须有“杯子贴着嘴”的空间关系**，否则只要杯子入镜就误报。
3. **耗时**：每帧约 18 毫秒 CPU（40 帧共 0.71 秒 user，含进程启动与模型加载，是上界）。按每秒 3 帧只占一个核的几个百分点，只在 ≤20 秒的窗口内运行，算力不是问题。
4. **这个实验的局限必须说清楚**：只有 18 张库存照片，不是摄像头视角；阈值是看过数据后定的；没有时间维度；难负例都没找到人脸，**没有真正测到“举杯停在脸旁但没喝、摸脸、打电话、吃东西”这几种最容易误报的情况**。所以它是“可行性信号”，不是准确率。真实准确率只能在你的桌面、你的杯子、你的光线下实测。

### 4.4 摄像头的授权归属（决定实现形态）

事实：

- 当前宿主进程的父进程是 Chrome（`ps` 实测：宿主 pid 49672 的 ppid 为 Chrome 主进程）。宿主的 `Info.plist` 没有摄像头用途说明。
- Chrome 156 的 `InfoPlist.strings` 里**有** `NSCameraUsageDescription`（“Once Chrome has access, websites will be able to ask you for access.”）。
- macOS 的 TCC 以“负责进程”为准：不是从 Finder/`open` 启动的子进程，权限申请与已有权限都算在启动它的 App 头上（Qt 的《The Curious Case of the Responsible Process》、VS Code issue #307364 的描述；LLDB 与 Qt Creator 用私有函数 `responsibility_spawnattrs_setdisclaim` 摆脱）。**这一条我没有在本机实测**（实测要打开摄像头），属于有来源的推断。

推论与后果：若让现有宿主直接开摄像头，要么弹窗写着“Google Chrome 想访问摄像头”（用户分不清是水母），要么 Chrome 本来就被允许过（比如开过视频会议）而**静默就能用**，完全没有“水母获得授权”这一步。两种都不可接受。

三种实现形态：

| 形态 | 授权名字 | 评价 |
|---|---|---|
| 宿主直接采集 | Chrome | 不可取 |
| **独立小 App，宿主经 `NSWorkspace.openApplication` 启动，本机套接字或分布式通知通信** | 自己的名字，系统设置里可单独关 | **推荐**。不用私有 API，生命周期独立 |
| 扩展页 `getUserMedia` + MediaPipe（Apache-2.0，官方 SDK） | `chrome-extension://…` 来源 | 要有一个可见的扩展页一直开着；要新增约几十 MB 的 WASM 与模型；与“水母常驻桌面”不契合 |

macOS 在摄像头使用中会在菜单栏显示绿点，无法隐藏，这对“可见、可控”是好事。

### 4.5 D 本地多模态模型

本机 LM Studio 目录里的两个大模型 `Qwen3.8-27B-MLX-4bit`（`Qwen3_5ForConditionalGeneration`）与 `gemma-4-26B-A4B-it-MLX-4bit`（`Gemma4ForConditionalGeneration`）的 `config.json` 都带 `vision_config`，所以**理论上已具备看图能力**（未加载验证）。但是：

- 项目要求模型调用必须走 Gateway，目前没有图像通道，要新增网关场景、预算、日志、隐私开关。
- 27B 模型处理一帧要数秒并占用与规划模型共享的显存，会拖慢 AI 工作台。
- 它也看不出杯里是不是水，只是把 C 的判断换成更贵的版本。
- 唯一合理的位置是“C 触发后抽 1 帧复核”，价值很小。**不建议做。**

### 4.6 E 可穿戴

文献里手腕 IMU 识别喝水手势的效果很好：30 人 561 次喝水，精确率 90.3%、召回 91.0%（ACM，doi:10.1145/3301275.3302315）；MS-TCN 自由生活场景 F1 0.900（EMBC 2022）；前臂 IMU 的“喝水前触发”实时 F1 85%（Sensors 2019）。但：

- 需要在 Apple Watch / iPhone 上写 App 采集并同步，Chrome 扩展和这个桌面宿主没有任何路径拿到手表数据。
- 文献综述指出手表方案在**用吸管、或用没戴手表的那只手**时会漏检。
- AirPods 的头部姿态（`CMHeadphoneMotionManager`）只能看“仰头”，用马克杯喝水往往不仰头。

**不推荐。**

### 4.7 F 称重杯垫 / 智能瓶

这是唯一能给出**饮水量**的方案：开源称重杯垫固件（Arduino Nano 33 BLE + HX711 称重，喝水判定为重量下降超过 15 g、加水超过 30 g，通过蓝牙 GATT 发事件）、Aquavate（±10–15 mL）、WPI 的杯垫（±3 g）、HidrateSpark 的蓝牙协议已有人逆向。但需要买或自制硬件，蓝牙同样受 TCC 的负责进程规则影响，且只能管那一个杯子。**除非你想要精确的饮水量，否则不值得。**

### 4.8 G 其它

- 麦克风听吞咽声：准确率低、隐私成本高。
- HealthKit：macOS 上第三方 App 需要签名授权，Apple Watch 也不会自动识别喝水，只能手动记录。
- 雷达/Wi-Fi 感知：没有消费级可用方案。

## 5. 推荐路线与门槛

| 步骤 | 内容 | 前置条件 | 状态 |
|---|---|---|---|
| 1 | 气泡“喝了 / 10 分钟后”自报，Chrome 记账 | 水母常驻（见 `jellyfish-resident-companion-20261016.md`） | 随本次实现 |
| 2（可选） | 提醒到点人不在则等回来再计时；离开再回来时问“刚才去喝水了吗” | 原生读空闲时间，无弹窗 | 未做，待你决定 |
| 3（进阶） | 摄像头“举杯入镜”，用户点击后开 ≤20 秒，只产出一个事件 | 先做获同意的真机验证（§7）；独立小 App | 未做，待你决定 |
| 4 | 称重杯垫 | 硬件 | 不建议 |

### 摄像头方案的硬约束（若做）

1. 默认关闭；每次由用户点击开始，最多 20 秒，到时间或检测到就关；不做常开、不做后台定时偷看。
2. 画面只在内存里逐帧处理，**不落盘、不外传、不进日志、不进 AI 记忆**；只输出一个事件 `{时间, 置信度档位}`。
3. 不做人脸识别、不比对身份、不保存关键点。
4. 文案只能写“看到你举杯了”。记录区分来源（手动 / 摄像头），统计里不出现毫升。
5. 摄像头失败（未授权、被占用、没有人脸）只提示并保留“喝了”按钮，不影响提醒。
6. 由独立小 App 持有摄像头授权；原宿主不碰摄像头。
7. 判定使用“嘴边有容器”与“手到嘴”任一信号，加时间平滑（如连续 ≥2 帧、窗口内累计 ≥3 帧），并且必须有“贴近嘴”的空间关系，整帧有杯子不算。

## 6. 本调研没有做的事（边界）

- 没有打开过摄像头，没有采集过你的画面；没有弹出过任何授权窗口。
- TCC 归属（§4.4）只是有来源的推断，没有在本机用真实采集验证。
- 实验用的是库存照片，没有测过真实摄像头画面、你的杯子与光线、关键的难误报场景（§4.3 第 4 点）。
- 没有加载本机多模态模型实测看图。
- 没有评估多显示器、长时间运行的占用与发热。
- 没有修改任何业务代码。

## 7. 如果你要继续：获得你同意后才做的真机验证（约 10 分钟）

1. 做一个最小的独立 `.app`（带 `NSCameraUsageDescription`），经 LaunchServices 启动，确认弹窗和系统设置里写的是它自己的名字；同时确认“由 Chrome 拉起的宿主直接开摄像头”到底归谁（用于验证 §4.4 的推断，这一步会短暂打开摄像头）。
2. 抓 30–60 秒你的真实桌面画面，只在内存里跑 §4.3 的流水线并输出分数，不保存任何图像：测喝水、举杯停在脸旁、摸脸、打电话、吃东西、看手机几种情况的误报与漏报。
3. 测 CPU 占用与耗时。
4. 根据结果再决定是否做、阈值怎么定。

## 附录 A：本机能力探测程序

```swift
import Foundation
import Vision
import AVFoundation
import CoreGraphics

let req = VNClassifyImageRequest()
let ids = (try? req.supportedIdentifiers()) ?? []
print("classifier identifiers:", ids.count)
let keys = ["cup","mug","bottle","glass","drink","water","beverage","coffee","tea","straw","thermos","jug","soda","juice"]
print(ids.filter { id in keys.contains(where: { id.lowercased().contains($0) }) }.sorted())
print("hand pose revisions:", VNDetectHumanHandPoseRequest.supportedRevisions.map { $0 })
print("face landmarks revisions:", VNDetectFaceLandmarksRequest.supportedRevisions.map { $0 })
// 只读授权状态，不会弹窗、不会开摄像头
print("camera authorizationStatus:", AVCaptureDevice.authorizationStatus(for: .video).rawValue)
// 空闲时间：不需要授权
print("idle seconds:", CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!))
```

## 附录 B：18 张照片的 Vision 流水线（核心部分）

```swift
// 对每张图：人脸关键点 + 手部姿态 + 嘴周围裁剪分类
let faceReq = VNDetectFaceLandmarksRequest()
let handReq = VNDetectHumanHandPoseRequest(); handReq.maximumHandCount = 2
try? VNImageRequestHandler(cgImage: img, options: [:]).perform([faceReq, handReq])
// 嘴中心 = 最大人脸 outerLips 关键点的平均位置，换算到整图坐标
// 手到嘴 = 所有置信度 > 0.3 的手部关节到嘴中心的最近距离 / 脸宽
// 嘴周围 = 以嘴为中心、边长 2.4 倍脸宽的方形裁剪，做 VNClassifyImageRequest，
//          取 cup/mug/bottle/drinking_glass/thermos/… 等容器类标签的最高置信度
```

照片来源（Wikimedia Commons，仅作本机实验，未再分发）：正例为 “Woman drinking water”“Woman drinking water in kitchen during morning time”“Woman drinks from a glass while standing in a well-lit room”“Woman drinks water from a glass in a modern kitchen”“Woman sitting on the floor drinking water from a glass in a living room”（均为 CC BY 2.0）与 “Woman drinking from bottle (Unsplash)”（CC0）；难负例为 “Woman holding a glass of water while sitting on a mat…”“Woman holds a glass of drink with lime and mint…”“Woman in professional attire typing on laptop with handcuffs on desk near coffee cup…”（均为 CC BY 2.0）；普通负例为 9 张“typing on a laptop”照片。另有一张远景照片因人太小、不像摄像头画面而剔除。
