// tests/appPortraitOrientationLockContract.test.mjs
//
// Contract for the installed-PWA portrait lock: every PWA screen is locked
// to portrait, and the ONLY place rotation unlocks is the Course Player.
// Regular browser tabs are never locked so visitors can install the app.
// Inside the PWA, a full-screen rotate-back overlay covers landscape when
// the native lock is refused (iOS).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const orientation = fs.readFileSync("src/utils/appOrientation.ts", "utf8");
const guard = fs.readFileSync("src/components/PortraitOnlyGuard.tsx", "utf8");
const player = fs.readFileSync("src/CoursePlayerApp.tsx", "utf8");
const manifest = fs.readFileSync("public/manifest.webmanifest", "utf8");

test("one global portrait guard is mounted beside the app shell", () => {
  assert.match(main, /import PortraitOnlyGuard/);
  assert.match(main, /<PortraitOnlyGuard \/>/);
});

test("the installed PWA is locked to portrait by default via the orientation API", () => {
  assert.match(orientation, /orientation\.lock\("portrait"\)/);
  assert.match(guard, /lockAppToPortrait\(\)/);
  // Rejections (no fullscreen / iOS / desktop) never crash the app.
  assert.match(orientation, /result\.catch|catch\(\(\) =>/);
});

test("portrait lock and rotate overlay apply only after the PWA is installed", () => {
  // Browser tabs must stay free so landing / Install PWA stay reachable.
  assert.match(orientation, /isPwaInstalled\(\)/);
  assert.match(guard, /isPwaInstalled/);
  assert.match(guard, /if \(isPwaInstalled\(\) && !isCoursePlayerRotationActive\(\)\) lockAppToPortrait\(\)/);
});

test("only mounting the Course Player unlocks rotation", () => {
  assert.match(player, /enterCoursePlayerRotation\(\)/);
  assert.match(player, /return \(\) => exitCoursePlayerRotation\(\)/);
  assert.match(orientation, /screen\.orientation\.unlock\(\)/);
  assert.match(orientation, /coursePlayerActive = true/);
});

test("leaving the player locks straight back to portrait", () => {
  assert.match(orientation, /coursePlayerActive = false/);
  assert.match(orientation, /notifyRotationChange\(\)/);
});

test("a rotate-back overlay covers landscape while the player is closed", () => {
  assert.match(guard, /data-app-portrait-overlay/);
  assert.match(guard, /window\.innerWidth > window\.innerHeight/);
  assert.match(guard, /Rotate your phone/);
  // Installed PWA only. Never on a browser tab, desktop, or the open player.
  assert.match(guard, /!installed \|\| !mobile \|\| playerOpen \|\| !landscape/);
});

test("installed PWA manifest keeps dynamic rotation enabled for the player", () => {
  // "any" lets the runtime lock/unlock decide; a hard-coded "portrait"
  // here would permanently break landscape lessons in the installed PWA.
  assert.match(manifest, /"orientation": "any"/);
});
