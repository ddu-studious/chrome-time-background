# 和风天气逐小时预报API调研报告

## 一、调研概述

### 1.1 调研目的
调研和风天气（QWeather）逐小时天气预报API能力，评估在现有项目中集成逐小时温度曲线图功能的可行性。

### 1.2 调研范围
- 和风天气逐小时预报API功能与限制
- devapi免费版支持情况
- API请求格式与返回数据结构
- 前端悬浮温度曲线图实现方案
- 与现有天气模块的集成方式

### 1.3 调研时间
2026年2月8日

---

## 二、API可行性分析

### 2.1 逐小时预报API存在性 ✅

**结论：和风天气提供逐小时天气预报API**

和风天气提供了完整的逐小时天气预报API服务，属于API v7版本的一部分。该API提供全球城市未来**24-168小时**的逐小时天气预报数据。

**支持的时间范围：**
- `24h` - 24小时预报
- `72h` - 72小时预报  
- `168h` - 168小时预报（7天）

### 2.2 devapi免费版支持情况 ✅

**结论：devapi免费版完全支持逐小时预报API**

根据和风天气的定价策略：

1. **免费额度：**
   - 每月前 **5万次请求** 完全免费
   - 逐小时预报属于"天气和基础服务"分组，与实时天气、3天预报等API共享免费配额

2. **计费方式：**
   - 采用按量计费模式，阶梯价格
   - 超过5万次后的定价：
     - 之后的95万次：CNY 0.0007/次
     - 之后的400万次：CNY 0.0005/次
     - 之后的500万次：CNY 0.00035/次
     - 后续更多阶梯价格...

3. **当前项目使用情况：**
   - 当前API Key: `95c944325dfa427d836b3a32875d1b77`
   - 已使用API：
     - 实时天气：`/v7/weather/now`
     - 3天预报：`/v7/weather/3d`
   - **逐小时预报API与上述API共享免费配额，无需额外费用**

### 2.3 API限制说明

1. **更新频率：** 1小时更新一次
2. **时间颗粒度：** 逐小时
3. **地域覆盖：** 全球20多万个城市
4. **使用限制：**
   - 必须在使用和风天气服务的产品中注明来源
   - 非正常请求（返回code非2xx）超过合理范围可能导致账号冻结
   - 不能批量缓存或下载地理信息数据

---

## 三、API请求格式与数据结构

### 3.1 请求路径

```
/v7/weather/{hours}
```

**路径参数：**
- `hours`（必选）：预报小时数
  - `24h` - 24小时预报
  - `72h` - 72小时预报
  - `168h` - 168小时预报

### 3.2 请求参数

**查询参数：**
- `location`（必选）：需要查询地区的LocationID或坐标（经度,纬度）
  - 示例：`location=101010100` 或 `location=116.41,39.92`
- `key`（必选）：API密钥
- `lang`（可选）：多语言设置
- `unit`（可选）：数据单位设置
  - `m` - 公制单位（默认）
  - `i` - 英制单位

### 3.3 请求示例

**当前项目使用的devapi格式：**
```javascript
const hourlyUrl = `https://devapi.qweather.com/v7/weather/24h?location=${locationId}&key=${this.API_KEY}`;
```

**完整请求示例：**
```bash
curl -X GET --compressed \
  -H 'Authorization: Bearer your_token' \
  'https://devapi.qweather.com/v7/weather/24h?location=101010100&key=your_api_key'
