// Isolated experiment. No extension storage, account APIs, or production entry point.
const status = document.getElementById('reef-status');
if (location.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(location.hostname)) {
  status.textContent = '请通过本地 demo 服务打开此页。';
  throw new Error('Demo requires loopback HTTP isolation.');
}

const scripts = [
  'task-crumple-core.js', 'task-crumple.js', 'jellyfish-core.js', 'jellyfish.js',
  'aquarium-core.js', 'aquarium-play-core.js', 'aquarium-play.js', 'aquarium-predation-core.js',
  'aquarium-flow-core.js', 'aquarium-light-core.js', 'aquarium-ambient.js',
  'jelly-species-shapes.js', 'marine-rig.js', 'marine-rig-canvas.js', 'marine-rig-data.js',
  'aquarium-yaw.js', 'aquarium-real.js', 'aquarium.js',
];

const settings = {
  enabled: true, visualEffect: 'jellyfish', intensity: 78, playgroundEnabled: false,
  jellyfishTasks: true, jellyfishNight: false, jellyfishDance: false, jellyfishGrow: false,
  aquariumFish: true, aquariumWater: true, aquariumRealistic: true, aquariumPredation: false,
  aquariumFlow: false, aquariumRays: false, aquariumSound: false,
};
const tasks = [
  { id: 'demo-light', title: '看一束光', priority: 'high', completed: false },
  { id: 'demo-feed', title: '喂一次鱼', priority: 'medium', completed: false },
  { id: 'demo-reef', title: '发现珊瑚礁', priority: 'low', completed: false },
];
const memory = {
  backgroundExperienceSettings: settings,
  aquariumV1: { v: 1, fish: ['tang', 'clown', 'clown', 'turtle', 'puffer'].map((species, i) => ({ id: `lab-${i}`, species, addedAt: i + 1 })) },
  memos: tasks,
};
const listeners = new Set();
const copy = value => value === undefined ? undefined : structuredClone(value);
function area(areaName) {
  return {
    async get(keys, callback) {
      const names = keys == null ? Object.keys(memory) : typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      const result = {};
      for (const key of names) result[key] = copy(memory[key] ?? (keys && !Array.isArray(keys) && typeof keys === 'object' ? keys[key] : undefined));
      callback?.(result); return result;
    },
    async set(items, callback) {
      const changes = {};
      for (const [key, value] of Object.entries(items)) {
        if (!['memos', 'aquariumV1', 'backgroundExperienceSettings'].includes(key)) throw new Error('Unknown demo storage key.');
        changes[key] = { oldValue: copy(memory[key]), newValue: copy(value) };
        memory[key] = copy(value);
      }
      for (const fn of listeners) fn(changes, areaName);
      callback?.();
    },
  };
}
// The loopback page has no extension identity. Replace all storage with a fresh in-memory fixture.
window.chrome = { storage: { local: area('local'), sync: area('sync'), onChanged: {
  addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn),
} }, runtime: { sendMessage: async () => ({ ok: false, reason: 'isolated-demo' }) } };

function renderTasks() {
  const list = document.getElementById('demo-tasks');
  list.replaceChildren(...memory.memos.map(task => {
    const item = document.createElement('li'); item.textContent = task.title;
    if (task.completed) item.classList.add('done');
    return item;
  }));
}
window.memoManager = { async completeTaskById(id) {
  const task = memory.memos.find(item => item.id === id);
  if (!task || task.completed) return { ok: false, reason: 'missing' };
  await window.chrome.storage.local.set({ memos: memory.memos.map(item => item.id === id ? { ...item, completed: true } : item) });
  renderTasks();
  const completed = memory.memos.filter(item => item.completed).length;
  document.getElementById('task-result').textContent = `已完成 ${completed}/3 项演示任务：${task.title}`;
  return { ok: true };
} };
renderTasks();

