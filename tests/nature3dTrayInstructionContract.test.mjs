// tests/nature3dTrayInstructionContract.test.mjs
//
// The written instruction above the sanctuary bottom tray ("Two fingers
// fly · double-tap to go") is a first-open hint, not a permanent caption:
// it must be on when the world opens, and hideTrayInstruction() must take
// it off within 3 seconds of the meadow coming up.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const PAGE = readFileSync(new URL("../src/nature3d/NatureStudioPage.tsx", import.meta.url), "utf8");
const code = PAGE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("the bottom-tray instruction is visible on open and hides within 3s", () => {
  assert.match(code, /Two fingers fly · double-tap to go/, "the written tray instruction is still the copy");
  assert.match(code, /data-tray-instruction/, "the hint is tagged so it can be found in the HUD");
  assert.match(code, /const \[trayInstructionVisible, setTrayInstructionVisible\] = useState\(true\)/, "it starts ON when the sanctuary opens");
  assert.match(code, /const hideTrayInstruction = useCallback/, "a named hide function exists");
  assert.match(code, /setTrayInstructionVisible\(false\)/, "that function actually hides it");
  assert.match(code, /TRAY_INSTRUCTION_MS = 3000/, "the cap is 3 seconds, not longer");
  assert.match(code, /setTimeout\(hideTrayInstruction, TRAY_INSTRUCTION_MS\)/, "the timer calls the hide function");
  assert.match(code, /if \(booting \|\| !trayInstructionVisible\)/, "the clock starts once the world is up, not behind the boot veil");
  assert.match(
    code,
    /!hudHidden && trayVisible && trayInstructionVisible/,
    "the pill leaves the HUD when the timer fires",
  );
});
