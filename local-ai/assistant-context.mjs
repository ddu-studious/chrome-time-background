// This is a conservative estimate, not the model's tokenizer. Keep the margin
// explicit and use the loaded model's window rather than a fixed input ceiling.
export const COLD_CONTEXT_LENGTH = 12288;
export const MAX_PLANNING_WINDOW = 32768;
export function estimateTokens(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil((text.match(/[^\x00-\x7f]/g) || []).length * 2 + text.replace(/[^\x00-\x7f]/g, '').length / 2);
}

export function contextWindow(model) {
  const known = Number.isSafeInteger(model?.loadedContextLength) && model.loadedContextLength > 0;
  return { contextLength: model?.loaded ? known ? model.loadedContextLength : 8192 : COLD_CONTEXT_LENGTH,
    contextSource: model?.loaded ? known ? 'loaded-model' : 'loaded-model-unknown' : 'cold-load-default' };
}

// Trim presentation payloads only. References, versions, pagination, counts,
// selected objects and execution receipts must survive context compaction.
function compactData(value, key = '') {
  if (typeof value === 'string') return /^(title|name|description|summary|author|artist|album)$/.test(key) && value.length > 100 ? value.slice(0, 100) + '…[展示文本省略]' : value;
  if (Array.isArray(value)) return value.map(item => compactData(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([name]) => !/^(cover|avatar|thumbnail|url|playUrl|cacheStamp|headers|raw|html)$/i.test(name))
    .map(([name, item]) => [name, compactData(item, name)]));
  return value;
}

export function prepareContext({ instructions, input, contextLength = COLD_CONTEXT_LENGTH, contextSource = 'cold-load-default', maxOutputTokens = 4096 }) {
  const window = Math.min(contextLength, MAX_PLANNING_WINDOW);
  const safety = 512;
  const inputBudget = Math.max(0, window - maxOutputTokens - safety);
  const modelInput = structuredClone(input);
  const originalTurns = modelInput.turns?.length || 0;
  const receiptMessages = new Set((modelInput.observations || []).map(row => row.message));
  const currentTurn = (modelInput.turns || []).findLastIndex(row => row.role === 'user' && row.content === input.text);
  // Remove exact duplicates only; never silently discard a user's earlier
  // constraints or an observation that may prove a mutation already happened.
  modelInput.turns = (modelInput.turns || []).filter((row, index) => index !== currentTurn && !(row.role === 'assistant' && receiptMessages.has(row.content)));
  const before = estimateTokens(instructions) + estimateTokens(input);
  let compacted = false;
  const cost = () => estimateTokens(instructions) + estimateTokens(modelInput);
  if (cost() > inputBudget) {
    modelInput.observations = (modelInput.observations || []).map(row => ({ ...row, data: compactData(row.data) }));
    compacted = JSON.stringify(modelInput.observations) !== JSON.stringify(input.observations || []);
    if (compacted) modelInput.contextNotice = '部分展示文本已省略；执行回执、对象引用、版本、数量和分页状态完整保留。';
  }
  const budget = { contextLength, contextSource, planningWindow: window, inputBudget, outputBudget: maxOutputTokens, safetyMargin: safety,
    estimatedInputTokens: cost(), originalEstimatedInputTokens: before, instructionsEstimate: estimateTokens(instructions),
    inputEstimate: estimateTokens(modelInput), observationCount: modelInput.observations?.length || 0,
    completedStepCount: modelInput.completedSteps?.length || 0, duplicateTurnsRemoved: originalTurns - modelInput.turns.length, compacted };
  if (budget.estimatedInputTokens > inputBudget) throw Object.assign(new Error(`规划上下文预计需要 ${budget.estimatedInputTokens} tokens，当前输入预算为 ${inputBudget}（模型上下文 ${contextLength}，已预留输出和安全空间）。已压缩展示信息并保留执行记录，请增大模型加载上下文或将剩余需求分开处理。`), { code: 'ASSISTANT_CONTEXT_BUDGET_EXCEEDED', contextBudget: budget });
  return { modelInput, budget };
}
