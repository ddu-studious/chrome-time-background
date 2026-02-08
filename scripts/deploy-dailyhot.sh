#!/usr/bin/env bash
#
# DailyHotApi 一键部署脚本
# 用途：在 VPS 上通过 Docker 部署 DailyHotApi 热榜聚合 API
#
# 使用方式：
#   chmod +x scripts/deploy-dailyhot.sh
#   ./scripts/deploy-dailyhot.sh
#
# 支持参数：
#   --port PORT          指定端口（默认 6688）
#   --cache-ttl SECONDS  指定缓存时长（默认 1800 秒）
#   --dir DIR            指定安装目录（默认 ~/dailyhot-api）
#   --no-docker          不使用 Docker，直接 Node.js 运行
#   --update             更新已有部署
#   --uninstall          卸载
#

set -euo pipefail

# ===== 默认配置 =====
INSTALL_DIR="${HOME}/dailyhot-api"
PORT=6688
CACHE_TTL=1800
REQUEST_TIMEOUT=8000
USE_DOCKER=true
ACTION="install"
REPO_URL="https://github.com/imsyy/DailyHotApi.git"

# ===== 颜色输出 =====
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
success() { echo -e "${GREEN}[OK]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ===== 参数解析 =====
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)       PORT="$2"; shift 2 ;;
        --cache-ttl)  CACHE_TTL="$2"; shift 2 ;;
        --dir)        INSTALL_DIR="$2"; shift 2 ;;
        --no-docker)  USE_DOCKER=false; shift ;;
        --update)     ACTION="update"; shift ;;
        --uninstall)  ACTION="uninstall"; shift ;;
        -h|--help)
            echo "用法: $0 [选项]"
            echo ""
            echo "选项:"
            echo "  --port PORT          指定端口（默认 6688）"
            echo "  --cache-ttl SECONDS  缓存时长，秒（默认 1800）"
            echo "  --dir DIR            安装目录（默认 ~/dailyhot-api）"
            echo "  --no-docker          不使用 Docker，直接 Node.js 运行"
            echo "  --update             更新已有部署"
            echo "  --uninstall          卸载"
            echo "  -h, --help           显示帮助"
            exit 0
            ;;
        *) error "未知参数: $1。使用 -h 查看帮助。" ;;
    esac
done

# ===== 环境检测 =====
check_command() {
    command -v "$1" &>/dev/null
}

check_deps() {
    info "检测系统环境..."

    if ! check_command git; then
        error "未安装 git。请先安装：sudo apt install git 或 sudo yum install git"
    fi

    if $USE_DOCKER; then
        if ! check_command docker; then
            error "未安装 Docker。请先安装：https://docs.docker.com/get-docker/"
        fi
        if ! check_command docker-compose && ! docker compose version &>/dev/null 2>&1; then
            warn "未安装 docker-compose，将使用 docker run 方式"
        fi
    else
        if ! check_command node; then
            error "未安装 Node.js。请先安装 v18+：https://nodejs.org/"
        fi
        NODE_VER=$(node -v | sed 's/v//' | cut -d. -f1)
        if [[ "$NODE_VER" -lt 18 ]]; then
            error "Node.js 版本过低（当前 v${NODE_VER}），需要 v18+"
        fi
    fi

    success "环境检测通过"
}

# ===== 卸载 =====
do_uninstall() {
    info "卸载 DailyHotApi..."

    if $USE_DOCKER; then
        docker stop dailyhot-api 2>/dev/null || true
        docker rm dailyhot-api 2>/dev/null || true
        docker rmi imsyy/dailyhot-api:latest 2>/dev/null || true
    else
        # 尝试停止 pm2 进程
        if check_command pm2; then
            pm2 delete dailyhot-api 2>/dev/null || true
        fi
    fi

    if [[ -d "$INSTALL_DIR" ]]; then
        read -rp "是否删除安装目录 ${INSTALL_DIR}？[y/N] " confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
            success "已删除 ${INSTALL_DIR}"
        fi
    fi

    success "卸载完成"
    exit 0
}

# ===== 更新 =====
do_update() {
    info "更新 DailyHotApi..."

    if [[ ! -d "$INSTALL_DIR" ]]; then
        error "安装目录不存在：${INSTALL_DIR}。请先执行安装。"
    fi

    cd "$INSTALL_DIR"
    git pull origin master

    if $USE_DOCKER; then
        docker-compose down 2>/dev/null || docker stop dailyhot-api 2>/dev/null || true
        docker-compose build 2>/dev/null || docker build -t dailyhot-api .
        docker-compose up -d 2>/dev/null || docker run --restart always -p "${PORT}:6688" -d --name dailyhot-api dailyhot-api
    else
        npm install
        npm run build
        if check_command pm2; then
            pm2 restart dailyhot-api
        else
            warn "请手动重启服务"
        fi
    fi

    success "更新完成"
    verify_api
    exit 0
}

