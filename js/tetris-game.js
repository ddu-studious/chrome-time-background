(function attachTetrisGame(global) {
    'use strict';

    /** 七种四格骨牌类型。 */
    const PIECE_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

    /**
     * 每种类型在四个旋转态下的 4×4 占用矩阵（与常见俄罗斯方块网格一致）。
     * 位置 (px, py) 表示该 4×4 块左上角落在盘面上的列、行。
     */
    const MATRICES = {
        I: [
            [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
            [[0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0], [0, 0, 1, 0]],
            [[0, 0, 0, 0], [0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0]],
            [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0]]
        ],
        O: [
            [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
            [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
            [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
            [[0, 1, 1, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]]
        ],
        T: [
            [[0, 1, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
            [[0, 1, 0, 0], [0, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
            [[0, 0, 0, 0], [1, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
            [[0, 1, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]]
        ],
        S: [
            [[0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
            [[0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 1, 0], [0, 0, 0, 0]],
            [[0, 0, 0, 0], [0, 1, 1, 0], [1, 1, 0, 0], [0, 0, 0, 0]],
            [[1, 0, 0, 0], [1, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]]
        ],
        Z: [
            [[1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
            [[0, 0, 1, 0], [0, 1, 1, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
            [[0, 0, 0, 0], [1, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
            [[0, 1, 0, 0], [1, 1, 0, 0], [1, 0, 0, 0], [0, 0, 0, 0]]
        ],
        J: [
            [[1, 0, 0, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
            [[0, 1, 1, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]],
            [[0, 0, 0, 0], [1, 1, 1, 0], [0, 0, 1, 0], [0, 0, 0, 0]],
            [[0, 1, 0, 0], [0, 1, 0, 0], [1, 1, 0, 0], [0, 0, 0, 0]]
        ],
        L: [
            [[0, 0, 1, 0], [1, 1, 1, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
            [[0, 1, 0, 0], [0, 1, 0, 0], [0, 1, 1, 0], [0, 0, 0, 0]],
            [[0, 0, 0, 0], [1, 1, 1, 0], [1, 0, 0, 0], [0, 0, 0, 0]],
            [[1, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]]
        ]
    };

    const PIECE_INDEX = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };

    function shuffleBag(arr, randomFn) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i -= 1) {
            const j = Math.floor(randomFn() * (i + 1));
            const t = a[i];
            a[i] = a[j];
            a[j] = t;
        }
        return a;
    }

    function getPieceCells(type, rotation, px, py) {
        const mat = MATRICES[type][rotation % 4];
        const cells = [];
        for (let r = 0; r < 4; r += 1) {
            for (let c = 0; c < 4; c += 1) {
                if (mat[r][c]) {
                    cells.push({ x: px + c, y: py + r });
                }
            }
        }
        return cells;
    }

    function createTetrisGameCore(options) {
        const config = Object.assign({
            cols: 10,
            rows: 20,
            randomFn: Math.random
        }, options || {});

        let bag = [];
        let testNextQueue = null;

        function refillBag() {
            bag = shuffleBag(PIECE_TYPES.slice(), config.randomFn);
        }

        function nextTypeFromBag() {
            if (testNextQueue && testNextQueue.length > 0) {
                return testNextQueue.shift();
            }
            if (bag.length === 0) refillBag();
            return bag.pop();
        }

        const state = {
            cols: config.cols,
            rows: config.rows,
            /** 已锁定的格子：0 空，1–7 为骨牌种类索引 */
            board: [],
            current: null,
            nextType: null,
            score: 0,
            lines: 0,
            level: 0,
            gameOver: false
        };

        function emptyBoard() {
            const rows = [];
            for (let y = 0; y < state.rows; y += 1) {
                rows.push(new Array(state.cols).fill(0));
            }
            return rows;
        }

        function collides(piece) {
            if (!piece) return false;
            const cells = getPieceCells(piece.type, piece.rotation, piece.x, piece.y);
            for (let i = 0; i < cells.length; i += 1) {
                const { x, y } = cells[i];
                if (x < 0 || x >= state.cols || y >= state.rows) return true;
                if (y >= 0 && state.board[y][x]) return true;
            }
            return false;
        }

        function spawnPiece(type) {
            const spawnX = 3;
            const spawnY = 0;
            return {
                type,
                rotation: 0,
                x: spawnX,
                y: spawnY
            };
        }

        function lockPiece(piece) {
            const cells = getPieceCells(piece.type, piece.rotation, piece.x, piece.y);
            const idx = PIECE_INDEX[piece.type];
            for (let i = 0; i < cells.length; i += 1) {
                const { x, y } = cells[i];
                if (y >= 0 && y < state.rows && x >= 0 && x < state.cols) {
                    state.board[y][x] = idx;
                }
            }
        }

        function clearFullLines() {
            let cleared = 0;
            let y = state.rows - 1;
            while (y >= 0) {
                const full = state.board[y].every(cell => cell !== 0);
                if (full) {
                    cleared += 1;
                    state.board.splice(y, 1);
                    state.board.unshift(new Array(state.cols).fill(0));
                } else {
                    y -= 1;
                }
            }
            if (cleared > 0) {
                const points = [0, 100, 300, 500, 800];
                state.score += points[cleared] || 0;
                state.lines += cleared;
                state.level = Math.floor(state.lines / 10);
            }
        }

        const KICKS = [
            [0, 0],
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1],
            [-1, -1],
            [1, -1],
            [-2, 0],
            [2, 0]
        ];

        function trySpawn() {
            const t = state.nextType || nextTypeFromBag();
            state.nextType = nextTypeFromBag();
            const piece = spawnPiece(t);
            if (collides(piece)) {
                state.gameOver = true;
                state.current = null;
            } else {
                state.current = piece;
            }
        }

        function getState() {
            return {
                cols: state.cols,
                rows: state.rows,
                board: state.board.map(row => row.slice()),
                current: state.current
                    ? {
                          type: state.current.type,
                          rotation: state.current.rotation,
                          x: state.current.x,
                          y: state.current.y
                      }
                    : null,
                nextType: state.nextType,
                score: state.score,
                lines: state.lines,
                level: state.level,
                gameOver: state.gameOver
            };
        }

        function reset() {
            state.board = emptyBoard();
            state.score = 0;
            state.lines = 0;
            state.level = 0;
            state.gameOver = false;
            state.current = null;
            bag = [];
            refillBag();
            state.nextType = nextTypeFromBag();
            trySpawn();
            return getState();
        }

        function moveHorizontal(delta) {
            if (state.gameOver || !state.current) return false;
            const next = Object.assign({}, state.current, { x: state.current.x + delta });
            if (collides(next)) return false;
            state.current = next;
            return true;
        }

        function softDrop() {
            if (state.gameOver || !state.current) return getState();
            const next = Object.assign({}, state.current, { y: state.current.y + 1 });
            if (collides(next)) {
                lockPiece(state.current);
                clearFullLines();
                trySpawn();
            } else {
                state.current = next;
            }
            return getState();
        }

        function hardDrop() {
            if (state.gameOver || !state.current) return getState();
            let piece = state.current;
            while (true) {
                const below = Object.assign({}, piece, { y: piece.y + 1 });
                if (collides(below)) break;
                piece = below;
            }
            state.current = piece;
            lockPiece(state.current);
            clearFullLines();
            trySpawn();
            return getState();
        }

        function rotateCW() {
            if (state.gameOver || !state.current) return false;
            const base = state.current;
            const nextRot = (base.rotation + 1) % 4;
            for (let k = 0; k < KICKS.length; k += 1) {
                const [kx, ky] = KICKS[k];
                const test = {
                    type: base.type,
                    rotation: nextRot,
                    x: base.x + kx,
                    y: base.y + ky
                };
                if (!collides(test)) {
                    state.current = test;
                    return true;
                }
            }
            return false;
        }

        function tick() {
            return softDrop();
        }

        /** 测试：固定接下来若干次出块顺序（与 bags 无关，消费后恢复随机袋） */
        function __setNextTypesForTest(types) {
            testNextQueue = types.slice();
        }

        function __clearTestNextQueue() {
            testNextQueue = null;
        }

        /** 测试：直接写入盘面（行数组，元素为 0–7） */
        function __setBoardForTest(rows) {
            state.board = rows.map(row => row.slice());
        }

        /** 测试：仅执行消行与计分（不锁块），用于验证盘面已满行时的消除逻辑 */
        function __sweepLinesForTest() {
            clearFullLines();
            return getState();
        }

        /** 测试：直接设置当前块（不改变锁定格） */
        function __setCurrentForTest(piece) {
            if (!piece) {
                state.current = null;
                return;
            }
            state.current = {
                type: piece.type,
                rotation: piece.rotation,
                x: piece.x,
                y: piece.y
            };
        }

        /** 测试：直接触发一次生成（用于验证出生点与堆叠冲突时的 gameOver） */
        function __callTrySpawnForTest() {
            trySpawn();
            return getState();
        }

        reset();

        return {
            reset,
            tick,
            softDrop,
            hardDrop,
            getState,
            moveHorizontal,
            rotateCW,
            __setBoardForTest,
            __setCurrentForTest,
            __setNextTypesForTest,
            __clearTestNextQueue,
            __sweepLinesForTest,
            __callTrySpawnForTest,
            MATRICES,
            PIECE_TYPES
        };
    }

    const COLORS = {
        I: '#22d3ee',
        O: '#facc15',
        T: '#a855f7',
        S: '#22c55e',
        Z: '#ef4444',
        J: '#3b82f6',
        L: '#f97316'
    };

    /** 盘面格子索引 → 种类字母（与 PIECE_INDEX 一致） */
    const BOARD_INDEX_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

    /**
     * 渲染管线（快照驱动）：根据仿真内核输出的盘面与当前骨牌绘制一帧。
     * 不包含计时器、输入或 WebGL——便于后续替换为 Three/Babylon 适配层。
     *
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} canvasWidth  backing-store 宽度（通常为 canvas.width）
     * @param {number} canvasHeight backing-store 高度
     * @param {{ cols:number, rows:number, board:number[][], current:null|{type:string,rotation:number,x:number,y:number} }} state {@link createTetrisGameCore} 的 getState() 返回值
     * @param {Record<string,string>} colors 骨牌种类 → 填充色（默认 {@link COLORS}）
     */
    function drawTetrisFrame(ctx, canvasWidth, canvasHeight, state, colors) {
        const palette = colors || COLORS;
        const cols = state.cols;
        const rows = state.rows;
        const cellW = Math.floor(canvasWidth / cols);
        const cellH = Math.floor(canvasHeight / rows);

        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= cols; x += 1) {
            ctx.beginPath();
            ctx.moveTo(x * cellW, 0);
            ctx.lineTo(x * cellW, rows * cellH);
            ctx.stroke();
        }
        for (let y = 0; y <= rows; y += 1) {
            ctx.beginPath();
            ctx.moveTo(0, y * cellH);
            ctx.lineTo(cols * cellW, y * cellH);
            ctx.stroke();
        }

        function drawCell(cx, cy, fill) {
            const pad = 1;
            ctx.fillStyle = fill;
            ctx.fillRect(cx * cellW + pad, cy * cellH + pad, cellW - pad * 2, cellH - pad * 2);
        }

        for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < cols; x += 1) {
                const v = state.board[y][x];
                if (v) {
                    drawCell(x, y, palette[BOARD_INDEX_TYPES[v - 1]]);
                }
            }
        }

        if (state.current) {
            const piece = state.current;
            const cells = getPieceCells(piece.type, piece.rotation, piece.x, piece.y);
            const fill = palette[piece.type];
            for (let i = 0; i < cells.length; i += 1) {
                const c = cells[i];
                if (c.y >= 0) drawCell(c.x, c.y, fill);
            }
        }
    }

    class TetrisGameManager {
        constructor(options) {
            const opts = options || {};
            this.core = createTetrisGameCore({ cols: 10, rows: 20 });
            this.timer = null;
            this.baseIntervalMs = 520;
            this.isPaused = true;
            /** @type {'low'|'medium'|'high'|null} */
            this.effectTierId = opts.effectTierId ?? null;
            /** 逻辑分辨率（CSS / 设计尺寸），backing-store 由 B3 特效分级缩放 */
            this.logicalCanvasWidth = opts.logicalCanvasWidth ?? null;
            this.logicalCanvasHeight = opts.logicalCanvasHeight ?? null;
            this.canvas = null;
            this.ctx = null;
            this.scoreEl = null;
            this.linesEl = null;
            this.statusEl = null;
            this.toggleBtn = null;
            this.restartBtn = null;
            this.panel = null;
        }

        init() {
            this.bindElements();
            this.bindEvents();
            this.render();
        }

        bindElements() {
            this.panel = document.getElementById('tetris-game-panel');
            this.canvas = document.getElementById('tetris-game-canvas');
            this.scoreEl = document.getElementById('tetris-game-score');
            this.linesEl = document.getElementById('tetris-game-lines');
            this.statusEl = document.getElementById('tetris-game-status');
            this.toggleBtn = document.getElementById('tetris-game-toggle');
            this.restartBtn = document.getElementById('tetris-game-restart');

            if (this.canvas) {
                const lw =
                    this.logicalCanvasWidth ??
                    (Number(this.canvas.dataset.logicalWidth) || this.canvas.width || 300);
                const lh =
                    this.logicalCanvasHeight ??
                    (Number(this.canvas.dataset.logicalHeight) || this.canvas.height || 600);
                this.logicalCanvasWidth = lw;
                this.logicalCanvasHeight = lh;

                const tiers = typeof global.TetrisEffectTiers !== 'undefined' ? global.TetrisEffectTiers : null;
                if (tiers) {
                    const tierId =
                        this.effectTierId ||
                        tiers.pickTierFromHints({
                            hardwareConcurrency: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined,
                            deviceMemory: typeof navigator !== 'undefined' ? navigator.deviceMemory : undefined,
                            saveData:
                                typeof navigator !== 'undefined' &&
                                navigator.connection &&
                                navigator.connection.saveData === true,
                            prefersReducedMotion:
                                typeof window !== 'undefined' &&
                                typeof window.matchMedia === 'function' &&
                                window.matchMedia('(prefers-reduced-motion: reduce)').matches
                        });
                    const profile = tiers.getTierPreset(tierId);
                    this.effectTierId = tierId;
                    this.effectProfile = profile;
                    tiers.applyResolutionScaleToCanvas(this.canvas, lw, lh, profile.canvasResolutionScale);
                }
            }

            this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        }

        bindEvents() {
            const dockBtn = document.getElementById('tetris-dock-btn');
            const closeBtn = document.getElementById('tetris-game-close');

            dockBtn?.addEventListener('click', () => this.togglePanel());
            closeBtn?.addEventListener('click', () => this.hidePanel());
            this.toggleBtn?.addEventListener('click', () => this.togglePause());
            this.restartBtn?.addEventListener('click', () => this.restart());

            document.addEventListener('keydown', event => {
                if (!this.isPanelOpen()) return;
                const keyMapMove = {
                    ArrowLeft: -1,
                    ArrowRight: 1,
                    KeyA: -1,
                    KeyD: 1
                };
                if (keyMapMove[event.code] !== undefined) {
                    event.preventDefault();
                    this.core.moveHorizontal(keyMapMove[event.code]);
                    this.render();
                    return;
                }
                if (event.code === 'ArrowUp' || event.code === 'KeyX' || event.code === 'KeyK') {
                    event.preventDefault();
                    this.core.rotateCW();
                    this.render();
                    return;
                }
                if (event.code === 'ArrowDown' || event.code === 'KeyS') {
                    event.preventDefault();
                    const after = this.core.softDrop();
                    if (after.gameOver) {
                        this.pause();
                        this.setStatus('游戏结束，按“重新开始”再来一局');
                    }
                    this.render();
                    return;
                }
                if (event.code === 'Space') {
                    event.preventDefault();
                    this.togglePause();
                    return;
                }
                if (event.code === 'KeyC' || event.code === 'ArrowEnd') {
                    event.preventDefault();
                    const after = this.core.hardDrop();
                    if (after.gameOver) {
                        this.pause();
                        this.setStatus('游戏结束，按“重新开始”再来一局');
                    }
                    this.render();
                }
            });
        }

        isPanelOpen() {
            return Boolean(this.panel && this.panel.classList.contains('open'));
        }

        togglePanel() {
            if (!this.panel) return;
            this.panel.classList.toggle('open');
            const dockBtn = document.getElementById('tetris-dock-btn');
            dockBtn?.classList.toggle('active', this.isPanelOpen());
            if (this.isPanelOpen()) {
                this.render();
            } else {
                this.pause();
            }
        }

        hidePanel() {
            if (!this.panel) return;
            this.panel.classList.remove('open');
            document.getElementById('tetris-dock-btn')?.classList.remove('active');
            this.pause();
        }

        getTickMs() {
            const st = this.core.getState();
            const level = st.level;
            const step = Math.min(320, 20 * level);
            return Math.max(120, this.baseIntervalMs - step);
        }

        start() {
            if (this.timer) return;
            this.isPaused = false;
            const loop = () => {
                const state = this.core.tick();
                if (state.gameOver) {
                    this.pause();
                    this.setStatus('游戏结束，按“重新开始”再来一局');
                }
                this.render();
                if (!this.isPaused && !this.core.getState().gameOver) {
                    this.timer = setTimeout(loop, this.getTickMs());
                }
            };
            this.scheduleLoop(loop);
            this.refreshButtons();
            this.setStatus('游戏进行中');
        }

        scheduleLoop(loop) {
            if (this.timer) clearTimeout(this.timer);
            this.timer = setTimeout(loop, this.getTickMs());
        }

        pause() {
            this.isPaused = true;
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }
            this.refreshButtons();
        }

        togglePause() {
            const state = this.core.getState();
            if (state.gameOver) return;
            if (this.isPaused) this.start();
            else {
                this.pause();
                this.setStatus('游戏已暂停');
            }
        }

        restart() {
            this.core.reset();
            this.pause();
            this.render();
            this.setStatus('已重置，点击“开始”启动');
        }

        refreshButtons() {
            if (this.toggleBtn) {
                this.toggleBtn.textContent = this.isPaused ? '开始' : '暂停';
            }
        }

        setStatus(text) {
            if (this.statusEl) this.statusEl.textContent = text;
        }

        render() {
            const state = this.core.getState();
            if (this.scoreEl) this.scoreEl.textContent = String(state.score);
            if (this.linesEl) this.linesEl.textContent = String(state.lines);
            if (!this.ctx || !this.canvas) return;
            drawTetrisFrame(this.ctx, this.canvas.width, this.canvas.height, state, COLORS);
        }
    }

    const api = {
        createTetrisGameCore,
        getPieceCells,
        drawTetrisFrame,
        COLORS,
        TetrisGameManager
    };

    global.TetrisGame = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.TetrisGame && !window.tetrisGameManager) {
            const manager = new window.TetrisGame.TetrisGameManager();
            manager.init();
            window.tetrisGameManager = manager;
        }
    });
}
