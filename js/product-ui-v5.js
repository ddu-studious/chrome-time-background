/**
 * Product UI v5 shared state and interaction primitives.
 *
 * This module deliberately owns view state only. Business modules remain the
 * source of truth for tasks, schedules and music playback.
 */
(function exposeProductUIV5(global) {
  'use strict';

  const shellPages = new Set(['home', 'today', 'personalize', 'focus', 'offline']);
  const musicPages = new Set([
    'now-playing', 'queue', 'playlist-library', 'playlist-detail',
    'lyrics-immersive', 'search', 'discover-fm', 'artist-album',
    'connection-error', 'more-sleep-timer'
  ]);
  const musicPageAliases = Object.freeze({
    playlists: 'playlist-library',
    lyrics: 'lyrics-immersive',
    discover: 'discover-fm',
    artist: 'artist-album',
    error: 'connection-error',
    more: 'more-sleep-timer',
  });
  const subscribers = new Set();
  let playerReceived = false;
  const state = {
    shellPage: 'home',
    musicPage: 'now-playing',
    activePageKey: 'shell/home',
    player: {
      isPlaying: false,
      title: '',
      artist: '',
      cover: '',
      currentTime: 0,
      duration: 0,
      volume: 1,
      playMode: 'sequence',
      queueLength: 0,
    },
  };

  function snapshot() {
    return {
      shellPage: state.shellPage,
      musicPage: state.musicPage,
      activePageKey: state.activePageKey,
      player: { ...state.player },
    };
  }

  function notify(reason) {
    const next = snapshot();
    subscribers.forEach(listener => {
      try { listener(next, reason); } catch (error) { console.error('[ProductUIV5] subscriber failed', error); }
    });
    document.dispatchEvent(new CustomEvent('product-ui-v5:state', { detail: { state: next, reason } }));
  }

  function setShellPage(page) {
    if (!shellPages.has(page)) return;
    const pageKey = `shell/${page === 'today' ? 'today-overview' : page}`;
    if (state.shellPage === page && state.activePageKey === pageKey) return pageKey;
    state.shellPage = page;
    state.activePageKey = pageKey;
    document.body.dataset.shellPage = page;
    document.body.dataset.productPage = state.activePageKey;
    notify('shell-page');
  }

  function setMusicPage(page) {
    const canonical = musicPageAliases[page] || page;
    if (!musicPages.has(canonical)) return null;
    if (state.musicPage === canonical && state.activePageKey === `music/${canonical}`) return canonical;
    state.musicPage = canonical;
    state.activePageKey = `music/${canonical}`;
    document.body.dataset.productPage = state.activePageKey;
    notify('music-page');
    return canonical;
  }

  function normalizeMusicPage(page) {
    const canonical = musicPageAliases[page] || page;
    return musicPages.has(canonical) ? canonical : null;
  }

  function setBusinessPage(businessId, pageId) {
    const key = `${businessId}/${pageId}`;
    const registry = global.ProductPagesV5;
    if (registry?.get && !registry.get(key)) return null;
    if (!registry?.get && !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(key)) return null;
    if (state.activePageKey === key) return key;
    state.activePageKey = key;
    document.body.dataset.productPage = key;
    notify('business-page');
    return key;
  }

  function updatePlayer(patch) {
    if (!patch || typeof patch !== 'object') return;
    const firstUpdate = !playerReceived;
    playerReceived = true;
    const next = { ...state.player, ...patch };
    const changed = Object.keys(next).some(key => next[key] !== state.player[key]);
    if (!changed && !firstUpdate) return;
    state.player = next;
    notify('player');
  }

  // 缓存仅供展示最近歌曲，不能证明音频仍在播放。
  function getDisplayPlayer(cached) {
    if (playerReceived) return { ...state.player };
    const age = Date.now() - (cached?.savedAt || 0);
    return cached?.title && age >= 0 && age < 30 * 60 * 1000
      ? { ...cached, isPlaying: false } : { ...state.player };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    subscribers.add(listener);
    listener(snapshot(), 'subscribe');
    return () => subscribers.delete(listener);
  }

  function formatDuration(seconds) {
    const safe = Number.isFinite(Number(seconds)) ? Math.max(0, Number(seconds)) : 0;
    const minutes = Math.floor(safe / 60);
    return `${minutes}:${String(Math.floor(safe % 60)).padStart(2, '0')}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  document.body.dataset.shellPage = state.shellPage;
  document.body.dataset.productPage = state.activePageKey;

  global.ProductUIV5 = Object.freeze({
    getState: snapshot,
    setShellPage,
    setMusicPage,
    normalizeMusicPage,
    setBusinessPage,
    updatePlayer,
    getDisplayPlayer,
    subscribe,
    formatDuration,
    escapeHtml,
    shellPages: Object.freeze([...shellPages]),
    musicPages: Object.freeze([...musicPages]),
  });
})(window);
