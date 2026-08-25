#!/usr/bin/env bash
#
# THE INJECTION TEST FOR THE ARKANSAS/ALABAMA SALE GATE.
#
# scripts/verify-state-service.mjs on its own can only prove that the built
# pages carry no price, no Offer markup and no passed deadline. That is exactly
# as true of a page where somebody deleted the price by hand — and a hand-deleted
# price means the day Arkansas opens, twenty city pages come back silently
# unsellable and nobody finds out until the season is over.
#
# So this builds TWICE and asserts the findings INVERT:
#
#   1. Build the tree as it stands. Assert closed: no price, no Offer, no buy
#      button, no "August 17", and a notify signup present.
#   2. Empty SERVING_FROM. Rebuild. Assert open: the price, the Offer, the buy
#      buttons and the dated deadline copy ALL COME BACK, and the notify signup
#      is withdrawn.
#   3. Restore lib/stateService.js and rebuild, so the tree is left as it was.
#
# Step 2 is the one that matters. If it fails while step 1 passes, the copy was
# removed rather than gated.
#
# Usage: bash scripts/verify-state-service.sh
set -uo pipefail

cd "$(dirname "$0")/.."
LIB=lib/stateService.js
BACKUP="$(mktemp)"
STATUS=0

restore() {
  if [ -s "$BACKUP" ]; then
    cp "$BACKUP" "$LIB"
    rm -f "$BACKUP"
  fi
}
trap restore EXIT

cp "$LIB" "$BACKUP"

echo "=== 1/3  building the tree as it stands (Arkansas and Alabama closed) ==="
npx next build >/tmp/vss-build-closed.log 2>&1 || { echo "BUILD FAILED — see /tmp/vss-build-closed.log"; tail -20 /tmp/vss-build-closed.log; exit 1; }
node scripts/verify-state-service.mjs closed || STATUS=1

echo
echo "=== 2/3  emptying SERVING_FROM and rebuilding (both states selling) ==="
# Replace only the map body. Everything else in the module — the helpers, the
# note explaining why it exists — stays, so this exercises the real code path
# rather than a stub.
node -e '
  const fs = require("fs");
  const p = "lib/stateService.js";
  const src = fs.readFileSync(p, "utf8");
  const out = src.replace(
    /export const SERVING_FROM = \{[\s\S]*?\n\};/,
    "export const SERVING_FROM = {\n  // emptied by scripts/verify-state-service.sh\n};"
  );
  if (out === src) { console.error("INJECTION FAILED: SERVING_FROM literal not found — the test would have passed for the wrong reason"); process.exit(1); }
  fs.writeFileSync(p, out);
' || { echo "could not inject"; exit 1; }

npx next build >/tmp/vss-build-open.log 2>&1 || { echo "BUILD FAILED — see /tmp/vss-build-open.log"; tail -20 /tmp/vss-build-open.log; STATUS=1; }
node scripts/verify-state-service.mjs open || STATUS=1

echo
echo "=== 3/3  restoring and rebuilding ==="
restore
trap - EXIT
npx next build >/tmp/vss-build-restore.log 2>&1 || { echo "RESTORE BUILD FAILED — see /tmp/vss-build-restore.log"; exit 1; }
node scripts/verify-state-service.mjs closed >/dev/null || { echo "tree did not return to its closed state"; STATUS=1; }

echo
if [ "$STATUS" -eq 0 ]; then
  echo "PASS — the copy is gated, not deleted: it disappears when SERVING_FROM names the state and returns when it does not."
else
  echo "FAIL — see the assertions above."
fi
exit "$STATUS"
