/**
 * Tech Ticker - 混合双层信息栏模块
 * 
 * 上层：主信息卡片（淡入淡出切换，6 秒轮播）
 * 下层：迷你连续滚动栏（CSS marquee，展示所有条目）
 * 数据源：GitHub + Hacker News + Reddit + DEV.to + 微博 + B站 + 知乎
 */
class TechTicker {
    constructor() {
        // 缓存配置
        this.CACHE_TTL = 20 * 60 * 1000; // 20 分钟统一缓存
        this.CACHE_KEY = 'ticker_cache_v3'; // v3: 新增中国热搜数据源
        
        // DailyHotApi 基地址
        this.DAILYHOT_API = 'https://dailyhotapi-production-cad3.up.railway.app';
        
        // 轮播配置
        this.ROTATE_INTERVAL = 6000; // 6 秒切换
        this.currentIndex = 0;
        this.rotateTimer = null;
        this.tickerItems = [];
        this.isRefreshing = false;
        this.isPaused = false;
        
        // 关键字监控
        this.keywordMatches = new Set(); // 当前匹配的热搜标题集合
        this.keywordAlertSettings = null;
        this._keywordPanelVisible = false;
    }
    
    /**
     * 初始化
     */
    async init() {
        this.bindEvents();
        // 延迟加载，优先保证时钟等核心功能
        setTimeout(() => this.loadData(), 1500);
        // 初始化关键字监控面板
        this.initKeywordAlert();
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        const tickerMain = document.getElementById('ticker-main');
        if (!tickerMain) return;
        
        // 上层卡片点击跳转
        tickerMain.addEventListener('click', (e) => {
            // 不拦截控制按钮的点击
            if (e.target.closest('.ticker-controls')) return;
            const item = this.tickerItems[this.currentIndex];
            if (item?.url) window.open(item.url, '_blank');
        });
        
        // 悬停暂停轮播（仅上层卡片区域）
        tickerMain.addEventListener('mouseenter', () => { this.isPaused = true; });
        tickerMain.addEventListener('mouseleave', () => { this.isPaused = false; });
        
        // 下层迷你滚动栏点击跳转
        const miniTrack = document.getElementById('ticker-mini-track');
        if (miniTrack) {
            miniTrack.addEventListener('click', (e) => {
                const miniItem = e.target.closest('.ticker-mini-item');
                if (miniItem?.dataset.url) {
                    window.open(miniItem.dataset.url, '_blank');
                }
            });
        }
        
        // 上一条 / 下一条
        document.getElementById('ticker-prev-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showPrev();
        });
        document.getElementById('ticker-next-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showNext();
        });
        
        // 刷新
        document.getElementById('ticker-refresh-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.refreshData();
        });
        
        // 折叠迷你滚动栏
        document.getElementById('ticker-toggle-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMiniCollapse();
        });
        
        // 关键字监控按钮
        document.getElementById('ticker-keyword-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleKeywordPanel();
        });
        
        // 监听来自 Service Worker 的关键字匹配更新
        if (chrome?.runtime?.onMessage) {
            chrome.runtime.onMessage.addListener((msg) => {
                if (msg.action === 'keywordMatchesUpdated' && Array.isArray(msg.matches)) {
                    this.keywordMatches = new Set(msg.matches.map(m => m.title));
                    this.renderCurrent();
                    this.renderMiniTrack();
                }
            });
        }
    }
    
    // ========= 轮播控制 =========
    
    showNext() {
        if (this.tickerItems.length === 0) return;
        this.currentIndex = (this.currentIndex + 1) % this.tickerItems.length;
        this.renderCurrent();
        this.resetTimer();
    }
    
    showPrev() {
        if (this.tickerItems.length === 0) return;
        this.currentIndex = (this.currentIndex - 1 + this.tickerItems.length) % this.tickerItems.length;
        this.renderCurrent();
        this.resetTimer();
    }
    
    startRotation() {
        this.stopRotation();
        this.rotateTimer = setInterval(() => {
            if (!this.isPaused && this.tickerItems.length > 1) {
                this.currentIndex = (this.currentIndex + 1) % this.tickerItems.length;
                this.renderCurrent();
            }
        }, this.ROTATE_INTERVAL);
    }
    
    stopRotation() {
        if (this.rotateTimer) {
            clearInterval(this.rotateTimer);
            this.rotateTimer = null;
        }
    }
    
    resetTimer() {
        this.startRotation();
    }
    
    /**
     * 折叠/展开下层迷你滚动栏
     */
    toggleMiniCollapse() {
        const ticker = document.getElementById('tech-ticker');
        if (ticker) {
            ticker.classList.toggle('mini-collapsed');
            this.saveState({ miniCollapsed: ticker.classList.contains('mini-collapsed') });
        }
    }
    
    // ========= 数据加载 =========
    
    async loadData() {
        try {
            // 恢复折叠状态
            const state = await this.loadState();
            if (state?.miniCollapsed) {
                document.getElementById('tech-ticker')?.classList.add('mini-collapsed');
            }
            
            // 尝试缓存
            const cached = await this.getCache();
            if (cached) {
                this.tickerItems = cached;
                this.currentIndex = 0;
                this.renderCurrent();
                this.renderMiniTrack();
                this.startRotation();
                return;
            }
            
            await this.fetchAllData();
        } catch (err) {
            console.warn('[Ticker] 加载失败:', err);
        }
    }
    
    async refreshData() {
        if (this.isRefreshing) return;
        this.isRefreshing = true;
        const btn = document.getElementById('ticker-refresh-btn');
        if (btn) btn.classList.add('refreshing');
        
        try {
            await this.clearCache();
            await this.fetchAllData();
        } catch (err) {
            console.warn('[Ticker] 刷新失败:', err);
        } finally {
            this.isRefreshing = false;
            if (btn) btn.classList.remove('refreshing');
        }
    }
    
    async fetchAllData() {
        const results = await Promise.allSettled([
            this.fetchGitHub(),
            this.fetchHackerNews(),
            this.fetchReddit(),
            this.fetchDevTo(),
            this.fetchWeibo(),
            this.fetchBilibili(),
            this.fetchZhihu()
        ]);
        
        const allItems = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value);
        
        // 交替排列不同数据源
        this.tickerItems = this.interleave(allItems);
        
        if (this.tickerItems.length > 0) {
            await this.setCache(this.tickerItems);
        }
        
        this.currentIndex = 0;
        this.renderCurrent();
        this.renderMiniTrack();
        this.startRotation();
    }
    
    // ========= 数据源 =========
    
    async fetchGitHub() {
        const weekAgo = this.getDateDaysAgo(7);
        const params = new URLSearchParams({
            q: `created:>${weekAgo}`,
            sort: 'stars',
            order: 'desc',
            per_page: '8'
        });
        const url = `https://api.github.com/search/repositories?${params}`;
        const resp = await fetch(url, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
        if (!resp.ok) throw new Error(`GitHub ${resp.status}`);
        const data = await resp.json();
        
        return (data.items || []).map(repo => ({
            type: 'github',
            title: repo.full_name,
            desc: (repo.description || '').substring(0, 100),
            url: repo.html_url,
            icon: '🔥',
            metric: this.formatCount(repo.stargazers_count),
            metricType: 'stars'
        }));
    }
    
    async fetchHackerNews() {
        const resp = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
        if (!resp.ok) throw new Error(`HN ${resp.status}`);
        const ids = await resp.json();
        
        const stories = await Promise.allSettled(
            ids.slice(0, 8).map(id =>
                fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).then(r => r.json())
            )
        );
        
        return stories
            .filter(s => s.status === 'fulfilled' && s.value?.title)
            .map(s => s.value)
            .map(story => ({
                type: 'hackernews',
                title: story.title,
                desc: story.url ? this.extractDomain(story.url) : 'news.ycombinator.com',
                url: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
                icon: '📰',
                metric: `▲${story.score || 0}`,
                metricType: 'score'
            }));
    }
    
    async fetchReddit() {
        const resp = await fetch('https://www.reddit.com/r/programming/hot.json?limit=8&raw_json=1', {
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'web:ChineseSceneryClock:v1.6'
            }
        });
        if (!resp.ok) throw new Error(`Reddit ${resp.status}`);
        const data = await resp.json();
        
        return (data?.data?.children || [])
            .filter(c => c.data && !c.data.stickied)
            .map(c => c.data)
            .map(post => ({
                type: 'reddit',
                title: post.title,
                desc: `r/${post.subreddit} · ${post.num_comments || 0} 评论`,
                url: post.url?.startsWith('http') ? post.url : `https://www.reddit.com${post.permalink}`,
                icon: '💬',
                metric: `▲${this.formatCount(post.score || 0)}`,
                metricType: 'upvotes'
            }));
    }
    
    async fetchDevTo() {
        const resp = await fetch('https://dev.to/api/articles?per_page=8&top=7');
        if (!resp.ok) throw new Error(`DEV.to ${resp.status}`);
        const articles = await resp.json();
        
        return (articles || []).map(article => ({
            type: 'devto',
            title: article.title,
            desc: (article.description || '').substring(0, 100),
            url: article.url,
            icon: '📝',
            metric: `❤️${article.positive_reactions_count || 0}`,
            metricType: 'reactions'
        }));
    }
    
    // ========= 中国热搜数据源 =========
    
    async fetchWeibo() {
        const resp = await fetch(`${this.DAILYHOT_API}/weibo`);
        if (!resp.ok) throw new Error(`Weibo ${resp.status}`);
        const data = await resp.json();
        if (data.code !== 200) throw new Error(`Weibo code ${data.code}`);
        
        return (data.data || []).slice(0, 8).map(item => ({
            type: 'weibo',
            title: item.title,
            desc: `微博热搜`,
            url: item.url || item.mobileUrl,
            icon: '🔥',
            metric: this.formatHot(item.hot),
            metricType: 'weibo-hot'
        }));
    }
    
    async fetchBilibili() {
        const resp = await fetch(`${this.DAILYHOT_API}/bilibili`);
        if (!resp.ok) throw new Error(`Bilibili ${resp.status}`);
        const data = await resp.json();
        if (data.code !== 200) throw new Error(`Bilibili code ${data.code}`);
        
        return (data.data || []).slice(0, 8).map(item => ({
            type: 'bilibili',
            title: item.title,
            desc: item.desc ? item.desc.substring(0, 60) : 'B站热榜',
            url: item.url,
            icon: '📺',
            metric: this.formatHot(item.hot),
            metricType: 'bilibili-hot'
        }));
    }
    
    async fetchZhihu() {
        const resp = await fetch(`${this.DAILYHOT_API}/zhihu`);
        if (!resp.ok) throw new Error(`Zhihu ${resp.status}`);
        const data = await resp.json();
        if (data.code !== 200) throw new Error(`Zhihu code ${data.code}`);
        
        return (data.data || []).slice(0, 8).map(item => ({
            type: 'zhihu',
            title: item.title,
            desc: item.desc ? item.desc.substring(0, 60) : '知乎热榜',
            url: item.url,
            icon: '💭',
            metric: this.formatHot(item.hot),
            metricType: 'zhihu-hot'
        }));
    }
    
    // ========= 渲染 =========
    
    renderCurrent() {
        const item = this.tickerItems[this.currentIndex];
        if (!item) return;
        
        const titleEl = document.getElementById('ticker-title');
        const descEl = document.getElementById('ticker-desc');
        const iconEl = document.getElementById('ticker-source-icon');
        const metricEl = document.getElementById('ticker-metric');
        const counterEl = document.getElementById('ticker-counter');
        
        if (!titleEl) return;
        
        // 淡出
        titleEl.classList.add('fade-out');
        titleEl.classList.remove('fade-in');
        descEl.classList.add('fade-out');
        descEl.classList.remove('fade-in');
        
        setTimeout(() => {
            // 更新内容
            iconEl.textContent = item.icon;
            titleEl.textContent = item.title;
            descEl.textContent = item.desc || '';
            metricEl.textContent = item.metric;
            metricEl.className = `ticker-metric ${item.metricType}`;
            counterEl.textContent = `${this.currentIndex + 1}/${this.tickerItems.length}`;
            
            // 关键字匹配高亮
            const isMatched = this.keywordMatches.has(item.title);
            titleEl.classList.toggle('keyword-matched', isMatched);
            
            // 淡入
            titleEl.classList.remove('fade-out');
            titleEl.classList.add('fade-in');
            descEl.classList.remove('fade-out');
            descEl.classList.add('fade-in');
        }, 200);
    }
    
    /**
     * 渲染下层迷你连续滚动栏
     */
    renderMiniTrack() {
        const track = document.getElementById('ticker-mini-track');
        if (!track || this.tickerItems.length === 0) return;
        
        // 生成所有条目的迷你展示
        const buildItems = () => {
            return this.tickerItems.map((item, i) => {
                const metricHtml = item.metric ? `<span class="ticker-mini-metric">${item.metric}</span>` : '';
                const sep = i < this.tickerItems.length - 1 ? '<span class="ticker-mini-sep"></span>' : '';
                const matchedClass = this.keywordMatches.has(item.title) ? ' keyword-matched' : '';
                return `<span class="ticker-mini-item${matchedClass}" data-url="${item.url || ''}" title="${item.title}">
                    <span class="ticker-mini-icon">${item.icon}</span>
                    ${matchedClass ? '🔔 ' : ''}${this.truncate(item.title, 30)}
                    ${metricHtml}
                </span>${sep}`;
            }).join('');
        };
        
        // 复制一份实现无缝循环
        const content = buildItems();
        track.innerHTML = content + '<span class="ticker-mini-sep"></span>' + content;
        
        // 根据内容长度动态调整滚动速度（每个条目约 3 秒）
        const itemCount = this.tickerItems.length;
        const duration = Math.max(20, itemCount * 3);
        track.style.animationDuration = `${duration}s`;
    }
    
    /**
     * 截断文本
     */
    truncate(text, maxLen) {
        if (!text) return '';
        return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
    }
    
    // ========= 工具方法 =========
    
    formatCount(n) {
        if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
        return String(n);
    }
    
    /**
     * 格式化热度值（支持中文热搜的热度数据）
     * DailyHotApi 返回的 hot 可能是数字或字符串（如 "125万热度"）
     */
    formatHot(hot) {
        if (!hot && hot !== 0) return '';
        // 如果是字符串形式，直接显示（可能是 "125万热度" 之类的）
        if (typeof hot === 'string') {
            // 清理过长的文本
            return hot.length > 10 ? hot.substring(0, 10) : hot;
        }
        // 数字形式
        if (hot >= 100000000) return `${(hot / 100000000).toFixed(1)}亿`;
        if (hot >= 10000) return `${(hot / 10000).toFixed(0)}万`;
        if (hot >= 1000) return `${(hot / 1000).toFixed(1)}k`;
        return String(hot);
    }
    
    getDateDaysAgo(days) {
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d.toISOString().split('T')[0];
    }
    
    extractDomain(url) {
        try { return new URL(url).hostname.replace(/^www\./, ''); }
        catch { return ''; }
    }
    
    /**
     * 交替排列不同数据源的结果
     */
    interleave(items) {
        const groups = {};
        items.forEach(item => {
            if (!groups[item.type]) groups[item.type] = [];
            groups[item.type].push(item);
        });
        
        const keys = Object.keys(groups);
        const result = [];
        let maxLen = Math.max(...keys.map(k => groups[k].length));
        
        for (let i = 0; i < maxLen; i++) {
            for (const key of keys) {
                if (i < groups[key].length) {
                    result.push(groups[key][i]);
                }
            }
        }
        return result;
    }
    
    // ========= 缓存 =========
    
    async getCache() {
        try {
            const storage = chrome?.storage?.session || chrome?.storage?.local;
            if (!storage) {
                const c = sessionStorage.getItem(this.CACHE_KEY);
                if (c) { const p = JSON.parse(c); if (Date.now() - p.ts < this.CACHE_TTL) return p.data; }
                return null;
            }
            const r = await storage.get(this.CACHE_KEY);
            const c = r[this.CACHE_KEY];
            return (c && Date.now() - c.ts < this.CACHE_TTL) ? c.data : null;
        } catch { return null; }
    }
    
    async setCache(data) {
        try {
            const payload = { data, ts: Date.now() };
            const storage = chrome?.storage?.session || chrome?.storage?.local;
            if (!storage) { sessionStorage.setItem(this.CACHE_KEY, JSON.stringify(payload)); return; }
            await storage.set({ [this.CACHE_KEY]: payload });
        } catch {}
    }
    
    async clearCache() {
        try {
            const storage = chrome?.storage?.session || chrome?.storage?.local;
            if (!storage) { sessionStorage.removeItem(this.CACHE_KEY); return; }
            await storage.remove(this.CACHE_KEY);
        } catch {}
    }
    
    async saveState(state) {
        try {
            if (chrome?.storage?.local) await chrome.storage.local.set({ ticker_state: state });
            else localStorage.setItem('ticker_state', JSON.stringify(state));
        } catch {}
    }
    
    async loadState() {
        try {
            if (chrome?.storage?.local) {
                const r = await chrome.storage.local.get('ticker_state');
                return r.ticker_state || null;
            }
            const s = localStorage.getItem('ticker_state');
            return s ? JSON.parse(s) : null;
        } catch { return null; }
    }
    
    // ========= 关键字监控 =========
    
    /**
     * 初始化关键字监控功能
     */
    async initKeywordAlert() {
        await this.loadKeywordSettings();
        this.createKeywordPanel();
        this.checkKeywordMatches();
    }
    
    /**
     * 加载关键字设置
     */
    async loadKeywordSettings() {
        try {
            const storage = chrome?.storage?.sync || chrome?.storage?.local;
            if (storage) {
                const { keywordAlertSettings } = await storage.get('keywordAlertSettings');
                this.keywordAlertSettings = keywordAlertSettings || {
                    enabled: false,
                    keywords: [],
                    scanInterval: 10,
                    maxNotifications: 5,
                    quietHoursStart: '',
                    quietHoursEnd: '',
                    sources: ['weibo', 'bilibili', 'zhihu']
                };
            } else {
                const saved = localStorage.getItem('keywordAlertSettings');
                this.keywordAlertSettings = saved ? JSON.parse(saved) : {
                    enabled: false,
                    keywords: [],
                    scanInterval: 10,
                    maxNotifications: 5,
                    quietHoursStart: '',
                    quietHoursEnd: '',
                    sources: ['weibo', 'bilibili', 'zhihu']
                };
            }
        } catch {
            this.keywordAlertSettings = {
                enabled: false,
                keywords: [],
                scanInterval: 10,
                maxNotifications: 5,
                quietHoursStart: '',
                quietHoursEnd: '',
                sources: ['weibo', 'bilibili', 'zhihu']
            };
        }
    }
    
    /**
     * 保存关键字设置
     */
    async saveKeywordSettings() {
        try {
            const storage = chrome?.storage?.sync || chrome?.storage?.local;
            if (storage) {
                await storage.set({ keywordAlertSettings: this.keywordAlertSettings });
            } else {
                localStorage.setItem('keywordAlertSettings', JSON.stringify(this.keywordAlertSettings));
            }
            // 通知 Service Worker 更新闹钟
            if (chrome?.runtime?.sendMessage) {
                chrome.runtime.sendMessage({ action: 'updateKeywordAlertSettings' }).catch(() => {});
            }
        } catch { /* ignore */ }
    }
    
    /**
     * 创建关键字管理面板 DOM
     */
    createKeywordPanel() {
        if (document.getElementById('keyword-alert-panel')) return;
        
        const panel = document.createElement('div');
        panel.id = 'keyword-alert-panel';
        panel.className = 'keyword-alert-panel';
        // 初始状态由 CSS max-height:0 + opacity:0 控制，不用 display:none
        
        panel.innerHTML = `
            <div class="kap-header">
                <div class="kap-title">
                    <i class="fas fa-bell"></i>
                    <span>热搜关键字监控</span>
                </div>
                <div class="kap-header-actions">
                    <label class="kap-switch" title="总开关">
                        <input type="checkbox" id="kap-enabled" ${this.keywordAlertSettings?.enabled ? 'checked' : ''}>
                        <span class="kap-slider"></span>
                    </label>
                    <button class="kap-close-btn" id="kap-close-btn" title="关闭面板">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="kap-body">
                <div class="kap-input-row">
                    <input type="text" id="kap-keyword-input" class="kap-input" placeholder="输入关键字，回车添加…" maxlength="50">
                    <button class="kap-add-btn" id="kap-add-btn" title="添加关键字">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
                <div class="kap-keyword-list" id="kap-keyword-list"></div>
                <button class="kap-settings-toggle" id="kap-settings-toggle">
                    <i class="fas fa-chevron-down"></i> 高级设置
                </button>
                <div class="kap-settings" id="kap-settings">
                    <div class="kap-setting-row">
                        <label><i class="fas fa-clock"></i> 扫描间隔</label>
                        <select id="kap-interval">
                            <option value="5">5 分钟</option>
                            <option value="10">10 分钟</option>
                            <option value="20">20 分钟</option>
                            <option value="30">30 分钟</option>
                            <option value="60">60 分钟</option>
                        </select>
                    </div>
                    <div class="kap-setting-row">
                        <label><i class="fas fa-moon"></i> 免打扰</label>
                        <div class="kap-quiet-hours">
                            <input type="time" id="kap-quiet-start" value="${this.keywordAlertSettings?.quietHoursStart || ''}">
                            <span>—</span>
                            <input type="time" id="kap-quiet-end" value="${this.keywordAlertSettings?.quietHoursEnd || ''}">
                        </div>
                    </div>
                    <div class="kap-setting-row">
                        <label><i class="fas fa-database"></i> 数据源</label>
                        <div class="kap-sources" id="kap-sources">
                            <label class="kap-source-item"><input type="checkbox" value="weibo" checked> 🔥 微博</label>
                            <label class="kap-source-item"><input type="checkbox" value="bilibili" checked> 📺 B站</label>
                            <label class="kap-source-item"><input type="checkbox" value="zhihu" checked> 💭 知乎</label>
                        </div>
                    </div>
                </div>
                <div class="kap-footer">
                    <button class="kap-scan-btn" id="kap-scan-btn" title="立即扫描一次">
                        <i class="fas fa-search"></i> 立即扫描
                    </button>
                    <span class="kap-status" id="kap-status"></span>
                </div>
            </div>
        `;
        
        // 插入到 ticker 区域之后
        const ticker = document.getElementById('tech-ticker');
        if (ticker) {
            ticker.parentNode.insertBefore(panel, ticker.nextSibling);
        } else {
            document.body.appendChild(panel);
        }
        
        // 绑定面板事件
        this.bindKeywordPanelEvents(panel);
        // 渲染已有关键字
        this.renderKeywordList();
        // 恢复设置状态
        this.restoreKeywordPanelState();
    }
    
    /**
     * 绑定关键字面板事件
     */
    bindKeywordPanelEvents(panel) {
        // 关闭按钮
        panel.querySelector('#kap-close-btn')?.addEventListener('click', () => {
            this.toggleKeywordPanel(false);
        });
        
        // 总开关
        panel.querySelector('#kap-enabled')?.addEventListener('change', (e) => {
            this.keywordAlertSettings.enabled = e.target.checked;
            this.saveKeywordSettings();
            this.updateKeywordBtnState();
        });
        
        // 输入框回车
        const input = panel.querySelector('#kap-keyword-input');
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.addKeyword(input.value.trim());
                input.value = '';
            }
        });
        
        // 添加按钮
        panel.querySelector('#kap-add-btn')?.addEventListener('click', () => {
            const input = panel.querySelector('#kap-keyword-input');
            if (input) {
                this.addKeyword(input.value.trim());
                input.value = '';
            }
        });
        
        // 高级设置折叠/展开
        const settingsToggle = panel.querySelector('#kap-settings-toggle');
        const settingsBody = panel.querySelector('#kap-settings');
        settingsToggle?.addEventListener('click', () => {
            const expanded = settingsBody.classList.toggle('expanded');
            settingsToggle.classList.toggle('expanded', expanded);
        });
        
        // 扫描间隔
        panel.querySelector('#kap-interval')?.addEventListener('change', (e) => {
            this.keywordAlertSettings.scanInterval = parseInt(e.target.value) || 10;
            this.saveKeywordSettings();
        });
        
        // 免打扰时段
        panel.querySelector('#kap-quiet-start')?.addEventListener('change', (e) => {
            this.keywordAlertSettings.quietHoursStart = e.target.value;
            this.saveKeywordSettings();
        });
        panel.querySelector('#kap-quiet-end')?.addEventListener('change', (e) => {
            this.keywordAlertSettings.quietHoursEnd = e.target.value;
            this.saveKeywordSettings();
        });
        
        // 数据源复选框
        panel.querySelectorAll('#kap-sources input[type=checkbox]').forEach(cb => {
            cb.addEventListener('change', () => {
                const checked = [];
                panel.querySelectorAll('#kap-sources input:checked').forEach(c => checked.push(c.value));
                this.keywordAlertSettings.sources = checked;
                this.saveKeywordSettings();
            });
        });
        
        // 立即扫描
        panel.querySelector('#kap-scan-btn')?.addEventListener('click', async () => {
            const btn = panel.querySelector('#kap-scan-btn');
            const status = panel.querySelector('#kap-status');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 扫描中…';
            
            try {
                if (chrome?.runtime?.sendMessage) {
                    await chrome.runtime.sendMessage({ action: 'triggerKeywordScan' });
                    if (status) status.textContent = '✅ 扫描完成';
                } else {
                    this.localKeywordScan();
                    if (status) status.textContent = '✅ 本地扫描完成';
                }
            } catch (err) {
                if (status) status.textContent = '❌ 扫描失败';
                console.warn('[KeywordAlert] 扫描失败:', err);
            }
            
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-search"></i> 立即扫描';
            setTimeout(() => { if (status) status.textContent = ''; }, 3000);
        });
        
        // 点击面板外关闭（仅在可见时生效）
        document.addEventListener('click', (e) => {
            if (this._keywordPanelVisible &&
                !panel.contains(e.target) &&
                !e.target.closest('#ticker-keyword-btn')) {
                this.toggleKeywordPanel(false);
            }
        });
        
        // ESC 关闭面板
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this._keywordPanelVisible) {
                this.toggleKeywordPanel(false);
            }
        });
    }
    
    /**
     * 添加关键字
     */
    addKeyword(text) {
        if (!text || text.length > 50) return;
        
        // 去重
        const exists = this.keywordAlertSettings.keywords.some(
            k => k.text.toLowerCase() === text.toLowerCase()
        );
        if (exists) return;
        
        this.keywordAlertSettings.keywords.push({
            text: text,
            enabled: true
        });
        
        this.saveKeywordSettings();
        this.renderKeywordList();
        this.updateKeywordBtnState();
    }
    
    /**
     * 删除关键字
     */
    removeKeyword(index) {
        this.keywordAlertSettings.keywords.splice(index, 1);
        this.saveKeywordSettings();
        this.renderKeywordList();
        this.updateKeywordBtnState();
    }
    
    /**
     * 切换单个关键字启用状态
     */
    toggleKeyword(index) {
        const kw = this.keywordAlertSettings.keywords[index];
        if (kw) {
            kw.enabled = !kw.enabled;
            this.saveKeywordSettings();
            this.renderKeywordList();
        }
    }
    
    /**
     * 渲染关键字标签列表
     */
    renderKeywordList() {
        const list = document.getElementById('kap-keyword-list');
        if (!list) return;
        
        const keywords = this.keywordAlertSettings?.keywords || [];
        
        if (keywords.length === 0) {
            list.innerHTML = '<div class="kap-empty">暂无关键字，请添加需要监控的词</div>';
            return;
        }
        
        list.innerHTML = keywords.map((kw, i) => `
            <span class="kap-tag ${kw.enabled ? '' : 'disabled'}" data-index="${i}">
                <span class="kap-tag-text" title="点击切换启用/禁用">${this.escapeHtml(kw.text)}</span>
                <button class="kap-tag-remove" data-index="${i}" title="删除">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        `).join('');
        
        // 绑定事件
        list.querySelectorAll('.kap-tag-text').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.parentElement.dataset.index);
                this.toggleKeyword(idx);
            });
        });
        list.querySelectorAll('.kap-tag-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.index);
                this.removeKeyword(idx);
            });
        });
    }
    
    /**
     * 恢复面板状态
     */
    restoreKeywordPanelState() {
        const settings = this.keywordAlertSettings;
        if (!settings) return;
        
        const interval = document.getElementById('kap-interval');
        if (interval) interval.value = String(settings.scanInterval || 10);
        
        // 恢复数据源勾选
        const sources = settings.sources || ['weibo', 'bilibili', 'zhihu'];
        document.querySelectorAll('#kap-sources input[type=checkbox]').forEach(cb => {
            cb.checked = sources.includes(cb.value);
        });
        
        this.updateKeywordBtnState();
    }
    
    /**
     * 切换关键字面板显示/隐藏
     */
    toggleKeywordPanel(force) {
        const panel = document.getElementById('keyword-alert-panel');
        if (!panel) return;
        
        const show = force !== undefined ? force : !this._keywordPanelVisible;
        
        if (show) {
            panel.classList.add('open');
        } else {
            panel.classList.remove('open');
        }
        this._keywordPanelVisible = show;
        
        // 打开时延迟聚焦输入框（等过渡动画完成）
        if (show) {
            setTimeout(() => {
                document.getElementById('kap-keyword-input')?.focus();
            }, 200);
        }
    }
    
    /**
     * 更新关键字按钮状态（有激活关键字时显示指示点）
     */
    updateKeywordBtnState() {
        const btn = document.getElementById('ticker-keyword-btn');
        if (!btn) return;
        
        const hasActive = this.keywordAlertSettings?.enabled &&
            (this.keywordAlertSettings?.keywords || []).some(k => k.enabled);
        btn.classList.toggle('active', hasActive);
    }
    
    /**
     * 前端本地关键字扫描（降级方案：当 Service Worker 不可用时）
     */
    localKeywordScan() {
        const keywords = (this.keywordAlertSettings?.keywords || [])
            .filter(k => k.enabled && k.text?.trim())
            .map(k => k.text.trim().toLowerCase());
        
        if (keywords.length === 0) return;
        
        const newMatches = new Set();
        for (const item of this.tickerItems) {
            const text = `${item.title || ''} ${item.desc || ''}`.toLowerCase();
            for (const kw of keywords) {
                if (text.includes(kw)) {
                    newMatches.add(item.title);
                    break;
                }
            }
        }
        
        this.keywordMatches = newMatches;
        this.renderCurrent();
        this.renderMiniTrack();
    }
    
    /**
     * 页面加载时检查已有的关键字匹配
     */
    async checkKeywordMatches() {
        // 当数据加载完成后，做一次本地匹配检查
        const checkInterval = setInterval(() => {
            if (this.tickerItems.length > 0) {
                clearInterval(checkInterval);
                this.localKeywordScan();
            }
        }, 2000);
        
        // 30 秒后停止检查
        setTimeout(() => clearInterval(checkInterval), 30000);
    }
    
    /**
     * HTML 转义
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

/**
 * Task Ticker - 未完成任务滚动提醒条
 * 
 * 左侧：完成进度（已完成/总数 + 迷你进度条）
 * 右侧：未完成任务标题连续滚动（优先级色点 + 过期高亮）
 * 数据源：chrome.storage.local 中的 memos
 */
