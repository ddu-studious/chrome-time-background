// Read-only diagnostics. LM Studio's native HTTP stats currently omit cache
// reads; report the actual cache restore counters rather than inferring hits
// from elapsed time. Never export prompts, responses, credentials or plans.
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function timestamp(value) {
  if (value == null) return null;
  const normalized = String(value).replace('T', ' ');
  const parsed = new Date(normalized.replace(' ', 'T') + 'Z');
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized) ||
    !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== normalized.replace(' ', 'T')) throw new Error('时间范围须为日志本地时间 YYYY-MM-DDTHH:mm:ss');
  return normalized;
}
export function inspectPromptCache(log, options = {}) {
  const since = timestamp(options.since), until = timestamp(options.until);
  if (since && until && since > until) throw new Error('起始时间不能晚于结束时间');
  const inRange = at => (!since && !until) || (at != null && (!since || at >= since) && (!until || at <= until));
  const groups = {}, rows = []; let kind = 'other', model = 'unknown', at = null, disk = null;
  for (const line of log.split('\n')) {
    const stamp = line.match(/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
    if (stamp) at = stamp[1];
    if (/Received request: POST to \/api\/v1\/chat/.test(line)) { kind = 'other'; model = 'unknown'; }
    if (line.includes('"system_prompt":')) {
      kind = line.includes('你负责分析完整待办清单') ? 'outline' : line.includes('你是快捷助手的受控工具规划器') ? 'planning'
        : /summariz/i.test(line) ? 'summary' : 'other';
    }
    const running = line.match(/\[INFO\]\[([^\]]+)\] Running api\/v1\/chat/);
    if (running) model = running[1];
    const restore = line.match(/Prompt cache restore: cached_tokens=(\d+) uncached_tokens=(\d+)/);
    if (restore && inRange(at)) {
      const cached = Number(restore[1]), uncached = Number(restore[2]);
      if (!Number.isSafeInteger(cached + uncached)) continue;
      const row = { at, model, kind, cachedTokens: cached, uncachedTokens: uncached };
      rows.push(row);
      const key = `${model}:${kind}`;
      const group = groups[key] ||= { model, kind, requests: 0, hitRequests: 0, cachedTokens: 0, uncachedTokens: 0 };
      group.requests++; group.hitRequests += Number(cached > 0); group.cachedTokens += cached; group.uncachedTokens += uncached;
    }
    const usage = line.match(/prompt cache disk usage: used_mib=([\d.]+) cap_mib=([\d.]+).*records=(\d+)/);
    if (usage && inRange(at)) disk = { at, usedMiB: Number(usage[1]), capMiB: Number(usage[2]), records: Number(usage[3]) };
  }
  const summarize = group => ({ ...group, cachedTokenPercent: group.cachedTokens + group.uncachedTokens
    ? Math.round(1000 * group.cachedTokens / (group.cachedTokens + group.uncachedTokens)) / 10 : null });
  return { total: summarize(rows.reduce((sum, row) => ({ requests: sum.requests + 1, hitRequests: sum.hitRequests + Number(row.cachedTokens > 0),
    cachedTokens: sum.cachedTokens + row.cachedTokens, uncachedTokens: sum.uncachedTokens + row.uncachedTokens }), { requests: 0, hitRequests: 0, cachedTokens: 0, uncachedTokens: 0 })),
    groups: Object.values(groups).map(summarize), disk, rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = [], range = {};
  for (const arg of process.argv.slice(2)) {
    const option = arg.match(/^--(since|until)=(.+)$/);
    if (option) range[option[1]] = option[2];
    else if (arg.startsWith('--')) throw new Error('仅支持 --since= 和 --until= 时间范围参数');
    else paths.push(arg);
  }
  if (!paths.length || paths.length > 14) throw new Error('用法：node local-ai/inspect-prompt-cache.mjs [--since=本地时间] [--until=本地时间] <LM Studio 日志路径>（最多14个文件，每个不超过32 MiB）');
  for (const path of paths) {
    if (statSync(path).size > 32 * 1024 * 1024) throw new Error('日志超过32 MiB，请先缩小日期范围');
    const { rows, ...report } = inspectPromptCache(readFileSync(path, 'utf8'), range);
    console.log(JSON.stringify({ path, range, ...report }));
  }
}
