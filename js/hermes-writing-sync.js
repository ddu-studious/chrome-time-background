/**
 * Hermes Cron → 写作空间同步
 * 从 cursor-bridge (127.0.0.1:19840) 拉取待入库故事，写入 chrome.storage blogPosts
 * 可在页面与 Service Worker（importScripts）中共用
 */
(function () {
    const root = typeof globalThis !== 'undefined' ? globalThis : window;
    const BRIDGE_URL = 'http://127.0.0.1:19840';
    const STORAGE_KEY = 'hermesWritingSyncState';
    const LOCK_KEY = 'hermesWritingSyncLock';
    const LOCK_TTL_MS = 8 * 60 * 1000;
    const SCAN_INTERVAL_MS = 60 * 60 * 1000;

    const JOB_HINTS = {
        '0c0d2c2e0918': '中国历史每日故事',
        'dd51052451f6': '中国学术思想史每日一讲',
        '469d08ad3a2d': '抗日战争前后故事',
        '17e2846968d9': '地理故事',
    };

    function getBlogManager() {
        return root.blogManager || null;
    }

    function logSync(msg, detail) {
        if (detail !== undefined) {
            console.log('[HermesSync]', msg, detail);
        } else {
            console.log('[HermesSync]', msg);
        }
    }

    async function getBlogPosts() {
        const blog = getBlogManager();
        if (blog?._posts) return blog._posts;
        const data = await chrome.storage.local.get(['blogPosts']);
        return Array.isArray(data.blogPosts) ? data.blogPosts : [];
    }

    async function getBlogExternalIds() {
        const posts = await getBlogPosts();
        return new Set(
            posts.map(p => p.source?.externalId).filter(Boolean)
        );
    }

    /** Hermes 文章去重键：优先 externalId，其次 outputPath / 运行时间+任务 */
    function hermesDedupeKey(post) {
        const ext = post.source?.externalId;
        if (ext) return `ext:${ext}`;

        const path = post.source?.outputPath;
        if (path) return `path:${path}`;

        const c = post.content || '';
        const fromHermes = post.source?.type === 'hermes-cron'
            || (post.tags || []).includes('hermes')
            || /Hermes Cron/i.test(c);
        if (!fromHermes) return null;

        const jobM = c.match(/>\s*\*\*任务 ID\*\*:\s*`([^`]+)`/);
        const runM = c.match(/>\s*\*\*运行时间\*\*:\s*([^\n]+)/);
        if (jobM && runM) return `run:${jobM[1]}:${runM[1].trim()}`;

        const title = (post.title || '').trim();
        if (title) return `title:${post.category || ''}:${title}`;
        return null;
    }

    function postHermesScore(post) {
        let s = 0;
        if (post.source?.externalId) s += 20;
        if (post.source?.outputPath) s += 10;
        if (post.source?.type === 'hermes-cron') s += 5;
        if ((post.tags || []).includes('hermes')) s += 2;
        return s;
    }

    function dedupeHermesPostsList(posts) {
        const keepByKey = new Map();
        const removeIds = new Set();

        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            const key = hermesDedupeKey(post);
            if (!key) continue;

            if (!keepByKey.has(key)) {
                keepByKey.set(key, i);
                continue;
            }

            const keepIdx = keepByKey.get(key);
            const existing = posts[keepIdx];
            if (postHermesScore(post) > postHermesScore(existing)) {
                removeIds.add(existing.id);
                keepByKey.set(key, i);
            } else {
                removeIds.add(post.id);
            }
        }

        const removed = posts.filter(p => removeIds.has(p.id));
        const kept = posts.filter(p => !removeIds.has(p.id));
        return { posts: kept, removed };
    }

    async function dedupeHermesPosts() {
        const blog = getBlogManager();
        const posts = await getBlogPosts();
        const { posts: kept, removed } = dedupeHermesPostsList(posts);

        if (!removed.length) {
            return { removed: 0, titles: [] };
        }

        if (blog?._posts) {
            blog._posts = kept;
            if (blog._savePosts) await blog._savePosts();
            if (blog._updateDockBadge) blog._updateDockBadge();
        } else {
            await chrome.storage.local.set({ blogPosts: kept });
        }

        logSync('去重完成', {
            removed: removed.length,
            samples: removed.slice(0, 5).map(p => ({
                title: (p.title || '').slice(0, 36),
                externalId: p.source?.externalId || null,
            })),
        });

        return {
            removed: removed.length,
            titles: removed.map(p => p.title),
        };
    }

    async function loadSyncState() {
        const data = await chrome.storage.local.get([STORAGE_KEY]);
        return data[STORAGE_KEY] || { lastSyncAt: 0, lastBridgeScanAt: 0, importedExternalIds: [] };
    }

    async function saveSyncState(state) {
        const trimmed = {
            ...state,
            importedExternalIds: (state.importedExternalIds || []).slice(-500),
        };
        await chrome.storage.local.set({ [STORAGE_KEY]: trimmed });
    }

    async function tryAcquireLock() {
        const now = Date.now();
        const { [LOCK_KEY]: lock } = await chrome.storage.local.get(LOCK_KEY);
        if (lock?.expiresAt > now) {
            return false;
        }
        await chrome.storage.local.set({
            [LOCK_KEY]: {
                holder: chrome.runtime?.id || 'page',
                acquiredAt: now,
                expiresAt: now + LOCK_TTL_MS,
            },
        });
        return true;
    }

    async function releaseLock() {
        await chrome.storage.local.remove(LOCK_KEY);
    }

    function shouldRunScan(state, forceScan) {
        if (forceScan) return true;
        const last = state.lastBridgeScanAt || 0;
        return Date.now() - last >= SCAN_INTERVAL_MS;
    }

    async function bridgeFetch(path, options = {}) {
        const res = await fetch(`${BRIDGE_URL}${path}`, {
            ...options,
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Bridge ${res.status}`);
        }
        return res.json();
    }

    function isBridgeUnavailableError(error) {
        return error instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(error?.message || '');
    }

    function genPostId() {
        return 'post_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    }

    function wordCount(text) {
        if (!text) return 0;
        const clean = text.replace(/[#*>`\-\[\]()!_~]/g, '').trim();
        const cn = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
        const en = clean.replace(/[\u4e00-\u9fa5]/g, '').split(/\s+/).filter(Boolean).length;
        return cn + en;
    }

    function buildPostFromHermesItem(item) {
        return {
            id: genPostId(),
            title: item.title,
            content: item.content,
            category: item.category,
            tags: item.tags || [],
            createdAt: item.createdAt || Date.now(),
            updatedAt: Date.now(),
            wordCount: wordCount(item.content),
            pinned: false,
            source: {
                type: 'hermes-cron',
                externalId: item.externalId,
                jobId: item.jobId,
                jobName: item.jobName,
                runAt: item.runAt,
                outputPath: item.outputPath,
            },
        };
    }

    async function applyImports(items, options = {}) {
        const { source = 'pending' } = options;
        if (!items?.length) {
            return { created: 0, skipped: 0, acked: 0, source };
        }

        const state = await loadSyncState();
        const inBlog = await getBlogExternalIds();
        const ackIds = [];
        const toCreate = [];
        let skipped = 0;

        for (const item of items) {
            if (inBlog.has(item.externalId)) {
                skipped++;
                if (item.status === 'pending' || source === 'pending') {
                    ackIds.push(item.id);
                }
                logSync('skip 已在写作空间', {
                    externalId: item.externalId,
                    title: (item.title || '').slice(0, 40),
                });
                continue;
            }
            toCreate.push(item);
            inBlog.add(item.externalId);
        }

        const blog = getBlogManager();
        let created = 0;

        if (toCreate.length) {
            const posts = toCreate.map(buildPostFromHermesItem);
            logSync(`准备写入 ${posts.length} 篇`, {
                source,
                sample: posts.slice(0, 3).map(p => p.source?.externalId),
            });

            if (blog?.importHermesPostsBatch) {
                created = await blog.importHermesPostsBatch(posts);
            } else if (blog?._posts) {
                const existingExtIds = new Set(
                    blog._posts.map(p => p.source?.externalId).filter(Boolean)
                );
                for (const post of posts) {
                    const extId = post.source?.externalId;
                    if (extId && existingExtIds.has(extId)) continue;
                    blog._posts.unshift(post);
                    if (extId) existingExtIds.add(extId);
                    created++;
                }
                if (created > 0 && blog._savePosts) await blog._savePosts();
            } else {
                const data = await chrome.storage.local.get(['blogPosts']);
                const list = Array.isArray(data.blogPosts) ? data.blogPosts : [];
                const existingExtIds = new Set(
                    list.map(p => p.source?.externalId).filter(Boolean)
                );
                for (const post of posts) {
                    const extId = post.source?.externalId;
                    if (extId && existingExtIds.has(extId)) continue;
                    list.unshift(post);
                    if (extId) existingExtIds.add(extId);
                    created++;
                }
                await chrome.storage.local.set({ blogPosts: list });
            }

            for (const item of toCreate) {
                inBlog.add(item.externalId);
                if (item.status === 'pending' || source === 'pending') {
                    ackIds.push(item.id);
                }
            }
        }

        if (ackIds.length) {
            const ackResult = await bridgeFetch('/writing/hermes/ack', {
                method: 'POST',
                body: JSON.stringify({ ids: ackIds }),
            });
            logSync('ack bridge', { requested: ackIds.length, acked: ackResult.acked });
        }

        const known = new Set([...(state.importedExternalIds || []), ...inBlog]);
        state.importedExternalIds = [...known];
        state.lastSyncAt = Date.now();
        await saveSyncState(state);

        if (blog?._updateDockBadge) {
            blog._updateDockBadge();
        }

        logSync('applyImports 完成', { source, created, skipped, acked: ackIds.length });
        return { created, skipped, acked: ackIds.length, source };
    }

    async function fetchGapImports(blogExternalIds) {
        const knownExternalIds = [...blogExternalIds];
        const { items } = await bridgeFetch('/writing/hermes/gap', {
            method: 'POST',
            body: JSON.stringify({ knownExternalIds, limit: 100 }),
        });
        return items || [];
    }

    function isBadHermesTitle(title) {
        if (!title || typeof title !== 'string') return true;
        const t = title.trim();
        if (t === '标题' || t === '简明有力') return true;
        if (/^标题[：:]\s*$/.test(t)) return true;
        return false;
    }

    /** 从已入库正文解析真实标题（与 bridge hermes-import 规则一致） */
    function extractTitleFromHermesContent(content) {
        if (!content || typeof content !== 'string') return null;
        let body = content;
        const sep = content.indexOf('\n---\n');
        if (sep >= 0) body = content.slice(sep + 5).trim();

        const machine = body.match(/^HERMES_TITLE:\s*(.+)$/m);
        if (machine?.[1]) {
            const t = machine[1].trim();
            if (t && t !== '简明有力') return t.slice(0, 120);
        }

        const afterLabel = body.match(/📜\s*\*\*标题\*\*[：:]\s*(.+)/);
        if (afterLabel?.[1]) {
            const t = afterLabel[1].trim().replace(/^\*\*|\*\*$/g, '').split('\n')[0].trim();
            if (t && t !== '简明有力') return t.slice(0, 120);
        }

        const labelInside = body.match(/📜\s*\*\*标题[：:]\s*([^*]+)\*\*/);
        if (labelInside?.[1]) {
            const t = labelInside[1].trim();
            if (t && t !== '简明有力') return t.slice(0, 120);
        }

        for (const m of body.matchAll(/📜\s*\*\*([^*]+)\*\*/g)) {
            const t = m[1].trim();
            if (!t || t === '标题' || t === '简明有力') continue;
            if (/^标题[：:]/.test(t)) {
                const rest = t.replace(/^标题[：:]\s*/, '').trim();
                if (rest && rest !== '简明有力') return rest.slice(0, 120);
                continue;
            }
            return t.slice(0, 120);
        }

        const h1 = body.match(/^#\s+(.+)$/m);
        if (h1?.[1]) return h1[1].trim().slice(0, 120);

        return null;
    }

    function resolveFixedTitle(post, byExt) {
        const ext = post.source?.externalId;
        if (ext && byExt[ext]) return byExt[ext];

        const fromHermes = post.source?.type === 'hermes-cron'
            || (post.tags || []).includes('hermes')
            || (post.content || '').includes('Hermes Cron');

        if (!fromHermes && !isBadHermesTitle(post.title)) return null;
        if (!isBadHermesTitle(post.title) && !fromHermes) return null;

        if (isBadHermesTitle(post.title) || /^标题[：:]/.test((post.title || '').trim())) {
            return extractTitleFromHermesContent(post.content);
        }
        return null;
    }

    function applyTitleFixes(posts, byExt) {
        let updated = 0;
        for (const post of posts) {
            const next = resolveFixedTitle(post, byExt);
            if (!next || next === post.title || isBadHermesTitle(next)) continue;
            post.title = next;
            post.updatedAt = Date.now();
            updated++;
        }
        return updated;
    }

    async function repairTitlesInBlog() {
        try {
            await bridgeFetch('/writing/hermes/repair-titles', {
                method: 'POST',
                body: JSON.stringify({}),
            }).catch(() => {});

            const { items } = await bridgeFetch('/writing/hermes/title-map');
            const byExt = Object.fromEntries((items || []).map(i => [i.externalId, i.title]));

            const blog = getBlogManager();
            let updated = 0;

            if (blog?._posts) {
                updated = applyTitleFixes(blog._posts, byExt);
                if (updated && blog._savePosts) await blog._savePosts();
                if (updated && blog._renderContent && blog._drawerOpen) {
                    if (blog._currentView === 'list') blog._renderContent();
                }
            } else {
                const data = await chrome.storage.local.get(['blogPosts']);
                const posts = data.blogPosts || [];
                updated = applyTitleFixes(posts, byExt);
                if (updated) await chrome.storage.local.set({ blogPosts: posts });
            }

            return { ok: true, updated, mapped: (items || []).length };
        } catch (err) {
            console.warn('[HermesSync] repairTitles', err.message);
            return { ok: false, error: err.message };
        }
    }

    async function syncFromBridge(options = {}) {
        const { scan = false, forceScan = false, showToast = false } = options;
        const lockAcquired = await tryAcquireLock();
        if (!lockAcquired) {
            logSync('跳过：其他实例正在同步（storage 锁）');
            return { ok: true, locked: true, created: 0, skipped: 0 };
        }

        try {
            const dedupeBefore = await dedupeHermesPosts();
            if (dedupeBefore.removed > 0) {
                logSync('同步前已去重', { removed: dedupeBefore.removed });
            }

            const state = await loadSyncState();
            const runScan = scan && shouldRunScan(state, forceScan);

            if (runScan) {
                const scanResult = await bridgeFetch('/writing/hermes/scan', {
                    method: 'POST',
                    body: JSON.stringify({ force: !!forceScan }),
                });
                if (scanResult.checked > 0) {
                    console.log(
                        '[HermesSync] scan:',
                        `checked=${scanResult.checked}`,
                        `parsed=${scanResult.scanned}`,
                        `imported=${scanResult.imported}`,
                        `skipMtime=${scanResult.skippedByMtime ?? 0}`,
                        `skipDup=${scanResult.skippedByDuplicate ?? 0}`,
                        scanResult.incremental ? '(incremental)' : '(full)',
                    );
                }
                state.lastBridgeScanAt = Date.now();
                await saveSyncState(state);
            }

            const blogExternalIds = await getBlogExternalIds();
            logSync('写作空间已有 Hermes 外链', { count: blogExternalIds.size });

            const { items: pendingItems } = await bridgeFetch('/writing/hermes/pending?limit=100');
            logSync('bridge pending', { count: pendingItems?.length || 0 });

            const pendingResult = await applyImports(pendingItems || [], { source: 'pending' });

            // pending 写入后必须刷新已知 externalId，否则 gap 会把刚导入的再拉一遍（重复根因）
            const blogExternalIdsAfterPending = await getBlogExternalIds();
            const gapItems = await fetchGapImports(blogExternalIdsAfterPending);
            logSync('bridge gap（本地缺失）', {
                count: gapItems.length,
                knownBefore: blogExternalIds.size,
                knownAfter: blogExternalIdsAfterPending.size,
            });

            const gapResult = await gapItems.length
                ? await applyImports(gapItems, { source: 'gap' })
                : { created: 0, skipped: 0, acked: 0, source: 'gap' };

            const dedupeAfter = await dedupeHermesPosts();
            const created = (pendingResult.created || 0) + (gapResult.created || 0);
            const skipped = (pendingResult.skipped || 0) + (gapResult.skipped || 0);
            const repair = await repairTitlesInBlog();

            const blog = getBlogManager();
            if (showToast && blog?._showToast) {
                if (dedupeAfter.removed > 0 && created === 0 && !(repair.updated > 0)) {
                    blog._showToast(`已去除 ${dedupeAfter.removed} 篇重复 Hermes 文章`, 'success');
                } else if (dedupeAfter.removed > 0 && created > 0) {
                    blog._showToast(
                        `同步 ${created} 篇，并去除 ${dedupeAfter.removed} 篇重复`,
                        'success'
                    );
                } else if (created > 0) {
                    const parts = [];
                    if (pendingResult.created) parts.push(`待同步 ${pendingResult.created}`);
                    if (gapResult.created) parts.push(`回补 ${gapResult.created}`);
                    blog._showToast(
                        `已从 Hermes 同步 ${created} 篇（${parts.join('，')}）`,
                        'success'
                    );
                } else if (repair.updated > 0) {
                    blog._showToast(`已修复 ${repair.updated} 篇文章标题`, 'success');
                } else if ((pendingItems?.length || 0) + gapItems.length > 0) {
                    blog._showToast(
                        `Bridge 有 ${(pendingItems?.length || 0) + gapItems.length} 条记录，写作空间已齐全（跳过 ${skipped}）`,
                        'info'
                    );
                } else {
                    blog._showToast('暂无新的 Hermes 故事', 'info');
                }
            }

            return {
                ok: true,
                created,
                skipped,
                pending: pendingItems?.length || 0,
                gap: gapItems.length,
                pendingCreated: pendingResult.created,
                gapCreated: gapResult.created,
                scanned: runScan,
                titlesRepaired: repair.updated || 0,
                blogHermesCount: blogExternalIds.size,
                deduped: (dedupeBefore.removed || 0) + (dedupeAfter.removed || 0),
            };
        } catch (err) {
            if (isBridgeUnavailableError(err)) {
                // cursor-bridge 是可选本地服务；未启动时保留本地文章并静默等待下次同步。
                console.debug('[HermesSync] 本地 Bridge 未启动，已跳过自动同步');
            } else {
                console.warn('[HermesSync]', err.message);
            }
            const blog = getBlogManager();
            if (showToast && blog?._showToast) {
                blog._showToast(
                    'Hermes 同步失败：请确认 cursor-bridge 已启动 (19840)',
                    'warning'
                );
            }
            return { ok: false, error: err.message };
        } finally {
            await releaseLock();
        }
    }

    async function triggerBridgeScan() {
        return bridgeFetch('/writing/hermes/scan', { method: 'POST', body: JSON.stringify({}) });
    }

    async function getStats() {
        try {
            return await bridgeFetch('/writing/hermes/stats');
        } catch {
            return null;
        }
    }

    root.HermesWritingSync = {
        BRIDGE_URL,
        JOB_HINTS,
        SCAN_INTERVAL_MS,
        syncFromBridge,
        repairTitlesInBlog,
        triggerBridgeScan,
        getStats,
        applyImports,
        dedupeHermesPosts,
    };
})();
