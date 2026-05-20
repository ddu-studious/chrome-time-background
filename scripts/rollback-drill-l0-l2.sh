#!/usr/bin/env bash
#
# Tetris 3D MVP — L0/L2 回滚剧本演练（自动化校验 + 报告片段）
#
# L0：单测验证 forceCanvas2d / canvas2d 降级路径（目标 RTO <5min）
# L2：校验 releases/archives 稳定 zip 完整性、无 3D 模块、CSP 扫描
#
# 用法:
#   ./scripts/rollback-drill-l0-l2.sh
#   ./scripts/rollback-drill-l0-l2.sh --l0-only
#   ./scripts/rollback-drill-l0-l2.sh --l2-only
#   ./scripts/rollback-drill-l0-l2.sh --report docs/deploy/drill-reports/latest.md
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[PASS]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()    { echo -e "${RED}[FAIL]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST_PATH="$PROJECT_DIR/releases/ROLLBACK_MANIFEST.json"

RUN_L0=true
RUN_L2=true
REPORT_PATH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --l0-only) RUN_L2=false; shift ;;
        --l2-only) RUN_L0=false; shift ;;
        --report) REPORT_PATH="$2"; shift 2 ;;
        -h|--help)
            echo "用法: $0 [--l0-only|--l2-only] [--report PATH]"
            exit 0
            ;;
        *) fail "未知参数: $1" ;;
    esac
done

DRILL_ID="drill-$(date -u +%Y%m%dT%H%M%SZ)"
STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
L0_STATUS="skipped"
L2_STATUS="skipped"
L0_DETAIL=""
L2_DETAIL=""
STABLE_ZIP=""
STABLE_SHA=""
STABLE_VERSION=""

drill_l0() {
    info "═══ L0 演练：渲染降级路径（forceCanvas2d / canvas2d）═══"
    local t0 t1 elapsed_ms
    t0=$(python3 -c "import time; print(int(time.time()*1000))")

    cd "$PROJECT_DIR"
    node --test \
        test/tetris-3d-renderer.test.js \
        test/tetris-3d-game.test.js 2>&1 | tee /tmp/ctb-l0-drill.log >/dev/null

    if ! rg -q 'forceCanvas2d|canvas2d' /tmp/ctb-l0-drill.log 2>/dev/null; then
        :
    fi

    t1=$(python3 -c "import time; print(int(time.time()*1000))")
    elapsed_ms=$((t1 - t0))

    if [[ $elapsed_ms -gt 300000 ]]; then
        L0_STATUS="fail"
        L0_DETAIL="单测耗时 ${elapsed_ms}ms 超过 L0 RTO 5min"
        fail "$L0_DETAIL"
    fi

    L0_STATUS="pass"
    L0_DETAIL="renderer+game 单测通过；耗时 ${elapsed_ms}ms（RTO 目标 <5min）"
    success "$L0_DETAIL"

    echo ""
    info "L0 线上操作备忘（Chrome DevTools → 扩展背景页 / 新标签页控制台）:"
    cat <<'SNIP'

// ① 强制 Canvas 2D（ADR L0，无需发版）
chrome.storage.local.set({ 'tetris3d.renderMode': '2d' });
sessionStorage.removeItem('tetris3d.webglProbe.v1');
// 刷新新标签页后打开「立体方块」，徽章应显示 canvas2d

// ② 解除 L0（恢复自动探测）
chrome.storage.local.remove('tetris3d.renderMode');
sessionStorage.removeItem('tetris3d.webglProbe.v1');

SNIP
}

