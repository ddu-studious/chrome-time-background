/**
 * 节假日管理模块
 * 提供中国节假日和世界主要节日的显示功能
 */

class HolidayManager {
    constructor() {
        this.holidays = {
            // 固定节日 - 格式: 'MM-DD': { name: '节日名称', type: '节日类型' }
            '01-01': { name: '元旦', type: 'national' },
            '02-14': { name: '情人节', type: 'international' },
            '03-08': { name: '妇女节', type: 'international' },
            '03-12': { name: '植树节', type: 'national' },
            '04-01': { name: '愚人节', type: 'international' },
            '04-22': { name: '地球日', type: 'international' },
            '05-01': { name: '劳动节', type: 'national' },
            '05-04': { name: '青年节', type: 'national' },
            '06-01': { name: '儿童节', type: 'national' },
            '07-01': { name: '建党节', type: 'national' },
            '08-01': { name: '建军节', type: 'national' },
            '09-10': { name: '教师节', type: 'national' },
            '10-01': { name: '国庆节', type: 'national' },
            '10-31': { name: '万圣节', type: 'international' },
            '11-11': { name: '光棍节', type: 'modern' },
            '12-24': { name: '平安夜', type: 'international' },
            '12-25': { name: '圣诞节', type: 'international' },
            '12-31': { name: '除夕', type: 'international' }
        };
        
        // 农历节日数据将在初始化时加载
        this.lunarHolidays = {};
        this.holidayElement = null;
    }

    init() {
        // 创建节日显示元素
        this.createHolidayElement();
        
        // 加载农历节日数据
        this.loadLunarHolidays();
        
        // 设置更新间隔
        this.startHolidayCheck();
        
        // 监听设置变化
        window.settingsManager.addChangeListener(settings => {
            this.updateHolidayDisplay();
        });
    }

    createHolidayElement() {
        // 检查元素是否已存在
        this.holidayElement = document.getElementById('holiday-display');
        if (!this.holidayElement) {
            this.holidayElement = document.createElement('div');
            this.holidayElement.id = 'holiday-display';
            this.holidayElement.className = 'holiday-display';
            
            // 将元素添加到日期显示区域之后
            const dateElement = document.getElementById('date');
            if (dateElement && dateElement.parentNode) {
                dateElement.parentNode.insertBefore(this.holidayElement, dateElement.nextSibling);
            } else {
                // 如果找不到日期元素，则添加到容器中
                const container = document.querySelector('.container');
                if (container) {
                    container.appendChild(this.holidayElement);
                }
            }
        }
    }

    loadLunarHolidays() {
        // 农历节日 - 这些日期需要通过农历计算
        this.lunarHolidays = {
            '正月初一': { name: '春节', type: 'lunar' },
            '正月十五': { name: '元宵节', type: 'lunar' },
            '五月初五': { name: '端午节', type: 'lunar' },
            '七月初七': { name: '七夕节', type: 'lunar' },
            '八月十五': { name: '中秋节', type: 'lunar' },
            '九月初九': { name: '重阳节', type: 'lunar' }
        };
    }

    startHolidayCheck() {
        // 立即检查一次
        this.updateHolidayDisplay();
        
        // 每天凌晨更新一次
        setInterval(() => {
            const now = new Date();
            if (now.getHours() === 0 && now.getMinutes() === 0) {
                this.updateHolidayDisplay();
            }
        }, 60000); // 每分钟检查一次
    }

    getTodayHoliday() {
        const today = new Date();
        const month = (today.getMonth() + 1).toString().padStart(2, '0');
        const day = today.getDate().toString().padStart(2, '0');
        const dateKey = `${month}-${day}`;
        
        // 检查是否是公历节日
        if (this.holidays[dateKey]) {
            return this.holidays[dateKey];
        }
        
        // 检查是否是农历节日
        const lunarDate = this.getLunarDate(today);
        if (lunarDate && this.lunarHolidays[lunarDate]) {
            return this.lunarHolidays[lunarDate];
        }
        
        return null;
    }

    getLunarDate(date) {
        // 这里需要使用农历库计算农历日期
        // 如果已经引入了lunar.js，可以直接使用
        if (typeof calendar !== 'undefined' && calendar.solar2lunar) {
            try {
                const lunarInfo = calendar.solar2lunar(date.getFullYear(), date.getMonth() + 1, date.getDate());
                return `${lunarInfo.IMonthCn}${lunarInfo.IDayCn}`;
            } catch (error) {
                console.error('Error calculating lunar date:', error);
            }
        }
        return null;
    }

    updateHolidayDisplay() {
        if (!this.holidayElement) return;
        
        const settings = window.settingsManager.settings;
        
        // 检查是否启用了节假日显示
        if (!settings.showHolidays) {
            this.holidayElement.textContent = '';
            this.holidayElement.classList.remove('visible');
            return;
        }
        
        const holiday = this.getTodayHoliday();
        
        if (holiday) {
            const holidayName = holiday.name;
            
            // 设置节日显示内容
            this.holidayElement.textContent = holidayName;
            this.holidayElement.classList.add('visible');
            
            // 根据节日类型添加不同的样式
            this.holidayElement.className = 'holiday-display';
            this.holidayElement.classList.add(`holiday-${holiday.type}`);
            this.holidayElement.classList.add('visible');
        } else {
            // 如果今天没有节日，则隐藏显示
            this.holidayElement.textContent = '';
            this.holidayElement.classList.remove('visible');
        }
    }
}

// 创建并初始化节日管理器
const holidayManager = new HolidayManager();
window.holidayManager = holidayManager;
