#!/usr/bin/env bash
#
# GraphSphere Demo — 静态部署（本地目录 / rsync / scp）
#
# 用法:
#   ./scripts/deploy-kg3d-demo.sh --target /var/www/graphsphere-demo
#   ./scripts/deploy-kg3d-demo.sh --target user@host:/var/www/graphsphere --rsync
#   ./scripts/deploy-kg3d-demo.sh --dry-run
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
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

TARGET=""
USE_RSYNC=false
DRY_RUN=false
SKIP_GATE=false
DEMO_VERSION="${KG3D_DEMO_VERSION:-0.1.0}"

usage() {
    cat <<EOF
GraphSphere 静态 Demo 部署

选项:
  --target PATH   部署目标（本地目录或 user@host:path）
  --rsync         使用 rsync（远程或本地同步）
  --version VER   Demo 版本
  --skip-gate     跳过 CI gate（仅紧急回滚）
  --dry-run       预览
  -h, --help      帮助
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --target) TARGET="$2"; shift 2 ;;
        --rsync) USE_RSYNC=true; shift ;;
        --version) DEMO_VERSION="$2"; shift 2 ;;
        --skip-gate) SKIP_GATE=true; shift ;;
        --dry-run) DRY_RUN=true; shift ;;
        -h|--help) usage ;;
        *) error "未知参数: $1" ;;
    esac
done

main() {
    echo -e "${CYAN}═══ GraphSphere Demo 部署 ═══${NC}"

    if ! $SKIP_GATE; then
        info "CI 门禁..."
        "$PROJECT_DIR/scripts/ci-gate-kg3d-demo.sh"
    else
        warn "跳过 CI gate（仅用于 L2 紧急回滚）"
        "$PROJECT_DIR/scripts/package-kg3d-demo.sh" --version "$DEMO_VERSION"
    fi

    local staging="$PROJECT_DIR/dist/kg3d-demo-staging"
    [[ -d "$staging/index.html" || -f "$staging/index.html" ]] || error "staging 不存在: $staging"

    if [[ -z "$TARGET" ]]; then
        success "打包就绪: $staging"
        info "本地预览: npx serve -p 8765 $staging"
        info "指定 --target 以部署到目录或远程"
        exit 0
    fi

    if $DRY_RUN; then
        info "dry-run → $TARGET"
        exit 0
    fi

    if $USE_RSYNC; then
        command -v rsync >/dev/null 2>&1 || error "需要 rsync"
        info "rsync → $TARGET"
        rsync -av --delete "$staging/" "$TARGET/"
    else
        [[ -d "$TARGET" || "$TARGET" != *:* ]] || error "远程目标请使用 --rsync"
        info "cp → $TARGET"
        mkdir -p "$TARGET"
        rsync -a --delete "$staging/" "$TARGET/"
    fi

    success "部署完成 → $TARGET"
    info "健康检查: curl -sf \$HOST/index.html | head -1"
    info "降级冒烟: \$HOST/index.html?force2d=1"
}

main "$@"
