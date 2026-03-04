/**
 * 书签智能检索系统 (Bookmark RAG)
 * Phase 1: 书签目录管理、本地 BM25 搜索、AI 配置
 * Phase 2: Embedding 生成、向量搜索、混合搜索、IndexedDB 持久化、Spotlight
 */

class BookmarkRAG {
    static DB_NAME = 'BookmarkRAGIndex';
    static DB_VERSION = 1;
    static STORE_VECTORS = 'vectors';
    static STORE_QUERY_CACHE = 'queryCache';
    static BATCH_SIZE = 25;
    static BATCH_DELAY_MS = 300;

    constructor() {
        this.bookmarks = [];
        this.settings = null;
        this.isProcessing = false;
        this.initialized = false;
        this._db = null;
        this._vectorMap = new Map();

        this.AI_PROVIDERS = {
            deepseek: {
                name: 'DeepSeek',
                baseUrl: 'https://api.deepseek.com/v1',
                defaultModel: 'deepseek-chat',
                embeddingModel: 'deepseek-embedding',
                dimension: 384,
                pricing: '约 ¥0.007/万次',
                desc: '国内友好、成本最低',
                keyUrl: 'https://platform.deepseek.com/api_keys'
            },
            openai: {
                name: 'OpenAI',
                baseUrl: 'https://api.openai.com/v1',
                defaultModel: 'gpt-4o-mini',
                embeddingModel: 'text-embedding-3-small',
                dimension: 384,
                pricing: '约 ¥0.015/万次',
                desc: '最稳定、全球可用',
                keyUrl: 'https://platform.openai.com/api-keys'
            },
            gemini: {
                name: 'Google Gemini',
                baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
                defaultModel: 'gemini-2.0-flash',
                embeddingModel: 'text-embedding-004',
                dimension: 384,
                pricing: '免费额度充足',
                desc: '免费额度大、Google 生态',
                keyUrl: 'https://aistudio.google.com/apikey'
            },
            custom: {
                name: '自定义（OpenAI 兼容）',
                baseUrl: '',
                defaultModel: '',
                embeddingModel: '',
                dimension: 384,
                pricing: '-',
                desc: '支持 Ollama 等本地模型',
                keyUrl: ''
            }
        };
    }

    async init() {
        if (this.initialized) return;
        this.settings = await this.loadSettings();
        if (this.settings.enabled && this.settings.folderIds.length > 0) {
            await this.syncBookmarks();
            await this._loadVectorsFromDB();
        }
        this.initialized = true;
    }

    // ========== 设置管理 ==========

    async loadSettings() {
        return new Promise(resolve => {
            chrome.storage.sync.get('bookmarkSettings', (result) => {
                resolve(result.bookmarkSettings || {
                    enabled: false,
                    folderIds: [],
                    folderNames: [],
                    dailyReviewLimit: 5,
                    aiProvider: '',
                    aiApiKey: '',
                    aiBaseUrl: '',
                    aiModel: '',
                    embeddingModel: '',
                    reviewTemplate: 'regular',
                    lastProcessTime: 0
                });
            });
        });
    }

    async saveSettings(settings) {
        this.settings = { ...this.settings, ...settings };
        return new Promise(resolve => {
            chrome.storage.sync.set({ bookmarkSettings: this.settings }, resolve);
        });
    }

    isConfigured() {
        return this.settings &&
            this.settings.enabled &&
            this.settings.aiProvider &&
            this.settings.aiApiKey &&
            this.settings.folderIds.length > 0;
    }

    // ========== 书签目录 ==========

    async requestBookmarkPermission() {
        return new Promise(resolve => {
            if (chrome.permissions) {
                chrome.permissions.request({ permissions: ['bookmarks'] }, resolve);
            } else {
                resolve(false);
            }
        });
    }

    async hasBookmarkPermission() {
        return new Promise(resolve => {
            if (chrome.permissions) {
                chrome.permissions.contains({ permissions: ['bookmarks'] }, resolve);
            } else {
                resolve(false);
            }
        });
    }

