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
        enableYouTube: true,
        enableHuya: true,
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

        document.querySelectorAll('.sp-sidebar:not([data-v5-ready]) .sp-nav-item').forEach(item => {
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

        if (!document.querySelector('.sp-sidebar[data-v5-ready]')) {
            const hash = location.hash.replace('#', '') || 'time';
            const navItem = document.querySelector(`.sp-nav-item[data-page="${hash}"]`);
            if (navItem) navItem.click();
        }
    }

    // ==================== 背景 Provider 设置 (v3.16.0) ====================

    const BG_PROVIDER_DEFAULTS = {
        enabledSources: ['wikimedia', 'bing'],
        apiKeys: { unsplash: '', pexels: '', pixabay: '', wallhaven: '', coverr: '', nasa: '' },
        mediaMode: 'image',
        enableVideoBackground: false,
        settingsPageBackground: false,
    };

    let bgProviderSettings = { ...BG_PROVIDER_DEFAULTS, apiKeys: { ...BG_PROVIDER_DEFAULTS.apiKeys } };

    const BG_EXPERIENCE_DEFAULTS = {
        enabled: true,
        visualEffect: 'depth',
        intensity: 65,
        playgroundEnabled: true,
        soundEnabled: false,
        autoCalmSeconds: 12,
        wallpaperTransition: 'on',
        wallpaperTransitionStyle: 'random',
        clockLiquid: true,
        taskCrumple: true,
        jellyfishTasks: true,
        jellyfishNight: true,
        jellyfishDance: true,
        jellyfishGrow: true,
        pomodoroJelly: true,
        aquariumFish: true,
        aquariumWater: true,
        aquariumRealistic: true,
    };
    const BG_VISUAL_EFFECTS = new Set(['none', 'depth', 'weather', 'memory', 'liquid', 'time', 'jellyfish']);
    let bgExperienceSettings = { ...BG_EXPERIENCE_DEFAULTS };
    // 转场风格的注册表（id、名称）在 wallpaper-weave-core.js，设置页只读它来生成下拉选项，避免两处各写一份名单。
    const weaveCore = window.WallpaperWeaveCore || null;

    function renderTransitionOptions() {
        const select = document.getElementById('set-bgWallpaperTransition');
        if (!select) return;
        if (!weaveCore) { select.disabled = true; return; }
        const options = [['random', '每次随机（推荐）'], ...weaveCore.STYLES.map(style => [style.id, style.label]), ['none', '直接切换（不播放转场）']];
        select.replaceChildren(...options.map(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            return option;
        }));
    }

    function normalizeBgExperienceSettings(value) {
        const stored = value && typeof value === 'object' ? value : {};
        return {
            enabled: stored.enabled !== false,
            visualEffect: BG_VISUAL_EFFECTS.has(stored.visualEffect) ? stored.visualEffect : BG_EXPERIENCE_DEFAULTS.visualEffect,
            intensity: Math.max(10, Math.min(100, Number(stored.intensity) || BG_EXPERIENCE_DEFAULTS.intensity)),
            playgroundEnabled: stored.playgroundEnabled !== false,
            soundEnabled: stored.soundEnabled === true,
            autoCalmSeconds: [0, 8, 12, 20].includes(Number(stored.autoCalmSeconds))
                ? Number(stored.autoCalmSeconds)
                : BG_EXPERIENCE_DEFAULTS.autoCalmSeconds,
            wallpaperTransition: stored.wallpaperTransition === 'none' ? 'none' : BG_EXPERIENCE_DEFAULTS.wallpaperTransition,
            wallpaperTransitionStyle: typeof stored.wallpaperTransitionStyle === 'string' && /^[a-z]{1,16}$/.test(stored.wallpaperTransitionStyle)
                ? stored.wallpaperTransitionStyle
                : BG_EXPERIENCE_DEFAULTS.wallpaperTransitionStyle,
            clockLiquid: stored.clockLiquid !== false,
            taskCrumple: stored.taskCrumple !== false,
            jellyfishTasks: stored.jellyfishTasks !== false,
            jellyfishNight: stored.jellyfishNight !== false,
            jellyfishDance: stored.jellyfishDance !== false,
            jellyfishGrow: stored.jellyfishGrow !== false,
            pomodoroJelly: stored.pomodoroJelly !== false,
            aquariumFish: stored.aquariumFish !== false,
            aquariumWater: stored.aquariumWater !== false,
            aquariumRealistic: stored.aquariumRealistic !== false,
        };
    }

    async function loadBgExperienceSettings() {
        try {
            const result = await chrome.storage.sync.get('backgroundExperienceSettings');
            bgExperienceSettings = normalizeBgExperienceSettings(result.backgroundExperienceSettings);
        } catch {
            bgExperienceSettings = { ...BG_EXPERIENCE_DEFAULTS };
        }
        applyBgExperienceUI();
    }

    async function saveBgExperienceSettings() {
        try {
            await chrome.storage.sync.set({ backgroundExperienceSettings: bgExperienceSettings });
        } catch (error) {
            console.error('保存背景体验设置失败:', error);
        }
    }

    function applyBgExperienceUI() {
        renderTransitionOptions();
        const enabled = document.getElementById('set-bgExperienceEnabled');
        const visual = document.getElementById('set-bgVisualEffect');
        const intensity = document.getElementById('set-bgEffectIntensity');
        const intensityOutput = document.getElementById('set-bgEffectIntensityOutput');
        const playground = document.getElementById('set-bgPlaygroundEnabled');
        const sound = document.getElementById('set-bgExperienceSound');
        const autoCalm = document.getElementById('set-bgAutoCalmSeconds');
        if (enabled) enabled.checked = bgExperienceSettings.enabled;
        if (visual) visual.value = bgExperienceSettings.visualEffect;
        if (intensity) intensity.value = String(bgExperienceSettings.intensity);
        if (intensityOutput) intensityOutput.value = `${bgExperienceSettings.intensity}%`;
        if (playground) playground.checked = bgExperienceSettings.playgroundEnabled;
        if (sound) sound.checked = bgExperienceSettings.soundEnabled;
        if (autoCalm) autoCalm.value = String(bgExperienceSettings.autoCalmSeconds);
        const transition = document.getElementById('set-bgWallpaperTransition');
        const clockLiquid = document.getElementById('set-bgClockLiquid');
        const taskCrumple = document.getElementById('set-bgTaskCrumple');
        const jellyfishTasks = document.getElementById('set-bgJellyfishTasks');
        const jellyfishNight = document.getElementById('set-bgJellyfishNight');
        const jellyfishDance = document.getElementById('set-bgJellyfishDance');
        const jellyfishGrow = document.getElementById('set-bgJellyfishGrow');
        const pomodoroJelly = document.getElementById('set-bgPomodoroJelly');
        const aquariumFish = document.getElementById('set-bgAquariumFish');
        const aquariumWater = document.getElementById('set-bgAquariumWater');
        const aquariumRealistic = document.getElementById('set-bgAquariumRealistic');
        // 一个下拉框对应两个字段：none（直接切换）/ random（每次随机）/ 某一种风格。选项来自转场模块的注册表，见 renderTransitionOptions。
        if (transition) transition.value = weaveCore ? weaveCore.choiceFromSettings(bgExperienceSettings) : 'random';
        if (clockLiquid) clockLiquid.checked = bgExperienceSettings.clockLiquid;
        if (taskCrumple) taskCrumple.checked = bgExperienceSettings.taskCrumple;
        if (jellyfishTasks) jellyfishTasks.checked = bgExperienceSettings.jellyfishTasks;
        if (jellyfishNight) jellyfishNight.checked = bgExperienceSettings.jellyfishNight;
        if (jellyfishDance) jellyfishDance.checked = bgExperienceSettings.jellyfishDance;
        if (jellyfishGrow) jellyfishGrow.checked = bgExperienceSettings.jellyfishGrow;
        if (pomodoroJelly) pomodoroJelly.checked = bgExperienceSettings.pomodoroJelly;
        if (aquariumFish) aquariumFish.checked = bgExperienceSettings.aquariumFish;
        if (aquariumWater) aquariumWater.checked = bgExperienceSettings.aquariumWater;
        if (aquariumRealistic) aquariumRealistic.checked = bgExperienceSettings.aquariumRealistic;
    }

    function bindBgExperienceEvents() {
        const bindings = [
            ['set-bgExperienceEnabled', 'enabled', element => element.checked],
            ['set-bgVisualEffect', 'visualEffect', element => element.value],
            ['set-bgPlaygroundEnabled', 'playgroundEnabled', element => element.checked],
            ['set-bgExperienceSound', 'soundEnabled', element => element.checked],
            ['set-bgAutoCalmSeconds', 'autoCalmSeconds', element => Number(element.value)],
            ['set-bgClockLiquid', 'clockLiquid', element => element.checked],
            ['set-bgTaskCrumple', 'taskCrumple', element => element.checked],
            ['set-bgJellyfishTasks', 'jellyfishTasks', element => element.checked],
            ['set-bgJellyfishNight', 'jellyfishNight', element => element.checked],
            ['set-bgJellyfishDance', 'jellyfishDance', element => element.checked],
            ['set-bgJellyfishGrow', 'jellyfishGrow', element => element.checked],
            ['set-bgPomodoroJelly', 'pomodoroJelly', element => element.checked],
            ['set-bgAquariumFish', 'aquariumFish', element => element.checked],
            ['set-bgAquariumWater', 'aquariumWater', element => element.checked],
            ['set-bgAquariumRealistic', 'aquariumRealistic', element => element.checked],
        ];
        for (const [id, key, read] of bindings) {
            const element = document.getElementById(id);
            element?.addEventListener('change', () => {
                bgExperienceSettings[key] = read(element);
                saveBgExperienceSettings();
            });
        }
        const transition = document.getElementById('set-bgWallpaperTransition');
        transition?.addEventListener('change', () => {
            if (!weaveCore) return;
            Object.assign(bgExperienceSettings, weaveCore.settingsFromChoice(transition.value));
            saveBgExperienceSettings();
        });
        const intensity = document.getElementById('set-bgEffectIntensity');
        const output = document.getElementById('set-bgEffectIntensityOutput');
        intensity?.addEventListener('input', () => {
            bgExperienceSettings.intensity = Math.max(10, Math.min(100, Number(intensity.value) || 65));
            if (output) output.value = `${bgExperienceSettings.intensity}%`;
        });
        intensity?.addEventListener('change', saveBgExperienceSettings);
    }

    // ====== 水母关怀（喝水 / 起身活动提醒）======
    // 配置与计数由后台（js/jelly-nudge.js）拥有；这里只经扩展消息读写，页面不直接写存储，也不自己建闹钟。
    const NUDGE_IDS = ['set-nudgeWater', 'set-nudgeWaterEvery', 'set-nudgeStretch', 'set-nudgeStretchEvery', 'set-nudgeFrom', 'set-nudgeTo', 'set-nudgeWeekdays'];
    let nudgeChain = Promise.resolve();

    function nudgeRequest(message, timeoutMs = 5000) {
        return new Promise((resolve, reject) => {
            if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) { reject(new Error('当前页面无法连接扩展后台')); return; }
            let settled = false;
            const timer = setTimeout(() => { if (!settled) { settled = true; reject(new Error('后台没有响应')); } }, timeoutMs);
            try {
                chrome.runtime.sendMessage(message, response => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    const error = chrome.runtime.lastError;
                    if (error) reject(new Error(error.message || '后台没有响应'));
                    else if (!response?.ok) reject(new Error(response?.error || '后台没有响应'));
                    else resolve(response);
                });
            } catch (error) {
                settled = true;
                clearTimeout(timer);
                reject(error);
            }
        });
    }

    function setNudgeStatus(text) {
        const status = document.getElementById('set-nudgeStatus');
        if (status) status.textContent = text || '';
    }

    function readNudgeConfig() {
        const value = id => document.getElementById(id);
        return {
            water: { on: !!value('set-nudgeWater')?.checked, everyMin: Number(value('set-nudgeWaterEvery')?.value) },
            stretch: { on: !!value('set-nudgeStretch')?.checked, everyMin: Number(value('set-nudgeStretchEvery')?.value) },
            from: value('set-nudgeFrom')?.value || '',
            to: value('set-nudgeTo')?.value || '',
            weekdaysOnly: !!value('set-nudgeWeekdays')?.checked,
        };
    }

    function applyNudgeUI(result) {
        const { config, stats } = result;
        const value = id => document.getElementById(id);
        if (value('set-nudgeWater')) value('set-nudgeWater').checked = config.water.on;
        if (value('set-nudgeWaterEvery')) value('set-nudgeWaterEvery').value = String(config.water.everyMin);
        if (value('set-nudgeStretch')) value('set-nudgeStretch').checked = config.stretch.on;
        if (value('set-nudgeStretchEvery')) value('set-nudgeStretchEvery').value = String(config.stretch.everyMin);
        if (value('set-nudgeFrom')) value('set-nudgeFrom').value = config.from;
        if (value('set-nudgeTo')) value('set-nudgeTo').value = config.to;
        if (value('set-nudgeWeekdays')) value('set-nudgeWeekdays').checked = config.weekdaysOnly;
        const statsEl = value('set-nudgeStats');
        if (statsEl) statsEl.textContent = `喝水 ${stats.water} 次，起身活动 ${stats.stretch} 次（只保存今天，次日自动清零）`;
    }

    function setNudgeControlsDisabled(disabled) {
        for (const id of NUDGE_IDS) {
            const element = document.getElementById(id);
            if (element) element.disabled = disabled;
        }
    }

    function loadNudgeSettings() {
        if (!document.getElementById('sp-jelly-nudge-card')) return;
        setNudgeControlsDisabled(true);
        nudgeChain = nudgeChain
            .then(() => nudgeRequest({ action: 'jelly_nudge_get' }))
            .then(result => { applyNudgeUI(result); setNudgeControlsDisabled(false); setNudgeStatus(''); })
            .catch(error => {
                const statsEl = document.getElementById('set-nudgeStats');
                if (statsEl) statsEl.textContent = '无法读取';
                setNudgeStatus(`无法读取水母关怀设置：${error.message}。请在已加载的扩展里打开本页。`);
            });
    }

    function bindNudgeEvents() {
        if (!document.getElementById('sp-jelly-nudge-card')) return;
        for (const id of NUDGE_IDS) {
            document.getElementById(id)?.addEventListener('change', () => {
                const config = readNudgeConfig();
                nudgeChain = nudgeChain
                    .then(() => nudgeRequest({ action: 'jelly_nudge_set', config }))
                    .then(result => {
                        applyNudgeUI(result);
                        // 后台会把不合法的时段改回默认；让用户看到发生了什么，而不是静默改值
                        const adjusted = result.config.from !== config.from || result.config.to !== config.to;
                        setNudgeStatus(adjusted ? `时段需要“开始早于结束”，已恢复为 ${result.config.from}–${result.config.to}` : '已保存');
                    })
                    .catch(error => setNudgeStatus(`保存失败：${error.message}。再改一次即可重试。`));
            });
        }
        loadNudgeSettings();
    }

    // ====== 水母差事（让常驻的桌面水母主动开口）======
    // 配置与当天状态由后台（js/jelly-errands.js）拥有；这里只经扩展消息读写，页面不直接写存储，也不自己建闹钟。
    // 状态提示要看桌面水母是否常驻、组件是否连上、协议版本是否 ≥ 8，所以同时读 jelly_desktop_get（只读）。
    const ERRANDS_IDS = ['set-errandsEnabled', 'set-errandsLevel', 'set-errandsTask', 'set-errandsWorklog', 'set-errandsSong', 'set-errandsTidbit', 'set-errandsTitles', 'set-errandsFrom', 'set-errandsTo', 'set-errandsWeekdays', 'set-errandsPatrol'];
    const ERRANDS_LEVEL_TEXT = { quiet: 2, mid: 4, busy: 8 };
    let errandsChain = Promise.resolve();

    function setErrandsStatus(text) {
        const status = document.getElementById('set-errandsStatus');
        if (status) status.textContent = text || '';
    }

    function readErrandsConfig() {
        const value = id => document.getElementById(id);
        return {
            enabled: !!value('set-errandsEnabled')?.checked,
            level: value('set-errandsLevel')?.value || 'mid',
            kinds: { task: !!value('set-errandsTask')?.checked, worklog: !!value('set-errandsWorklog')?.checked, song: !!value('set-errandsSong')?.checked, tidbit: !!value('set-errandsTidbit')?.checked },
            showTitles: !!value('set-errandsTitles')?.checked,
            from: value('set-errandsFrom')?.value || '',
            to: value('set-errandsTo')?.value || '',
            weekdaysOnly: !!value('set-errandsWeekdays')?.checked,
            patrol: !!value('set-errandsPatrol')?.checked,
        };
    }

    function applyErrandsUI(config) {
        const value = id => document.getElementById(id);
        if (value('set-errandsEnabled')) value('set-errandsEnabled').checked = config.enabled === true;
        if (value('set-errandsLevel')) value('set-errandsLevel').value = config.level;
        if (value('set-errandsTask')) value('set-errandsTask').checked = config.kinds.task !== false;
        if (value('set-errandsWorklog')) value('set-errandsWorklog').checked = config.kinds.worklog !== false;
        if (value('set-errandsSong')) value('set-errandsSong').checked = config.kinds.song !== false;
        if (value('set-errandsTidbit')) value('set-errandsTidbit').checked = config.kinds.tidbit !== false;
        if (value('set-errandsTitles')) value('set-errandsTitles').checked = config.showTitles === true;
        if (value('set-errandsFrom')) value('set-errandsFrom').value = config.from;
        if (value('set-errandsTo')) value('set-errandsTo').value = config.to;
        if (value('set-errandsWeekdays')) value('set-errandsWeekdays').checked = config.weekdaysOnly !== false;
        if (value('set-errandsPatrol')) value('set-errandsPatrol').checked = config.patrol !== false;
    }

    /** 状态文字：每种“开了却不会开口”的原因都给出下一步；说明里只写代码里真有的限制。 */
    function describeErrands(config, desktop) {
        if (!config.enabled) return '';
        const settings = desktop?.settings;
        const status = desktop?.status;
        if (!settings?.resident) return '水母差事需要先打开上方“桌面水母”里的“常驻桌面”才会开口；在此之前提醒仍按原来的系统通知弹出。';
        if (!status?.connected) return `桌面组件还没有连上。${status?.error ? `${status.error}。` : ''}请按 desktop-reminder/README.md 安装或更新组件，再重载扩展；在此之前提醒仍按原来的系统通知弹出。`;
        if (Number(status.version) < 8) return `桌面组件协议 v${status.version} 太旧，不认识水母差事：请按 desktop-reminder/README.md 更新组件（需要 v8），再重载扩展；在此之前提醒仍按原来的系统通知弹出。`;
        if (Number(status.version) < 9) return `桌面组件协议 v${status.version} 已能说任务、日志和小乐子，但推荐歌曲和右键“水母，给我…”需要 v9：请按 desktop-reminder/README.md 更新组件，再重载扩展。`;
        const base = `水母差事已开启（组件协议 v${status.version}）：${config.from}–${config.to}${config.weekdaysOnly ? '（周一至周五）' : ''}，每小时最多 ${ERRANDS_LEVEL_TEXT[config.level] || 4} 个气泡；你离开电脑 5 分钟以上就不打扰，回来后稍等片刻再开口；右键水母选“水母，给我…”可以随时要一条。`;
        // 活动行为（协议 v10）：组件太旧时它不起作用，要说清楚；关掉就不提
        if (config.patrol !== false && Number(status.version) < 10) return `${base}“让水母活动起来”（白天不睡觉、巡游、小动作）需要组件协议 v10：请按 desktop-reminder/README.md 更新组件，再重载扩展。`;
        return base;
    }

    function setErrandsControlsDisabled(disabled) {
        for (const id of ERRANDS_IDS) {
            const element = document.getElementById(id);
            if (element) element.disabled = disabled;
        }
    }

    /** 读桌面水母状态只为了写提示；读不到就不写提示，不影响设置本身。 */
    const readDesktopForErrands = () => nudgeRequest({ action: 'jelly_desktop_get' }).catch(() => null);

    function loadErrandsSettings() {
        if (!document.getElementById('sp-jelly-errands-card')) return;
        setErrandsControlsDisabled(true);
        errandsChain = errandsChain
            .then(() => nudgeRequest({ action: 'jelly_errands_get' }))
            .then(async result => {
                applyErrandsUI(result.config);
                setErrandsControlsDisabled(false);
                setErrandsStatus(describeErrands(result.config, await readDesktopForErrands()));
            })
            .catch(error => setErrandsStatus(`无法读取水母差事设置：${error.message}。请在已加载的扩展里打开本页。`));
    }

    function bindErrandsEvents() {
        if (!document.getElementById('sp-jelly-errands-card')) return;
        for (const id of ERRANDS_IDS) {
            document.getElementById(id)?.addEventListener('change', () => {
                const config = readErrandsConfig();
                errandsChain = errandsChain
                    .then(() => nudgeRequest({ action: 'jelly_errands_set', config }))
                    .then(async result => {
                        applyErrandsUI(result.config);
                        // 后台会把不合法的时段改回默认；让用户看到发生了什么，而不是静默改值
                        const adjusted = result.config.from !== config.from || result.config.to !== config.to;
                        const hint = describeErrands(result.config, await readDesktopForErrands());
                        setErrandsStatus((adjusted ? `时段需要“开始早于结束”，已恢复为 ${result.config.from}–${result.config.to}。` : '已保存。') + (hint ? ` ${hint}` : ''));
                    })
                    .catch(error => setErrandsStatus(`保存失败：${error.message}。再改一次即可重试。`));
            });
        }
        // 桌面水母的常驻 / 连接状态变化后，提示跟着刷新
        chrome.storage?.onChanged?.addListener?.((changes, area) => {
            if (area === 'local' && changes.desktopJellyV1) loadErrandsSettings();
        });
        loadErrandsSettings();
    }

    // ====== 桌面水母（macOS 原生组件）======
    // 设置与连接由后台（js/jelly-desktop.js）拥有；这里只经扩展消息读写，页面不直接写存储，也不自己连接组件。
    const DESKTOP_JELLY_IDS = ['set-desktopJellyResident', 'set-desktopJellyNight', 'set-desktopAssistantEnabled', 'set-desktopAssistantHotkey'];
    const DEFAULT_ASSISTANT_HOTKEY = 'ctrl+shift+b';
    const HOTKEY_SYMBOLS = { ctrl: '⌃', option: '⌥', shift: '⇧', cmd: '⌘' };
    let desktopJellyChain = Promise.resolve();

    function setDesktopJellyStatus(text) {
        const status = document.getElementById('set-desktopJellyStatus');
        if (status) status.textContent = text || '';
    }

    function setDesktopJellyControlsDisabled(disabled) {
        for (const id of DESKTOP_JELLY_IDS) {
            const element = document.getElementById(id);
            if (element) element.disabled = disabled;
        }
    }

    /** 状态文字：常驻时说明是否连上；没有常驻时说明只在倒计时或提醒期间临时出现；组件的问题把原因直接写出来。 */
    function describeDesktopJelly(result) {
        const { settings, status } = result;
        const problem = status?.error ? `${status.error}。` : '';
        if (settings.resident) {
            return status?.connected
                ? `桌面水母已常驻（组件协议 v${status.version}）。`
                : `已设为常驻，但还没连上桌面组件。${problem}请按 desktop-reminder/README.md 安装或更新组件，再重载扩展。`;
        }
        return `${problem}没有常驻：只在倒计时或提醒期间临时出现。`;
    }

    /** 规范热键串（如 ctrl+shift+b）显示成符号（⌃⇧B）；空格与功能键写成文字。 */
    function hotkeyLabel(hotkey) {
        const parts = String(hotkey || '').split('+');
        const key = parts.pop() || '';
        return parts.map(part => HOTKEY_SYMBOLS[part] || '').join('') + (key === 'space' ? '空格' : key.toUpperCase());
    }

    /** 桌面 AI 助手的状态说明：每种热键状态都给出可行动的下一步；菜单里的“问 AI…”不依赖快捷键。 */
    function describeAssistant(assistant) {
        if (!assistant?.enabled) return '';
        if (assistant.needsResident) return '桌面 AI 助手需要先打开上面的“常驻桌面”才会生效。';
        const label = hotkeyLabel(assistant.hotkey);
        switch (assistant.hotkeyStatus) {
            case 'ok': return `桌面 AI 助手已就绪：在任意应用里按 ${label} 唤出输入面板，也可以右键水母选“问 AI…”。macOS 不会告知快捷键是否与其他应用冲突，按下后没有反应或同时触发了别的应用时，请换一个组合。`;
            case 'taken': return `系统报告快捷键 ${label} 已被占用，请换一个组合；右键水母选“问 AI…”仍可使用。`;
            case 'invalid': return `快捷键 ${label} 无效，请换一个组合；右键水母选“问 AI…”仍可使用。`;
            case 'failed': return `系统没有接受快捷键 ${label}，请换一个组合；右键水母选“问 AI…”仍可使用。`;
            case 'unsupported': return '桌面组件版本过旧，不支持桌面 AI 助手：请按 desktop-reminder/README.md 更新组件，再重载扩展。';
            case 'unknown':
            default: return '正在等待桌面组件连接并注册快捷键…';
        }
    }

    function applyDesktopJellyUI(result) {
        const resident = document.getElementById('set-desktopJellyResident');
        const night = document.getElementById('set-desktopJellyNight');
        const assistantEnabled = document.getElementById('set-desktopAssistantEnabled');
        const assistantHotkey = document.getElementById('set-desktopAssistantHotkey');
        if (resident) resident.checked = result.settings.resident === true;
        if (night) night.checked = result.settings.night !== false;
        if (assistantEnabled) assistantEnabled.checked = result.assistant?.enabled === true;
        if (assistantHotkey) {
            const hotkey = result.assistant?.hotkey;
            assistantHotkey.value = [...assistantHotkey.options].some(option => option.value === hotkey) ? hotkey : DEFAULT_ASSISTANT_HOTKEY;
        }
        setDesktopJellyStatus(describeDesktopJelly(result));
        const assistantStatus = document.getElementById('set-desktopAssistantStatus');
        if (assistantStatus) assistantStatus.textContent = describeAssistant(result.assistant);
    }

    function loadDesktopJelly() {
        desktopJellyChain = desktopJellyChain
            .then(() => nudgeRequest({ action: 'jelly_desktop_get' }))
            .then(applyDesktopJellyUI)
            .catch(error => setDesktopJellyStatus(`无法读取桌面水母设置：${error.message}。请在已加载的扩展里打开本页。`));
    }

    function bindDesktopJellyEvents() {
        if (!document.getElementById('sp-desktop-jelly-card')) return;
        for (const id of DESKTOP_JELLY_IDS) {
            document.getElementById(id)?.addEventListener('change', () => {
                const settings = {
                    resident: !!document.getElementById('set-desktopJellyResident')?.checked,
                    night: !!document.getElementById('set-desktopJellyNight')?.checked,
                    assistant: { enabled: !!document.getElementById('set-desktopAssistantEnabled')?.checked, hotkey: document.getElementById('set-desktopAssistantHotkey')?.value || DEFAULT_ASSISTANT_HOTKEY },
                };
                setDesktopJellyControlsDisabled(true);
                setDesktopJellyStatus('正在保存并连接桌面组件…');
                desktopJellyChain = desktopJellyChain
                    .then(() => nudgeRequest({ action: 'jelly_desktop_set', settings }, 15000))
                    .then(applyDesktopJellyUI)
                    .catch(error => setDesktopJellyStatus(`保存失败：${error.message}。再改一次即可重试。`))
                    .then(() => setDesktopJellyControlsDisabled(false));
            });
        }
        // 水母右键菜单的“收起水母”、状态栏退出组件都会改设置；打开着的设置页跟着刷新
        chrome.storage?.onChanged?.addListener?.((changes, area) => {
            if (area === 'local' && (changes.desktopJellyV1 || changes.desktopAssistantV1)) loadDesktopJelly();
        });
        loadDesktopJelly();
    }

    async function loadBgProviderSettings() {
        try {
            const { backgroundProviderSettings } = await chrome.storage.sync.get('backgroundProviderSettings');
            const stored = backgroundProviderSettings || {};
            bgProviderSettings = {
                ...BG_PROVIDER_DEFAULTS,
                ...stored,
                apiKeys: { ...BG_PROVIDER_DEFAULTS.apiKeys, ...(stored.apiKeys || {}) },
            };
            bgProviderSettings.mediaMode = ['image', 'mixed', 'video'].includes(stored.mediaMode)
                ? stored.mediaMode
                : (stored.enableVideoBackground ? 'mixed' : 'image');
            bgProviderSettings.enableVideoBackground = bgProviderSettings.mediaMode !== 'image';
        } catch { /* defaults */ }
        applyBgProviderUI();
    }

    async function saveBgProviderSettings() {
        try {
            bgProviderSettings.enableVideoBackground = bgProviderSettings.mediaMode !== 'image';
            await chrome.storage.sync.set({ backgroundProviderSettings: bgProviderSettings });
        } catch (e) {
            console.error('保存背景设置失败:', e);
        }
    }

    function applyBgProviderUI() {
        const mediaModeEl = document.getElementById('set-bgMediaMode');
        if (mediaModeEl) mediaModeEl.value = bgProviderSettings.mediaMode || 'image';

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
        const mediaModeEl = document.getElementById('set-bgMediaMode');
        if (mediaModeEl) {
            mediaModeEl.addEventListener('change', () => {
                bgProviderSettings.mediaMode = mediaModeEl.value;
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
        loadBgExperienceSettings().then(bindBgExperienceEvents);
        bindNudgeEvents();
        bindDesktopJellyEvents();
        bindErrandsEvents();
    });
})();
