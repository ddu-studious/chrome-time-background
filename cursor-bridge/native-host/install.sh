#!/bin/bash
#
# Cursor Bridge — Native Messaging Host 安装脚本 (macOS / Linux)
#
# 用法:
#   ./install.sh <chrome-extension-id>
#
# 示例:
#   ./install.sh abcdefghijklmnopqrstuvwxyz123456
#
# 该脚本会:
#   1. 让 bridge-host.js 可执行
#   2. 生成 Native Messaging Host manifest JSON
#   3. 将 manifest 安装到 Chrome 的 NativeMessagingHosts 目录
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_SCRIPT="$SCRIPT_DIR/bridge-host.js"
HOST_NAME="com.cursor.bridge"
TEMPLATE="$SCRIPT_DIR/${HOST_NAME}.json.template"

# ── 检查参数 ──
if [ $# -lt 1 ]; then
  echo "用法: $0 <chrome-extension-id>"
  echo ""
  echo "  查找扩展 ID 的方法:"
  echo "  1. 打开 chrome://extensions/"
  echo "  2. 启用开发者模式"
  echo "  3. 找到\"中国风景时钟\"扩展"
  echo "  4. 复制 ID（一串小写字母）"
  echo ""
  exit 1
fi

EXT_ID="$1"

# ── 验证扩展 ID 格式 ──
if ! echo "$EXT_ID" | grep -qE '^[a-p]{32}$'; then
  echo "⚠️  扩展 ID 格式可能不正确: $EXT_ID"
  echo "   Chrome 扩展 ID 通常是 32 位小写字母 (a-p)"
  read -p "   是否继续? (y/N) " confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "已取消"
    exit 0
  fi
fi

# ── 确定目标目录 (macOS vs Linux) ──
if [ "$(uname)" = "Darwin" ]; then
  TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
else
  TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
fi

# ── 检查 Node.js ──
if ! command -v node &>/dev/null; then
  echo "❌ 需要 Node.js。请先安装 Node.js 20+"
  exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "⚠️  Node.js 版本过低 ($(node -v))，推荐 v20+"
fi

NODE_PATH=$(which node)

# ── 让 host 脚本可执行 ──
chmod +x "$HOST_SCRIPT"

# ── 创建 wrapper 脚本（确保使用正确的 node） ──
WRAPPER="$SCRIPT_DIR/bridge-host-wrapper.sh"
cat > "$WRAPPER" << WRAPPER_EOF
#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:\$PATH"
exec "$NODE_PATH" "$HOST_SCRIPT" "\$@"
WRAPPER_EOF
chmod +x "$WRAPPER"

# ── 生成 manifest ──
mkdir -p "$TARGET_DIR"
MANIFEST_PATH="$TARGET_DIR/${HOST_NAME}.json"

sed -e "s|{{HOST_PATH}}|${WRAPPER}|g" \
    -e "s|{{EXTENSION_ID}}|${EXT_ID}|g" \
    "$TEMPLATE" > "$MANIFEST_PATH"

# ── 验证安装 ──
echo ""
echo "✅ Native Messaging Host 安装完成!"
echo ""
echo "   Host 名称:    $HOST_NAME"
echo "   Host 脚本:    $HOST_SCRIPT"
echo "   Wrapper:      $WRAPPER"
echo "   Manifest:     $MANIFEST_PATH"
echo "   扩展 ID:      $EXT_ID"
echo "   Node.js:      $NODE_PATH (v$(node -v | sed 's/v//'))"
echo ""
echo "📋 下一步:"
echo "   1. 确保 cursor-bridge 依赖已安装: cd $SCRIPT_DIR/.. && npm install"
echo "   2. 确保 .env 中已配置 CURSOR_API_KEY"
echo "   3. 重新加载 Chrome 扩展"
echo "   4. 在扩展的 Agent 面板中即可自动启停 bridge 服务"
echo ""
