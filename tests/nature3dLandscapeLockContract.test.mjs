// tests/nature3dLandscapeLockContract.test.mjs
//
// PUBG / BGMI contract: tapping Sanctuary on a phone OPENS the 3D world
// already rotated to landscape. System auto-rotate ON or OFF does not
// matter. Leaving the world locks straight back to portrait.

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const ORIENT = read("src/utils/appOrientation.ts");
const PAGE = read("src/nature3d/NatureStudioPage.tsx");
const NAV = read("src/components/BottomNav.tsx");
const CSS = read("src/index.css");
const PLUGIN = read("android/app/src/main/java/app/eduvora/shop/AppOrientationPlugin.java");
const MAIN = read("android/app/src/main/java/app/eduvora/shop/MainActivity.java");
const orientCode = ORIENT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("Sanctuary forces landscape on open, even if auto-rotate is off", () => {
  assert.match(orientCode, /export const lockAppToLandscape/, "a dedicated landscape lock exists");
  assert.match(orientCode, /orientation\.lock\(\"landscape\"\)/, "Web Orientation API locks landscape");
  assert.match(orientCode, /tryCapacitorLockLandscape/, "native lock is attempted");
  assert.match(orientCode, /lockLandscape/, "the custom plugin's landscape method is called");
  assert.match(orientCode, /enterNatureStudioRotation/, "the studio entry point exists");
  const enter = orientCode.slice(
    orientCode.indexOf("export const enterNatureStudioRotation"),
    orientCode.indexOf("export const exitNatureStudioRotation"),
  );
  assert.match(enter, /lockAppToLandscape\(\)/, "entry locks landscape, it does not unlock");
  assert.doesNotMatch(enter, /unlockAppRotation\(\)/, "Sanctuary must not fall back to free rotation");
});

test("the Sanctuary footer button locks landscape on the user gesture, then opens", () => {
  assert.match(NAV, /lockAppToLandscape\(\)/, "the click itself fires the lock (user gesture)");
  assert.match(NAV, /window\.location\.hash = \"#\/nature-studio\"/, "then the world opens");
});

test("the studio page enters the landscape lock on mount and restores portrait on exit", () => {
  assert.match(PAGE, /enterNatureStudioRotation\(\)/);
  assert.match(PAGE, /return \(\) => exitNatureStudioRotation\(\)/);
  assert.match(PAGE, /data-sanctuary-root/, "the stage is tagged for the CSS fallback");
  assert.match(PAGE, /host\.clientWidth/, "resize uses laid-out size, not the rotated AABB");
});

test("native Android uses SENSOR_LANDSCAPE so auto-rotate OFF still rotates", () => {
  assert.match(PLUGIN, /lockLandscape/, "plugin exposes lockLandscape");
  assert.match(PLUGIN, /SCREEN_ORIENTATION_SENSOR_LANDSCAPE/, "sensor landscape ignores auto-rotate");
  assert.match(MAIN, /lockLandscapeForSanctuary/, "the activity can force landscape");
});

test("a CSS 90° fallback rotates the stage if the browser refuses the lock", () => {
  assert.match(
    CSS,
    /html\[data-phone-device="true"\]\[data-nature-studio-active="true"\] \[data-sanctuary-root\]/,
    "phones in portrait while the studio is open get the fallback",
  );
  assert.match(CSS, /transform:\s*rotate\(90deg\)/, "the stage is turned onto its side");
  assert.match(CSS, /width:\s*100dvh/, "the laid-out box is landscape-sized");
});
