// Isolated UI fixture using production history storage/API shapes; never touches user data or models.
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { createHistoryStore } from './history-store.mjs';
import { createControlStore } from './control-store.mjs';
const history = createHistoryStore(), control = createControlStore();
history.configure({ captureContent: true, retentionDays: 30 }, 1);
for (const [i, content] of ['找适合学习的轻音乐', '请问喜欢钢琴还是吉他？', '钢琴，不要人声', '已找到三个候选，等待你选择。'].entries()) history.event({ id: `fixture-${i}`, conversationId: 'fixture-conversation', scene: 'assistant', role: i % 2 ? 'assistant' : 'user', content, status: i % 2 ? 'waiting' : 'planning' });
for (let i = 0; i < 3; i++) {
  const row = { requestId: `fixture-call-${i}`, conversationId: 'fixture-conversation', startedAt: Date.now(), scene: 'assistant.plan', source: 'model', status: 'ready', model: 'qwen/fixture', reasoning: i === 0 ? 'low' : 'off', elapsedMs: 1520 + i * 300, policyRevision: 3, usage: { inputTokens: 340, outputTokens: 68 } };
  const ticket = history.begin(row, { text: '隔离测试输入', turns: [] }, { conversationId: 'fixture-conversation' }); history.finish(ticket, row, { question: '测试回复' });
}
const shim = `globalThis.chrome={runtime:{sendMessage:async message=>(await fetch('/fixture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(message)})).json()}};`;
for (const [i, [tool, title, kind, parentId, status, input, output]] of [
  ['music.search', '搜索音乐', 'tool', null, 'waiting', { kind: 'artist', query: '张杰' }, { candidates: ['张杰'], count: 1 }],
  ['service.netease', '请求网易云音乐', 'request', 'fixture-tool-0', 'failed', ['/api/cloudsearch/get/web', { s: '张杰', type: 100 }], { code: 500, message: '暂不可用，随后尝试备用搜索' }],
  ['service.netease', '请求网易云音乐', 'request', 'fixture-tool-0', 'succeeded', ['/api/search/get/web', { s: '张杰', type: 100 }], { code: 200, count: 1 }],
  ['music.enqueue-collection', '执行所选操作', 'action', null, 'succeeded', { title: '替换队列并播放热门歌曲' }, { count: 50, currentSong: '明天过后' }],
  ['service.netease', '请求网易云音乐', 'request', 'fixture-tool-3', 'succeeded', ['/api/artist/top/song', { id: 'fixture-artist' }], { count: 50 }],
  ['music.playback.confirm', '等待播放器确认开始播放', 'operation', 'fixture-tool-3', 'succeeded', { title: '明天过后' }, { confirmed: true }]
].entries()) {
  const row = { role: 'tool', id: `fixture-tool-${i}`, conversationId: 'fixture-conversation', turnId: 'fixture-turn', tool, title, kind, parentId, startedAt: Date.now(), phase: 'start', input };
  history.event(row); history.event({ ...row, phase: 'end', endedAt: row.startedAt + 200 + i * 10, status, output });
}
const files = new Set(['/css/settings-page.css', '/css/settings-v5.css', '/css/ai-control.css', '/js/ai-control.js', '/js/ai-history.js']);
const server = http.createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const send = value => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
  if (path === '/fixture.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(shim); return; }
  if (path === '/fixture' && req.method === 'POST') {
    try {
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 65536) throw new Error('输入过长'); }
      const message = JSON.parse(raw), b = message.body;
      if (message.action === 'ai_history_write') {
        if (b.operation === 'configure') history.configure(b.settings, b.revision);
        else if (b.operation === 'delete') history.remove(b);
        else if (b.operation === 'clear' && b.confirm) history.remove({ all: true });
        return send({ ok: true, ...history.snapshot() });
      }
      if (message.action === 'ai_history_get') return send({ ok: true, ...history.snapshot() });
      if (message.action === 'ai_control_get') return send({ ok: true, ...control.snapshot(), scenes: [], records: [], jobs: [], usage: { day: '隔离测试', admitted: 3 } });
      if (message.action === 'local_ai_status') return send({ ok: true, model: '隔离预览模型', state: 'ready', models: [] });
      if (message.action === 'music_sleep_get') return send({ ok: true });
      return send({ ok: false, error: '隔离预览不操作真实服务' });
    } catch (error) { return send({ ok: false, error: error.message }); }
  }
  if (path === '/') {
    const section = readFileSync(new URL('../settings.html', import.meta.url), 'utf8').match(/<section class="sp-page settings-v5-special" id="page-ai-control">[\s\S]*?<\/section>/)[0];
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI 历史隔离预览</title><link rel="stylesheet" href="/css/settings-page.css"><link rel="stylesheet" href="/css/settings-v5.css"><link rel="stylesheet" href="/css/ai-control.css"><body><main style="max-width:960px;margin:auto;padding:20px"><p>隔离预览 · 示例对话，不访问真实模型或用户存储</p>${section.replace('id="page-ai-control"', 'id="page-ai-control" style="display:block"')}</main><script src="/fixture.js"></script><script src="/js/ai-control.js"></script><script src="/js/ai-history.js"></script></body></html>`); return;
  }
  if (!files.has(path)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(readFileSync(new URL('..' + path, import.meta.url)));
});
server.listen(19847, '127.0.0.1', () => console.log('AI 历史隔离预览：http://127.0.0.1:19847'));
