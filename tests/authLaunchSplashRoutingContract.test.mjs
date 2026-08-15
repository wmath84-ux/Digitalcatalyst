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
  assert.match(main, /installedMobilePwa && landingRouteRequested && !desktopLocked/);
  assert.match(main, /history\.replaceState[\s\S]*HOME_HASH/);
  assert.match(main, /setHash\(HOME_HASH\)/);
});

test("desktop browser stays on landing and never opens the learner app", () => {
  assert.match(main, /isDesktopBrowserLocked/);
  assert.match(main, /desktopLocked/);
  assert.match(main, /showDesktopMaintenanceNotice/);
  assert.match(main, /if \(desktopLocked && !hash\.startsWith\(ADMIN_HASH\)/);
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

test("pre-JavaScript and React loading screens use the exact PWA icon", () => {
  // The manifest lists several 192x192 entries (PNG for browsers that
  // reject SVG icons, SVG for the rest). A bare `.find()` on the size
  // picked whichever happened to be first, so this test broke when the
  // PNG was added even though both screens were correct. Assert that
  // the icon the loaders use is genuinely declared at that size.
  const icons192 = manifest.icons.filter((icon) => icon.sizes === "192x192").map((icon) => icon.src);
  assert.ok(icons192.includes("/icons/icon-192x192.svg"), `192x192 SVG missing from manifest: ${icons192.join(", ")}`);
  assert.match(html, /src="\/icons\/icon-192x192\.svg"/);
  assert.match(main, /src="\/icons\/icon-192x192\.svg"/);
});

test("launch screen has transition, reduced-motion support and progress bar", () => {
  assert.match(html, /eduvora-logo-in/);
  assert.match(html, /eduvora-logo-float/);
  assert.match(html, /eduvora-progress/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(main, /app-boot-bar/);
});
