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
    });
    const VISUAL_EFFECTS = new Set(['none', 'depth', 'weather', 'memory', 'liquid', 'time']);
    const COLORS = [[112, 205, 255], [170, 111, 255], [79, 239, 194]];

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
            this.hidden = document.hidden;
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
            this.bound = false;
        }

        async init() {
            if (!this.root || !this.canvas || !this.ctx) return;
            await this.loadSettings();
            this.resize();
            this.seedWorld();
            this.bind();
            this.observeWeather();
            this.applySettings();
            requestAnimationFrame(time => this.frame(time));
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
            const visual = this.settings.enabled ? this.settings.visualEffect : 'none';
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
            this.toggle.addEventListener('click', () => this.setActive(!this.active));
            window.addEventListener('resize', () => {
                this.resize();
                this.seedWorld();
                this.seedWeather();
                this.seedLiquid();
            });
            document.addEventListener('visibilitychange', () => { this.hidden = document.hidden; });
            document.addEventListener('pointermove', event => this.onPointerMove(event), { passive: true });
            document.addEventListener('pointerdown', event => this.onPointerDown(event), true);
            document.addEventListener('pointerup', event => this.onPointerUp(event), true);
            document.addEventListener('pointercancel', () => this.cancelPointer(), true);
            document.addEventListener('dblclick', event => this.onDoubleClick(event), true);
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
            this.setPointer(event);
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
            const dt = Math.min(34, now - this.lastFrame || 16);
            this.lastFrame = now;
            this.frameIndex++;
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
            requestAnimationFrame(time => this.frame(time));
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
