import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));

test("an installed mobile PWA skips landing and opens Home", () => {
  // The rule this used to assert — "any signed-in non-admin skips
  // landing" — is no longer the product behaviour. Landing is now the
  // entry point for everyone in a browser, logged in or not, and only
  // an INSTALLED mobile PWA goes straight to Home (see the comment
  // above skipLandingForInstalledMobilePwa in src/main.tsx). The test
  // was pinning the superseded policy, not catching a regression.
  assert.match(main, /installedMobilePwa && landingRouteRequested/);
  assert.match(main, /history\.replaceState[\s\S]*HOME_HASH/);
  assert.match(main, /setHash\(HOME_HASH\)/);
});

test("desktop browser can open the learner app from landing", () => {
  assert.doesNotMatch(main, /isDesktopBrowserLocked/);
  assert.doesNotMatch(main, /desktopLocked/);
  assert.doesNotMatch(main, /showDesktopMaintenanceNotice/);
});

test("main routing helpers stay intact so the production build can parse", () => {
  assert.match(main, /const navigateToCourse = /);
  assert.match(main, /const navigateToCheckout = /);
  assert.doesNotMatch(main, /navigateTdow/);
  assert.equal((main.match(/createRoot\(/g) || []).length, 1);
});

test("admin is exempt from the learner splash and landing still renders", () => {
  // Admins are excluded from the catalog-loading splash so the admin
  // panel is never gated behind a learner-only fetch.
  assert.match(main, /user\.role !== "admin" && catalogLoading/);
  assert.match(main, /if \(!hash \|\| hash\.startsWith\(LANDING_HASH\)\) return <LandingApp/);
});

test("pre-JavaScript and React loading screens play the exact EduOS mobile opening video", () => {
  // The opening splash is the shipped mobile MP4 — not a CSS recreation of it.
  assert.ok(!fs.existsSync("public/assets/animations/EduOS_app_opening.mp4"), "old opening MP4 must be removed");
  assert.ok(fs.existsSync("public/assets/animations/EduOS_app_opening_mobile.mp4"), "EduOS mobile opening MP4 is missing");
  const bytes = fs.readFileSync("public/assets/animations/EduOS_app_opening_mobile.mp4");
  assert.ok(bytes.length > 10_000, "EduOS mobile opening MP4 is empty");
  assert.equal(bytes.subarray(4, 8).toString("latin1"), "ftyp");
  assert.match(html, /src="\/assets\/animations\/EduOS_app_opening_mobile\.mp4"/);
  assert.match(main, /APP_OPENING_VIDEO_SRC = "\/assets\/animations\/EduOS_app_opening_mobile\.mp4"/);
  assert.match(main, /className="app-boot-video"/);
  assert.match(main, /playMobileOpening/);
  assert.match(main, /viewportCategory === "mobile"/);
  assert.match(html, /innerWidth < 768/);
  // PWA icon remains declared at 192×192 for installability (not the splash).
  const icons192 = manifest.icons.filter((icon) => icon.sizes === "192x192").map((icon) => icon.src);
  assert.ok(icons192.includes("/icons/icon-192x192.svg"), `192x192 SVG missing from manifest: ${icons192.join(", ")}`);
});

test("launch screen plays the opening video and respects reduced motion", () => {
  assert.match(html, /id="app-opening-video"/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(main, /prefers-reduced-motion: reduce/);
  assert.match(main, /onEnded/);
  assert.doesNotMatch(main, /app-boot-bar/);
  assert.doesNotMatch(html, /eduvora-logo-in/);
});
