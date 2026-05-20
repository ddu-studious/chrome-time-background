(function attachTetris3DFx(global) {
    'use strict';

    /** 消行动画默认时长（ms），与 rAF 插值配合 */
    const LINE_CLEAR_ANIM_MS = 320;

    /**
     * 返回盘面中已满行的行索引（gy，向下为正）。
     *
     * @param {ReadonlyArray<ReadonlyArray<number>>} board
     * @returns {number[]}
     */
    function findFullRowIndices(board) {
        const rows = [];
        if (!board || !board.length) return rows;
        for (let y = 0; y < board.length; y += 1) {
            const line = board[y];
            if (line && line.length && line.every(cell => cell !== 0)) {
                rows.push(y);
            }
        }
        return rows;
    }

    /**
     * 锁定消行前快照，供渲染层插值（内核已完成消行后仍可视）。
     *
     * @param {ReadonlyArray<ReadonlyArray<number>>} board
     * @param {ReadonlyArray<number>} rowIndices
     * @returns {ReadonlyArray<{ row: number, cells: number[] }>}
     */
    function snapshotClearedRows(board, rowIndices) {
        const out = [];
        for (let i = 0; i < rowIndices.length; i += 1) {
            const row = rowIndices[i];
            const cells = board[row] ? board[row].slice() : [];
            out.push(Object.freeze({ row, cells: Object.freeze(cells) }));
        }
        return Object.freeze(out);
    }

    /**
     * 比较消行前后状态，决定是否启动消行动画。
     *
     * @param {{ lines: number, board: ReadonlyArray<ReadonlyArray<number>> }} before
     * @param {{ lines: number }} after
     * @param {number} nowMs
     * @param {number} [durationMs]
     * @returns {{ rows: number[], snapshots: ReadonlyArray<{ row: number, cells: number[] }>, startMs: number, durationMs: number }|null}
     */
    function detectLineClearForAnim(before, after, nowMs, durationMs) {
        if (!before || !after || after.lines <= before.lines) {
            return null;
        }
        const rows = findFullRowIndices(before.board);
        if (!rows.length) {
            return null;
        }
        return Object.freeze({
            rows: Object.freeze(rows.slice()),
            snapshots: snapshotClearedRows(before.board, rows),
            startMs: nowMs,
            durationMs: durationMs ?? LINE_CLEAR_ANIM_MS
        });
    }

    /**
     * @param {number} startMs
     * @param {number} nowMs
     * @param {number} durationMs
     * @returns {number|null} 0–1，完成返回 null
     */
    function computeLineClearT01(startMs, nowMs, durationMs) {
        if (durationMs <= 0) return null;
        const elapsed = nowMs - startMs;
        if (elapsed >= durationMs) return null;
        return Math.min(1, Math.max(0, elapsed / durationMs));
    }

    /**
     * ease-out cubic
     *
     * @param {number} t 0–1
     * @returns {number}
     */
    function easeOutCubic(t) {
        const x = Math.min(1, Math.max(0, t));
        return 1 - Math.pow(1 - x, 3);
    }

    /**
     * 消行插值：先微膨胀再收缩至 0，附带亮度脉冲。
     *
     * @param {number} t01 0–1
     * @returns {{ scale: number, brightness: number }}
     */
    function computeLineClearTransform(t01) {
        const e = easeOutCubic(t01);
        let scale;
        if (e < 0.35) {
            scale = 1 + 0.12 * (e / 0.35);
        } else {
            scale = 1.12 * (1 - (e - 0.35) / 0.65);
        }
        return {
            scale: Math.max(0, scale),
            brightness: 1 + 0.45 * (1 - e)
        };
    }

    /**
     * 将消行快照转为体素列表（渲染层叠加，不参与逻辑）。
     *
     * @param {ReadonlyArray<{ row: number, cells: ReadonlyArray<number> }>} snapshots
     * @returns {ReadonlyArray<{ gx: number, gy: number, colorIndex: number }>}
     */
    function buildLineClearOverlayVoxels(snapshots) {
        const voxels = [];
        if (!snapshots) return Object.freeze(voxels);
        for (let s = 0; s < snapshots.length; s += 1) {
            const snap = snapshots[s];
            const cells = snap.cells || [];
            for (let gx = 0; gx < cells.length; gx += 1) {
                const colorIndex = cells[gx];
                if (colorIndex) {
                    voxels.push({ gx, gy: snap.row, colorIndex });
                }
            }
        }
        return Object.freeze(voxels);
    }

    /**
     * 轻量 Web Audio 消行音效（无外部资源，可关闭）。
     *
     * @param {object} [deps]
     * @param {() => object|null} [deps.createAudioContext]
     */
    function createTetris3DSound(deps) {
        const createCtx =
            (deps && deps.createAudioContext) ||
            (() => {
                if (typeof window === 'undefined') return null;
                const Ctx = window.AudioContext || window.webkitAudioContext;
                return Ctx ? new Ctx() : null;
            });

        /** @type {object|null} */
        let ctx = null;

        function ensureContext() {
            if (!ctx) {
                try {
                    ctx = createCtx();
                } catch {
                    ctx = null;
                }
            }
            return ctx;
        }

        /**
         * @param {number} [linesCleared]
         */
        function playLineClear(linesCleared) {
            const audioCtx = ensureContext();
            if (!audioCtx) return;

            if (audioCtx.state === 'suspended' && typeof audioCtx.resume === 'function') {
                void audioCtx.resume();
            }

            const count = Math.max(1, Math.min(4, linesCleared || 1));
            const baseFreq = 440 + (count - 1) * 90;

            try {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(baseFreq, audioCtx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(
                    baseFreq * 1.6,
                    audioCtx.currentTime + 0.08
                );
                gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.22, audioCtx.currentTime + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 0.2);
            } catch {
                /* 静默降级 */
            }
        }

        function dispose() {
            if (ctx && typeof ctx.close === 'function') {
                void ctx.close();
            }
            ctx = null;
        }

        return Object.freeze({ playLineClear, dispose, ensureContext });
    }

    const api = {
        LINE_CLEAR_ANIM_MS,
        findFullRowIndices,
        snapshotClearedRows,
        detectLineClearForAnim,
        computeLineClearT01,
        easeOutCubic,
        computeLineClearTransform,
        buildLineClearOverlayVoxels,
        createTetris3DSound
    };

    global.Tetris3DFx = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
