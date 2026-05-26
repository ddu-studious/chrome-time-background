#!/usr/bin/env bash
#
# GraphSphere Demo 包体 / CSP 合规扫描（CI 门禁）
# 默认扫描 dist/ 下最新 graphsphere-demo-v*.zip
#
# 阈值（可通过环境变量覆盖）：
#   CI_KG3D_MAX_GZIP_BYTES   819200  (800 KB gzip 硬限，ADR-002)
#   CI_KG3D_MAX_ZIP_BYTES    2097152 (2 MB zip 硬限)
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

MAX_GZIP_BYTES="${CI_KG3D_MAX_GZIP_BYTES:-819200}"
MAX_ZIP_BYTES="${CI_KG3D_MAX_ZIP_BYTES:-2097152}"
SCAN_PROFILE="${CI_KG3D_SCAN_PROFILE:-release}"

REQUIRED_PATHS=(
    "index.html"
    "js/kg-graph-core.js"
    "js/kg-graph-host.js"
    "js/webgl-capability-probe.js"
    "vendor/three/three.module.min.js"
    "fixtures/graphsphere/demo-graph-a.json"
    "fixtures/graphsphere/demo-graph-b.json"
    "BUILD_INFO.json"
)

FORBIDDEN_PREFIXES=(
    "test/"
    "docs/"
    "cursor-bridge/"
    ".git/"
)

CSP_BLOCK_PATTERNS=(
    'cdn\.jsdelivr\.net/npm'
    'unpkg\.com/'
    'unsafe-eval'
)

