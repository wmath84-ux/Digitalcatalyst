// tests/appPortraitOrientationLockContract.test.mjs
//
// Contract for the portrait lock: every screen is locked to portrait on
// PHONE devices, and the ONLY place rotation unlocks is the Course Player.
// Since PR #487/#491 the device decision is `isPhoneDevice()`, which is
// ORIENTATION-INDEPENDENT: it reads the device's smaller physical CSS
// dimension (`Math.min(screen.width, screen.height) < 600`), so a phone
// held in landscape is still recognised as a phone, and a real tablet /
// desktop is never locked no matter how the window is sized. The app also
// publishes this decision as `data-phone-device` on <html>, which CSS uses
// to re-gate the landscape touch-action freeze and the "rotate your phone"
// overlay so a tablet window is never touch-frozen or shown the overlay.
//
// On a phone, a full-screen rotate-back overlay covers landscape while the
// player is closed.

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

test("portrait lock and rotate overlay are gated on a phone device, not viewport width", () => {
  // PR #487/#491 replaced the old `isPwaInstalled()` + `innerWidth >= 768`
  // gating with an orientation-independent `isPhoneDevice()`: a phone is a
  // phone no matter which way it is held (its short side is always < 600px),
  // and a real tablet is never locked even though its landscape width can be
  // far wider than a phone's. This is the tablet exemption.
  assert.match(orientation, /isPhoneDevice\(\)/);
  // The lock decision itself is just "is this a phone?" — nothing else.
  assert.match(orientation, /return isPhoneDevice\(\);/);
  // The app publishes the device decision as an explicit, lock-independent
  // signal on <html>: `data-phone-device` is set when `isPhoneDevice()` is
  // true and removed otherwise. CSS re-gates the landscape touch-freeze and
  // the "rotate your phone" overlay on this signal.
  assert.match(orientation, /setAttribute\("data-phone-device", "true"\)/);
  assert.match(orientation, /removeAttribute\("data-phone-device"\)/);
  assert.match(orientation, /html\.setAttribute|html\.removeAttribute/);
  assert.doesNotMatch(orientation, /window\.innerWidth >= 768/);
});

test("the landscape touch-action freeze and overlay are gated on data-phone-device", () => {
  const css = fs.readFileSync("src/index.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  // The freeze only applies to a real phone in landscape outside the player.
  assert.match(css, /html\[data-phone-device="true"\]:not\(\[data-course-player-active="true"\]\) body\s*\{\s*touch-action: none/);
  // A tablet window sized into the narrow landscape band keeps normal panning —
  // never touch-frozen, because `touch-action` intersects down the ancestor
  // chain and an ungated `none` here would freeze every tablet scroller.
  assert.match(css, /html:not\(\[data-phone-device="true"\]\) body\s*\{\s*touch-action: auto/);
  // Belt-and-braces: the forced overlay can never show on a tablet.
  assert.match(css, /html\[data-phone-device="true"\]\[data-orientation-locked="portrait"\]:not\(\[data-course-player-active="true"\]\) \[data-app-portrait-overlay\]\s*\{\s*display: grid !important/);
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
  // The overlay is shown ONLY on a phone in landscape outside the course
  // player. `phone` comes from `isPhoneDevice()` (orientation-independent),
  // so a phone rotated to landscape is still caught, while a tablet/desktop
  // is never — this is the tablet exemption.
  assert.match(guard, /if \(!phone \|\| playerOpen \|\| !landscape\) return null;/);
  assert.match(guard, /setPhone\(isPhoneDevice\(\)\)/);
  assert.match(guard, /useState\(isPhoneDevice\)/);
});

test("installed PWA manifest is hard-locked to portrait; runtime unlock frees the player", () => {
  // The manifest hard-locks to portrait (one of the enforcement layers). The
  // runtime Screen Orientation API + Capacitor unlock (enterCoursePlayerRotation
  // → screen.orientation.unlock) is what frees the Course Player for landscape
  // lessons — it does NOT need the manifest to say "any".
  assert.match(manifest, /"orientation": "portrait"/);
  // The runtime unlock path exists for the player.
  assert.match(orientation, /screen\.orientation\.unlock\(\)/);
  assert.match(orientation, /tryCapacitorUnlock/);
});
