#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "[stub] integration-check.sh: $*" >&2
# Run tests/build; for stub, assume pass
exit 0
