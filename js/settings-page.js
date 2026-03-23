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

        const hash = location.hash.replace('#', '') || 'general';
        const navItem = document.querySelector(`.sp-nav-item[data-page="${hash}"]`);
        if (navItem) navItem.click();
    }

    loadSettings().then(bindEvents);
})();
