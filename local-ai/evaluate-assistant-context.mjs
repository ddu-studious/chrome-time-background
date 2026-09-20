// Opt-in live model evaluation; all music/account effects are fixtures.
import { writeFileSync, mkdirSync } from 'node:fs';
import { LMStudioProvider } from './provider.mjs';
import { runContextScenario } from '../test/fixtures/assistant-context-scenario.mjs';
if (!process.argv.includes('--live')) {
  console.log('使用 --live 验证真实 Qwen 的完整多轮规划；音乐数据、确认和播放均为隔离替身，不操作真实账号或队列。');
} else {
  const started = Date.now();
  const result = await runContextScenario({ provider: new LMStudioProvider(), onPlan: row => console.log(JSON.stringify({ elapsedMs: Date.now() - started, plan: row.data, estimatedInput: row.budget?.estimatedInputTokens, inputBudget: row.budget?.inputBudget, actualInput: row.execution.usage?.inputTokens })) });
  const report = { at: new Date().toISOString(), boundary: '真实模型 + 生产规划器/引擎/工具；音乐数据、确认、选择和写操作全部为测试替身', elapsedMs: Date.now() - started, ...result };
  const directory = new URL('.local/evaluations/', import.meta.url); mkdirSync(directory, { recursive: true });
  const path = new URL(`assistant-context-${Date.now()}.json`, directory); writeFileSync(path, JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ passed: result.passed, effects: result.effects, state: result.state, status: result.task.status, message: result.task.message, report: path.pathname }));
  if (!result.passed) process.exitCode = 1;
}
