#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "[stub] run-story-implement.sh: $*" >&2
# Minimal stub: load → select-executor → dispatch-dev-cycle
step="${1:-}"
case "$step" in
  load)
    echo '{"status":"ok","step":"load","storyId":"unknown","tier":"T1"}'
    ;;
  select-executor)
    echo '{"status":"ok","step":"select-executor","agent":"drake","strategy":"local-only","tier":"T1"}'
    ;;
  dispatch-dev-cycle)
    # Call lobster-dispatch for dev-cycle with required env
    bash "$ROOT/scripts/lobster-dispatch.sh" workflows/dev-cycle.lobster
    ;;
  *)
    echo "unknown step: $step" >&2
    exit 1
    ;;
esac
