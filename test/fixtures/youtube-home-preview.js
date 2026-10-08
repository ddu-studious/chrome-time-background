// Synthetic data only. This page never reads Chrome login state or calls YouTube.
const previewMode = new URLSearchParams(location.search).get('mode');
const previewTitles = ['从零理解宇宙的尺度', '城市漫游：雨后的京都', '如何构建自己的知识体系', '走进中国古建筑', '一场关于音乐的对话', '那些改变世界的发明'];
const previewStorage = {};
window.chrome = {
    runtime: { id: 'preview', sendMessage(message, callback) {
        if (message.action === 'youtube_auth_status') return callback({ ok: true, data: { configured: true, connected: false } });
        if (message.action === 'youtube_home_release') return callback({ ok: true });
        if (message.action !== 'youtube_home_feed') return callback({ ok: false, error: { code: 'preview-only' } });
        setTimeout(() => {
            if (previewMode === 'error') return callback({ ok: false, error: { code: 'home-login-required' } });
            const start = message.cursor ? 6 : 0;
            const items = previewTitles.map((title, index) => ({
                id: `AAA000000${String(start + index + 1).padStart(2, '0')}`, kind: 'video', source: 'youtube-home',
                title: start ? `继续探索 · ${title}` : title, channel: ['科学视野', '漫游日记', '学习笔记'][index % 3],
                durationLabel: `${12 + index}:30`, viewCountLabel: '10 万次观看', publishedLabel: '2 天前',
                publishedAt: index === 0 ? '2026-09-21T08:00:00Z' : index === 1 ? '2025-12-31T08:00:00Z' : '',
                thumbnail: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><defs><linearGradient id="g"><stop stop-color="${['#22394d','#405247','#604435'][index % 3]}"/><stop offset="1" stop-color="#131720"/></linearGradient></defs><path fill="url(#g)" d="M0 0h640v360H0z"/><circle cx="470" cy="100" r="58" fill="#ffffff18"/><path d="M0 290L170 125l190 180 130-100 150 100v55H0" fill="#ffffff15"/><text x="35" y="315" fill="white" font-size="26">预览示例 ${start + index + 1}</text></svg>`)}`,
            }));
            callback({ ok: true, data: { items, cursor: start ? '' : 'preview-page-2' } });
        }, 300);
    } },
    storage: { local: { get(defaults, callback) { callback({ ...defaults, ...previewStorage }); }, set(values, callback) { Object.assign(previewStorage, values); callback?.(); } } },
};
