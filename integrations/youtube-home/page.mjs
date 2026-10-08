import { readHomeFeed } from './feed.mjs';

globalThis.__timeKeeperYouTubeHome = async options => {
    if (location.origin !== 'https://www.youtube.com' || window !== window.top) return { ok: false, error: { code: 'home-wrong-page' } };
    try {
        return { ok: true, data: await readHomeFeed(options) };
    } catch (error) {
        return { ok: false, error: { code: error.code || 'home-fetch-failed' } };
    }
};