resolve_zip() {
    if [[ $# -ge 1 && -n "${1:-}" ]]; then
        echo "$1"
        return
    fi
    local latest
    latest="$(ls -t "$PROJECT_DIR"/dist/graphsphere-demo-v*.zip 2>/dev/null | head -1 || true)"
    if [[ -z "$latest" ]]; then
        error "未找到 Demo zip，请先 ./scripts/package-kg3d-demo.sh"
        exit 1
    fi
    echo "$latest"
}

format_bytes() {
    local size="$1"
    if command -v bc &>/dev/null; then
        if [[ "$size" -ge 1048576 ]]; then
            echo "$(echo "scale=1; $size/1048576" | bc)MB"
        elif [[ "$size" -ge 1024 ]]; then
            echo "$(echo "scale=1; $size/1024" | bc)KB"
        else
            echo "${size}B"
        fi
    else
        echo "${size} bytes"
    fi
}

gzip_size() {
    gzip -c "$1" | wc -c | tr -d ' '
}

scan_zip() {
    local zip_path="$1"
    local extract_dir failures warnings gzip_total
    extract_dir="$(mktemp -d "${TMPDIR:-/tmp}/kg3d-scan.XXXXXX")"
    failures=0
    warnings=0

    cleanup() { [[ -n "${extract_dir:-}" && -d "$extract_dir" ]] && rm -rf "$extract_dir"; }
    trap cleanup RETURN

    [[ -f "$zip_path" ]] || { error "zip 不存在: $zip_path"; exit 1; }

    local zip_size
    zip_size=$(wc -c < "$zip_path" | tr -d ' ')

    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════╗"
    echo "║  GraphSphere Demo 包体 / CSP 扫描        ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"
    info "包: $zip_path"
    info "profile: $SCAN_PROFILE"
    info "zip 体积: $(format_bytes "$zip_size")"

    if [[ "$zip_size" -gt "$MAX_ZIP_BYTES" ]]; then
        error "zip 超限: $(format_bytes "$zip_size") > $(format_bytes "$MAX_ZIP_BYTES")"
        failures=$((failures + 1))
    else
        success "zip 体积在阈值内"
    fi

    unzip -q "$zip_path" -d "$extract_dir"

    info "必需文件..."
    for rel in "${REQUIRED_PATHS[@]}"; do
        if [[ ! -f "$extract_dir/$rel" ]]; then
            error "缺少: $rel"
            failures=$((failures + 1))
        else
            success "✓ $rel"
        fi
    done

    info "禁止目录..."
    for prefix in "${FORBIDDEN_PREFIXES[@]}"; do
        if find "$extract_dir" -path "$extract_dir/$prefix*" -print -quit 2>/dev/null | grep -q .; then
            error "不应包含: ${prefix}*"
            failures=$((failures + 1))
        fi
    done

    if [[ "$SCAN_PROFILE" == "stable" ]]; then
        info "稳定基线：不应含 draft fixture"
        if find "$extract_dir" -name '*draft*' -print -quit 2>/dev/null | grep -q .; then
            error "稳定包含 draft 文件"
            failures=$((failures + 1))
        fi
    fi

    info "gzip 包体审计（JS + HTML + JSON，不含 three.module.min.js 单独统计）..."
    gzip_total=0
    while IFS= read -r file; do
        local gz
        gz=$(gzip_size "$file")
        gzip_total=$((gzip_total + gz))
    done < <(find "$extract_dir" -type f \( -name '*.js' -o -name '*.html' -o -name '*.json' \) ! -path '*/vendor/three/*')

    local three_gz=0
    if [[ -f "$extract_dir/vendor/three/three.module.min.js" ]]; then
        three_gz=$(gzip_size "$extract_dir/vendor/three/three.module.min.js")
    fi
    local total_gz=$((gzip_total + three_gz))

    info "  kg 模块+页面 gzip: $(format_bytes "$gzip_total")"
    info "  three.module.min.js gzip: $(format_bytes "$three_gz")"
    info "  合计 gzip: $(format_bytes "$total_gz") (硬限 $(format_bytes "$MAX_GZIP_BYTES"))"

    if [[ "$total_gz" -gt "$MAX_GZIP_BYTES" ]]; then
        error "gzip 合计超限"
        failures=$((failures + 1))
    else
        success "gzip 门禁通过"
    fi

    info "CSP / 远程脚本..."
    local scan_files=()
    while IFS= read -r file; do scan_files+=("$file"); done \
        < <(find "$extract_dir" -type f \( -name '*.html' -o -name '*.js' \))

    for pattern in "${CSP_BLOCK_PATTERNS[@]}"; do
        local hits
        hits=$(rg -n "$pattern" "${scan_files[@]}" 2>/dev/null || true)
        if [[ -n "$hits" ]]; then
            error "CSP 违规 /$pattern/"
            echo "$hits" | head -10
            failures=$((failures + 1))
        fi
    done

    local remote_hits
    remote_hits=$(rg -n "<script[^>]+src=[\"']https?://" "${scan_files[@]}" 2>/dev/null || true)
    if [[ -n "$remote_hits" ]]; then
        error "远程 script src 禁止"
        echo "$remote_hits" | head -10
        failures=$((failures + 1))
    fi

    if [[ "$failures" -eq 0 ]]; then
        success "CSP 扫描通过"
    fi

    info "GraphSnapshot JSON 校验..."
    if ! "$PROJECT_DIR/scripts/validate-demo-graph-json.sh" \
        "$extract_dir/fixtures/graphsphere/demo-graph-a.json" release; then
        failures=$((failures + 1))
    fi
    if ! "$PROJECT_DIR/scripts/validate-demo-graph-json.sh" \
        "$extract_dir/fixtures/graphsphere/demo-graph-b.json" release; then
        failures=$((failures + 1))
    fi

    echo ""
    echo -e "${CYAN}── 摘要 ──${NC}"
    echo "  错误: $failures  警告: $warnings"

    if [[ "$failures" -gt 0 ]]; then
        echo ""
        error "扫描失败（${failures} 项）"
        exit 1
    fi

    success "GraphSphere Demo 扫描全部通过"
    cleanup
    trap - RETURN
}

main() {
    cd "$PROJECT_DIR"
    scan_zip "$(resolve_zip "${1:-}")"
}

main "$@"
