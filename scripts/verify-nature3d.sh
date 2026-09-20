#!/usr/bin/env bash
# Verify the 3D Study Sanctuary engine.
#
#   bash scripts/verify-nature3d.sh
#
# Two harnesses, both run with plain `node` (no browser, no GPU):
#
#   1. shaders.mts  — replays every shader injection against three's REAL
#                     ShaderLib, resolves the `#include <chunk>` graph exactly
#                     as WebGLProgram would, and asserts the anchors were
#                     consumed, no varying is orphaned, no declaration is
#                     emitted twice, and every feature is actually present.
#   2. world.mts    — builds the real rock kit, grass field, forest and the
#                     environmental field in Node and asserts the invariants a
#                     browser would otherwise only show us in a screenshot.
#
# Both need esbuild (a devDependency) purely to compile the TypeScript; the
# bundle goes to /tmp so nothing lands in the repo.
set -euo pipefail
cd "$(dirname "$0")/.."

status=0
for harness in shaders world; do
  echo "── nature3d :: $harness ──────────────────────────────────────────"
  npx esbuild "scripts/verify-nature3d-$harness.mts" \
    --bundle --format=esm --platform=node \
    --outfile="/tmp/dc-nature3d-$harness.mjs" --log-level=warning
  node "/tmp/dc-nature3d-$harness.mjs" || status=1
  echo
done

if [ "$status" -ne 0 ]; then
  echo "NATURE3D VERIFICATION FAILED"
  exit 1
fi
echo "NATURE3D VERIFICATION PASSED"
