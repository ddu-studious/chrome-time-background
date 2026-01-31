# 农历功能优化专项需求文档

## 概述

### 问题背景

当前农历模块 (`js/lunar.js`) 存在严重的计算错误：
- **现象**: 2026年1月31日显示 "农历己酉年九月十九"
- **实际**: 应该显示 "农历乙巳年正月初三"
- **根因**: `lunarInfo` 数据数组只包含 1900-1949 年的 50 条数据，无法支持 2000 年以后的日期计算

### 优化目标

1. 采用成熟的开源农历库替代自研算法
2. 支持更广泛的日期范围（至少 1900-2100 年）
3. 提供准确的干支纪年、生肖、农历月日
4. 支持节气和节假日显示

---

## 技术方案分析

### 方案对比

| 方案 | 优点 | 缺点 | 推荐度 |
|------|------|------|--------|
| **方案A: 使用 lunar-javascript 库** | 功能完整、支持范围广、无依赖、文档完善 | 需要引入新文件 | ⭐⭐⭐⭐⭐ |
| 方案B: 修复现有 lunarInfo 数据 | 改动小 | 需要维护大量数据、容易出错 | ⭐⭐ |
| 方案C: 使用在线 API | 无需本地计算 | 需要网络、有延迟、可能被限流 | ⭐ |

### 推荐方案: 使用 lunar-javascript 库

