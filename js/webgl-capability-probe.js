(function attachWebGLCapabilityProbe(global) {
    'use strict';

    /** @type {{ mode: 'webgl'|'canvas2d', reason: string, glVersion?: 1|2 } | null} */
    let moduleCache = null;

    const PROBE_CACHE_KEY = 'tetris3d.webglProbe.v1';

    /**
     * @typedef {'webgl'|'canvas2d'} RenderMode
     * @typedef {{ mode: RenderMode, reason: string, glVersion?: 1|2 }} ProbeResult
     */

    /**
     * @returns {{ sessionStorage: Storage|null, createCanvas: () => HTMLCanvasElement }}
     */
    function createDefaultProbeDeps() {
        return {
            sessionStorage:
                typeof sessionStorage !== 'undefined' ? sessionStorage : null,
            createCanvas() {
                if (typeof document !== 'undefined' && document.createElement) {
                    return document.createElement('canvas');
                }
                throw new Error('webgl-capability-probe: document unavailable');
            }
        };
    }

    /**
     * @param {Storage|null|undefined} storage
     * @returns {ProbeResult|null}
     */
    function readSessionCache(storage) {
        if (!storage) return null;
        try {
            const raw = storage.getItem(PROBE_CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.mode === 'webgl' || parsed.mode === 'canvas2d')) {
                return parsed;
            }
        } catch (_err) {
            /* ignore corrupt cache */
        }
        return null;
    }

    /**
     * @param {Storage|null|undefined} storage
     * @param {ProbeResult} result
     */
    function writeSessionCache(storage, result) {
        if (!storage) return;
        try {
            storage.setItem(PROBE_CACHE_KEY, JSON.stringify(result));
        } catch (_err) {
            /* quota / private mode */
        }
    }

    /**
     * @param {object} [deps]
     * @param {Storage|null} [deps.sessionStorage]
     */
    function clearProbeCache(deps) {
        moduleCache = null;
        const storage =
            (deps && deps.sessionStorage) ||
            createDefaultProbeDeps().sessionStorage;
        if (storage) {
            try {
                storage.removeItem(PROBE_CACHE_KEY);
            } catch (_err) {
                /* ignore */
            }
        }
    }

    /**
     * @param {WebGLRenderingContext|WebGL2RenderingContext} gl
     */
    function releaseProbeContext(gl) {
        try {
            const ext = gl.getExtension('WEBGL_lose_context');
            if (ext) ext.loseContext();
        } catch (_err) {
            /* ignore */
        }
    }

    /**
     * @param {HTMLCanvasElement} canvas
     * @returns {ProbeResult}
     */
    function probeCanvasWebGL(canvas) {
        canvas.width = 16;
        canvas.height = 16;

        const gl2 = canvas.getContext('webgl2', {
            failIfMajorPerformanceCaveat: false,
            antialias: false,
            depth: true,
            stencil: false
        });
        if (gl2) {
            releaseProbeContext(gl2);
            return { mode: 'webgl', reason: 'webgl2_ok', glVersion: 2 };
        }

        const gl =
            canvas.getContext('webgl', {
                failIfMajorPerformanceCaveat: false,
                antialias: false,
                depth: true,
                stencil: false
            }) ||
            canvas.getContext('experimental-webgl', {
                failIfMajorPerformanceCaveat: false,
                antialias: false,
                depth: true,
                stencil: false
            });

        if (gl) {
            releaseProbeContext(gl);
            return { mode: 'webgl', reason: 'webgl1_ok', glVersion: 1 };
        }

        return { mode: 'canvas2d', reason: 'no_webgl_context' };
    }

    /**
     * 一次性 WebGL 能力探测；结果会话级缓存，避免每局重复创建上下文。
     *
     * @param {object} [hints]
     * @param {boolean} [hints.forceCanvas2d] L0 功能开关注入
     * @param {object} [deps] 测试注入
     * @param {() => HTMLCanvasElement} [deps.createCanvas]
     * @param {Storage|null} [deps.sessionStorage]
     * @returns {ProbeResult}
     */
    function probeWebGLCapability(hints, deps) {
        const h = hints || {};
        const d = deps || createDefaultProbeDeps();

        if (h.forceCanvas2d) {
            return { mode: 'canvas2d', reason: 'force_canvas2d' };
        }

        if (moduleCache) {
            return moduleCache;
        }

        const cached = readSessionCache(d.sessionStorage);
        if (cached) {
            moduleCache = cached;
            return cached;
        }

        /** @type {ProbeResult} */
        let result;
        try {
            const canvas = d.createCanvas();
            result = probeCanvasWebGL(canvas);
        } catch (err) {
            const msg =
                err && typeof err.message === 'string' ? err.message : 'unknown';
            result = { mode: 'canvas2d', reason: 'probe_error:' + msg };
        }

        moduleCache = result;
        writeSessionCache(d.sessionStorage, result);
        return result;
    }

    const api = {
        PROBE_CACHE_KEY,
        probeWebGLCapability,
        clearProbeCache,
        probeCanvasWebGL
    };

    global.TetrisWebGLCapabilityProbe = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
