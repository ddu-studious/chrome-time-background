# 隔离浅海原型的上游来源

Deskworlds by Chase Lean，MIT。
固定提交：335d6c1aeb59b338b1cc59d734dc6eb87a596a88。
来源：https://github.com/chaseleantj/deskworlds

`upstream/` 内 20 个文件按 Git blob SHA-1 验证后原样保存；详细清单见 `upstream-lock.json`，额外 SHA-256 见 `upstream-checksums.json`。
Deskworlds 许可证位于 `upstream/LICENSE`。随该提交一起使用其 Three.js r180 与 `upstream/vendor/THREE-LICENSE.txt`，没有将上游依赖擅自升级到 r186。

实际使用公开导出的 createTerrain、createCorals、createAnemone、createCaustics、createEnvironment 及材质的水流时间参数。
没有导入上游 main.js、ReefSimulation、鱼群或另一份任务状态。

自有代码：透明画布、局部造景开关、宿主 frame 生命周期适配、隔离内存数据、演示面板和本地白名单服务器。
打包只将 terrain.js 的三个 import.meta.url 资产基址重定向到保留的上游目录，原文件不修改。使用本项目已有、锁定的 esbuild 0.28.1 公共 build API。

本页沿用现有 Aquarium、AquariumPlay、JellyfishSkin、BackgroundExperience、TaskCrumple 的真实脚本；任务完成出口是明确标识的演示替身，仅修改本页内存。

这是研究原型：3D 造景与现有 2D 动物合成，尚没有统一 3D 遮挡、礁石碰撞、真实物种栖息或新动物模型。未接入正式首页。
