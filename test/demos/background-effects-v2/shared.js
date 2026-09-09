(() => {
  'use strict';

  const body = document.body;
  const effect = body.dataset.effect;
  const scene = document.getElementById('scene');
  const canvas = document.getElementById('fx');
  if (!scene || !canvas || !effect) return;

  const ctx = canvas.getContext('2d', { alpha: true });
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const pointer = { x: innerWidth / 2, y: innerHeight / 2, px: innerWidth / 2, py: innerHeight / 2, vx: 0, vy: 0, down: false };
  let width = 0;
  let height = 0;
  let dpr = 1;
  let intensity = reduceMotion ? 0.28 : 0.72;
  let paused = false;
  let lastFrame = 0;

  function resize() {
    width = innerWidth;
    height = innerHeight;
    dpr = Math.min(devicePixelRatio || 1, 1.75);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function isUiTarget(target) {
    return !!target.closest?.('.control-panel, .lab-bar, a, button, input');
  }

  function setPointer(event) {
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.vx = pointer.x - pointer.px;
    pointer.vy = pointer.y - pointer.py;
    if (paused) return;
    const nx = pointer.x / Math.max(width, 1) - .5;
    const ny = pointer.y / Math.max(height, 1) - .5;
    scene.style.setProperty('--mx', `${pointer.x}px`);
    scene.style.setProperty('--my', `${pointer.y}px`);
    if (!reduceMotion) {
      scene.style.setProperty('--depth-x', `${(-nx * 15 * intensity).toFixed(2)}px`);
      scene.style.setProperty('--depth-y', `${(-ny * 11 * intensity).toFixed(2)}px`);
    }
  }

  const intensityInput = document.getElementById('intensity');
  const intensityOutput = document.getElementById('intensity-output');
  if (intensityInput) {
    intensityInput.value = String(Math.round(intensity * 100));
    const updateIntensity = () => {
      intensity = Number(intensityInput.value) / 100;
      scene.style.setProperty('--intensity', intensity.toFixed(2));
      if (intensityOutput) intensityOutput.value = `${Math.round(intensity * 100)}%`;
    };
    intensityInput.addEventListener('input', updateIntensity);
    updateIntensity();
  }

  document.getElementById('pause-effect')?.addEventListener('click', event => {
    paused = !paused;
    body.classList.toggle('is-paused', paused);
    event.currentTarget.classList.toggle('active', paused);
    event.currentTarget.textContent = paused ? '继续效果' : '暂停效果';
  });

  const state = {
    ripples: [],
    weather: body.dataset.weather || 'rain',
    weatherBits: [],
    liquidBlobs: [],
    revealRadius: 150,
    timeValue: new Date().getHours() + new Date().getMinutes() / 60,
    timeTarget: null,
    timeDragging: false,
    playActive: false,
    playUntil: 0,
    holdStart: 0,
    ribbon: [],
    bubbles: [],
  };

  function seedWeather(type) {
    state.weatherBits = [];
    const count = type === 'rain' || type === 'storm' ? 160 : type === 'snow' ? 90 : 34;
    for (let i = 0; i < count; i++) {
      state.weatherBits.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z: .35 + Math.random() * .85,
        size: .7 + Math.random() * 2.4,
        drift: (Math.random() - .5) * .7,
      });
    }
  }

  function seedLiquid() {
    const palette = [
      [74, 140, 255], [110, 82, 255], [32, 220, 196], [255, 92, 176], [94, 196, 255],
    ];
    state.liquidBlobs = Array.from({ length: 12 }, (_, index) => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - .5) * .55,
      vy: (Math.random() - .5) * .55,
      radius: 95 + Math.random() * 160,
      color: palette[index % palette.length],
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function drawDepth(now) {
    ctx.clearRect(0, 0, width, height);
    state.ripples = state.ripples.filter(ripple => now - ripple.started < 1800);
    for (const ripple of state.ripples) {
      const t = (now - ripple.started) / 1800;
      const radius = 24 + t * 300;
      const alpha = (1 - t) * .72 * intensity;
      ctx.save();
      ctx.translate(ripple.x, ripple.y);
      for (let ring = 0; ring < 3; ring++) {
        const r = radius - ring * 16;
        if (r <= 0) continue;
        const cells = Math.max(28, Math.round(r * .6));
        for (let i = 0; i < cells; i++) {
          if ((i + ring) % 3 === 0) continue;
          const angle = i / cells * Math.PI * 2;
          const threshold = ((i * 13 + ring * 7) % 8) / 8;
          if (threshold > 1 - t * .72) continue;
          const size = 1.4 + (1 - t) * 2.5;
          ctx.fillStyle = `rgba(190,225,255,${alpha * (1 - ring * .2)})`;
          ctx.fillRect(Math.cos(angle) * r - size / 2, Math.sin(angle) * r - size / 2, size, size);
        }
      }
      ctx.restore();
    }
  }

  function drawWeather(now, dt) {
    ctx.clearRect(0, 0, width, height);
    const type = state.weather;
    if (type === 'clear') {
      const grad = ctx.createRadialGradient(width * .74, height * .12, 0, width * .74, height * .12, height * .8);
      grad.addColorStop(0, `rgba(255,218,151,${.23 * intensity})`);
      grad.addColorStop(.18, `rgba(255,202,121,${.09 * intensity})`);
      grad.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      return;
    }
    if (type === 'night') {
      for (const bit of state.weatherBits) {
        const pulse = .32 + Math.sin(now * .001 + bit.x) * .26;
        ctx.fillStyle = `rgba(190,222,255,${pulse * intensity})`;
        ctx.fillRect(bit.x, bit.y * .64, bit.size, bit.size);
      }
      return;
    }
    for (const bit of state.weatherBits) {
      if (type === 'snow') {
        bit.y += (.35 + bit.z * .6) * dt * .06;
        bit.x += (Math.sin(now * .0007 + bit.y * .01) * .35 + bit.drift) * dt * .05;
        if (bit.y > height + 10) { bit.y = -10; bit.x = Math.random() * width; }
        ctx.beginPath();
        ctx.fillStyle = `rgba(238,247,255,${(.35 + bit.z * .35) * intensity})`;
        ctx.arc(bit.x, bit.y, bit.size * 1.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        bit.y += (8 + bit.z * 15) * dt * .06;
        bit.x -= (2.5 + bit.z * 3.5) * dt * .06;
        if (bit.y > height + 35 || bit.x < -35) { bit.y = -35; bit.x = Math.random() * (width + 120); }
        ctx.beginPath();
        ctx.strokeStyle = `rgba(150,205,255,${(.16 + bit.z * .28) * intensity})`;
        ctx.lineWidth = Math.max(.7, bit.z * 1.2);
        ctx.moveTo(bit.x, bit.y);
        ctx.lineTo(bit.x - 7 * bit.z, bit.y + 22 * bit.z);
        ctx.stroke();
      }
    }
  }

  function drawLiquid(now, dt) {
    ctx.clearRect(0, 0, width, height);
    for (const blob of state.liquidBlobs) {
      const dx = pointer.x - blob.x;
      const dy = pointer.y - blob.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 280) {
        const force = (1 - dist / 280) * intensity;
        blob.vx += (pointer.vx * .012 + dx / dist * .08) * force;
        blob.vy += (pointer.vy * .012 + dy / dist * .08) * force;
      }
      blob.phase += dt * .00022;
      blob.vx += Math.sin(blob.phase) * .002;
      blob.vy += Math.cos(blob.phase * .87) * .002;
      blob.vx *= .986;
      blob.vy *= .986;
      blob.x += blob.vx * dt * .07;
      blob.y += blob.vy * dt * .07;
      if (blob.x < -blob.radius) blob.x = width + blob.radius;
      if (blob.x > width + blob.radius) blob.x = -blob.radius;
      if (blob.y < -blob.radius) blob.y = height + blob.radius;
      if (blob.y > height + blob.radius) blob.y = -blob.radius;
      const [r, g, b] = blob.color;
      const radius = blob.radius * (.72 + intensity * .55);
      const grad = ctx.createRadialGradient(blob.x, blob.y, 0, blob.x, blob.y, radius);
      grad.addColorStop(0, `rgba(${r},${g},${b},${.24 * intensity})`);
      grad.addColorStop(.45, `rgba(${r},${g},${b},${.13 * intensity})`);
      grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(blob.x, blob.y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function mixColor(a, b, t) {
    return a.map((value, index) => Math.round(value + (b[index] - value) * t));
  }

  function applyTime(value) {
    const hour = (value + 24) % 24;
    const stops = [
      { h: 0, c: [10, 18, 48], glow: [145, 184, 255], label: '深夜' },
      { h: 5, c: [35, 48, 91], glow: [255, 154, 140], label: '黎明' },
      { h: 7, c: [255, 167, 111], glow: [255, 215, 154], label: '清晨' },
      { h: 12, c: [88, 174, 235], glow: [255, 244, 194], label: '正午' },
      { h: 17.5, c: [239, 106, 89], glow: [255, 166, 112], label: '黄昏' },
      { h: 20, c: [37, 38, 83], glow: [162, 174, 255], label: '入夜' },
      { h: 24, c: [10, 18, 48], glow: [145, 184, 255], label: '深夜' },
    ];
    let left = stops[0];
    let right = stops[1];
    for (let i = 0; i < stops.length - 1; i++) {
      if (hour >= stops[i].h && hour <= stops[i + 1].h) { left = stops[i]; right = stops[i + 1]; break; }
    }
    const t = (hour - left.h) / Math.max(.001, right.h - left.h);
    const color = mixColor(left.c, right.c, t);
    const glow = mixColor(left.glow, right.glow, t);
    const daylight = Math.max(0, Math.sin((hour - 6) / 12 * Math.PI));
    const pathT = Math.max(0, Math.min(1, (hour - 5) / 15));
    const orbX = 8 + pathT * 84;
    const orbY = 78 - Math.sin(pathT * Math.PI) * 66;
    const skyAlpha = (.16 + (.4 + (1 - daylight) * .22) * intensity).toFixed(3);
    const shadeAlpha = (.1 + .32 * intensity).toFixed(3);
    const brightness = 1 - (1 - (.42 + daylight * .58)) * intensity;
    const saturation = 1 + ((.6 + daylight * .48) - 1) * intensity;
    const contrast = 1 + ((1.08 - daylight * .05) - 1) * intensity;
    scene.style.setProperty('--time-gradient', `linear-gradient(180deg, rgba(${color.join(',')},${skyAlpha}), rgba(${Math.round(color[0] * .45)},${Math.round(color[1] * .45)},${Math.round(color[2] * .55)},${shadeAlpha}))`);
    scene.style.setProperty('--time-filter', `brightness(${brightness.toFixed(3)}) saturate(${saturation.toFixed(3)}) contrast(${contrast.toFixed(3)})`);
    scene.style.setProperty('--orb-x', `${orbX}%`);
    scene.style.setProperty('--orb-y', `${orbY}%`);
    scene.style.setProperty('--orb-color', `rgb(${glow.join(',')})`);
    scene.style.setProperty('--orb-glow', `rgba(${glow.join(',')},.46)`);
    scene.style.setProperty('--orb-opacity', hour > 5 && hour < 20 ? .84 : .34);
    const readout = document.getElementById('time-readout');
    if (readout) {
      readout.querySelector('strong').textContent = `${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.floor((hour % 1) * 60)).padStart(2, '0')}`;
      readout.querySelector('span').textContent = t < .5 ? left.label : right.label;
    }
  }

  function drawPlay(now) {
    ctx.clearRect(0, 0, width, height);
    if (!state.playActive) return;
    state.ribbon.unshift({ x: pointer.x, y: pointer.y, born: now });
    state.ribbon = state.ribbon.filter((point, index) => index < 48 && now - point.born < 1400);
    const colors = ['112,205,255', '169,117,255', '77,238,195'];
    colors.forEach((color, layer) => {
      if (state.ribbon.length < 3) return;
      ctx.beginPath();
      const first = state.ribbon[0];
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < state.ribbon.length - 1; i++) {
        const point = state.ribbon[i];
        const next = state.ribbon[i + 1];
        const offset = Math.sin(i * .52 + now * .004 + layer) * (layer + 1) * 6;
        ctx.quadraticCurveTo(point.x + offset, point.y - offset, (point.x + next.x) / 2, (point.y + next.y) / 2);
      }
      ctx.strokeStyle = `rgba(${color},${(.28 - layer * .055) * intensity})`;
      ctx.lineWidth = (14 - layer * 4) * intensity;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
    state.bubbles = state.bubbles.filter(bubble => now - bubble.born < 1600);
    for (const bubble of state.bubbles) {
      const t = (now - bubble.born) / 1600;
      const r = 18 + t * 145;
      const grad = ctx.createRadialGradient(bubble.x, bubble.y, r * .55, bubble.x, bubble.y, r);
      grad.addColorStop(0, 'rgba(120,205,255,0)');
      grad.addColorStop(.75, `rgba(120,205,255,${(1 - t) * .09 * intensity})`);
      grad.addColorStop(1, `rgba(196,144,255,${(1 - t) * .42 * intensity})`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bubble.x, bubble.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame(now) {
    const dt = Math.min(34, now - lastFrame || 16);
    lastFrame = now;
    pointer.vx *= .83;
    pointer.vy *= .83;
    if (!paused) {
      if (effect === 'depth') drawDepth(now);
      if (effect === 'weather') drawWeather(now, dt);
      if (effect === 'liquid') drawLiquid(now, dt);
      if (effect === 'memory') {
        const target = pointer.down ? 290 : 142 + intensity * 72;
        state.revealRadius += (target - state.revealRadius) * .085;
        scene.style.setProperty('--reveal-radius', `${state.revealRadius.toFixed(1)}px`);
      }
      if (effect === 'time' && !state.timeDragging) {
        const target = state.timeTarget ?? (new Date().getHours() + new Date().getMinutes() / 60);
        let delta = target - state.timeValue;
        if (Math.abs(delta) > 12) delta -= Math.sign(delta) * 24;
        state.timeValue = (state.timeValue + delta * .07 + 24) % 24;
        applyTime(state.timeValue);
      }
      if (effect === 'play') {
        const playState = document.getElementById('play-state');
        if (state.holdStart && !state.playActive) {
          const progress = Math.min(1, (now - state.holdStart) / 650);
          playState?.style.setProperty('--hold-progress', progress);
          if (progress >= 1) activatePlay(now);
        }
        if (state.playActive && now > state.playUntil) deactivatePlay();
        drawPlay(now);
      }
    }
    requestAnimationFrame(frame);
  }

  function activatePlay(now) {
    state.playActive = true;
    state.playUntil = now + 8000;
    state.holdStart = 0;
    body.classList.add('play-active');
    const box = document.getElementById('play-state');
    box?.classList.add('visible');
    if (box) {
      box.querySelector('strong').textContent = '游乐场已唤醒';
      box.querySelector('span').textContent = '移动 · 点击 · 尽情搅动';
    }
    setTimeout(() => box?.classList.remove('visible'), 1100);
  }

  function deactivatePlay() {
    state.playActive = false;
    state.ribbon = [];
    state.bubbles = [];
    body.classList.remove('play-active');
    const box = document.getElementById('play-state');
    box?.classList.remove('visible');
  }

  window.addEventListener('resize', () => {
    resize();
    if (effect === 'weather') seedWeather(state.weather);
    if (effect === 'liquid') seedLiquid();
  });

  window.addEventListener('pointermove', event => {
    setPointer(event);
    if (effect === 'time' && state.timeDragging) {
      state.timeValue = Math.max(0, Math.min(23.99, event.clientX / width * 24));
      applyTime(state.timeValue);
    }
    if (effect === 'play' && state.playActive) state.playUntil = performance.now() + 8000;
  }, { passive: true });

  window.addEventListener('pointerdown', event => {
    setPointer(event);
    if (isUiTarget(event.target)) return;
    pointer.down = true;
    if (effect === 'time') {
      state.timeDragging = true;
      state.timeTarget = null;
      body.classList.add('dragging-time');
      state.timeValue = Math.max(0, Math.min(23.99, event.clientX / width * 24));
      applyTime(state.timeValue);
    }
    if (effect === 'play' && !state.playActive) {
      state.holdStart = performance.now();
      const box = document.getElementById('play-state');
      box?.classList.add('visible');
      if (box) {
        box.querySelector('strong').textContent = '继续长按';
        box.querySelector('span').textContent = '正在唤醒隐藏层';
      }
    }
  });

  window.addEventListener('pointerup', () => {
    pointer.down = false;
    if (effect === 'time') {
      state.timeDragging = false;
      state.timeTarget = new Date().getHours() + new Date().getMinutes() / 60;
      body.classList.remove('dragging-time');
    }
    if (effect === 'play' && state.holdStart && !state.playActive) {
      state.holdStart = 0;
      document.getElementById('play-state')?.classList.remove('visible');
    }
  });

  window.addEventListener('click', event => {
    if (isUiTarget(event.target)) return;
    if (effect === 'depth') state.ripples.push({ x: event.clientX, y: event.clientY, started: performance.now() });
    if (effect === 'play' && state.playActive) {
      state.bubbles.push({ x: event.clientX, y: event.clientY, born: performance.now() });
      state.playUntil = performance.now() + 8000;
    }
  });

  document.querySelectorAll('[data-weather]').forEach(button => {
    button.addEventListener('click', () => {
      state.weather = button.dataset.weather;
      body.dataset.weather = state.weather;
      document.querySelectorAll('[data-weather]').forEach(item => item.classList.toggle('active', item === button));
      seedWeather(state.weather);
      if (state.weather === 'storm') {
        const flash = document.querySelector('.scene-flash');
        flash?.classList.remove('hit');
        requestAnimationFrame(() => flash?.classList.add('hit'));
      }
    });
  });

  document.querySelectorAll('[data-time]').forEach(button => {
    button.addEventListener('click', () => {
      state.timeTarget = Number(button.dataset.time);
      document.querySelectorAll('[data-time]').forEach(item => item.classList.toggle('active', item === button));
    });
  });

  document.getElementById('wake-play')?.addEventListener('click', () => activatePlay(performance.now()));

  resize();
  setPointer({ clientX: width / 2, clientY: height / 2 });
  if (effect === 'weather') seedWeather(state.weather);
  if (effect === 'liquid') seedLiquid();
  if (effect === 'time') applyTime(state.timeValue);
  requestAnimationFrame(frame);
})();
