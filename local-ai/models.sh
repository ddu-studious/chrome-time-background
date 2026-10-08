#!/bin/bash
set -euo pipefail
model_directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
exec node "$model_directory/scripts/models.mjs" "$@"
