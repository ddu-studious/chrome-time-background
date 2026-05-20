#!/usr/bin/env bash
#
# 归档「上一稳定版」扩展 zip + 写入 manifest + 可选打 git tag
#
# 从指定 git ref 的干净树打包（默认 HEAD），避免工作区未提交的 Tetris 3D WIP 混入归档。
#
# 用法:
#   ./scripts/rollback-archive-stable.sh
#   ./scripts/rollback-archive-stable.sh --ref HEAD --tag stable/v3.16.0-pre-tetris3d-mvp
#   ./scripts/rollback-archive-stable.sh --dry-run
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
RELEASES_DIR="$PROJECT_DIR/releases/archives"
MANIFEST_PATH="$PROJECT_DIR/releases/ROLLBACK_MANIFEST.json"

GIT_REF="HEAD"
TAG_NAME=""
DRY_RUN=false
SKIP_SCAN=false

usage() {
    cat <<EOF
归档稳定版 Chrome 扩展包（自 git 树，不含工作区脏文件）

选项:
  --ref REF       git 引用（默认 HEAD）
  --tag NAME      创建附注 tag（如 stable/v3.16.0-pre-tetris3d-mvp）
  --dry-run       仅预览，不写 zip / tag
  --skip-scan     跳过 scan-package.sh
  -h, --help      帮助
EOF
    exit 0
}

while [[ $# -gt 0 ]]; do
    case $1 in
        --ref) GIT_REF="$2"; shift 2 ;;
        --tag) TAG_NAME="$2"; shift 2 ;;
        --dry-run) DRY_RUN=true; shift ;;
        --skip-scan) SKIP_SCAN=true; shift ;;
        -h|--help) usage ;;
        *) error "未知参数: $1"; usage ;;
    esac
done

resolve_version() {
    local dir="$1"
    python3 -c "import json; print(json.load(open('$dir/manifest.json'))['version'])"
}

resolve_commit() {
    git -C "$PROJECT_DIR" rev-parse "$GIT_REF^{commit}"
}

main() {
    echo -e "${CYAN}═══ 稳定版归档 (git tree) ═══${NC}"

    if ! git -C "$PROJECT_DIR" rev-parse --verify "$GIT_REF^{commit}" >/dev/null 2>&1; then
        error "无效 git ref: $GIT_REF"
        exit 1
    fi

    local commit short_sha version zip_name zip_path sha256_bytes
    commit="$(resolve_commit)"
    short_sha="${commit:0:12}"
    version="$(git -C "$PROJECT_DIR" show "$commit:manifest.json" | python3 -c "import json,sys; print(json.load(sys.stdin)['version'])")"
    zip_name="chrome-time-background-v${version}-stable-${short_sha}.zip"
    zip_path="$RELEASES_DIR/$zip_name"

    info "ref=$GIT_REF commit=$short_sha version=v$version"
    info "输出: $zip_path"

    if $DRY_RUN; then
        warn "dry-run：跳过打包与 tag"
        exit 0
    fi

    local workdir
    workdir="$(mktemp -d "${TMPDIR:-/tmp}/ctb-stable-archive.XXXXXX")"
    trap 'rm -rf "$workdir"' EXIT

    info "导出 git 树到临时目录..."
    git -C "$PROJECT_DIR" archive --format=tar "$commit" | tar -x -C "$workdir"

  # 复制打包/扫描脚本（git archive 不含 scripts/ 用于 zip，但归档流程需要）
    mkdir -p "$workdir/scripts"
    cp "$PROJECT_DIR/scripts/package.sh" "$PROJECT_DIR/scripts/scan-package.sh" "$workdir/scripts/"
    chmod +x "$workdir/scripts/"*.sh

    info "执行 package.sh..."
    (cd "$workdir" && ./scripts/package.sh --skip-validate)

    local built_zip
    built_zip="$(ls -t "$workdir"/dist/chrome-time-background-v*.zip 2>/dev/null | head -1)"
    if [[ -z "$built_zip" || ! -f "$built_zip" ]]; then
        error "package.sh 未产出 zip"
        exit 1
    fi

    mkdir -p "$RELEASES_DIR"
    cp "$built_zip" "$zip_path"

    if command -v shasum &>/dev/null; then
        sha256_bytes="$(shasum -a 256 "$zip_path" | awk '{print $1}')"
    else
        sha256_bytes="$(sha256sum "$zip_path" | awk '{print $1}')"
    fi

    local zip_size archived_at
    zip_size=$(wc -c < "$zip_path" | tr -d ' ')
    archived_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    if ! $SKIP_SCAN; then
        info "scan-package.sh 校验归档包（profile=stable）..."
        CI_SCAN_PROFILE=stable "$PROJECT_DIR/scripts/scan-package.sh" "$zip_path"
    fi

    info "更新 ROLLBACK_MANIFEST.json..."
    mkdir -p "$(dirname "$MANIFEST_PATH")"
    export MANIFEST_PATH
    export ARCHIVE_JSON="$zip_path"
    export ARCHIVE_SHA256="$sha256_bytes"
    export ARCHIVE_SIZE="$zip_size"
    export ARCHIVE_COMMIT="$commit"
    export ARCHIVE_REF="$GIT_REF"
    export ARCHIVE_VERSION="$version"
    export ARCHIVE_AT="$archived_at"
    export ARCHIVE_TAG="${TAG_NAME:-}"
    python3 <<'PY'
import json, os
from pathlib import Path

manifest_path = Path(os.environ["MANIFEST_PATH"])
entry = {
    "role": "l2-rollback-baseline",
    "version": os.environ["ARCHIVE_VERSION"],
    "gitRef": os.environ["ARCHIVE_REF"],
    "gitCommit": os.environ["ARCHIVE_COMMIT"],
    "archivedAt": os.environ["ARCHIVE_AT"],
    "zipFile": os.path.basename(os.environ["ARCHIVE_JSON"]),
    "zipPath": "releases/archives/" + os.path.basename(os.environ["ARCHIVE_JSON"]),
    "sha256": os.environ["ARCHIVE_SHA256"],
    "sizeBytes": int(os.environ["ARCHIVE_SIZE"]),
    "gitTag": os.environ["ARCHIVE_TAG"] or None,
    "notes": "Pre-Tetris-3D-MVP stable; packaged from git tree (not working tree).",
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

    success "归档完成: $zip_path ($(echo "$zip_size" | awk '{printf "%.1fMB", $1/1048576}'))"
    success "SHA256: $sha256_bytes"

    if [[ -n "$TAG_NAME" ]]; then
        if git -C "$PROJECT_DIR" rev-parse "$TAG_NAME" >/dev/null 2>&1; then
            warn "tag 已存在: $TAG_NAME（跳过创建）"
        else
            info "创建附注 tag: $TAG_NAME @ $short_sha"
            git -C "$PROJECT_DIR" tag -a "$TAG_NAME" -m "Stable archive before Tetris 3D MVP canary

version: v${version}
commit: ${commit}
zip: ${zip_name}
sha256: ${sha256_bytes}
archived: ${archived_at}
"
            success "已创建 tag: $TAG_NAME"
        fi
    fi

    rm -rf "$workdir"
    trap - EXIT

    echo ""
    echo -e "${GREEN}下一步（L2 回滚）:${NC}"
    echo "  1. Chrome → chrome://extensions → 加载已解压 / 或 CWS 上传 ${zip_name}"
    echo "  2. 校验: ./scripts/rollback-drill-l0-l2.sh --l2-only"
}

main "$@"
