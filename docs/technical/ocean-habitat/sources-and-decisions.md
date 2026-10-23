# 资料、版本与技术取舍

## 本轮直接使用的能力

| 能力 | 固定来源 / 公开 API | 本项目承担的适配 |
|---|---|---|
| 鱼、活石外观 | Deskworlds `335d6c1aeb59b338b1cc59d734dc6eb87a596a88`；`createFishSchool/createTerrain/ellipsoid/tube` | 单位、实例成员、位置、可见范围；礁缝布局是明确编排的验证栖息地 |
| 三维渲染 | Three.js `0.180.0`；LatheGeometry、TorusGeometry、MeshPhysicalMaterial、透明 Renderer | 水母钟罩/内层/实体触手、任务交互投影；没有改成图片面片 |
| 路径搜索 | Yuka `0.7.8`；Graph、NavNode、Edge、AStar.search/getPath | 建有净空的有限节点/边，选择掩体/出口、失视记忆和业务状态 |
| 转向/减速 | 同一 Yuka；PursuitBehavior、EvadeBehavior、SeekBehavior、ArriveBehavior.calculate | 唯一 World 积分、转速上限、拐点减速和碰撞拒绝 |
| 空间净空 | three-mesh-bvh `0.9.16`；MeshBVH.shapecast/raycastFirst/closestPointToPoint | 身体胶囊、转身包围球、有限姿态采样；非自研物理引擎 |
| 任务控制 | 本仓库 `js/jellyfish.js`、`js/jellyfish-core.js`、`js/task-crumple.js` | 原 create 控制器经隔离构建加入 drawFrame 注入；任务所有权、等待/失败/取消/完成仍走原代码 |