class TaskTicker {
    constructor() {
        this.tasks = [];
        this.completedCount = 0;
        this.totalCount = 0;
    }
    
    /**
     * 初始化
     */
    async init() {
        // 延迟加载，等 memo 模块先加载完
        setTimeout(() => this.loadAndRender(), 2000);
        
        // 监听存储变化，实时更新
        if (chrome?.storage?.onChanged) {
            chrome.storage.onChanged.addListener((changes, area) => {
                if (area === 'local' && changes.memos) {
                    this.loadAndRender();
                }
            });
        }
    }
    
    /**
     * 加载数据并渲染
     */
    async loadAndRender() {
        try {
            await this.loadTasks();
            this.render();
        } catch (err) {
            console.warn('[TaskTicker] 加载失败:', err);
        }
    }
    
    /**
     * 从存储中加载任务数据
     */
    async loadTasks() {
        let memos = [];
        try {
            if (chrome?.storage?.local) {
                const result = await chrome.storage.local.get('memos');
                memos = Array.isArray(result.memos) ? result.memos : [];
            }
        } catch {
            memos = [];
        }
        
        const today = new Date().toISOString().split('T')[0];
        
        // 筛选未完成任务（排除每日重复的已完成任务）
        const pending = memos.filter(m => !m.completed);
        const completed = memos.filter(m => m.completed);
        
        this.totalCount = memos.length;
        this.completedCount = completed.length;
        
        // 按优先级排序（高 > 中 > 低 > 无），然后按截止日期
        const priorityOrder = { high: 0, medium: 1, low: 2, none: 3 };
        this.tasks = pending
            .map(m => ({
                id: m.id,
                title: m.title || '无标题',
                priority: m.priority || 'none',
                dueDate: m.dueDate || null,
                overdue: m.dueDate && m.dueDate < today && !m.completed
            }))
            .sort((a, b) => {
                // 过期优先
                if (a.overdue && !b.overdue) return -1;
                if (!a.overdue && b.overdue) return 1;
                // 优先级
                const pa = priorityOrder[a.priority] ?? 3;
                const pb = priorityOrder[b.priority] ?? 3;
                if (pa !== pb) return pa - pb;
                // 截止日期
                if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
                if (a.dueDate) return -1;
                if (b.dueDate) return 1;
                return 0;
            });
    }
    