```

### 3.4 返回数据结构

**响应格式：** JSON（Gzip压缩）

**响应示例：**
```json
{
  "code": "200",
  "updateTime": "2021-02-16T13:35+08:00",
  "fxLink": "http://hfx.link/2ax1",
  "hourly": [
    {
      "fxTime": "2021-02-16T15:00+08:00",
      "temp": "2",
      "icon": "100",
      "text": "晴",
      "wind360": "335",
      "windDir": "西北风",
      "windScale": "3-4",
      "windSpeed": "20",
      "humidity": "11",
      "pop": "0",
      "precip": "0.0",
      "pressure": "1025",
      "cloud": "0",
      "dew": "-25"
    },
    // ... 更多小时数据
  ],
  "refer": {
    "sources": ["QWeather", "NMC", "ECMWF"],
    "license": ["QWeather Developers License"]
  }
}
```

### 3.5 数据字段说明

| 字段 | 类型 | 说明 | 备注 |
|------|------|------|------|
| `code` | String | 状态码 | 参考状态码文档 |
| `updateTime` | String | API最近更新时间 | ISO 8601格式 |
| `fxLink` | String | 响应式页面链接 | 便于嵌入网站 |
| `hourly` | Array | 逐小时预报数据数组 | |
| `hourly[].fxTime` | String | 预报时间 | ISO 8601格式 |
| `hourly[].temp` | String | 温度 | 摄氏度（公制） |
| `hourly[].icon` | String | 天气图标代码 | 参考图标说明 |
| `hourly[].text` | String | 天气状况文字描述 | |
| `hourly[].wind360` | String | 风向360角度 | |
| `hourly[].windDir` | String | 风向 | |
| `hourly[].windScale` | String | 风力等级 | |
| `hourly[].windSpeed` | String | 风速 | 公里/小时 |
| `hourly[].humidity` | String | 相对湿度 | 百分比数值 |
| `hourly[].pop` | String | 降水概率 | 百分比，可能为空 |
| `hourly[].precip` | String | 累计降水量 | 毫米 |
| `hourly[].pressure` | String | 大气压强 | 百帕 |
| `hourly[].cloud` | String | 云量 | 百分比，可能为空 |
| `hourly[].dew` | String | 露点温度 | 可能为空 |

### 3.6 与现有API的对比

| 特性 | 实时天气 | 3天预报 | 逐小时预报 |
|------|---------|---------|-----------|
| API路径 | `/v7/weather/now` | `/v7/weather/3d` | `/v7/weather/24h` |
| 数据粒度 | 当前时刻 | 每日 | 每小时 |
| 时间范围 | 当前 | 未来3天 | 未来24-168小时 |
| 返回数据量 | 1条 | 3条 | 24-168条 |
| 免费配额 | 共享5万次/月 | 共享5万次/月 | 共享5万次/月 |

---

## 四、前端悬浮温度曲线图技术方案

### 4.1 方案概述

实现一个**纯原生JavaScript**的温度曲线图，支持：
- 温度折线图绘制
- 鼠标悬停显示详细信息（tooltip）
- 数据点高亮
- 响应式布局

**技术约束：**
- 不使用第三方图表库（如ECharts、Chart.js等）
- 使用Canvas或SVG原生实现
- 保持轻量级，适合Chrome扩展环境

### 4.2 方案一：Canvas实现（推荐）

#### 4.2.1 方案优势
- ✅ 性能优秀，适合大量数据点
- ✅ 绘制灵活，完全可控
- ✅ 文件体积小，无依赖
- ✅ 适合动态更新

#### 4.2.2 核心实现思路

**1. Canvas绘制基础结构**
```javascript
class TemperatureChart {
  constructor(canvas, data) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data; // 24小时数据数组
    this.width = canvas.width;
    this.height = canvas.height;
    this.padding = { top: 20, right: 20, bottom: 40, left: 50 };
    this.plotArea = {
      x: this.padding.left,
      y: this.padding.top,
      width: this.width - this.padding.left - this.padding.right,
      height: this.height - this.padding.top - this.padding.bottom
    };
  }
}
```

**2. 坐标转换**
```javascript
// 将数据坐标转换为Canvas像素坐标
getPixelX(index) {
  const step = this.plotArea.width / (this.data.length - 1);
  return this.plotArea.x + index * step;
}

