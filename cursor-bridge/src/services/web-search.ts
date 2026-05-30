/**
 * Web Search Tool Service
 *
 * A utility service providing web search capabilities to other AI modules
 * (writing assistant, agent pool, etc.). Not an independent search panel.
 *
 * Strategy:
 *   1. DuckDuckGo HTML scraping (free, no API key)
 *   2. DuckDuckGo Instant Answer API (for definitions/facts)
 *   3. Optional: Tavily/Serper if API key configured
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source?: string;
}

export interface SearchOptions {
  maxResults?: number;
  region?: string;
  timeLimit?: 'd' | 'w' | 'm' | 'y';
  provider?: 'duckduckgo' | 'tavily' | 'instant';
}

interface InstantAnswer {
  abstract: string;
  abstractUrl: string;
  definition: string;
  definitionUrl: string;
  answer: string;
  relatedTopics: Array<{ text: string; firstUrl: string }>;
}

const DEFAULT_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── DuckDuckGo HTML Search (primary, free) ───

async function searchDDGHtml(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
  const maxResults = opts.maxResults || 5;
  const params = new URLSearchParams({ q: query });
  if (opts.region) params.set('kl', opts.region);
  if (opts.timeLimit) params.set('df', opts.timeLimit);

  try {
    const res = await fetch(`https://html.duckduckgo.com/html/?${params}`, {
      headers: {
        'User-Agent': DEFAULT_UA,
        'Accept': 'text/html',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });

    if (!res.ok) return [];
    const html = await res.text();

    const results: SearchResult[] = [];
    const resultPattern = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let match;

    while ((match = resultPattern.exec(html)) !== null && results.length < maxResults) {
      const url = decodeURIComponent(match[1].replace(/.*uddg=/, '').replace(/&.*/, ''));
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      const snippet = match[3].replace(/<[^>]+>/g, '').trim();

      if (url && title) {
        results.push({ title, url, snippet, source: 'duckduckgo' });
      }
    }

    if (results.length === 0) {
      const simplePattern = /<a[^>]+class="result__a"[^>]*>(.*?)<\/a>/g;
      const snippetPattern = /<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
      const urlPattern = /href="\/\/duckduckgo\.com\/l\/\?uddg=([^&"]+)/g;

      const titles: string[] = [];
      const snippets: string[] = [];
      const urls: string[] = [];

      let m;
      while ((m = simplePattern.exec(html)) !== null) titles.push(m[1].replace(/<[^>]+>/g, ''));
      while ((m = snippetPattern.exec(html)) !== null) snippets.push(m[1].replace(/<[^>]+>/g, ''));
      while ((m = urlPattern.exec(html)) !== null) urls.push(decodeURIComponent(m[1]));

      for (let i = 0; i < Math.min(titles.length, maxResults); i++) {
        results.push({
          title: titles[i] || '',
          url: urls[i] || '',
          snippet: snippets[i] || '',
          source: 'duckduckgo',
        });
      }
    }

    return results;
  } catch (err: any) {
    console.warn('[web-search] DDG HTML search failed:', err.message);
    return [];
  }
}

// ─── DuckDuckGo Instant Answer API (facts/definitions) ───

async function searchDDGInstant(query: string): Promise<InstantAnswer | null> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      no_html: '1',
      skip_disambig: '1',
    });

    const res = await fetch(`https://api.duckduckgo.com/?${params}`, {
      headers: { 'User-Agent': DEFAULT_UA },
    });

    if (!res.ok) return null;
    const data = await res.json() as any;

    const topics = (data.RelatedTopics || [])
      .filter((t: any) => t.Text && t.FirstURL)
      .slice(0, 5)
      .map((t: any) => ({ text: t.Text, firstUrl: t.FirstURL }));

    return {
      abstract: data.AbstractText || '',
      abstractUrl: data.AbstractURL || '',
      definition: data.Definition || '',
      definitionUrl: data.DefinitionURL || '',
      answer: data.Answer || '',
      relatedTopics: topics,
    };
  } catch {
    return null;
  }
}

// ─── Tavily API (optional, if configured) ───

async function searchTavily(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: opts.maxResults || 5,
        search_depth: 'basic',
        include_answer: true,
      }),
    });

    if (!res.ok) return [];
    const data = await res.json() as any;

    return (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content || '',
      source: 'tavily',
    }));
  } catch {
    return [];
  }
}

// ─── Public API ───

export async function webSearch(query: string, opts: SearchOptions = {}): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const provider = opts.provider || (process.env.TAVILY_API_KEY ? 'tavily' : 'duckduckgo');

  switch (provider) {
    case 'tavily': {
      const results = await searchTavily(query, opts);
      if (results.length > 0) return results;
      return searchDDGHtml(query, opts);
    }
    case 'instant': {
      const instant = await searchDDGInstant(query);
      if (instant?.abstract || instant?.answer) {
        return [{
          title: instant.answer || 'Instant Answer',
          url: instant.abstractUrl || instant.definitionUrl || '',
          snippet: instant.abstract || instant.definition || instant.answer,
          source: 'instant',
        }];
      }
      return searchDDGHtml(query, opts);
    }
    default:
      return searchDDGHtml(query, opts);
  }
}

export async function getInstantAnswer(query: string): Promise<InstantAnswer | null> {
  return searchDDGInstant(query);
}

/**
 * Enrich a writing context with web search results.
 * Designed to be called from the writing service when context needs
 * external information (e.g., facts, definitions, current events).
 */
export async function enrichWithSearch(query: string, maxResults = 3): Promise<string> {
  const results = await webSearch(query, { maxResults });
  if (results.length === 0) return '';

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\n   ${r.snippet}\n   来源: ${r.url}`)
    .join('\n\n');
}

export function isSearchConfigured(): boolean {
  return true; // DDG is always available without API key
}

export function getSearchProviders(): string[] {
  const providers = ['duckduckgo', 'instant'];
  if (process.env.TAVILY_API_KEY) providers.push('tavily');
  return providers;
}
