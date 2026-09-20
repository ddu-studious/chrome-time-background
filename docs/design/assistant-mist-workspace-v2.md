# AI 工作台 · 山水雾光 v2

## 设计目标

保留已认可的左右双栏与底部输入结构，接入项目 v5 的山水桌面、玻璃表面和紫色强调语言。将原来接近黑色的平面提亮成烟灰蓝与灰紫渐变，避免浅色商务卡片风格。

## 视觉实现

- 对照 `css/product-ui-v5.css` 和 `docs/design/product-ui-multi-screen-v5.md`，延续紫色主操作、圆角玻璃控件、白色正文和细边高光。
- 外层雾蓝渐变 + 灰紫反光，主色从近黑提高至中等亮度蓝灰；主体维持足够遮蔽度，宿主提供 28px 背景模糊，避免背景时钟透进正文。
- 对话、执行、输入仍分为三个明确区域；用户消息靠右，助手消息靠左。过程详情保持原有展开、收起和留存入口。
- 输入框左侧的轻量星芒、紫色发送按钮、微光输入焦点和小幅状态呼吸提供科技感，遵循减少动态效果设置。
- 白色正文与浅灰辅助文字，成功薄荷绿、失败莓红；状态同时有文字提示。
- 无会话时展示简短能力介绍；工具栏可换行，窄屏保留编辑输入等现有操作。
- 生成图仅作视觉参考，运行界面由 HTML/CSS 实现，没有新增模型请求或运行时图片依赖。

## 最终文件

- 设计稿：[assistant-mist-workspace-imagegen-v2.png](assets/assistant-mist-workspace-imagegen-v2.png)
- 页面：`assistant.html`
- 样式：`css/assistant.css`
- 页内玻璃宿主：`js/assistant-overlay.js`，首页引用版本更新于 `index.html`

## 图像生成

使用内置 image_gen；以前版双栏结构为编辑目标，项目首页设计为视觉参考。最终提示词见文末。

## 验证边界

本地预览使用真实助手页面与执行器，Chrome API、模型、音乐播放及提醒写入为隔离替身。预览不能证明真实账号播放、模型服务或扩展重载结果。

标题栏仅保留文字，星芒移至输入框左侧并去除方块底座（后续位置调整，以实际界面为准）。

## 落地验收

- 助手相关回归测试 187/187 通过；脚本语法与 `git diff --check` 通过。
- Playwright 隔离浏览器验证音乐示例检索、歌手热门歌曲浏览、步骤详情展开、过程收起与恢复、首次输入聚焦。
- 1440×900、1138×488、390×844 三档检查均无横向溢出，输入区和页脚在 iframe 可视区域内。
- 修复矮窗口裁剪：宿主传入可用面板高度，桌面两栏独立滚动，输入区保持可见；窄屏内容允许纵向滚动。
- 实际界面截图：`output/playwright/assistant-mist-desktop.png`；响应式截图：`assistant-mist-1138.png`、`assistant-mist-390.png`。

## 最终生成提示词

```text
Use case: style-transfer / ui-mockup
Asset type: revised high fidelity AI workspace design.
Input images: Image 1 is the edit target and its layout is approved. Image 2 is supporting project visual-language reference (Chinese landscape personal desktop, violet accents and smoky glass). Keep Image 1's conversation/execution/composer structure.
Primary request: The white-and-blue design is too stiff and enterprise-like. Restyle it to belong in this atmospheric landscape desktop product. Replace the hard white rectangles with softly layered SMOKY BLUE-GRAY GLASS and dusky lavender translucent surfaces. This is not a black interface: use clearly luminous midtone slate (#36455f / #43516d) and misty blue-gray surfaces with white text, no near-black slab. Blend mountain dusk and pale violet reflections into the glass at the top corners. Main foreground remains highly readable.
Layout: same centered rounded workspace, compact header, left 60% conversation area and right 40% execution area, full-width composer bottom. Reduce boxed-in corporate borders, use softer 20px curvature, subtle white inner highlights, more organically floating message bubbles. Execution area has a quiet translucent surface and a fine connected violet timeline, not nested white cards. Small orb-like violet/cyan star in header, violet main action in project accent #8b6cff. Subtle gradient perimeter on composer. No full neon outline, no futuristic HUD or robot.
Text: Chinese content from Image 1, title "AI 工作台"; user "张杰的热播歌曲，直接播放。"; assistant "正在理解需求…"; right "执行过程", two genuine running rows; toolbar keep "@ 应用", "/ 动作", "模型", "思考", "停止执行"; footer "示例", "AI 设置", "我的记忆".
Backdrop: soft scenic Chinese mountain landscape at blue hour with a little warm sunlight, matching this personal desktop; low distraction. The glass panel should feel integrated with wallpaper without readable wallpaper clock bleeding through its text. Preserve all meaningful controls. Do not add metrics, charts, marketing headings or extra sidebars. This is an elegant personal creative companion, atmospheric, subtly playful, precise and premium.
```
