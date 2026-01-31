// 使用全局变量
// import settingsManager from './settings.js';

class Clock {
    constructor() {
        this.timeElement = document.getElementById('time');
        this.dateElement = document.getElementById('date');
        this.updateInterval = null;
    }

    init() {
        if (window.settingsManager) {
            window.settingsManager.addChangeListener(settings => {
                this.updateDisplay();
            });
        }
        
        this.startClock();
    }

    startClock() {
        // 立即更新一次
        this.updateDisplay();
        
        // 设置更新间隔
        this.updateInterval = setInterval(() => {
            this.updateDisplay();
        }, 1000);
    }

    formatTime(date) {
        const settings = window.settingsManager.settings;
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();

        let timeString = '';

        // 处理小时
        if (settings.timeFormat === '12') {
            const hour12 = hours % 12 || 12;
            timeString = `${hour12.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            if (settings.showSeconds) {
                timeString += `:${seconds.toString().padStart(2, '0')}`;
            }
            timeString += hours >= 12 ? ' PM' : ' AM';
        } else {
            timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            if (settings.showSeconds) {
                timeString += `:${seconds.toString().padStart(2, '0')}`;
            }
        }

        return timeString;
    }

    formatDate(date) {
        const settings = window.settingsManager.settings;
        if (!settings.showDate) {
            return '';
        }

        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };

        return date.toLocaleDateString(settings.language === 'zh' ? 'zh-CN' : 'en-US', options);
    }

    updateDisplay() {
        const now = new Date();
        
        // 更新时间
        if (this.timeElement) {
            const timeString = this.formatTime(now);
            // 只有内容变化时才更新，避免不必要的重绘
            if (this.timeElement.textContent !== timeString) {
                this.timeElement.textContent = timeString;
            }
        }
        
        // 更新日期（只有日期变化时才更新，避免闪烁）
        if (this.dateElement) {
            const dateString = this.formatDate(now);
            if (dateString === '') {
                if (this.dateElement.style.display !== 'none') {
                    this.dateElement.style.display = 'none';
                }
            } else {
                if (this.dateElement.style.display === 'none') {
                    this.dateElement.style.display = 'flex';
                }
                // 只有内容变化时才更新，避免每秒闪烁
                if (this.dateElement.textContent !== dateString) {
                    this.dateElement.textContent = dateString;
                }
            }
        }
    }

    cleanup() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
    }
}

// 创建时钟实例
const clockManager = new Clock();
clockManager.init();

// 将时钟管理器设置为全局变量
window.clockManager = clockManager;

// 页面卸载时清理
window.addEventListener('unload', () => {
    clockManager.cleanup();
});
