#!/usr/bin/env bash
#
# GraphSphere Demo — L2 稳定版 zip 归档 + ROLLBACK_MANIFEST 更新
#
# 用法:
#   ./scripts/rollback-archive-kg3d-demo.sh
#   ./scripts/rollback-archive-kg3d-demo.sh --ref HEAD --tag stable/kg3d-demo-v0.1.0
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
RELEASES_DIR="$PROJECT_DIR/releases/kg3d-demo/archives"
MANIFEST_PATH="$PROJECT_DIR/releases/kg3d-demo/ROLLBACK_MANIFEST.json"

GIT_REF="HEAD"
TAG_NAME=""
DRY_RUN=false
SKIP_SCAN=false
DEMO_VERSION="${KG3D_DEMO_VERSION:-0.1.0}"

usage() {
    cat <<EOF
归档 GraphSphere Demo 稳定 zip（自 git 树打包）

选项:
  --ref REF       git 引用（默认 HEAD）
  --version VER   Demo 版本
  --tag NAME      附注 tag
  --dry-run       预览
  --skip-scan     跳过 scan-kg3d-demo.sh
  -h, --help      帮助
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --ref) GIT_REF="$2"; shift 2 ;;
        --version) DEMO_VERSION="$2"; shift 2 ;;
        --tag) TAG_NAME="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --skip-scan) SKIP_SCAN=true; shift ;;
        -h|--help) usage ;;
        *) error "未知参数: $1" ;;
    esac
done

main() {
    echo -e "${CYAN}═══ GraphSphere Demo 稳定版归档 ═══${NC}"

    git -C "$PROJECT_DIR" rev-parse --verify "$GIT_REF^{commit}" >/dev/null 2>&1 || \
        error "无效 git ref: $GIT_REF"

    local commit short_sha
    commit="$(git -C "$PROJECT_DIR" rev-parse "$GIT_REF^{commit}")"
    short_sha="${commit:0:12}"

    if $DRY_RUN; then
        info "dry-run: ref=$GIT_REF commit=$short_sha version=v$DEMO_VERSION"
        exit 0
    fi

    info "自 git 树打包 @ $GIT_REF ..."
    (cd "$PROJECT_DIR" && ./scripts/package-kg3d-demo.sh --version "$DEMO_VERSION" --ref "$GIT_REF")

    built_zip="$(ls -t "$PROJECT_DIR/dist"/graphsphere-demo-v*.zip 2>/dev/null | head -1)"
    [[ -n "$built_zip" && -f "$built_zip" ]] || error "package-kg3d-demo 未产出 zip"

    mkdir -p "$RELEASES_DIR"
    local zip_name zip_path sha256_bytes zip_size archived_at
    zip_name="graphsphere-demo-v${DEMO_VERSION}-stable-${short_sha}.zip"
    zip_path="$RELEASES_DIR/$zip_name"
    cp "$built_zip" "$zip_path"

    if command -v shasum &>/dev/null; then
        sha256_bytes="$(shasum -a 256 "$zip_path" | awk '{print $1}')"
    else
        sha256_bytes="$(sha256sum "$zip_path" | awk '{print $1}')"
    fi
    zip_size=$(wc -c < "$zip_path" | tr -d ' ')
    archived_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    if ! $SKIP_SCAN; then
        info "scan-kg3d-demo.sh @ 归档包..."
        CI_KG3D_SCAN_PROFILE=stable "$PROJECT_DIR/scripts/scan-kg3d-demo.sh" "$zip_path"
    fi

    export MANIFEST_PATH zip_path sha256_bytes zip_size commit archived_at TAG_NAME
    export GIT_REF DEMO_VERSION zip_name

    python3 <<'PY'
import json, os
from pathlib import Path

manifest_path = Path(os.environ["MANIFEST_PATH"])
entry = {
    "role": "l2-rollback-baseline",
    "product": "graphsphere-demo",
    "version": os.environ["DEMO_VERSION"],
    "gitRef": os.environ["GIT_REF"],
    "gitCommit": os.environ["commit"],
    "archivedAt": os.environ["archived_at"],
    "zipFile": os.environ["zip_name"],
    "zipPath": "releases/kg3d-demo/archives/" + os.environ["zip_name"],
    "sha256": os.environ["sha256_bytes"],
    "sizeBytes": int(os.environ["zip_size"]),
    "gitTag": os.environ.get("TAG_NAME") or None,
    "notes": "GraphSphere static demo; packaged from git tree.",
}

if manifest_path.exists():
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
else:
    data = {"schemaVersion": 1, "archives": []}

archives = [a for a in data.get("archives", []) if a.get("gitCommit") != entry["gitCommit"]]
archives.insert(0, entry)
data["archives"] = archives
data["latestStable"] = entry
manifest_path.parent.mkdir(parents=True, exist_ok=True)
manifest_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(json.dumps(entry, indent=2, ensure_ascii=False))
PY

    success "归档: $zip_path"
    success "SHA256: $sha256_bytes"

    if [[ -n "$TAG_NAME" ]]; then
        if git -C "$PROJECT_DIR" rev-parse "$TAG_NAME" >/dev/null 2>&1; then
            warn "tag 已存在: $TAG_NAME"
        else
            git -C "$PROJECT_DIR" tag -a "$TAG_NAME" -m "Stable GraphSphere demo v${DEMO_VERSION}

commit: ${commit}
zip: ${zip_name}
sha256: ${sha256_bytes}
"
            success "已创建 tag: $TAG_NAME"
        fi
    fi

    echo ""
    echo -e "${GREEN}L2 回滚:${NC} 解压 $zip_name → 静态托管或 npx serve"
}

main "$@"
