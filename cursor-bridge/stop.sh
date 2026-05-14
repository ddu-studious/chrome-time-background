#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.bridge.pid"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

stop_bridge() {
  if [ ! -f "$PID_FILE" ]; then
    echo -e "${YELLOW}[!] No PID file found. Bridge might not be running.${NC}"
    local orphan
    orphan=$(pgrep -f "tsx.*src/index.ts" 2>/dev/null || true)
    if [ -n "$orphan" ]; then
      echo -e "${YELLOW}[!] Found orphan process(es): $orphan${NC}"
      echo -n "  Kill them? [y/N] "
      read -r answer
      if [ "$answer" = "y" ] || [ "$answer" = "Y" ]; then
        echo "$orphan" | xargs kill 2>/dev/null || true
        echo -e "${GREEN}[✓] Killed orphan processes.${NC}"
      fi
    fi
    exit 0
  fi

  local pid
  pid=$(cat "$PID_FILE")

  if ! kill -0 "$pid" 2>/dev/null; then
    echo -e "${YELLOW}[!] Process $pid is not running (stale PID file).${NC}"
    rm -f "$PID_FILE"
    exit 0
  fi

  echo -e "${GREEN}[→] Stopping cursor-bridge (PID: $pid)...${NC}"
  kill "$pid" 2>/dev/null

  local count=0
  while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
    sleep 0.5
    count=$((count + 1))
  done

  if kill -0 "$pid" 2>/dev/null; then
    echo -e "${YELLOW}[!] Graceful stop timed out. Force killing...${NC}"
    kill -9 "$pid" 2>/dev/null || true
  fi

  rm -f "$PID_FILE"
  echo -e "${GREEN}[✓] Bridge stopped.${NC}"
}

case "${1:-}" in
  --force|-f)
    if [ -f "$PID_FILE" ]; then
      pid=$(cat "$PID_FILE")
      kill -9 "$pid" 2>/dev/null || true
      rm -f "$PID_FILE"
      echo -e "${GREEN}[✓] Force killed (PID: $pid).${NC}"
    else
      pkill -9 -f "tsx.*src/index.ts" 2>/dev/null || true
      echo -e "${GREEN}[✓] Force killed all bridge processes.${NC}"
    fi
    ;;
  --status|-s)
    if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
      local pid
      pid=$(cat "$PID_FILE")
      echo -e "${GREEN}[✓] Bridge is running (PID: $pid)${NC}"
    else
      echo -e "${YELLOW}[✗] Bridge is not running.${NC}"
    fi
    ;;
  *)
    stop_bridge
    ;;
esac