    async getBookmarkFolders() {
        if (!chrome.bookmarks) return [];
        const tree = await chrome.bookmarks.getTree();
        const folders = [];

        const traverse = (node, depth = 0, parentPath = '') => {
            if (!node.url) {
                const path = parentPath ? `${parentPath} / ${node.title || '根目录'}` : (node.title || '根目录');
                const childBookmarks = node.children?.filter(c => c.url).length || 0;
                const childFolders = node.children?.filter(c => !c.url).length || 0;
                if (node.id !== '0') {
                    folders.push({
                        id: node.id,
                        title: node.title || '根目录',
                        path,
                        depth,
                        childBookmarks,
                        childFolders,
                        totalBookmarks: this._countBookmarksRecursive(node)
                    });
                }
            }
            if (node.children) {
                node.children.forEach(child => traverse(child, depth + 1,
                    node.id === '0' ? '' : (parentPath ? `${parentPath} / ${node.title}` : (node.title || '根目录'))
                ));
            }
        };

        tree.forEach(root => traverse(root));
        return folders;
    }

    _countBookmarksRecursive(node) {
        let count = 0;
        if (node.url) count = 1;
        if (node.children) {
            node.children.forEach(child => {
                count += this._countBookmarksRecursive(child);
            });
        }
        return count;
    }

    async getBookmarksInFolders(folderIds) {
        if (!chrome.bookmarks) return [];
        const all = [];

        for (const folderId of folderIds) {
            try {
                const subtree = await chrome.bookmarks.getSubTree(folderId);
                const collect = (node) => {
                    if (node.url) {
                        all.push({
                            id: node.id,
                            title: node.title,
                            url: node.url,
                            domain: this._extractDomain(node.url),
                            dateAdded: node.dateAdded,
                            parentId: node.parentId
                        });
                    }
                    if (node.children) node.children.forEach(collect);
                };
                subtree.forEach(collect);
            } catch (e) {
                console.warn(`[BookmarkRAG] Failed to read folder ${folderId}:`, e);
            }
        }

        return all;
    }

    _extractDomain(url) {
        try {
            return new URL(url).hostname.replace('www.', '');
        } catch {
            return '';
        }
    }

    // ========== 书签缓存同步 ==========

    async syncBookmarks() {
        if (!this.settings || !this.settings.folderIds.length) return;

        const raw = await this.getBookmarksInFolders(this.settings.folderIds);
        const cached = await this._loadBookmarkCache();

        const cacheMap = new Map(cached.map(b => [b.id, b]));
        this.bookmarks = raw.map(b => {
            const existing = cacheMap.get(b.id);
            return {
                ...b,
                aiTags: existing?.aiTags || [],
                embeddingDone: existing?.embeddingDone || false,
                srs: existing?.srs || null,
                status: existing?.status || 'active',
                summary: existing?.summary || '',
                contentTags: existing?.contentTags || [],
                contentExtractedAt: existing?.contentExtractedAt || 0,
                contentLength: existing?.contentLength || 0,
                pageDescription: existing?.pageDescription || ''
            };
        });

        await this._saveBookmarkCache(this.bookmarks);
    }

    async _loadBookmarkCache() {
        return new Promise(resolve => {
            chrome.storage.local.get('bookmarkCache', (result) => {
                resolve(result.bookmarkCache?.items || []);
            });
        });
    }

    async _saveBookmarkCache(items) {
        return new Promise(resolve => {
            chrome.storage.local.set({
                bookmarkCache: {
                    version: 1,
                    lastSyncTime: Date.now(),
                    items
                }
            }, resolve);
        });
    }

    // ========== 本地搜索 (BM25 关键词) ==========

