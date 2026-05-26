#!/usr/bin/env bash
#
# GraphSphere Demo — L0/L2 回滚剧本演练
#
# L0：2D 降级路径单测 + 运维开关备忘（RTO <5min）
# L2：稳定 demo zip SHA256 + scan + demo-graph manifest 一致性
#
# 用法:
#   ./scripts/rollback-drill-kg3d-l0-l2.sh
#   ./scripts/rollback-drill-kg3d-l0-l2.sh --l0-only
#   ./scripts/rollback-drill-kg3d-l0-l2.sh --report docs/deploy/drill-reports/kg3d-latest.md
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
MANIFEST_PATH="$PROJECT_DIR/releases/kg3d-demo/ROLLBACK_MANIFEST.json"
GRAPH_MANIFEST="$PROJECT_DIR/releases/kg3d-demo/DEMO_GRAPH_MANIFEST.json"

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

DRILL_ID="kg3d-drill-$(date -u +%Y%m%dT%H%M%SZ)"
STARTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
L0_STATUS="skipped"
L2_STATUS="skipped"
L0_DETAIL=""
L2_DETAIL=""
STABLE_ZIP=""
STABLE_VERSION=""

drill_l0() {
    info "═══ L0：2D 降级路径（forceCanvas2d / ?force2d=1）═══"
    local t0 t1 elapsed_ms
    t0=$(python3 -c "import time; print(int(time.time()*1000))")

    cd "$PROJECT_DIR"
    node --test test/kg-graph-renderer.test.js 2>&1 | tee /tmp/kg3d-l0-drill.log >/dev/null

    if ! rg -q 'forceCanvas2d|canvas2d' /tmp/kg3d-l0-drill.log 2>/dev/null; then
        warn "单测日志未命中 forceCanvas2d 关键字（非阻塞）"
    fi

    t1=$(python3 -c "import time; print(int(time.time()*1000))")
    elapsed_ms=$((t1 - t0))

    [[ $elapsed_ms -le 300000 ]] || fail "L0 单测耗时 ${elapsed_ms}ms 超过 5min RTO"

    L0_STATUS="pass"
    L0_DETAIL="kg-graph-renderer 单测通过；耗时 ${elapsed_ms}ms"
    success "$L0_DETAIL"

    echo ""
    info "L0 线上操作备忘:"
    cat <<'SNIP'

# ① URL 参数（静态托管，无需发版）
https://<demo-host>/index.html?force2d=1

# ② 浏览器控制台（持久化降级偏好）
localStorage.setItem('graphsphere.renderMode', '2d');
sessionStorage.removeItem('tetris3d.webglProbe.v1');
location.reload();

# ③ 解除 L0
localStorage.removeItem('graphsphere.renderMode');
sessionStorage.removeItem('tetris3d.webglProbe.v1');
location.reload();

SNIP
}

drill_l2() {
    info "═══ L2：稳定 Demo zip 可回退性 ═══"

    [[ -f "$MANIFEST_PATH" ]] || fail "缺少 $MANIFEST_PATH — 先执行 ./scripts/rollback-archive-kg3d-demo.sh"

    STABLE_ZIP="$(python3 -c "
import json
from pathlib import Path
m = json.loads(Path('$MANIFEST_PATH').read_text())
print(m['latestStable']['zipFile'])
")"

    STABLE_VERSION="$(python3 -c "
import json
from pathlib import Path
m = json.loads(Path('$MANIFEST_PATH').read_text())
print(m['latestStable']['version'])
")"

    local expected_sha zip_path actual_sha
    expected_sha="$(python3 -c "
import json
from pathlib import Path
m = json.loads(Path('$MANIFEST_PATH').read_text())
print(m['latestStable']['sha256'])
")"

    zip_path="$PROJECT_DIR/releases/kg3d-demo/archives/$STABLE_ZIP"
    [[ -f "$zip_path" ]] || fail "归档 zip 不存在: $zip_path"

    if command -v shasum &>/dev/null; then
        actual_sha="$(shasum -a 256 "$zip_path" | awk '{print $1}')"
    else
        actual_sha="$(sha256sum "$zip_path" | awk '{print $1}')"
    fi

    [[ "$actual_sha" == "$expected_sha" ]] || fail "SHA256 不匹配 expected=$expected_sha actual=$actual_sha"

    info "scan-kg3d-demo.sh @ stable zip..."
    CI_KG3D_SCAN_PROFILE=stable "$PROJECT_DIR/scripts/scan-kg3d-demo.sh" "$zip_path"

    if [[ -f "$GRAPH_MANIFEST" ]]; then
        info "DEMO_GRAPH_MANIFEST 存在，校验 bundle 条目..."
        python3 -c "
import json
from pathlib import Path
p = Path('$GRAPH_MANIFEST')
d = json.loads(p.read_text())
assert d.get('latest', {}).get('files'), 'latest bundle 缺少 files'
print('demo-graph bundle OK:', d['latest']['demoVersion'])
"
    else
        warn "未找到 DEMO_GRAPH_MANIFEST — 建议 ./scripts/archive-demo-graph-json.sh"
    fi

    L2_STATUS="pass"
    L2_DETAIL="zip=$STABLE_ZIP v$STABLE_VERSION sha256 OK；scan stable 通过"
    success "$L2_DETAIL"

    echo ""
    info "L2 线上操作备忘:"
    echo "  1. 静态托管回滚：部署 releases/kg3d-demo/archives/${STABLE_ZIP} 解压目录"
    echo "  2. 或 CDN/Vercel：回退至 tag $(python3 -c "import json; print(json.load(open('$MANIFEST_PATH'))['latestStable'].get('gitTag') or 'stable/*')")"
    echo "  3. 冒烟：index.html 加载 · 场景 A/B 切换 · ?force2d=1 降级"
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
# GraphSphere Demo 回滚演练报告

| 字段 | 值 |
|------|-----|
| drillId | $DRILL_ID |
| startedAt | $STARTED_AT |
| endedAt | $ended_at |
| overall | **$overall** |

## L0（2D 降级，RTO <5min）

| 项 | 结果 |
|----|------|
| 状态 | $L0_STATUS |
| 说明 | $L0_DETAIL |

## L2（静态 Demo 回退，RTO <2h）

| 项 | 结果 |
|----|------|
| 状态 | $L2_STATUS |
| 说明 | $L2_DETAIL |
| 稳定 zip | ${STABLE_ZIP:-—} |
| 版本 | v${STABLE_VERSION:-—} |

---
自动生成: \`./scripts/rollback-drill-kg3d-l0-l2.sh --report $REPORT_PATH\`
EOF
    success "报告: $REPORT_PATH"
}

main() {
    echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  GraphSphere Demo — L0/L2 回滚演练            ║${NC}"
    echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
    echo "drillId=$DRILL_ID"

    $RUN_L0 && drill_l0
    $RUN_L2 && drill_l2
    write_report

    echo ""
    [[ "$L0_STATUS" != "fail" && "$L2_STATUS" != "fail" ]] || fail "演练未通过"
    success "演练完成: L0=$L0_STATUS L2=$L2_STATUS"
}

main "$@"
