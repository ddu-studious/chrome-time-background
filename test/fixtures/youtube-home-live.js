(async () => {
    const service = new YouTubeHomeService(chrome);
    const sender = { id: chrome.runtime.id, url: chrome.runtime.getURL('index.html'), documentId: 'home-live-check', tab: await chrome.tabs.getCurrent() };
    let cursor = '';
    async function load(append) {
        document.querySelector('#first').disabled = true;
        document.querySelector('#more').disabled = true;
        document.querySelector('#status').textContent = '读取中…';
        try {
            const data = await service.read({ cursor: append ? cursor : '' }, sender);
            cursor = data.cursor;
            document.querySelector('#status').textContent = `成功 · 本页 ${data.items.length} 个视频 · ${cursor ? '还有下一页' : '已到最后一页'} · ${data.fetchedAt}`;
            const list = document.querySelector('#videos');
            list.replaceChildren(...data.items.map(item => {
                const row = document.createElement('li');
                row.textContent = `${item.title} · ${item.channel} · ${item.durationLabel}`;
                return row;
            }));
        } catch (error) {
            document.querySelector('#status').textContent = `读取未完成：${error.code || 'home-fetch-failed'}`;
        } finally {
            document.querySelector('#first').disabled = false;
            document.querySelector('#more').disabled = !cursor;
        }
    }
    document.querySelector('#first').onclick = () => load(false);
    document.querySelector('#more').onclick = () => load(true);
})();
