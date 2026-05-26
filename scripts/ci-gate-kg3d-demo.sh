#!/usr/bin/env bash
#
# GraphSphere v0.1 Demo — CI 门禁
# 单元测试 + GraphSnapshot 校验 + 静态包打包 + 包体/CSP 扫描
#
# 用法：
#   ./scripts/ci-gate-kg3d-demo.sh
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
    echo "║  GraphSphere Demo CI Gate                ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"

    step "1/4 单元测试: kg-graph core / layout / renderer"
    node --test \
        test/kg-graph-core.test.js \
        test/kg-graph-layout.test.js \
        test/kg-graph-renderer.test.js

    step "2/4 GraphSnapshot 校验: validate-demo-graph-json.sh"
    ./scripts/validate-demo-graph-json.sh

    step "3/4 静态 Demo 打包: package-kg3d-demo.sh"
    ./scripts/package-kg3d-demo.sh

    step "4/4 包体/CSP 扫描: scan-kg3d-demo.sh"
    ./scripts/scan-kg3d-demo.sh

    echo ""
    echo -e "${GREEN}GraphSphere Demo CI Gate 全部通过 ✓${NC}"
}

main "$@"