    search(query) {
        if (!query || !query.trim()) return this.bookmarks.filter(b => b.status === 'active');

        const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
        const results = [];

        for (const bm of this.bookmarks) {
            if (bm.status !== 'active') continue;

            const summaryText = (bm.summary || '').toLowerCase();
            const contentTagsText = (bm.contentTags || []).join(' ').toLowerCase();
            const descText = (bm.pageDescription || '').toLowerCase();
            const searchText = `${bm.title} ${bm.domain} ${(bm.aiTags || []).join(' ')} ${summaryText} ${contentTagsText} ${descText}`.toLowerCase();
            let score = 0;
            let matched = false;

            for (const term of terms) {
                if (searchText.includes(term)) {
                    matched = true;
                    if (bm.title.toLowerCase().includes(term)) score += 10;
                    if (summaryText.includes(term)) score += 6;
                    if (bm.domain.toLowerCase().includes(term)) score += 5;
                    if ((bm.contentTags || []).some(t => t.toLowerCase().includes(term))) score += 4;
                    if ((bm.aiTags || []).some(t => t.toLowerCase().includes(term))) score += 3;
                    if (descText.includes(term)) score += 2;
                } else {
                    score -= 5;
                }
            }

            if (matched && score > 0) {
                results.push({ ...bm, _score: score, _matchType: 'keyword' });
            }
        }

        return results.sort((a, b) => b._score - a._score);
    }

    // ========== AI 服务验证 ==========

    async verifyApiKey(provider, apiKey, baseUrl = '') {
        const config = this.AI_PROVIDERS[provider];
        if (!config) return { ok: false, error: '未知的 AI 服务商' };

        const url = baseUrl || config.baseUrl;
        if (!url || !apiKey) return { ok: false, error: '请填写 API 地址和密钥' };

        try {
            const response = await fetch(`${url}/models`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (response.ok) return { ok: true };
            if (response.status === 401) return { ok: false, error: 'API Key 无效' };
            return { ok: false, error: `服务返回 ${response.status}` };
        } catch (e) {
            return { ok: false, error: `连接失败: ${e.message}` };
        }
    }

    // ========== 书签变化监听 ==========

    startWatching() {
        if (!chrome.bookmarks) return;

        chrome.bookmarks.onCreated.addListener((id, bookmark) => {
            if (this._isInWatchedFolder(bookmark.parentId)) {
                const newBm = {
                    id: bookmark.id,
                    title: bookmark.title,
                    url: bookmark.url,
                    domain: this._extractDomain(bookmark.url),
                    dateAdded: bookmark.dateAdded,
                    parentId: bookmark.parentId,
                    aiTags: [],
                    embeddingDone: false,
                    srs: null,
                    status: 'active'
                };
                this.bookmarks.push(newBm);
                this._saveBookmarkCache(this.bookmarks);
                if (this.isConfigured()) this.processNewBookmark(newBm);
            }
        });

        chrome.bookmarks.onRemoved.addListener((id) => {
            const idx = this.bookmarks.findIndex(b => b.id === id);
            if (idx !== -1) {
                this.bookmarks.splice(idx, 1);
                this._saveBookmarkCache(this.bookmarks);
                this._deleteVectorFromDB(id);
            }
        });

        chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
            const bm = this.bookmarks.find(b => b.id === id);
            if (bm) {
                let needReEmbed = false;
                if (changeInfo.title) { bm.title = changeInfo.title; needReEmbed = true; }
                if (changeInfo.url) {
                    bm.url = changeInfo.url;
                    bm.domain = this._extractDomain(changeInfo.url);
                    needReEmbed = true;
                }
                if (needReEmbed) {
                    bm.embeddingDone = false;
                    this._deleteVectorFromDB(id);
                    if (this.isConfigured()) this.processNewBookmark(bm);
                }
                this._saveBookmarkCache(this.bookmarks);
            }
        });

        chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
            const isNowWatched = this._isInWatchedFolder(moveInfo.parentId);
            const wasWatched = this.bookmarks.some(b => b.id === id);