# ===== 安装 =====
do_install() {
    info "开始部署 DailyHotApi"
    info "  安装目录: ${INSTALL_DIR}"
    info "  端口: ${PORT}"
    info "  缓存时长: ${CACHE_TTL} 秒"
    info "  部署方式: $($USE_DOCKER && echo 'Docker' || echo 'Node.js')"
    echo ""

    # 克隆仓库
    if [[ -d "$INSTALL_DIR" ]]; then
        warn "目录已存在: ${INSTALL_DIR}"
        read -rp "是否覆盖？[y/N] " confirm
        if [[ "$confirm" =~ ^[Yy]$ ]]; then
            rm -rf "$INSTALL_DIR"
        else
            error "部署取消"
        fi
    fi

    info "克隆仓库..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    success "仓库克隆完成"

    # 配置环境变量
    info "配置环境变量..."
    cat > .env << ENVEOF
# DailyHotApi 环境配置
# 由 deploy-dailyhot.sh 自动生成

# 服务端口
PORT=${PORT}

# 允许的域名（Chrome 扩展需要 *）
ALLOWED_DOMAIN="*"

# 允许的主域名（留空表示不限制）
ALLOWED_HOST=""

# 禁止爬虫索引
DISALLOW_ROBOT=true

# Redis（留空使用内存缓存）
REDIS_HOST=""
REDIS_PORT=6379
REDIS_PASSWORD=""
REDIS_DB=0

# 缓存时长（秒）
CACHE_TTL=${CACHE_TTL}

# 请求超时（毫秒）
REQUEST_TIMEOUT=${REQUEST_TIMEOUT}

# 是否输出日志
USE_LOG_FILE=true

# RSS Mode
RSS_MODE=false

# 过滤微博广告
FILTER_WEIBO_ADVERTISEMENT=true
ENVEOF
    success "环境变量配置完成"

    # 部署
    if $USE_DOCKER; then
        deploy_docker
    else
        deploy_node
    fi
}

deploy_docker() {
    info "使用 Docker 部署..."

    # 优先使用 docker-compose
    if check_command docker-compose || docker compose version &>/dev/null 2>&1; then
        info "使用 docker-compose 启动..."
        # 修改 docker-compose.yml 端口映射
        if [[ "$PORT" != "6688" ]]; then
            sed -i.bak "s/6688:6688/${PORT}:6688/" docker-compose.yml 2>/dev/null || \
            sed -i '' "s/6688:6688/${PORT}:6688/" docker-compose.yml
        fi
        docker-compose up -d 2>/dev/null || docker compose up -d
    else
        info "使用 docker run 启动..."
        docker build -t dailyhot-api .
        docker run --restart always \
            -p "${PORT}:6688" \
            -v "$(pwd)/logs:/app/logs" \
            -d --name dailyhot-api \
            dailyhot-api
    fi

    success "Docker 部署完成"
    verify_api
}

deploy_node() {
    info "使用 Node.js 部署..."

    # 安装依赖
    if check_command pnpm; then
        pnpm install
        pnpm run build
    else
        npm install
        npm run build
    fi

    # 使用 pm2 守护
    if check_command pm2; then
        info "使用 pm2 启动守护进程..."
        pm2 start dist/index.js --name dailyhot-api
        pm2 save
        success "pm2 守护进程已启动"
    else
        warn "未安装 pm2，建议安装：npm i pm2 -g"
        info "临时启动（关闭终端会停止）..."
        npm run start &
    fi

    verify_api
}

# ===== 验证 =====
verify_api() {
    echo ""
    info "验证 API 服务..."
    sleep 3

    local url="http://localhost:${PORT}"

    # 测试各个端点
    local endpoints=("weibo" "bilibili" "zhihu" "douyin" "baidu")
    local ok_count=0

    for ep in "${endpoints[@]}"; do
        if curl -s --max-time 10 "${url}/${ep}" | grep -q '"code":200' 2>/dev/null; then
            success "  ✅ /${ep} — 正常"
            ((ok_count++))
        else
            warn "  ⚠️  /${ep} — 暂不可用（可能需要等待首次缓存）"
        fi
    done

    echo ""
    echo "========================================"
    success "🎉 DailyHotApi 部署完成！"
    echo ""
    echo "  API 地址: http://localhost:${PORT}"
    echo "  测试端点: ${url}/weibo"
    echo ""
    echo "  可用端点（54 个平台）:"
    echo "    /weibo     — 微博热搜"
    echo "    /bilibili  — B站热榜"
    echo "    /zhihu     — 知乎热榜"
    echo "    /douyin    — 抖音热点"
    echo "    /baidu     — 百度热搜"
    echo "    /toutiao   — 今日头条"
    echo "    /douban-group — 豆瓣讨论"
    echo "    ...更多见 ${url}"
    echo ""
    echo "  下一步："
    echo "    1. 如果在 VPS 上，配置 Nginx 反向代理 + SSL"
    echo "    2. 在扩展中替换 API 地址"
    echo "    3. 详见 docs/deploy/dailyhot-api-deploy.md"
    echo "========================================"
}

# ===== 主流程 =====
case "$ACTION" in
    install)   check_deps; do_install ;;
    update)    check_deps; do_update ;;
    uninstall) do_uninstall ;;
esac
