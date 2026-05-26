#!/usr/bin/env bash
#
# GraphSnapshot JSON 门禁 — 校验 test/fixtures/graphsphere 与 releases 归档副本
#
# 用法：
#   ./scripts/validate-demo-graph-json.sh
#   ./scripts/validate-demo-graph-json.sh path/to/demo-graph-a.json
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
fail()    { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

VALIDATE_NODE="$SCRIPT_DIR/validate-demo-graph-json.mjs"

run_validate() {
    local file="$1"
    local preset="${2:-release}"
    node "$VALIDATE_NODE" "$file" "$preset"
}

main() {
    cd "$PROJECT_DIR"

    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════╗"
    echo "║  GraphSnapshot JSON 校验                 ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"

    if [[ $# -ge 1 ]]; then
        run_validate "$1" "${2:-release}"
        success "校验通过: $1"
        exit 0
    fi

    local failures=0

    info "Release 场景（L2-P0 preset）..."
    for f in \
        test/fixtures/graphsphere/scenario-a-chrome-bridge.json \
        test/fixtures/graphsphere/scenario-b-ai-stack.json \
        test/fixtures/graphsphere/minimal-valid.json; do
        if [[ ! -f "$f" ]]; then
            fail "缺少 fixture: $f"
        fi
        if run_validate "$f" release; then
            success "✓ $f"
        else
            failures=$((failures + 1))
        fi
    done

    info "Draft 场景（L0+L1 preset，跳过 L2 节点上限）..."
    for f in test/fixtures/graphsphere/*-draft.json; do
        [[ -f "$f" ]] || continue
        if run_validate "$f" draft; then
            success "✓ $f"
        else
            failures=$((failures + 1))
        fi
    done

    local archive_dir="$PROJECT_DIR/releases/kg3d-demo/demo-graph-archives"
    if [[ -d "$archive_dir" ]]; then
        info "已归档 demo-graph 副本..."
        for f in "$archive_dir"/demo-graph-*.json; do
            [[ -f "$f" ]] || continue
            if run_validate "$f" release; then
                success "✓ $(basename "$f")"
            else
                failures=$((failures + 1))
            fi
        done
    fi

    if [[ "$failures" -gt 0 ]]; then
        fail "${failures} 个 JSON 文件校验失败"
    fi

    success "全部 GraphSnapshot JSON 校验通过"
}

main "$@"
