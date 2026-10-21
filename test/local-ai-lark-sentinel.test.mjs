import test from 'node:test';
import assert from 'node:assert/strict';
import { LarkSentinel, cleanMetaText, parseCliVersion, isVersionSupported, projectAtMeMetadata } from '../local-ai/lark-sentinel.mjs';

test('parseCliVersion 与 isVersionSupported：识别 >= 1.0.92，拒绝旧版 1.0.2', () => {
  assert.deepEqual(parseCliVersion('lark-cli version 1.0.92\n'), [1, 0, 92]);
  assert.deepEqual(parseCliVersion('1.0.2'), [1, 0, 2]);
  assert.equal(parseCliVersion('invalid'), null);
  assert.equal(isVersionSupported([1, 0, 92]), true);
  assert.equal(isVersionSupported([1, 0, 98]), true);
  assert.equal(isVersionSupported([1, 0, 2]), false);
  assert.equal(isVersionSupported(null), false);
});

test('projectAtMeMetadata：只保留群名、发送者与计数，绝不泄漏消息正文 content，排除已撤回消息并清洗控制字符', () => {
  const messages = [
    {
      message_id: 'om_secret_1',
      content: '这是机密正文 SECRET_BODY_12345',
      create_time: '1760840000',
      chat_name: '架构\u202e讨论群\n',
      sender: { name: '张\u0007三' },
      mentions: [{ id: 'ou_me', name: '刘庆文' }],
    },
    {
      message_id: 'om_secret_2',
      content: '另一条机密正文 DO_NOT_LEAK',
      create_time: '1760840100000',
      chat_name: '架构讨论群',
      sender: { name: '李四' },
      mentions: [{ key: '@_all', name: '所有人' }],
    },
    {
      message_id: 'om_deleted',
      content: '已撤回',
      deleted: true,
      create_time: '1760840200000',
      chat_name: '架构讨论群',
      sender: { name: '王五' },
      mentions: [{ id: 'ou_me' }],
    },
    {
      message_id: 'om_not_at_me',
      content: '普通群聊',
      create_time: '1760840300000',
      chat_name: '普通群',
      sender: { name: '赵六' },
      mentions: [{ id: 'ou_other' }],
    },
  ];

  const meta = projectAtMeMetadata(messages, { openId: 'ou_me', filterMentions: true, sinceMs: 1760839000000 });
  assert.equal(meta.count, 2);
  assert.deepEqual(meta.chats, [{ name: '架构讨论群', count: 2 }]);
  assert.deepEqual(meta.senders, ['张 三', '李四']);
  assert.equal(meta.newestAt, 1760840100000);
  const serialized = JSON.stringify(meta);
  assert.equal(serialized.includes('SECRET_BODY_12345'), false);
  assert.equal(serialized.includes('DO_NOT_LEAK'), false);
  assert.equal(serialized.includes('om_secret'), false);
});

test('LarkSentinel：默认使用 /opt/homebrew/bin/lark-cli 与 --profile codex-feishu-notify；无 search:message 权限时走 chat_scan 零新增权限路径', async () => {
  const calls = [];
  let nowMs = 1760850000000;
  const sentinel = new LarkSentinel({
    exists: () => true,
    now: () => nowMs,
    exec: async (bin, args) => {
      calls.push([bin, args]);
      if (args[0] === '--version') return 'lark-cli version 1.0.92\n';
      if (args.includes('auth') && args.includes('status')) {
        return JSON.stringify({
          appId: 'cli_a680a230abf1500c',
          identities: {
            user: {
              available: true,
              openId: 'ou_f3de6edd939f86765a4eea4ab8169577',
              scope: 'im:chat:read im:message:readonly im:message.group_msg:get_as_user',
            },
          },
        });
      }
      if (args.includes('+chat-list')) {
        return JSON.stringify({
          data: {
            chats: [
              { chat_id: 'oc_group_1', name: '前端工程群' },
              { chat_id: 'invalid_id!!', name: '恶意群' },
            ],
          },
        });
      }
      if (args.includes('+chat-messages-list')) {
        return JSON.stringify({
          data: {
            messages: [
              {
                message_id: 'om_1',
                content: '机密内容不许出进程',
                create_time: String(nowMs - 60_000),
                sender: { name: '王工' },
                mentions: [{ id: 'ou_f3de6edd939f86765a4eea4ab8169577', name: '刘庆文' }],
              },
            ],
          },
        });
      }
      throw new Error(`unexpected args: ${args.join(' ')}`);
    },
  });

  const res = await sentinel.check({ since: nowMs - 300_000 });
  assert.equal(res.ok, true);
  assert.equal(res.mode, 'chat_scan');
  assert.equal(res.profile, 'codex-feishu-notify');
  assert.equal(res.count, 1);
  assert.deepEqual(res.chats, [{ name: '前端工程群', count: 1 }]);
  assert.deepEqual(res.senders, ['王工']);
  assert.equal(JSON.stringify(res).includes('机密内容不许出进程'), false);
  assert.equal(calls[0][0], '/opt/homebrew/bin/lark-cli');
  assert.deepEqual(calls[1][1].slice(0, 2), ['--profile', 'codex-feishu-notify']);

  // 缓存命中时不重复调 CLI
  const cached = await sentinel.check({ since: nowMs - 300_000 });
  assert.equal(cached.cached, true);
  assert.equal(calls.length, 4);
});

test('LarkSentinel：有 search:message 权限时走 +messages-search --is-at-me 路径；未登录与退避冷却', async () => {
  let loggedIn = false;
  let shouldFail = false;
  let nowMs = 1760850000000;
  const sentinel = new LarkSentinel({
    exists: () => true,
    now: () => nowMs,
    cacheMs: 1000,
    exec: async (_bin, args) => {
      if (args[0] === '--version') return 'lark-cli version 1.0.92';
      if (shouldFail) throw new Error('network error');
      if (args.includes('auth')) {
        return JSON.stringify({
          identities: {
            user: {
              available: loggedIn,
              openId: 'ou_me',
              scope: 'search:message im:chat:read',
            },
          },
        });
      }
      if (args.includes('+messages-search')) {
        return JSON.stringify({
          data: {
            messages: [
              { create_time: String(nowMs - 10_000), chat_name: '产品群', sender: { name: '小陈' }, content: 'PRIVATE' },
            ],
          },
        });
      }
      return '{}';
    },
  });

  const notLogged = await sentinel.check();
  assert.equal(notLogged.ok, false);
  assert.equal(notLogged.status, 'not_logged_in');

  loggedIn = true;
  const okRes = await sentinel.check();
  assert.equal(okRes.ok, true);
  assert.equal(okRes.mode, 'search');
  assert.equal(okRes.count, 1);
  assert.deepEqual(okRes.chats, [{ name: '产品群', count: 1 }]);

  // 缓存过期后触发失败退避
  nowMs += 5000;
  shouldFail = true;
  const failed = await sentinel.check();
  assert.equal(failed.ok, false);
  assert.equal(failed.status, 'unavailable');

  const backoff = await sentinel.check();
  assert.equal(backoff.ok, false);
  assert.equal(backoff.status, 'rate_limited');
});