getPixelY(temperature) {
  const minTemp = Math.min(...this.data.map(d => d.temp));
  const maxTemp = Math.max(...this.data.map(d => d.temp));
  const range = maxTemp - minTemp || 1;
  const normalized = (temperature - minTemp) / range;
  return this.plotArea.y + this.plotArea.height * (1 - normalized);
}
```

**3. 绘制折线图**
```javascript
drawLine() {
  this.ctx.beginPath();
  this.ctx.strokeStyle = '#4A90E2';
  this.ctx.lineWidth = 2;
  
  this.data.forEach((item, index) => {
    const x = this.getPixelX(index);
    const y = this.getPixelY(parseInt(item.temp));
    
    if (index === 0) {
      this.ctx.moveTo(x, y);
    } else {
      this.ctx.lineTo(x, y);
    }
  });
  
  this.ctx.stroke();
}
```

**4. 绘制数据点**
```javascript
drawPoints() {
  this.data.forEach((item, index) => {
    const x = this.getPixelX(index);
    const y = this.getPixelY(parseInt(item.temp));
    
    this.ctx.beginPath();
    this.ctx.fillStyle = '#4A90E2';
    this.ctx.arc(x, y, 4, 0, Math.PI * 2);
    this.ctx.fill();
  });
}
```

**5. 鼠标悬停检测与Tooltip**
```javascript
setupMouseInteraction() {
  let hoveredIndex = -1;
  
  this.canvas.addEventListener('mousemove', (e) => {
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // 查找最近的数据点
    let minDistance = Infinity;
    let nearestIndex = -1;
    
    this.data.forEach((item, index) => {
      const x = this.getPixelX(index);
      const y = this.getPixelY(parseInt(item.temp));
      const distance = Math.sqrt(
        Math.pow(mouseX - x, 2) + Math.pow(mouseY - y, 2)
      );
      
      if (distance < minDistance && distance < 15) { // 15px阈值
        minDistance = distance;
        nearestIndex = index;
      }
    });
    
    if (nearestIndex !== hoveredIndex) {
      hoveredIndex = nearestIndex;
      this.redraw(hoveredIndex);
    }
  });
  
  this.canvas.addEventListener('mouseleave', () => {
    hoveredIndex = -1;
    this.redraw(-1);
  });
}

redraw(highlightIndex = -1) {
  // 清空画布
  this.ctx.clearRect(0, 0, this.width, this.height);
  
  // 绘制背景、网格、坐标轴
  this.drawGrid();
  this.drawAxes();
  
  // 绘制折线
  this.drawLine();
  
  // 绘制数据点
  this.data.forEach((item, index) => {
    const x = this.getPixelX(index);
    const y = this.getPixelY(parseInt(item.temp));
    
    const isHighlighted = index === highlightIndex;
    
    // 绘制点
    this.ctx.beginPath();
    this.ctx.fillStyle = isHighlighted ? '#FF6B6B' : '#4A90E2';
    this.ctx.arc(x, y, isHighlighted ? 6 : 4, 0, Math.PI * 2);
    this.ctx.fill();
    
    // 如果高亮，绘制tooltip
    if (isHighlighted) {
      this.drawTooltip(x, y, item);
    }
  });
}

drawTooltip(x, y, data) {
  const tooltipWidth = 120;
  const tooltipHeight = 80;
  const tooltipX = Math.min(x, this.width - tooltipWidth - 10);
  const tooltipY = Math.max(y - tooltipHeight - 20, 10);
  
  // 绘制tooltip背景
  this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  this.ctx.fillRect(tooltipX, tooltipY, tooltipWidth, tooltipHeight);
  
  // 绘制文字
  this.ctx.fillStyle = '#FFFFFF';
  this.ctx.font = '12px Arial';
  this.ctx.fillText(
    `${new Date(data.fxTime).getHours()}:00`,
    tooltipX + 10,
    tooltipY + 20
  );
  this.ctx.fillText(
    `温度: ${data.temp}°C`,
    tooltipX + 10,
    tooltipY + 40
  );
  this.ctx.fillText(
    `天气: ${data.text}`,
    tooltipX + 10,
    tooltipY + 60
  );
}
```

**6. 完整实现示例**
```javascript
class HourlyTemperatureChart {
  constructor(containerId, hourlyData) {
    this.container = document.getElementById(containerId);
    this.data = hourlyData;
    this.initCanvas();
    this.setupMouseInteraction();
    this.draw();
  }
  
