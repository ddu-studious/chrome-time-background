/**
 * 网易云音乐 v5 工作台视图。
 *
 * 视图只建立稳定 DOM 契约；播放、API、队列和持久化仍由
 * MusicController 负责，切页不会创建新的播放器实例。
 */
(function exposeMusicView(global) {
    'use strict';

    const panelTemplate = `
        <div class="mc-panel hidden mc-panel-v5" id="mc-panel" role="dialog" aria-modal="false" aria-label="网易云音乐播放器" data-music-page="now-playing">
            <header class="mc-v5-header">
                <div class="mc-v5-brand">
                    <span class="mc-v5-logo"><i class="fas fa-music"></i></span>
                    <div><strong>网易云音乐</strong><small id="mc-account-label"><span class="mc-status-dot"></span> 本地播放可用</small></div>
                </div>
                <div class="mc-v5-header-actions">
                    <button class="mc-v5-search" id="mc-search-tab" type="button" aria-label="搜索音乐"><i class="fas fa-search"></i><span>搜索</span><kbd>⌘ K</kbd></button>
                    <button class="mc-ctrl-btn" id="mc-minimize" type="button" title="最小化播放器" aria-label="最小化播放器"><i class="fas fa-minus"></i></button>
                    <button class="mc-ctrl-btn mc-panel-close" id="mc-close-panel" type="button" title="关闭播放器面板（音乐继续播放）" aria-label="关闭播放器面板，音乐继续播放"><i class="fas fa-times"></i></button>
                </div>
            </header>

            <nav class="mc-tabs" id="mc-tabs" role="tablist" aria-label="音乐页面">
                <button class="mc-tab active" data-mc-tab="now-playing" role="tab" aria-selected="true"><i class="fas fa-compact-disc"></i><span>正在播放</span></button>
                <button class="mc-tab" data-mc-tab="queue" role="tab" aria-selected="false"><i class="fas fa-list-ol"></i><span>队列</span><span class="mc-tab-count" id="mc-queue-count"></span></button>
                <button class="mc-tab" data-mc-tab="playlists" role="tab" aria-selected="false"><i class="fas fa-layer-group"></i><span>歌单</span></button>
                <button class="mc-tab mc-tab-secondary" data-mc-tab="discover" role="tab" aria-selected="false"><i class="fas fa-compass"></i><span>发现</span></button>
                <div class="mc-tab-indicator" id="mc-tab-indicator"></div>
            </nav>

            <div class="mc-drawer-wrapper" id="mc-drawer-wrapper">
                <div class="mc-drawer-inner">
                    <div class="mc-content" id="mc-content">
                        <section class="mc-pane active mc-now-playing-page" data-mc-pane="now-playing" id="mc-pane-now-playing" role="tabpanel" aria-label="正在播放">
                            <div class="mc-now-main">
                                <div class="mc-now-cover-shell">
                                    <div class="mc-now-cover" id="mc-v5-now-cover"><i class="fas fa-music"></i></div>
                                    <span class="mc-source-badge"><i class="fas fa-circle"></i> 网易云音乐</span>
                                </div>
                                <div class="mc-now-copy">
                                    <span class="mc-page-eyebrow">NOW PLAYING</span>
                                    <div class="mc-now-heading"><div><h2 id="mc-v5-now-title">未检测到音乐</h2><p id="mc-v5-now-artist">连接网易云后开始播放</p></div><button type="button" class="mc-v5-like" aria-label="喜欢当前歌曲"><i class="far fa-heart"></i></button></div>
                                    <div class="mc-now-context"><span id="mc-v5-now-source">本地队列</span><span>·</span><span id="mc-v5-now-mode">顺序播放</span></div>
                                    <div class="mc-now-controls">
                                        <button type="button" id="mc-v5-prev" aria-label="上一曲"><i class="fas fa-step-backward"></i></button>
                                        <button type="button" id="mc-v5-play" class="primary" aria-label="播放或暂停"><i class="fas fa-play"></i></button>
                                        <button type="button" id="mc-v5-next" aria-label="下一曲"><i class="fas fa-step-forward"></i></button>
                                    </div>
                                    <p class="mc-now-lyric" id="mc-v5-now-lyric">选择音乐后，这里会显示当前歌词</p>
                                    <button type="button" class="mc-v5-inline-link" data-mc-open="lyrics"><i class="fas fa-align-center"></i> 查看完整歌词</button>
                                </div>
                            </div>
                            <aside class="mc-now-aside">
                                <div class="mc-aside-title"><span>本次播放</span><small id="mc-v5-session-time">刚刚开始</small></div>
                                <div class="mc-v5-stat"><i class="fas fa-broadcast-tower"></i><div><span>播放来源</span><strong id="mc-v5-play-source">本地队列</strong></div></div>
                                <div class="mc-v5-stat"><i class="fas fa-list"></i><div><span>队列歌曲</span><strong id="mc-v5-queue-size">0 首</strong></div></div>
                                <div class="mc-aside-title"><span>快速操作</span></div>
                                <button type="button" class="mc-v5-aside-action" data-mc-open="playlists"><i class="far fa-heart"></i><span>打开我的歌单</span><i class="fas fa-chevron-right"></i></button>
                                <button type="button" class="mc-v5-aside-action" data-mc-open="discover"><i class="fas fa-magic"></i><span>发现相似音乐</span><i class="fas fa-chevron-right"></i></button>
                                <button type="button" class="mc-v5-aside-action" data-mc-open="queue"><i class="fas fa-step-forward"></i><span>查看接下来播放</span><i class="fas fa-chevron-right"></i></button>
                            </aside>
                        </section>

                        <section class="mc-pane mc-list-page" data-mc-pane="queue" id="mc-pane-queue" role="tabpanel" aria-label="播放队列"><div class="mc-empty">暂无歌曲，请先播放音乐</div></section>

                        <section class="mc-pane mc-playlist-page" data-mc-pane="playlists" id="mc-pane-playlists" role="tabpanel" aria-label="歌单库">
                            <div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载歌单中...</div>
                        </section>

                        <section class="mc-pane mc-discover-page" data-mc-pane="discover" id="mc-pane-discover" role="tabpanel" aria-label="发现音乐">
                            <div class="mc-empty"><i class="fas fa-spinner fa-spin"></i> 加载推荐中...</div>
                        </section>

                        <section class="mc-pane mc-search-page" data-mc-pane="search" id="mc-pane-search" role="tabpanel" aria-label="搜索音乐">
                            <div class="mc-page-heading"><div><span class="mc-page-eyebrow">SEARCH</span><h2>搜索音乐</h2></div><small>优先展示单曲结果</small></div>
                            <div class="mc-search-bar">
                                <div class="mc-search-wrap">
                                    <i class="fas fa-search"></i>
                                    <input type="search" id="mc-search-input" placeholder="搜索歌曲、歌手或歌单" maxlength="60" aria-label="搜索音乐">
                                    <button class="mc-search-clear-btn hidden" id="mc-search-clear" type="button" title="清除搜索" aria-label="清除搜索"><i class="fas fa-times-circle"></i></button>
                                </div>
                                <div class="mc-search-type-tabs" id="mc-search-type-tabs" role="tablist" aria-label="搜索类型">
                                    <button class="mc-search-type active" data-type="1" type="button">单曲</button>
                                    <button class="mc-search-type" data-type="100" type="button">歌手</button>
                                    <button class="mc-search-type" data-type="1000" type="button">歌单</button>
                                </div>
                            </div>
                            <div id="mc-search-results"><div class="mc-search-history" id="mc-search-history-area"></div></div>
                        </section>

                        <section class="mc-pane mc-lyrics-compat" data-mc-pane="lyrics" id="mc-pane-lyrics" role="tabpanel" aria-label="歌词"><div class="mc-lrc-pane"><div class="mc-empty">播放音乐后自动获取歌词</div></div></section>
                    </div>
                </div>
            </div>

            <footer class="mc-v5-playerbar">
                <div class="mc-strip" id="mc-strip">
                    <div class="mc-cover" id="mc-cover"><i class="fas fa-music mc-cover-placeholder"></i><img id="mc-cover-img" src="" alt="专辑封面" style="display:none;"></div>
                    <div class="mc-info"><div class="mc-title" id="mc-title">未检测到音乐</div><div class="mc-sub" id="mc-sub"></div><div class="mc-lyric-preview" id="mc-lyric-preview"></div></div>
                    <div class="mc-strip-controls">
                        <button class="mc-ctrl-btn" id="mc-prev" type="button" title="上一曲" aria-label="上一曲"><i class="fas fa-step-backward"></i></button>
                        <button class="mc-ctrl-btn mc-play-btn" id="mc-play" type="button" title="播放或暂停" aria-label="播放或暂停"><i class="fas fa-play" id="mc-play-icon"></i></button>
                        <button class="mc-ctrl-btn" id="mc-next" type="button" title="下一曲" aria-label="下一曲"><i class="fas fa-step-forward"></i></button>
                    </div>
                </div>
                <div class="mc-progress" id="mc-progress"><span class="mc-prg-time" id="mc-time-cur">0:00</span><div class="mc-prg-bar" id="mc-prg-bar"><div class="mc-prg-fill" id="mc-prg-fill"></div><input type="range" class="mc-prg-input" id="mc-prg-input" min="0" max="1000" value="0" aria-label="播放进度"></div><span class="mc-prg-time" id="mc-time-total">0:00</span></div>
                <div class="mc-modes" id="mc-modes">
                    <button class="mc-mode-cycle" id="mc-mode-cycle" type="button" title="切换播放模式" aria-label="切换播放模式"><i class="fas fa-long-arrow-alt-right" id="mc-mode-icon"></i><span class="mc-mode-label" id="mc-mode-label">顺序播放</span></button>
                    <button class="mc-ctrl-btn mc-vol-toggle" id="mc-vol-toggle" type="button" title="音量" aria-label="音量"><i class="fas fa-volume-up" id="mc-vol-icon"></i></button>
                    <div class="mc-vol-slider hidden" id="mc-vol-slider"><div class="mc-vol-pct" id="mc-vol-pct">100%</div><div class="mc-vol-track"><div class="mc-vol-track-bg"></div><div class="mc-vol-fill" id="mc-vol-fill"></div><input type="range" class="mc-vol-input" id="mc-vol-input" min="0" max="100" value="100" aria-label="音量"></div></div>
                    <button class="mc-ctrl-btn mc-sleep-toggle" id="mc-sleep-toggle" type="button" title="睡眠定时" aria-label="睡眠定时" aria-haspopup="menu" aria-expanded="false" aria-controls="mc-sleep-menu"><i class="fas fa-moon" id="mc-sleep-icon"></i><span class="mc-sleep-badge hidden" id="mc-sleep-badge"></span></button>
                    <button class="mc-ctrl-btn mc-more-toggle" id="mc-more-toggle" type="button" title="更多操作" aria-label="更多操作" aria-haspopup="menu" aria-expanded="false" aria-controls="mc-more-menu"><i class="fas fa-ellipsis-h"></i></button>
                    <div class="mc-more-menu hidden" id="mc-more-menu" role="menu" aria-label="更多音乐操作"><button class="mc-more-item mc-disconnect" id="mc-disconnect" type="button" role="menuitem"><i class="fas fa-unlink"></i><span>断开网易云连接</span></button></div>
                </div>
            </footer>

            <div class="mc-login-prompt hidden" id="mc-login-prompt"><i class="fas fa-user-lock"></i><span>请先登录网易云音乐后使用此功能</span><button class="mc-login-btn" id="mc-login-btn" type="button">前往登录</button></div>
        </div>
        <div class="mc-connect hidden" id="mc-connect"><div class="mc-connect-inner"><span class="mc-connect-label">连接音乐平台</span><div class="mc-connect-btns"><button class="mc-connect-btn mc-connect-primary" data-platform="netease-independent" type="button" title="网易云独立播放"><i class="fas fa-play-circle"></i> 网易云音乐</button></div><div class="mc-connect-hint" id="mc-connect-hint"><i class="fas fa-info-circle"></i><span>只需在浏览器中登录过网易云即可使用</span></div></div></div>`;

    function create() {
        const container = document.createElement('div');
        container.className = 'music-island music-workbench-v5';
        container.id = 'music-island';
        container.innerHTML = panelTemplate;

        const actionSheet = document.createElement('div');
        actionSheet.className = 'mc-action-sheet-overlay hidden';
        actionSheet.id = 'mc-action-sheet-overlay';
        actionSheet.setAttribute('aria-hidden', 'true');
        actionSheet.innerHTML = '<div class="mc-action-sheet-backdrop"></div><div class="mc-action-sheet" id="mc-action-sheet" role="dialog" aria-modal="true" aria-label="音乐探索工作台"><div class="mc-as-header" id="mc-as-header"></div><div class="mc-as-tabs" id="mc-as-tabs" role="tablist" aria-label="探索分类"></div><div class="mc-as-body" id="mc-as-body"></div></div>';

        const contextMenu = document.createElement('div');
        contextMenu.className = 'mc-ctx-menu hidden';
        contextMenu.id = 'mc-ctx-menu';

        return { container, actionSheet, contextMenu };
    }

    global.MusicView = Object.freeze({ create });
})(window);
