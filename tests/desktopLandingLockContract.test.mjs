import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const landing = fs.readFileSync("src/LandingApp.tsx", "utf8");
const overlays = fs.readFileSync("src/components/landing/LandingOverlays.tsx", "utf8");
const pwa = fs.readFileSync("src/utils/pwaInstall.ts", "utf8");

test("desktop browser is locked to landing unless the PWA is installed", () => {
  assert.match(pwa, /export function isDesktopBrowserLocked/);
  assert.match(pwa, /!isMobileScreenSize\(\) && !isPwaInstalled\(\)/);
  assert.match(main, /isDesktopBrowserLocked/);
  assert.match(main, /desktopLocked && !hash\.startsWith\(ADMIN_HASH\)/);
  assert.match(main, /return <LandingApp \/>/);
});

test("Open App on desktop shows the under-preparation PWA notice", () => {
  assert.match(landing, /isDesktopBrowserLocked/);
  assert.match(landing, /showDesktopMaintenanceNotice/);
  assert.match(overlays, /Under Preparation/);
  assert.match(overlays, /Instead of using the website, install the PWA app and use it/);
  assert.match(overlays, /Install PWA/);
});

test("installed mobile PWA skips landing regardless of login", () => {
  assert.match(pwa, /export function isInstalledMobilePwa/);
  assert.match(main, /skipLandingForInstalledMobilePwa/);
  assert.match(main, /isInstalledMobilePwa/);
  assert.doesNotMatch(main, /redirectingSignedInUser/);
});