    /**
     * 渲染提醒条
     */
    render() {
        const container = document.getElementById('task-ticker');
        if (!container) return;
        
        // 没有任务时隐藏整个提醒条
        if (this.totalCount === 0 || this.tasks.length === 0) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');
        
        // 1. 更新统计
        const countEl = document.getElementById('task-ticker-count');
        const fillEl = document.getElementById('task-ticker-fill');
        if (countEl) {
            countEl.textContent = `${this.completedCount}/${this.totalCount}`;
        }
        if (fillEl) {
            const pct = this.totalCount > 0 ? Math.round((this.completedCount / this.totalCount) * 100) : 0;
            fillEl.style.width = `${pct}%`;
        }
        
        // 2. 渲染滚动任务列表
        const track = document.getElementById('task-ticker-track');
        if (!track) return;
        
        const buildItems = () => {
            return this.tasks.map((task, i) => {
                const overdueClass = task.overdue ? ' overdue' : '';
                const sep = i < this.tasks.length - 1 ? '<span class="task-ticker-sep"></span>' : '';
                return `<span class="task-ticker-item${overdueClass}" data-task-id="${task.id}" title="${task.title}${task.dueDate ? ' · 截止: ' + task.dueDate : ''}${task.overdue ? ' ⚠️ 已过期' : ''}">
                    <span class="task-ticker-dot ${task.priority}"></span>
                    ${this.escapeHtml(this.truncate(task.title, 25))}
                </span>${sep}`;
            }).join('');
        };
        
        // 复制一份实现无缝循环
        const content = buildItems();
        track.innerHTML = content + '<span class="task-ticker-sep"></span>' + content;
        
        // 动态调整滚动速度（每个任务约 3 秒）
        const duration = Math.max(15, this.tasks.length * 3);
        track.style.animationDuration = `${duration}s`;
        
        // 3. 绑定任务项交互事件
        this.bindTaskItemEvents(track);
        
        // 4. 初始化悬停弹窗
        this.ensurePopover();
    }
    
