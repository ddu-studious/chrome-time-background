// Laya 的 Python 环境约 2.3 万个文件，不能放在扩展目录里：Chrome 每次加载 / 重新加载扩展都会递归枚举整个扩展目录。
// 这里用真实子进程（假的 HOME，只跑没有副作用的 help，以及缺环境时就会报错退出的 verify）验证
// local-ai/scripts/models.mjs 对环境位置的约定。不会碰 launchctl、令牌、日志或真实环境。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'local-ai/scripts/models.mjs');
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function run(args, extraEnv = {}) {
  const home = mkdtempSync(join(tmpdir(), 'laya-paths-'));
  try {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8', timeout: 15000,
      // 显式构造环境：不继承 LAYA_VENV_DIR / LAYA_DEVICE，也不使用真实 HOME。
      env: { PATH: process.env.PATH, HOME: home, ...extraEnv },
    });
    return { home, status: result.status, out: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

test('默认把 Python 环境放在扩展目录之外（HOME 下的 .local/share，路径不含空格）', () => {
  const { home, out } = run(['help']);
  const expected = join(home, '.local/share/chrome-time-background/laya-venv');
  assert.match(out, new RegExp(`Laya Python 环境：${escape(expected)}`));
  assert.ok(!expected.startsWith(root + '/'), '默认位置不能在扩展目录内');
  assert.doesNotMatch(out, /警告/);
});

test('LAYA_VENV_DIR 可以改位置，支持 ~/ 开头', () => {
  assert.match(run(['help'], { LAYA_VENV_DIR: '/var/tmp/custom-laya-venv' }).out, /Laya Python 环境：\/var\/tmp\/custom-laya-venv/);
  const { home, out } = run(['help'], { LAYA_VENV_DIR: '~/venvs/laya' });
  assert.match(out, new RegExp(`Laya Python 环境：${escape(join(home, 'venvs/laya'))}`));
});

test('环境位于扩展目录内时给出警告，但不阻止命令', () => {
  const { status, out } = run(['help'], { LAYA_VENV_DIR: join(root, 'local-ai/.local/laya-runtime/.venv') });
  assert.equal(status, 0);
  assert.match(out, /警告：Laya Python 环境位于扩展目录内/);
});

test('缺少环境时提示实际位置与 UV_PROJECT_ENVIRONMENT，而不是只说“缺少”', () => {
  const { home, status, out } = run(['laya', 'verify']);
  assert.notEqual(status, 0);
  assert.match(out, new RegExp(escape(join(home, '.local/share/chrome-time-background/laya-venv'))));
  assert.match(out, /UV_PROJECT_ENVIRONMENT/);
});
