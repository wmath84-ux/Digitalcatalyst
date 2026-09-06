// tests/pwaInstallabilityContract.test.mjs
//
// Chrome/Android will not offer "Install app" unless:
//   · the page links a valid web-app manifest on first paint
//   · that manifest has name, standalone display, and 192/512 PNG icons
//   · the service worker actually activates (a failed install event
//     aborts registration)
//
// A later branding update still upgrades the link to /api/manifest, but
// ONLY after a probe confirms the response is a real manifest. Pointing
// the HTML at /api/manifest alone made install fail whenever the Hobby
// rewrite served leaderboard JSON instead.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
const branding = fs.readFileSync("src/utils/branding.ts", "utf8");
const leaderboard = fs.readFileSync("api/referral-leaderboard.ts", "utf8");
const manifestApi = fs.readFileSync("api/_lib/manifest.ts", "utf8");
const vercel = fs.readFileSync("vercel.json", "utf8");
const sw = fs.readFileSync("public/sw.js", "utf8");
const overlays = fs.readFileSync("src/components/landing/LandingOverlays.tsx", "utf8");
const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));

test("the HTML ships a static installable manifest so the web app can install without the API", () => {
  assert.match(html, /rel="manifest"/);
  assert.match(html, /href="\/manifest\.webmanifest"/);
  assert.doesNotMatch(html, /href="\/api\/manifest"/);
});

test("branding upgrades to /api/manifest only after an installability probe", () => {
  assert.match(branding, /\/api\/manifest\?v=/);
  assert.match(branding, /isInstallableManifest/);
  assert.match(branding, /STATIC_MANIFEST_HREF/);
  assert.match(branding, /\/manifest\.webmanifest/);
  assert.match(branding, /await fetch\(dynamicUrl/);
});

test("the static manifest meets Chrome install criteria and keeps the portrait lock", () => {
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.orientation, "portrait");
  assert.equal(manifest.start_url, "/#/home");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.id, "/");
  assert.ok(manifest.name || manifest.short_name);
  const png = manifest.icons.filter((icon) => icon.type === "image/png");
  assert.ok(png.some((icon) => icon.sizes === "192x192"), "192 PNG required to install");
  assert.ok(png.some((icon) => icon.sizes === "512x512"), "512 PNG required to install");
  assert.ok(
    fs.existsSync("public/icons/icon-192x192.png") && fs.existsSync("public/icons/icon-512x512.png"),
    "PNG icon files must exist",
  );
});

test("the dynamic manifest handler still emits an installable portrait PWA document", () => {
  assert.match(manifestApi, /application\/manifest\+json/);
  assert.match(manifestApi, /id: "\/"/);
  assert.match(manifestApi, /display: "standalone"/);
  assert.match(manifestApi, /orientation: "portrait"/);
  assert.match(manifestApi, /start_url: "\/#\/home"/);
});

test("the Hobby rewrite still shares the leaderboard function but tags the manifest route", () => {
  assert.match(vercel, /\/api\/manifest/);
  assert.match(vercel, /route=manifest/);
  assert.match(vercel, /route=brand-icon/);
  assert.match(leaderboard, /matchesApiRoute\(reqWithUrl, "manifest"\)/);
  assert.match(leaderboard, /routeQuery\(req\) === route/);
  assert.match(leaderboard, /handleManifest/);
  assert.match(leaderboard, /handleBrandIcon/);
});

test("service worker install cannot abort PWA installability", () => {
  assert.match(sw, /addEventListener\('install'/);
  assert.match(sw, /addEventListener\('fetch'/);
  assert.match(sw, /cache\.addAll\(APP_SHELL\)\.catch/);
  assert.match(sw, /skipWaiting/);
});

test("the install panel shows Add-to-Home-Screen help when Chrome has no prompt", () => {
  // `openInstallPanel()` moved to the shared pwaInstall util (the landing CTA
  // / hero call it); the overlay opens on the dispatched event.
  const pwaInstall = fs.readFileSync("src/utils/pwaInstall.ts", "utf8");
  assert.match(pwaInstall, /export function openInstallPanel/);
  assert.match(overlays, /PWA_INSTALL_OPEN_EVENT/);
  assert.match(overlays, /isInstallPromptReady/);
  assert.match(overlays, /setManualHelp\(!alreadyInstalled && !isInstallPromptReady\(\)\)/);
  assert.match(overlays, /Add to Home Screen/);
});
