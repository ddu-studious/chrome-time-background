// Read-only probe of the production planner's tool-group prefetch path.
// It never asks a model to generate a plan or executes a business tool.
import { plan } from './assistant-service.mjs';
import contract from '../js/assistant-contract.js';

const cases = [
  { id: 'music-queue-play', app: 'music', text: '播放当前队列', need: ['music.playback'] },
  { id: 'music-queue-shuffle', app: 'music', text: '随机播放当前队列', need: ['music.playback'] },
  { id: 'music-queue-loop', app: 'music', text: '循环播放当前队列', need: ['music.playback'] },
  { id: 'music-shuffle-synonym', app: 'music', text: '把播放方式切换成洗牌模式', need: ['music.playback'] },
  { id: 'music-queue-list', app: 'music', text: '查一下队列里有哪些歌', need: ['music.queue'] },
  { id: 'music-queue-remove-synonym', app: 'music', text: '把队列里的第二首歌去掉', need: ['music.queue', 'music.edit'] },
  { id: 'music-queue-clear-synonym', app: 'music', text: '清掉当前队列', need: ['music.edit'] },
  { id: 'music-seek', app: 'music', text: '把当前歌曲快进30秒', need: ['music.edit'] },
  { id: 'music-search-next', app: 'music', text: '音乐搜索结果翻页', need: ['music.library'] },
  { id: 'music-search-more', app: 'music', text: '看看更多音乐搜索结果', need: ['music.library'] },
  { id: 'music-state', app: 'music', text: '看看现在播放的是什么歌', need: [] },
  { id: 'video-author', app: 'bilibili', text: '看看刚选中的视频是谁发的', need: ['video.inspect'] },
  { id: 'video-duration', app: 'youtube', text: '刚才那个视频多长', need: ['video.inspect'] },
  { id: 'video-open', app: 'youtube', text: '打开刚才选中的视频', need: ['video.inspect'] },
  { id: 'video-search-duration', app: 'youtube', text: '搜索十分钟以内的 MySQL 视频', need: [] },
  { id: 'account-login', app: 'youtube', text: '看看 YouTube 登录状态', need: ['app.connection'] },
  { id: 'account-connected-synonym', app: 'youtube', text: 'YouTube 账号连上了吗', need: ['app.connection'] },
  { id: 'alarm-update', app: 'alarm', text: '把开会提醒改到明天四点', need: ['alarm.manage'] },
  { id: 'alarm-delay-synonym', app: 'alarm', text: '把开会提醒延后十分钟', need: ['alarm.manage'] },
  { id: 'alarm-disable-synonym', app: 'alarm', text: '把开会闹钟关掉', need: ['alarm.manage'] },
  { id: 'alarm-delete', app: 'alarm', text: '删除开会提醒', need: ['alarm.manage'] },
  { id: 'alarm-create', app: 'alarm', text: '提醒我明天开会', need: [] }
];

for (const row of cases) for (const group of row.need) {
  if (!Object.hasOwn(contract.toolGroups, group)) throw new Error(`样本 ${row.id} 引用了未知工具组 ${group}`);
}

const rows = [];
for (const row of cases) {
  let prepared;
  const result = await plan({ app: row.app, text: row.text }, {
    model: 'probe-only', reasoning: 'off',
    async generateObject({ input }) { prepared = input; return { question: '仅评估工具预加载，不执行动作' }; }
  });
  const loaded = prepared?.toolGroups || [];
  const missing = row.need.filter(group => !loaded.includes(group));
  const extra = loaded.filter(group => !row.need.includes(group));
  rows.push({ id: row.id, app: row.app, text: row.text, path: result.source,
    localTool: result.source === 'rules' ? result.data?.steps?.[0]?.tool || null : null,
    need: row.need, loaded, missing, extra });
}

const planned = rows.filter(row => row.path === 'model');
const report = {
  boundary: '当前生产 planner 的工具预加载静态路径；手工标注 need；模型生成和业务工具均未运行',
  total: rows.length,
  plannerCases: planned.length,
  rulePathCases: rows.length - planned.length,
  casesWithMissingGroups: planned.filter(row => row.missing.length).length,
  casesWithExtraGroups: planned.filter(row => row.extra.length).length,
  rulePathCasesNeedingAGroup: rows.filter(row => row.path === 'rules' && row.need.length).length,
  rows
};
console.log(JSON.stringify(report, null, 2));