function loadScript(name) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('script');
    const timer = setTimeout(() => reject(new Error(`Demo script load timeout: ${name}`)), 15000);
    element.src = '/js/' + name;
    element.onload = () => { clearTimeout(timer); resolve(); };
    element.onerror = () => { clearTimeout(timer); reject(new Error(`Demo script unavailable: ${name}`)); };
    document.head.appendChild(element);
  });
}

let reef, paused = false, customUrl = null, frozen = null;
try {
  for (const script of scripts) await loadScript(script);
  const module = await import('./reef.bundle.mjs');
  reef = module.createReefLayer(document.getElementById('reef-canvas'), text => { status.textContent = text; });
  // Public host contract already used by the production water layer. No second frame loop.
  window.AquariumWater = reef;
  await loadScript('background-experience.js');
} catch (error) {
  status.textContent = '原型载入失败：' + error.message;
  throw error;
}

document.getElementById('reef-toggle').addEventListener('change', event => {
  reef.setVisible(event.target.checked);
});
document.getElementById('coverage').addEventListener('input', event => {
  const value = Math.max(20, Math.min(42, Number(event.target.value) || 32));
  document.getElementById('coverage-value').value = `${value}%`;
  reef.setCoverage(value / 100);
});
document.getElementById('pause').addEventListener('click', event => {
  paused = !paused;
  if (paused) {
    const live = document.getElementById('background-experience-canvas');
    frozen = document.createElement('canvas'); frozen.id = 'frozen-animals';
    frozen.width = live.width; frozen.height = live.height; frozen.getContext('2d').drawImage(live,0,0);
    document.body.appendChild(frozen);
  } else { frozen?.remove(); frozen = null; }
  window.backgroundExperience.setSuspended(paused || document.hidden);
  event.currentTarget.setAttribute('aria-pressed', String(paused));
  event.currentTarget.textContent = paused ? '继续游动' : '暂停观察';
});

