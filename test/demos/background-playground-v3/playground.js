(() => {
  'use strict';

  const canvas = document.getElementById('world-canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  const body = document.body;
  const reduceMotion = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const palettes = {
    aurora: [[108, 205, 255], [177, 108, 255], [79, 242, 195]],
    ember: [[255, 179, 92], [242, 77, 129], [255, 112, 72]],
    tide: [[80, 227, 194], [63, 120, 255], [99, 207, 255]],
    mono: [[246, 251, 255], [115, 129, 151], [196, 219, 236]],
  };

  let paletteName = 'aurora';
  let colors = palettes[paletteName];
  let width = innerWidth;
  let height = innerHeight;
  let dpr = 1;
  let playing = false;
  let calm = false;
  let hidden = false;
  let soundEnabled = false;
  let audioContext = null;
  let energy = 0;
  let combo = 0;
  let comboDeadline = 0;
  let lastInteraction = performance.now();
  let statusTimer = 0;
  let lastFrame = 0;
  let frameIndex = 0;
  let resonanceArmed = true;

  const pointer = {
    id: null, x: width / 2, y: height / 2, px: width / 2, py: height / 2,
    vx: 0, vy: 0, down: false, started: 0, startX: 0, startY: 0,
    distance: 0, stroke: null, samples: [],
  };
  const world = { orbs: [], waves: [], strokes: [], cores: [], vortices: [], comets: [], sparks: [] };
  const discoveries = new Set();

  function setCssPalette() {
    const root = document.documentElement;
    root.style.setProperty('--accent', colors[0].join(', '));
    root.style.setProperty('--accent-2', colors[1].join(', '));
    root.style.setProperty('--accent-3', colors[2].join(', '));
  }

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

  function seedOrbs() {
    const count = reduceMotion ? 6 : 11;
    world.orbs = Array.from({ length: count }, (_, index) => ({
      x: width * (.32 + Math.random() * .62),
      y: height * (.14 + Math.random() * .68),
      vx: (Math.random() - .5) * .35,
      vy: (Math.random() - .5) * .35,
      radius: 5 + Math.random() * 11,
      color: index % 3,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function wake() {
    lastInteraction = performance.now();
    if (calm) {
      calm = false;
      body.classList.remove('calm');
      document.getElementById('calm-note').classList.remove('show');
      say('世界重新响应你的手势');
    }
  }

  function say(message) {
    const status = document.getElementById('gesture-status');
    status.textContent = message;
    status.classList.remove('pop');
    requestAnimationFrame(() => status.classList.add('pop'));
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => status.classList.remove('pop'), 520);
  }

  function unlock(id, message) {
    if (!discoveries.has(id)) {
      discoveries.add(id);
      const item = document.querySelector(`[data-discovery="${id}"]`);
      item?.classList.add('unlocked');
      const state = item?.querySelector('em');
      if (state) state.textContent = '已发现';
      document.getElementById('discovery-count').textContent = `${discoveries.size} / 5`;
      say(`新手势发现 · ${message}`);
      addEnergy(12, false);
    }
  }

  function addEnergy(amount, countCombo = true) {
    const now = performance.now();
    if (countCombo) {
      combo = now < comboDeadline ? Math.min(12, combo + 1) : 1;
      comboDeadline = now + 2400;
    }
    energy = Math.min(100, energy + amount + Math.max(0, combo - 1) * .8);
    updateHud();
    if (energy >= 100 && resonanceArmed) triggerResonance();
  }

  function updateHud() {
    document.getElementById('energy-value').textContent = String(Math.round(energy)).padStart(2, '0');
    document.getElementById('energy-fill').style.width = `${energy}%`;
    document.getElementById('combo-count').textContent = `×${combo}`;
    document.getElementById('combo-label').textContent = combo >= 8 ? '世界正在过载' : combo >= 5 ? '反馈开始叠加' : combo >= 2 ? '保持节奏' : playing ? '等待你的下一次输入' : '世界处于安静状态';
  }

  function tone(note = 0, strength = .7) {
    if (!soundEnabled) return;
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    oscillator.type = ['sine', 'triangle', 'sine'][note % 3];
    oscillator.frequency.value = [174.61, 220, 261.63, 329.63, 392][note % 5];
    filter.type = 'lowpass';
    filter.frequency.value = 900 + strength * 1800;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.045 * strength, now + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, now + .34 + strength * .2);
    oscillator.connect(filter).connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + .7);
  }

  function spawnWave(x, y, strength = 1) {
    world.waves.push({ x, y, born: performance.now(), strength, pushed: false, color: combo % 3 });
    if (world.waves.length > 22) world.waves.shift();
    unlock('pulse', '脉冲');
    addEnergy(8 * strength);
    tone(0, strength);
  }

  function finishStroke(stroke) {
    if (!stroke || stroke.points.length < 3) return;
    stroke.complete = true;
    stroke.finished = performance.now();
    unlock('weave', '织光');
    addEnergy(Math.min(13, 4 + stroke.points.length * .13));
    tone(1, .72);
  }

  function spawnCore(x, y, charge = 1) {
    world.cores.push({ x, y, born: performance.now(), life: 3000 + charge * 900, charge });
    if (world.cores.length > 4) world.cores.shift();
    unlock('core', '引力核心');
    addEnergy(15);
    tone(2, 1);
  }

  function spawnComet(x, y, vx, vy) {
    world.comets.push({ x, y, vx: vx * .48, vy: vy * .48, born: performance.now(), trail: [], color: combo % 3 });
    if (world.comets.length > 7) world.comets.shift();
    unlock('flick', '彗光');
    addEnergy(16);
    tone(3, 1);
  }

  function spawnVortex(x, y) {
    world.vortices.push({ x, y, born: performance.now(), life: 3600, direction: Math.random() > .5 ? 1 : -1 });
    if (world.vortices.length > 3) world.vortices.shift();
    unlock('vortex', '旋涡');
    addEnergy(18);
    tone(4, 1);
  }

  function triggerResonance() {
    resonanceArmed = false;
    const now = performance.now();
    const flash = document.getElementById('resonance-flash');
    flash.classList.remove('hit');
    requestAnimationFrame(() => flash.classList.add('hit'));
    for (let i = 0; i < (reduceMotion ? 18 : 52); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 6;
      world.sparks.push({ x: width / 2, y: height / 2, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, born: now, color: i % 3 });
    }
    world.waves.push({ x: width / 2, y: height / 2, born: now, strength: 2.2, pushed: false, color: 1 });
    say('WORLD RESONANCE · 世界共振');
    tone(4, 1.3);
    setTimeout(() => { energy = 34; resonanceArmed = true; updateHud(); }, 900);
  }

  function applyForces(orb, now, dt) {
    for (const core of world.cores) {
      const age = now - core.born;
      if (age > core.life) continue;
      const dx = core.x - orb.x;
      const dy = core.y - orb.y;
      const distance = Math.max(32, Math.hypot(dx, dy));
      const force = core.charge * 46 / distance;
      orb.vx += dx / distance * force * dt * .008;
      orb.vy += dy / distance * force * dt * .008;
    }
    for (const vortex of world.vortices) {
      if (now - vortex.born > vortex.life) continue;
      const dx = vortex.x - orb.x;
      const dy = vortex.y - orb.y;
      const distance = Math.max(38, Math.hypot(dx, dy));
      if (distance > 330) continue;
      const force = (1 - distance / 330) * vortex.direction;
      orb.vx += (-dy / distance * force + dx / distance * .08) * dt * .014;
      orb.vy += (dx / distance * force + dy / distance * .08) * dt * .014;
    }
    for (const wave of world.waves) {
      const age = now - wave.born;
      if (age > 1100) continue;
      const radius = 18 + age * .42 * wave.strength;
      const dx = orb.x - wave.x;
      const dy = orb.y - wave.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      if (Math.abs(distance - radius) < 34) {
        orb.vx += dx / distance * wave.strength * dt * .014;
        orb.vy += dy / distance * wave.strength * dt * .014;
      }
    }
  }

  function updatePhysics(now, dt) {
    world.cores = world.cores.filter(core => now - core.born < core.life);
    world.vortices = world.vortices.filter(vortex => now - vortex.born < vortex.life);
    world.waves = world.waves.filter(wave => now - wave.born < 1500);
    world.strokes = world.strokes.filter(stroke => !stroke.complete || now - stroke.finished < 4200);
    world.comets = world.comets.filter(comet => now - comet.born < 4200);
    world.sparks = world.sparks.filter(spark => now - spark.born < 1300);

    for (const orb of world.orbs) {
      applyForces(orb, now, dt);
      orb.phase += dt * .001;
      orb.vx += Math.sin(orb.phase) * .0015;
      orb.vy += Math.cos(orb.phase * .86) * .0015;
      orb.vx *= .992;
      orb.vy *= .992;
      orb.x += orb.vx * dt * .05;
      orb.y += orb.vy * dt * .05;
      if (orb.x < 12 || orb.x > width - 12) { orb.vx *= -.82; orb.x = Math.max(12, Math.min(width - 12, orb.x)); }
      if (orb.y < 12 || orb.y > height - 12) { orb.vy *= -.82; orb.y = Math.max(12, Math.min(height - 12, orb.y)); }
    }
    for (const comet of world.comets) {
      comet.trail.unshift({ x: comet.x, y: comet.y });
      comet.trail.length = Math.min(comet.trail.length, 28);
      comet.x += comet.vx * dt * .055;
      comet.y += comet.vy * dt * .055;
      comet.vx *= .993;
      comet.vy *= .993;
      if (comet.x < 0 || comet.x > width) comet.vx *= -.86;
      if (comet.y < 0 || comet.y > height) comet.vy *= -.86;
    }
    for (const spark of world.sparks) {
      spark.x += spark.vx * dt * .055;
      spark.y += spark.vy * dt * .055;
      spark.vx *= .985;
      spark.vy *= .985;
    }
  }

  function glow(x, y, radius, color, alpha) {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, `rgba(${color.join(',')},${alpha})`);
    grad.addColorStop(.35, `rgba(${color.join(',')},${alpha * .42})`);
    grad.addColorStop(1, `rgba(${color.join(',')},0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw(now) {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const orb of world.orbs) {
      const pulse = .86 + Math.sin(now * .0015 + orb.phase) * .14;
      glow(orb.x, orb.y, orb.radius * 4.2, colors[orb.color], .11 * pulse);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${colors[orb.color].join(',')},${.38 * pulse})`;
      ctx.arc(orb.x, orb.y, orb.radius * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.strokeStyle = `rgba(255,255,255,${.16 * pulse})`;
      ctx.lineWidth = 1;
      ctx.arc(orb.x - orb.radius * .16, orb.y - orb.radius * .18, orb.radius * .68, Math.PI * 1.1, Math.PI * 1.82);
      ctx.stroke();
    }

    for (const wave of world.waves) {
      const age = now - wave.born;
      const t = age / 1500;
      const radius = 18 + age * .42 * wave.strength;
      for (let ring = 0; ring < 3; ring++) {
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${colors[(wave.color + ring) % 3].join(',')},${(1 - t) * (.32 - ring * .07)})`;
        ctx.lineWidth = Math.max(.6, 2.3 - ring * .5);
        ctx.arc(wave.x, wave.y, Math.max(2, radius - ring * 15), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    for (const stroke of world.strokes) {
      if (stroke.points.length < 2) continue;
      const age = stroke.complete ? now - stroke.finished : 0;
      const alpha = stroke.complete ? Math.max(0, 1 - age / 4200) : 1;
      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath();
        ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
        for (let i = 1; i < stroke.points.length - 1; i++) {
          const point = stroke.points[i];
          const next = stroke.points[i + 1];
          const wobble = Math.sin(i * .48 + now * .003 + layer) * (layer + 1) * 3;
          ctx.quadraticCurveTo(point.x + wobble, point.y - wobble, (point.x + next.x) / 2, (point.y + next.y) / 2);
        }
        ctx.lineCap = 'round';
        ctx.lineWidth = 9 - layer * 3;
        ctx.strokeStyle = `rgba(${colors[(stroke.color + layer) % 3].join(',')},${alpha * (.18 - layer * .035)})`;
        ctx.stroke();
      }
    }

    for (const core of world.cores) {
      const t = (now - core.born) / core.life;
      const radius = 42 + Math.sin(now * .005) * 5;
      glow(core.x, core.y, radius * 2.2, colors[2], (1 - t) * .24);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${colors[2].join(',')},${(1 - t) * .62})`;
      ctx.lineWidth = 1.5;
      ctx.arc(core.x, core.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = `rgba(3,8,16,${.64 * (1 - t)})`;
      ctx.arc(core.x, core.y, 16 + core.charge * 5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const vortex of world.vortices) {
      const t = (now - vortex.born) / vortex.life;
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let i = 0; i < 50; i++) {
          const p = i / 50;
          const angle = p * Math.PI * 3.8 * vortex.direction + now * .002 * vortex.direction + arm * Math.PI * .66;
          const radius = 18 + p * 92;
          const x = vortex.x + Math.cos(angle) * radius;
          const y = vortex.y + Math.sin(angle) * radius;
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${colors[arm].join(',')},${(1 - t) * .2})`;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }

    for (const comet of world.comets) {
      comet.trail.forEach((point, index) => {
        const alpha = (1 - index / comet.trail.length) * .26;
        const size = Math.max(1, 8 - index * .25);
        glow(point.x, point.y, size * 2.8, colors[comet.color], alpha);
      });
      glow(comet.x, comet.y, 36, colors[comet.color], .38);
    }

    for (const spark of world.sparks) {
      const alpha = Math.max(0, 1 - (now - spark.born) / 1300);
      ctx.fillStyle = `rgba(${colors[spark.color].join(',')},${alpha * .72})`;
      ctx.fillRect(spark.x, spark.y, 2.2, 2.2);
    }

    if (pointer.down && playing) {
      const held = now - pointer.started;
      const progress = Math.min(1, held / 550);
      ctx.beginPath();
      ctx.strokeStyle = `rgba(${colors[2].join(',')},${.24 + progress * .52})`;
      ctx.lineWidth = 2;
      ctx.arc(pointer.x, pointer.y, 20 + progress * 24, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min(34, now - lastFrame || 16);
    lastFrame = now;
    frameIndex++;
    if (!hidden && (!reduceMotion || frameIndex % 2 === 0)) {
      if (playing && !calm) updatePhysics(now, dt);
      draw(now);
    }
    if (playing && !calm) {
      energy = Math.max(0, energy - dt * .0024);
      if (now > comboDeadline && combo !== 0) { combo = 0; updateHud(); }
      if (now - lastInteraction > 12000) setCalm(true, true);
      if (frameIndex % 12 === 0) updateHud();
    }
    requestAnimationFrame(loop);
  }

  function setCalm(value, automatic = false) {
    calm = value;
    body.classList.toggle('calm', calm);
    const button = document.getElementById('calm-toggle');
    button.setAttribute('aria-pressed', String(calm));
    button.textContent = calm ? '退出安静' : '安静模式';
    const note = document.getElementById('calm-note');
    note.classList.toggle('show', calm);
    if (automatic) note.textContent = '12 秒无操作 · 可玩层已自动休眠';
    else note.textContent = calm ? '可玩层已休眠 · 移动鼠标唤醒' : '';
  }

  function startPlaying() {
    playing = true;
    body.classList.add('playing');
    document.getElementById('intro-card').classList.add('hidden');
    say('可玩层已激活 · 从一次点击开始');
    wake();
  }

  function resetWorld() {
    world.waves = [];
    world.strokes = [];
    world.cores = [];
    world.vortices = [];
    world.comets = [];
    world.sparks = [];
    energy = 0;
    combo = 0;
    resonanceArmed = true;
    seedOrbs();
    updateHud();
    say('世界已重置，手势发现会保留');
  }

  function pointerPosition(event) {
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.vx = pointer.x - pointer.px;
    pointer.vy = pointer.y - pointer.py;
  }

  function recordPointerSample(x, y, now = performance.now()) {
    pointer.samples.push({ x, y, time: now });
    const cutoff = now - 140;
    while (pointer.samples.length > 2 && pointer.samples[0].time < cutoff) pointer.samples.shift();
    if (pointer.samples.length > 12) pointer.samples.splice(0, pointer.samples.length - 12);
  }

  function getReleaseVelocity(x, y, now = performance.now()) {
    const samples = [...pointer.samples];
    const last = samples[samples.length - 1];
    if (!last || last.x !== x || last.y !== y) samples.push({ x, y, time: now });
    if (samples.length < 2) return { vx: 0, vy: 0, speed: 0 };

    const newest = samples[samples.length - 1];
    const targetTime = newest.time - 120;
    let oldest = samples[0];
    for (const sample of samples) {
      if (sample.time >= targetTime) { oldest = sample; break; }
    }
    const elapsed = Math.max(16, newest.time - oldest.time);
    const frameScale = 16.667 / elapsed;
    const vx = (newest.x - oldest.x) * frameScale;
    const vy = (newest.y - oldest.y) * frameScale;
    return { vx, vy, speed: Math.hypot(vx, vy) };
  }

  canvas.addEventListener('pointerdown', event => {
    if (!playing || calm) return;
    wake();
    pointerPosition(event);
    pointer.id = event.pointerId;
    pointer.down = true;
    pointer.started = performance.now();
    pointer.startX = pointer.x;
    pointer.startY = pointer.y;
    pointer.distance = 0;
    pointer.samples = [];
    recordPointerSample(pointer.x, pointer.y, pointer.started);
    pointer.stroke = { points: [{ x: pointer.x, y: pointer.y }], complete: false, color: combo % 3 };
    world.strokes.push(pointer.stroke);
    canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener('pointermove', event => {
    pointerPosition(event);
    if (!playing) return;
    wake();
    if (!pointer.down || pointer.id !== event.pointerId || calm) return;
    const distance = Math.hypot(pointer.vx, pointer.vy);
    pointer.distance += distance;
    recordPointerSample(pointer.x, pointer.y);
    if (distance > 2.5 && pointer.stroke) {
      pointer.stroke.points.push({ x: pointer.x, y: pointer.y });
      if (pointer.stroke.points.length > 120) pointer.stroke.points.shift();
    }
  }, { passive: true });

  canvas.addEventListener('pointerup', event => {
    if (!pointer.down || pointer.id !== event.pointerId) return;
    const releasedAt = performance.now();
    const releaseVelocity = getReleaseVelocity(event.clientX, event.clientY, releasedAt);
    pointerPosition(event);
    pointer.down = false;
    const duration = releasedAt - pointer.started;
    const displacementX = pointer.x - pointer.startX;
    const displacementY = pointer.y - pointer.startY;
    const displacement = Math.hypot(displacementX, displacementY);
    const overallFrameScale = 16.667 / Math.max(16, duration);
    const overallVelocity = {
      vx: displacementX * overallFrameScale,
      vy: displacementY * overallFrameScale,
    };
    overallVelocity.speed = Math.hypot(overallVelocity.vx, overallVelocity.vy);
    const launchVelocity = releaseVelocity.speed >= overallVelocity.speed
      ? releaseVelocity
      : overallVelocity;
    canvas.dataset.lastGestureMetrics = JSON.stringify({
      duration: Math.round(duration),
      distance: Math.round(pointer.distance),
      displacement: Math.round(displacement),
      releaseSpeed: Number(releaseVelocity.speed.toFixed(2)),
      overallSpeed: Number(overallVelocity.speed.toFixed(2)),
      launchSpeed: Number(launchVelocity.speed.toFixed(2)),
    });
    const stroke = pointer.stroke;
    pointer.stroke = null;
    if (duration >= 550 && pointer.distance < 85) {
      if (stroke) { stroke.complete = true; stroke.finished = performance.now(); }
      spawnCore(pointer.x, pointer.y, Math.min(1.6, duration / 900));
    } else if (pointer.distance > 64 && displacement > 52 && launchVelocity.speed > 4) {
      finishStroke(stroke);
      spawnComet(pointer.x, pointer.y, launchVelocity.vx, launchVelocity.vy);
    } else if (pointer.distance > 18) {
      finishStroke(stroke);
    } else {
      if (stroke) world.strokes.splice(world.strokes.indexOf(stroke), 1);
      spawnWave(pointer.x, pointer.y);
    }
    pointer.samples = [];
    pointer.id = null;
  });

  canvas.addEventListener('pointercancel', () => {
    pointer.down = false;
    if (pointer.stroke) { pointer.stroke.complete = true; pointer.stroke.finished = performance.now(); }
    pointer.stroke = null;
    pointer.samples = [];
    pointer.id = null;
  });

  canvas.addEventListener('dblclick', event => {
    if (!playing || calm) return;
    wake();
    spawnVortex(event.clientX, event.clientY);
  });

  document.getElementById('start-play').addEventListener('click', startPlaying);
  document.getElementById('reset-world').addEventListener('click', resetWorld);
  document.getElementById('calm-toggle').addEventListener('click', () => setCalm(!calm));
  document.getElementById('sound-toggle').addEventListener('click', event => {
    soundEnabled = !soundEnabled;
    event.currentTarget.setAttribute('aria-pressed', String(soundEnabled));
    event.currentTarget.textContent = `声音：${soundEnabled ? '开' : '关'}`;
    if (soundEnabled) { tone(0, .55); say('声音反馈已开启'); }
  });

  document.querySelectorAll('[data-palette]').forEach(button => {
    button.addEventListener('click', () => {
      paletteName = button.dataset.palette;
      colors = palettes[paletteName];
      document.querySelectorAll('[data-palette]').forEach(item => item.classList.toggle('active', item === button));
      setCssPalette();
      say(`世界配色 · ${{ aurora: '极光', ember: '余烬', tide: '潮蓝', mono: '月白' }[paletteName]}`);
      wake();
    });
  });

  document.getElementById('demo-combo').addEventListener('click', () => {
    if (!playing) startPlaying();
    setCalm(false);
    const cx = width * .65;
    const cy = height * .42;
    const demoStroke = { points: [], complete: true, finished: performance.now() + 1000, color: 0 };
    for (let i = 0; i < 42; i++) demoStroke.points.push({ x: cx - 180 + i * 9, y: cy + Math.sin(i * .42) * 65 });
    world.strokes.push(demoStroke);
    unlock('weave', '织光');
    setTimeout(() => spawnWave(cx - 150, cy), 180);
    setTimeout(() => spawnCore(cx, cy, 1.2), 480);
    setTimeout(() => spawnComet(cx - 40, cy + 90, 34, -20), 820);
    setTimeout(() => spawnVortex(cx + 150, cy - 20), 1160);
    setTimeout(() => { energy = 100; updateHud(); if (resonanceArmed) triggerResonance(); }, 1650);
  });

  window.addEventListener('keydown', event => {
    if (!playing || calm || event.metaKey || event.ctrlKey || event.altKey) return;
    const keys = ['a', 's', 'd', 'f'];
    const index = keys.indexOf(event.key.toLowerCase());
    if (index < 0) return;
    const x = width * (.44 + index * .13);
    const y = height * (.3 + (index % 2) * .18);
    spawnWave(x, y, .8 + index * .12);
    tone(index, .8);
  });

  window.addEventListener('resize', () => { resize(); seedOrbs(); });
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

  resize();
  seedOrbs();
  setCssPalette();
  updateHud();
  requestAnimationFrame(loop);
})();
