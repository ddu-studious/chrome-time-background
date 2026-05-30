// ==================== 背景交互特效管理器 ====================
// 统一管理 5 种背景特效：粒子物理场 / 涟漪灵感 / 潮汐线 / 呼吸灯 / 星座连线
// 架构：单 Canvas 复用 + CSS 辅助层，配置存储于 chrome.storage.local

window.bgEffectsManager = (() => {
  'use strict';

  // ---- 12 星座模板数据 ----
  const CONSTELLATIONS = [
    { name: '白羊座', en: 'Aries', symbol: '♈', date: '3/21-4/19',
      points: [[0,0],[2,-1],[4,-0.5],[6,-1.5],[7,0],[8,1],[6,2]] },
    { name: '金牛座', en: 'Taurus', symbol: '♉', date: '4/20-5/20',
      points: [[0,0],[1,1],[3,2],[5,1.5],[7,2],[6,0],[4,-1],[2,-0.5]] },
    { name: '双子座', en: 'Gemini', symbol: '♊', date: '5/21-6/21',
      points: [[0,2],[1,0],[2,-1],[3,0],[3,2],[4,3],[5,2],[5,0],[6,-1]] },
    { name: '巨蟹座', en: 'Cancer', symbol: '♋', date: '6/22-7/22',
      points: [[0,1],[1,0],[3,-0.5],[5,0],[4,2],[2,2.5],[1,1.5]] },
    { name: '狮子座', en: 'Leo', symbol: '♌', date: '7/23-8/22',
      points: [[0,2],[1,0],[3,-1],[5,0],[6,2],[5,3],[3,4],[2,3],[1,2]] },
    { name: '处女座', en: 'Virgo', symbol: '♍', date: '8/23-9/22',
      points: [[0,0],[1,2],[3,3],[4,1],[5,3],[6,2],[7,0],[5,-1],[3,0]] },
    { name: '天秤座', en: 'Libra', symbol: '♎', date: '9/23-10/23',
      points: [[0,1],[2,0],[4,0],[6,1],[5,3],[3,3],[1,2]] },
    { name: '天蝎座', en: 'Scorpio', symbol: '♏', date: '10/24-11/22',
      points: [[0,0],[1,1],[3,1.5],[5,1],[6,0],[7,1],[8,2],[9,1.5]] },
    { name: '射手座', en: 'Sagittarius', symbol: '♐', date: '11/23-12/21',
      points: [[0,3],[2,2],[4,1],[6,0],[5,2],[4,3],[6,4],[7,3]] },
    { name: '摩羯座', en: 'Capricorn', symbol: '♑', date: '12/22-1/19',
      points: [[0,1],[2,0],[4,1],[5,3],[4,4],[2,3],[1,2]] },
    { name: '水瓶座', en: 'Aquarius', symbol: '♒', date: '1/20-2/18',
      points: [[0,0],[1,2],[3,1],[4,3],[6,2],[7,0],[5,-1]] },
    { name: '双鱼座', en: 'Pisces', symbol: '♓', date: '2/19-3/20',
      points: [[0,1],[2,0],[4,1],[3,3],[5,4],[7,3],[6,1]] },
  ];

  // ---- 灵感文案库 ----
  const INSIGHT_POOL = {
    poetry: [
      '落霞与孤鹜齐飞，秋水共长天一色',
      '大漠孤烟直，长河落日圆',
      '人生若只如初见，何事秋风悲画扇',
      '采菊东篱下，悠然见南山',
      '但愿人长久，千里共婵娟',
      '山有木兮木有枝，心悦君兮君不知',
      '人生得意须尽欢，莫使金樽空对月',
      '海内存知己，天涯若比邻',
      '千山鸟飞绝，万径人踪灭',
      '长风破浪会有时，直挂云帆济沧海',
      '会当凌绝顶，一览众山小',
      '春风得意马蹄疾，一日看尽长安花',
    ],
    quotes: [
      'Stay hungry, stay foolish. — Steve Jobs',
      'The only way to do great work is to love what you do.',
      'Think different.',
      'Move fast and break things.',
      '不积跬步，无以至千里',
      '知行合一',
      '大道至简',
      '生活就是解决一个又一个问题的过程',
    ],
  };

  // ---- 默认配置 ----
  const DEFAULT_CONFIG = {
    enabled: true,
    activeEffects: ['particles', 'constellation'],
    configs: {
      particles: {
        density: 60, mouseInteract: true, weatherSync: true,
        opacity: 0.6, connectLines: true, connectDistance: 100,
        particleSizeMin: 1, particleSizeMax: 4, speed: 0.5,
      },
      ripple: {
        showInsight: true, maxRipples: 3,
        rippleColor: 'rgba(167, 139, 250, 0.3)',
        insightSources: ['poetry', 'quotes'], duration: 2500,
      },
      tide: {
        amplitude: 4, speed: 0.5, layers: 3,
        color: '#4fc3f7', opacity: 0.3, position: 'bottom', height: 60,
      },
      breath: {
        syncWriting: true, color: 'auto', intensity: 0.4,
        pulseSpeed: 5, position: 'edges',
      },
      constellation: {
        starCount: 30, connectDistance: 120, mouseRadius: 150,
        mouseAsNode: true, twinkle: true,
        lineColor: 'rgba(99, 179, 237, 0.2)',
        starColor: 'rgba(255, 255, 255, 0.6)',
        showConstellationName: true,
        clickInteraction: true,
      },
    },
  };

  let _cfg = null;
  let _canvas = null;
  let _ctx = null;
  let W = 0, H = 0;
  let _raf = null;
  let _mouse = { x: -999, y: -999, active: false };
  let _lastFrameTime = 0;
  let _idleTimeout = null;
  let _isIdle = false;
  let _frameSkip = 0;
  let _initialized = false;

  // ---- 各效果引擎的状态 ----
  const _engines = {};

  // ==================================================================
  //  公共工具
  // ==================================================================
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function dist(x1, y1, x2, y2) {
    const dx = x1 - x2, dy = y1 - y2;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // ==================================================================
  //  1. 粒子物理场引擎 (particles)
  // ==================================================================
  class ParticleEngine {
    constructor() { this.particles = []; this._weatherMode = 'clear'; }

    get cfg() { return _cfg.configs.particles; }

    init() {
      this.particles = [];
      this._syncWeather();
      for (let i = 0; i < this.cfg.density; i++) {
        this.particles.push(this._createParticle());
      }
    }

    _syncWeather() {
      if (!this.cfg.weatherSync) return;
      try {
        const wEl = document.querySelector('.weather-desc');
        if (wEl) {
          const txt = wEl.textContent || '';
          if (/雨/.test(txt)) this._weatherMode = 'rain';
          else if (/雪/.test(txt)) this._weatherMode = 'snow';
          else if (/晴/.test(txt) || /多云/.test(txt)) this._weatherMode = 'clear';
          else this._weatherMode = 'clear';
        }
      } catch { /* ignore */ }
    }

    _createParticle() {
      const wm = this._weatherMode;
      const sMin = this.cfg.particleSizeMin;
      const sMax = this.cfg.particleSizeMax;
      return {
        x: Math.random() * W,
        y: wm === 'rain' ? -10 : Math.random() * H,
        size: Math.random() * (sMax - sMin) + sMin,
        vx: (Math.random() - 0.5) * this.cfg.speed,
        vy: wm === 'rain' ? Math.random() * 2 + 1 : (Math.random() - 0.5) * this.cfg.speed,
        opacity: Math.random() * 0.5 + 0.3,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        color: wm === 'rain' ? '#4fc3f7' : wm === 'snow' ? '#fff' : '#e0e0e0',
        angle: wm === 'snow' ? Math.random() * Math.PI * 2 : 0,
        angSpeed: wm === 'snow' ? (Math.random() - 0.5) * 0.02 : 0,
      };
    }

    update() {
      const spd = this.cfg.speed;
      const wm = this._weatherMode;
      const gravity = wm === 'rain' ? 0.025 : wm === 'snow' ? 0.004 : 0;

      for (const p of this.particles) {
        p.vy += gravity * spd;
        p.x += p.vx * spd;
        p.y += p.vy * spd;

        if (wm === 'snow') {
          p.angle += p.angSpeed;
          p.x += Math.sin(p.angle) * 0.3 * spd;
        }

        p.twinklePhase += p.twinkleSpeed;
        p.opacity = 0.3 + Math.sin(p.twinklePhase) * 0.2;

        if (this.cfg.mouseInteract && _mouse.active) {
          const d = dist(p.x, p.y, _mouse.x, _mouse.y);
          if (d < 150 && d > 0) {
            const force = (150 - d) / 150 * 0.8;
            p.x += (p.x - _mouse.x) / d * force;
            p.y += (p.y - _mouse.y) / d * force;
          }
        }

        if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
        if (p.y < -20) p.y = H + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.x < -10) p.x = W + 10;
      }
    }

    draw() {
      const globalAlpha = this.cfg.opacity;

      for (const p of this.particles) {
        _ctx.beginPath();
        if (this._weatherMode === 'rain') {
          _ctx.moveTo(p.x, p.y);
          _ctx.lineTo(p.x - p.vx * 2, p.y - 8);
          _ctx.strokeStyle = p.color;
          _ctx.globalAlpha = p.opacity * globalAlpha;
          _ctx.lineWidth = p.size * 0.5;
          _ctx.stroke();
        } else {
          _ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          _ctx.fillStyle = p.color;
          _ctx.globalAlpha = p.opacity * globalAlpha;
          _ctx.fill();
        }
      }

      if (this.cfg.connectLines && this._weatherMode !== 'rain') {
        const cd = this.cfg.connectDistance;
        for (let i = 0; i < this.particles.length; i++) {
          for (let j = i + 1; j < this.particles.length; j++) {
            const d = dist(this.particles[i].x, this.particles[i].y, this.particles[j].x, this.particles[j].y);
            if (d < cd) {
              const alpha = (1 - d / cd) * 0.15 * globalAlpha;
              _ctx.beginPath();
              _ctx.moveTo(this.particles[i].x, this.particles[i].y);
              _ctx.lineTo(this.particles[j].x, this.particles[j].y);
              _ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
              _ctx.globalAlpha = 1;
              _ctx.lineWidth = 0.5;
              _ctx.stroke();
            }
          }
        }
      }

      _ctx.globalAlpha = 1;
    }

    resize() {
      this.init();
    }
  }

  // ==================================================================
  //  2. 涟漪交互引擎 (ripple)
  // ==================================================================
  class RippleEngine {
    constructor() {
      this.ripples = [];
      this._lastClickTime = 0;
      this._insightEls = [];
    }

    get cfg() { return _cfg.configs.ripple; }

    init() {
      this.ripples = [];
      this._clearInsights();
    }

    _clearInsights() {
      for (const el of this._insightEls) el.remove();
      this._insightEls = [];
    }

    onClick(x, y) {
      const now = Date.now();
      if (now - this._lastClickTime < 300) return;
      this._lastClickTime = now;
      if (this.ripples.length >= this.cfg.maxRipples) return;

      this.ripples.push({
        x, y, startTime: performance.now(),
        maxRadius: 250, duration: this.cfg.duration,
      });

      if (this.cfg.showInsight) this._showInsight(x, y);
    }

    _showInsight(x, y) {
      const sources = this.cfg.insightSources || ['poetry'];
      const pool = sources.flatMap(s => INSIGHT_POOL[s] || []);
      if (!pool.length) return;
      const text = pool[Math.floor(Math.random() * pool.length)];

      const el = document.createElement('div');
      el.className = 'bgfx-insight';
      el.textContent = text;
      const textWidth = text.length * 14;
      el.style.left = Math.max(10, Math.min(W - textWidth - 10, x - textWidth / 2)) + 'px';
      el.style.top = (y - 30) + 'px';
      document.body.appendChild(el);

      requestAnimationFrame(() => el.classList.add('show'));

      setTimeout(() => {
        el.classList.remove('show');
        el.classList.add('fade');
        setTimeout(() => el.remove(), 1200);
      }, this.cfg.duration * 0.6);

      this._insightEls.push(el);
      if (this._insightEls.length > 5) {
        this._insightEls.shift()?.remove();
      }
    }

    update() {
      this.ripples = this.ripples.filter(r => {
        return (performance.now() - r.startTime) < r.duration;
      });
    }

    draw() {
      for (const r of this.ripples) {
        const p = Math.min(1, (performance.now() - r.startTime) / r.duration);
        const rings = [0, 0.3, 0.6];
        for (const offset of rings) {
          const ringP = Math.max(0, Math.min(1, (p - offset * 0.3) / (1 - offset * 0.3)));
          if (ringP <= 0) continue;
          const radius = ringP * r.maxRadius;
          const alpha = (1 - ringP) * 0.4;
          _ctx.beginPath();
          _ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
          _ctx.strokeStyle = `rgba(167, 139, 250, ${alpha})`;
          _ctx.lineWidth = 2 - ringP * 1.5;
          _ctx.stroke();

          if (ringP < 0.5) {
            const glowAlpha = (1 - ringP * 2) * 0.08;
            const grad = _ctx.createRadialGradient(r.x, r.y, radius * 0.8, r.x, r.y, radius);
            grad.addColorStop(0, 'rgba(167,139,250,0)');
            grad.addColorStop(1, `rgba(167,139,250,${glowAlpha})`);
            _ctx.beginPath();
            _ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
            _ctx.fillStyle = grad;
            _ctx.fill();
          }
        }
      }
    }

    resize() {}
  }

  // ==================================================================
  //  3. 潮汐线引擎 (tide)
  // ==================================================================
  class TideEngine {
    constructor() {}
    get cfg() { return _cfg.configs.tide; }
    init() {}

    update() {}

    draw() {
      const time = performance.now();
      const c = this.cfg;
      const { r, g, b } = hexToRgb(c.color);
      const totalLayers = c.layers;

      const drawWave = (yBase, layerIdx, flipped) => {
        const layerOp = c.opacity * (1 - layerIdx * 0.2);
        const freq = 0.003 + layerIdx * 0.001;
        const amp = c.amplitude * (1 - layerIdx * 0.15);
        const phase = time * c.speed * 0.0001 + layerIdx * 1.2;
        const vPhase = Math.sin(time * 0.0003 + layerIdx * 0.5) * amp * 0.5;

        _ctx.beginPath();
        if (flipped) {
          _ctx.moveTo(0, 0);
          for (let x = 0; x <= W; x += 3) {
            const y = yBase + Math.sin(x * freq + phase) * amp
              + Math.sin(x * freq * 0.5 + phase * 1.3) * amp * 0.5 + vPhase;
            _ctx.lineTo(x, y);
          }
          _ctx.lineTo(W, 0);
        } else {
          _ctx.moveTo(0, H);
          for (let x = 0; x <= W; x += 3) {
            const y = yBase - Math.sin(x * freq + phase) * amp
              - Math.sin(x * freq * 0.5 + phase * 1.3) * amp * 0.5 - vPhase;
            _ctx.lineTo(x, y);
          }
          _ctx.lineTo(W, H);
        }
        _ctx.closePath();

        const grad = flipped
          ? _ctx.createLinearGradient(0, 0, 0, yBase + c.height)
          : _ctx.createLinearGradient(0, yBase - c.height, 0, H);
        grad.addColorStop(0, `rgba(${r},${g},${b},${flipped ? 0 : layerOp})`);
        grad.addColorStop(0.5, `rgba(${r},${g},${b},${layerOp * 0.6})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},${flipped ? layerOp : 0})`);
        _ctx.fillStyle = grad;
        _ctx.fill();
      };

      if (c.position === 'bottom' || c.position === 'both') {
        for (let i = totalLayers - 1; i >= 0; i--) {
          drawWave(H - c.height + i * 8, i, false);
        }
      }
      if (c.position === 'top' || c.position === 'both') {
        for (let i = totalLayers - 1; i >= 0; i--) {
          drawWave(c.height - i * 8, i, true);
        }
      }
    }

    resize() {}
  }

  // ==================================================================
  //  4. 呼吸灯引擎 (breath) — CSS 驱动
  // ==================================================================
  class BreathEngine {
    constructor() { this._layer = null; this._state = 'idle'; }
    get cfg() { return _cfg.configs.breath; }

    init() {
      if (this._layer) return;
      this._layer = document.createElement('div');
      this._layer.className = 'bgfx-breath-layer';
      this._layer.innerHTML = `
        <div class="bgfx-breath-edge top"></div>
        <div class="bgfx-breath-edge bottom"></div>
        <div class="bgfx-breath-edge left"></div>
        <div class="bgfx-breath-edge right"></div>
        <div class="bgfx-breath-corner tl"></div>
        <div class="bgfx-breath-corner tr"></div>
        <div class="bgfx-breath-corner bl"></div>
        <div class="bgfx-breath-corner br"></div>`;
      document.body.appendChild(this._layer);
      this._updateMode();
      this._syncWritingState();
    }

    _syncWritingState() {
      if (!this.cfg.syncWriting) return;
      this._state = 'idle';
      const STATES = {
        idle: '100, 149, 237',
        writing: '79, 195, 247',
        goal: '255, 183, 77',
      };

      const check = () => {
        if (!this._layer) return;
        try {
          const blogPanel = document.getElementById('blog-panel');
          const isOpen = blogPanel && blogPanel.style.display !== 'none' &&
            !blogPanel.classList.contains('hidden');
          if (isOpen && this._state === 'idle') {
            this._state = 'writing';
          }
        } catch { /* ignore */ }
        const color = STATES[this._state] || STATES.idle;
        this._layer.querySelectorAll('.bgfx-breath-edge, .bgfx-breath-corner')
          .forEach(el => el.style.setProperty('--breath-color', color));
      };
      check();
      this._writingInterval = setInterval(check, 5000);
    }

    _updateMode() {
      if (!this._layer) return;
      const m = this.cfg.position;
      const edges = this._layer.querySelectorAll('.bgfx-breath-edge');
      const corners = this._layer.querySelectorAll('.bgfx-breath-corner');
      edges.forEach(e => e.style.display = (m === 'edges' || m === 'top') ? '' : 'none');
      corners.forEach(c => c.style.display = m === 'corners' ? '' : 'none');
      if (m === 'top') {
        edges.forEach(e => e.style.display = e.classList.contains('top') ? '' : 'none');
      }
    }

    update() {}

    draw() {
      if (!this._layer) return;
      const time = performance.now();
      const cycle = this.cfg.pulseSpeed * 1000;
      const phase = (time % cycle) / cycle;
      const breath = Math.sin(phase * Math.PI * 2) * 0.5 + 0.5;
      const value = this.cfg.intensity * (0.3 + breath * 0.7);
      this._layer.querySelectorAll('.bgfx-breath-edge, .bgfx-breath-corner')
        .forEach(el => el.style.setProperty('--breath-intensity', value.toFixed(3)));
    }

    destroy() {
      this._layer?.remove();
      this._layer = null;
      if (this._writingInterval) clearInterval(this._writingInterval);
    }

    resize() {}
  }

  // ==================================================================
  //  5. 星座连线引擎 (constellation) — 增强版：星座识别 + 点击交互
  // ==================================================================
  class ConstellationEngine {
    constructor() {
      this.stars = [];
      this._constellationZones = [];
      this._activeTooltip = null;
      this._clickCooldown = 0;
    }

    get cfg() { return _cfg.configs.constellation; }

    init() {
      this.stars = [];
      this._constellationZones = [];
      this._dismissTooltip();

      for (let i = 0; i < this.cfg.starCount; i++) {
        this.stars.push(this._createStar());
      }

      this._plantConstellations();
    }

    _createStar() {
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        baseSize: Math.random() * 2 + 1,
        size: 0,
        opacity: Math.random() * 0.4 + 0.3,
        baseOpacity: Math.random() * 0.4 + 0.3,
        twinklePhase: Math.random() * Math.PI * 2,
        twinkleSpeed: Math.random() * 0.03 + 0.01,
        activated: 0,
        color: Math.random() > 0.7 ? '#a8dadc' : Math.random() > 0.5 ? '#e0e0e0' : '#bbb',
        constellationId: -1,
      };
    }

    _plantConstellations() {
      const margin = 150;
      const zoneW = W - margin * 2;
      const zoneH = H - margin * 2;
      if (zoneW < 200 || zoneH < 200) return;

      const shuffled = [...CONSTELLATIONS].sort(() => Math.random() - 0.5);
      const count = Math.min(3, shuffled.length);

      const placed = [];
      for (let ci = 0; ci < count; ci++) {
        const template = shuffled[ci];
        const pts = template.points;

        const ptXs = pts.map(p => p[0]);
        const ptYs = pts.map(p => p[1]);
        const tW = Math.max(...ptXs) - Math.min(...ptXs);
        const tH = Math.max(...ptYs) - Math.min(...ptYs);

        const scale = Math.min(120, Math.min(zoneW / 4, zoneH / 3)) / Math.max(tW, tH, 1);

        let cx, cy, ok;
        for (let attempt = 0; attempt < 30; attempt++) {
          cx = margin + Math.random() * (zoneW - tW * scale);
          cy = margin + Math.random() * (zoneH - tH * scale);
          ok = true;
          for (const prev of placed) {
            if (dist(cx, cy, prev.cx, prev.cy) < 250) { ok = false; break; }
          }
          if (ok) break;
        }
        if (!ok) continue;

        const starIndices = [];
        const offsetX = Math.min(...ptXs);
        const offsetY = Math.min(...ptYs);

        for (const pt of pts) {
          const sx = cx + (pt[0] - offsetX) * scale;
          const sy = cy + (pt[1] - offsetY) * scale;
          const star = this._createStar();
          star.x = sx; star.y = sy;
          star.constellationId = ci;
          star.baseSize = 2;
          star.color = '#a8dadc';
          const idx = this.stars.length;
          this.stars.push(star);
          starIndices.push(idx);
        }

        const zone = {
          id: ci,
          name: template.name,
          en: template.en,
          symbol: template.symbol,
          date: template.date,
          cx: cx + (tW * scale) / 2,
          cy: cy + (tH * scale) / 2,
          radius: Math.max(tW, tH) * scale / 2 + 40,
          starIndices,
          edges: [],
          highlighted: false,
        };
        for (let i = 0; i < starIndices.length - 1; i++) {
          zone.edges.push([starIndices[i], starIndices[i + 1]]);
        }
        this._constellationZones.push(zone);
        placed.push(zone);
      }
    }

    onClick(x, y) {
      if (!this.cfg.clickInteraction) return;
      const now = Date.now();
      if (now - this._clickCooldown < 500) return;
      this._clickCooldown = now;

      for (const zone of this._constellationZones) {
        if (dist(x, y, zone.cx, zone.cy) < zone.radius) {
          this._showConstellationTooltip(zone);
          return;
        }
      }
      this._dismissTooltip();
    }

    _showConstellationTooltip(zone) {
      this._dismissTooltip();
      zone.highlighted = true;

      const el = document.createElement('div');
      el.className = 'bgfx-constellation-tooltip show';
      el.innerHTML = `
        <div class="bgfx-ct-symbol">${zone.symbol}</div>
        <div class="bgfx-ct-name">${zone.name}</div>
        <div class="bgfx-ct-en">${zone.en}</div>
        <div class="bgfx-ct-date">${zone.date}</div>`;
      el.style.left = zone.cx + 'px';
      el.style.top = (zone.cy - zone.radius - 20) + 'px';
      document.body.appendChild(el);
      this._activeTooltip = { el, zone };

      setTimeout(() => {
        this._dismissTooltip();
      }, 4000);
    }

    _dismissTooltip() {
      if (this._activeTooltip) {
        this._activeTooltip.zone.highlighted = false;
        const el = this._activeTooltip.el;
        el.classList.remove('show');
        el.classList.add('fade');
        setTimeout(() => el.remove(), 600);
        this._activeTooltip = null;
      }
    }

    update() {
      for (const star of this.stars) {
        if (this.cfg.twinkle) {
          star.twinklePhase += star.twinkleSpeed;
          star.opacity = star.baseOpacity + Math.sin(star.twinklePhase) * 0.15;
        }

        const d = dist(star.x, star.y, _mouse.x, _mouse.y);
        if (d < this.cfg.mouseRadius) {
          star.activated = Math.min(1, star.activated + 0.05);
        } else {
          star.activated = Math.max(0, star.activated - 0.02);
        }
        star.size = star.baseSize + star.activated * 2;
      }
    }

    draw() {
      // 星座固定连线（淡色骨架）
      for (const zone of this._constellationZones) {
        const highlight = zone.highlighted;
        for (const [a, b] of zone.edges) {
          const sa = this.stars[a], sb = this.stars[b];
          const baseAlpha = highlight ? 0.5 : 0.12;
          const alpha = baseAlpha + Math.max(sa.activated, sb.activated) * 0.3;
          _ctx.beginPath();
          _ctx.moveTo(sa.x, sa.y);
          _ctx.lineTo(sb.x, sb.y);
          _ctx.strokeStyle = highlight
            ? `rgba(168, 218, 220, ${alpha})`
            : `rgba(99, 179, 237, ${alpha})`;
          _ctx.lineWidth = highlight ? 1.2 : 0.8;
          _ctx.stroke();
        }

        if (this.cfg.showConstellationName && !zone.highlighted) {
          const anyActivated = zone.starIndices.some(i => this.stars[i].activated > 0.3);
          if (anyActivated) {
            _ctx.font = '11px -apple-system, "PingFang SC", sans-serif';
            _ctx.fillStyle = 'rgba(168, 218, 220, 0.4)';
            _ctx.textAlign = 'center';
            _ctx.fillText(zone.name, zone.cx, zone.cy + zone.radius + 16);
          }
        }
      }

      // 鼠标附近的动态连线
      for (let i = 0; i < this.stars.length; i++) {
        const si = this.stars[i];
        if (si.activated < 0.05) continue;

        for (let j = i + 1; j < this.stars.length; j++) {
          const sj = this.stars[j];
          const d = dist(si.x, si.y, sj.x, sj.y);
          if (d < this.cfg.connectDistance) {
            const alpha = (1 - d / this.cfg.connectDistance) * Math.min(si.activated, sj.activated) * 0.5;
            if (alpha < 0.01) continue;
            _ctx.beginPath();
            _ctx.moveTo(si.x, si.y);
            _ctx.lineTo(sj.x, sj.y);
            _ctx.strokeStyle = `rgba(99, 179, 237, ${alpha})`;
            _ctx.lineWidth = 0.6;
            _ctx.stroke();
          }
        }

        if (this.cfg.mouseAsNode && _mouse.active) {
          const d = dist(si.x, si.y, _mouse.x, _mouse.y);
          if (d < this.cfg.mouseRadius) {
            const alpha = (1 - d / this.cfg.mouseRadius) * 0.35;
            _ctx.beginPath();
            _ctx.moveTo(_mouse.x, _mouse.y);
            _ctx.lineTo(si.x, si.y);
            const grad = _ctx.createLinearGradient(_mouse.x, _mouse.y, si.x, si.y);
            grad.addColorStop(0, `rgba(99, 179, 237, ${alpha})`);
            grad.addColorStop(1, `rgba(99, 179, 237, ${alpha * 0.3})`);
            _ctx.strokeStyle = grad;
            _ctx.lineWidth = 0.5;
            _ctx.stroke();
          }
        }
      }

      // 绘制星点
      for (const star of this.stars) {
        const glow = star.activated * 8;
        if (glow > 0) {
          _ctx.beginPath();
          _ctx.arc(star.x, star.y, star.size + glow, 0, Math.PI * 2);
          _ctx.fillStyle = `rgba(99, 179, 237, ${star.activated * 0.1})`;
          _ctx.fill();
        }
        _ctx.beginPath();
        _ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        _ctx.fillStyle = star.color;
        _ctx.globalAlpha = star.opacity + star.activated * 0.3;
        _ctx.fill();
        _ctx.globalAlpha = 1;
      }

      // 鼠标节点
      if (this.cfg.mouseAsNode && _mouse.active) {
        _ctx.beginPath();
        _ctx.arc(_mouse.x, _mouse.y, 3, 0, Math.PI * 2);
        _ctx.fillStyle = 'rgba(99, 179, 237, 0.6)';
        _ctx.fill();
        _ctx.beginPath();
        _ctx.arc(_mouse.x, _mouse.y, 6, 0, Math.PI * 2);
        _ctx.fillStyle = 'rgba(99, 179, 237, 0.1)';
        _ctx.fill();
      }
    }

    resize() {
      this.init();
    }
  }

  // ==================================================================
  //  主循环
  // ==================================================================
  function _animationLoop(now) {
    _raf = requestAnimationFrame(_animationLoop);

    if (_isIdle) {
      _frameSkip++;
      if (_frameSkip % 4 !== 0) return;
    }

    const dt = now - _lastFrameTime;
    _lastFrameTime = now;
    if (dt > 200) return;

    _ctx.clearRect(0, 0, W, H);

    const active = _cfg.activeEffects;

    if (active.includes('particles') && _engines.particles) {
      _engines.particles.update();
      _engines.particles.draw();
    }
    if (active.includes('tide') && _engines.tide) {
      _engines.tide.update();
      _engines.tide.draw();
    }
    if (active.includes('constellation') && _engines.constellation) {
      _engines.constellation.update();
      _engines.constellation.draw();
    }
    if (active.includes('ripple') && _engines.ripple) {
      _engines.ripple.update();
      _engines.ripple.draw();
    }
    if (active.includes('breath') && _engines.breath) {
      _engines.breath.draw();
    }
  }

  // ==================================================================
  //  idle 检测
  // ==================================================================
  function _resetIdleTimer() {
    _isIdle = false;
    if (_idleTimeout) clearTimeout(_idleTimeout);
    _idleTimeout = setTimeout(() => { _isIdle = true; }, 5000);
  }

  // ==================================================================
  //  事件处理
  // ==================================================================
  function _onMouseMove(e) {
    _mouse.x = e.clientX;
    _mouse.y = e.clientY;
    _mouse.active = true;
    _resetIdleTimer();
  }

  function _onMouseLeave() {
    _mouse.x = -999;
    _mouse.y = -999;
    _mouse.active = false;
  }

  function _onClick(e) {
    if (!_cfg) return;
    const x = e.clientX, y = e.clientY;

    const target = e.target;
    if (target && target.closest && target.closest('.dock-bar, .main-layout, [class*="panel"], [class*="overlay"], .controls, button, a, input, select')) return;

    if (_cfg.activeEffects.includes('ripple') && _engines.ripple) {
      _engines.ripple.onClick(x, y);
    }
    if (_cfg.activeEffects.includes('constellation') && _engines.constellation) {
      _engines.constellation.onClick(x, y);
    }
  }

  function _onResize() {
    if (!_canvas) return;
    W = _canvas.width = window.innerWidth;
    H = _canvas.height = window.innerHeight;
    for (const key of Object.keys(_engines)) {
      _engines[key].resize?.();
    }
  }

  // ==================================================================
  //  公开 API
  // ==================================================================
  async function init() {
    if (_initialized) return;
    _initialized = true;

    _cfg = { ...DEFAULT_CONFIG };
    try {
      const stored = await new Promise(r =>
        chrome.storage.local.get('bgEffectsConfig', res => r(res.bgEffectsConfig))
      );
      if (stored) {
        _cfg.enabled = stored.enabled ?? _cfg.enabled;
        _cfg.activeEffects = stored.activeEffects ?? _cfg.activeEffects;
        if (stored.configs) {
          for (const key of Object.keys(_cfg.configs)) {
            if (stored.configs[key]) {
              _cfg.configs[key] = { ..._cfg.configs[key], ...stored.configs[key] };
            }
          }
        }
      }
    } catch { /* use defaults */ }

    if (!_cfg.enabled) {
      console.log('[BgEffects] 背景特效已禁用');
      return;
    }

    _canvas = document.getElementById('bg-effects-canvas');
    if (!_canvas) {
      _canvas = document.createElement('canvas');
      _canvas.id = 'bg-effects-canvas';
      _canvas.className = 'bgfx-canvas';
      const video = document.getElementById('background-video');
      if (video) {
        video.insertAdjacentElement('afterend', _canvas);
      } else {
        document.body.prepend(_canvas);
      }
    }
    _ctx = _canvas.getContext('2d');
    W = _canvas.width = window.innerWidth;
    H = _canvas.height = window.innerHeight;

    _engines.particles = new ParticleEngine();
    _engines.ripple = new RippleEngine();
    _engines.tide = new TideEngine();
    _engines.breath = new BreathEngine();
    _engines.constellation = new ConstellationEngine();

    for (const key of _cfg.activeEffects) {
      _engines[key]?.init();
    }

    document.addEventListener('mousemove', _onMouseMove, { passive: true });
    document.addEventListener('mouseleave', _onMouseLeave);
    document.addEventListener('click', _onClick);
    window.addEventListener('resize', _onResize);

    _lastFrameTime = performance.now();
    _raf = requestAnimationFrame(_animationLoop);
    _resetIdleTimer();

    console.log('[BgEffects] 背景特效已启动:', _cfg.activeEffects.join(', '));
  }

  function destroy() {
    if (_raf) cancelAnimationFrame(_raf);
    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('mouseleave', _onMouseLeave);
    document.removeEventListener('click', _onClick);
    window.removeEventListener('resize', _onResize);
    _engines.breath?.destroy();
    _engines.ripple?._clearInsights();
    _canvas?.remove();
    _canvas = null;
    _ctx = null;
    _initialized = false;
  }

  function setActiveEffects(effects) {
    if (!_cfg) return;
    const prev = new Set(_cfg.activeEffects);
    _cfg.activeEffects = effects;
    for (const e of effects) {
      if (!prev.has(e)) _engines[e]?.init();
    }
    for (const p of prev) {
      if (!effects.includes(p)) {
        if (p === 'breath') _engines.breath?.destroy();
      }
    }
    _saveConfig();
  }

  function getConfig() { return _cfg; }

  function updateConfig(effectKey, partial) {
    if (!_cfg?.configs[effectKey]) return;
    Object.assign(_cfg.configs[effectKey], partial);
    _engines[effectKey]?.init?.();
    _saveConfig();
  }

  function _saveConfig() {
    try {
      chrome.storage.local.set({ bgEffectsConfig: _cfg });
    } catch { /* ignore */ }
  }

  return { init, destroy, setActiveEffects, getConfig, updateConfig };
})();
