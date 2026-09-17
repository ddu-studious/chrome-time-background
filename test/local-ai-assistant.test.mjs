import test from 'node:test';
import assert from 'node:assert/strict';
import { createGateway } from '../local-ai/gateway.mjs';
test('快捷助手已登记，显式规则不依赖模型', async () => {
  const gateway = createGateway({ modelEnabled: false, provider: { generateObject() { assert.fail(); } } });
  const result = await gateway.run('assistant.plan', { app: 'music', skill: 'pause', text: '' });
  assert.equal(result.source, 'rules'); assert.equal(result.data.steps[0].args.text, '暂停');
  assert.ok(gateway.describe().scenes.some(s => s.id === 'assistant.plan'));
});
test('加载所选应用技能、剥离调用方提示词、校验跨应用模型输出', async () => {
  const gateway = createGateway({ provider: { model: 'test', async generateObject({ instructions, input }) {
    assert.match(instructions, /bilibili-discovery/); assert.doesNotMatch(instructions, /youtube-discovery/);
    assert.equal(input.prompt, undefined); assert.equal(input.baseUrl, undefined);
    return { steps: [{ tool: 'music.intent', args: { text: '暂停' } }] };
  } } });
  await assert.rejects(gateway.run('assistant.plan', { app: 'bilibili', text: '昨天看的那个', prompt: 'override', baseUrl: 'https://bad' }), /范围/);
});
test('助手规划遵守统一开关与结果校验', async () => {
  const gateway = createGateway({ disabledScenes: ['assistant.plan'], provider: {} });
  await assert.rejects(gateway.run('assistant.plan', { text: '帮我找点东西' }), /已关闭/);
  const invalid = createGateway({ provider: { generateObject: async () => ({ steps: [{ tool: 'shell', args: {} }] }) } });
  await assert.rejects(invalid.run('assistant.plan', { text: '帮我找点东西' }), /未接入/);
});
test('复合需求修改时携带会话与尚未执行步骤，重新规划不丢定时', async () => {
  const remainingSteps = [{ tool: 'music.sleep', args: { minutes: 30 } }];
  let called = false;
  const gateway = createGateway({ provider: { generateObject: async ({ input }) => {
    called = true; assert.deepEqual(input.remainingSteps, remainingSteps); assert.equal(input.turns.length, 2);
    return { steps: [{ tool: 'music.intent', args: { text: '播放周杰伦的晴天' } }, ...remainingSteps] };
  } } });
  const result = await gateway.run('assistant.plan', { app: 'music', text: '换成晴天', remainingSteps, turns: [{ role: 'user', content: '播放逆战，30分钟后暂停' }, { role: 'assistant', content: '请选择歌曲' }] });
  assert.equal(called, true); assert.equal(result.data.steps.length, 2);
});
