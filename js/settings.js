class SettingsManager {
    constructor() {
        this.defaults = {
            timeFormat: '24', // '12' or '24'
            temperatureUnit: 'C', // 'C' or 'F'
            backgroundInterval: 30, // minutes
            showSeconds: true,
            showWeather: true,
            showDate: true,
            showHolidays: true, // 显示节假日
            theme: 'auto', // 'light', 'dark', or 'auto'
            language: 'zh', // 'zh' or 'en'
            weatherCity: '', // 手动设置的城市名称（为空则自动定位）
            memos: [], // 备忘录数据
            memoCategories: ['工作', '生活', '学习', '其他'], // 备忘录分类
            tickerRefreshInterval: 20, // 热榜刷新间隔（分钟）
            // 每日任务设置
            dailyTaskSettings: {
                enableNotifications: true,      // 启用通知
                defaultReminderTime: '09:00',   // 默认提醒时间
                showOverdueFirst: true,         // 过期任务置顶
                reminderAdvanceMinutes: 30      // 提前提醒时间（分钟）
            },
            // v3.4.0: 性能与省电设置
            enableTicker: true,            // 热搜资讯
            enableMusic: true,             // 音乐播放器
            enableSystemMonitor: false,    // 系统监控（默认关闭，较耗资源）
            enableKeywordScan: false,      // 关键字扫描（默认关闭）
            enableWarmTip: true,           // 温情提示
            enableBilibili: true,          // 哔哩哔哩集成
            enableKnowledgeWall: true,     // 知识墙
            enableTaskTicker: true,        // 任务提醒滚动条
            systemMonitorInterval: 5,      // 系统监控采集间隔（分钟），默认5min比之前1min降80%
        };
        this.settings = { ...this.defaults };
        this.listeners = new Set();
    }

    async init() {
        await this.loadSettings();
        this.setupSettingsUI();
    }

    async loadSettings() {
        try {
            const stored = await new Promise(resolve => {
                chrome.storage.sync.get('settings', result => {
                    resolve(result.settings || {});
                });
            });
            this.settings = { ...this.defaults, ...stored };
            this.notifyListeners();
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    async saveSettings() {
        try {
            await new Promise(resolve => {
                chrome.storage.sync.set({ settings: this.settings }, resolve);
            });
            this.notifyListeners();
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    setupSettingsUI() {
        const settingsButton = document.getElementById('settings-dock-btn');
        if (!settingsButton) {
            const fb = document.createElement('button');
            fb.className = 'settings-button';
            fb.innerHTML = '<i class="fas fa-cog"></i>';
            document.body.appendChild(fb);
        }
        const btn = settingsButton || document.querySelector('.settings-button');

        btn.addEventListener('click', () => {
            window.open(chrome.runtime.getURL('settings.html'), '_blank');
        });

        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'sync' && changes.settings) {
                const newSettings = changes.settings.newValue;
                if (newSettings) {
                    this.settings = { ...this.defaults, ...newSettings };
                    this.notifyListeners();
                }
            }
        });
    }

    escapeAttr(str) {
        return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    addChangeListener(listener) {
        this.listeners.add(listener);
    }

    removeChangeListener(listener) {
        this.listeners.delete(listener);
    }

    notifyListeners() {
        this.listeners.forEach(listener => {
            try {
                listener(this.settings);
            } catch (error) {
                console.error('Error in settings listener:', error);
            }
        });
    }

    getSetting(key) {
        return this.settings[key];
    }

    async setSetting(key, value) {
        if (key in this.settings && this.settings[key] !== value) {
            this.settings[key] = value;
            await this.saveSettings();
        }
    }
}

// 将设置管理器设置为全局变量
window.settingsManager = new SettingsManager();
