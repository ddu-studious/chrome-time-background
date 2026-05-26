/**
 * Offscreen Document 音乐播放引擎 v3.12.0
 * 负责音频播放、MediaSession 集成
 * 通过 chrome.runtime 消息与 background/new tab 通信
 * v3.12.0: stop 命令清空元数据
 */

const player = document.getElementById('player');
let currentState = {
    isPlaying: false,
    title: '',
    artist: '',
    cover: '',
    currentTime: 0,
    duration: 0,
    volume: 1,
    songId: null,
};

player.addEventListener('timeupdate', () => {
    currentState.currentTime = player.currentTime;
    currentState.duration = player.duration || 0;
});

player.addEventListener('play', () => {
    currentState.isPlaying = true;
    broadcastState();
});

player.addEventListener('pause', () => {
    currentState.isPlaying = false;
    broadcastState();
});

player.addEventListener('ended', () => {
    currentState.isPlaying = false;
    chrome.runtime.sendMessage({ action: 'offscreen_track_ended' }).catch(() => {});
});

player.addEventListener('loadedmetadata', () => {
    currentState.duration = player.duration || 0;
    broadcastState();
});

player.addEventListener('error', () => {
    const code = player.error?.code || 0;
    const mediaErrMap = {
        1: 'MEDIA_ERR_ABORTED: 加载被中止',
        2: 'MEDIA_ERR_NETWORK: 网络错误',
        3: 'MEDIA_ERR_DECODE: 解码失败',
        4: 'MEDIA_ERR_SRC_NOT_SUPPORTED: 音频格式不支持或链接已失效',
    };
    const errMsg = mediaErrMap[code] || `未知播放错误 (code=${code})`;
    console.warn('[Offscreen] Audio error:', errMsg);
    chrome.runtime.sendMessage({
        action: 'offscreen_error',
        error: errMsg,
        code,
    }).catch(() => {});
});

function broadcastState() {
    chrome.runtime.sendMessage({
        action: 'offscreen_state_update',
        data: { ...currentState }
    }).catch(() => {});
}

function updateMediaSession() {
    if (!('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
        title: currentState.title || '未知歌曲',
        artist: currentState.artist || '',
        album: '中国风景时钟',
        artwork: currentState.cover ? [
            { src: currentState.cover, sizes: '200x200', type: 'image/jpeg' }
        ] : []
    });

    navigator.mediaSession.setActionHandler('play', () => {
        player.play();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
        player.pause();
    });
    navigator.mediaSession.setActionHandler('previoustrack', () => {
        chrome.runtime.sendMessage({ action: 'offscreen_media_action', command: 'prev' }).catch(() => {});
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
        chrome.runtime.sendMessage({ action: 'offscreen_media_action', command: 'next' }).catch(() => {});
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null && isFinite(details.seekTime)) {
            player.currentTime = details.seekTime;
        }
    });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.target !== 'offscreen') return false;

    switch (msg.command) {
        case 'play': {
            const { url, songId, title, artist, cover } = msg;
            if (url) {
                currentState.title = title || '';
                currentState.artist = artist || '';
                currentState.cover = cover || '';
                currentState.songId = songId || null;
                player.src = url;
                player.volume = currentState.volume;
                player.play().then(() => {
                    updateMediaSession();
                    broadcastState();
                }).catch((e) => {
                    console.warn('[Offscreen] play failed:', e);
                    chrome.runtime.sendMessage({
                        action: 'offscreen_error',
                        error: e.message || 'play() rejected',
                        code: 4,
                    }).catch(() => {});
                });
                sendResponse({ ok: true });
            }
            return true;
        }
        case 'resume':
            player.play().catch(() => {});
            sendResponse({ ok: true });
            break;
        case 'pause':
            player.pause();
            sendResponse({ ok: true });
            break;
        case 'togglePlay':
            if (player.paused) {
                if (!player.src || player.src === '' || player.src === location.href) {
                    sendResponse({ ok: false, error: 'no-src', songId: currentState.songId });
                    return true;
                }
                player.play().then(() => {
                    sendResponse({ ok: true });
                }).catch((e) => {
                    console.warn('[Offscreen] togglePlay resume failed:', e);
                    sendResponse({ ok: false, error: 'play-failed', songId: currentState.songId });
                });
                return true;
            } else {
                player.pause();
                sendResponse({ ok: true });
            }
            break;
        case 'seekTo':
            if (isFinite(msg.value)) player.currentTime = msg.value;
            sendResponse({ ok: true });
            break;
        case 'setVolume': {
            const vol = Math.max(0, Math.min(1, msg.value));
            player.volume = vol;
            currentState.volume = vol;
            sendResponse({ ok: true });
            break;
        }
        case 'getState':
            currentState.currentTime = player.currentTime;
            currentState.duration = player.duration || 0;
            currentState.isPlaying = !player.paused && !player.ended;
            sendResponse({ ok: true, data: { ...currentState } });
            return true;
        case 'updateMeta': {
            const { title, artist, cover, songId } = msg;
            if (title !== undefined) currentState.title = title;
            if (artist !== undefined) currentState.artist = artist;
            if (cover !== undefined) currentState.cover = cover;
            if (songId !== undefined) currentState.songId = songId;
            updateMediaSession();
            broadcastState();
            sendResponse({ ok: true });
            break;
        }
        case 'stop':
            player.pause();
            player.src = '';
            currentState = {
                isPlaying: false, title: '', artist: '', cover: '',
                currentTime: 0, duration: 0, volume: currentState.volume, songId: null,
            };
            broadcastState();
            sendResponse({ ok: true });
            break;
        default:
            sendResponse({ ok: false, error: 'unknown command' });
    }
    return false;
});

setInterval(() => {
    if (!player.paused && !player.ended) {
        broadcastState();
    }
}, 1000);

console.log('[Offscreen] Music playback engine ready');