    /**
     * 绑定任务项的悬停弹窗和点击事件
     */
    bindTaskItemEvents(track) {
        let hoverTimer = null;
        
        track.querySelectorAll('.task-ticker-item').forEach(item => {
            // 悬停显示弹窗
            item.addEventListener('mouseenter', (e) => {
                clearTimeout(hoverTimer);
                hoverTimer = setTimeout(() => {
                    this.showPopover(item.dataset.taskId, item);
                }, 400); // 400ms 延迟避免快速滑过时闪烁
            });
            
            item.addEventListener('mouseleave', () => {
                clearTimeout(hoverTimer);
                // 延迟隐藏，让鼠标可以移到弹窗上
                hoverTimer = setTimeout(() => this.hidePopoverIfNotHovered(), 200);
            });
            
            // 点击直接打开编辑（保持原有功能）
            item.addEventListener('click', () => {
                this.hidePopover();
                const taskId = item.dataset.taskId;
                if (taskId && window.memoManager) {
                    const sidebar = document.getElementById('task-sidebar');
                    if (sidebar?.classList.contains('collapsed')) {
                        window.memoManager.togglePanel();
                    }
                    const task = window.memoManager.memos.find(m => m.id === taskId);
                    if (task) {
                        window.memoManager.showSidebarForm(task);
                    }
                }
            });
        });
    }
    
