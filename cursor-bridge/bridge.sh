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

resolve_node() {
  local candidates=(
    "/opt/homebrew/bin/node"
    "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node/" 2>/dev/null | sort -V | tail -1)/bin/node"
    "/usr/local/bin/node"
  )
  for candidate in "${candidates[@]}"; do
    if [ -x "$candidate" ] 2>/dev/null; then
      local arch
      arch=$("$candidate" -e "process.stdout.write(process.arch)" 2>/dev/null || echo "")
      if [ "$arch" = "arm64" ] && [ "$(uname -m)" = "arm64" ]; then
        echo "$candidate"
        return 0
      fi
      if [ "$arch" = "x64" ] && [ "$(uname -m)" = "x86_64" ]; then
        echo "$candidate"
        return 0
      fi
    fi
  done
  local fallback
  fallback=$(which node 2>/dev/null || echo "")
  if [ -n "$fallback" ]; then
    echo "$fallback"
    return 0
  fi
  echo ""
  return 1
}

BRIDGE_NODE="$(resolve_node)"
if [ -z "$BRIDGE_NODE" ]; then
  echo -e "${RED}[✗] No suitable Node.js found. Install Node.js first.${NC}"
  exit 1
fi
BRIDGE_NODE_DIR="$(dirname "$BRIDGE_NODE")"
BRIDGE_NPX="$BRIDGE_NODE_DIR/npx"
BRIDGE_NPM="$BRIDGE_NODE_DIR/npm"

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
  local node_arch
  node_arch=$("$BRIDGE_NODE" -e "process.stdout.write(process.arch)")
  echo -e "${CYAN}[i] Using Node: $BRIDGE_NODE ($node_arch, $("$BRIDGE_NODE" -e "process.stdout.write(process.version)"))${NC}"

  if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    echo -e "${YELLOW}[!] node_modules not found. Running npm install...${NC}"
    cd "$SCRIPT_DIR" && "$BRIDGE_NPM" install
  fi

  if [ ! -f "$SCRIPT_DIR/.env" ] && [ -z "${CURSOR_API_KEY:-}" ]; then
    echo -e "${RED}[✗] Missing .env file or CURSOR_API_KEY environment variable.${NC}"
    echo "  Create .env from template:"
    echo "    cp .env.example .env"
    echo "    # then set CURSOR_API_KEY=your_key"
    exit 1
  fi
}

do_start() {
  print_banner
  check_deps

  if is_running; then
    local pid
    pid=$(cat "$PID_FILE")
    echo -e "${YELLOW}[!] Bridge already running (PID: $pid)${NC}"
    echo "  Use: $0 restart"
    exit 1
  fi

  echo -e "${GREEN}[→] Starting cursor-bridge (dev mode)...${NC}"
  cd "$SCRIPT_DIR"
  "$BRIDGE_NPX" tsx src/index.ts >> "$LOG_FILE" 2>&1 &
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
  else
    echo -e "${RED}[✗] Bridge failed to start. Check logs:${NC}"
    echo "  tail -20 $LOG_FILE"
    rm -f "$PID_FILE"
    exit 1
  fi
}

do_start_fg() {
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
  exec "$BRIDGE_NPX" tsx src/index.ts
}

do_stop() {
  if ! is_running; then
    echo -e "${YELLOW}[!] Bridge is not running.${NC}"
    local orphan
    orphan=$(pgrep -f "tsx.*src/index.ts" 2>/dev/null || true)
    if [ -n "$orphan" ]; then
      echo -e "${YELLOW}[!] Found orphan process(es): $orphan — killing...${NC}"
      echo "$orphan" | xargs kill 2>/dev/null || true
      echo -e "${GREEN}[✓] Killed orphan processes.${NC}"
    fi
    return 0
  fi

  local pid
  pid=$(cat "$PID_FILE")
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

do_restart() {
  print_banner
  if is_running; then
    do_stop
    sleep 1
  fi
  do_start
}

do_status() {
  if is_running; then
    local pid
    pid=$(cat "$PID_FILE")
    local port
    port=$(grep -E '^BRIDGE_PORT=' "$SCRIPT_DIR/.env" 2>/dev/null | cut -d= -f2 || echo "19840")
    port=${port:-19840}
    echo -e "${GREEN}[✓] Bridge is running${NC}"
    echo -e "  PID:  $pid"
    echo -e "  URL:  http://127.0.0.1:${port}"
    echo -e "  Log:  $LOG_FILE"
  else
    echo -e "${YELLOW}[✗] Bridge is not running.${NC}"
  fi
}

do_logs() {
  local lines="${1:-30}"
  if [ "${2:-}" = "-f" ] || [ "${1:-}" = "-f" ]; then
    tail -f "$LOG_FILE"
  else
    tail -"$lines" "$LOG_FILE"
  fi
}

print_help() {
  echo -e "${CYAN}Cursor Bridge Manager${NC}"
  echo ""
  echo "Usage: $0 <command>"
  echo ""
  echo "Commands:"
  echo "  start       Start the bridge in background (default)"
  echo "  start --fg  Start in foreground mode"
  echo "  stop        Stop the bridge gracefully"
  echo "  restart     Stop (if running) then start"
  echo "  status      Show bridge running status"
  echo "  logs [N]    Show last N lines of log (default: 30)"
  echo "  logs -f     Follow log output (tail -f)"
  echo "  help        Show this help message"
  echo ""
}

case "${1:-start}" in
  start)
    if [ "${2:-}" = "--fg" ] || [ "${2:-}" = "-f" ]; then
      do_start_fg
    else
      do_start
    fi
    ;;
  stop)
    do_stop
    ;;
  restart)
    do_restart
    ;;
  status|st)
    do_status
    ;;
  logs|log)
    do_logs "${2:-30}" "${3:-}"
    ;;
  help|-h|--help)
    print_help
    ;;
  *)
    echo -e "${RED}Unknown command: $1${NC}"
    print_help
    exit 1
    ;;
esac
