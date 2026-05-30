# 背景面板交互特效 — 需求文档 v1

## 概述

为新标签页背景区域增加轻量级视觉交互效果，提升氛围感和趣味性。所有效果：
- **可独立开关**：通过设置面板逐个启用/禁用
- **不影响性能**：使用 requestAnimationFrame + Canvas/CSS 动画，idle 时自动降帧
- **不干扰使用**：效果层级最低（z-index < 所有业务面板），不捕获鼠标事件
- **配置化**：每个效果有独立参数（密度、颜色、透明度、速度等）

## 架构设计

```
┌─────────────────────────────────────────┐
│ index.html (new tab page)               │
├─────────────────────────────────────────┤
│ Layer 0: <video> / <img> 背景            │
│ Layer 1: <canvas id="bg-effects">       │  ← 新增
│ Layer 2: .main-layout (时钟/天气/内容)    │
│ Layer 3: dock-bar / overlay panels      │
└─────────────────────────────────────────┘
```

### 配置存储

```js
// chrome.storage.local key: 'bgEffectsConfig'
{
  enabled: true,              // 总开关
  activeEffects: ['particles', 'tide'],  // 当前启用的效果 ID
  configs: {
    particles: { density: 60, mouseInteract: true, weatherSync: true, opacity: 0.6 },
    ripple: { enabled: false, showInsight: true, maxRipples: 5 },
    tide: { amplitude: 4, speed: 0.5, color: '#4fc3f7', opacity: 0.3 },
    breath: { syncWriting: true, color: 'auto', intensity: 0.4 },
    constellation: { starCount: 30, connectDistance: 120, mouseRadius: 150 },
  }
}
```

## 效果清单

### 1. 粒子物理场 (particles)

**描述**：背景有极淡的粒子（星尘/萤火虫），跟随鼠标轻微偏移形成视差，可与天气数据联动。

**功能要求**：
- 60-120 个微小粒子，随机分布
- 鼠标移动时粒子被轻微排斥（视差效果）
- 粒子间距小于阈值时用极淡线段连接
- 天气联动：晴天=星尘(白色)，雨天=雨滴(蓝色下落)，雪天=雪花(白色飘落)

**配置项**：
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| density | number | 60 | 粒子数量 |
| mouseInteract | boolean | true | 鼠标交互 |
| weatherSync | boolean | true | 天气联动 |
| opacity | number | 0.6 | 整体透明度 |
| connectLines | boolean | true | 连线效果 |
| connectDistance | number | 100 | 连线距离阈值 |
| particleSize | [number, number] | [1, 4] | 粒子大小范围 |
| speed | number | 0.5 | 运动速度 |

**性能**：idle 时降帧到 15fps，鼠标活跃时 60fps

---

### 2. 涟漪交互 + 灵感推送 (ripple)

**描述**：鼠标在背景空白区点击产生水波涟漪效果，涟漪扩散时短暂浮现一条灵感文案（诗句/名言/今日待办）。

**功能要求**：
- 点击背景空白区产生 2-3 圈同心圆涟漪
- 涟漪使用 radial-gradient 动画（纯 CSS/Canvas）
- 涟漪中心浮现一行灵感文案，淡入后 3s 淡出
- 灵感来源：诗词电台数据 / 知识墙条目 / 随机名言 / 今日未完成任务
- 连续快速点击有节流（最多 2 个涟漪同时存在）

**配置项**：
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| enabled | boolean | false | 启用 |
| showInsight | boolean | true | 显示灵感文案 |
| maxRipples | number | 3 | 最大同时涟漪数 |
| rippleColor | string | 'rgba(255,255,255,0.3)' | 涟漪颜色 |
| insightSources | string[] | ['poetry', 'quotes'] | 灵感来源 |
| duration | number | 2000 | 涟漪持续时间(ms) |

---

### 3. 潮汐线呼吸动画 (tide)

**描述**：屏幕底部有一条随时间缓慢起伏的正弦波浪线，像海平面呼吸，极低透明度不干扰。

