#!/usr/bin/env bash
#
# 扩展包体 / CSP 合规扫描（CI 门禁）
# 扫描对象：scripts/package.sh 产出的 .zip（默认 dist/ 下最新包）
#
# 用法：
#   ./scripts/scan-package.sh
#   ./scripts/scan-package.sh dist/chrome-time-background-v3.16.0.zip
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

# ===== 阈值（可通过环境变量覆盖） =====
MAX_ZIP_BYTES="${CI_GATE_MAX_ZIP_BYTES:-12582912}"          # 12 MB
WARN_ZIP_BYTES="${CI_GATE_WARN_ZIP_BYTES:-8388608}"         # 8 MB
MAX_THREE_MIN_BYTES="${CI_GATE_MAX_THREE_MIN_BYTES:-786432}"  # 768 KB

# CI_SCAN_PROFILE=mvp   — Tetris 3D MVP 发布包（默认）
# CI_SCAN_PROFILE=stable — L2 回滚基线包（无 3D / Three.js）
SCAN_PROFILE="${CI_SCAN_PROFILE:-mvp}"

if [[ "$SCAN_PROFILE" == "stable" ]]; then
    REQUIRED_ZIP_PATHS=(
        "manifest.json"
        "index.html"
        "js/tetris-game.js"
    )
    FORBIDDEN_ZIP_SUBSTRINGS=(
        "tetris-3d"
        "vendor/three/"
    )
else
    REQUIRED_ZIP_PATHS=(
        "manifest.json"
        "index.html"
        "js/tetris-3d-voxel-mapper.js"
        "vendor/three/three.module.min.js"
    )
    FORBIDDEN_ZIP_SUBSTRINGS=()
fi

FORBIDDEN_ZIP_PREFIXES=(
    "cursor-bridge/node_modules/"
    "test/"
    "docs/"
    ".git/"
)

# 阻塞：运行时远程脚本 / CSP 违规特征（排除 vendor 内注释误报用更精确模式）
CSP_BLOCK_PATTERNS=(
    'cdn\.jsdelivr\.net/npm'
    'unpkg\.com/'
    'unsafe-eval'
)

