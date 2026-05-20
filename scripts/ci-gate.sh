#!/usr/bin/env bash
#
# Tetris 3D MVP CI 门禁（单元测试 + 打包 + 包体/CSP 扫描）
#
# 用法：
#   ./scripts/ci-gate.sh
#

set -euo pipefail

CYAN='\033[0;36m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

step() { echo -e "${BLUE}[STEP]${NC} $*"; }

main() {
    cd "$PROJECT_DIR"

    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════╗"
    echo "║  Tetris 3D MVP CI Gate                   ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"

    step "1/3 单元测试: tetris 3D MVP + tech-debt 预研套件"
    node --test \
        test/tetris-game-core.test.js \
        test/tetris-3d-voxel-mapper.test.js \
        test/tetris-3d-fx.test.js \
        test/tetris-3d-platform.test.js \
        test/tetris-3d-renderer.test.js \
        test/tetris-3d-game.test.js \
        test/tetris-rules-profile.test.js \
        test/tetris-srs-kicks.test.js \
        test/tetris-3d-phase2-prototype.test.js

    step "2/3 扩展打包: scripts/package.sh"
    ./scripts/package.sh

    step "3/3 包体/CSP 扫描: scripts/scan-package.sh"
    ./scripts/scan-package.sh

    echo ""
    echo -e "${GREEN}CI Gate 全部通过 ✓${NC}"
}

main "$@"
