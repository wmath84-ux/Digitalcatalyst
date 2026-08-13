import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const manifest = JSON.parse(fs.readFileSync("public/manifest.webmanifest", "utf8"));

test("signed-in learners skip landing and open Home", () => {
  assert.match(main, /user\.role !== "admin" && landingRouteRequested && !desktopLocked/);
  assert.match(main, /history\.replaceState[\s\S]*HOME_HASH/);
  assert.match(main, /setHash\(HOME_HASH\)/);
});

test("desktop browser stays on landing and never opens the learner app", () => {
  assert.match(main, /isDesktopBrowserLocked/);
  assert.match(main, /desktopLocked/);
  assert.match(main, /showDesktopMaintenanceNotice/);
  assert.match(main, /if \(desktopLocked && !hash\.startsWith\(ADMIN_HASH\)/);
});

test("admin remains exempt and still sees landing", () => {
  assert.match(main, /user\.role === "admin"/);
  assert.match(main, /if \(!hash \|\| hash\.startsWith\(LANDING_HASH\)\) return <LandingApp/);
});

test("pre-JavaScript and React loading screens use the exact PWA icon", () => {
  const pwaIcon = manifest.icons.find((icon) => icon.sizes === "192x192")?.src;
  assert.equal(pwaIcon, "/icons/icon-192x192.svg");
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
