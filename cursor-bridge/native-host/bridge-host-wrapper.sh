#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
exec "/usr/local/bin/node" "/Users/liuqingwen/Firm/Private/work-space/ai-coding/chrome-extensions/chrome-time-background/cursor-bridge/native-host/bridge-host.js" "$@"
