#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "[stub] run-intake-dispatch.sh: $*" >&2
# Minimal: should classify and set fields; we'll just exit 0
exit 0
