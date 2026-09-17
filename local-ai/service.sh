#!/bin/bash
set -euo pipefail
service_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if command -v node >/dev/null 2>&1; then
  service_node="$(command -v node)"
elif [[ -x /opt/homebrew/bin/node ]]; then
  service_node=/opt/homebrew/bin/node
elif [[ -x /usr/local/bin/node ]]; then
  service_node=/usr/local/bin/node
else
  echo '未找到 Node.js，请先安装 Node.js 22.13 或更高版本。' >&2
  exit 1
fi
exec "$service_node" "$service_directory/scripts/service.mjs" "${1:-start}"