// Optional, visibly labelled demo diagnostics. Read-only positions; normal host input still owns every drag.
let guideLayer = null, guideTimer = null;
document.getElementById('guide').addEventListener('click', event => {
  if (guideLayer) {
    clearInterval(guideTimer); guideLayer.remove(); guideLayer = null;
    event.currentTarget.textContent = '显示拖拽引导'; event.currentTarget.setAttribute('aria-pressed','false'); return;
  }
  guideLayer = document.createElement('div'); guideLayer.className = 'guide-layer'; document.body.appendChild(guideLayer);
  event.currentTarget.textContent = '隐藏拖拽引导'; event.currentTarget.setAttribute('aria-pressed','true');
  const renderGuide = () => {
    if (!guideLayer) return;
    const nodes = [];
    for (const j of window.JellyfishSkin._world()?.jellies || []) {
      if (j.taskId == null) continue;
      const mark = document.createElement('div'); mark.className = 'guide-marker';
      mark.dataset.kind = 'jelly'; mark.textContent = '任务水母';
      mark.style.left = `${j.x-j.r}px`; mark.style.top = `${j.y-j.r}px`;
      mark.style.width = mark.style.height = `${j.r*2}px`; nodes.push(mark);
    }
    for (const fish of (window.Aquarium._world()?.fish || []).filter(f => f.species === 'clown')) {
      const mark = document.createElement('div'); mark.className = 'guide-marker';
      mark.dataset.kind = 'fish'; mark.textContent = '小丑鱼';
      mark.style.left = `${fish.x-20}px`; mark.style.top = `${fish.y-20}px`;
      mark.style.width = mark.style.height = '40px'; nodes.push(mark);
    }
    const bin = window.TaskCrumpleCore.binPlacement(null,{width:innerWidth,height:innerHeight},0);
    const drop = document.createElement('div'); drop.className = 'guide-drop'; drop.textContent = '任务纸篓';
    drop.style.left = `${bin.left}px`; drop.style.top = `${bin.top}px`; drop.style.width = `${bin.width}px`; drop.style.height = `${bin.height}px`; nodes.push(drop);
    const netRect = document.querySelector('.aq-net')?.getBoundingClientRect();
    if (netRect) {
      const net = document.createElement('div'); net.className = 'guide-drop'; net.dataset.kind = 'fish-net'; net.textContent = '小鱼网兜';
      net.style.left = `${netRect.left}px`; net.style.top = `${netRect.top}px`; net.style.width = `${netRect.width}px`; net.style.height = `${netRect.height}px`; nodes.push(net);
    }
    guideLayer.replaceChildren(...nodes);
  };
  renderGuide(); guideTimer = setInterval(renderGuide,100);
});
document.addEventListener('visibilitychange', () => {
  // The host registers first. Preserve the user's explicit pause when the page returns.
  window.backgroundExperience.setSuspended(paused || document.hidden);
});
document.getElementById('reset').addEventListener('click', () => location.reload());
document.getElementById('collapse').addEventListener('click', event => {
  const body = document.getElementById('control-body'); body.hidden = !body.hidden;
  event.currentTarget.textContent = body.hidden ? '展开' : '收起';
  event.currentTarget.setAttribute('aria-expanded', String(!body.hidden));
});
const wallpaper = document.getElementById('wallpaper');
document.getElementById('background-select').addEventListener('change', event => {
  if (customUrl) { URL.revokeObjectURL(customUrl); customUrl = null; }
  wallpaper.style.backgroundImage = '';
  wallpaper.dataset.background = event.target.value;
});
document.getElementById('background-file').addEventListener('change', async event => {
  const file = event.target.files?.[0]; if (!file) return;
  if (file.size > 12 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    status.textContent = '请选择 12 MB 以内的 PNG、JPEG 或 WebP 图片。'; return;
  }
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const png = head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71;
  const jpeg = head[0] === 255 && head[1] === 216 && head[2] === 255;
  const webp = String.fromCharCode(...head.slice(0, 4)) === 'RIFF' && String.fromCharCode(...head.slice(8, 12)) === 'WEBP';
  if (!png && !jpeg && !webp) { status.textContent = '图片内容与支持的格式不匹配。'; return; }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width > 8192 || bitmap.height > 8192 || bitmap.width * bitmap.height > 32000000) throw new Error('resolution');
  } catch { status.textContent = '图片无法解码或尺寸过大，请选择较小图片。'; return; }
  finally { bitmap?.close(); }
  if (customUrl) URL.revokeObjectURL(customUrl);
  customUrl = URL.createObjectURL(file); wallpaper.dataset.background = 'custom';
  wallpaper.style.backgroundImage = `url("${customUrl}")`;
  status.textContent = '已使用本地图片，仅在这个 demo 页显示。';
});

const samples = [];
const uiTimer = setInterval(() => {
  document.getElementById('clock').textContent = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const fish = window.Aquarium.state(), jelly = window.JellyfishSkin.state(), view = reef.diagnostics();
  document.getElementById('diagnostics').textContent = `鱼 ${fish.fish} · 水母 ${jelly.jellies} · ${view.ready ? '3D 已就绪' : '3D 待启用'} · Three r${view.three} · 造景帧 ${view.frames} · CPU 提交 ${view.cpuMs.toFixed(1)} ms（不含 GPU）`;
  if (samples.length < 240) samples.push({ ...view, fish: fish.fish, jellies: jelly.jellies });
}, 1000);
// Read-only diagnostics for the isolated test harness, never used to drive business state.
window.reefLab = { diagnostics: () => ({ ...reef.diagnostics(), fish: window.Aquarium.state(), jelly: window.JellyfishSkin.state(), completed: memory.memos.filter(item => item.completed).length, paused, samples: copy(samples) }) };
window.addEventListener('pagehide', () => { clearInterval(uiTimer); clearInterval(guideTimer); reef.dispose(); window.Aquarium.stop(); window.JellyfishSkin.stop(); if (customUrl) URL.revokeObjectURL(customUrl); }, { once: true });
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