  initCanvas() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 600;
    this.canvas.height = 300;
    this.canvas.style.width = '100%';
    this.canvas.style.height = 'auto';
    this.container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    
    // 响应式处理
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }
  
  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.width * 0.5; // 保持宽高比
    this.draw();
  }
  
  // ... 其他方法同上
}
```

#### 4.2.3 Canvas方案优缺点

**优点：**
- ✅ 性能优秀，适合大量数据点
- ✅ 完全可控，定制化程度高
- ✅ 无第三方依赖
- ✅ 适合动态更新和动画

**缺点：**
- ❌ 实现复杂度较高
- ❌ 需要手动处理坐标转换
- ❌ 文字渲染需要手动处理
- ❌ 高DPI屏幕需要处理像素比

### 4.3 方案二：SVG实现

#### 4.3.1 方案优势
- ✅ DOM结构清晰，易于调试
- ✅ 支持CSS样式
- ✅ 文字渲染自动处理
- ✅ 支持交互事件（hover等）

#### 4.3.2 核心实现思路

**1. SVG结构创建**
```javascript
class SVGTemperatureChart {
  constructor(containerId, hourlyData) {
    this.container = document.getElementById(containerId);
    this.data = hourlyData;
    this.initSVG();
    this.draw();
  }
  
  initSVG() {
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('viewBox', '0 0 600 300');
    this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.svg.style.width = '100%';
    this.svg.style.height = 'auto';
    this.container.appendChild(this.svg);
    
    this.padding = { top: 20, right: 20, bottom: 40, left: 50 };
    this.width = 600;
    this.height = 300;
  }
}
```

**2. 绘制折线路径**
```javascript
drawLine() {
  const pathData = this.data.map((item, index) => {
    const x = this.getPixelX(index);
    const y = this.getPixelY(parseInt(item.temp));
    return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  path.setAttribute('stroke', '#4A90E2');
  path.setAttribute('stroke-width', '2');
  path.setAttribute('fill', 'none');
  path.classList.add('temperature-line');
  this.svg.appendChild(path);
}
```

**3. 绘制数据点与交互**
```javascript
drawPoints() {
  this.data.forEach((item, index) => {
    const x = this.getPixelX(index);
    const y = this.getPixelY(parseInt(item.temp));
    
    // 创建组
    const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    group.classList.add('data-point');
    group.dataset.index = index;
    
    // 绘制点
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', '#4A90E2');
    circle.classList.add('point-circle');
    
    // 扩大点击区域（透明大圆）
    const hitArea = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hitArea.setAttribute('cx', x);
    hitArea.setAttribute('cy', y);
    hitArea.setAttribute('r', '15');
    hitArea.setAttribute('fill', 'transparent');
    hitArea.classList.add('hit-area');
    
    // 创建tooltip
    const tooltip = this.createTooltip(item);
    tooltip.style.display = 'none';
    
    group.appendChild(circle);
    group.appendChild(hitArea);
    group.appendChild(tooltip);
    
    // 鼠标事件
    group.addEventListener('mouseenter', () => {
      circle.setAttribute('r', '6');
      circle.setAttribute('fill', '#FF6B6B');
      tooltip.style.display = 'block';
    });
    
    group.addEventListener('mouseleave', () => {
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', '#4A90E2');
      tooltip.style.display = 'none';
    });
    
    this.svg.appendChild(group);
  });
}

createTooltip(data) {
  const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
  tooltip.setAttribute('x', '0');
  tooltip.setAttribute('y', '0');
  tooltip.setAttribute('width', '120');
  tooltip.setAttribute('height', '80');
  
  const div = document.createElement('div');
  div.className = 'temperature-tooltip';
  div.innerHTML = `
    <div class="tooltip-time">${new Date(data.fxTime).getHours()}:00</div>
    <div class="tooltip-temp">${data.temp}°C</div>
    <div class="tooltip-text">${data.text}</div>
  `;
  
  tooltip.appendChild(div);
  return tooltip;
}
```

**4. CSS样式**
```css
.temperature-chart {
  width: 100%;
  max-width: 600px;
}

.temperature-line {
  transition: stroke 0.3s;
}

.data-point {
  cursor: pointer;
}

.point-circle {
  transition: r 0.2s, fill 0.2s;
}

.temperature-tooltip {
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  pointer-events: none;
}

.tooltip-time {
  font-weight: bold;
  margin-bottom: 4px;
}

.tooltip-temp {
  font-size: 16px;
  margin-bottom: 4px;
}
```

#### 4.3.3 SVG方案优缺点

**优点：**
- ✅ DOM结构清晰，易于调试和修改
- ✅ 支持CSS样式和动画
- ✅ 文字渲染自动处理
- ✅ 事件处理简单（原生DOM事件）
- ✅ 可访问性好（屏幕阅读器支持）

**缺点：**
- ❌ 数据量大时性能不如Canvas
- ❌ DOM节点多，内存占用较高
- ❌ 复杂动画性能较差

### 4.4 方案对比与推荐

| 特性 | Canvas方案 | SVG方案 |
|------|-----------|---------|
| 性能 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| 实现复杂度 | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| 定制化 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 文字渲染 | ⭐⭐ | ⭐⭐⭐⭐⭐ |
| 事件处理 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 文件大小 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 响应式 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

**推荐方案：Canvas方案**

**推荐理由：**
1. 24小时数据点数量适中（24个），Canvas性能优势明显
2. 当前项目已有Canvas使用经验（背景图片等）
3. 文件体积更小，适合Chrome扩展
4. 温度曲线图相对简单，Canvas实现复杂度可接受

**SVG方案适用场景：**
- 需要复杂交互
- 需要CSS动画
- 数据点较少（<10个）
- 需要更好的可访问性

---

## 五、与现有天气模块的集成方式

### 5.1 现有模块分析

**当前天气模块结构：**
- 文件：`js/weather.js`
- 类：`WeatherService`
- 主要方法：
  - `fetchWeatherDataByCity(locationId, cityName)` - 获取天气数据
  - `updateWeather()` - 更新天气显示
  - `getWeatherIcon(code)` - 获取天气图标

**当前API调用：**
```javascript
// 实时天气
const weatherUrl = `https://devapi.qweather.com/v7/weather/now?location=${locationId}&key=${this.API_KEY}`;

// 3天预报
const forecastUrl = `https://devapi.qweather.com/v7/weather/3d?location=${locationId}&key=${this.API_KEY}`;
```

### 5.2 集成方案设计

#### 5.2.1 数据获取集成

**在`WeatherService`类中添加方法：**
```javascript
/**
 * 获取逐小时天气预报数据
 * @param {string} locationId - 城市ID
 * @param {string} hours - 预报小时数：24h/72h/168h，默认24h
 * @returns {Promise<Object>} 逐小时预报数据
 */
async fetchHourlyForecast(locationId, hours = '24h') {
  try {
    const hourlyUrl = `https://devapi.qweather.com/v7/weather/${hours}?location=${locationId}&key=${this.API_KEY}`;
    const hourlyData = await this.fetchWithTimeout(hourlyUrl);
    
    if (hourlyData.code !== '200') {
      throw new Error('获取逐小时预报信息失败');
    }
    
    return {
      updateTime: hourlyData.updateTime,
      hourly: hourlyData.hourly || []
    };
  } catch (error) {
    console.error('Hourly forecast API request failed:', error);
    throw error;
  }
}

/**
 * 获取完整天气数据（包含逐小时预报）
 * @param {string} locationId - 城市ID
 * @param {string} cityName - 城市名称
 * @returns {Promise<Object>} 完整天气数据
 */
async fetchWeatherDataByCity(locationId, cityName) {
  try {
    // 并行请求所有数据
    const [weatherData, forecastData, hourlyData] = await Promise.all([
      this.fetchWithTimeout(`https://devapi.qweather.com/v7/weather/now?location=${locationId}&key=${this.API_KEY}`),
      this.fetchWithTimeout(`https://devapi.qweather.com/v7/weather/3d?location=${locationId}&key=${this.API_KEY}`),
      this.fetchHourlyForecast(locationId, '24h')
    ]);
    
    if (weatherData.code !== '200' || forecastData.code !== '200') {
      throw new Error('获取天气信息失败');
    }
    
    return {
      city: cityName,
      current: weatherData.now,
      forecast: forecastData.daily,
      hourly: hourlyData.hourly || [] // 新增逐小时数据
    };
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
}
```

#### 5.2.2 UI集成方案

**方案A：悬浮卡片（推荐）**

在天气区域添加一个可展开的卡片，点击后显示温度曲线图：

```html
<!-- 在 index.html 的 weather-wrapper 中添加 -->
<div class="weather-wrapper">
  <div class="weather-container" id="weather">
    <!-- 现有天气显示 -->
  </div>
  <div class="forecast-container" id="forecast">
    <!-- 现有3天预报 -->
  </div>
  <!-- 新增：逐小时温度曲线 -->
  <div class="hourly-chart-container" id="hourly-chart-container" style="display: none;">
    <div class="chart-header">
      <span>24小时温度趋势</span>
      <button class="chart-close-btn" id="chart-close-btn">×</button>
    </div>
    <div class="chart-content" id="hourly-chart"></div>
  </div>
  <button class="show-chart-btn" id="show-chart-btn">
    <span>📈</span> 查看24小时温度
  </button>
</div>
```

**方案B：内联显示**

在3天预报下方直接显示温度曲线图：

```html
<div class="forecast-container" id="forecast">
  <!-- 现有3天预报 -->
</div>
<!-- 新增：直接显示温度曲线 -->
<div class="hourly-chart-inline" id="hourly-chart"></div>
```

**推荐方案A**，原因：
- 不占用过多垂直空间
- 用户按需查看，体验更好
- 适合移动端和桌面端

#### 5.2.3 代码集成步骤

**步骤1：扩展WeatherService类**
```javascript
// 在 weather.js 中添加
async updateWeather() {
  // ... 现有代码 ...
  
  // 获取逐小时数据
  const hourlyData = await this.fetchHourlyForecast(locationId, '24h');
  
  // 存储到实例变量
  this.hourlyData = hourlyData.hourly;
  
  // 渲染温度曲线图
  this.renderHourlyChart();
}

renderHourlyChart() {
  if (!this.hourlyData || this.hourlyData.length === 0) return;
  
  const chartContainer = document.getElementById('hourly-chart');
  if (!chartContainer) return;
  
  // 初始化图表
  if (!this.temperatureChart) {
    this.temperatureChart = new HourlyTemperatureChart('hourly-chart', this.hourlyData);
  } else {
    this.temperatureChart.updateData(this.hourlyData);
  }
}
```

**步骤2：创建图表类**
```javascript
// 新建文件：js/hourly-chart.js
class HourlyTemperatureChart {
  constructor(containerId, hourlyData) {
    this.container = document.getElementById(containerId);
    this.data = hourlyData;
    this.initCanvas();
    this.setupMouseInteraction();
    this.draw();
  }
  
  // ... 实现细节见方案一 ...
}
```

**步骤3：添加事件处理**
```javascript
// 在 weather.js 的 init() 方法中添加
bindChartEvents() {
  const showBtn = document.getElementById('show-chart-btn');
  const closeBtn = document.getElementById('chart-close-btn');
  const container = document.getElementById('hourly-chart-container');
  
  showBtn?.addEventListener('click', () => {
    container.style.display = 'block';
    // 确保图表已初始化
    if (this.hourlyData) {
      this.renderHourlyChart();
    }
  });
  
  closeBtn?.addEventListener('click', () => {
    container.style.display = 'none';
  });
}
```

**步骤4：添加样式**
```css
/* 在 css/style.css 中添加 */
.hourly-chart-container {
  margin-top: 20px;
  padding: 15px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.chart-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  font-size: 16px;
  font-weight: bold;
}

.chart-close-btn {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: inherit;
}

.show-chart-btn {
  margin-top: 10px;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 5px;
  cursor: pointer;
  color: inherit;
  font-size: 14px;
}

.show-chart-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}
```

### 5.3 缓存策略

**建议缓存逐小时数据：**
- 缓存时间：30分钟（逐小时预报1小时更新一次）
- 缓存键：`hourly_forecast_${locationId}`
- 与现有天气数据缓存策略保持一致

```javascript
async fetchHourlyForecast(locationId, hours = '24h') {
  // 检查缓存
  const cacheKey = `hourly_forecast_${locationId}_${hours}`;
  const cached = await this.getCache(cacheKey);
  if (cached) {
    return cached;
  }
  
  // 获取新数据
  const hourlyUrl = `https://devapi.qweather.com/v7/weather/${hours}?location=${locationId}&key=${this.API_KEY}`;
  const hourlyData = await this.fetchWithTimeout(hourlyUrl);
  
  if (hourlyData.code !== '200') {
    throw new Error('获取逐小时预报信息失败');
  }
  
  const result = {
    updateTime: hourlyData.updateTime,
    hourly: hourlyData.hourly || []
  };
  
  // 缓存30分钟
  await this.setCache(cacheKey, result, 30 * 60 * 1000);
  
  return result;
}
```

### 5.4 错误处理

```javascript
async fetchHourlyForecast(locationId, hours = '24h') {
  try {
    // ... 请求代码 ...
  } catch (error) {
    console.error('Hourly forecast API request failed:', error);
    
    // 如果逐小时预报失败，不影响主天气显示
    // 返回空数组，图表不显示
    return {
      updateTime: new Date().toISOString(),
      hourly: []
    };
  }
}
```

---

## 六、费用分析

### 6.1 当前使用情况

**当前项目API调用：**
- 实时天气：`/v7/weather/now` - 每30分钟更新一次
- 3天预报：`/v7/weather/3d` - 每30分钟更新一次

**估算每日请求量：**
- 实时天气：48次/天（30分钟间隔）
- 3天预报：48次/天（30分钟间隔）
- **总计：96次/天 ≈ 2,880次/月**

### 6.2 增加逐小时预报后的费用

**新增API调用：**
- 逐小时预报：`/v7/weather/24h` - 每30分钟更新一次（与天气数据同步）

**新增请求量：**
- 逐小时预报：48次/天
- **新增月度请求量：1,440次/月**

**总请求量：**
- **总计：4,320次/月**

### 6.3 费用计算

**和风天气免费额度：**
- 每月前 **5万次请求** 完全免费

**费用分析：**
- 当前使用：2,880次/月 ✅ **免费**
- 增加逐小时预报后：4,320次/月 ✅ **仍然免费**

**结论：增加逐小时预报功能不会产生额外费用**

### 6.4 费用预警阈值

**建议监控：**
- 如果月度请求量接近 **40,000次**，需要关注配额使用情况
- 如果月度请求量超过 **50,000次**，超出部分按阶梯价格计费

**优化建议：**
1. 合理设置缓存时间（当前30分钟合理）
2. 用户手动刷新时才更新数据
3. 考虑使用更长的缓存时间（如1小时）

---

## 七、实施建议

### 7.1 开发优先级

**阶段一：基础功能（高优先级）**
1. ✅ 集成逐小时预报API
2. ✅ 实现Canvas温度曲线图
3. ✅ 添加基础交互（悬停显示信息）

**阶段二：体验优化（中优先级）**
1. 添加动画效果（数据点高亮、折线绘制动画）
2. 优化tooltip样式和位置
3. 添加时间轴标签
4. 响应式布局优化

**阶段三：功能增强（低优先级）**
1. 支持切换24h/72h/168h预报
2. 添加其他数据展示（湿度、降水概率等）
3. 支持多城市对比
4. 导出图表功能

### 7.2 技术要点

1. **Canvas像素比处理**
   ```javascript
   resizeCanvas() {
     const dpr = window.devicePixelRatio || 1;
     const rect = this.canvas.getBoundingClientRect();
     this.canvas.width = rect.width * dpr;
     this.canvas.height = rect.height * dpr;
     this.ctx.scale(dpr, dpr);
     this.canvas.style.width = rect.width + 'px';
     this.canvas.style.height = rect.height + 'px';
   }
   ```

2. **数据过滤**
   - 只显示未来24小时的数据
   - 过滤掉已过去的时间点

3. **性能优化**
   - 使用`requestAnimationFrame`优化重绘
   - 防抖处理鼠标移动事件
   - 避免频繁的Canvas重绘

4. **错误处理**
   - API失败时优雅降级（不显示图表）
   - 数据为空时显示提示信息

### 7.3 测试要点

1. **功能测试**
   - API调用是否正常
   - 图表是否正确渲染
   - 鼠标悬停是否正常
   - 数据更新是否及时

2. **兼容性测试**
   - 不同屏幕尺寸
   - 高DPI屏幕
   - 不同浏览器（Chrome、Edge等）

3. **性能测试**
   - 大量数据点时的渲染性能
   - 鼠标移动时的响应速度
   - 内存占用情况

---

## 八、总结

### 8.1 调研结论

1. ✅ **API可行性：** 和风天气提供完整的逐小时预报API，支持24h/72h/168h三种时间范围
2. ✅ **免费支持：** devapi免费版完全支持逐小时预报，每月5万次免费配额足够使用
3. ✅ **技术方案：** Canvas方案适合实现温度曲线图，性能优秀且无第三方依赖
4. ✅ **集成方案：** 可以无缝集成到现有天气模块，不影响现有功能
5. ✅ **费用分析：** 增加逐小时预报不会产生额外费用

### 8.2 推荐方案

**技术方案：**
- 使用 **Canvas** 实现温度曲线图
- 支持鼠标悬停显示详细信息
- 响应式布局，适配不同屏幕

**集成方案：**
- 在`WeatherService`类中添加`fetchHourlyForecast`方法
- 创建独立的`HourlyTemperatureChart`类
- 使用悬浮卡片方式展示图表

**实施步骤：**
1. 扩展WeatherService，添加逐小时预报API调用
2. 创建HourlyTemperatureChart类，实现Canvas绘制
3. 添加UI组件和事件处理
4. 添加样式和响应式支持
5. 测试和优化

### 8.3 后续优化方向

1. **功能增强**
   - 支持切换不同时间范围（24h/72h/168h）
   - 添加多数据维度展示（湿度、降水概率等）
   - 支持图表导出

2. **体验优化**
   - 添加平滑动画效果
   - 优化tooltip样式和交互
   - 支持触摸设备手势操作

3. **性能优化**
   - 使用Web Worker处理大量数据
   - 实现虚拟滚动（如果数据点很多）
   - 优化Canvas重绘策略

---

## 附录

### A. 参考文档

- [和风天气开发文档](https://dev.qweather.com/docs/)
- [逐小时天气预报API文档](https://dev.qweather.com/docs/api/weather/weather-hourly-forecast/)
- [和风天气定价页面](https://dev.qweather.com/price)
- [使用限制文档](https://dev.qweather.com/docs/terms/restriction/)

### B. 相关代码文件

- `js/weather.js` - 天气服务主文件
- `index.html` - 主页面结构
- `css/style.css` - 样式文件

### C. API测试示例

```javascript
// 测试API调用
const testAPI = async () => {
  const API_KEY = '95c944325dfa427d836b3a32875d1b77';
  const locationId = '101010100'; // 北京
  
  const url = `https://devapi.qweather.com/v7/weather/24h?location=${locationId}&key=${API_KEY}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log('逐小时预报数据：', data);
  } catch (error) {
    console.error('API调用失败：', error);
  }
};

testAPI();
```

---

**报告完成时间：** 2026年2月8日  
**报告版本：** v1.0  
**调研人员：** AI Assistant
