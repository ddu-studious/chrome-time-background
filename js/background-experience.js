/**
 * background-experience.js
 * 正式首页背景体验：v2 单一视觉皮肤 + v3 可主动唤醒的手势物理世界。
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'backgroundExperienceSettings';
    const DEFAULTS = Object.freeze({
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
        aquariumPredation: true,
        aquariumSizes: true,
        aquariumFlow: false,
        aquariumRays: false,
        aquariumSound: false,
    });
    const VISUAL_EFFECTS = new Set(['none', 'depth', 'weather', 'memory', 'liquid', 'time', 'jellyfish']);
    const COLORS = [[112, 205, 255], [170, 111, 255], [79, 239, 194]];
    // 失焦休息：窗口失去焦点这么久之后才冻结（切个窗口再回来不该闪）；隐藏这么久之后才释放大块缓冲（短暂切走不拆了重建）。
    const REST_BLUR_DELAY_MS = 4000;
    const DEEP_REST_MS = 60000;
    // 从隐藏回到“可见但仍没有焦点”时先补画这几帧再冻结，免得画布停在被清空的状态。
    const REST_SETTLE_FRAMES = 3;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, Number(value) || 0));
    }

    function normalizeSettings(value) {
        const source = value && typeof value === 'object' ? value : {};
        return {
            enabled: source.enabled !== false,
            visualEffect: VISUAL_EFFECTS.has(source.visualEffect) ? source.visualEffect : DEFAULTS.visualEffect,
            intensity: clamp(source.intensity ?? DEFAULTS.intensity, 10, 100),
            playgroundEnabled: source.playgroundEnabled !== false,
            soundEnabled: source.soundEnabled === true,
            autoCalmSeconds: [0, 8, 12, 20].includes(Number(source.autoCalmSeconds))
                ? Number(source.autoCalmSeconds)
                : DEFAULTS.autoCalmSeconds,
            // 触感实验：壁纸转场 / 液态时钟 / 任务完成动效，由 wallpaper-weave.js、clock-liquid.js、task-crumple.js 读取。
            // wallpaperTransition 只有 'none' 表示关闭（旧版保存的 'weave' 与新值 'on' 都是开启）；
            // wallpaperTransitionStyle 是 'random' 或某个风格 id，具体取值范围由转场模块校验，这里只保证是一个短小写字母串。
            wallpaperTransition: source.wallpaperTransition === 'none' ? 'none' : DEFAULTS.wallpaperTransition,
            wallpaperTransitionStyle: typeof source.wallpaperTransitionStyle === 'string' && /^[a-z]{1,16}$/.test(source.wallpaperTransitionStyle)
                ? source.wallpaperTransitionStyle
                : DEFAULTS.wallpaperTransitionStyle,
            clockLiquid: source.clockLiquid !== false,
            taskCrumple: source.taskCrumple !== false,
            // 深海水母皮肤：水母上隐约显示任务名，并可以抓住水母拖进纸篓来完成任务（只在选了水母皮肤时有意义）。
            jellyfishTasks: source.jellyfishTasks !== false,
            // 夜晚荧光：晚 8 点到次日早 6 点（前后各 1 小时渐变）水母更亮、偏深海蓝紫；只用本机时间。
            jellyfishNight: source.jellyfishNight !== false,
            // 随音乐起舞：音乐播放器显示“正在播放”时水母每拍都收缩并摇摆（不是真实节拍）；成长：按连续完成任务的天数让钟罩略大一圈；
            // pomodoroJelly 由 pomodoro-jelly.js 读取（番茄钟面板里的陪伴水母），与是否选了水母皮肤无关。
            jellyfishDance: source.jellyfishDance !== false,
            jellyfishGrow: source.jellyfishGrow !== false,
            pomodoroJelly: source.pomodoroJelly !== false,
            // 水族馆：在水母皮肤下可以放入、捞出小鱼（js/aquarium*.js）。只有明确 false 才关；关闭后不读写鱼的存储、没有托盘。
            aquariumFish: source.aquariumFish !== false,
            // 海水层（js/aquarium-water.js）：页面底部的一条岸线——海浪涌上沙滩又退去、潮水慢慢涨落，鱼会留在浪能冲到的最高水线之上；只在选了水母（水族馆）皮肤时运行；只有明确 false 才关；与小鱼开关互不影响。
            aquariumWater: source.aquariumWater !== false,
            // 写实动物（js/aquarium-real.js）：小锤头鲨、蝠鲼、鲸鲨用接近真实的外形、配色与游动方式；只有明确 false 才回到卡通画法（海龟没有卡通画法，仍是写实）。
            aquariumRealistic: source.aquariumRealistic !== false,
            // 大鱼吃小鱼（js/aquarium-predation-core.js）：放了小锤头鲨时它偶尔追一条小鱼并吃掉，被吃的鱼过一会儿游回来（只发生在画面里，不改鱼的存储）；只有明确 false 才关，省流量模式一律不开。
            aquariumPredation: source.aquariumPredation !== false,
            // 个体大小差异（js/aquarium-core.js 的 sizeOf）：小鱼每条大小略有不同（标准体长的 75%–125%，由条目 id 决定、不存储）；大鱼按真实比例不参与；纯视觉；只有明确 false 才关。
            aquariumSizes: source.aquariumSizes !== false,
            // 水流与海洋雪（js/aquarium-flow-core.js）：大鱼游过留下水流尾迹、水里飘着海洋雪；纯视觉、不存储；默认关，只有明确 true 才开，省流量模式一律不开。
            aquariumFlow: source.aquariumFlow === true,
            // 水下光束（js/aquarium-light-core.js）：水面斜射下来的淡淡光束，写实动物远处先失去红色；纯视觉、不存储；默认关，只有明确 true 才开（光束在省流量模式下不画）。
            aquariumRays: source.aquariumRays === true,
            // 水下环境音（js/aquarium-sound.js）：粉红噪声 + 低频嗡鸣 + 偶尔气泡；默认关，只有明确 true 才开；须用户在本页点一下（浏览器自动播放策略）；页面隐藏时挂起。
            aquariumSound: source.aquariumSound === true,
        };
    }

    class BackgroundExperience {
        constructor() {
            this.settings = { ...DEFAULTS };
            this.root = document.getElementById('background-experience-root');
            this.canvas = document.getElementById('background-experience-canvas');
            this.detail = document.getElementById('background-experience-detail');
            this.timeLayer = document.getElementById('background-experience-time');
            this.toggle = document.getElementById('background-experience-toggle');
            this.hud = document.getElementById('background-experience-hud');
            this.energyEl = document.getElementById('background-experience-energy');
            this.energyFill = document.getElementById('background-experience-energy-fill');
            this.statusEl = document.getElementById('background-experience-status');
            this.ctx = this.canvas?.getContext('2d', { alpha: true }) || null;
            this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
            this.saveData = navigator.connection?.saveData === true;
            this.width = innerWidth;
            this.height = innerHeight;
            this.dpr = 1;
            this.active = false;
            this.hidden = document.hidden || document.body.classList.contains('home-background-suspended');
            // 失焦休息（只省 CPU，不隐藏任何东西）与隐藏后的深度释放（回收共享画布与海洋生态各层的缓冲）：见 setResting / releaseResources。
            this.focused = this.documentHasFocus();
            this.resting = false;
            this.restTimer = null;
            this.restWake = 0;
            this.restSettle = 0;
            this.restListeners = new Set();
            this.deepTimer = null;
            this.released = false;
            this.visual = 'none';
            this.frameRequest = null;
            this.initialized = false;
            this.lastFrame = 0;
            this.frameIndex = 0;
            this.lastInteraction = performance.now();
            this.energy = 0;
            this.combo = 0;
            this.comboDeadline = 0;
            this.audioContext = null;
            this.weather = 'clear';
            this.weatherBits = [];
            this.liquidBlobs = [];
            this.world = { orbs: [], waves: [], strokes: [], cores: [], vortices: [], comets: [] };
            this.pointer = {
                id: null, x: innerWidth / 2, y: innerHeight / 2,
                px: innerWidth / 2, py: innerHeight / 2,
                vx: 0, vy: 0, down: false, started: 0,
                startX: 0, startY: 0, distance: 0, stroke: null, samples: [],
            };
            // pointer 的初始值只是屏幕中心的占位：水母只躲真实收到过、并且仍在页面里的指针（见 jellyfishPointer）。
            this.pointerSeen = false;
            this.pointerInside = false;
            this.grab = null;               // 正在抓水母或鱼：{ id, kind: 'jelly'|'fish' }；抓取状态机在各自的模块里，这里只转发指针并管光标/点击
            this.grabHover = false;         // 指针下面是不是一只可抓的水母（光标变成手）
            this.swallowClickUntil = 0;     // 拖拽结束后紧跟着的那次 click 不让页面当成“点了空白处”
            this.bound = false;
            this.musicPlaying = false;
        }

        async init() {
            if (!this.root || !this.canvas || !this.ctx) return;
            await this.loadSettings();
            this.resize();
            this.seedWorld();
            this.bind();
            this.observeWeather();
            this.initialized = true;
            this.applySettings();
        }

        async loadSettings() {
            try {
                const result = await chrome.storage.sync.get(STORAGE_KEY);
                this.settings = normalizeSettings(result?.[STORAGE_KEY]);
            } catch {
                this.settings = { ...DEFAULTS };
            }
        }

        applySettings() {
            const intensity = this.settings.intensity / 100;
            const requested = this.settings.enabled ? this.settings.visualEffect : 'none';
            // 水母靠持续的收缩与漂浮才成立：开启“减少动态效果”时直接当作没选皮肤，连深海色调层一起不出现，
            // 否则只会看到一层没有内容的暗色。其他皮肤沿用原有行为。
            const visual = requested === 'jellyfish' && this.reduceMotion ? 'none' : requested;
            this.root.classList.toggle('enabled', this.settings.enabled && (visual !== 'none' || this.settings.playgroundEnabled));
            this.root.dataset.visual = visual;
            this.root.style.setProperty('--bgx-intensity', intensity.toFixed(2));
            this.root.style.setProperty('--bgx-depth-opacity', (intensity * .62).toFixed(3));
            this.root.style.setProperty('--bgx-grain-opacity', (intensity * .075).toFixed(3));
            this.root.style.setProperty('--bgx-tone-opacity', (intensity * .7).toFixed(3));
            this.root.style.setProperty('--bgx-time-opacity', (intensity * .72).toFixed(3));
            this.root.style.setProperty('--bgx-reveal-radius', `${Math.round(115 + intensity * 95)}px`);
            this.toggle.hidden = !(this.settings.enabled && this.settings.playgroundEnabled);
            if (this.toggle.hidden) this.setActive(false);
            this.syncWeatherVisual();
            this.applyTimeVisual();
            this.seedWeather();
            this.seedLiquid();
            this.visual = visual;
            // 设置在释放期间变化：syncJellyfish 会按新设置把海洋生态重新起来，所以释放标记作废，隐藏中则重新计时。
            this.released = false;
            this.syncJellyfish(visual);
            this.syncAnimation();
            if (this.hidden) this.armDeepRest();
        }

        // 水母皮肤的画法、待办名单、时钟拍点与抓取状态机都在 js/jellyfish*.js；这里只负责按设置启停、在 drawPassive 里把共享画布借给它，
        // 并把真实的指针事件转发过去（抓取、悬停、拖动结束）。皮肤脚本缺席时这些入口都是空操作。
        // visual 已经把“减少动态效果”折算为 none（见 applySettings），所以这里只看它。
        skin() {
            return window.JellyfishSkin || null;
        }

        syncJellyfish(visual) {
            const skin = this.skin();
            if (!skin) return;
            if (visual === 'jellyfish') {
                // 关掉“任务名与抓取”（例如在设置页或别的标签页里）：正在抓着的水母放开，松手时不再完成任务；水母本身照常游
                if (!this.settings.jellyfishTasks) {
                    if (this.grab?.kind === 'jelly') this.cancelGrab();      // 正抓着的鱼不受“任务名与抓取”开关影响
                    this.setGrabHover(false);                                // 光标类立刻撤掉；指针下若是鱼，下一次移动会重新判定
                }
                skin.start();
                this.syncAquarium(true);
                this.syncWater(true);
                return;
            }
            this.cancelGrab();
            this.setGrabHover(false);
            this.syncAquarium(false);
            this.syncWater(false);
            skin.stop();
        }

        // 海水层（js/aquarium-water.js）：独立的 WebGL 画布，只在选了水母皮肤、且设置开着时运行；脚本缺席时这些入口都是空操作。
        water() {
            return window.AquariumWater || null;
        }

        syncWater(visualIsJellyfish) {
            const water = this.water();
            if (!water) return;
            if (visualIsJellyfish && this.settings.aquariumWater) { water.start(); return; }
            water.stop();
        }

        // 水族馆（鱼）只在选了水母皮肤、且设置开着时运行；js/aquarium.js 缺席时这些入口都是空操作。
        aquarium() {
            return window.Aquarium || null;
        }

        syncAquarium(visualIsJellyfish) {
            const aq = this.aquarium();
            if (!aq) return;
            if (visualIsJellyfish && this.settings.aquariumFish) { aq.start(); this.syncAquariumSound(true); return; }
            if (this.grab?.kind === 'fish') this.cancelGrab();
            aq.stop();
            this.syncAquariumSound(false);
        }

        // 水下环境音：独立于鱼层，只在水族馆皮肤 + 小鱼开着 + 设置开着时想响；真正响起来还要一次用户手势（见 onPointerDown）。
        aquariumSound() {
            return window.AquariumSound || null;
        }

        syncAquariumSound(visualIsJellyfish) {
            const Sound = this.aquariumSound();
            if (!Sound) return;
            const want = !!(visualIsJellyfish && this.settings.aquariumFish && this.settings.aquariumSound && !this.saveData);
            if (!want) {
                if (this._aqSound) { try { this._aqSound.stop(); } catch { /* ignore */ } this._aqSound = null; }
                return;
            }
            if (!this._aqSound) {
                try { this._aqSound = Sound.create(); } catch { this._aqSound = null; return; }
            }
            // 不在这里 start：没有用户手势会被浏览器挡住；等 pointerdown 再启
            this._aqSound.tick({ amount: Math.max(0, Math.min(1, (this.settings.intensity ?? 65) / 100)), night: this.settings.jellyfishNight ? undefined : 0, hidden: this.hidden });
        }

        fishRunning() {
            const aq = this.aquarium();
            return this.settings.visualEffect === 'jellyfish' && !!aq && aq.isActive();
        }

        jellyfishRunning() {
            const skin = this.skin();
            return this.settings.visualEffect === 'jellyfish' && !!skin && skin.isActive();   // 减少动态效果下皮肤从未启动（见 applySettings），所以 isActive 为 false
        }

        /** 交给水母的指针：只有真实收到过位置、且仍在页面里（或正拖着水母）时才有，否则水母既不躲避也不被它牵动。 */
        jellyfishPointer() {
            return this.pointerSeen && (this.pointerInside || this.grab) ? this.pointer : null;
        }

        drawJellyfish(now, dt, amount) {
            // 海水层有自己的画布（在壁纸与本画布之间），与鱼、水母互不读取；出错只关水体层（控制器内部处理），不影响下面的帧循环。
            const water = this.water();
            let shore = null;
            if (water && water.isActive()) {
                water.frame({ width: this.width, height: this.height, now, amount, lowPower: this.saveData, night: this.settings.jellyfishNight });
                // 岸线（此刻水线能到的最高处，占页面高度的比例、从页面底边往上量）：鱼据此让身体下缘留在岸线之上；水体层没在显示时为 null，鱼不避岸线
                shore = typeof water.shore === 'function' ? water.shore(now) : null;
            }
            // 鱼画在水母后面（先画）；它读水母钟罩的位置避让，水母不读鱼。画法出错只停鱼层，不影响水母。
            const aq = this.aquarium();
            if (aq && aq.isActive()) {
                const skin = this.skin();
                aq.frame({
                    ctx: this.ctx, width: this.width, height: this.height, dt, amount,
                    pointer: this.jellyfishPointer(), lowPower: this.saveData, night: this.settings.jellyfishNight, realistic: this.settings.aquariumRealistic, predation: this.settings.aquariumPredation, sizes: this.settings.aquariumSizes, flow: this.settings.aquariumFlow, rays: this.settings.aquariumRays,
                    bells: skin && typeof skin.bells === 'function' ? skin.bells() : [], shore,
                });
            }
            // 不传 colors：水母用皮肤自己的七彩调色板（每只一种颜色）；宿主的 COLORS 只有几种，传过去会让七彩失效
            this.skin()?.frame({
                ctx: this.ctx, width: this.width, height: this.height, now, dt, amount,
                pointer: this.jellyfishPointer(), lowPower: this.saveData, labels: this.settings.jellyfishTasks, night: this.settings.jellyfishNight,
                dance: this.settings.jellyfishDance && this.musicPlaying ? 1 : 0, grow: this.settings.jellyfishGrow,
            });
            if (this._aqSound) {
                // 夜里曲线不在宿主里再算一份；开着“夜晚荧光”时按满夜音量折减，关着为 0
                this._aqSound.tick({ amount, night: this.settings.jellyfishNight === false ? 0 : 1, hidden: this.hidden });
            }
        }

        /** 水母是否允许被抓：皮肤在运行、设置开着、页面可见。 */
        canGrabJelly() {
            return !this.hidden && this.settings.jellyfishTasks && this.jellyfishRunning();
        }

        /** 鱼是否允许被抓：水族馆在运行、设置开着、页面可见（与“任务名与抓取”开关无关：鱼不绑任务）。 */
        canGrabFish() {
            return !this.hidden && this.settings.aquariumFish && this.fishRunning();
        }

        setGrabHover(value) {
            if (this.grabHover === value) return;
            this.grabHover = value;
            document.documentElement?.classList.toggle('jellyfish-grabbable', value);
        }

        /** 鼠标移到可抓的水母上时把光标变成手（只看空白背景处的鼠标；触摸没有悬停）。 */
        updateGrabHover(event) {
            const eligible = !this.grab && event.pointerType === 'mouse' && this.isBackgroundTarget(event.target);
            const overJelly = eligible && this.canGrabJelly() && !!this.skin().hoverAt(event.clientX, event.clientY);
            const overFish = eligible && !overJelly && this.canGrabFish() && !!this.aquarium().hoverAt(event.clientX, event.clientY);
            this.setGrabHover(overJelly || overFish);
        }

        /** 在空白背景上按下主键，且正好按在一只绑定了任务的水母上：抓住它。返回是否抓住（抓住就不再交给背景玩法）。 */
        tryGrab(event) {
            if (this.grab || event.button !== 0 || event.isPrimary === false) return false;
            if (!this.isBackgroundTarget(event.target)) return false;
            // 重叠时水母优先（保持“抓水母完成任务”的原有行为），没抓到水母才问鱼；一次只抓一个，所以纸篓与网兜不会同时出现
            let kind = null;
            if (this.canGrabJelly() && this.skin().grabAt(event.clientX, event.clientY)) kind = 'jelly';
            else if (this.canGrabFish() && this.aquarium().grabAt(event.clientX, event.clientY)) kind = 'fish';
            if (!kind) return false;
            event.preventDefault();                 // 不选中文字、不开始原生拖拽
            this.setPointer(event);
            this.grab = { id: event.pointerId, kind };
            this.setGrabHover(false);
            document.documentElement?.classList.add('jellyfish-grabbing');
            return true;
        }

        /** 抓取结束：松手（含按键在窗口外被放开）交给皮肤判断是否落进纸篓。拖过的话随后那次 click 要吞掉。 */
        endGrab(event) {
            const grab = this.grab;
            if (!grab) return;
            this.grab = null;
            document.documentElement?.classList.remove('jellyfish-grabbing');
            const target = grab.kind === 'fish' ? this.aquarium() : this.skin();
            if (!target) return;
            this.setPointer(event);
            if (target.drop(event.clientX, event.clientY)) this.swallowClickUntil = performance.now() + 450;
        }

        /** 被打断（失焦、页面隐藏、指针取消、关掉水母皮肤）：放开水母、收起纸篓，不完成任何任务。 */
        cancelGrab() {
            if (!this.grab) return;
            const kind = this.grab.kind;
            this.grab = null;
            document.documentElement?.classList.remove('jellyfish-grabbing');
            (kind === 'fish' ? this.aquarium() : this.skin())?.cancel();
        }

        /** 拖拽结束后随即到来的那次 click：它不是用户想点的东西，不让页面当成“点了空白处”（关面板之类）。 */
        onClickCapture(event) {
            if (!this.swallowClickUntil) return;
            const fresh = performance.now() < this.swallowClickUntil;
            this.swallowClickUntil = 0;
            if (!fresh) return;
            event.preventDefault();
            event.stopImmediatePropagation();
        }

        // ---------- 失焦休息与隐藏后的释放 ----------
        // 目标：只有拿到焦点的首页才持续占用 CPU；没焦点的可见窗口冻结在最后一帧，隐藏很久后再回收大块缓冲。
        // 都是纯视觉层的暂停/重启：不碰存储、不碰任务，回来后各层从各自原有的 start 重新开始（鱼从存储读回，位置重新散开）。
        documentHasFocus() {
            try { return typeof document.hasFocus === 'function' ? document.hasFocus() !== false : true; } catch { return true; }
        }

        isResting() {
            return this.resting;
        }

        /** 订阅休息状态变化（main.js 用它暂停/恢复壁纸视频）；返回取消函数。监听者出错不影响休息本身。 */
        onRestChange(listener) {
            if (typeof listener !== 'function') return () => {};
            this.restListeners.add(listener);
            return () => this.restListeners.delete(listener);
        }

        onWindowBlur() {
            this.focused = false;
            this.restWake = performance.now();
            this.armRest(REST_BLUR_DELAY_MS);
        }

        onWindowFocus() {
            this.focused = true;
            this.clearRestTimer();
            this.setResting(false);
        }

        /** 没有焦点的窗口里的真实指针活动：悬停就醒来，停下 REST_BLUR_DELAY_MS 之后再次休息。 */
        noteHover() {
            this.restWake = performance.now();
            if (this.resting) this.setResting(false);
            this.armRest(REST_BLUR_DELAY_MS);
        }

        armRest(delay) {
            if (this.restTimer !== null) return;
            this.restTimer = setTimeout(() => {
                this.restTimer = null;
                if (this.focused) return;
                if (typeof document.hasFocus === 'function' && this.documentHasFocus()) { this.focused = true; return; }    // 漏掉了 focus 事件：以真实状态为准
                const idle = performance.now() - this.restWake;
                if (idle < REST_BLUR_DELAY_MS) { this.armRest(REST_BLUR_DELAY_MS - idle); return; }
                this.setResting(true);
            }, Math.max(0, delay));
        }

        clearRestTimer() {
            if (this.restTimer === null) return;
            clearTimeout(this.restTimer);
            this.restTimer = null;
        }

        setResting(value) {
            value = !!value;
            if (this.resting === value) return;
            this.resting = value;
            this.restSettle = 0;
            document.body.classList.toggle('home-resting', value);
            this.lastFrame = 0;
            this.syncAnimation();
            for (const listener of [...this.restListeners]) {
                try { listener(value); } catch { /* 监听者的问题不能影响背景本身 */ }
            }
        }

        armDeepRest() {
            if (this.deepTimer !== null || this.released) return;
            this.deepTimer = setTimeout(() => { this.deepTimer = null; this.releaseResources(); }, DEEP_REST_MS);
        }

        disarmDeepRest() {
            if (this.deepTimer !== null) { clearTimeout(this.deepTimer); this.deepTimer = null; }
            if (this.released) this.restoreReleased();
        }

        /** 隐藏足够久之后：海洋生态三层各自销毁画布/监听（它们已有的 stop 入口），共享画布缩到 1×1 释放后备缓冲。 */
        releaseResources() {
            if (this.released || !this.hidden) return;
            this.released = true;
            this.cancelPointer();
            this.setGrabHover(false);
            if (this.visual === 'jellyfish') {
                this.syncAquarium(false);
                this.syncWater(false);
                this.skin()?.stop();
            }
            this.canvas.width = 1;
            this.canvas.height = 1;
        }

        restoreReleased() {
            if (!this.released) return;
            this.released = false;
            const resized = this.width !== innerWidth || this.height !== innerHeight;
            this.resize();
            if (resized) { this.seedWorld(); this.seedWeather(); this.seedLiquid(); }
            this.syncJellyfish(this.visual);
            this.syncAnimation();
        }

        setSuspended(value) {
            this.hidden = !!value;
            this.lastFrame = 0;
            if (this.hidden) this.cancelPointer();
            if (this.hidden) this.armDeepRest();
            else this.disarmDeepRest();
            // 回到可见但窗口仍没有焦点：先补画几帧再冻结（隐藏时画布被清空过）。
            if (!this.hidden && this.resting) this.restSettle = REST_SETTLE_FRAMES;
            if (this._aqSound) this._aqSound.tick({ hidden: this.hidden, amount: Math.max(0, Math.min(1, (this.settings.intensity ?? 65) / 100)) });
            this.syncAnimation();
        }

        needsAnimation() {
            return this.settings.enabled && (this.active || this.settings.visualEffect === 'liquid'
                || this.jellyfishRunning()
                || (this.settings.visualEffect === 'weather' && !['clear', 'night'].includes(this.weather)));
        }

        syncAnimation() {
            if (!this.initialized) return;
            if (this.hidden || !this.needsAnimation()) {
                if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest);
                this.frameRequest = null;
                this.ctx.clearRect(0, 0, this.width, this.height);
            } else if (this.resting && this.restSettle <= 0) {
                // 失焦休息：停掉帧循环，画布保持最后一帧（不清屏、不隐藏），回到焦点或真实悬停时再恢复。
                if (this.frameRequest !== null) cancelAnimationFrame(this.frameRequest);
                this.frameRequest = null;
            } else if (this.frameRequest === null) {
                this.frameRequest = requestAnimationFrame(time => this.frame(time));
            }
        }

        setBackground(background) {
            const url = background?.url || background?.thumbnailUrl || '';
            if (!url || !this.detail) return;
            const safeUrl = String(url).replace(/["'()\\\n\r]/g, char => encodeURIComponent(char));
            this.detail.style.backgroundImage = `url("${safeUrl}")`;
        }

        resize() {
            this.width = innerWidth;
            this.height = innerHeight;
            this.dpr = Math.min(devicePixelRatio || 1, this.reduceMotion || this.saveData ? 1 : 1.6);
            this.canvas.width = Math.round(this.width * this.dpr);
            this.canvas.height = Math.round(this.height * this.dpr);
            this.canvas.style.width = `${this.width}px`;
            this.canvas.style.height = `${this.height}px`;
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        }

        seedWorld() {
            const count = this.reduceMotion || this.saveData ? 6 : 11;
            this.world.orbs = Array.from({ length: count }, (_, index) => ({
                x: this.width * (.22 + Math.random() * .7),
                y: this.height * (.12 + Math.random() * .72),
                vx: (Math.random() - .5) * .32,
                vy: (Math.random() - .5) * .32,
                radius: 4 + Math.random() * 8,
                color: index % 3,
                phase: Math.random() * Math.PI * 2,
            }));
        }

        seedWeather() {
            const count = this.reduceMotion || this.saveData ? 35 : (this.weather === 'rain' ? 120 : 70);
            this.weatherBits = Array.from({ length: count }, () => ({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                z: .35 + Math.random() * .8,
                size: .7 + Math.random() * 2,
                drift: (Math.random() - .5) * .6,
            }));
        }

        seedLiquid() {
            this.liquidBlobs = Array.from({ length: this.reduceMotion || this.saveData ? 6 : 11 }, (_, index) => ({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - .5) * .42,
                vy: (Math.random() - .5) * .42,
                radius: 90 + Math.random() * 130,
                color: index % 3,
                phase: Math.random() * Math.PI * 2,
            }));
        }

        observeWeather() {
            const target = document.querySelector('.weather-desc');
            if (!target) return;
            const update = () => {
                const text = target.textContent || '';
                const next = /雪/.test(text) ? 'snow'
                    : /雨|雷/.test(text) ? 'rain'
                        : /夜|晚/.test(text) ? 'night'
                            : /阴|云|雾/.test(text) ? 'cloud'
                                : 'clear';
                if (next !== this.weather) {
                    this.weather = next;
                    this.syncWeatherVisual();
                    this.seedWeather();
                    this.syncAnimation();
                }
            };
            new MutationObserver(update).observe(target, { childList: true, subtree: true, characterData: true });
            update();
        }

        syncWeatherVisual() {
            this.root.dataset.weather = this.weather;
        }

        applyTimeVisual() {
            if (!this.timeLayer) return;
            const hour = new Date().getHours() + new Date().getMinutes() / 60;
            let gradient;
            if (hour < 5 || hour >= 21) gradient = 'linear-gradient(180deg, rgba(28,38,105,.42), rgba(3,10,31,.35))';
            else if (hour < 8) gradient = 'linear-gradient(180deg, rgba(255,142,112,.28), rgba(79,112,174,.12))';
            else if (hour < 17) gradient = 'radial-gradient(circle at 72% 10%, rgba(255,221,154,.3), transparent 52%)';
            else gradient = 'linear-gradient(180deg, rgba(243,111,82,.32), rgba(64,48,105,.18))';
            this.timeLayer.style.background = gradient;
        }

        bind() {
            if (this.bound) return;
            this.bound = true;
            // 音乐播放器（music-controller.js）在“正在播放”变化时发出：与播放键图标是同一个状态，只读；晚到或缺席都当没在播
            window.addEventListener('music:playing', event => { this.musicPlaying = event?.detail?.playing === true; });
            this.toggle.addEventListener('click', () => this.setActive(!this.active));
            window.addEventListener('resize', () => {
                if (this.released) return;          // 释放期间不重新分配大画布，回到页面时由 restoreReleased 统一恢复
                this.resize();
                this.seedWorld();
                this.seedWeather();
                this.seedLiquid();
            });
            document.addEventListener('visibilitychange', () => {
                this.setSuspended(document.hidden || document.body.classList.contains('home-background-suspended'));
            });
            document.addEventListener('pointermove', event => this.onPointerMove(event), { passive: true });
            document.addEventListener('pointerdown', event => this.onPointerDown(event), true);
            document.addEventListener('pointerup', event => this.onPointerUp(event), true);
            document.addEventListener('pointercancel', () => this.cancelPointer(), true);
            document.addEventListener('dblclick', event => this.onDoubleClick(event), true);
            // 抓水母相关：拖拽结束后的那次 click 不当成点空白处；指针离开页面后水母不再躲它；失焦或按 Esc 放开水母
            document.addEventListener('click', event => this.onClickCapture(event), true);
            document.documentElement?.addEventListener('pointerleave', () => {
                this.pointerInside = false;
                this.setGrabHover(false);
            });
            window.addEventListener('blur', () => { this.cancelPointer(); this.onWindowBlur(); });
            window.addEventListener('focus', () => this.onWindowFocus());
            if (!this.focused) this.onWindowBlur();          // 页面在没有焦点的窗口里打开
            if (this.hidden) this.armDeepRest();
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape' && this.grab) this.cancelGrab();
            }, true);
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area !== 'sync' || !changes[STORAGE_KEY]) return;
                this.settings = normalizeSettings(changes[STORAGE_KEY].newValue);
                this.applySettings();
            });
        }

        isBackgroundTarget(target) {
            if (!(target instanceof Element)) return false;
            if (target === document.body || target === document.documentElement) return true;
            if (target.id === 'background-video') return true;
            return target.classList.contains('main-layout')
                || target.classList.contains('main-content')
                || target.classList.contains('time-wrapper')
                || target.classList.contains('time-container');
        }

        setPointer(event) {
            const p = this.pointer;
            p.px = p.x;
            p.py = p.y;
            p.x = event.clientX;
            p.y = event.clientY;
            p.vx = p.x - p.px;
            p.vy = p.y - p.py;
            this.pointerSeen = true;
            this.pointerInside = true;
            this.root.style.setProperty('--bgx-x', `${p.x}px`);
            this.root.style.setProperty('--bgx-y', `${p.y}px`);
            const nx = p.x / Math.max(1, this.width) - .5;
            const ny = p.y / Math.max(1, this.height) - .5;
            const amount = this.settings.intensity / 100;
            this.root.style.setProperty('--bgx-depth-x', `${(-nx * 14 * amount).toFixed(2)}px`);
            this.root.style.setProperty('--bgx-depth-y', `${(-ny * 10 * amount).toFixed(2)}px`);
        }

        setActive(value) {
            this.active = !!value && this.settings.enabled && this.settings.playgroundEnabled;
            this.lastInteraction = performance.now();
            this.toggle.setAttribute('aria-pressed', String(this.active));
            this.toggle.title = this.active ? '让背景玩法休眠' : '唤醒背景玩法';
            this.hud.classList.toggle('visible', this.active);
            this.hud.setAttribute('aria-hidden', String(!this.active));
            if (this.active) {
                this.status('背景世界已唤醒 · 点击、拖动、长按、甩动或双击');
                this.tone(0, .5);
            } else {
                this.cancelPointer();
                this.combo = 0;
            }
            this.syncAnimation();
        }

        status(text) {
            if (this.statusEl) this.statusEl.textContent = text;
        }

        updateHud() {
            const rounded = Math.round(this.energy);
            if (this.energyEl) this.energyEl.textContent = String(rounded).padStart(2, '0');
            if (this.energyFill) this.energyFill.style.width = `${rounded}%`;
        }

        interact(amount, label) {
            const now = performance.now();
            this.combo = now < this.comboDeadline ? Math.min(9, this.combo + 1) : 1;
            this.comboDeadline = now + 2200;
            this.energy = Math.min(100, this.energy + amount + Math.max(0, this.combo - 1));
            this.lastInteraction = now;
            this.status(`${label} · 连击 ×${this.combo}`);
            this.updateHud();
            if (this.energy >= 100) {
                this.status('WORLD RESONANCE · 世界共振');
                this.world.waves.push({ x: this.width / 2, y: this.height / 2, born: now, strength: 2.2, color: 1 });
                this.energy = 34;
                this.updateHud();
                this.tone(4, 1.2);
            }
        }

        recordSample(x, y, now = performance.now()) {
            const samples = this.pointer.samples;
            samples.push({ x, y, time: now });
            const cutoff = now - 140;
            while (samples.length > 2 && samples[0].time < cutoff) samples.shift();
            if (samples.length > 12) samples.splice(0, samples.length - 12);
        }

        releaseVelocity(x, y, now) {
            const samples = [...this.pointer.samples];
            const last = samples[samples.length - 1];
            if (!last || last.x !== x || last.y !== y) samples.push({ x, y, time: now });
            if (samples.length < 2) return { vx: 0, vy: 0, speed: 0 };
            const newest = samples[samples.length - 1];
            const oldest = samples.find(item => item.time >= newest.time - 120) || samples[0];
            const scale = 16.667 / Math.max(16, newest.time - oldest.time);
            const vx = (newest.x - oldest.x) * scale;
            const vy = (newest.y - oldest.y) * scale;
            return { vx, vy, speed: Math.hypot(vx, vy) };
        }

        onPointerDown(event) {
            // 水下环境音：用户在本页点一下才真正 start（浏览器自动播放策略）；已经在跑时只是 resume
            if (this._aqSound && this.settings.aquariumSound && this.settings.aquariumFish && this.settings.visualEffect === 'jellyfish') {
                const amount = Math.max(0, Math.min(1, (this.settings.intensity ?? 65) / 100));
                void this._aqSound.start({ amount });
            }
            if (this.tryGrab(event)) return;           // 按在一只水母上：抓水母优先于背景玩法
            if (!this.active || !this.isBackgroundTarget(event.target)) return;
            event.preventDefault();
            this.setPointer(event);
            const p = this.pointer;
            p.id = event.pointerId;
            p.down = true;
            p.started = performance.now();
            p.startX = p.x;
            p.startY = p.y;
            p.distance = 0;
            p.samples = [];
            this.recordSample(p.x, p.y, p.started);
            p.stroke = { points: [{ x: p.x, y: p.y }], born: p.started, finished: 0, color: this.combo % 3 };
            this.world.strokes.push(p.stroke);
        }

        onPointerMove(event) {
            if (this.hidden) return;
            if (!this.focused) this.noteHover();
            this.setPointer(event);
            if (this.grab) {
                if (event.pointerId === this.grab.id && event.buttons === 0) this.endGrab(event);    // 在窗口外放开时没收到 pointerup：按放开处理
                return;
            }
            this.updateGrabHover(event);
            if (!this.active) return;
            const p = this.pointer;
            if (!p.down || p.id !== event.pointerId) return;
            const distance = Math.hypot(p.vx, p.vy);
            p.distance += distance;
            this.recordSample(p.x, p.y);
            if (distance > 2.5 && p.stroke) {
                p.stroke.points.push({ x: p.x, y: p.y });
                if (p.stroke.points.length > 100) p.stroke.points.shift();
            }
            this.lastInteraction = performance.now();
        }

        onPointerUp(event) {
            if (this.grab) {
                if (event.pointerId === this.grab.id) this.endGrab(event);
                return;
            }
            const p = this.pointer;
            if (!this.active || !p.down || p.id !== event.pointerId) return;
            const now = performance.now();
            const recent = this.releaseVelocity(event.clientX, event.clientY, now);
            this.setPointer(event);
            p.down = false;
            const duration = now - p.started;
            const dx = p.x - p.startX;
            const dy = p.y - p.startY;
            const displacement = Math.hypot(dx, dy);
            const overallScale = 16.667 / Math.max(16, duration);
            const overall = { vx: dx * overallScale, vy: dy * overallScale };
            overall.speed = Math.hypot(overall.vx, overall.vy);
            const launch = recent.speed >= overall.speed ? recent : overall;
            if (p.stroke) p.stroke.finished = now;

            if (duration >= 550 && p.distance < 85) {
                this.world.cores.push({ x: p.x, y: p.y, born: now, life: 3200, charge: Math.min(1.6, duration / 900) });
                this.interact(15, '引力核心');
                this.tone(2, 1);
            } else if (p.distance > 64 && displacement > 52 && launch.speed > 4) {
                this.world.comets.push({ x: p.x, y: p.y, vx: launch.vx * .5, vy: launch.vy * .5, born: now, trail: [], color: this.combo % 3 });
                this.interact(16, '彗光');
                this.tone(3, 1);
            } else if (p.distance > 18) {
                this.interact(10, '织光');
                this.tone(1, .7);
            } else {
                const index = this.world.strokes.indexOf(p.stroke);
                if (index >= 0) this.world.strokes.splice(index, 1);
                this.world.waves.push({ x: p.x, y: p.y, born: now, strength: 1, color: this.combo % 3 });
                this.interact(8, '脉冲');
                this.tone(0, .7);
            }
            p.stroke = null;
            p.samples = [];
            p.id = null;
        }

        onDoubleClick(event) {
            if (!this.active || !this.isBackgroundTarget(event.target)) return;
            const now = performance.now();
            this.world.vortices.push({ x: event.clientX, y: event.clientY, born: now, life: 3600, direction: Math.random() > .5 ? 1 : -1 });
            this.interact(18, '旋涡');
            this.tone(4, 1);
        }

        cancelPointer() {
            this.pointer.down = false;
            this.pointer.id = null;
            this.pointer.stroke = null;
            this.pointer.samples = [];
            this.cancelGrab();
        }

        tone(note, strength) {
            if (!this.settings.soundEnabled || !this.active) return;
            try {
                this.audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
                const now = this.audioContext.currentTime;
                const oscillator = this.audioContext.createOscillator();
                const gain = this.audioContext.createGain();
                oscillator.type = 'sine';
                oscillator.frequency.value = [174.61, 220, 261.63, 329.63, 392][note % 5];
                gain.gain.setValueAtTime(.0001, now);
                gain.gain.exponentialRampToValueAtTime(.038 * strength, now + .012);
                gain.gain.exponentialRampToValueAtTime(.0001, now + .36);
                oscillator.connect(gain).connect(this.audioContext.destination);
                oscillator.start(now);
                oscillator.stop(now + .42);
            } catch { /* Web Audio 不可用时静默降级 */ }
        }

        glow(x, y, radius, color, alpha) {
            const gradient = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
            gradient.addColorStop(0, `rgba(${color.join(',')},${alpha})`);
            gradient.addColorStop(.38, `rgba(${color.join(',')},${alpha * .4})`);
            gradient.addColorStop(1, `rgba(${color.join(',')},0)`);
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(x, y, radius, 0, Math.PI * 2);
            this.ctx.fill();
        }

        drawPassive(now, dt) {
            const effect = this.root.dataset.visual;
            const amount = this.settings.intensity / 100;
            if (effect === 'jellyfish') this.drawJellyfish(now, dt, amount);
            if (effect === 'weather' && this.weather !== 'clear' && this.weather !== 'night') {
                for (const bit of this.weatherBits) {
                    if (this.weather === 'snow') {
                        bit.y += (.3 + bit.z * .55) * dt * .06;
                        bit.x += (Math.sin(now * .0007 + bit.y * .01) * .3 + bit.drift) * dt * .05;
                        if (bit.y > this.height + 8) { bit.y = -8; bit.x = Math.random() * this.width; }
                        this.ctx.beginPath();
                        this.ctx.fillStyle = `rgba(238,247,255,${(.25 + bit.z * .3) * amount})`;
                        this.ctx.arc(bit.x, bit.y, bit.size * 1.4, 0, Math.PI * 2);
                        this.ctx.fill();
                    } else {
                        bit.y += (7 + bit.z * 13) * dt * .06;
                        bit.x -= (2 + bit.z * 3) * dt * .06;
                        if (bit.y > this.height + 30 || bit.x < -30) { bit.y = -30; bit.x = Math.random() * (this.width + 100); }
                        this.ctx.beginPath();
                        this.ctx.strokeStyle = `rgba(145,202,255,${(.12 + bit.z * .24) * amount})`;
                        this.ctx.lineWidth = Math.max(.6, bit.z);
                        this.ctx.moveTo(bit.x, bit.y);
                        this.ctx.lineTo(bit.x - 6 * bit.z, bit.y + 20 * bit.z);
                        this.ctx.stroke();
                    }
                }
            }
            if (effect === 'liquid') {
                for (const blob of this.liquidBlobs) {
                    const dx = this.pointer.x - blob.x;
                    const dy = this.pointer.y - blob.y;
                    const distance = Math.max(1, Math.hypot(dx, dy));
                    if (distance < 260) {
                        const force = (1 - distance / 260) * amount;
                        blob.vx += (this.pointer.vx * .01 + dx / distance * .05) * force;
                        blob.vy += (this.pointer.vy * .01 + dy / distance * .05) * force;
                    }
                    blob.phase += dt * .0002;
                    blob.vx = (blob.vx + Math.sin(blob.phase) * .0018) * .987;
                    blob.vy = (blob.vy + Math.cos(blob.phase * .86) * .0018) * .987;
                    blob.x += blob.vx * dt * .06;
                    blob.y += blob.vy * dt * .06;
                    if (blob.x < -blob.radius) blob.x = this.width + blob.radius;
                    if (blob.x > this.width + blob.radius) blob.x = -blob.radius;
                    if (blob.y < -blob.radius) blob.y = this.height + blob.radius;
                    if (blob.y > this.height + blob.radius) blob.y = -blob.radius;
                    this.glow(blob.x, blob.y, blob.radius, COLORS[blob.color], .18 * amount);
                }
            }
        }

        applyWorldForces(orb, now, dt) {
            for (const core of this.world.cores) {
                const dx = core.x - orb.x;
                const dy = core.y - orb.y;
                const distance = Math.max(32, Math.hypot(dx, dy));
                const force = core.charge * 40 / distance;
                orb.vx += dx / distance * force * dt * .008;
                orb.vy += dy / distance * force * dt * .008;
            }
            for (const vortex of this.world.vortices) {
                const dx = vortex.x - orb.x;
                const dy = vortex.y - orb.y;
                const distance = Math.max(38, Math.hypot(dx, dy));
                if (distance > 300) continue;
                const force = (1 - distance / 300) * vortex.direction;
                orb.vx += (-dy / distance * force + dx / distance * .07) * dt * .013;
                orb.vy += (dx / distance * force + dy / distance * .07) * dt * .013;
            }
        }

        updateWorld(now, dt) {
            this.world.waves = this.world.waves.filter(item => now - item.born < 1500);
            this.world.strokes = this.world.strokes.filter(item => !item.finished || now - item.finished < 3600);
            this.world.cores = this.world.cores.filter(item => now - item.born < item.life);
            this.world.vortices = this.world.vortices.filter(item => now - item.born < item.life);
            this.world.comets = this.world.comets.filter(item => now - item.born < 3800);
            for (const orb of this.world.orbs) {
                this.applyWorldForces(orb, now, dt);
                orb.phase += dt * .001;
                orb.vx = (orb.vx + Math.sin(orb.phase) * .0015) * .992;
                orb.vy = (orb.vy + Math.cos(orb.phase * .86) * .0015) * .992;
                orb.x += orb.vx * dt * .05;
                orb.y += orb.vy * dt * .05;
                if (orb.x < 8 || orb.x > this.width - 8) orb.vx *= -.82;
                if (orb.y < 8 || orb.y > this.height - 8) orb.vy *= -.82;
            }
            for (const comet of this.world.comets) {
                comet.trail.unshift({ x: comet.x, y: comet.y });
                comet.trail.length = Math.min(comet.trail.length, 24);
                comet.x += comet.vx * dt * .055;
                comet.y += comet.vy * dt * .055;
                comet.vx *= .993;
                comet.vy *= .993;
                if (comet.x < 0 || comet.x > this.width) comet.vx *= -.84;
                if (comet.y < 0 || comet.y > this.height) comet.vy *= -.84;
            }
        }

        drawWorld(now) {
            const amount = this.settings.intensity / 100;
            for (const orb of this.world.orbs) {
                const pulse = .86 + Math.sin(now * .0014 + orb.phase) * .14;
                this.glow(orb.x, orb.y, orb.radius * 3.6, COLORS[orb.color], .1 * amount * pulse);
                this.ctx.beginPath();
                this.ctx.fillStyle = `rgba(${COLORS[orb.color].join(',')},${.34 * amount * pulse})`;
                this.ctx.arc(orb.x, orb.y, orb.radius * pulse, 0, Math.PI * 2);
                this.ctx.fill();
            }
            for (const wave of this.world.waves) {
                const t = (now - wave.born) / 1500;
                const radius = 18 + (now - wave.born) * .4 * wave.strength;
                this.ctx.beginPath();
                this.ctx.strokeStyle = `rgba(${COLORS[wave.color].join(',')},${(1 - t) * .35 * amount})`;
                this.ctx.lineWidth = 1.5;
                this.ctx.arc(wave.x, wave.y, radius, 0, Math.PI * 2);
                this.ctx.stroke();
            }
            for (const stroke of this.world.strokes) {
                if (stroke.points.length < 2) continue;
                const age = stroke.finished ? now - stroke.finished : 0;
                const alpha = stroke.finished ? Math.max(0, 1 - age / 3600) : 1;
                this.ctx.beginPath();
                this.ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
                for (let i = 1; i < stroke.points.length - 1; i++) {
                    const point = stroke.points[i];
                    const next = stroke.points[i + 1];
                    this.ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
                }
                this.ctx.lineCap = 'round';
                this.ctx.lineWidth = 7;
                this.ctx.strokeStyle = `rgba(${COLORS[stroke.color].join(',')},${alpha * .17 * amount})`;
                this.ctx.stroke();
            }
            for (const core of this.world.cores) {
                const t = (now - core.born) / core.life;
                this.glow(core.x, core.y, 85, COLORS[2], (1 - t) * .2 * amount);
                this.ctx.beginPath();
                this.ctx.strokeStyle = `rgba(${COLORS[2].join(',')},${(1 - t) * .55 * amount})`;
                this.ctx.arc(core.x, core.y, 40, 0, Math.PI * 2);
                this.ctx.stroke();
            }
            for (const vortex of this.world.vortices) {
                const t = (now - vortex.born) / vortex.life;
                for (let arm = 0; arm < 3; arm++) {
                    this.ctx.beginPath();
                    for (let i = 0; i < 42; i++) {
                        const p = i / 42;
                        const angle = p * Math.PI * 3.5 * vortex.direction + now * .002 + arm * Math.PI * .66;
                        const x = vortex.x + Math.cos(angle) * (16 + p * 80);
                        const y = vortex.y + Math.sin(angle) * (16 + p * 80);
                        if (i === 0) this.ctx.moveTo(x, y); else this.ctx.lineTo(x, y);
                    }
                    this.ctx.strokeStyle = `rgba(${COLORS[arm].join(',')},${(1 - t) * .18 * amount})`;
                    this.ctx.stroke();
                }
            }
            for (const comet of this.world.comets) {
                comet.trail.forEach((point, index) => this.glow(point.x, point.y, Math.max(5, 22 - index * .6), COLORS[comet.color], (1 - index / comet.trail.length) * .16 * amount));
                this.glow(comet.x, comet.y, 34, COLORS[comet.color], .34 * amount);
            }
        }

        frame(now) {
            this.frameRequest = null;
            if (this.hidden || !this.needsAnimation()) return;
            const dt = Math.min(34, now - this.lastFrame || 16);
            this.lastFrame = now;
            this.frameIndex++;
            if (this.resting && this.restSettle > 0) this.restSettle--;
            const lowRate = this.reduceMotion || this.saveData;
            if (!this.hidden && (!lowRate || this.frameIndex % 2 === 0)) {
                this.ctx.clearRect(0, 0, this.width, this.height);
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'screen';
                if (this.settings.enabled) this.drawPassive(now, dt);
                if (this.active) {
                    this.updateWorld(now, dt);
                    this.drawWorld(now);
                    this.energy = Math.max(0, this.energy - dt * .0025);
                    if (now > this.comboDeadline) this.combo = 0;
                    if (this.settings.autoCalmSeconds > 0 && now - this.lastInteraction > this.settings.autoCalmSeconds * 1000) {
                        this.setActive(false);
                    }
                    if (this.frameIndex % 10 === 0) this.updateHud();
                }
                this.ctx.restore();
            }
            this.syncAnimation();
        }
    }

    window.BackgroundExperience = { DEFAULTS, normalizeSettings };
    window.backgroundExperience = new BackgroundExperience();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.backgroundExperience.init(), { once: true });
    } else {
        window.backgroundExperience.init();
    }
})();
