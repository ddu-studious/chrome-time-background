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
            // 每日任务设置
            dailyTaskSettings: {
                enableNotifications: true,      // 启用通知
                defaultReminderTime: '09:00',   // 默认提醒时间
                showOverdueFirst: true,         // 过期任务置顶
                reminderAdvanceMinutes: 30      // 提前提醒时间（分钟）
            }
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
        // 创建设置按钮
        const settingsButton = document.createElement('button');
        settingsButton.className = 'settings-button';
        settingsButton.innerHTML = '<i class="fas fa-cog"></i>';
        document.body.appendChild(settingsButton);

        // 创建设置面板
        const settingsPanel = document.createElement('div');
        settingsPanel.className = 'settings-panel';
        settingsPanel.innerHTML = this.generateSettingsHTML();
        document.body.appendChild(settingsPanel);

        // 添加事件监听
        settingsButton.addEventListener('click', () => {
            settingsPanel.classList.toggle('visible');
        });

        // 关闭按钮
        const closeButton = settingsPanel.querySelector('.close-button');
        closeButton.addEventListener('click', () => {
            settingsPanel.classList.remove('visible');
        });

        // 设置项变更监听
        settingsPanel.addEventListener('change', async (e) => {
            const target = e.target;
            if (target.name && target.name in this.settings) {
                if (target.type === 'checkbox') {
                    this.settings[target.name] = target.checked;
                } else {
                    this.settings[target.name] = target.value;
                }
                await this.saveSettings();
            }
        });

        // 文本输入框在失焦时保存（避免每次按键都保存）
        settingsPanel.querySelectorAll('input[type="text"]').forEach(input => {
            input.addEventListener('blur', async (e) => {
                const target = e.target;
                if (target.name && target.name in this.settings && this.settings[target.name] !== target.value) {
                    this.settings[target.name] = target.value.trim();
                    await this.saveSettings();
                }
            });
            // 回车键也触发保存
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.target.blur();
                }
            });
        });
    }

    generateSettingsHTML() {
        return `
            <div class="settings-header">
                <h2>设置</h2>
                <button class="close-button">&times;</button>
            </div>
            <div class="settings-content">
                <div class="settings-group">
                    <h3>时间显示</h3>
                    <div class="setting-item">
                        <label>
                            时间格式
                            <select name="timeFormat">
                                <option value="12" ${this.settings.timeFormat === '12' ? 'selected' : ''}>12小时制</option>
                                <option value="24" ${this.settings.timeFormat === '24' ? 'selected' : ''}>24小时制</option>
                            </select>
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>
                            <input type="checkbox" name="showSeconds" ${this.settings.showSeconds ? 'checked' : ''}>
                            显示秒数
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>
                            <input type="checkbox" name="showDate" ${this.settings.showDate ? 'checked' : ''}>
                            显示日期
                        </label>
                    </div>
                </div>

                <div class="settings-group">
                    <h3>天气设置</h3>
                    <div class="setting-item">
                        <label>
                            <input type="checkbox" name="showWeather" ${this.settings.showWeather ? 'checked' : ''}>
                            显示天气
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>
                            温度单位
                            <select name="temperatureUnit">
                                <option value="C" ${this.settings.temperatureUnit === 'C' ? 'selected' : ''}>摄氏度 (°C)</option>
                                <option value="F" ${this.settings.temperatureUnit === 'F' ? 'selected' : ''}>华氏度 (°F)</option>
                            </select>
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>
                            手动设置城市
                            <input type="text" name="weatherCity" value="${this.escapeAttr(this.settings.weatherCity || '')}" placeholder="留空则自动定位" class="settings-input">
                        </label>
                        <p class="setting-hint">无法自动定位时，可手动输入城市名（如：北京、上海）</p>
                    </div>
                </div>

                <div class="settings-group">
                    <h3>背景设置</h3>
                    <div class="setting-item">
                        <label>
                            背景切换间隔
                            <select name="backgroundInterval">
                                <option value="5" ${this.settings.backgroundInterval === 5 ? 'selected' : ''}>5分钟</option>
                                <option value="15" ${this.settings.backgroundInterval === 15 ? 'selected' : ''}>15分钟</option>
                                <option value="30" ${this.settings.backgroundInterval === 30 ? 'selected' : ''}>30分钟</option>
                                <option value="60" ${this.settings.backgroundInterval === 60 ? 'selected' : ''}>1小时</option>
                            </select>
                        </label>
                    </div>
                </div>

                <div class="settings-group">
                    <h3>节假日设置</h3>
                    <div class="setting-item">
                        <label>
                            <input type="checkbox" name="showHolidays" ${this.settings.showHolidays ? 'checked' : ''}>
                            显示节假日
                        </label>
                    </div>
                </div>

                <div class="settings-group">
                    <h3>界面设置</h3>
                    <div class="setting-item">
                        <label>
                            主题
                            <select name="theme">
                                <option value="auto" ${this.settings.theme === 'auto' ? 'selected' : ''}>自动</option>
                                <option value="light" ${this.settings.theme === 'light' ? 'selected' : ''}>浅色</option>
                                <option value="dark" ${this.settings.theme === 'dark' ? 'selected' : ''}>深色</option>
                            </select>
                        </label>
                    </div>
                    <div class="setting-item">
                        <label>
                            语言
                            <select name="language">
                                <option value="zh" ${this.settings.language === 'zh' ? 'selected' : ''}>中文</option>
                                <option value="en" ${this.settings.language === 'en' ? 'selected' : ''}>English</option>
                            </select>
                        </label>
                    </div>
                </div>
            </div>
        `;
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
