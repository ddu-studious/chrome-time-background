#!/usr/bin/env bash
#
# GraphSphere Demo — demo-graph.json 归档
# 将场景 A/B 复制为发布别名并写入 DEMO_GRAPH_MANIFEST.json
#
# 用法:
#   ./scripts/archive-demo-graph-json.sh
#   ./scripts/archive-demo-graph-json.sh --ref HEAD --tag demo-graph/v0.1.0
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
ARCHIVE_DIR="$PROJECT_DIR/releases/kg3d-demo/demo-graph-archives"
MANIFEST_PATH="$PROJECT_DIR/releases/kg3d-demo/DEMO_GRAPH_MANIFEST.json"

GIT_REF="HEAD"
TAG_NAME=""
DRY_RUN=false
DEMO_VERSION="${KG3D_DEMO_VERSION:-0.1.0}"

usage() {
    cat <<EOF
demo-graph.json 归档（场景 A/B → 发布别名）

选项:
  --ref REF       git 引用（默认 HEAD）
  --version VER   Demo 版本号写入 manifest
  --tag NAME      可选 git 附注 tag
  --dry-run       预览
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
        -h|--help) usage ;;
        *) error "未知参数: $1" ;;
    esac
done

sha256_file() {
    if command -v shasum &>/dev/null; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        sha256sum "$1" | awk '{print $1}'
    fi
}

main() {
    echo -e "${CYAN}═══ demo-graph.json 归档 ═══${NC}"

    git -C "$PROJECT_DIR" rev-parse --verify "$GIT_REF^{commit}" >/dev/null 2>&1 || \
        error "无效 git ref: $GIT_REF"

    local commit short_sha archived_at workdir
    commit="$(git -C "$PROJECT_DIR" rev-parse "$GIT_REF^{commit}")"
    short_sha="${commit:0:12}"
    archived_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    workdir="$(mktemp -d "${TMPDIR:-/tmp}/kg3d-graph-archive.XXXXXX")"
    trap 'rm -rf "$workdir"' EXIT
    git -C "$PROJECT_DIR" archive --format=tar "$GIT_REF" \
        test/fixtures/graphsphere/scenario-a-chrome-bridge.json \
        test/fixtures/graphsphere/scenario-b-ai-stack.json 2>/dev/null | tar -x -C "$workdir" || true

    local src_a="$workdir/test/fixtures/graphsphere/scenario-a-chrome-bridge.json"
    local src_b="$workdir/test/fixtures/graphsphere/scenario-b-ai-stack.json"
    [[ -f "$src_a" ]] || src_a="$PROJECT_DIR/test/fixtures/graphsphere/scenario-a-chrome-bridge.json"
    [[ -f "$src_b" ]] || src_b="$PROJECT_DIR/test/fixtures/graphsphere/scenario-b-ai-stack.json"
    [[ -f "$src_a" && -f "$src_b" ]] || error "缺少场景 JSON（git 树与工作区均无）"

    if $DRY_RUN; then
        info "dry-run: 将归档 demo-graph-a/b @ $short_sha"
        exit 0
    fi

    mkdir -p "$ARCHIVE_DIR"

    local out_a="$ARCHIVE_DIR/demo-graph-a.json"
    local out_b="$ARCHIVE_DIR/demo-graph-b.json"
    cp "$src_a" "$out_a"
    cp "$src_b" "$out_b"

    info "校验归档 JSON..."
    "$PROJECT_DIR/scripts/validate-demo-graph-json.sh" "$out_a" release
    "$PROJECT_DIR/scripts/validate-demo-graph-json.sh" "$out_b" release

    local sha_a sha_b size_a size_b nodes_a nodes_b
    sha_a=$(sha256_file "$out_a")
    sha_b=$(sha256_file "$out_b")
    size_a=$(wc -c < "$out_a" | tr -d ' ')
    size_b=$(wc -c < "$out_b" | tr -d ' ')
    nodes_a=$(python3 -c "import json; print(len(json.load(open('$out_a'))['nodes']))")
    nodes_b=$(python3 -c "import json; print(len(json.load(open('$out_b'))['nodes']))")

    export MANIFEST_PATH ARCHIVE_DIR DEMO_VERSION GIT_REF commit archived_at TAG_NAME
    export OUT_A=out_a OUT_B=out_b
    export SHA_A="$sha_a" SHA_B="$sha_b"
    export SIZE_A="$size_a" SIZE_B="$size_b"
    export NODES_A="$nodes_a" NODES_B="$nodes_b"
    export SHORT_SHA="$short_sha"

    python3 <<'PY'
import json, os
from pathlib import Path

manifest_path = Path(os.environ["MANIFEST_PATH"])
archived_at = os.environ["archived_at"]
commit = os.environ["commit"]

entries = [
    {
        "alias": "demo-graph-a.json",
        "sourcePath": "test/fixtures/graphsphere/scenario-a-chrome-bridge.json",
        "archivePath": "releases/kg3d-demo/demo-graph-archives/demo-graph-a.json",
        "sceneId": "scenario-a-chrome-bridge",
        "sha256": os.environ["SHA_A"],
        "sizeBytes": int(os.environ["SIZE_A"]),
        "nodeCount": int(os.environ["NODES_A"]),
    },
    {
        "alias": "demo-graph-b.json",
        "sourcePath": "test/fixtures/graphsphere/scenario-b-ai-stack.json",
        "archivePath": "releases/kg3d-demo/demo-graph-archives/demo-graph-b.json",
        "sceneId": "scenario-b-ai-stack",
        "sha256": os.environ["SHA_B"],
        "sizeBytes": int(os.environ["SIZE_B"]),
        "nodeCount": int(os.environ["NODES_B"]),
    },
]

bundle = {
    "role": "demo-graph-release-bundle",
    "demoVersion": os.environ["DEMO_VERSION"],
    "gitRef": os.environ["GIT_REF"],
    "gitCommit": commit,
    "archivedAt": archived_at,
    "gitTag": os.environ.get("TAG_NAME") or None,
    "schemaVersion": "1.0.0",
    "files": entries,
}

if manifest_path.exists():
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
else:
    data = {"schemaVersion": 1, "bundles": []}

bundles = [b for b in data.get("bundles", []) if b.get("gitCommit") != commit]
bundles.insert(0, bundle)
data["bundles"] = bundles
data["latest"] = bundle
manifest_path.parent.mkdir(parents=True, exist_ok=True)
manifest_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(json.dumps(bundle, indent=2, ensure_ascii=False))
PY

    success "归档: $out_a ($nodes_a nodes)"
    success "归档: $out_b ($nodes_b nodes)"
    success "Manifest: $MANIFEST_PATH"

    if [[ -n "$TAG_NAME" ]]; then
        if git -C "$PROJECT_DIR" rev-parse "$TAG_NAME" >/dev/null 2>&1; then
            warn "tag 已存在: $TAG_NAME"
        else
            git -C "$PROJECT_DIR" tag -a "$TAG_NAME" -m "GraphSphere demo-graph bundle v${DEMO_VERSION}

commit: ${commit}
sha256-a: ${sha_a}
sha256-b: ${sha_b}
archived: ${archived_at}
"
            success "已创建 tag: $TAG_NAME"
        fi
    fi

    rm -rf "$workdir"
    trap - EXIT
}

main "$@"
