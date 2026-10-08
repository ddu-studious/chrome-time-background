(function (root) {
    'use strict';
    const HOME = 'https://www.youtube.com/';
    const TTL = 5 * 60 * 1000;
    const fail = code => Object.assign(new Error(code), { code });
    const isPage = url => {
        try { const u = new URL(url); return u.origin === 'https://www.youtube.com' && !u.pathname.startsWith('/embed/'); }
        catch { return false; }
    };

    class YouTubeHomeService {
        constructor(chromeApi) {
            this.chrome = chromeApi;
            this.sessions = new Map();
            this.running = new Map();
        }

        owner(sender) {
            let url;
            try { url = new URL(sender.url); } catch { throw fail('home-forbidden'); }
            if (sender.id !== this.chrome.runtime.id || url.protocol !== 'chrome-extension:'
                || url.hostname !== this.chrome.runtime.id || url.pathname !== '/index.html'
                || (!sender.documentId && !Number.isInteger(sender.tab?.id))) throw fail('home-forbidden');
            return sender.documentId || `tab:${sender.tab.id}`;
        }

        async sourceTab(sender) {
            if (Number.isInteger(sender.tab?.id)) return sender.tab;
            // Extension documents may omit sender.tab; resolve their trusted document ID.
            const contexts = await this.chrome.runtime.getContexts({ contextTypes: ['TAB'], documentIds: [sender.documentId] });
            const context = contexts.find(item => item.documentId === sender.documentId && item.tabId >= 0);
            if (!context) throw fail('home-forbidden');
            return this.chrome.tabs.get(context.tabId);
        }

        release(sender) {
            const owner = this.owner(sender);
            const pending = this.running.get(owner);
            if (pending) pending.cancelled = true;
            for (const [key, entry] of this.sessions) if (entry.owner === owner) this.sessions.delete(key);
            return { ok: true };
        }

        async waitReady(tabId, operation) {
            const deadline = Date.now() + 12000;
            while (Date.now() < deadline) {
                if (operation.cancelled) throw fail('home-cancelled');
                const tab = await this.chrome.tabs.get(tabId);
                if (tab.status === 'complete') {
                    if (!isPage(tab.url)) throw fail('home-login-required');
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            throw fail('home-timeout');
        }

        async read(message, sender) {
            const owner = this.owner(sender);
            if (this.running.has(owner)) throw fail('home-busy');
            for (const [key, entry] of this.sessions) if (entry.expires <= Date.now()) this.sessions.delete(key);
            const previous = message.cursor ? this.sessions.get(message.cursor) : null;
            if (message.cursor && (!previous || previous.owner !== owner)) throw fail('home-expired');
            if (!message.cursor) for (const [key, entry] of this.sessions) if (entry.owner === owner) this.sessions.delete(key);
            const operation = { cancelled: false };
            this.running.set(owner, operation);
            let created = null;
            try {
                const source = await this.sourceTab(sender);
                const tabs = (await this.chrome.tabs.query({ url: 'https://www.youtube.com/*' }))
                    .filter(tab => isPage(tab.url) && Boolean(tab.incognito) === Boolean(source.incognito))
                    .sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
                // Keep the original source tab for pagination rather than switching accounts silently.
                let tab = previous ? tabs.find(tab => tab.id === previous.tabId) : tabs[0];
                if (previous && !tab && !previous.temporary) throw fail('home-source-closed');
                if (!tab) {
                    tab = await this.chrome.tabs.create({ url: HOME, active: false, windowId: source.windowId });
                    created = tab.id;
                }
                await this.waitReady(tab.id, operation);
                await this.chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', files: ['vendor/youtube-home/page.js'] });
                if (operation.cancelled) throw fail('home-cancelled');
                const [result] = await this.chrome.scripting.executeScript({
                    target: { tabId: tab.id }, world: 'MAIN',
                    func: options => globalThis.__timeKeeperYouTubeHome(options),
                    args: [{ previous: previous?.raw || null, expectedAccount: previous?.account || '' }],
                });
                if (operation.cancelled) throw fail('home-cancelled');
                const response = result?.result;
                if (!response?.ok) throw fail(response?.error?.code || 'home-fetch-failed');
                const data = response.data;
                if (!Array.isArray(data?.items) || data.items.length > 100 || !/^[a-f0-9]{64}$/.test(data.account || '')
                    || !data.raw || JSON.stringify(data.raw).length > 2_000_000) throw fail('home-format-changed');
                const items = data.items.map(item => {
                    if (!/^[A-Za-z0-9_-]{11}$/.test(item.id)) throw fail('home-format-changed');
                    const clean = { id: item.id, kind: 'video', source: 'youtube-home', thumbnail: `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg` };
                    for (const key of ['title', 'channel', 'durationLabel', 'publishedLabel', 'viewCountLabel']) clean[key] = String(item[key] || '').slice(0, 500);
                    clean.channelId = /^UC[\w-]+$/.test(item.channelId || '') ? item.channelId : '';
                    clean.channelUrl = clean.channelId ? `https://www.youtube.com/channel/${clean.channelId}` : '';
                    return clean;
                });
                let cursor = '';
                if (data.hasMore) {
                    cursor = crypto.randomUUID();
                    this.sessions.set(cursor, { owner, raw: data.raw, account: data.account, tabId: tab.id, temporary: created !== null, expires: Date.now() + TTL });
                    while (this.sessions.size > 8) this.sessions.delete(this.sessions.keys().next().value);
                }
                if (message.cursor) this.sessions.delete(message.cursor);
                return { items, cursor, source: 'youtube-home', fetchedAt: new Date().toISOString() };
            } catch (error) {
                // Never return raw SDK exceptions, page data or login material to the UI/logs.
                throw fail(error.code?.startsWith('home-') ? error.code : 'home-fetch-failed');
            } finally {
                this.running.delete(owner);
                if (created !== null) {
                    try {
                        const tab = await this.chrome.tabs.get(created);
                        if (!tab.active && tab.url === HOME) await this.chrome.tabs.remove(created);
                    } catch { /* The user may already have closed the temporary tab. */ }
                }
            }
        }
    }
    root.YouTubeHomeService = YouTubeHomeService;
    if (typeof module !== 'undefined' && module.exports) module.exports = { YouTubeHomeService, isPage };
})(typeof self !== 'undefined' ? self : globalThis);