**lunar-javascript** (https://github.com/6tail/lunar-javascript) 是一款专业的中国历法库：

- **作者**: 6tail
- **许可证**: MIT
- **特点**: 
  - 无第三方依赖
  - 支持公历、农历、佛历、道历
  - 支持干支、生肖、节气、节日
  - 支持年份范围: 约 1900-2100 年
  - 文件大小: 约 80KB（压缩后约 30KB）

---

## 实现方案

### 1. 引入 lunar-javascript 库

#### 1.1 下载方式

```bash
# 方式1: 直接下载
curl -o js/lunar.min.js https://unpkg.com/lunar-javascript/lunar.min.js

# 方式2: NPM 下载后提取
npm install lunar-javascript
cp node_modules/lunar-javascript/lunar.min.js js/
```

#### 1.2 文件结构变更

```
js/
├── lunar.js           # 原有文件，保留作为包装器
├── lunar.min.js       # 新增: lunar-javascript 库
└── ...
```

### 2. 代码实现

#### 2.1 新的 lunar.js 包装器

```javascript
/**
 * 农历功能模块 (基于 lunar-javascript)
 * 版本: 2.0.0
 * 功能: 提供农历日期转换、干支纪年、生肖、节气等功能
 * 依赖: lunar-javascript (https://github.com/6tail/lunar-javascript)
 */

// 农历节日映射
const LUNAR_FESTIVALS = {
    "正月初一": "春节",
    "正月十五": "元宵节",
    "五月初五": "端午节",
    "七月初七": "七夕节",
    "八月十五": "中秋节",
    "九月初九": "重阳节",
    "腊月三十": "除夕",
    "腊月廿九": "除夕"  // 小月时
};

// 公历节日映射
const SOLAR_FESTIVALS = {
    "01-01": "元旦",
    "02-14": "情人节",
    "03-08": "妇女节",
    "03-12": "植树节",
    "04-01": "愚人节",
    "05-01": "劳动节",
    "05-04": "青年节",
    "06-01": "儿童节",
    "07-01": "建党节",
    "08-01": "建军节",
    "09-10": "教师节",
    "10-01": "国庆节",
    "12-24": "平安夜",
    "12-25": "圣诞节"
};

class LunarCalendar {
    constructor() {
        // 检查 lunar-javascript 是否已加载
        if (typeof Solar === 'undefined') {
            console.error('lunar-javascript 库未加载，农历功能将无法使用');
        }
    }

    /**
     * 公历转农历
     * @param {number} year - 公历年份
     * @param {number} month - 公历月份 (1-12)
     * @param {number} day - 公历日期
     * @returns {Object} 农历信息对象
     */
    solar2lunar(year, month, day) {
        try {
            // 使用 lunar-javascript 库进行转换
            const solar = Solar.fromYmd(year, month, day);
            const lunar = solar.getLunar();
            
            // 获取农历月份中文名
            const monthStr = lunar.getMonthInChinese();
            // 获取农历日期中文名
            const dayStr = lunar.getDayInChinese();
            
            // 获取干支年
            const ganZhi = lunar.getYearInGanZhi();
            // 获取生肖
            const zodiac = lunar.getYearShengXiao();
            
            // 构建农历日期字符串用于查找节日
            const lunarDateKey = `${monthStr}月${dayStr}`;
            const festival = LUNAR_FESTIVALS[lunarDateKey] || '';
            
            // 获取公历节日
            const solarMonth = String(month).padStart(2, '0');
            const solarDay = String(day).padStart(2, '0');
            const solarFestival = SOLAR_FESTIVALS[`${solarMonth}-${solarDay}`] || '';
            
            // 获取节气
            const jieQi = lunar.getJieQi() || '';
            
            return {
                lunarYear: lunar.getYear(),
                lunarMonth: lunar.getMonth(),
                lunarDay: lunar.getDay(),
                isLeap: lunar.getMonth() < 0,  // 负数表示闰月
                ganZhi: ganZhi,
                zodiac: zodiac,
                monthStr: monthStr,
                dayStr: dayStr,
                festival: festival || solarFestival || jieQi
            };
        } catch (error) {
            console.error('农历转换失败:', error);
            // 返回错误时的默认值
            return {
                lunarYear: year,
                lunarMonth: month,
                lunarDay: day,
                isLeap: false,
                ganZhi: '未知',
                zodiac: '未知',
                monthStr: '正',
                dayStr: '初一',
                festival: ''
            };
        }
    }
}

// 创建农历实例
const lunar = new LunarCalendar();

/**
 * 更新农历显示
 */
function updateLunar() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    const lunarDate = lunar.solar2lunar(year, month, day);
    
    // 更新农历显示
    const lunarElement = document.getElementById('lunar');
    if (lunarElement) {
        lunarElement.textContent = `农历${lunarDate.ganZhi}年${lunarDate.monthStr}月${lunarDate.dayStr}`;
    }

    // 更新节日显示
    const holidayElement = document.getElementById('holiday');
    if (holidayElement && lunarDate.festival) {
        holidayElement.textContent = lunarDate.festival;
        holidayElement.style.display = 'block';
    } else if (holidayElement) {
        holidayElement.style.display = 'none';
    }
}

// 每小时更新一次农历（实际上每天变化一次，但为了确保准确性）
setInterval(updateLunar, 60 * 60 * 1000);
updateLunar(); // 初始化显示
```

### 3. HTML 文件修改

```html
<!-- 在 index.html 中，先加载 lunar-javascript，再加载 lunar.js -->
<script src="js/lunar.min.js"></script>
<script src="js/lunar.js"></script>
```

---

## 验证测试

### 测试用例

| 公历日期 | 预期农历 | 干支年 | 生肖 |
|----------|----------|--------|------|
| 2026-01-31 | 正月初三 | 乙巳 | 蛇 |
| 2026-01-29 | 正月初一 | 乙巳 | 蛇 |
| 2025-01-29 | 正月初一 | 乙巳 | 蛇 |
| 2024-02-10 | 正月初一 | 甲辰 | 龙 |
| 2023-01-22 | 正月初一 | 癸卯 | 兔 |

### 节日测试

| 日期 | 预期节日 |
|------|----------|
| 春节当天 | 春节 |
| 正月十五 | 元宵节 |
| 五月初五 | 端午节 |
| 八月十五 | 中秋节 |
| 01-01 | 元旦 |
| 10-01 | 国庆节 |

---

## 实施步骤

### Phase 1: 准备工作
- [x] 分析现有代码问题
- [x] 调研并选择农历库
- [x] 编写技术方案文档

### Phase 2: 代码实现
- [ ] 下载 lunar-javascript 库到项目
- [ ] 重写 lunar.js 包装器
- [ ] 修改 index.html 加载顺序
- [ ] 本地测试验证

### Phase 3: 测试与发布
- [ ] 完成所有测试用例
- [ ] 更新 CHANGELOG.md
- [ ] 发布新版本

---

## 参考资料

- [lunar-javascript GitHub](https://github.com/6tail/lunar-javascript)
- [lunar-javascript API 文档](https://6tail.cn/calendar/api.html)
- [中国农历算法原理](https://zh.wikipedia.org/wiki/农历)

---

**文档版本**: 1.0.0  
**创建日期**: 2026-01-31  
**最后更新**: 2026-01-31
