(() => {
  'use strict';

  const canvas = document.getElementById('garden-canvas');
  const ctx = canvas.getContext('2d', { alpha: true });
  const garden = document.getElementById('garden');
  const reduceMotion = matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
  const loopColors = [[116, 219, 255], [174, 112, 255], [86, 241, 190]];
  const loopNotes = [196, 246.94, 293.66];
  let width = innerWidth;
  let height = innerHeight;
  let dpr = 1;
  let entered = false;
  let recordReady = false;
  let recording = false;
  let recordStarted = 0;
  let currentPoints = [];
  let pointerId = null;
  let loops = [];
  let echoes = [];
  let harmonyCount = 0;
  let tempo = 1;
  let paused = false;
  let hidden = false;
  let soundEnabled = false;
  let audioContext = null;
  let lastFrame = 0;
  let guideTimer = 0;
  let bloomedForCount = 0;

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

  function say(message) {
    const guide = document.getElementById('guide');
    guide.textContent = message;
    guide.classList.remove('pop');
    requestAnimationFrame(() => guide.classList.add('pop'));
    clearTimeout(guideTimer);
    guideTimer = setTimeout(() => guide.classList.remove('pop'), 550);
  }

  function tone(frequency, duration = .28, volume = .035) {
    if (!soundEnabled || hidden) return;
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.012, now + duration);
    filter.type = 'lowpass';
    filter.frequency.value = 1300;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + .014);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(filter).connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + .05);
  }

  function normalizePoint(x, y, time, speed = 0) {
    return { x: x / width, y: y / height, time, speed };
  }

  function pointAt(loop, progress) {
    const points = loop.points;
    if (points.length === 1) return { x: points[0].x * width, y: points[0].y * height };
    const target = progress * loop.duration;
    let right = points.findIndex(point => point.time >= target);
    if (right <= 0) right = 1;
    if (right >= points.length) right = points.length - 1;
    const a = points[right - 1];
    const b = points[right];
    const mix = Math.max(0, Math.min(1, (target - a.time) / Math.max(1, b.time - a.time)));
    return {
      x: (a.x + (b.x - a.x) * mix) * width,
      y: (a.y + (b.y - a.y) * mix) * height,
      speed: a.speed + (b.speed - a.speed) * mix,
    };
  }

  function updateSlots() {
    document.getElementById('loop-count').textContent = `${loops.length} / 3`;
    document.querySelectorAll('[data-slot]').forEach((slot, index) => {
      const loop = loops[index];
      slot.classList.toggle('active', !!loop);
      const small = slot.querySelector('small');
      if (small) small.textContent = loop ? `${(loop.duration / 1000).toFixed(1)} 秒 · ${loop.points.length} 个轨迹点` : ['等待录制', '等待叠加', '等待绽放'][index];
    });
    const full = loops.length >= 3;
    const recordButton = document.getElementById('record-toggle');
    recordButton.disabled = full;
    recordButton.querySelector('span').textContent = full ? '已满三层' : recordReady || recording ? '取消录制' : '开始录制';
    document.getElementById('undo-loop').disabled = loops.length === 0;
    document.getElementById('clear-garden').disabled = loops.length === 0;
    document.getElementById('garden-state').textContent = loops.length === 0 ? '花园尚未苏醒' : loops.length === 1 ? '第一层正在循环' : loops.length === 2 ? '寻找轨迹交会点' : '三层生态正在共鸣';
    document.getElementById('harmony-count').textContent = `和声 ${harmonyCount}`;
  }

  function setRecordReady(value) {
    if (loops.length >= 3 && value) { say('已经有三层循环，请先撤销或清空'); return; }
    recordReady = value;
    const button = document.getElementById('record-toggle');
    button.classList.toggle('recording', recordReady || recording);
    button.querySelector('span').textContent = recordReady || recording ? '取消录制' : '开始录制';
    document.getElementById('record-hint').textContent = recordReady ? '准备好了：在右侧空白区域按住并画一条轨迹。' : '点击录制，再在右侧空白区域拖动。';
    if (recordReady) say('录制已准备 · 按住空白区域开始画');
  }

  function beginRecording(event) {
    recording = true;
    recordReady = false;
    recordStarted = performance.now();
    currentPoints = [normalizePoint(event.clientX, event.clientY, 0)];
    pointerId = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    document.getElementById('record-toggle').classList.add('recording');
    document.getElementById('record-toggle').querySelector('span').textContent = '正在录制';
    say('正在录制 · 松手后自动开始循环');
  }

  function finishRecording(cancel = false) {
    if (!recording) return;
    const capturedDuration = Math.min(6000, performance.now() - recordStarted);
    const pathLength = currentPoints.slice(1).reduce((total, point, index) => {
      const previous = currentPoints[index];
      return total + Math.hypot((point.x - previous.x) * width, (point.y - previous.y) * height);
    }, 0);
    const duration = capturedDuration >= 240
      ? capturedDuration
      : Math.min(2400, Math.max(900, pathLength * 3.2));
    recording = false;
    pointerId = null;
    document.getElementById('record-toggle').classList.remove('recording');
    if (!cancel && currentPoints.length >= 5 && (capturedDuration >= 240 || pathLength >= 80)) {
      if (capturedDuration < 240) {
        const sourceDuration = Math.max(1, currentPoints[currentPoints.length - 1].time);
        currentPoints = currentPoints.map((point, index) => ({
          ...point,
          time: sourceDuration > 1
            ? point.time / sourceDuration * duration
            : index / Math.max(1, currentPoints.length - 1) * duration,
        }));
      }
      const last = currentPoints[currentPoints.length - 1];
      if (last.time < duration) currentPoints.push({ ...last, time: duration });
      loops.push({
        points: currentPoints.slice(0, 160),
        duration: Math.max(900, duration),
        created: performance.now(),
        color: (loops.length % 3),
        lastPhase: 0,
        id: `${Date.now()}-${loops.length}`,
      });
      tone(loopNotes[loops.length - 1], .45, .045);
      say(`第 ${loops.length} 层回声开始循环`);
      if (loops.length === 3) triggerBloom();
    } else if (!cancel) {
      say('轨迹太短，再画得长一点');
    }
    currentPoints = [];
    document.getElementById('record-time').textContent = '0.0';
    updateSlots();
  }

  function createDemoLoop(index) {
    const points = [];
    const duration = 3600;
    const centerX = .62 + index * .035;
    const centerY = .42 + index * .045;
    const count = reduceMotion ? 55 : 90;
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      const angle = t * Math.PI * 2;
      const lobes = 2 + index;
      const radiusX = .14 + Math.sin(angle * lobes) * .032;
      const radiusY = .19 - index * .018;
      points.push({
        x: centerX + Math.cos(angle) * radiusX,
        y: centerY + Math.sin(angle) * radiusY,
        time: t * duration,
        speed: .5 + Math.abs(Math.sin(angle * lobes)) * .5,
      });
    }
    loops.push({ points, duration, created: performance.now(), color: index, lastPhase: 0, id: `demo-${index}-${Date.now()}` });
    updateSlots();
    tone(loopNotes[index], .42, .04);
  }

  function triggerBloom() {
    if (bloomedForCount === loops.length && loops.length === 3) return;
    bloomedForCount = loops.length;
    const bloom = document.getElementById('bloom');
    bloom.classList.remove('hit');
    requestAnimationFrame(() => bloom.classList.add('hit'));
    for (let i = 0; i < (reduceMotion ? 18 : 46); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 4.8;
      echoes.push({ type: 'seed', x: width * .63, y: height * .44, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, born: performance.now(), color: i % 3 });
    }
    [0, 1, 2].forEach((note, index) => setTimeout(() => tone(loopNotes[note], .7, .035), index * 110));
    say('GARDEN BLOOM · 三层回声让花园绽放');
  }

  function harmonyAt(a, b, pair, now) {
    if (Math.hypot(a.x - b.x, a.y - b.y) > 72) return;
    if (now - pair.lastHarmony < 1250) return;
    pair.lastHarmony = now;
    harmonyCount++;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    echoes.push({ type: 'ring', x, y, born: now, color: pair.color });
    if (echoes.length > 80) echoes.splice(0, echoes.length - 80);
    tone((loopNotes[pair.a] + loopNotes[pair.b]) / 2, .34, .026);
    updateSlots();
  }

  const harmonyPairs = [
    { a: 0, b: 1, color: 1, lastHarmony: 0 },
    { a: 1, b: 2, color: 2, lastHarmony: 0 },
    { a: 0, b: 2, color: 0, lastHarmony: 0 },
  ];

  function drawPath(loop, alpha = 1) {
    const points = loop.points;
    if (points.length < 2) return;
    const color = loopColors[loop.color];
    ctx.beginPath();
    ctx.moveTo(points[0].x * width, points[0].y * height);
    for (let i = 1; i < points.length - 1; i++) {
      const p = points[i];
      const n = points[i + 1];
      ctx.quadraticCurveTo(p.x * width, p.y * height, (p.x + n.x) * width / 2, (p.y + n.y) * height / 2);
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = `rgba(${color.join(',')},${.18 * alpha})`;
    ctx.stroke();
  }

  function glow(x, y, radius, color, alpha) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, `rgba(${color.join(',')},${alpha})`);
    gradient.addColorStop(.35, `rgba(${color.join(',')},${alpha * .42})`);
    gradient.addColorStop(1, `rgba(${color.join(',')},0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function render(now) {
    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const heads = [];

    loops.forEach(loop => {
      drawPath(loop);
      const rawPhase = ((now - loop.created) * tempo % loop.duration) / loop.duration;
      if (rawPhase < loop.lastPhase && !paused) tone(loopNotes[loop.color], .22, .022);
      loop.lastPhase = rawPhase;
      const head = pointAt(loop, rawPhase);
      heads.push(head);
      const color = loopColors[loop.color];
      const trailCount = reduceMotion ? 5 : 12;
      for (let i = trailCount; i >= 1; i--) {
        const phase = (rawPhase - i * .012 + 1) % 1;
        const point = pointAt(loop, phase);
        glow(point.x, point.y, 8 + (trailCount - i) * .7, color, (1 - i / trailCount) * .11);
      }
      glow(head.x, head.y, 42, color, .28);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${color.join(',')},.88)`;
      ctx.arc(head.x, head.y, 4.5 + (head.speed || 0) * 2.5, 0, Math.PI * 2);
      ctx.fill();
    });

    harmonyPairs.forEach(pair => {
      if (heads[pair.a] && heads[pair.b] && !paused) harmonyAt(heads[pair.a], heads[pair.b], pair, now);
    });

    if (recording && currentPoints.length > 1) {
      drawPath({ points: currentPoints, color: loops.length }, .9);
      const point = currentPoints[currentPoints.length - 1];
      glow(point.x * width, point.y * height, 34, loopColors[loops.length], .24);
    }

    echoes = echoes.filter(echo => now - echo.born < (echo.type === 'ring' ? 1300 : 1900));
    echoes.forEach(echo => {
      const age = now - echo.born;
      const color = loopColors[echo.color];
      if (echo.type === 'ring') {
        const t = age / 1300;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(${color.join(',')},${(1 - t) * .38})`;
        ctx.lineWidth = 1.4;
        ctx.arc(echo.x, echo.y, 12 + t * 105, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        echo.x += echo.vx;
        echo.y += echo.vy;
        echo.vx *= .985;
        echo.vy *= .985;
        const alpha = Math.max(0, 1 - age / 1900);
        ctx.fillStyle = `rgba(${color.join(',')},${alpha * .7})`;
        ctx.fillRect(echo.x, echo.y, 2.2, 2.2);
      }
    });
    ctx.restore();
  }

  function frame(now) {
    const dt = now - lastFrame || 16;
    lastFrame = now;
    if (!hidden && (!reduceMotion || Math.floor(now / 32) !== Math.floor((now - dt) / 32))) render(now);
    if (recording) {
      const elapsed = Math.min(6000, now - recordStarted);
      document.getElementById('record-time').textContent = (elapsed / 1000).toFixed(1);
      if (elapsed >= 6000) finishRecording(false);
    }
    requestAnimationFrame(frame);
  }

  document.getElementById('enter-garden').addEventListener('click', () => {
    entered = true;
    garden.classList.add('awake');
    document.getElementById('welcome').classList.add('hidden');
    say('点击“开始录制”，然后在空白区域画一条轨迹');
  });

  document.getElementById('record-toggle').addEventListener('click', () => {
    if (!entered) {
      document.getElementById('enter-garden').click();
      setTimeout(() => setRecordReady(true), 350);
      return;
    }
    if (recording) finishRecording(true);
    else setRecordReady(!recordReady);
  });

  canvas.addEventListener('pointerdown', event => {
    if (!entered || paused || !recordReady) return;
    beginRecording(event);
  });

  canvas.addEventListener('pointermove', event => {
    garden.style.setProperty('--mx', `${event.clientX}px`);
    garden.style.setProperty('--my', `${event.clientY}px`);
    if (!recording || event.pointerId !== pointerId) return;
    const now = performance.now();
    const elapsed = Math.min(6000, now - recordStarted);
    const last = currentPoints[currentPoints.length - 1];
    const x = event.clientX / width;
    const y = event.clientY / height;
    const distance = Math.hypot(x - last.x, y - last.y) * Math.min(width, height);
    if (distance < 3 && elapsed - last.time < 45) return;
    const speed = Math.min(1, distance / Math.max(8, elapsed - last.time) / .9);
    currentPoints.push({ x, y, time: elapsed, speed });
    if (currentPoints.length > 160) currentPoints.splice(1, 1);
  }, { passive: true });

  canvas.addEventListener('pointerup', event => {
    if (recording && event.pointerId === pointerId) finishRecording(false);
  });
  canvas.addEventListener('pointercancel', () => finishRecording(true));

  document.getElementById('tempo').addEventListener('input', event => {
    tempo = Number(event.target.value) / 100;
    document.getElementById('tempo-output').value = `${tempo.toFixed(2)}×`;
  });

  document.querySelectorAll('[data-mood]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('[data-mood]').forEach(item => item.classList.toggle('active', item === button));
      garden.dataset.mood = button.dataset.mood;
      say(`花园氛围 · ${button.textContent}`);
    });
  });

  document.getElementById('sound-toggle').addEventListener('click', event => {
    soundEnabled = !soundEnabled;
    event.currentTarget.setAttribute('aria-pressed', String(soundEnabled));
    event.currentTarget.textContent = `声音：${soundEnabled ? '开' : '关'}`;
    if (soundEnabled) { tone(loopNotes[0], .3, .035); say('声音回声已开启'); }
  });

  document.getElementById('pause-toggle').addEventListener('click', event => {
    paused = !paused;
    document.body.classList.toggle('paused', paused);
    event.currentTarget.setAttribute('aria-pressed', String(paused));
    event.currentTarget.textContent = paused ? '继续花园' : '暂停花园';
    loops.forEach(loop => { loop.created = performance.now() - loop.lastPhase * loop.duration / tempo; });
    say(paused ? '花园已暂停' : '花园继续生长');
  });

  document.getElementById('undo-loop').addEventListener('click', () => {
    if (!loops.length) return;
    loops.pop();
    bloomedForCount = 0;
    harmonyCount = 0;
    harmonyPairs.forEach(pair => { pair.lastHarmony = 0; });
    updateSlots();
    say('已撤销最后一层回声');
  });

  document.getElementById('clear-garden').addEventListener('click', () => {
    loops = [];
    echoes = [];
    harmonyCount = 0;
    bloomedForCount = 0;
    harmonyPairs.forEach(pair => { pair.lastHarmony = 0; });
    updateSlots();
    say('花园已清空');
  });

  document.getElementById('demo-garden').addEventListener('click', () => {
    if (!entered) document.getElementById('enter-garden').click();
    loops = [];
    echoes = [];
    harmonyCount = 0;
    bloomedForCount = 0;
    updateSlots();
    createDemoLoop(0);
    setTimeout(() => createDemoLoop(1), 520);
    setTimeout(() => {
      createDemoLoop(2);
      const syncedAt = performance.now();
      loops.forEach(loop => { loop.created = syncedAt; loop.lastPhase = 0; });
      triggerBloom();
    }, 1040);
  });

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });
  resize();
  updateSlots();
  requestAnimationFrame(frame);
})();
