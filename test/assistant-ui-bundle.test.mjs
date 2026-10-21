import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ASSISTANT_SCRIPTS, buildAssistantUI } from '../local-ai/scripts/build-assistant-ui.mjs';

test('工作台正式页面只加载一份与当前源文件一致的本地构建产物', async () => {
  const result = await buildAssistantUI({ check: true });
  const html = await readFile(new URL('../assistant.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(scripts, ['js/assistant-workbench.bundle.js?v=20261020-startup']);
  assert.equal(result.files, 11);
  assert.ok(result.outputBytes < result.sourceBytes);
  assert.equal(ASSISTANT_SCRIPTS.at(-1), 'js/assistant.js');
  assert.ok(ASSISTANT_SCRIPTS.indexOf('js/assistant-timeline.js') < ASSISTANT_SCRIPTS.length - 1);
  assert.match(html, /id="submit"[^>]*disabled/);
  assert.doesNotMatch(html, /<textarea\b[^>]*disabled/);
});