官方参考：[Yuka AStar](https://mugen87.github.io/yuka/docs/AStar.html)、[Yuka FollowPathBehavior](https://mugen87.github.io/yuka/docs/FollowPathBehavior.html)、[Three.js 文档](https://threejs.org/docs/)。Yuka 在线文档页标为 0.7.7，实际实现以本地已锁定 0.7.8 的公开分发包和自动化测试为准，不把网站版本号当成安装版本。

`FollowPathBehavior` 已检查；其最后一个节点使用内部 ArriveBehavior，默认减速参数不适合当前米制近距离样板。本轮选择正式 `ArriveBehavior` 并显式配置减速，仅自行保存路径游标，不访问 `_arrive` 等内部成员，也不重写 A*。

所有依赖继续使用已有锁文件，本轮没有新增 npm 包。模型/上游许可证与原始文件校验见原型 `NOTICE.md`、`upstream-lock.json`、`model-lock.json`。新水母是 Three 基础几何与 Deskworlds 公共管线几何的组合，不引入来源不明的水母素材。

## 关键决策

1. **可验证的礁缝优先。** 在同一真实可见网格中，入口、掩体、出口是编排的候选点，是否可走仍由个体全身净空和 A* 决定；原完整浅礁作为另一模式保留。没有宣称已自动识别任意珊瑚礁的可钻孔洞。
2. **保守转身净空。** 导航用覆盖胶囊体各朝向的包围球，半径向上取整到 5 mm；最多 12 组缓存，每组最多 153 节点，场景/位置变化清缓存。实际移动仍做胶囊姿态检查。这样可能拒绝现实中能侧身挤过的路线，但不会靠缩小真实身体放行。
3. **先看见，再追踪。** 失去视线后只保留最后看见的位置，搜索栖息地出口，不持续读取隐藏猎物的实时位置用于 Pursuit。搜索有等待期、失视上限和原追逐总时限，无法进入掩体会放弃。
4. **躲藏有停留。** 小鱼只选择自己能进、捕食者不能进的掩体；进入后停止位移、警戒，威胁解除后按路线试探离开。不是到点随机判“逃脱成功”。
5. **水母只替换视觉。** 原控制器的 public create 没有绘制注入参数，因此隔离构建对本仓库源代码的单个 draw 调用增加注入，匹配不唯一即构建失败。没有复制任务完成状态机，也没有修改正式文件。正式接入时应把该参数正式公开并删掉构建转换。
6. **透明合成保持背景。** DOM 壁纸不在 Three 的透射缓冲中，因此本轮水母采用透明材质和高光，而非宣称真实光学折射。任务水母在前景交互深度，大小按原任务界面可读尺度映射；不纳入生物学体长验收。
7. **只做隔离版本。** 正式扩展仍未接入，不改变正式首页/壁纸/CSP/权限/真实任务存储。新绘制没有额外 RAF，沿用原宿主失焦休息和隐藏暂停；Three Renderer 的后台深度释放仍须单独验收后才正式接入。

## 历史资料索引

- [动物外形与动作写实化方案（2026-10-22）](animal-realism-plan-20261022.md)：当前 `bend=0` 与停转规则的证据、物种参考、动画公共 API、未验收资产候选和下一轮执行顺序；本轮只更新文档。
- [最初海洋体系与工具调研](../../research/research-aquarium-ocean-system-20261021.md)：背景保护、渲染方向、生图能力边界。
- [浅礁组合原型](../../research/research-aquarium-reef-lab-20261021.md)：第一版 3D 造景 + 2D 动物。
- [真实三维、尺度与生态方案](../../research/research-aquarium-3d-scale-ecology-20261021.md)：模型厚度、相对尺度、生命周期和追逃。
- [首轮实施计划与结果](../../superpowers/plans/2026-10-21-aquarium-3d-scale-ecology.md)：P0–P6，哪些已完成、哪些尚未正式验收。
- [物理与库调研](../../research/research-aquarium-physical-realism-libs-20261020.md)、[视觉技术案例](../../research/research-aquarium-visual-tech-survey-20261020.md)：库候选和 X/GitHub/Reddit 案例线索；案例不是本项目已实现证明。
- [潮汐、大小与捕食调研](../../research/research-aquarium-tide-size-drag-predation-20261019.md)、[原捕食技术说明](../aquarium-predation-20261020.md)、[原水族馆说明](../aquarium-20261017.md)：正式二维模块现状。
- [首轮原型证据](../../../output/aquarium-review-20261021/reef-3d-lab/RESULTS.md)、[第二轮证据目录](../../../output/aquarium-review-20261021/reef-3d-v2/)：截图、测试、实际步进轨迹；不同版本结果不要混写。

外部案例只用于设计参考；下载或引入新资产前仍需重新核实文件、许可证、尺寸口径和运行预算。后续资料必须写明“参考”“已运行”“已集成”“已验收”的区别。


## 第三轮新增资料与决策（当前导航状态）

再次核对固定提交的 [Deskworlds navigation.js](https://github.com/chaseleantj/deskworlds/blob/335d6c1aeb59b338b1cc59d734dc6eb87a596a88/scenes/reefscape/src/navigation.js)：`clearWater/clearSegment` 有 margin 参数，但 ReefNavigation 构造的边固定 margin=0.48 分米、使用椭球近似。它会排除部分真实网格的孔洞，因此本轮复用其公开开阔节点，按原 `createTerrain` 的真实几何补充三维净空与 Yuka A*，没有复制它的内部最短路。

当前完整硬礁已拥有 6,636 节点 / 29,460 候选边的有限三维航路；第二轮仍保留 153 节点的编排场景作对照。新数据在 `assets/navigation/`；烘焙、原几何、运行代码和最终 bundle 的指纹共同保留。详见 [第三轮方案](implementation-v3.md)。无新增 npm 依赖、WASM 或远程运行资源。

## 第四轮：外形与动作单体样板（2026-10-22）

已实现内容见[第四轮记录](implementation-v4.md)，证据见[单体样板验收](../../../output/aquarium-review-20261022/animal-samples/RESULTS.md)。继续复用已有固定版本；小丑鱼通过公开工厂、Three 几何属性与 `onBeforeCompile` 做可逆适配，海月水母通过 Three 几何和上游 `tube/merge` 制作；没有引入前轮未验收的 Sketchfab 资产。新版弯身与外形仅在无礁水域启用，任务水母不接管 Core 位移或业务状态。参数是视觉假设，独立参考标定及新版运动包络仍待完成。

## 第五轮：完整浅礁体态与水母修形（2026-10-22）

[当前实施记录](implementation-v5.md)与[验收证据](../../../output/aquarium-review-20261022/reef-3d-v5/RESULTS.md)：锁定几何/动作的解析包围、带旋转的扫掠覆盖、统一点/边安全余量、前视及有界恢复，保持 Yuka/BVH 的公开路径。完整36组矩阵与水母连续伞缘修形已验证；新鱼体态不再限无礁水域。水母新参考为 Oregon Coast Aquarium 与澳大利亚博物馆，来源和未标定边界见实施记录；没有下载或打包照片。

## 第六轮：自然系轻动漫（2026-10-23）

用户确认自然、治愈与梦幻都保留一点，采用一个可切换的混合风格。当前[实施记录](implementation-v6.md)记录本轮实际查看的博物馆照片、Monterey海月视频与Fluval白金percula视频（只用作运动参考，不能当野生花纹），并区分视觉观察与未完成的定量测量。继续复用既有模型和Three公开材质hook；没有引入新资产或运行依赖。

## 第七轮体验决策（2026-10-23）

用户确认梦幻感主要给水母，小鱼保持清爽自然，并授权继续demo。采用[第七轮方案](implementation-v7.md)：复用本仓库 `AquariumPlay.mountFeed` 的正式公开接口与 `css/aquarium.css`，只补屏幕到三维水域的投放适配；快捷切景复用现有View，不创建第二份World或任务事实库。没有新增外部资料、依赖或下载资产。几何/动作/导航沿V5、样式沿V6，未做新的生物频率测量。

## 第八轮运动决策（2026-10-23）

[连续转弯与柔软游动](implementation-v8.md)继续复用Three四元数、Yuka转向和BVH扫掠。朝向角速度适配放在World提交之前，不建立第二套位置所有者；水母只读原Core速度作组织拖曳，不驱动任务位移。原几何和鱼动作源未变，包围证明沿用且构建复核；运动路径改变后重跑完整36组矩阵。没有新增外部媒体、依赖或生物频率测量。新增[动物清单](animal-demo-inventory.md)防止将版本/个体/二维居民重复计为新三维动物。

## 第九轮资产与动画（2026-10-23）

[V9方案](implementation-v9.md)记录新增八类，优先复用原Deskworlds公开createFishSchool中的chromis/anthias；六个新GLB来自[Quaternius作者CC0模型包](https://poly.pizza/bundle/Animated-Fish-Bundle-44zhHN1UbT)，逐文件记录source-lock.json。原Swimming_Normal通过Three AnimationMixer播放，SkeletonUtils.clone隔离实例；无图片纸片或换色重复计数。新骨骼模型采用任意旋转的保守球界，拾取使用实际蒙皮三角形；未把宽碰撞球当点击区域。移除实例释放骨骼纹理，缓存仍有界。
