(function attachSnakeGame(global) {
    'use strict';

    const DIRS = {
        UP: { x: 0, y: -1, name: 'UP' },
        DOWN: { x: 0, y: 1, name: 'DOWN' },
        LEFT: { x: -1, y: 0, name: 'LEFT' },
        RIGHT: { x: 1, y: 0, name: 'RIGHT' }
    };

    function createSnakeGameCore(options) {
        const config = Object.assign({
            gridSize: 20,
            randomFn: Math.random
        }, options || {});

        const state = {
            gridSize: config.gridSize,
            snake: [],
            direction: DIRS.RIGHT,
            nextDirection: DIRS.RIGHT,
            food: null,
            score: 0,
            gameOver: false
        };

        function keyOfCell(cell) {
            return `${cell.x},${cell.y}`;
        }

        function placeFood() {
            const occupied = new Set(state.snake.map(keyOfCell));
            const freeCells = [];

            for (let y = 0; y < state.gridSize; y += 1) {
                for (let x = 0; x < state.gridSize; x += 1) {
                    const key = `${x},${y}`;
                    if (!occupied.has(key)) {
                        freeCells.push({ x, y });
                    }
                }
            }

            if (freeCells.length === 0) {
                return null;
            }

            const index = Math.floor(config.randomFn() * freeCells.length);
            return freeCells[index] || freeCells[0];
        }

        function isOppositeDirection(a, b) {
            return a.x + b.x === 0 && a.y + b.y === 0;
        }

        function reset() {
            const center = Math.floor(state.gridSize / 2);
            state.snake = [
                { x: center, y: center },
                { x: center - 1, y: center },
                { x: center - 2, y: center }
            ];
            state.direction = DIRS.RIGHT;
            state.nextDirection = DIRS.RIGHT;
            state.score = 0;
            state.gameOver = false;
            state.food = placeFood();
            return getState();
        }

        function getState() {
            return {
                gridSize: state.gridSize,
                snake: state.snake.map(seg => ({ x: seg.x, y: seg.y })),
                direction: state.direction.name,
                food: state.food ? { x: state.food.x, y: state.food.y } : null,
                score: state.score,
                gameOver: state.gameOver
            };
        }

        function setDirection(directionName) {
            const dir = DIRS[directionName];
            if (!dir || state.gameOver) return false;
            if (isOppositeDirection(dir, state.direction)) return false;
            state.nextDirection = dir;
            return true;
        }

        function checkCollision(head) {
            if (head.x < 0 || head.y < 0 || head.x >= state.gridSize || head.y >= state.gridSize) {
                return true;
            }
            return state.snake.some(seg => seg.x === head.x && seg.y === head.y);
        }

        function tick() {
            if (state.gameOver) return getState();

            state.direction = state.nextDirection;
            const currentHead = state.snake[0];
            const nextHead = {
                x: currentHead.x + state.direction.x,
                y: currentHead.y + state.direction.y
            };

            if (checkCollision(nextHead)) {
                state.gameOver = true;
                return getState();
            }

            state.snake.unshift(nextHead);

            const ateFood = state.food && nextHead.x === state.food.x && nextHead.y === state.food.y;
            if (ateFood) {
                state.score += 1;
                state.food = placeFood();
            } else {
                state.snake.pop();
            }

            return getState();
        }

        // 仅用于测试场景，避免通过随机数控制食物位置带来不稳定测试。
        function __setFoodForTest(cell) {
            if (!cell) {
                state.food = null;
                return;
            }
            state.food = { x: cell.x, y: cell.y };
        }

        reset();

        return {
            reset,
            tick,
            setDirection,
            getState,
            __setFoodForTest,
            DIRS
        };
    }

    class SnakeGameManager {
        constructor() {
            this.core = createSnakeGameCore({ gridSize: 20 });
            this.timer = null;
            this.tickMs = 160;
            this.isPaused = true;
            this.canvas = null;
            this.ctx = null;
            this.scoreEl = null;
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
            this.panel = document.getElementById('snake-game-panel');
            this.canvas = document.getElementById('snake-game-canvas');
            this.scoreEl = document.getElementById('snake-game-score');
            this.statusEl = document.getElementById('snake-game-status');
            this.toggleBtn = document.getElementById('snake-game-toggle');
            this.restartBtn = document.getElementById('snake-game-restart');
            this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        }

        bindEvents() {
            const dockBtn = document.getElementById('snake-dock-btn');
            const closeBtn = document.getElementById('snake-game-close');

            dockBtn?.addEventListener('click', () => this.togglePanel());
            closeBtn?.addEventListener('click', () => this.hidePanel());
            this.toggleBtn?.addEventListener('click', () => this.togglePause());
            this.restartBtn?.addEventListener('click', () => this.restart());

            document.addEventListener('keydown', (event) => {
                if (!this.isPanelOpen()) return;
                const keyMap = {
                    ArrowUp: 'UP',
                    ArrowDown: 'DOWN',
                    ArrowLeft: 'LEFT',
                    ArrowRight: 'RIGHT',
                    KeyW: 'UP',
                    KeyS: 'DOWN',
                    KeyA: 'LEFT',
                    KeyD: 'RIGHT'
                };
                const dir = keyMap[event.code];
                if (dir) {
                    event.preventDefault();
                    this.core.setDirection(dir);
                    return;
                }
                if (event.code === 'Space') {
                    event.preventDefault();
                    this.togglePause();
                }
            });
        }

        isPanelOpen() {
            return Boolean(this.panel && this.panel.classList.contains('open'));
        }

        togglePanel() {
            if (!this.panel) return;
            this.panel.classList.toggle('open');
            const dockBtn = document.getElementById('snake-dock-btn');
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
            document.getElementById('snake-dock-btn')?.classList.remove('active');
            this.pause();
        }

        start() {
            if (this.timer) return;
            this.isPaused = false;
            this.timer = setInterval(() => {
                const state = this.core.tick();
                if (state.gameOver) {
                    this.pause();
                    this.setStatus('游戏结束，按“重新开始”再来一局');
                }
                this.render();
            }, this.tickMs);
            this.refreshButtons();
            this.setStatus('游戏进行中');
        }

        pause() {
            this.isPaused = true;
            if (this.timer) {
                clearInterval(this.timer);
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
            if (!this.ctx || !this.canvas) return;

            const { gridSize } = state;
            const cell = Math.floor(this.canvas.width / gridSize);
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.fillStyle = '#0f172a';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
            this.ctx.lineWidth = 1;
            for (let i = 0; i <= gridSize; i += 1) {
                this.ctx.beginPath();
                this.ctx.moveTo(i * cell, 0);
                this.ctx.lineTo(i * cell, this.canvas.height);
                this.ctx.stroke();

                this.ctx.beginPath();
                this.ctx.moveTo(0, i * cell);
                this.ctx.lineTo(this.canvas.width, i * cell);
                this.ctx.stroke();
            }

            if (state.food) {
                this.ctx.fillStyle = '#ef4444';
                this.ctx.fillRect(state.food.x * cell + 2, state.food.y * cell + 2, cell - 4, cell - 4);
            }

            state.snake.forEach((seg, idx) => {
                this.ctx.fillStyle = idx === 0 ? '#22d3ee' : '#22c55e';
                this.ctx.fillRect(seg.x * cell + 2, seg.y * cell + 2, cell - 4, cell - 4);
            });
        }
    }

    const api = {
        createSnakeGameCore,
        SnakeGameManager
    };

    global.SnakeGame = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        if (window.SnakeGame && !window.snakeGameManager) {
            const manager = new window.SnakeGame.SnakeGameManager();
            manager.init();
            window.snakeGameManager = manager;
        }
    });
}
