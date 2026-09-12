import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const token = readFileSync(new URL('./.local/token', import.meta.url), 'utf8').trim();
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const base = 'http://127.0.0.1:19841';
const request = async (path, body) => {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  const result = await res.json(); if (!res.ok) throw new Error(result.error); return result;
};
const cases = [
  { text: '明天下午三点开会，提前十分钟提醒我', expected: r => r.alarm?.time === '14:50' && r.alarm?.date === '2026-09-13' },
  { text: '每周一三五晚上八点提醒我运动', expected: r => r.alarm?.time === '20:00' && JSON.stringify(r.alarm?.days) === '[1,3,5]' },
  { text: '明天提醒我交周报', expected: r => r.status === 'needs_clarification' },
  { text: '下午四点半', turns: [{ role: 'user', content: '明天提醒我交周报' }, { role: 'assistant', content: '明天几点提醒你交周报？' }], expected: r => r.alarm?.date === '2026-09-13' && r.alarm?.time === '16:30' },
  { text: '下周三评审下午两点开始，提前半小时提醒我', expected: r => r.alarm?.date === '2026-09-16' && r.alarm?.time === '13:30' }
];
const results = [];
for (const item of cases) {
  const start = Date.now();
  let r = await request('/v1/alarms/interpret', { text: item.text, turns: item.turns || [], now: Date.parse('2026-09-12T10:00:00+08:00'), timeZone: 'Asia/Shanghai' });
  while (r.status === 'pending' && Date.now() - start < 105000) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    r = await request(`/v1/alarms/jobs/${r.jobId}`);
  }
  const result = { text: item.text, passed: r.ok && item.expected(r), elapsedMs: Date.now() - start, result: r };
  results.push(result); console.log(JSON.stringify(result));
}
writeFileSync(new URL('./.local/smoke-results.json', import.meta.url), JSON.stringify(results, null, 2));
assert.ok(results.every(r => r.passed), '部分真实模型用例失败');
