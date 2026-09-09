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
    album: '',
    cover: '',
    currentTime: 0,
    duration: 0,
    volume: 1,
    songId: null,
};
let playGeneration = 0;
let alarmAudioContext = null;
let alarmMasterGain = null;
let alarmSchedulerTimer = null;
let alarmAutoStopTimer = null;
let alarmSessionId = null;
let alarmMusicDucked = false;

const ALARM_TONES = Object.freeze({
    chime: { cycle: 2.4, notes: [[659, 0, .24], [784, .34, .24], [988, .7, .5]] },
    rise: { cycle: 2.8, notes: [[392, 0, .32], [494, .4, .32], [587, .8, .32], [784, 1.2, .65]] },
    urgent: { cycle: 1.6, notes: [[880, 0, .22], [880, .3, .22], [1047, .65, .38]] },
    water: { cycle: 3.2, notes: [[523, 0, .45], [659, .55, .4], [784, 1.15, .7]] },
});

function effectiveMusicVolume() {
    return Math.max(0, Math.min(1, currentState.volume * (alarmMusicDucked ? 0.2 : 1)));
}

function setMusicDuck(ducked) {
    alarmMusicDucked = ducked;
    player.volume = effectiveMusicVolume();
}

function scheduleAlarmNote(frequency, startsIn, duration) {
    if (!alarmAudioContext || !alarmMasterGain) return;
    const startAt = alarmAudioContext.currentTime + startsIn;
    const oscillator = alarmAudioContext.createOscillator();
    const noteGain = alarmAudioContext.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startAt);
    noteGain.gain.setValueAtTime(0.0001, startAt);
    noteGain.gain.exponentialRampToValueAtTime(0.72, startAt + 0.025);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(noteGain);
    noteGain.connect(alarmMasterGain);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.04);
}

function scheduleAlarmPattern(soundId) {
    const profile = ALARM_TONES[soundId] || ALARM_TONES.chime;
    for (const [frequency, offset, duration] of profile.notes) {
        scheduleAlarmNote(frequency, offset, duration);
    }
    return profile.cycle;
}

async function stopAlarmTone(requestedSessionId = null) {
    if (requestedSessionId && alarmSessionId && requestedSessionId !== alarmSessionId) {
        return { ok: false, error: 'session-mismatch', sessionId: alarmSessionId };
    }
    clearInterval(alarmSchedulerTimer);
    clearTimeout(alarmAutoStopTimer);
    alarmSchedulerTimer = null;
    alarmAutoStopTimer = null;
    alarmSessionId = null;
    setMusicDuck(false);
    if (alarmAudioContext) {
        try { await alarmAudioContext.close(); } catch (_) {}
    }
    alarmAudioContext = null;
    alarmMasterGain = null;
    return { ok: true };
}

async function startAlarmTone(options) {
    const sessionId = String(options.sessionId || `alarm_${Date.now()}`);
    if (alarmSessionId === sessionId && alarmAudioContext?.state !== 'closed') {
        return { ok: true, alreadyPlaying: true, sessionId };
    }
    await stopAlarmTone();
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return { ok: false, error: 'audio-context-unavailable' };

    alarmAudioContext = new AudioContextClass();
    alarmMasterGain = alarmAudioContext.createGain();
    alarmMasterGain.connect(alarmAudioContext.destination);
    const volume = Math.max(0.05, Math.min(1, Number(options.volume) || 0.8));
    const fadeSeconds = Math.max(0, Math.min(60, Number(options.fadeSeconds) || 0));
    const now = alarmAudioContext.currentTime;
    alarmMasterGain.gain.setValueAtTime(fadeSeconds > 0 ? 0.0001 : volume, now);
    if (fadeSeconds > 0) {
        alarmMasterGain.gain.exponentialRampToValueAtTime(volume, now + fadeSeconds);
    }
    alarmSessionId = sessionId;
    setMusicDuck(true);
    try {
        await alarmAudioContext.resume();
    } catch (error) {
        await stopAlarmTone(sessionId);
        throw error;
    }

    const cycleSeconds = scheduleAlarmPattern(options.soundId);
    alarmSchedulerTimer = setInterval(() => scheduleAlarmPattern(options.soundId), cycleSeconds * 1000);
    const autoStopAfterMs = Math.max(1000, Math.min(15 * 60 * 1000, Number(options.autoStopAfterMs) || 15 * 60 * 1000));
    alarmAutoStopTimer = setTimeout(() => {
        stopAlarmTone(sessionId).then(() => {
            chrome.runtime.sendMessage({ action: 'offscreen_alarm_timeout', sessionId }).catch(() => {});
        });
    }, autoStopAfterMs);
    return { ok: true, sessionId };
}

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
    chrome.runtime.sendMessage({ action: 'offscreen_track_ended', songId: currentState.songId }).catch(() => {});
});

player.addEventListener('loadedmetadata', () => {
    currentState.duration = player.duration || 0;
    broadcastState();
});

player.addEventListener('error', () => {
    const code = player.error?.code || 0;
    // 切换 src 时浏览器可能主动中止上一首；这是预期切歌，不应触发自动跳过下一首。
    if (code === 1) return;
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
        songId: currentState.songId,
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
        album: currentState.album || '',
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
            const { url, songId, title, artist, cover, album } = msg;
            if (url) {
                const generation = ++playGeneration;
                const requestedSongId = songId || null;
                currentState.title = title || '';
                currentState.artist = artist || '';
                currentState.album = album || '';
                currentState.cover = cover || '';
                currentState.songId = songId || null;
                player.src = url;
                player.volume = effectiveMusicVolume();
                player.play().then(() => {
                    if (generation !== playGeneration) return;
                    updateMediaSession();
                    broadcastState();
                }).catch((e) => {
                    if (generation !== playGeneration) return;
                    console.warn('[Offscreen] play failed:', e);
                    chrome.runtime.sendMessage({
                        action: 'offscreen_error',
                        error: e.message || 'play() rejected',
                        code: 4,
                        songId: requestedSongId,
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
            currentState.volume = vol;
            player.volume = effectiveMusicVolume();
            sendResponse({ ok: true });
            break;
        }
        case 'alarmPlay':
            startAlarmTone(msg).then(sendResponse).catch(error => {
                sendResponse({ ok: false, error: error?.message || 'alarm-play-failed' });
            });
            return true;
        case 'alarmStop':
            stopAlarmTone(msg.sessionId || null).then(sendResponse);
            return true;
        case 'getState':
            currentState.currentTime = player.currentTime;
            currentState.duration = player.duration || 0;
            currentState.isPlaying = !player.paused && !player.ended;
            sendResponse({ ok: true, data: { ...currentState } });
            return true;
        case 'updateMeta': {
            const { title, artist, cover, album, songId } = msg;
            if (title !== undefined) currentState.title = title;
            if (artist !== undefined) currentState.artist = artist;
            if (album !== undefined) currentState.album = album;
            if (cover !== undefined) currentState.cover = cover;
            if (songId !== undefined) currentState.songId = songId;
            updateMediaSession();
            broadcastState();
            sendResponse({ ok: true });
            break;
        }
        case 'stop':
            playGeneration++;
            player.pause();
            player.src = '';
            currentState = {
                isPlaying: false, title: '', artist: '', album: '', cover: '',
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
