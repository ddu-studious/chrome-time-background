/**
 * CompletionCache — LRU 缓存，用于复用相似输入的补全结果
 *
 * 策略：
 * - 使用上下文指纹（标题 + 分类 + 光标前 200 字）作为缓存键
 * - 带 TTL 过期（默认 5 分钟）
 * - LRU 淘汰（默认最多 100 条）
 */

interface CacheEntry {
  value: string;
  createdAt: number;
}

export class CompletionCache {
  private cache = new Map<string, CacheEntry>();
  private maxSize: number;
  private ttlMs: number;
  private hits = 0;
  private misses = 0;

  constructor(opts: { maxSize?: number; ttlMs?: number } = {}) {
    this.maxSize = opts.maxSize || 100;
    this.ttlMs = opts.ttlMs || 5 * 60 * 1000;
  }

  get(key: string): string | null {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return null;
    }

    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.value;
  }

  set(key: string, value: string) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, { value, createdAt: Date.now() });
  }

  setTTL(ttlMs: number) {
    this.ttlMs = ttlMs;
  }

  clear() {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  stats() {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total * 100).toFixed(1) + '%' : '0%',
    };
  }
}
