#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.bridge.pid"
LOG_DIR="$SCRIPT_DIR/logs"
LOG_FILE="$LOG_DIR/bridge.log"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

mkdir -p "$LOG_DIR"

print_banner() {
  echo -e "${CYAN}"
  echo "  ╔═══════════════════════════════════╗"
  echo "  ║       Cursor Bridge Server        ║"
  echo "  ╚═══════════════════════════════════╝"
  echo -e "${NC}"
}

is_running() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid=$(cat "$PID_FILE")
    if kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$PID_FILE"
  fi
  return 1
}

check_deps() {
  if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo -e "${YELLOW}[!] node_modules not found. Running npm install...${NC}"
    cd "$SCRIPT_DIR" && npm install
  fi

  if [ ! -f "$SCRIPT_DIR/.env" ] && [ ! -n "${CURSOR_API_KEY:-}" ]; then
    echo -e "${RED}[✗] Missing .env file or CURSOR_API_KEY environment variable.${NC}"
    echo "  Create .env from template:"
    echo "    cp .env.example .env"
    echo "    # then set CURSOR_API_KEY=your_key"
    exit 1
  fi
}

start_dev() {
  print_banner
  check_deps

  if is_running; then
    local pid
    pid=$(cat "$PID_FILE")
    echo -e "${YELLOW}[!] Bridge already running (PID: $pid)${NC}"
    echo "  Stop it first: ./stop.sh"
    exit 1
  fi

  echo -e "${GREEN}[→] Starting cursor-bridge (dev mode)...${NC}"
  cd "$SCRIPT_DIR"
  npx tsx src/index.ts >> "$LOG_FILE" 2>&1 &
  local pid=$!
  echo "$pid" > "$PID_FILE"

  sleep 2

  if kill -0 "$pid" 2>/dev/null; then
    local port
    port=$(grep -E '^BRIDGE_PORT=' "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "19840")
    port=${port:-19840}
    echo -e "${GREEN}[✓] Bridge started successfully${NC}"
    echo -e "  PID:  $pid"
    echo -e "  URL:  http://127.0.0.1:${port}"
    echo -e "  Log:  $LOG_FILE"
    echo ""
    echo -e "  Stop:  ${CYAN}./stop.sh${NC}"
    echo -e "  Logs:  ${CYAN}tail -f $LOG_FILE${NC}"
  else
    echo -e "${RED}[✗] Bridge failed to start. Check logs:${NC}"
    echo "  tail -20 $LOG_FILE"
    rm -f "$PID_FILE"
    exit 1
  fi
}

start_foreground() {
  print_banner
  check_deps

  if is_running; then
    local pid
    pid=$(cat "$PID_FILE")
    echo -e "${YELLOW}[!] Bridge already running (PID: $pid)${NC}"
    exit 1
  fi

  echo -e "${GREEN}[→] Starting cursor-bridge (foreground)...${NC}"
  echo -e "  Press Ctrl+C to stop\n"
  cd "$SCRIPT_DIR"
  exec npx tsx src/index.ts
}

case "${1:-}" in
  --fg|--foreground)
    start_foreground
    ;;
  *)
    start_dev
    ;;
esac
