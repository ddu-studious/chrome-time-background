/**
 * Tech Ticker - 单条轮播信息栏模块
 * 
 * 在页面顶部单条轮播展示热门技术资讯
 * 数据源：GitHub Search API + Hacker News + Reddit + DEV.to
 */
class TechTicker {
    constructor() {
        // 缓存配置
        this.CACHE_TTL = 20 * 60 * 1000; // 20 分钟统一缓存
        this.CACHE_KEY = 'ticker_cache_v2';
        
        // 轮播配置
        this.ROTATE_INTERVAL = 6000; // 6 秒切换
        this.currentIndex = 0;
        this.rotateTimer = null;
        this.tickerItems = [];
        this.isRefreshing = false;
        this.isPaused = false;
    }
    
    /**
     * 初始化
     */
    async init() {
        this.bindEvents();
        // 延迟加载，优先保证时钟等核心功能
        setTimeout(() => this.loadData(), 1500);
    }
    
    /**
     * 绑定事件
     */
    bindEvents() {
        const ticker = document.getElementById('tech-ticker');
        if (!ticker) return;
        
        // 点击跳转
        ticker.addEventListener('click', (e) => {
            // 不拦截控制按钮的点击
            if (e.target.closest('.ticker-controls')) return;
            const item = this.tickerItems[this.currentIndex];
            if (item?.url) window.open(item.url, '_blank');
        });
        
        // 悬停暂停轮播
        ticker.addEventListener('mouseenter', () => { this.isPaused = true; });
        ticker.addEventListener('mouseleave', () => { this.isPaused = false; });
        
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
        
        // 折叠
        document.getElementById('ticker-toggle-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleCollapse();
        });
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
    
    toggleCollapse() {
        const ticker = document.getElementById('tech-ticker');
        if (ticker) {
            ticker.classList.toggle('collapsed');
            this.saveState({ collapsed: ticker.classList.contains('collapsed') });
        }
    }
    
    // ========= 数据加载 =========
    
    async loadData() {
        try {
            // 恢复折叠状态
            const state = await this.loadState();
            if (state?.collapsed) {
                document.getElementById('tech-ticker')?.classList.add('collapsed');
            }
            
            // 尝试缓存
            const cached = await this.getCache();
            if (cached) {
                this.tickerItems = cached;
                this.currentIndex = 0;
                this.renderCurrent();
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
            this.fetchDevTo()
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
            
            // 淡入
            titleEl.classList.remove('fade-out');
            titleEl.classList.add('fade-in');
            descEl.classList.remove('fade-out');
            descEl.classList.add('fade-in');
        }, 200);
    }
    
    // ========= 工具方法 =========
    
    formatCount(n) {
        if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
        if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
        return String(n);
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
}

// 全局实例
window.techTicker = new TechTicker();
