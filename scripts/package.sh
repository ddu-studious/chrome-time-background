#!/usr/bin/env bash
#
# Chrome 扩展打包脚本
# 用途：打包扩展为 .zip 文件，可直接上传到 Chrome Web Store
#
# 使用方式：
#   chmod +x scripts/package.sh
#   ./scripts/package.sh
#   ./scripts/package.sh --version 2.2.1
#   ./scripts/package.sh --output ~/Desktop
#

set -euo pipefail

# ===== 颜色输出 =====
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

# ===== 项目根目录 =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ===== 默认配置 =====
OUTPUT_DIR="$PROJECT_DIR/dist"
CUSTOM_VERSION=""
DRY_RUN=false
SKIP_VALIDATE=false

# ===== 排除列表 =====
EXCLUDE_PATTERNS=(
    "dist/*"
    "scripts/*"
    "test/*"
    "docs/*"
    "cursor-bridge/*"
    "node_modules/*"
    "vendor/three/three.module.js"
    ".git/*"
    ".cursor/*"
    ".github/*"
    ".vscode/*"
    "*.md"
    "*.sh"
    ".gitignore"
    ".DS_Store"
    "Thumbs.db"
    "*.log"
    "*.map"
    "package.json"
    "package-lock.json"
    "tsconfig.json"
    ".eslintrc*"
    ".prettierrc*"
    "*.zip"
)

# ===== 必须包含的文件/目录 =====
REQUIRED_FILES=(
    "manifest.json"
    "index.html"
    "tasks.html"
    "uninstall.html"
)

REQUIRED_DIRS=(
    "js"
    "css"
    "icons"
    "vendor"
)

# ===== 帮助信息 =====
usage() {
    cat <<EOF
${CYAN}Chrome 扩展打包工具${NC}

用法: $(basename "$0") [选项]

选项:
  -v, --version VERSION   指定版本号（默认读取 manifest.json）
  -o, --output DIR        指定输出目录（默认 dist/）
  -d, --dry-run           仅检查，不实际打包
  -s, --skip-validate     跳过验证步骤
  -h, --help              显示帮助

示例:
  $(basename "$0")                    # 使用 manifest.json 中的版本号打包
  $(basename "$0") --version 2.3.0    # 指定版本号（会更新 manifest.json）
  $(basename "$0") --output ~/Desktop # 输出到桌面
  $(basename "$0") --dry-run          # 仅检查不打包

输出:
  dist/chrome-time-background-v{版本号}.zip

上传:
  1. 登录 https://chrome.google.com/webstore/devconsole
  2. 选择扩展 → 软件包 → 上传新的软件包
  3. 选择生成的 .zip 文件
  4. 填写更新说明 → 提交审核
EOF
    exit 0
}

# ===== 参数解析 =====
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version) CUSTOM_VERSION="$2"; shift 2 ;;
        -o|--output)  OUTPUT_DIR="$2"; shift 2 ;;
        -d|--dry-run) DRY_RUN=true; shift ;;
        -s|--skip-validate) SKIP_VALIDATE=true; shift ;;
        -h|--help)    usage ;;
        *) error "未知参数: $1"; usage ;;
    esac
done

# ===== 读取 manifest.json 版本 =====
get_manifest_version() {
    cd "$PROJECT_DIR"
    if command -v python3 &>/dev/null; then
        python3 -c "import json; print(json.load(open('manifest.json'))['version'])"
    elif command -v node &>/dev/null; then
        node -e "console.log(require('./manifest.json').version)"
    else
        grep '"version"' manifest.json | head -1 | sed 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/'
    fi
}

# ===== 更新 manifest.json 版本 =====
update_manifest_version() {
    local new_version="$1"
    cd "$PROJECT_DIR"
    if command -v python3 &>/dev/null; then
        python3 -c "
import json
with open('manifest.json', 'r') as f:
    data = json.load(f)
data['version'] = '$new_version'
with open('manifest.json', 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write('\n')
"
    elif command -v node &>/dev/null; then
        node -e "
const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
manifest.version = '$new_version';
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2) + '\n');
"
    else
        sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$new_version\"/" manifest.json
    fi
}

# ===== 版本号验证 =====
validate_version() {
    local version="$1"
    if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?$ ]]; then
        error "版本号格式无效: $version（应为 x.y.z 或 x.y.z.w）"
        exit 1
    fi
}

# ===== 验证项目结构 =====
validate_project() {
    info "验证项目结构..."
    local has_error=false

    if [[ ! -f "$PROJECT_DIR/manifest.json" ]]; then
        error "manifest.json 不存在"
        exit 1
    fi

    for file in "${REQUIRED_FILES[@]}"; do
        if [[ ! -f "$PROJECT_DIR/$file" ]]; then
            error "缺少必需文件: $file"
            has_error=true
        fi
    done

    for dir in "${REQUIRED_DIRS[@]}"; do
        if [[ ! -d "$PROJECT_DIR/$dir" ]]; then
            error "缺少必需目录: $dir/"
            has_error=true
        fi
    done

    if $has_error; then
        error "项目结构验证失败"
        exit 1
    fi

    success "项目结构验证通过"
}