resolve_zip_path() {
    if [[ $# -ge 1 && -n "${1:-}" ]]; then
        echo "$1"
        return
    fi
    local latest
    latest="$(ls -t "$PROJECT_DIR"/dist/chrome-time-background-v*.zip 2>/dev/null | head -1 || true)"
    if [[ -z "$latest" ]]; then
        error "未找到 zip 包，请先执行 ./scripts/package.sh"
        exit 1
    fi
    echo "$latest"
}

format_bytes() {
    local size="$1"
    if [[ "$size" -ge 1048576 ]]; then
        echo "$(echo "scale=1; $size/1048576" | bc)MB"
    elif [[ "$size" -ge 1024 ]]; then
        echo "$(echo "scale=1; $size/1024" | bc)KB"
    else
        echo "${size}B"
    fi
}

scan_zip() {
    local zip_path="$1"
    local extract_dir
    extract_dir="$(mktemp -d "${TMPDIR:-/tmp}/chrome-ext-scan.XXXXXX")"
    local failures=0
    local warnings=0

    cleanup() {
        if [[ -n "${extract_dir:-}" && -d "$extract_dir" ]]; then
            rm -rf "$extract_dir"
        fi
    }
    trap cleanup RETURN

    if [[ ! -f "$zip_path" ]]; then
        error "zip 不存在: $zip_path"
        exit 1
    fi

    local zip_size
    zip_size=$(wc -c < "$zip_path" | tr -d ' ')

    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════╗"
    echo "║     扩展包体 / CSP 扫描 🔍               ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"
    info "扫描包: $zip_path"
    info "扫描配置: CI_SCAN_PROFILE=$SCAN_PROFILE"
    info "包体大小: $(format_bytes "$zip_size")"

    if [[ "$zip_size" -gt "$MAX_ZIP_BYTES" ]]; then
        error "包体超限: $(format_bytes "$zip_size") > $(format_bytes "$MAX_ZIP_BYTES")"
        failures=$((failures + 1))
    elif [[ "$zip_size" -gt "$WARN_ZIP_BYTES" ]]; then
        warn "包体偏大: $(format_bytes "$zip_size") > $(format_bytes "$WARN_ZIP_BYTES")（未超硬限）"
        warnings=$((warnings + 1))
    else
        success "包体大小在阈值内"
    fi

    info "解压并扫描内容..."
    unzip -q "$zip_path" -d "$extract_dir"

    info "检查必需文件..."
    for rel in "${REQUIRED_ZIP_PATHS[@]}"; do
        if [[ ! -f "$extract_dir/$rel" ]]; then
            error "缺少必需文件: $rel"
            failures=$((failures + 1))
        else
            success "✓ $rel"
        fi
    done

    info "检查禁止目录..."
    for prefix in "${FORBIDDEN_ZIP_PREFIXES[@]}"; do
        if find "$extract_dir" -path "$extract_dir/$prefix*" -print -quit 2>/dev/null | grep -q .; then
            error "包内不应包含: ${prefix}*"
            failures=$((failures + 1))
        fi
    done
    if [[ "$failures" -eq 0 ]]; then
        success "未发现禁止目录"
    fi

    if [[ ${#FORBIDDEN_ZIP_SUBSTRINGS[@]} -gt 0 ]]; then
        info "检查稳定基线禁止路径 (profile=${SCAN_PROFILE})..."
        for sub in "${FORBIDDEN_ZIP_SUBSTRINGS[@]}"; do
            if find "$extract_dir" -path "*${sub}*" -print -quit 2>/dev/null | grep -q .; then
                error "稳定包不应包含: *${sub}*"
                failures=$((failures + 1))
            fi
        done
        if [[ "$failures" -eq 0 ]]; then
            success "稳定基线路径检查通过"
        fi
    fi

    local three_min="$extract_dir/vendor/three/three.module.min.js"
    if [[ -f "$three_min" ]]; then
        local three_size
        three_size=$(wc -c < "$three_min" | tr -d ' ')
        info "Three.js min 体积: $(format_bytes "$three_size")"
        if [[ "$three_size" -gt "$MAX_THREE_MIN_BYTES" ]]; then
            error "vendor/three/three.module.min.js 超限: $(format_bytes "$three_size")"
            failures=$((failures + 1))
        fi
        if [[ -f "$extract_dir/vendor/three/three.module.js" ]]; then
            warn "同时包含 three.module.js 与 min 版，建议仅打包 min 以减小体积"
            warnings=$((warnings + 1))
        fi
    fi

    info "CSP / 远程脚本扫描..."
    local scan_files=()
    while IFS= read -r file; do
        scan_files+=("$file")
    done < <(find "$extract_dir" -type f \( -name '*.html' -o -name '*.js' -o -name '*.css' \))

    for pattern in "${CSP_BLOCK_PATTERNS[@]}"; do
        local hits
        hits=$(rg -n "$pattern" "${scan_files[@]}" 2>/dev/null || true)
        if [[ -n "$hits" ]]; then
            error "发现 CSP 违规模式 /$pattern/:"
            echo "$hits" | head -20
            failures=$((failures + 1))
        fi
    done

    local remote_script_hits
    remote_script_hits=$(rg -n "<script[^>]+src=[\"']https?://" "${scan_files[@]}" 2>/dev/null || true)
    if [[ -n "$remote_script_hits" ]]; then
        error "HTML 中存在远程 script src（MV3 CSP 禁止）:"
        echo "$remote_script_hits" | head -20
        failures=$((failures + 1))
    fi

    if [[ "$failures" -eq 0 ]]; then
        success "CSP / 远程脚本扫描通过"
    fi

    info "VENDOR.lock 校验..."
    local lock_file="$PROJECT_DIR/vendor/VENDOR.lock.md"
    if [[ ! -f "$lock_file" ]]; then
        warn "缺少 vendor/VENDOR.lock.md（供应链锁定文档）"
        warnings=$((warnings + 1))
    elif [[ -f "$three_min" ]] && command -v shasum &>/dev/null; then
        local actual_sha
        actual_sha=$(shasum -a 256 "$three_min" | awk '{print $1}')
        if rg -q "$actual_sha" "$lock_file"; then
            success "Three.js SHA256 与 VENDOR.lock.md 一致"
        else
            error "Three.js SHA256 与 VENDOR.lock.md 不匹配: $actual_sha"
            failures=$((failures + 1))
        fi
    fi

    echo ""
    echo -e "${CYAN}── 扫描摘要 ──${NC}"
    echo -e "  包体: $(format_bytes "$zip_size")"
    echo -e "  错误: ${failures}"
    echo -e "  警告: ${warnings}"

    if [[ "$failures" -gt 0 ]]; then
        echo ""
        error "包体/CSP 扫描失败（${failures} 项阻塞）"
        exit 1
    fi

    echo ""
    success "包体/CSP 扫描全部通过"
    if [[ "$warnings" -gt 0 ]]; then
        warn "存在 ${warnings} 项警告，请在下个迭代处理"
    fi
}

main() {
    cd "$PROJECT_DIR"
    local zip_path
    zip_path="$(resolve_zip_path "${1:-}")"
    scan_zip "$zip_path"
}

main "$@"
