import test from 'node:test';
import assert from 'node:assert/strict';
import music from '../js/music-intent.js';
import { createGateway } from '../local-ai/gateway.mjs';

test('明确点歌与基本控制走本地规则', () => {
  assert.deepEqual(music.parseLocal('播放周杰伦的晴天'), { action: 'search', kind: 'song', query: '周杰伦 晴天', title: '晴天', artist: '周杰伦' });
  assert.deepEqual(music.parseLocal('暫停播放'), { action: 'pause' });
  assert.deepEqual(music.parseLocal('暂停'), { action: 'pause' });
  assert.deepEqual(music.parseLocal('音量调到30%'), { action: 'volume', value: .3 });
  assert.deepEqual(music.parseLocal('听半小时就关掉'), { action: 'sleep', minutes: 30 });
  assert.equal(music.parseLocal('放点适合写代码的纯音乐'), null);
  assert.equal(music.parseLocal('播放晴天，然后半小时关闭'), null);
});
test('拒绝越权动作、URL、虚构 ID 及越界参数', () => {
  for (const raw of [
    { action: 'eval', script: 'test' }, { action: 'next', url: 'http://example.com' },
    { action: 'search', kind: 'song', query: '晴天', songId: 123 },
    { action: 'search', kind: 'song', query: 'https://example.com/song' },
    { action: 'volume', value: 2 }, { action: 'volume', delta: .5 },
    { action: 'volume', value: .2, delta: .1 }, { action: 'sleep', minutes: -1 },
    { action: 'sleep', minutes: 500 }, { action: 'clarify', question: '' }
  ]) assert.throws(() => music.validate(raw));
});
test('音乐场景使用统一门禁，规则可离线且模型结果必须校验', async () => {
  const disabled = createGateway({ modelEnabled: false, provider: { generateObject() { assert.fail('不能调用模型'); } } });
  assert.equal((await disabled.run('music.intent', { text: '下一首' })).source, 'rules');
  await assert.rejects(disabled.run('music.intent', { text: '给我放点好听的' }), /已关闭/);
  const gateway = createGateway({ provider: { async generateObject({ input }) {
    assert.deepEqual(input, { text: '给我放点好听的' });
    return { action: 'search', kind: 'song', query: '晴天', songId: 123 };
  } } });
  await assert.rejects(gateway.run('music.intent', { text: '给我放点好听的', cookies: 'secret' }), /不允许/);
});
