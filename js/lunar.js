// 农历年份数据
const lunarInfo = [
    0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0, 0x09ad0, 0x055d2,
    0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540, 0x0d6a0, 0x0ada2, 0x095b0, 0x14977,
    0x04970, 0x0a4b0, 0x0b4b5, 0x06a50, 0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970,
    0x06566, 0x0d4a0, 0x0ea50, 0x06e95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
    0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2, 0x0a950, 0x0b557
];

// 天干
const Gan = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
// 地支
const Zhi = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
// 生肖
const Animals = ["鼠", "牛", "虎", "兔", "龙", "蛇", "马", "羊", "猴", "鸡", "狗", "猪"];
// 农历月份
const lunarMonths = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
// 农历日期
const lunarDays = ["初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
    "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
    "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十"];

// 节气
const solarTerms = [
    "小寒", "大寒", "立春", "雨水", "惊蛰", "春分",
    "清明", "谷雨", "立夏", "小满", "芒种", "夏至",
    "小暑", "大暑", "立秋", "处暑", "白露", "秋分",
    "寒露", "霜降", "立冬", "小雪", "大雪", "冬至"
];

// 农历节日
const lunarFestivals = {
    "正月初一": "春节",
    "正月十五": "元宵节",
    "五月初五": "端午节",
    "七月初七": "七夕节",
    "八月十五": "中秋节",
    "九月初九": "重阳节",
    "腊月三十": "除夕"
};

// 公历节日
const solarFestivals = {
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
        this.lunarInfo = lunarInfo;
    }

    // 获取农历年的总天数
    getLunarYearDays(year) {
        let totalDays = 348;
        for (let i = 0x8000; i > 0x8; i >>= 1) {
            totalDays += (this.lunarInfo[year - 1900] & i) ? 1 : 0;
        }
        return totalDays + this.getLeapMonthDays(year);
    }

    // 获取农历闰月天数
    getLeapMonthDays(year) {
        if (this.getLeapMonth(year)) {
            return (this.lunarInfo[year - 1900] & 0x10000) ? 30 : 29;
        }
        return 0;
    }

    // 获取闰月月份，如果没有返回0
    getLeapMonth(year) {
        return this.lunarInfo[year - 1900] & 0xf;
    }

    // 获取农历月份的天数
    getLunarMonthDays(year, month) {
        return (this.lunarInfo[year - 1900] & (0x10000 >> month)) ? 30 : 29;
    }

    // 公历转农历
    solar2lunar(year, month, day) {
        let leap = 0;
        let temp = 0;
        let lunarYear, lunarMonth, lunarDay;
        let dateObj = new Date(year, month - 1, day);
        let offset = (Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()) - Date.UTC(1900, 0, 31)) / 86400000;

        for (lunarYear = 1900; lunarYear < 2050 && offset > 0; lunarYear++) {
            temp = this.getLunarYearDays(lunarYear);
            offset -= temp;
        }

        if (offset < 0) {
            offset += temp;
            lunarYear--;
        }

        let leapMonth = this.getLeapMonth(lunarYear);
        let isLeap = false;

        for (lunarMonth = 1; lunarMonth < 13 && offset > 0; lunarMonth++) {
            if (leapMonth > 0 && lunarMonth === (leapMonth + 1) && !isLeap) {
                --lunarMonth;
                isLeap = true;
                temp = this.getLeapMonthDays(lunarYear);
            } else {
                temp = this.getLunarMonthDays(lunarYear, lunarMonth);
            }

            if (isLeap && lunarMonth === (leapMonth + 1)) {
                isLeap = false;
            }
            offset -= temp;
        }

        if (offset === 0 && leapMonth > 0 && lunarMonth === leapMonth + 1) {
            if (isLeap) {
                isLeap = false;
            } else {
                isLeap = true;
                --lunarMonth;
            }
        }

        if (offset < 0) {
            offset += temp;
            --lunarMonth;
        }

        lunarDay = offset + 1;

        // 获取干支年
        const ganIndex = (lunarYear - 4) % 10;
        const zhiIndex = (lunarYear - 4) % 12;
        const animalIndex = (lunarYear - 4) % 12;

        // 获取节日信息
        const monthStr = lunarMonths[lunarMonth - 1];
        const dayStr = lunarDays[lunarDay - 1];
        const lunarDate = monthStr + "月" + dayStr;
        const festival = lunarFestivals[lunarDate] || "";

        // 获取公历节日
        const solarMonth = (month < 10 ? "0" + month : month);
        const solarDay = (day < 10 ? "0" + day : day);
        const solarFestival = solarFestivals[solarMonth + "-" + solarDay] || "";

        return {
            lunarYear: lunarYear,
            lunarMonth: lunarMonth,
            lunarDay: lunarDay,
            isLeap: isLeap,
            ganZhi: Gan[ganIndex] + Zhi[zhiIndex],
            zodiac: Animals[animalIndex],
            monthStr: monthStr,
            dayStr: dayStr,
            festival: festival || solarFestival
        };
    }
}

// 创建农历实例
const lunar = new LunarCalendar();

// 更新农历显示
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

// 每天更新一次农历
setInterval(updateLunar, 24 * 60 * 60 * 1000);
updateLunar(); // 初始化显示
