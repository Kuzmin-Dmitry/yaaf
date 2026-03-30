#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "[stub] place-reviewed-artifact.sh: $*" >&2
# Simulate moving artifact from review to work
echo '{"status":"ok"}' 