# ===== 验证 manifest.json =====
validate_manifest() {
    info "验证 manifest.json..."
    cd "$PROJECT_DIR"

    if command -v python3 &>/dev/null; then
        python3 <<'PYEOF'
import json, sys

with open('manifest.json') as f:
    m = json.load(f)

errors = []
warnings = []

if m.get('manifest_version') != 3:
    errors.append('manifest_version 必须为 3')

for field in ['name', 'version', 'description']:
    if not m.get(field):
        errors.append(f'缺少必需字段: {field}')

if not m.get('icons'):
    warnings.append('建议添加 icons 字段')

if m.get('description', '') and len(m['description']) > 132:
    warnings.append(f'description 过长 ({len(m["description"])} 字符, 上限 132)')

if not m.get('action', {}).get('default_icon'):
    warnings.append('建议在 action 中指定 default_icon')

for w in warnings:
    print(f'⚠️  {w}')

if errors:
    for e in errors:
        print(f'❌ {e}', file=sys.stderr)
    sys.exit(1)

print('✅ manifest.json 验证通过')
PYEOF
    else
        success "manifest.json 语法正确（跳过详细验证）"
    fi
}

# ===== 检查图标文件 =====
validate_icons() {
    info "检查图标文件..."
    local icon_sizes=("16" "48" "128")
    local missing=false

    for size in "${icon_sizes[@]}"; do
        local icon_path="$PROJECT_DIR/icons/icon${size}.png"
        if [[ ! -f "$icon_path" ]]; then
            warn "缺少图标: icons/icon${size}.png"
            missing=true
        fi
    done

    if $missing; then
        warn "部分图标缺失，商店可能无法正常显示"
    else
        success "图标文件完整"
    fi
}

# ===== 统计打包内容 =====
list_package_contents() {
    info "打包内容预览:"
    cd "$PROJECT_DIR"

    local find_excludes=()
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        if [[ "$pattern" == *"/*" ]]; then
            local dir="${pattern%/*}"
            find_excludes+=(-not -path "./${dir}/*")
        elif [[ "$pattern" == */* ]]; then
            find_excludes+=(-not -path "./${pattern}")
        elif [[ "$pattern" == *.* ]]; then
            find_excludes+=(-not -name "$pattern")
        else
            find_excludes+=(-not -name "$pattern")
        fi
    done

    local file_count=0
    local total_size=0

    while IFS= read -r file; do
        [[ -z "$file" ]] && continue
        local size
        size=$(wc -c < "$PROJECT_DIR/$file" 2>/dev/null | tr -d ' ' || echo 0)
        total_size=$((total_size + size))
        file_count=$((file_count + 1))

        if [[ "$file" == manifest.json ]] || [[ "$file" == index.html ]] || [[ "$file" == js/*.js ]] || [[ "$file" == css/*.css ]]; then
            echo -e "  ${GREEN}✓${NC} $file $(format_size "$size")"
        else
            echo -e "    $file $(format_size "$size")"
        fi
    done < <(find . -type f "${find_excludes[@]}" | sed 's|^\./||' | sort)

    echo ""
    info "文件数: ${file_count}, 总大小: $(format_size $total_size)"
}

format_size() {
    local size=$1
    if [[ $size -ge 1048576 ]]; then
        echo "$(echo "scale=1; $size/1048576" | bc)MB"
    elif [[ $size -ge 1024 ]]; then
        echo "$(echo "scale=1; $size/1024" | bc)KB"
    else
        echo "${size}B"
    fi
}

# ===== 执行打包 =====
do_package() {
    local version="$1"
    local zip_name="chrome-time-background-v${version}.zip"
    local zip_path="$OUTPUT_DIR/$zip_name"

    mkdir -p "$OUTPUT_DIR"

    if [[ -f "$zip_path" ]]; then
        warn "已存在同名文件: $zip_name"
        local backup="${zip_path}.bak.$(date +%s)"
        mv "$zip_path" "$backup"
        info "已备份为: $(basename "$backup")"
    fi

    info "正在打包..."
    cd "$PROJECT_DIR"

    local exclude_args=()
    for pattern in "${EXCLUDE_PATTERNS[@]}"; do
        exclude_args+=(-x "$pattern")
    done

    zip -r "$zip_path" . "${exclude_args[@]}" -q

    if [[ ! -f "$zip_path" ]]; then
        error "打包失败"
        exit 1
    fi

    local zip_size
    zip_size=$(wc -c < "$zip_path")

    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  打包成功！${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "  📦 文件: ${CYAN}$zip_path${NC}"
    echo -e "  📏 大小: $(format_size "$zip_size")"
    echo -e "  🏷️  版本: v${version}"
    echo ""
    echo -e "  ${YELLOW}下一步：上传到 Chrome Web Store${NC}"
    echo -e "  1. 打开 https://chrome.google.com/webstore/devconsole"
    echo -e "  2. 选择扩展 → 软件包 → 上传新软件包"
    echo -e "  3. 选择 ${CYAN}${zip_name}${NC}"
    echo -e "  4. 填写更新说明 → 提交审核"
    echo ""
}

# ===== 主流程 =====
main() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════╗"
    echo "║     Chrome 扩展打包工具 🧳               ║"
    echo "║     中国风景时钟 (China Scenery Clock)   ║"
    echo "╚══════════════════════════════════════════╝"
    echo -e "${NC}"

    cd "$PROJECT_DIR"

    local current_version
    current_version=$(get_manifest_version)
    info "当前版本: v${current_version}"

    local version="$current_version"
    if [[ -n "$CUSTOM_VERSION" ]]; then
        validate_version "$CUSTOM_VERSION"
        if [[ "$CUSTOM_VERSION" != "$current_version" ]]; then
            info "更新版本: v${current_version} → v${CUSTOM_VERSION}"
            update_manifest_version "$CUSTOM_VERSION"
            version="$CUSTOM_VERSION"
        fi
    fi

    if ! $SKIP_VALIDATE; then
        validate_project
        validate_manifest
        validate_icons
    fi

    echo ""
    list_package_contents

    if $DRY_RUN; then
        echo ""
        info "Dry-run 模式，跳过实际打包"
        exit 0
    fi

    echo ""
    do_package "$version"
}

main