    /**
     * 确保悬停弹窗 DOM 存在
     */
    ensurePopover() {
        if (this._popover) return;
        
        this._popover = document.createElement('div');
        this._popover.className = 'task-ticker-popover';
        this._popover.style.display = 'none';
        document.body.appendChild(this._popover);
        
        // 弹窗自身的 hover 保持显示
        this._popover.addEventListener('mouseenter', () => {
            clearTimeout(this._hideTimer);
        });
        this._popover.addEventListener('mouseleave', () => {
            this._hideTimer = setTimeout(() => this.hidePopover(), 150);
        });
    }
    
    /**
     * 显示任务悬停弹窗
     */
    showPopover(taskId, anchorEl) {
        if (!taskId || !this._popover || !window.memoManager) return;
        
        const task = window.memoManager.memos.find(m => m.id === taskId);
        if (!task) return;
        
        // 优先级配置
        const priorityMap = {
            high: { name: '高', color: '#ff4757', icon: 'fa-arrow-up' },
            medium: { name: '中', color: '#ffa502', icon: 'fa-minus' },
            low: { name: '低', color: '#2ed573', icon: 'fa-arrow-down' },
            none: { name: '无', color: '#999', icon: '' }
        };
        const pCfg = priorityMap[task.priority] || priorityMap.none;
        
        // 截止日期
        const today = new Date().toISOString().split('T')[0];
        let dueHtml = '';
        if (task.dueDate) {
            const isOverdue = task.dueDate < today && !task.completed;
            const isToday = task.dueDate === today;
            dueHtml = `<span class="ttp-due ${isOverdue ? 'overdue' : ''} ${isToday ? 'today' : ''}">
                <i class="fas fa-calendar-alt"></i> ${task.dueDate}${isOverdue ? ' 已过期' : ''}${isToday ? ' 今天' : ''}
            </span>`;
        }
        
        // 进度
        let progressHtml = '';
        if (task.progress !== null && task.progress !== undefined) {
            progressHtml = `<div class="ttp-progress">
                <div class="ttp-progress-bar"><div class="ttp-progress-fill" style="width:${task.progress}%"></div></div>
                <span class="ttp-progress-text">${task.progress}%</span>
            </div>`;
        }
        
        // 子任务摘要
        let subtasksHtml = '';
        if (task.subtasks && task.subtasks.length > 0) {
            const done = task.subtasks.filter(st => st.completed).length;
            subtasksHtml = `<span class="ttp-subtasks"><i class="fas fa-list-check"></i> 子任务 ${done}/${task.subtasks.length}</span>`;
        }
        
        this._popover.innerHTML = `
            <div class="ttp-header">
                <span class="ttp-priority" style="color:${pCfg.color}">
                    ${pCfg.icon ? `<i class="fas ${pCfg.icon}"></i>` : ''} ${pCfg.name}
                </span>
                <span class="ttp-title">${this.escapeHtml(task.title || '无标题')}</span>
            </div>
            ${task.text ? `<div class="ttp-desc">${this.escapeHtml(this.truncate(task.text, 80))}</div>` : ''}
            ${progressHtml}
            <div class="ttp-meta">
                ${dueHtml}
                ${subtasksHtml}
            </div>
            <div class="ttp-actions">
                <button class="ttp-btn ttp-btn-complete" data-task-id="${task.id}" title="标记为已完成">
                    <i class="fas fa-check"></i> 完成
                </button>
                <button class="ttp-btn ttp-btn-edit" data-task-id="${task.id}" title="编辑任务">
                    <i class="fas fa-pen"></i> 编辑
                </button>
            </div>
        `;
        
        // 定位弹窗
        const rect = anchorEl.getBoundingClientRect();
        this._popover.style.display = 'block';
        
        // 计算位置：显示在任务项下方
        const popW = this._popover.offsetWidth || 260;
        let left = rect.left + rect.width / 2 - popW / 2;
        if (left < 8) left = 8;
        if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
        
        this._popover.style.left = left + 'px';
        this._popover.style.top = (rect.bottom + 8) + 'px';
        
        // 绑定按钮事件
        const completeBtn = this._popover.querySelector('.ttp-btn-complete');
        const editBtn = this._popover.querySelector('.ttp-btn-edit');
        
        completeBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.completeTask(task.id);
        });
        
        editBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.hidePopover();
            if (window.memoManager) {
                const sidebar = document.getElementById('task-sidebar');
                if (sidebar?.classList.contains('collapsed')) {
                    window.memoManager.togglePanel();
                }
                const t = window.memoManager.memos.find(m => m.id === task.id);
                if (t) window.memoManager.showSidebarForm(t);
            }
        });
    }
    
    /**
     * 快速完成任务
     */
    async completeTask(taskId) {
        if (!window.memoManager) return;
        
        const task = window.memoManager.memos.find(m => m.id === taskId);
        if (!task) return;
        
        task.completed = true;
        task.completedAt = Date.now();
        task.updatedAt = Date.now();
        
        // 如果有子任务，全部标记完成
        if (task.subtasks && task.subtasks.length > 0) {
            task.subtasks.forEach(st => { st.completed = true; });
            task.progress = 100;
        }
        
        await window.memoManager.saveMemos();
        
        // 完成动画
        this._popover.classList.add('completing');
        setTimeout(() => {
            this.hidePopover();
            // 刷新滚动条和侧边栏
            this.loadAndRender();
            if (window.memoManager.renderSidebarTaskList) {
                window.memoManager.renderSidebarTaskList();
            }
        }, 500);
    }
    
    /**
     * 隐藏弹窗
     */
    hidePopover() {
        if (this._popover) {
            this._popover.style.display = 'none';
            this._popover.classList.remove('completing');
        }
    }
    
    /**
     * 仅当鼠标不在弹窗上时隐藏
     */
    hidePopoverIfNotHovered() {
        if (this._popover && !this._popover.matches(':hover')) {
            this.hidePopover();
        }
    }
    
    truncate(text, maxLen) {
        if (!text) return '';
        return text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
    }
    
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}

// 全局实例
window.techTicker = new TechTicker();
window.taskTicker = new TaskTicker();
