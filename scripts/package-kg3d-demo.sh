#!/usr/bin/env bash
#
# GraphSphere v0.1 — 静态 Demo 打包
# 产出可托管的 zip（根目录 index.html + 相对路径资源）
#
# 用法：
#   ./scripts/package-kg3d-demo.sh
#   ./scripts/package-kg3d-demo.sh --version 0.1.0 --output dist
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
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DEMO_VERSION="${KG3D_DEMO_VERSION:-0.1.0}"
OUTPUT_DIR="$PROJECT_DIR/dist"
GIT_REF="HEAD"
DRY_RUN=false

usage() {
    cat <<EOF
GraphSphere 静态 Demo 打包

选项:
  --version VER   Demo 语义版本（默认 0.1.0）
  --ref REF       git 引用（默认 HEAD）
  --output DIR    输出目录（默认 dist/）
  --dry-run       仅预览
  -h, --help      帮助
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --version) DEMO_VERSION="$2"; shift 2 ;;
        --ref) GIT_REF="$2"; shift 2 ;;
        --output) OUTPUT_DIR="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        -h|--help) usage ;;
        *) error "未知参数: $1" ;;
    esac
done

require_file() {
    local root="$1" rel="$2"
    [[ -f "$root/$rel" ]] || error "缺少源文件: $rel"
}

assemble_package() {
    local src_root="$1"
    local dest_root="$2"

    require_file "$src_root" "test/demos/knowledge-graph-3d-demo.html"
    require_file "$src_root" "test/fixtures/graphsphere/scenario-a-chrome-bridge.json"
    require_file "$src_root" "test/fixtures/graphsphere/scenario-b-ai-stack.json"
    require_file "$src_root" "js/kg-graph-core.js"
    require_file "$src_root" "vendor/three/three.module.min.js"

    mkdir -p "$dest_root/js" "$dest_root/vendor/three" "$dest_root/fixtures/graphsphere"

    cp "$src_root/js/kg-graph-core.js" \
       "$src_root/js/kg-graph-layout.js" \
       "$src_root/js/kg-graph-3d-renderer.js" \
       "$src_root/js/kg-graph-2d-renderer.js" \
       "$src_root/js/kg-graph-host.js" \
       "$src_root/js/webgl-capability-probe.js" \
       "$dest_root/js/"

    cp "$src_root/vendor/three/three.module.min.js" "$dest_root/vendor/three/"
    [[ -f "$src_root/vendor/VENDOR.lock.md" ]] && \
        cp "$src_root/vendor/VENDOR.lock.md" "$dest_root/vendor/" || true

    cp "$src_root/test/fixtures/graphsphere/scenario-a-chrome-bridge.json" \
       "$dest_root/fixtures/graphsphere/demo-graph-a.json"
    cp "$src_root/test/fixtures/graphsphere/scenario-b-ai-stack.json" \
       "$dest_root/fixtures/graphsphere/demo-graph-b.json"

    sed \
        -e 's|\.\./\.\./js/|./js/|g' \
        -e 's|\.\./\.\./vendor/three/|./vendor/three/|g' \
        -e 's|\.\./fixtures/graphsphere/scenario-a-chrome-bridge\.json|./fixtures/graphsphere/demo-graph-a.json|g' \
        -e 's|\.\./fixtures/graphsphere/scenario-b-ai-stack\.json|./fixtures/graphsphere/demo-graph-b.json|g' \
        -e "s|scenario-a-chrome-bridge|demo-graph-a|g" \
        -e "s|scenario-b-ai-stack|demo-graph-b|g" \
        "$src_root/test/demos/knowledge-graph-3d-demo.html" > "$dest_root/index.html"
}

write_build_info() {
    local dest_root="$1"
    local commit short_sha built_at
    commit="$(git -C "$PROJECT_DIR" rev-parse "$GIT_REF^{commit}")"
    short_sha="${commit:0:12}"
    built_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    cat >"$dest_root/BUILD_INFO.json" <<EOF
{
  "product": "graphsphere-demo",
  "version": "$DEMO_VERSION",
  "gitRef": "$GIT_REF",
  "gitCommit": "$commit",
  "builtAt": "$built_at",
  "entry": "index.html",
  "fixtures": [
    "fixtures/graphsphere/demo-graph-a.json",
    "fixtures/graphsphere/demo-graph-b.json"
  ]
}
EOF

    cat >"$dest_root/VERSION.txt" <<EOF
GraphSphere Demo v${DEMO_VERSION}
commit=${short_sha}
built=${built_at}
EOF
}

main() {
    echo -e "${CYAN}═══ GraphSphere Demo 打包 ═══${NC}"

    git -C "$PROJECT_DIR" rev-parse --verify "$GIT_REF^{commit}" >/dev/null 2>&1 || \
        error "无效 git ref: $GIT_REF"

    local workdir src_root
    workdir="$(mktemp -d "${TMPDIR:-/tmp}/kg3d-pack.XXXXXX")"
    trap 'rm -rf "$workdir"' EXIT

    src_root="$(mktemp -d "${TMPDIR:-/tmp}/kg3d-src.XXXXXX")"
    info "导出 git 树 @ $GIT_REF ..."
    if git -C "$PROJECT_DIR" archive --format=tar "$GIT_REF" | tar -x -C "$src_root" 2>/dev/null; then
        :
    else
        warn "git archive 失败，使用工作区"
    fi

    # 未入库 WIP：git archive 不含 working tree 新文件，从工作区补齐
    for rel in \
        test/demos/knowledge-graph-3d-demo.html \
        test/fixtures/graphsphere/scenario-a-chrome-bridge.json \
        test/fixtures/graphsphere/scenario-b-ai-stack.json \
        js/kg-graph-core.js \
        js/kg-graph-layout.js \
        js/kg-graph-3d-renderer.js \
        js/kg-graph-2d-renderer.js \
        js/kg-graph-host.js \
        js/webgl-capability-probe.js \
        vendor/three/three.module.min.js \
        vendor/VENDOR.lock.md; do
        if [[ ! -f "$src_root/$rel" && -f "$PROJECT_DIR/$rel" ]]; then
            mkdir -p "$src_root/$(dirname "$rel")"
            cp "$PROJECT_DIR/$rel" "$src_root/$rel"
        fi
    done

    assemble_package "$src_root" "$workdir"
    write_build_info "$workdir"
    rm -rf "$src_root"

    local commit_short zip_name staging_dir zip_path
    commit_short="$(git -C "$PROJECT_DIR" rev-parse --short=12 "$GIT_REF^{commit}")"
    zip_name="graphsphere-demo-v${DEMO_VERSION}-${commit_short}.zip"
    staging_dir="$OUTPUT_DIR/kg3d-demo-staging"
    zip_path="$OUTPUT_DIR/$zip_name"

    if $DRY_RUN; then
        info "dry-run → $zip_path"
        find "$workdir" -type f
        exit 0
    fi

    rm -rf "$staging_dir"
    mkdir -p "$staging_dir" "$OUTPUT_DIR"
    cp -R "$workdir/." "$staging_dir/"

    info "压缩 → $zip_path"
    (cd "$staging_dir" && zip -qr "$zip_path" .)

    local size_bytes
    size_bytes=$(wc -c < "$zip_path" | tr -d ' ')
    success "打包完成: $zip_path ($(echo "$size_bytes" | awk '{printf "%.1fKB", $1/1024}'))"
    success "本地预览: npx serve -p 8765 $staging_dir"

    rm -rf "$workdir"
    trap - EXIT
}

main "$@"
