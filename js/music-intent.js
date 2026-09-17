(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MusicIntent = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const actions = Object.freeze({ pause: [], resume: [], next: [], previous: [], volume: ['delta', 'value'], sleep: ['minutes'], search: ['kind', 'query', 'title', 'artist', 'goal', 'collection', 'queueMode'], recommend: ['query'], clarify: ['question'] });
  function validate(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.hasOwn(actions, raw.action)) throw new Error('音乐动作无效');
    if (Object.keys(raw).some(key => key !== 'action' && !actions[raw.action].includes(key))) throw new Error('音乐结果包含不允许的字段');
    const result = { action: raw.action };
    if (raw.action === 'volume') {
      if ((raw.value !== undefined) === (raw.delta !== undefined)) throw new Error('音量只能指定绝对值或调整量');
      const key = raw.value !== undefined ? 'value' : 'delta';
      if (!Number.isFinite(raw[key]) || (key === 'value' ? raw[key] < 0 || raw[key] > 1 : Math.abs(raw[key]) > .3 || raw[key] === 0)) throw new Error('音量超出范围');
      result[key] = raw[key];
    }
    if (raw.action === 'sleep') {
      if (!Number.isInteger(raw.minutes) || raw.minutes < 0 || raw.minutes > 240) throw new Error('定时关闭应为 0 至 240 分钟');
      result.minutes = raw.minutes;
    }
    if (raw.action === 'recommend') {
      if (typeof raw.query !== 'string' || !raw.query.trim() || raw.query.length > 100 || /https?:\/\//i.test(raw.query)) throw new Error('推荐检索条件无效');
      result.query = raw.query.trim();
    }
    if (raw.action === 'search') {
      if (!['auto', 'song', 'artist', 'playlist'].includes(raw.kind)) throw new Error('搜索类型无效');
      result.kind = raw.kind;
      if (raw.goal != null || raw.collection != null) {
        if (raw.kind !== 'artist' || !['play', 'browse', 'auto'].includes(raw.goal) || raw.collection !== 'top') throw new Error('歌手播放目标无效');
        result.goal = raw.goal; result.collection = 'top';
      }
      if (raw.queueMode != null) {
        if (result.collection !== 'top' || !['append', 'replace'].includes(raw.queueMode)) throw new Error('歌手队列目标无效');
        result.queueMode = raw.queueMode;
      }
      for (const key of ['query', 'title', 'artist']) {
        if (raw[key] === undefined && key !== 'query') continue;
        if (typeof raw[key] !== 'string' || !raw[key].trim() || raw[key].length > 100 || /https?:\/\//i.test(raw[key])) throw new Error('音乐搜索条件无效');
        result[key] = raw[key].trim();
      }
    }
    if (raw.action === 'clarify') {
      if (typeof raw.question !== 'string' || !raw.question.trim() || raw.question.length > 200) throw new Error('澄清问题无效');
      result.question = raw.question.trim();
    }
    return result;
  }
  function artistRequest(text) {
    const value = String(text || '').trim().replace(/[。！!？?]+$/, '');
    if (/^(?:播放|搜索|打开|找|搜)?(?:歌单|专辑|歌曲|单曲)|[《》“”"]/.test(value)) return null;
    const match = value.match(/^(?:(?:请帮我|帮我|请)\s*)?(直接播放|播放|听|我想听|只搜索|搜索|查找|找|搜|查看|看看|打开)?\s*(.+?)的(热门歌曲|热门歌|代表作|歌曲|歌)(?:[，,；;]\s*(先别播放|先不播放|不要播放|只看看|先看看|不播放|替换(?:当前|原)?队列|保留(?:当前|原)?队列))?$/);
    if (!match || /[，,；;]|不要|别|以后|今后|如果|然后|并且|再/.test(match[2])) return null;
    if (/^(他|她|它|这个歌手|那个歌手|该歌手)$/.test(match[2].trim())) return null;
    return validate({ action: 'search', kind: 'artist', query: match[2].trim(), collection: 'top',
      ...(/队列$/.test(match[4] || '') ? { queueMode: match[4].startsWith('替换') ? 'replace' : 'append' } : {}),
      goal: /先别|先不|不要|只看看|先看看|不播放/.test(match[4] || '') || /^(只搜索|搜索|查找|找|搜|查看|看看|打开)$/.test(match[1] || '') ? 'browse' : match[1] ? 'play' : 'auto' });
  }
  function parseLocal(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 500) throw new Error('请输入 1 至 500 字的音乐需求');
    const original = text.trim().replace(/[。！!？?]+$/, '');
    const aliases = { '暫停': '暂停', '暫停播放': '暂停播放', '繼續': '继续', '繼續播放': '继续播放', '恢復播放': '恢复播放', '靜音': '静音' };
    const value = Object.hasOwn(aliases, original) ? aliases[original] : original;
    const artist = artistRequest(value);
    if (artist) return artist;
    for (const [pattern, action] of [[/^(暂停|暂停播放|停止播放|暂停音乐)$/, 'pause'], [/^(继续|继续播放|播放音乐|恢复播放)$/, 'resume'], [/^(下一首|切歌|换一首)$/, 'next'], [/^(上一首|前一首)$/, 'previous']]) if (pattern.test(value)) return { action };
    if (/^(小声一点|音量小一点|降低音量)$/.test(value)) return { action: 'volume', delta: -.1 };
    if (/^(大声一点|音量大一点|提高音量)$/.test(value)) return { action: 'volume', delta: .1 };
    if (value === '静音') return { action: 'volume', value: 0 };
    let match = value.match(/^音量(?:调到|设为|设置为)?\s*(\d{1,3})[%％]$/);
    if (match) return validate({ action: 'volume', value: Number(match[1]) / 100 });
    if (/^(取消定时关闭|取消音乐定时)$/.test(value)) return { action: 'sleep', minutes: 0 };
    match = value.match(/^(?:听|播放)?\s*(半小时|\d+\s*分钟|\d+\s*小时)(?:后|就)(?:关闭|关掉|停止)(?:音乐|播放)?$/);
    if (match) return validate({ action: 'sleep', minutes: match[1] === '半小时' ? 30 : parseInt(match[1], 10) * (match[1].includes('小时') ? 60 : 1) });
    if (/[，,；;]|然后|不要|适合|再|并且/.test(value)) return null;
    if (/(专注|放松|安静|助眠|学习|写代码|轻快|伤感|运动).*(音乐|歌)/.test(value)) return null;
    match = value.match(/^(?:播放|听|搜索|找|搜|打开)?\s*(.+?)的歌单$/);
    if (match) {
      if (/^(我|我收藏|收藏)$/.test(match[1])) return null;
      return validate({ action: 'search', kind: 'playlist', query: match[1].trim() });
    }
    match = value.match(/^(?:播放|听|搜索|我想听)?[《“"](.+)[》”"]$/);
    if(match) return validate({action:'search',kind:'song',query:match[1],title:match[1]});
    match = value.match(/^(?:播放|搜索|打开|找|搜)?(歌单|歌手|歌曲|单曲)\s*(.+)$/);
    if(match) return validate({action:'search',kind:match[1]==='歌单'?'playlist':match[1]==='歌手'?'artist':'song',query:match[2],...(['歌曲','单曲'].includes(match[1])?{title:match[2]}:{})});
    match = value.match(/^(?:播放|听|我想听|搜索|找|搜)?\s*(.+?)的(?:歌|歌曲|热门歌曲|热门歌|代表作)$/);
    if (match) return validate({ action: 'search', kind: 'artist', query: match[1] });
    match = value.match(/^(?:播放|听|我想听|放一首)\s*(.+?)的[《“]?([^》”]+)[》”]?$/);
    if (match) return validate({ action: 'search', kind: 'song', artist: match[1].trim(), title: match[2].trim(), query: `${match[1].trim()} ${match[2].trim()}` });
    match = value.match(/^(?:搜索|播放|打开)歌单\s*(.+)$/);
    if (match) return validate({ action: 'search', kind: 'playlist', query: match[1] });
    match = value.match(/^(?:搜索歌手|听歌手|歌手|找歌手|搜歌手)\s*(.+)$/);
    if (match) return validate({ action: 'search', kind: 'artist', query: match[1] });
    match = value.match(/^(?:播放|搜索|听)?(?:歌曲|单曲)\s*(.+)$/);
    if (match) return validate({action:'search',kind:'song',query:match[1],title:match[1]});
    match = value.match(/^(?:播放|我想听|放一首|搜索|搜|找|听)\s*[《“]?([^》”]+)[》”]?$/);
    if (match) return validate({ action: 'search', kind: 'auto', query: match[1], title: match[1] });
    return null;
  }
  return Object.freeze({ parseLocal, validate, artistRequest });
});
