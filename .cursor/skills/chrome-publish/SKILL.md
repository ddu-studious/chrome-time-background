---
name: chrome-publish
description: Chrome 扩展发布流程辅助。用于打包扩展、更新版本号、生成版本说明、发布到 Chrome Web Store。当用户提到"发布"、"打包"、"上传到商店"、"更新版本"时使用。
---

# Chrome 扩展发布流程

## 快速发布

```bash
# 1. 更新版本号
# 修改 manifest.json 中的 version 字段

# 2. 打包（如果有打包脚本）
./scripts/build.sh

# 或手动打包：将项目目录打包为 zip 文件
# 排除：.cursor/、.git/、test/、*.md（README除外）
```

---

## 完整发布流程

### Step 1: 更新版本号

修改 `manifest.json` 中的 version 字段：

```json
{
    "version": "1.x.x"
}
```

### Step 2: 更新变更日志

修改 `CHANGELOG.md`，添加新版本记录：

```markdown
## [1.x.x] - YYYY-MM-DD

### 新增
- 功能描述

### 优化
- 优化描述

### 修复
- 修复描述
```

### Step 3: 更新 README

修改 `README.md` 中的版本号：

```markdown
## 版本

当前版本：1.x.x
```

### Step 4: 更新 ROADMAP

在 `ROADMAP.md` 中标记已完成的功能。

### Step 5: 打包扩展

手动打包方式：

1. 创建临时目录
2. 复制以下文件/目录：
   - `manifest.json`
   - `index.html`
   - `css/`
   - `js/`
   - `icons/`
3. 压缩为 zip 文件
4. 命名为 `chrome-time-background-v{版本号}.zip`

### Step 6: 上传到 Chrome Web Store

1. 打开 [Chrome Web Store 开发者控制台](https://chrome.google.com/webstore/devconsole)
2. 登录开发者账号
3. 选择扩展 "中国风景时钟"
4. 点击「软件包」标签页
5. 点击「上传新软件包」
6. 选择打包好的 zip 文件
7. 等待上传完成

### Step 7: 填写版本说明

在「商品详情」中更新：
- 简短描述（如有更改）
- 详细描述（如有更改）
- 版本说明

### Step 8: 提交审核

1. 确认所有信息正确
2. 点击「提交审核」
3. 等待 Google 审核（通常 1-3 个工作日）

---

## 发布检查清单

### 代码检查
- [ ] 所有功能测试通过
- [ ] 无控制台错误
- [ ] 时钟显示正常
- [ ] 天气功能正常
- [ ] 备忘录功能正常
- [ ] 背景切换正常
- [ ] 多语言切换正常

### 版本号检查
- [ ] `manifest.json` 版本号已更新
- [ ] 版本号格式正确（x.y.z）
- [ ] 版本号大于当前已发布版本

### 文档检查
- [ ] `CHANGELOG.md` 已更新
- [ ] `README.md` 版本号已更新
- [ ] `ROADMAP.md` 进度已更新

### 打包检查
- [ ] zip 包包含所有必要文件
- [ ] zip 包不包含开发文件（.cursor/、test/、.git/）
- [ ] zip 包大小合理（通常 < 2MB）

### 发布检查
- [ ] 已登录开发者账号
- [ ] 扩展 ID 正确
- [ ] 上传成功
- [ ] 提交审核

---

## 版本说明模板

### 新功能版本（Minor: x.Y.0）

**中文：**
```
v1.5.0 带来全新功能：
- 每日任务管理：轻松规划每天的任务
- 任务提醒：过期任务自动提醒
- 数据备份：支持导出和导入任务数据

享受更高效的时间管理！
```

**英文：**
```
v1.5.0 brings new features:
- Daily task management: Plan your daily tasks easily
- Task reminders: Automatic notifications for overdue tasks
- Data backup: Export and import task data

Enjoy better time management!
```

### Bug 修复版本（Patch: x.y.Z）

**中文：**
```
v1.4.2 修复：
- 修复任务保存失败的问题
- 优化面板拖拽体验
- 改进通知显示效果

感谢您的反馈！
```

**英文：**
```
v1.4.2 fixes:
- Fixed task saving issue
- Improved panel dragging experience
- Enhanced notification display

Thank you for your feedback!
```

---

## 打包排除文件

以下文件/目录不应包含在发布包中：

```
.cursor/          # Cursor IDE 配置
.git/             # Git 版本控制
.gitignore        # Git 忽略规则
test/             # 测试文件
docs/             # 文档（除非是帮助文档）
*.md              # Markdown 文件（README 除外）
node_modules/     # Node.js 依赖（如果有）
package.json      # npm 配置（如果有）
package-lock.json # npm 锁定文件（如果有）
```

---

## 常见问题

### 上传失败

- 检查 zip 包是否完整
- 确认 manifest.json 格式正确
- 版本号必须大于当前版本

### 审核被拒

- 检查权限声明是否完整
- 确认隐私政策链接有效
- 查看审核反馈邮件中的具体原因

### 发布后回滚

- Chrome Web Store 不支持直接回滚
- 需要上传旧版本的新版本号包
- 例如：1.4.0 有问题，上传 1.4.1 修复版

### 权限变更

如果新版本需要新权限（如 `alarms`、`notifications`）：
- 在 manifest.json 中添加权限
- 在商品详情中说明为什么需要这些权限
- 审核可能需要更长时间

---

## 发布时间线

| 阶段 | 预计时间 |
|-----|---------|
| 代码完成 | - |
| 测试验证 | 1-2 小时 |
| 文档更新 | 30 分钟 |
| 打包上传 | 15 分钟 |
| 审核通过 | 1-3 个工作日 |
| 用户可见 | 审核通过后立即 |