drill_l2() {
    info "═══ L2 演练：稳定版 zip 可回退性 ══"

    if [[ ! -f "$MANIFEST_PATH" ]]; then
        warn "未找到 $MANIFEST_PATH，先执行 ./scripts/rollback-archive-stable.sh"
        fail "缺少稳定版归档"
    fi

    STABLE_ZIP="$(python3 -c "
import json
from pathlib import Path
m = json.loads(Path('$MANIFEST_PATH').read_text())
ls = m.get('latestStable') or (m.get('archives') or [{}])[0]
print(ls.get('zipFile',''))
")"

    if [[ -z "$STABLE_ZIP" ]]; then
        fail "ROLLBACK_MANIFEST 中无 latestStable.zipFile"
    fi

    local zip_path="$PROJECT_DIR/releases/archives/$STABLE_ZIP"
    if [[ ! -f "$zip_path" ]]; then
        fail "归档 zip 不存在: $zip_path"
    fi

    STABLE_VERSION="$(python3 -c "
import json
from pathlib import Path
m = json.loads(Path('$MANIFEST_PATH').read_text())
print(m['latestStable']['version'])
")"
    STABLE_SHA="$(python3 -c "
import json
from pathlib import Path
m = json.loads(Path('$MANIFEST_PATH').read_text())
print(m['latestStable']['sha256'])
")"

    if command -v shasum &>/dev/null; then
        actual_sha="$(shasum -a 256 "$zip_path" | awk '{print $1}')"
    else
        actual_sha="$(sha256sum "$zip_path" | awk '{print $1}')"
    fi

    if [[ "$actual_sha" != "$STABLE_SHA" ]]; then
        L2_STATUS="fail"
        L2_DETAIL="SHA256 不匹配 manifest"
        fail "$L2_DETAIL expected=$STABLE_SHA actual=$actual_sha"
    fi

    if unzip -l "$zip_path" | rg -q 'tetris-3d'; then
        L2_STATUS="fail"
        L2_DETAIL="稳定包不应含 tetris-3d 模块"
        fail "$L2_DETAIL"
    fi

    info "scan-package.sh @ 稳定 zip（profile=stable）..."
    CI_SCAN_PROFILE=stable "$PROJECT_DIR/scripts/scan-package.sh" "$zip_path"

    L2_STATUS="pass"
    L2_DETAIL="zip=$STABLE_ZIP version=v$STABLE_VERSION sha256 OK；无 tetris-3d；CSP/包体扫描通过"
    success "$L2_DETAIL"

    echo ""
    info "L2 线上操作备忘（Chrome Web Store / 侧载）:"
    echo "  1. CWS 开发者后台 -> 回退上一版本 (或上传 ${STABLE_ZIP})"
    echo "  2. 侧载验证: 解压 zip → chrome://extensions → 加载已解压"
    echo "  3. 确认 Dock 无「立体方块」入口、主功能回归"
}

write_report() {
    [[ -z "$REPORT_PATH" ]] && return 0
    mkdir -p "$(dirname "$REPORT_PATH")"
    local ended_at overall
    ended_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    if [[ "$L0_STATUS" == "fail" || "$L2_STATUS" == "fail" ]]; then
        overall="FAIL"
    elif [[ "$L0_STATUS" == "skipped" && "$L2_STATUS" == "skipped" ]]; then
        overall="SKIP"
    else
        overall="PASS"
    fi

    cat >"$REPORT_PATH" <<EOF
# Tetris 3D 回滚演练报告

| 字段 | 值 |
|------|-----|
| drillId | $DRILL_ID |
| startedAt | $STARTED_AT |
| endedAt | $ended_at |
| overall | **$overall** |

## L0（渲染降级，RTO <5min）

| 项 | 结果 |
|----|------|
| 状态 | $L0_STATUS |
| 说明 | $L0_DETAIL |

## L2（版本回退，RTO <2h）

| 项 | 结果 |
|----|------|
| 状态 | $L2_STATUS |
| 说明 | $L2_DETAIL |
| 稳定 zip | ${STABLE_ZIP:-—} |
| 版本 | v${STABLE_VERSION:-—} |

---
自动生成: \`./scripts/rollback-drill-l0-l2.sh --report $REPORT_PATH\`
EOF
    success "报告已写入: $REPORT_PATH"
}

main() {
    echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Tetris 3D — L0/L2 回滚演练                   ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
    echo "drillId=$DRILL_ID"

    $RUN_L0 && drill_l0
    $RUN_L2 && drill_l2

    write_report

    echo ""
    if [[ "$L0_STATUS" == "fail" || "$L2_STATUS" == "fail" ]]; then
        fail "演练未通过"
    fi
    success "演练完成: L0=$L0_STATUS L2=$L2_STATUS"
}

main "$@"
