#!/usr/bin/env bash
set -euo pipefail
SCHEMA="$1"
DIR="$2"

fail=0
for f in "$DIR"/*.json; do
  if npx ajv validate -c ajv-formats -s "$SCHEMA" -d "$f" --strict=true; then
    echo "❌ NEGATIVE passed unexpectedly: $f"
    fail=1
  else
    echo "✅ Expected failure: $f"
  fi
done
exit $fail
