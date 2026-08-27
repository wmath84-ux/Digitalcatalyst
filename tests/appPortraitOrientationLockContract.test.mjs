// tests/appPortraitOrientationLockContract.test.mjs
//
// Contract for the installed-PWA portrait lock: every PWA screen is
// locked to portrait on PHONE-sized viewports, and the ONLY place
// rotation unlocks is the Course Player. Regular browser tabs are never
// locked so visitors can install the app. Tablets and desktop viewports
// (≥ 768 px) are NEVER locked — the tablet/desktop layouts are designed
// to work in any orientation, and locking them to portrait would push
// the user to the rotation guard's black screen.
//
// Inside the PWA on a phone, a full-screen rotate-back overlay covers
// landscape when the native lock is refused (iOS).

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
  // The lock / overlay is additionally gated on a phone-sized viewport
  // (`isMobileScreenSize()` returns true below 768 px). Tablets and
  // desktop sizes are NEVER locked, so a wide device never sees the
  // rotation guard's black screen.
  assert.match(orientation, /window\.innerWidth >= 768/);
  assert.match(guard, /isMobileScreenSize/);
  assert.match(guard, /isPwaInstalled\(\) && isMobileScreenSize\(\) && !isCoursePlayerRotationActive\(\)/);
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

test("a rotate-back overlay covers landscape while the player is closed (phones only)", () => {
  assert.match(guard, /data-app-portrait-overlay/);
  assert.match(guard, /window\.innerWidth > window\.innerHeight/);
  assert.match(guard, /Rotate your phone/);
  // Installed PWA + phone-sized viewport only. Never on a browser tab,
  // desktop, tablet, or the open player. The new `!phoneViewport` check
  // is the tablet exemption that removes the rotation guard for
  // non-phone screens.
  assert.match(guard, /!installed \|\| !mobile \|\| !phoneViewport \|\| playerOpen \|\| !landscape/);
});

test("installed PWA manifest keeps dynamic rotation enabled for the player", () => {
  // "any" lets the runtime lock/unlock decide; a hard-coded "portrait"
  // here would permanently break landscape lessons in the installed PWA.
  assert.match(manifest, /"orientation": "any"/);
});
