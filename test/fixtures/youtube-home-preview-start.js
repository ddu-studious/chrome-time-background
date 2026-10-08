(async () => {
    if (new URLSearchParams(location.search).has('narrow')) {
        const frame = document.createElement('iframe');
        frame.title = '390 像素窄屏预览';
        frame.src = new URLSearchParams(location.search).get('view') === 'recommended' ? 'youtube-home-preview.html?view=recommended' : 'youtube-home-preview.html';
        frame.style = 'display:block;width:390px;height:780px;margin:20px auto;border:1px solid #4a4f59';
        document.body.append(frame);
        return;
    }
    await window.youtubeController.init();
    window.youtubeController.open();
    await window.youtubeController._showView('home', true);
    if (new URLSearchParams(location.search).get('view') === 'recommended') {
        const controller = window.youtubeController;
        controller.activeView = 'recommended';
        controller.items = controller.items.map(({ source, ...item }) => item);
        controller._syncNav();
        controller._renderList(controller.items, '为你推荐', false, {
            compactVideoMeta: true, playerReturnLabel: '为你推荐', note: '订阅频道视频 · 布局替身预览',
        });
    }
})();
