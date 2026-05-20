(function attachTetris3DPlatform(global) {
    'use strict';

    const STORAGE_KEY_SOUND = 'tetris3d.soundEnabled';
    const MODULE_ID = 'tetris-3d-game';

    /** 允许写入 meta 的白名单字段（BR-VALID-010：无 PII） */
    const ALLOWED_META_KEYS = new Set([
        'durationMs',
        'score',
        'lines',
        'level',
        'renderMode',
        'probeReason',
        'glVersion',
        'linesCleared',
        'completed',
        'effectTierId',
        'abortReason'
    ]);

    /**
     * @param {Record<string, unknown>|undefined} payload
     * @returns {Record<string, unknown>}
     */
    function sanitizePayload(payload) {
        const out = {};
        if (!payload || typeof payload !== 'object') return out;
        for (const key of Object.keys(payload)) {
            if (!ALLOWED_META_KEYS.has(key)) continue;
            const val = payload[key];
            if (
                val === null ||
                typeof val === 'number' ||
                typeof val === 'boolean' ||
                typeof val === 'string'
            ) {
                out[key] = val;
            }
        }
        return out;
    }

    /**
     * @param {object} [deps]
     * @param {{ log: (activity: object) => Promise<void>|void }|null} [deps.activityLogger]
     * @param {Storage|null} [deps.localStorage]
     * @param {(level: string, args: unknown[]) => void} [deps.debugFn]
     */
    function createTetris3DPlatform(deps) {
        const d = deps || {};
        const activityLogger = d.activityLogger ?? null;
        const storage = d.localStorage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
        const debugFn =
            d.debugFn ||
            ((level, args) => {
                if (typeof console !== 'undefined' && console[level]) {
                    console[level]('[Tetris3DPlatform]', ...args);
                }
            });

        /**
         * @param {string} event 短名：game_start | game_finish | probe_result | panel_abort
         * @param {Record<string, unknown>} [payload]
         */
        function track(event, payload) {
            const meta = sanitizePayload(payload);
            const activity = {
                type: 'tetris_3d_' + event,
                module: MODULE_ID,
                title: event,
                meta
            };

            if (activityLogger && typeof activityLogger.log === 'function') {
                void activityLogger.log(activity);
            } else {
                debugFn('debug', [event, meta]);
            }
        }

        /**
         * @returns {boolean}
         */
        function getSoundEnabled() {
            if (!storage || typeof storage.getItem !== 'function') return true;
            const raw = storage.getItem(STORAGE_KEY_SOUND);
            if (raw === null) return true;
            return raw !== '0' && raw !== 'false';
        }

        /**
         * @param {boolean} enabled
         */
        function setSoundEnabled(enabled) {
            if (!storage || typeof storage.setItem !== 'function') return;
            storage.setItem(STORAGE_KEY_SOUND, enabled ? '1' : '0');
        }

        return Object.freeze({
            track,
            getSoundEnabled,
            setSoundEnabled,
            sanitizePayload
        });
    }

    const api = {
        STORAGE_KEY_SOUND,
        MODULE_ID,
        ALLOWED_META_KEYS,
        sanitizePayload,
        createTetris3DPlatform
    };

    global.Tetris3DPlatform = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
