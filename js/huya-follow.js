(function (root) {
    'use strict';
    // 虎牙关注列表只存在于其私有 Taf/WUP 接口和 /myfollow 页面中，没有公开 SDK 或 HTTP API。
    // 这里不实现该协议，也不读取登录票据：只查询 udb_uid 一个 Cookie（虎牙页面自己也据此判断登录）来确认已登录并派生缓存隔离键，
    // 再在后台标签页打开虎牙自己的“我的关注”页面，读取页面渲染出的列表 DOM，经 HuyaCore 白名单投影后返回。
    // 详见 docs/technical/huya-app-20261011.md。
    const Core = root.HuyaCore || (typeof require === 'function' ? require('./huya-core.js') : null);
    if (!Core) throw new Error('HuyaCore is required before HuyaFollowService');

    const DEFAULT_TIMING = Object.freeze({
        commit: 20_000,
        operation: 70_000,
        poll: 150,
        page: Core.FOLLOW_PAGE_TIMEOUT_MS,
        minPage: 1_000,
        grace: 5_000,
        touchedGrace: 5_000,
    });
    const fail = Core.fail;
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

    function isFollowPage(url) {
        try {
            const parsed = new URL(url);
            return parsed.origin === Core.ORIGIN && (parsed.pathname === '/myfollow' || parsed.pathname === '/myfollow/');
        } catch { return false; }
    }

    // 标记里带创建时间，只用于清理后台标签页遗留；用户激活过的标签页（lastAccessed 晚于创建）一律保留。
    function markerCreatedAt(url) {
        const match = String(url || '').match(/#tk-follow-(\d{10,16})-/);
        return match ? Number(match[1]) : 0;
    }

    async function sha256(value) {
        const bytes = new TextEncoder().encode(value);
        const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function withTimeout(promise, ms, code) {
        let timer;
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(fail(code)), ms); });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
    }

    class HuyaFollowService {
        constructor(chromeApi, options = {}) {
            this.chrome = chromeApi;
            this.running = new Map();
            this.now = options.now || Date.now;
            this.sleep = options.sleep || pause;
            this.timing = { ...DEFAULT_TIMING, ...(options.timing || {}) };
        }

        // 只接受本扩展新标签页（index.html）的消息；其他扩展页面、内容脚本和网页都不能触发后台读取。
        owner(sender) {
            let url;
            try { url = new URL(sender.url); } catch { throw fail('huya-forbidden'); }
            if (sender.id !== this.chrome.runtime.id || url.protocol !== 'chrome-extension:'
                || url.hostname !== this.chrome.runtime.id || url.pathname !== '/index.html'
                || (!sender.documentId && !Number.isInteger(sender.tab?.id))) throw fail('huya-forbidden');
            return sender.documentId || `tab:${sender.tab.id}`;
        }

        async sourceTab(sender) {
            if (Number.isInteger(sender.tab?.id)) return sender.tab;
            const contexts = await this.chrome.runtime.getContexts({ contextTypes: ['TAB'], documentIds: [sender.documentId] });
            const context = contexts.find(item => item.documentId === sender.documentId && item.tabId >= 0);
            if (!context) throw fail('huya-forbidden');
            return this.chrome.tabs.get(context.tabId);
        }

        // 登录判断与虎牙页面自身一致（udb_uid 为正整数）。UID 只用于派生账号摘要以隔离缓存，不返回、不记录。
        async identify(source) {
            let storeId;
            try {
                const stores = await this.chrome.cookies.getAllCookieStores();
                storeId = stores.find(store => store.tabIds?.includes(source.id))?.id;
            } catch { storeId = undefined; }
            let cookie;
            try {
                cookie = await this.chrome.cookies.get({
                    url: `${Core.ORIGIN}/`,
                    name: Core.LOGIN_COOKIE,
                    ...(storeId ? { storeId } : {}),
                });
            } catch { throw fail('huya-cookie-unavailable'); }
            const uid = Core.parseLoginCookie(cookie?.value);
            if (!uid) throw fail('huya-login-required');
            return { account: await sha256(`huya-follow:${uid}`) };
        }

        async loadCache(account) {
            try {
                const stored = await this.chrome.storage.local.get(Core.FOLLOW_CACHE_KEY);
                return Core.sanitizeFollowCache(stored?.[Core.FOLLOW_CACHE_KEY], account, this.now());
            } catch { return null; }
        }

        async saveCache(account, snapshot) {
            try {
                await this.chrome.storage.local.set({
                    [Core.FOLLOW_CACHE_KEY]: { account, fetchedAt: this.now(), items: snapshot.items, complete: snapshot.complete },
                });
            } catch { /* 缓存只是加速手段，写入失败不能让本次读取失败。 */ }
        }

        present(entry, cached) {
            return {
                items: entry.items,
                complete: entry.complete,
                empty: entry.items.length === 0,
                fetchedAt: entry.fetchedAt,
                cached,
                stale: this.now() - entry.fetchedAt > Core.FOLLOW_CACHE_TTL_MS,
            };
        }

        async clear(sender) {
            this.owner(sender);
            try { await this.chrome.storage.local.remove(Core.FOLLOW_CACHE_KEY); } catch { throw fail('huya-read-failed'); }
            return { ok: true };
        }

        // 关闭工作台或页面时终止本窗口的读取，并立即关闭尚未被用户接管的后台标签页。
        release(sender) {
            const owner = this.owner(sender);
            const operation = this.running.get(owner);
            if (operation) {
                operation.cancelled = true;
                // 立即释放占位，窗口重新打开后可马上发起新读取；旧读取在下一个检查点以 cancelled 结束。
                this.running.delete(owner);
                void this.closeHelper(operation);
            }
            return { ok: true };
        }

        check(operation) {
            if (operation.cancelled) throw fail('huya-cancelled');
            if (this.now() > operation.deadline) throw fail('huya-timeout');
        }

        // 标签页由本次读取创建；只要用户没有激活过它（非活动，且 lastAccessed 未晚于创建时间）就仍是后台读取页。
        // 不能按当前地址判断归属：虎牙可能把它重定向到登录页，加载失败时也是 chrome-error 页面，
        // 这些没人看得到的后台页面同样要关闭，否则每次重试都会遗留一个标签页。
        untouched(tab, operation) {
            if (tab.active) return false;
            return !(Number.isFinite(tab.lastAccessed) && tab.lastAccessed > operation.createdAt + this.timing.touchedGrace);
        }

        async closeHelper(operation) {
            if (operation.tabId === null || operation.closed) return;
            operation.closed = true;
            try {
                const tab = await this.chrome.tabs.get(operation.tabId);
                if (this.untouched(tab, operation)) await this.chrome.tabs.remove(operation.tabId);
            } catch { /* 用户可能已经关闭了该标签页。 */ }
        }

        // 服务工作线程被回收后遗留的后台标签页：只清理带本扩展标记、从未被激活的标签页。
        // 同源重定向（如登录页）会保留 #tk-follow-… 片段，所以按虎牙主站全站查询，再按标记筛选。
        async sweep(source) {
            if (this.running.size > 0) return;
            try {
                const tabs = await this.chrome.tabs.query({ url: `${Core.ORIGIN}/*` });
                for (const tab of tabs) {
                    const createdAt = markerCreatedAt(tab.url);
                    if (!createdAt || Boolean(tab.incognito) !== Boolean(source.incognito)) continue;
                    if (this.now() - createdAt < this.timing.operation) continue;
                    if (this.untouched(tab, { createdAt })) await this.chrome.tabs.remove(tab.id);
                }
            } catch { /* 清理失败不影响本次读取。 */ }
        }

        async waitForCommit(operation) {
            const deadline = Math.min(operation.deadline, this.now() + this.timing.commit);
            while (this.now() < deadline) {
                this.check(operation);
                let tab;
                try { tab = await this.chrome.tabs.get(operation.tabId); } catch { throw fail('huya-tab-closed'); }
                const url = String(tab.url || '');
                if (isFollowPage(url)) return tab;
                if (url.startsWith('chrome-error:')) throw fail('huya-load-failed');
                if (url && url !== 'about:blank') throw fail('huya-redirected');
                await this.sleep(this.timing.poll);
            }
            this.check(operation);
            throw fail('huya-timeout');
        }

        async explainReadFailure(operation, error) {
            if (operation.cancelled) return fail('huya-cancelled');
            if (String(error?.code || '').startsWith('huya-')) return error;
            try {
                const tab = await this.chrome.tabs.get(operation.tabId);
                if (!isFollowPage(tab.url)) return fail('huya-redirected');
            } catch { return fail('huya-tab-closed'); }
            return fail('huya-read-failed');
        }

        async read(message = {}, sender) {
            const owner = this.owner(sender);
            const cacheOnly = message.mode === 'cache';
            if (!cacheOnly && this.running.has(owner)) throw fail('huya-busy');
            const source = await this.sourceTab(sender);
            const { account } = await this.identify(source);
            const cached = await this.loadCache(account);
            if (cacheOnly) return cached ? this.present(cached, true) : null;
            if (cached && message.force !== true && this.now() - cached.fetchedAt <= Core.FOLLOW_CACHE_TTL_MS) {
                return this.present(cached, true);
            }

            await this.sweep(source);
            if (this.running.has(owner)) throw fail('huya-busy');
            const startedAt = this.now();
            const operation = { cancelled: false, tabId: null, closed: false, createdAt: startedAt, deadline: startedAt + this.timing.operation };
            this.running.set(owner, operation);
            try {
                const marker = `${Core.FOLLOW_TAB_MARKER}${startedAt}-${globalThis.crypto.randomUUID()}`;
                // 虎牙页面自带重脚本，需要十几秒；创建时不抢焦点，也不进入网站工作区的监控范围。
                const tab = await this.chrome.tabs.create({ url: `${Core.FOLLOW_PAGE_URL}${marker}`, active: false, windowId: source.windowId });
                operation.tabId = tab.id;
                await this.waitForCommit(operation);
                this.check(operation);

                const remaining = operation.deadline - this.now();
                const timeoutMs = Math.max(this.timing.minPage, Math.min(this.timing.page, remaining - this.timing.grace));
                let results;
                try {
                    results = await withTimeout(this.chrome.scripting.executeScript({
                        target: { tabId: operation.tabId },
                        world: 'ISOLATED',
                        injectImmediately: true,
                        func: Core.readFollowPage,
                        args: [{ timeoutMs, maxItems: Core.FOLLOW_MAX_ITEMS, maxPages: Core.FOLLOW_MAX_PAGES }],
                    }), timeoutMs + this.timing.grace, 'huya-timeout');
                } catch (error) {
                    throw await this.explainReadFailure(operation, error);
                }
                this.check(operation);

                const page = Array.isArray(results) ? results[0]?.result : null;
                if (!page || typeof page !== 'object') throw fail('huya-read-failed');
                // 读取完成后页面仍须停留在“我的关注”，否则数据可能来自跳转后的其他页面。
                let finalTab;
                try { finalTab = await this.chrome.tabs.get(operation.tabId); } catch { throw fail('huya-tab-closed'); }
                if (!isFollowPage(finalTab.url)) throw fail('huya-redirected');

                if (page.state === 'timeout') throw fail('huya-timeout');
                // 虎牙在“请求失败”和“确实没有关注”时渲染同一提示：返回空结果但不覆盖旧缓存。
                if (page.state === 'empty') return { items: [], complete: true, empty: true, fetchedAt: this.now(), cached: false, stale: false };
                if (page.state !== 'ready') throw fail('huya-format-changed');
                const snapshot = Core.normalizeFollowSnapshot(page);
                if (!snapshot.items.length) return { items: [], complete: snapshot.complete, empty: true, fetchedAt: this.now(), cached: false, stale: false };
                await this.saveCache(account, snapshot);
                return this.present({ items: snapshot.items, complete: snapshot.complete, fetchedAt: this.now() }, false);
            } catch (error) {
                // 只返回错误码；页面文本、异常原文和登录材料不得进入 UI 或日志。
                throw fail(String(error?.code || '').startsWith('huya-') ? error.code : 'huya-read-failed');
            } finally {
                if (this.running.get(owner) === operation) this.running.delete(owner);
                await this.closeHelper(operation);
            }
        }
    }

    const api = { HuyaFollowService, isFollowPage, markerCreatedAt };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.HuyaFollowService = HuyaFollowService;
})(typeof self !== 'undefined' ? self : globalThis);
