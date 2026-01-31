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
    "二月初二": "龙抬头",
    "五月初五": "端午节",
    "七月初七": "七夕节",
    "七月十五": "中元节",
    "八月十五": "中秋节",
    "九月初九": "重阳节",
    "腊月初八": "腊八节",
    "腊月廿三": "小年",
    "腊月三十": "除夕",
    "腊月廿九": "除夕"  // 小月时除夕是廿九
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
    "11-11": "双十一",
    "12-24": "平安夜",
    "12-25": "圣诞节"
};

// 月份中文名（用于构建节日查询键）
const MONTH_CHINESE = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];

class LunarCalendar {
    constructor() {
        // 检查 lunar-javascript 是否已加载
        this.isLibraryLoaded = typeof Solar !== 'undefined';
        if (!this.isLibraryLoaded) {
            console.error('lunar-javascript 库未加载，农历功能将使用备用方案');
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
        // 如果 lunar-javascript 库已加载，使用库进行转换
        if (this.isLibraryLoaded) {
            return this._solar2lunarWithLibrary(year, month, day);
        } else {
            // 备用方案：返回错误提示
            return this._getFallbackResult(year, month, day);
        }
    }

    /**
     * 使用 lunar-javascript 库进行转换
     * @private
     */
    _solar2lunarWithLibrary(year, month, day) {
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
            
            // 获取农历月和日用于查找节日
            const lunarMonth = Math.abs(lunar.getMonth());
            const lunarDay = lunar.getDay();
            
            // 构建农历日期字符串用于查找节日
            const monthChinese = MONTH_CHINESE[lunarMonth - 1];
            const lunarDateKey = `${monthChinese}月${dayStr}`;
            let festival = LUNAR_FESTIVALS[lunarDateKey] || '';
            
            // 如果没有农历节日，检查公历节日
            if (!festival) {
                const solarMonth = String(month).padStart(2, '0');
                const solarDay = String(day).padStart(2, '0');
                festival = SOLAR_FESTIVALS[`${solarMonth}-${solarDay}`] || '';
            }
            
            // 如果还没有节日，检查节气
            if (!festival) {
                const jieQi = lunar.getJieQi();
                if (jieQi) {
                    festival = jieQi;
                }
            }
            
            return {
                lunarYear: lunar.getYear(),
                lunarMonth: lunarMonth,
                lunarDay: lunarDay,
                isLeap: lunar.getMonth() < 0,  // 负数表示闰月
                ganZhi: ganZhi,
                zodiac: zodiac,
                monthStr: monthStr,
                dayStr: dayStr,
                festival: festival
            };
        } catch (error) {
            console.error('农历转换失败:', error);
            return this._getFallbackResult(year, month, day);
        }
    }

    /**
     * 获取备用结果（当库未加载或转换失败时）
     * @private
     */
    _getFallbackResult(year, month, day) {
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

    /**
     * 获取指定日期的节气
     * @param {number} year - 公历年份
     * @param {number} month - 公历月份 (1-12)
     * @param {number} day - 公历日期
     * @returns {string} 节气名称，如果当天不是节气则返回空字符串
     */
    getSolarTerm(year, month, day) {
        if (!this.isLibraryLoaded) {
            return '';
        }
        
        try {
            const solar = Solar.fromYmd(year, month, day);
            const lunar = solar.getLunar();
            return lunar.getJieQi() || '';
        } catch (error) {
            console.error('获取节气失败:', error);
            return '';
        }
    }

    /**
     * 获取指定日期的八字
     * @param {number} year - 公历年份
     * @param {number} month - 公历月份 (1-12)
     * @param {number} day - 公历日期
     * @param {number} hour - 小时 (0-23)
     * @returns {Object} 八字信息对象
     */
    getBaZi(year, month, day, hour = 0) {
        if (!this.isLibraryLoaded) {
            return { year: '', month: '', day: '', hour: '' };
        }
        
        try {
            const solar = Solar.fromYmdHms(year, month, day, hour, 0, 0);
            const lunar = solar.getLunar();
            const eightChar = lunar.getEightChar();
            
            return {
                year: eightChar.getYear(),
                month: eightChar.getMonth(),
                day: eightChar.getDay(),
                hour: eightChar.getTime()
            };
        } catch (error) {
            console.error('获取八字失败:', error);
            return { year: '', month: '', day: '', hour: '' };
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
        // 格式：农历乙巳年正月初三
        lunarElement.textContent = `农历${lunarDate.ganZhi}年${lunarDate.monthStr}月${lunarDate.dayStr}`;
    }

    // 更新节日显示
    const holidayElement = document.getElementById('holiday');
    if (holidayElement) {
        if (lunarDate.festival) {
            holidayElement.textContent = lunarDate.festival;
            holidayElement.style.display = 'block';
        } else {
            holidayElement.style.display = 'none';
        }
    }
    
    console.log('农历更新:', lunarDate);
}

// 每小时更新一次农历（实际上每天变化一次，但为了确保准确性）
setInterval(updateLunar, 60 * 60 * 1000);

// 延迟初始化，确保 DOM 和其他脚本已加载
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateLunar);
} else {
    // DOM 已加载完成，直接执行
    setTimeout(updateLunar, 100);
}
