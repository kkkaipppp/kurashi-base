#!/usr/bin/env bash
# Run from project root containing app/. Never use this against uncommitted work without a backup.
set -euo pipefail
PACK="$(cd "$(dirname "$0")/.." && pwd)"
for f in "$PACK"/patches/*.patch; do git apply --check "$f"; done
for f in "$PACK"/patches/*.patch; do git apply "$f"; done
cp "$PACK/patches/eventConcurrency.ts" app/src/lib/eventConcurrency.ts
cp "$PACK/tests/go-data-deletion.test.ts" app/tests/go-data-deletion.test.ts
printf 'Applied patches; run cd app && npm run check and examine git diff.\n'
