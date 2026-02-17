/**
 * TinyURL 短链服务封装
 * 基于 TinyURL v3.0.0 API
 * Base URL: https://www.meczyc6.info/tinyurl
 */
class TinyUrlService {
    constructor() {
        this.baseUrl = 'https://www.meczyc6.info/tinyurl';
        this.apiBase = `${this.baseUrl}/api/v1`;
        this.cache = new Map();
        this.timeout = 8000;      // 单次请求超时 8s
        this.maxRetries = 2;      // 最多重试 2 次（共 3 次尝试）
        this.retryDelay = 1000;   // 首次重试间隔 1s，指数退避
    }

    /**
     * 带超时的 fetch
     */
    _fetchWithTimeout(url, opts, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        return fetch(url, { ...opts, signal: controller.signal })
            .finally(() => clearTimeout(timer));
    }

    /**
     * 带重试的请求
     * 仅对 5xx / 网络错误 / 超时 进行重试，4xx 不重试
     */
    async _fetchWithRetry(url, opts = {}) {
        let lastErr;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const resp = await this._fetchWithTimeout(url, opts, this.timeout);

                // 4xx 不重试，直接返回
                if (resp.status >= 400 && resp.status < 500) {
                    return resp;
                }
                // 5xx 才重试
                if (resp.ok || resp.status < 500) {
                    return resp;
                }

                lastErr = new Error(`HTTP ${resp.status}`);
                lastErr.status = resp.status;
                console.warn(`[TinyURL] 第 ${attempt + 1} 次请求返回 ${resp.status}，${attempt < this.maxRetries ? '将重试...' : '放弃'}`);
            } catch (err) {
                lastErr = err;
                const isTimeout = err.name === 'AbortError';
                console.warn(`[TinyURL] 第 ${attempt + 1} 次请求${isTimeout ? '超时' : '失败'}: ${err.message}，${attempt < this.maxRetries ? '将重试...' : '放弃'}`);
            }

            if (attempt < this.maxRetries) {
                const delay = this.retryDelay * Math.pow(2, attempt);
                await new Promise(r => setTimeout(r, delay));
            }
        }

        // 所有重试用完，抛出最后的错误
        throw lastErr;
    }

    /**
     * 创建短链
     * @param {string} originalUrl - 原始 URL
     * @param {Object} options - 可选参数
     * @param {string} options.groupTag - 分组标签
     * @returns {Promise<{shortUrl: string, shortCode: string} | null>}
     */
    async createShortUrl(originalUrl, options = {}) {
        if (this.cache.has(originalUrl)) {
            return this.cache.get(originalUrl);
        }

        try {
            const body = { original_url: originalUrl };
            if (options.groupTag) body.group_tag = options.groupTag;

            const response = await this._fetchWithRetry(`${this.apiBase}/urls`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                console.warn(`[TinyURL] 创建短链失败: ${response.status}`, errData.message || '');
                return null;
            }

            const result = await response.json();
            if (result.code === 0 && result.data) {
                const shortInfo = {
                    shortUrl: result.data.short_url,
                    shortCode: result.data.short_code
                };
                this.cache.set(originalUrl, shortInfo);
                return shortInfo;
            }

            console.warn('[TinyURL] 响应格式异常:', result);
            return null;
        } catch (err) {
            console.warn('[TinyURL] 短链创建最终失败:', err.message);
            return null;
        }
    }

    /**
     * 批量创建短链
     * @param {Array<{originalUrl: string, groupTag?: string}>} urls
     * @returns {Promise<Array>}
     */
    async batchCreateShortUrls(urls) {
        if (!urls || urls.length === 0) return [];

        try {
            const body = {
                urls: urls.map(u => ({
                    original_url: u.originalUrl,
                    ...(u.groupTag ? { group_tag: u.groupTag } : {})
                }))
            };

            const response = await this._fetchWithRetry(`${this.apiBase}/urls/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                console.warn('[TinyURL] 批量创建失败:', response.status);
                return [];
            }

            const result = await response.json();
            if (result.code === 0 && result.data?.results) {
                result.data.results.forEach(item => {
                    if (item.status === 'success') {
                        this.cache.set(item.original_url, {
                            shortUrl: item.short_url,
                            shortCode: item.short_code
                        });
                    }
                });
                return result.data.results;
            }
            return [];
        } catch (err) {
            console.warn('[TinyURL] 批量创建最终失败:', err.message);
            return [];
        }
    }

    /**
     * 获取链接跳转地址（优先短链）
     */
    getRedirectUrl(link) {
        return link.shortUrl || link.url;
    }

    /**
     * 获取展示用的短链标签
     */
    getShortLabel(link) {
        return link.shortCode || '';
    }

    /** 清理缓存 */
    clearCache() {
        this.cache.clear();
    }
}

// 全局单例
const tinyUrlService = new TinyUrlService();