**功能要求**：
- SVG path 或 Canvas 绘制正弦波
- 2-3 层叠加，不同频率/振幅，产生深度感
- 随时间缓慢变化（一个周期 8-12 秒）
- 颜色跟随背景主色调自动适配
- 可配置在底部/顶部/两侧

**配置项**：
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| amplitude | number | 4 | 波浪振幅(px) |
| speed | number | 0.5 | 波动速度 |
| layers | number | 3 | 波浪层数 |
| color | string | '#4fc3f7' | 波浪颜色 |
| opacity | number | 0.3 | 透明度 |
| position | string | 'bottom' | 位置 |
| height | number | 60 | 波浪区域高度(px) |

---

### 4. 呼吸灯写作状态 (breath)

**描述**：背景边缘有微弱光晕脉搏动画，颜色随当日写作进度变化（冷蓝→暖金），与写作空间联动。

**功能要求**：
- 屏幕四边有极淡的渐变光晕
- 光晕以 4-6s 为周期做脉搏动画（opacity 0.1 ↔ 0.4）
- 颜色状态：
  - 未写作（灰蓝）→ 写作中（淡蓝）→ 目标达成（暖金）
- 与写作空间数据联动：今日字数 / 写作时长
- 写作空间打开时光晕加强

**配置项**：
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| syncWriting | boolean | true | 与写作状态联动 |
| color | string | 'auto' | 'auto' 或固定颜色 |
| intensity | number | 0.4 | 最大亮度 |
| pulseSpeed | number | 5 | 脉搏周期(秒) |
| position | string | 'edges' | 'edges'/'corners'/'top' |

---

### 5. 星座连线 (constellation)

**描述**：随机在背景产生静态星点，鼠标靠近时自动连线形成类星座图案，远离后连线淡出。

**功能要求**：
- 20-40 个固定位置的星点（随机生成，刷新保持）
- 鼠标进入星点附近（150px）时，该星点与邻近星点用淡线连接
- 连线有淡入动画，鼠标远离后淡出
- 星点有微弱闪烁动画（opacity 抖动）
- 可选：鼠标本身作为一个"移动星点"参与连线

**配置项**：
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| starCount | number | 30 | 星点数量 |
| connectDistance | number | 120 | 连线触发距离 |
| mouseRadius | number | 150 | 鼠标影响半径 |
| mouseAsNode | boolean | true | 鼠标作为节点 |
| twinkle | boolean | true | 星点闪烁 |
| lineColor | string | 'rgba(255,255,255,0.2)' | 连线颜色 |
| starColor | string | 'rgba(255,255,255,0.6)' | 星点颜色 |

---

## 开发计划

### Phase 1: Demo 验证（已完成）
每个效果构建独立 HTML demo，验证视觉效果和性能

### Phase 2: 集成框架（已完成）
- 创建 `js/bg-effects.js` 统一管理器（含 5 个效果引擎）
- 实现配置存储（chrome.storage.local）和开关机制
- 集成到 `index.html` 背景层（Canvas + CSS 混合架构）
- 星座增强：随机植入 3 个真实星座图案，点击显示星座名称/符号/日期
- 涟漪增强：点击空白区域产生涟漪并浮现灵感文案（诗词/名言）

### Phase 3: 设置 UI
- 在设置面板增加"背景特效"分区
- 每个效果有独立开关 + 参数滑块
- 实时预览

### Phase 4: 联动
- 粒子天气联动（读取天气模块数据）
- 呼吸灯写作联动（读取写作统计）
- 涟漪灵感联动（读取诗词/任务数据）

---

## 技术约束

1. **零依赖**：纯 Canvas API + CSS Animation，不引入额外库
2. **性能预算**：所有效果同时开启时 CPU < 5%（idle），< 15%（交互中）
3. **降级策略**：检测到低性能设备自动降低粒子数/关闭连线
4. **内存**：Canvas 复用单一实例，不创建多余 DOM
5. **兼容性**：Chrome 88+ (Manifest V3 最低版本)
