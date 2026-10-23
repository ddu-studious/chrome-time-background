# 资产和依赖来源

- Deskworlds，Chase Lean，MIT。仓库 https://github.com/chaseleantj/deskworlds ，固定提交 `335d6c1aeb59b338b1cc59d734dc6eb87a596a88`。本目录的 `upstream/` 保留原始文件；逐文件 Git blob 校验见 `upstream-lock.json`，完整许可证见 `upstream/LICENSE`。
- Three.js 0.180.0，MIT。https://github.com/mrdoob/three.js 。固定 npm 包与 Deskworlds 自带 Three r180 的 core/module 文件逐字节一致；完整许可证 `licenses/three.txt`。
- Yuka 0.7.8，MIT。https://github.com/Mugen87/yuka 。使用正式 Vehicle、SeekBehavior、PursuitBehavior、EvadeBehavior.calculate API；完整许可证 `licenses/yuka.txt`。
- three-mesh-bvh 0.9.16，MIT。https://github.com/gkjohnson/three-mesh-bvh 。使用 MeshBVH、shapecast、raycastFirst、closestPointToPoint 公开 API；完整许可证 `licenses/three-mesh-bvh.txt`。
- Barramundi Fish，Microsoft，来自 Khronos glTF Sample Assets。https://github.com/KhronosGroup/glTF-Sample-Assets/tree/15cd02d304e54cb42a4db4eefe719f76190f4b68/Models/BarramundiFish 。模型及其纹理/二进制为 CC0-1.0；许可证说明等元文档为 CC-BY-4.0。保留 `assets/barramundi/LICENSE.md`，原始文件未修改；运行时调整坐标、尺度并加入尾部弯曲。模型锁与校验见 `model-lock.json` / `model-checksums.json`。
- 构建复用仓库已经固定的 esbuild 0.28.1。未安装新构建插件，未运行依赖安装脚本。

上游公开工厂 `createFishSchool`、`createTerrain`、`createCorals`、`createAnemone`、`createEnvironment`、`createCaustics` 直接参与运行。构建器只重绑定 terrain 的相对资产 URL；没有调用未导出的鱼材质函数或修改原厂模型源文件。`build-info.json` 记录最终 bundle 校验值。

第三轮额外保留同一 Deskworlds 提交的 `navigation.js`（MIT），只复用其公开开阔水域节点。完整浅礁航路是原始地形几何的派生净空数据，资产本身未修改；依赖与模型许可证不变。

第四轮没有新增外部素材。`clown-appearance.mjs` 对上述公开鱼工厂生成的 Three 几何/材质做可逆适配，不修改原始上游文件；`fish-motion.mjs` 只映射世界运动到公开动画参数。`moon-jelly.mjs` 是本项目参考海月水母形态制作的程序化样板，复用同一上游的公开 `tube/merge`。生物参考网页仅作观察依据，没有下载或打包其照片、录像；参数与校准边界见第四轮实施文档。

## 第九轮新增模型

六个Quaternius CC0 GLB的许可、来源和逐文件指纹见 [assets/community/NOTICE.md](assets/community/NOTICE.md) 与 source-lock.json。另两类鱼直接复用已有Deskworlds公开工厂，没有复制内部实现或新增依赖。
