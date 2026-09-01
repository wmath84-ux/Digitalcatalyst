import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const landing = fs.readFileSync("src/LandingApp.tsx", "utf8");
const overlays = fs.readFileSync("src/components/landing/LandingOverlays.tsx", "utf8");
const pwa = fs.readFileSync("src/utils/pwaInstall.ts", "utf8");

test("desktop browsers are not locked to landing", () => {
  assert.doesNotMatch(pwa, /export function isDesktopBrowserLocked/);
  assert.doesNotMatch(pwa, /showDesktopMaintenanceNotice/);
  assert.doesNotMatch(main, /isDesktopBrowserLocked/);
  assert.doesNotMatch(main, /desktopLocked/);
  assert.doesNotMatch(main, /showDesktopMaintenanceNotice/);
});

test("Open App on desktop enters the app instead of an under-preparation notice", () => {
  assert.match(landing, /window\.location\.hash = HOME_HASH/);
  assert.doesNotMatch(landing, /isDesktopBrowserLocked/);
  assert.doesNotMatch(landing, /showDesktopMaintenanceNotice/);
  assert.doesNotMatch(overlays, /Under Preparation/);
  assert.doesNotMatch(overlays, /desktop website is under preparation/);
});

test("installed mobile PWA skips landing regardless of login", () => {
  assert.match(pwa, /export function isInstalledMobilePwa/);
  assert.match(main, /skipLandingForInstalledMobilePwa/);
  assert.match(main, /isInstalledMobilePwa/);
  assert.doesNotMatch(main, /redirectingSignedInUser/);
});

test("Open App on mobile plays the landing exit transition into the app", () => {
  assert.match(landing, /setIsExiting\(true\)/);
  assert.match(landing, /window\.location\.hash = HOME_HASH/);
  assert.doesNotMatch(landing, /isMobileBrowserWithoutPwa/);
  assert.doesNotMatch(main, /mobileBrowserLocked/);
});
