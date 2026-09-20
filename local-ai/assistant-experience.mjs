import { serializeConversation } from '@earendil-works/pi-coding-agent';

export const MEMORY_SDK = '@earendil-works/pi-coding-agent@0.85.1';
const safe = (value, max = 300) => typeof value === 'string' ? value.replace(/https?:\/\/\S+|Bearer\s+\S+/gi, '[已省略]').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, max) : '';

// Only executor tool receipts are eligible. No assistant prose, model plans,
// prepare cards, service subspans, or unknown writes become completed facts.
export function experienceFromReceipt(row) {
  if (!row?.contentSaved || !['tool', 'action'].includes(row.kind) || !['succeeded', 'waiting'].includes(row.status)) return null;
  const input = row.input || {}, output = row.output || {}, tool = row.tool;
  if (output.truncated || output.ok === false || ['review', 'clarify', 'needs_clarification'].includes(output.status)) return null;
  const app = tool.startsWith('music.') ? 'music' : tool.startsWith('alarm.') ? 'alarm' : input.platform || input.data?.platform;
  if (!['music', 'alarm', 'bilibili', 'youtube'].includes(app)) return null;
  let action;
  if (tool === 'music.search' || (tool === 'music.intent' && output.musicView?.kind === 'search') || (tool === 'video.search' && Array.isArray(output.observation?.items))) action = 'searched';
  else if (tool === 'music.browse' && input.data?.kind && output.musicView && row.status === 'waiting') action = 'selected';
  else if (row.status !== 'succeeded' || output.status === 'waiting') return null;
  else if (output.playback && ['music.intent', 'music.browse', 'music.play-artist'].includes(tool)) action = 'played';
  else if (tool === 'music.queue.play' && output.observation?.isPlaying === true) action = 'played';
  else if (tool === 'music.queue.apply') action = input.startPlayback === true && output.observation?.isPlaying === true ? 'played' : 'applied';
  else if (['music.browse', 'alarm.select', 'video.select'].includes(tool)) action = 'selected';
  else if (tool === 'video.open' && output.observation?.opened === true) action = 'opened';
  else if (tool === 'alarm.create' && output.observation?.created !== false && /^已设置提醒/.test(output.message || '')) action = 'created';
  else if (tool === 'alarm.commit' && ['update', 'delete'].includes(output.observation?.action)) action = output.observation.action === 'update' ? 'updated' : 'deleted';
  else if (tool === 'alarm.toggle') action = 'updated';
  else return null;
  const query = safe(input.query || (output.musicView?.kind === 'search' ? output.musicView.title : '') || input.text || input.data?.title, 160);
  const title = safe(output.musicView?.kind !== 'search' ? output.musicView?.title : '', 120) || safe(output.playback?.artist || output.observation?.currentSong?.title || output.observation?.label || input.data?.alarm?.label || input.data?.title || input.title || query || (tool.startsWith('music.queue.') ? '当时的播放队列' : ''), 120);
  const message = safe(output.message);
  if (!title && !query && !message) return null;
  const entity = output.musicView?.kind === 'artist' && /^[1-9]\d{0,19}$/.test(output.musicView.id || '')
    ? { platform: 'netease', kind: 'artist', id: String(output.musicView.id), name: title } : null;
  return { app, action, query, title, message, entity, at: row.endedAt, tool, searched: action === 'searched' || (tool === 'music.intent' && output.musicView?.kind === 'artist') };
}

// pi owns conversation serialization. The adapter owns which facts may enter
// context; no SDK session files, extra model calls or parallel summary engine.
export function serializeRecall(rows) {
  if (!Array.isArray(rows) || rows.length > 8) throw new Error('召回记忆数量无效');
  const facts = rows.map(row => {
    if (!row || !['note', 'experience'].includes(row.kind) || !['all', 'music', 'alarm', 'bilibili', 'youtube'].includes(row.app) ||
        typeof row.key !== 'string' || row.key.length > 100 || !Number.isSafeInteger(row.updatedAt) ||
        (row.kind === 'note' ? typeof row.value !== 'string' || row.value.length > 300 :
          !['searched', 'played', 'applied', 'selected', 'opened', 'created', 'updated', 'deleted'].includes(row.action) ||
          !Number.isSafeInteger(row.at) || ['query', 'title', 'message'].some(k => typeof row[k] !== 'string' || row[k].length > 300))) throw new Error('召回记忆格式无效');
    return row.kind === 'note' ? { kind: row.kind, app: row.app, text: row.value, savedAt: row.updatedAt }
      : { kind: row.kind, app: row.app, action: row.action, query: row.query, title: row.title, receipt: row.message, at: row.at };
  });
  if (JSON.stringify(facts).length > 4200) throw new Error('召回记忆超过上下文上限');
  return serializeConversation(facts.map(fact => ({ role: 'user', content: JSON.stringify(fact), timestamp: fact.at || fact.savedAt })));
}