            if (isNowWatched && !wasWatched) {
                this.syncBookmarks();
            } else if (!isNowWatched && wasWatched) {
                const idx = this.bookmarks.findIndex(b => b.id === id);
                if (idx !== -1) this.bookmarks.splice(idx, 1);
                this._saveBookmarkCache(this.bookmarks);
            }
        });
    }

    _isInWatchedFolder(parentId) {
        if (!this.settings?.folderIds) return false;
        return this.settings.folderIds.includes(parentId);
    }

    // ========== IndexedDB 向量持久化 ==========

    async _openDB() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(BookmarkRAG.DB_NAME, BookmarkRAG.DB_VERSION);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(BookmarkRAG.STORE_VECTORS)) {
                    db.createObjectStore(BookmarkRAG.STORE_VECTORS, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(BookmarkRAG.STORE_QUERY_CACHE)) {
                    db.createObjectStore(BookmarkRAG.STORE_QUERY_CACHE, { keyPath: 'query' });
                }
            };
            req.onsuccess = (e) => {
                this._db = e.target.result;
                resolve(this._db);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async _loadVectorsFromDB() {
        try {
            const db = await this._openDB();
            const tx = db.transaction(BookmarkRAG.STORE_VECTORS, 'readonly');
            const store = tx.objectStore(BookmarkRAG.STORE_VECTORS);
            const all = await new Promise((resolve, reject) => {
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            this._vectorMap.clear();
            for (const item of all) {
                this._vectorMap.set(item.id, new Float32Array(item.embedding));
            }
            console.log(`[BookmarkRAG] Loaded ${this._vectorMap.size} vectors from IndexedDB`);
        } catch (e) {
            console.warn('[BookmarkRAG] Failed to load vectors from IndexedDB:', e);
        }
    }

    async _saveVectorsToDB(vectors) {
        try {
            const db = await this._openDB();
            const tx = db.transaction(BookmarkRAG.STORE_VECTORS, 'readwrite');
            const store = tx.objectStore(BookmarkRAG.STORE_VECTORS);
            for (const { id, embedding, text } of vectors) {
                store.put({ id, embedding: Array.from(embedding), text, ts: Date.now() });
                this._vectorMap.set(id, embedding);
            }
            await new Promise((resolve, reject) => {
                tx.oncomplete = resolve;
                tx.onerror = () => reject(tx.error);
            });
        } catch (e) {
            console.warn('[BookmarkRAG] Failed to save vectors:', e);
        }
    }

    async _deleteVectorFromDB(id) {
        try {
            const db = await this._openDB();
            const tx = db.transaction(BookmarkRAG.STORE_VECTORS, 'readwrite');
            tx.objectStore(BookmarkRAG.STORE_VECTORS).delete(id);
            this._vectorMap.delete(id);
        } catch (e) {
            console.warn('[BookmarkRAG] Failed to delete vector:', e);
        }
    }

    async _getCachedQueryVector(query) {
        try {
            const db = await this._openDB();
            const tx = db.transaction(BookmarkRAG.STORE_QUERY_CACHE, 'readonly');
            const store = tx.objectStore(BookmarkRAG.STORE_QUERY_CACHE);
            const result = await new Promise((resolve, reject) => {
                const req = store.get(query.trim().toLowerCase());
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
            if (result && Date.now() - result.ts < 24 * 60 * 60 * 1000) {
                return new Float32Array(result.embedding);
            }
            return null;
        } catch {
            return null;
        }
    }

    async _cacheQueryVector(query, embedding) {
        try {
            const db = await this._openDB();
            const tx = db.transaction(BookmarkRAG.STORE_QUERY_CACHE, 'readwrite');
            tx.objectStore(BookmarkRAG.STORE_QUERY_CACHE).put({
                query: query.trim().toLowerCase(),
                embedding: Array.from(embedding),
                ts: Date.now()
            });
        } catch (e) {
            console.warn('[BookmarkRAG] Failed to cache query vector:', e);
        }
    }

    // ========== Embedding API ==========

    _buildEmbeddingText(bm) {
        const parts = [bm.title || ''];
        if (bm.domain) parts.push(bm.domain);
        if (bm.summary) parts.push(bm.summary);
        if (bm.contentTags?.length) parts.push(bm.contentTags.join(' '));
        if (bm.aiTags?.length) parts.push(bm.aiTags.join(' '));
        return parts.join(' ').trim();
    }

    async _callEmbeddingAPI(texts) {
        if (!this.settings?.aiApiKey) throw new Error('未配置 API Key');

        const provider = this.AI_PROVIDERS[this.settings.aiProvider];
        if (!provider) throw new Error('未知的 AI 服务商');

        const baseUrl = this.settings.aiBaseUrl || provider.baseUrl;
        const model = this.settings.embeddingModel || provider.embeddingModel;
        const dimension = provider.dimension || 384;

        const body = { model, input: texts };
        if (this.settings.aiProvider !== 'deepseek') {
            body.dimensions = dimension;
        }

        const resp = await fetch(`${baseUrl}/embeddings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.settings.aiApiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`Embedding API ${resp.status}: ${errText.slice(0, 200)}`);
        }

        const json = await resp.json();
        return json.data.map(d => {
            let vec = d.embedding;
            if (vec.length > dimension) vec = vec.slice(0, dimension);
            return new Float32Array(vec);
        });
    }

    async processBookmarks(onProgress) {
        if (this.isProcessing) return { processed: 0, failed: 0 };
        this.isProcessing = true;

        const unprocessed = this.bookmarks.filter(b =>
            b.status === 'active' && !b.embeddingDone
        );

        if (unprocessed.length === 0) {
            this.isProcessing = false;
            return { processed: 0, failed: 0, total: 0 };
        }

        let processed = 0;
        let failed = 0;
        const total = unprocessed.length;

        try {
            for (let i = 0; i < total; i += BookmarkRAG.BATCH_SIZE) {
                if (!this.isProcessing) break; // 支持取消

                const batch = unprocessed.slice(i, i + BookmarkRAG.BATCH_SIZE);
                const texts = batch.map(bm => this._buildEmbeddingText(bm));

                try {
                    const embeddings = await this._callEmbeddingAPI(texts);
                    const vectors = [];

                    for (let j = 0; j < batch.length; j++) {
                        const bm = batch[j];
                        bm.embeddingDone = true;
                        vectors.push({ id: bm.id, embedding: embeddings[j], text: texts[j] });
                    }

                    await this._saveVectorsToDB(vectors);
                    processed += batch.length;
                } catch (e) {
                    console.error(`[BookmarkRAG] Batch embedding failed:`, e);
                    failed += batch.length;
                }

                if (onProgress) {
                    onProgress({ processed, failed, total, percent: Math.round((processed + failed) / total * 100) });
                }

                if (i + BookmarkRAG.BATCH_SIZE < total) {
                    await new Promise(r => setTimeout(r, BookmarkRAG.BATCH_DELAY_MS));
                }
            }

            await this._saveBookmarkCache(this.bookmarks);
        } finally {
            this.isProcessing = false;
        }

        return { processed, failed, total };
    }

    cancelProcessing() {
        this.isProcessing = false;
    }

    async processNewBookmark(bookmark) {
        if (!this.settings?.aiApiKey || bookmark.embeddingDone) return;
        const text = this._buildEmbeddingText(bookmark);
        try {
            const [embedding] = await this._callEmbeddingAPI([text]);
            bookmark.embeddingDone = true;
            await this._saveVectorsToDB([{ id: bookmark.id, embedding, text }]);
            await this._saveBookmarkCache(this.bookmarks);
        } catch (e) {
            console.warn(`[BookmarkRAG] Incremental embedding failed for ${bookmark.id}:`, e);
        }
    }

    // ========== 向量搜索 ==========

    _cosineSimilarity(a, b) {
        if (a.length !== b.length) return 0;
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            magA += a[i] * a[i];
            magB += b[i] * b[i];
        }
        const denom = Math.sqrt(magA) * Math.sqrt(magB);
        return denom === 0 ? 0 : dot / denom;
    }

    vectorSearch(queryEmbedding, topK = 20) {
        const results = [];
        for (const bm of this.bookmarks) {
            if (bm.status !== 'active') continue;
            const vec = this._vectorMap.get(bm.id);
            if (!vec) continue;
            const score = this._cosineSimilarity(queryEmbedding, vec);
            if (score > 0.3) {
                results.push({ ...bm, _vectorScore: score, _matchType: 'semantic' });
            }
        }
        return results.sort((a, b) => b._vectorScore - a._vectorScore).slice(0, topK);
    }

    // ========== 混合搜索 (RRF 融合) ==========

    async hybridSearch(query, topK = 20) {
        if (!query?.trim()) return this.bookmarks.filter(b => b.status === 'active').slice(0, topK);

        const keywordResults = this.search(query);

        const hasEmbeddings = this._vectorMap.size > 0;
        let semanticResults = [];

        if (hasEmbeddings && this.settings?.aiApiKey) {
            try {
                let queryVec = await this._getCachedQueryVector(query);
                if (!queryVec) {
                    const [vec] = await this._callEmbeddingAPI([query.trim()]);
                    queryVec = vec;
                    await this._cacheQueryVector(query, vec);
                }
                semanticResults = this.vectorSearch(queryVec, topK * 2);
            } catch (e) {
                console.warn('[BookmarkRAG] Semantic search failed, falling back to keyword-only:', e);
            }
        }

        if (semanticResults.length === 0) {
            return keywordResults.slice(0, topK);
        }

        // RRF (Reciprocal Rank Fusion)
        const k = 60;
        const scoreMap = new Map();

        keywordResults.forEach((item, rank) => {
            const existing = scoreMap.get(item.id) || { item, rrfScore: 0, types: [] };
            existing.rrfScore += 1 / (k + rank + 1);
            existing.types.push('keyword');
            scoreMap.set(item.id, existing);
        });

        semanticResults.forEach((item, rank) => {
            const existing = scoreMap.get(item.id) || { item, rrfScore: 0, types: [] };
            existing.rrfScore += 1 / (k + rank + 1);
            if (!existing.types.includes('semantic')) existing.types.push('semantic');
            existing.item._vectorScore = existing.item._vectorScore || item._vectorScore;
            scoreMap.set(item.id, existing);
        });

        return Array.from(scoreMap.values())
            .sort((a, b) => b.rrfScore - a.rrfScore)
            .slice(0, topK)
            .map(entry => ({
                ...entry.item,
                _matchType: entry.types.length > 1 ? 'hybrid' : entry.types[0],
                _rrfScore: entry.rrfScore
            }));
    }

    // ========== 间隔复习 (SRS) ==========

    getTodayReview(limit) {
        const reviewLimit = limit || this.settings?.dailyReviewLimit || 5;
        return BookmarkSRS.getTodayReviewQueue(this.bookmarks, reviewLimit);
    }

    getUnreviewed(limit = 5) {
        return BookmarkSRS.getUnreviewedBookmarks(this.bookmarks, limit);
    }

    async reviewBookmark(bookmarkId, quality) {
        const bm = this.bookmarks.find(b => b.id === bookmarkId);
        if (!bm) return null;

        const templateId = bm.srs?.template || this.settings?.reviewTemplate || 'regular';
        bm.srs = BookmarkSRS.schedule(bm.srs, quality, templateId);

        if (quality === BookmarkSRS.QUALITY.ARCHIVE) {
            bm.status = 'archived';
        }

        await this._saveBookmarkCache(this.bookmarks);
        return bm;
    }

    async enableReview(templateId = 'regular') {
        const count = BookmarkSRS.enableSRSForBookmarks(this.bookmarks, templateId);
        if (count > 0) {
            await this._saveBookmarkCache(this.bookmarks);
        }
        return count;
    }

    async changeBookmarkTemplate(bookmarkId, templateId) {
        const bm = this.bookmarks.find(b => b.id === bookmarkId);
        if (!bm) return;
        BookmarkSRS.changeTemplate(bm, templateId);
        await this._saveBookmarkCache(this.bookmarks);
    }

    getReviewStats() {
        return BookmarkSRS.getReviewStats(this.bookmarks);
    }

    // ========== LLM 重排序 (v2.2.0) ==========

    async _callChatAPI(prompt, options = {}) {
        if (!this.settings?.aiApiKey) throw new Error('未配置 API Key');

        const provider = this.AI_PROVIDERS[this.settings.aiProvider];
        if (!provider) throw new Error('未知的 AI 服务商');

        const baseUrl = this.settings.aiBaseUrl || provider.baseUrl;
        const model = this.settings.aiModel || provider.defaultModel;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), options.timeout || 15000);

        try {
            const resp = await fetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.settings.aiApiKey}`
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }],
                    temperature: options.temperature ?? 0.3,
                    max_tokens: options.maxTokens || 1000,
                    response_format: options.jsonMode ? { type: 'json_object' } : undefined
                }),
                signal: controller.signal
            });

            if (!resp.ok) {
                const errText = await resp.text().catch(() => '');
                throw new Error(`Chat API ${resp.status}: ${errText.slice(0, 200)}`);
            }

            const json = await resp.json();
            return json.choices?.[0]?.message?.content || '';
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async rerank(query, candidates, limit = 15) {
        if (!candidates?.length || candidates.length < 3) return candidates;

        const startTime = Date.now();
        const candidateList = candidates.slice(0, 30).map((c, i) => {
            let line = `${i + 1}. ${c.title} (${c.domain})`;
            if (c.summary) line += `\n   摘要: ${c.summary}`;
            return line;
        }).join('\n');

        const prompt = `你是一个搜索结果排序专家。用户搜索了"${query}"。

请根据搜索意图，从以下书签中选出最相关的结果，按相关度从高到低排序。

评判标准：
1. 与搜索意图的语义匹配度
2. 内容的权威性和实用性
3. 标题和摘要的信息密度

书签列表：
${candidateList}

请以 JSON 格式返回，只包含相关的书签（最多 ${limit} 条）：
{"results": [{"index": 序号, "score": 0到100的整数, "reason": "一句话理由"}]}`;

        try {
            const responseText = await this._callChatAPI(prompt, {
                timeout: 15000,
                jsonMode: true,
                maxTokens: 800
            });

            const parsed = this._parseRerankResponse(responseText);
            if (!parsed?.length) return candidates.slice(0, limit);

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

            return parsed
                .filter(r => r.index >= 1 && r.index <= candidates.length)
                .slice(0, limit)
                .map(r => ({
                    ...candidates[r.index - 1],
                    _rerankScore: r.score,
                    _rerankReason: r.reason,
                    _matchType: 'reranked'
                }))
                .map(item => ({ ...item, _rerankElapsed: elapsed }));
        } catch (e) {
            console.warn('[BookmarkRAG] Rerank failed:', e.message);
            throw e;
        }
    }

    _parseRerankResponse(text) {
        try {
            const json = JSON.parse(text);
            if (json.results && Array.isArray(json.results)) return json.results;
        } catch { /* fallthrough */ }

        const match = text.match(/\{[\s\S]*"results"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]).results;
            } catch { /* fallthrough */ }
        }

        const arrayMatch = text.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
            try {
                return JSON.parse(arrayMatch[0]);
            } catch { /* fallthrough */ }
        }

        return null;
    }

    // ========== 网页摘要抓取 (v2.2.0) ==========

    async extractAndSummarize(bookmark, onStatus) {
        if (!bookmark?.url) throw new Error('无效的书签');

        onStatus?.('extracting');

        let content;
        try {
            content = await this._extractWebContent(bookmark.url);
        } catch (e) {
            console.warn(`[BookmarkRAG] Content extraction failed for ${bookmark.url}:`, e);
            throw new Error(`无法抓取此页面: ${e.message}`);
        }

        if (!content?.bodyText || content.bodyText.length < 50) {
            throw new Error('页面内容过少，无法生成摘要');
        }

        onStatus?.('summarizing');

        const summaryData = await this._generateSummary(bookmark.title, content);

        bookmark.summary = summaryData.summary;
        bookmark.contentTags = summaryData.tags;
        bookmark.contentExtractedAt = Date.now();
        bookmark.contentLength = content.bodyText.length;
        bookmark.pageDescription = content.description || '';

        if (bookmark.embeddingDone) {
            onStatus?.('re-embedding');
            try {
                const text = this._buildEmbeddingText(bookmark);
                const [embedding] = await this._callEmbeddingAPI([text]);
                await this._saveVectorsToDB([{ id: bookmark.id, embedding, text }]);
            } catch (e) {
                console.warn('[BookmarkRAG] Re-embedding failed:', e);
            }
        }

        await this._saveBookmarkCache(this.bookmarks);
        return bookmark;
    }

    async _extractWebContent(url) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'extractWebContent', url },
                (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    if (response?.error) {
                        reject(new Error(response.error));
                        return;
                    }
                    resolve(response?.data);
                }
            );
        });
    }

    async _generateSummary(title, content) {
        const prompt = `请为以下网页内容生成摘要和关键词标签。

标题：${title}
描述：${content.description || '无'}
正文（节选）：${content.bodyText.substring(0, 2000)}

要求：
1. 摘要：50-100 字中文，概括页面核心内容
2. 关键词：5-10 个，涵盖主题、技术栈、领域、用途
3. 关键词使用小写英文或中文，多词用连字符

请以 JSON 格式返回：{"summary": "...", "tags": ["tag1", "tag2"]}`;

        const responseText = await this._callChatAPI(prompt, {
            timeout: 15000,
            jsonMode: true,
            maxTokens: 500
        });

        try {
            const parsed = JSON.parse(responseText);
            return {
                summary: parsed.summary || '',
                tags: Array.isArray(parsed.tags) ? parsed.tags : []
            };
        } catch {
            const summaryMatch = responseText.match(/"summary"\s*:\s*"([^"]+)"/);
            return {
                summary: summaryMatch?.[1] || '',
                tags: []
            };
        }
    }

    async batchExtractSummaries(onProgress) {
        const unextracted = this.bookmarks.filter(b =>
            b.status === 'active' && !b.contentExtractedAt
        );

        if (unextracted.length === 0) return { processed: 0, failed: 0, total: 0 };

        let processed = 0;
        let failed = 0;
        const total = unextracted.length;
        this._batchExtractCancelled = false;

        for (const bm of unextracted) {
            if (this._batchExtractCancelled) break;

            try {
                await this.extractAndSummarize(bm);
                processed++;
            } catch (e) {
                console.warn(`[BookmarkRAG] Extract failed for ${bm.url}:`, e.message);
                failed++;
            }

            onProgress?.({ processed, failed, total, percent: Math.round((processed + failed) / total * 100) });

            await new Promise(r => setTimeout(r, 1500));
        }

        return { processed, failed, total };
    }

    cancelBatchExtract() {
        this._batchExtractCancelled = true;
    }

    getSummaryStats() {
        const total = this.bookmarks.filter(b => b.status === 'active').length;
        const extracted = this.bookmarks.filter(b => b.contentExtractedAt).length;
        return { total, extracted, remaining: total - extracted };
    }

    // ========== 统计 ==========

    getStats() {
        const total = this.bookmarks.length;
        const active = this.bookmarks.filter(b => b.status === 'active').length;
        const embedded = this.bookmarks.filter(b => b.embeddingDone).length;
        const vectorCount = this._vectorMap.size;
        const domains = new Set(this.bookmarks.map(b => b.domain)).size;
        const reviewStats = this.getReviewStats();
        const summaryStats = this.getSummaryStats();

        return { total, active, embedded, vectorCount, domains, ...reviewStats, ...summaryStats };
    }
}

window.BookmarkRAG = BookmarkRAG;
