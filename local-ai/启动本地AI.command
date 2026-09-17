#!/bin/bash
set -euo pipefail
service_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
"$service_directory/service.sh" start
