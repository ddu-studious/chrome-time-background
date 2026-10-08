import { Innertube, YT, Log, Parser } from 'youtubei.js/web';

// Upstream diagnostics can contain entire responses. Only return our finite error codes.
Log.setLevel(Log.Level.NONE);
const ORIGIN = 'https://www.youtube.com';
const videoId = /^[A-Za-z0-9_-]{11}$/;
const text = value => String(value?.text ?? value ?? '').slice(0, 500);
const fail = code => Object.assign(new Error(code), { code });

export function projectVideos(feed) {
    const seen = new Set();
    return feed.videos.flatMap(video => {
        const id = video.video_id || video.content_id || video.id;
        if (!videoId.test(id || '') || seen.has(id)) return [];
        seen.add(id);
        const parts = video.metadata?.metadata?.metadata_rows?.flatMap(row => row.metadata_parts || []) || [];
        const publishedPart = parts.slice(1).find(part => /\d+\s*(?:秒|分钟|分鐘|小时|小時|天|日|周|週|个月|個月|月|年)\s*前|\b\d+\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s+ago\b|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/i.test(text(part.text)));
        const channelPart = parts.find(part => part.text?.endpoint?.payload?.browseId?.startsWith('UC'));
        const channelId = video.author?.id || channelPart?.text?.endpoint?.payload?.browseId || '';
        const badges = video.content_image?.overlays?.flatMap(overlay => overlay.badges || []) || [];
        return [{
            id, kind: 'video', title: text(video.title || video.metadata?.title) || 'YouTube 视频',
            channel: text(video.author?.name || channelPart?.text || parts[0]?.text),
            channelId: /^UC[\w-]+$/.test(channelId) ? channelId : '',
            channelUrl: /^UC[\w-]+$/.test(channelId) ? `${ORIGIN}/channel/${channelId}` : '',
            thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            durationLabel: text(video.length_text || badges.find(badge => /^\d[\d:]*$/.test(badge.text || ''))?.text),
            publishedLabel: text(video.published || publishedPart?.text),
            viewCountLabel: text(video.short_view_count || video.view_count),
            source: 'youtube-home',
        }];
    });
}

// Runs in the YouTube document. Cookie and account identifiers never leave this function.
export async function readHomeFeed({ previous = null, expectedAccount = '' } = {}, env = {}) {
    const getConfig = env.getConfig || (key => globalThis.ytcfg?.get?.(key));
    const getCookie = env.getCookie || (() => document.cookie);
    const fetchImpl = env.fetch || globalThis.fetch.bind(globalThis);
    const cookie = getCookie();
    const sapisid = cookie.match(/(?:^|;\s*)SAPISID=([^;]+)/)?.[1];
    if (!getConfig('LOGGED_IN') || !sapisid) throw fail('home-login-required');
    const accountIndex = Number(getConfig('SESSION_INDEX') || 0);
    const delegated = getConfig('DELEGATED_SESSION_ID') || undefined;
    const accountKey = () => `${getConfig('SESSION_INDEX') || 0}:${getConfig('DELEGATED_SESSION_ID') || ''}:${getConfig('DATASYNC_ID') || ''}:${getCookie().match(/(?:^|;\s*)SAPISID=([^;]+)/)?.[1] || ''}`;
    const identity = accountKey();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
    const account = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (expectedAccount && account !== expectedAccount) throw fail('home-account-changed');
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), env.timeoutMs || 25000);
    let raw = null;
    let parseIssues = 0;
    Parser.setParserErrorHandler(() => { parseIssues++; });
    try {
        const yt = await Innertube.create({
            cookie, account_index: accountIndex, on_behalf_of_user: delegated,
            lang: getConfig('HL') || 'zh-CN', location: getConfig('GL') || 'US',
            retrieve_player: false, retrieve_innertube_config: false,
            enable_session_cache: false, fail_fast: true,
            fetch: async (input, init = {}) => {
                const request = new Request(input, init);
                const url = new URL(request.url);
                if (url.origin !== ORIGIN || !['/sw.js_data', '/youtubei/v1/browse'].includes(url.pathname)) throw fail('home-endpoint-blocked');
                const headers = new Headers(request.headers);
                // The same-origin browser request supplies these itself.
                for (const name of ['cookie', 'origin', 'referer', 'user-agent']) headers.delete(name);
                const response = await fetchImpl(request, { headers, credentials: 'include', redirect: 'error', signal: abort.signal });
                if (!response.ok) throw fail([401, 403].includes(response.status) ? 'home-login-required' : 'home-network-error');
                if (url.pathname === '/youtubei/v1/browse') {
                    const body = await response.clone().text();
                    if (body.length > 2_000_000) throw fail('home-response-too-large');
                    raw = JSON.parse(body);
                    if (raw.responseContext?.mainAppWebResponseContext?.loggedOut === true) throw fail('home-login-required');
                }
                return response;
            },
        });
        const feed = previous
            ? await new YT.HomeFeed(yt.actions, { data: previous }).getContinuation()
            : await yt.getHomeFeed();
        if (!getConfig('LOGGED_IN') || identity !== accountKey()) throw fail('home-account-changed');
        const items = projectVideos(feed);
        if (items.length > 100) throw fail('home-response-too-large');
        // Do not silently present a parser failure as an empty home page.
        if (!items.length && (feed.videos.length || parseIssues)) throw fail('home-format-changed');
        return { items, hasMore: feed.has_continuation, raw, account };
    } catch (error) {
        if (abort.signal.aborted) throw fail('home-timeout');
        throw fail(error.code?.startsWith('home-') ? error.code : 'home-fetch-failed');
    } finally {
        clearTimeout(timer);
    }
}
