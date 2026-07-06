(function () {
    'use strict';

    const defaults = {
        timeFormat: '24',
        temperatureUnit: 'C',
        backgroundInterval: 30,
        showSeconds: true,
        showWeather: true,
        showDate: true,
        showHolidays: true,
        theme: 'auto',
        language: 'zh',
        weatherCity: '',
        tickerRefreshInterval: 20,
        enableTicker: true,
        enableMusic: true,
        enableBilibili: true,
        enableSystemMonitor: false,
        enableKeywordScan: false,
        enableWarmTip: true,
        enableKnowledgeWall: true,
        enableTaskTicker: true,
        systemMonitorInterval: 5,
        enableSchedule: true,
        enableWorklog: true,
        worklogReminderEnabled: true,
        worklogReminderTime: '18:00',
    };

    let settings = { ...defaults };

    async function loadSettings() {
        if (typeof chrome !== 'undefined' && chrome.storage) {
            try {
                const stored = await chrome.storage.sync.get('settings');
                settings = { ...defaults, ...(stored.settings || {}) };
            } catch { /* fallback to defaults */ }
        }
        applyToUI();
    }

    async function saveSetting(key, value) {
        settings[key] = value;
        if (typeof chrome !== 'undefined' && chrome.storage) {
            try {
                await chrome.storage.sync.set({ settings });
            } catch (e) {
                console.error('保存设置失败:', e);
            }
        }
    }

    function applyToUI() {
        for (const [key, value] of Object.entries(settings)) {
            const el = document.getElementById(`set-${key}`);
            if (!el) continue;

            if (el.type === 'checkbox') {
                el.checked = !!value;
            } else if (el.tagName === 'SELECT') {
                el.value = String(value);
            } else if (el.type === 'number') {
                el.value = value;
            } else {
                el.value = value || '';
            }
        }

        let ver = '3.8.0';
        if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
            ver = chrome.runtime.getManifest().version;
        }
        const verEl = document.getElementById('sp-version');
        const aboutVerEl = document.getElementById('sp-about-version');
        if (verEl) verEl.textContent = `v${ver}`;
        if (aboutVerEl) aboutVerEl.textContent = `版本 ${ver}`;
    }

    function bindEvents() {
        document.querySelectorAll('.sp-toggle input, .sp-select').forEach(el => {
            el.addEventListener('change', () => {
                const key = el.name;
                if (!key) return;
                const value = el.type === 'checkbox' ? el.checked : el.value;
                saveSetting(key, value);
            });
        });

        document.querySelectorAll('.sp-input').forEach(el => {
            const save = () => {
                const key = el.name;
                if (!key) return;
                let value = el.value.trim();
                if (el.type === 'number') {
                    const min = parseFloat(el.min) || 0;
                    const max = parseFloat(el.max) || Infinity;
                    let num = parseFloat(value);
                    if (isNaN(num)) num = parseFloat(el.placeholder) || min;
                    num = Math.max(min, Math.min(max, num));
                    el.value = num;
                    value = num;
                }
                saveSetting(key, value);
            };
            el.addEventListener('blur', save);
            el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.blur(); });
        });

        document.querySelectorAll('.sp-nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                if (!page) return;

                document.querySelectorAll('.sp-nav-item').forEach(n => n.classList.remove('active'));
                item.classList.add('active');

                document.querySelectorAll('.sp-page').forEach(p => p.classList.remove('active'));
                const target = document.getElementById(`page-${page}`);
                if (target) target.classList.add('active');

                history.replaceState(null, '', `#${page}`);
            });
        });

        const hash = location.hash.replace('#', '') || 'time';
        const navItem = document.querySelector(`.sp-nav-item[data-page="${hash}"]`);
        if (navItem) navItem.click();
    }

    // ==================== 背景 Provider 设置 (v3.16.0) ====================

    const BG_PROVIDER_DEFAULTS = {
        enabledSources: ['wikimedia', 'bing'],
        apiKeys: { unsplash: '', pexels: '', pixabay: '', wallhaven: '', coverr: '', nasa: '' },
        enableVideoBackground: false,
        settingsPageBackground: false,
    };

    let bgProviderSettings = { ...BG_PROVIDER_DEFAULTS, apiKeys: { ...BG_PROVIDER_DEFAULTS.apiKeys } };

    async function loadBgProviderSettings() {
        try {
            const { backgroundProviderSettings } = await chrome.storage.sync.get('backgroundProviderSettings');
            bgProviderSettings = {
                ...BG_PROVIDER_DEFAULTS,
                ...(backgroundProviderSettings || {}),
                apiKeys: { ...BG_PROVIDER_DEFAULTS.apiKeys, ...((backgroundProviderSettings || {}).apiKeys || {}) },
            };
        } catch { /* defaults */ }
        applyBgProviderUI();
    }

    async function saveBgProviderSettings() {
        try {
            await chrome.storage.sync.set({ backgroundProviderSettings: bgProviderSettings });
        } catch (e) {
            console.error('保存背景设置失败:', e);
        }
    }

    function applyBgProviderUI() {
        const videoEl = document.getElementById('set-bgEnableVideo');
        if (videoEl) videoEl.checked = !!bgProviderSettings.enableVideoBackground;

        const settingsBgEl = document.getElementById('set-bgSettingsPage');
        if (settingsBgEl) settingsBgEl.checked = !!bgProviderSettings.settingsPageBackground;

        document.querySelectorAll('.bg-source-toggle').forEach(toggle => {
            const src = toggle.dataset.source;
            toggle.checked = bgProviderSettings.enabledSources.includes(src);
            const keyField = document.querySelector(`.sp-bg-key-field[data-for="${src}"]`);
            if (keyField) keyField.style.display = toggle.checked ? '' : 'none';
        });

        document.querySelectorAll('.bg-api-key').forEach(input => {
            const src = input.dataset.source;
            input.value = bgProviderSettings.apiKeys[src] || '';
        });

        if (bgProviderSettings.settingsPageBackground) {
            applySettingsPageBackground();
        }
    }

    function bindBgProviderEvents() {
        const videoEl = document.getElementById('set-bgEnableVideo');
        if (videoEl) {
            videoEl.addEventListener('change', () => {
                bgProviderSettings.enableVideoBackground = videoEl.checked;
                saveBgProviderSettings();
            });
        }

        const settingsBgEl = document.getElementById('set-bgSettingsPage');
        if (settingsBgEl) {
            settingsBgEl.addEventListener('change', () => {
                bgProviderSettings.settingsPageBackground = settingsBgEl.checked;
                saveBgProviderSettings();
                if (settingsBgEl.checked) {
                    applySettingsPageBackground();
                } else {
                    removeSettingsPageBackground();
                }
            });
        }

        document.querySelectorAll('.bg-source-toggle').forEach(toggle => {
            toggle.addEventListener('change', () => {
                const src = toggle.dataset.source;
                const set = new Set(bgProviderSettings.enabledSources);
                if (toggle.checked) set.add(src); else set.delete(src);
                bgProviderSettings.enabledSources = [...set];
                saveBgProviderSettings();
                const keyField = document.querySelector(`.sp-bg-key-field[data-for="${src}"]`);
                if (keyField) keyField.style.display = toggle.checked ? '' : 'none';
            });
        });

        document.querySelectorAll('.bg-api-key').forEach(input => {
            const save = () => {
                const src = input.dataset.source;
                bgProviderSettings.apiKeys[src] = input.value.trim();
                saveBgProviderSettings();
            };
            input.addEventListener('blur', save);
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
        });
    }

    async function applySettingsPageBackground() {
        try {
            const response = await new Promise(resolve => {
                chrome.runtime.sendMessage({ action: 'getBackgrounds' }, resolve);
            });
            if (response?.backgrounds?.length) {
                const bg = response.backgrounds[Math.floor(Math.random() * response.backgrounds.length)];
                if (bg.url) {
                    document.body.style.backgroundImage = `url(${bg.url})`;
                    document.body.style.backgroundSize = 'cover';
                    document.body.style.backgroundPosition = 'center';
                    document.body.classList.add('sp-has-bg');
                }
            }
        } catch { /* ignore */ }
    }

    function removeSettingsPageBackground() {
        document.body.style.backgroundImage = '';
        document.body.classList.remove('sp-has-bg');
    }

    function bindGuideEvents() {
        document.querySelectorAll('.sp-guide-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.sp-guide-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.sp-guide-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const panel = document.getElementById('sp-gtab-' + tab.dataset.gtab);
                if (panel) panel.classList.add('active');
            });
        });
        document.querySelectorAll('.sp-guide-ic').forEach(card => {
            card.addEventListener('click', () => card.classList.toggle('open'));
        });
    }

    loadSettings().then(() => {
        bindEvents();
        bindGuideEvents();
        loadBgProviderSettings().then(bindBgProviderEvents);
    });
})();
