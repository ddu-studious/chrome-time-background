(function attachTetrisSrsKicks(global) {
    'use strict';

    const profileRef =
        typeof require !== 'undefined'
            ? require('./tetris-rules-profile.js')
            : global.TetrisRulesProfile || {};

    const tetrisRef =
        typeof require !== 'undefined'
            ? require('./tetris-game.js')
            : global.TetrisGame || {};

    const getPieceCells = tetrisRef.getPieceCells;
    const { resolveProfile, getRotationModel } = profileRef;

    const JLSTZ_TYPES = new Set(['J', 'L', 'S', 'T', 'Z']);

    /**
     * @param {string} pieceType
     * @returns {'JLSTZ'|'I'|'O'}
     */
    function getKickTableGroup(pieceType) {
        if (pieceType === 'I') return 'I';
        if (pieceType === 'O') return 'O';
        if (JLSTZ_TYPES.has(pieceType)) return 'JLSTZ';
        throw new Error(`Unknown piece type for SRS kicks: ${pieceType}`);
    }

    /**
     * @param {Record<string, unknown>} profile
     * @param {string} pieceType
     * @param {number} fromRot
     * @param {'cw'|'ccw'} direction
     * @returns {{ toRot: number, tests: number[][] }}
     */
    function getRotationStep(profile, pieceType, fromRot, direction) {
        const model = getRotationModel(profile);
        if (!model) {
            return { toRot: fromRot, tests: [[0, 0]] };
        }

        const group = getKickTableGroup(pieceType);
        if (group === 'O') {
            return { toRot: fromRot, tests: [[0, 0]] };
        }

        if (model.wallKickPolicy === 'genericOffsets') {
            const toRot = direction === 'cw' ? (fromRot + 1) % 4 : (fromRot + 3) % 4;
            return {
                toRot,
                tests: model.genericKickOffsets || [[0, 0]]
            };
        }

        const tables = model.pieceSpecificKickTables || {};
        const table = tables[group];
        if (!table || !Array.isArray(table.rotateCwSteps)) {
            return {
                toRot: direction === 'cw' ? (fromRot + 1) % 4 : (fromRot + 3) % 4,
                tests: [[0, 0]]
            };
        }

        if (direction === 'cw') {
            const toRot = (fromRot + 1) % 4;
            const step = table.rotateCwSteps.find(s => s.from === fromRot && s.to === toRot);
            return { toRot, tests: step ? step.tests.slice() : [[0, 0]] };
        }

        const toRot = (fromRot + 3) % 4;
        const reverseCw = table.rotateCwSteps.find(s => s.from === toRot && s.to === fromRot);
        if (!reverseCw) {
            return { toRot, tests: [[0, 0]] };
        }
        // CCW：以 CW 逆迁移偏移取反（预研约定，见 issue-001 OQ）
        const tests = reverseCw.tests.map(([dx, dy]) => [-dx, -dy]);
        return { toRot, tests };
    }

    /**
     * @param {number[][]} board
     * @param {number} cols
     * @param {number} rows
     * @param {{ type: string, rotation: number, x: number, y: number }} piece
     * @returns {boolean}
     */
    function collides2D(board, cols, rows, piece) {
        const cells = getPieceCells(piece.type, piece.rotation, piece.x, piece.y);
        for (let i = 0; i < cells.length; i += 1) {
            const { x, y } = cells[i];
            if (x < 0 || x >= cols || y >= rows) return true;
            if (y >= 0 && board[y][x]) return true;
        }
        return false;
    }

    /**
     * @param {{ type: string, rotation: number, x: number, y: number }} piece
     * @param {number[][]} board
     * @param {number} cols
     * @param {number} rows
     * @param {Record<string, unknown>} profile
     * @param {'cw'|'ccw'} [direction]
     * @returns {{ success: boolean, piece: typeof piece|null, testsTried: number }}
     */
    function tryRotateWithProfile(piece, board, cols, rows, profile, direction) {
        const dir = direction || 'cw';
        const step = getRotationStep(profile, piece.type, piece.rotation, dir);

        for (let i = 0; i < step.tests.length; i += 1) {
            const [dx, dy] = step.tests[i];
            const candidate = {
                type: piece.type,
                rotation: step.toRot,
                x: piece.x + dx,
                y: piece.y + dy
            };
            if (!collides2D(board, cols, rows, candidate)) {
                return { success: true, piece: candidate, testsTried: i + 1 };
            }
        }

        return { success: false, piece: null, testsTried: step.tests.length };
    }

    /**
     * @param {Record<string, unknown>} bundle
     * @param {string} [profileId]
     * @returns {Record<string, unknown>|null}
     */
    function createSrsKickResolver(bundle, profileId) {
        const profile = resolveProfile(profileId, bundle);
        if (!profile) return null;

        return {
            profileId: profileId || bundle.recommendedProfileForMVP,
            profile,
            getRotationStep(pieceType, fromRot, direction) {
                return getRotationStep(profile, pieceType, fromRot, direction);
            },
            tryRotate(piece, board, cols, rows, direction) {
                return tryRotateWithProfile(piece, board, cols, rows, profile, direction);
            }
        };
    }

    const api = {
        JLSTZ_TYPES,
        getKickTableGroup,
        getRotationStep,
        collides2D,
        tryRotateWithProfile,
        createSrsKickResolver
    };

    global.TetrisSrsKicks = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
