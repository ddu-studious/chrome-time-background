#!/bin/bash
#
# Cursor Bridge — Native Messaging Host 卸载脚本
#

set -euo pipefail

HOST_NAME="com.cursor.bridge"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$(uname)" = "Darwin" ]; then
  TARGET_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
else
  TARGET_DIR="$HOME/.config/google-chrome/NativeMessagingHosts"
fi

MANIFEST_PATH="$TARGET_DIR/${HOST_NAME}.json"
WRAPPER="$SCRIPT_DIR/bridge-host-wrapper.sh"
PID_FILE="$SCRIPT_DIR/../.bridge.pid"

# 停止 bridge 服务
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    echo "正在停止 bridge 服务 (PID: $PID)..."
    kill "$PID" 2>/dev/null || true
    sleep 1
  fi
  rm -f "$PID_FILE"
fi

# 删除 manifest
if [ -f "$MANIFEST_PATH" ]; then
  rm -f "$MANIFEST_PATH"
  echo "✅ 已删除 manifest: $MANIFEST_PATH"
else
  echo "ℹ️  manifest 不存在: $MANIFEST_PATH"
fi

# 删除 wrapper
if [ -f "$WRAPPER" ]; then
  rm -f "$WRAPPER"
  echo "✅ 已删除 wrapper: $WRAPPER"
fi

echo ""
echo "✅ Native Messaging Host 卸载完成"
echo ""
