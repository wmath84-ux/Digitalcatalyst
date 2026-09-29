// tests/responsiveShellMarkers.test.mjs
//
// Desktop → mobile transitions must never strand desktop markers.
//
// Repro (Galaxy Tab A9+): open the app in fullscreen landscape (desktop
// shell: left rail + top bar), then resize to a narrow 9:16 window. The
// mobile branch mounts — but the mobile header and footer stay invisible:
//
//   - `body.is-desktop` HARD-HIDES the footer
//     (`body.is-desktop [data-site-footer-nav] { display: none !important }`)
//   - `html[data-tablet-landscape-desktop="true"]` hides the mobile header
//     (`[data-site-header]`) AND switches off the whole mobile scroll model
//     (every mobile scroller rule is gated on
//     `html:not([data-tablet-landscape-desktop="true"])`)
//
// Both shells used to remove their resize listeners on unmount but LEAVE the
// markers behind. Worse, the final resize's `updateBodyClass` runs with the
// STALE `screenSize` state ("desktop") and re-adds `is-desktop` just before
// React commits the unmount — so the strand happened on EVERY desktop →
// narrow transition, not just on missed events.
//
// The contract: every document marker either shell SETS must also be REMOVED
// in its effect's unmount cleanup, so a stranded desktop marker is
// impossible. Whichever shell is mounted re-syncs the markers on mount.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const appShell = read("src/components/AppShell.tsx");
const desktopShell = read("src/components/DesktopShell.tsx");
const css = read("src/index.css");

// The unmount-cleanup block of each shell effect (everything after the
// "Unmount cleanup" comment to the end of the effect). The pins below read
// the markers each shell SETS straight out of the source, then require each
// one to be scrubbed in that shell's cleanup — so adding a new marker
// without cleaning it up fails the suite.
function cleanupOf(source, shellName) {
  const marker = "Unmount cleanup";
  const idx = source.indexOf(marker);
  assert.ok(idx !== -1, `${shellName} effect has an unmount-cleanup block`);
  return source.slice(idx);
}

test("body.is-desktop hard-hides the mobile footer (why the cleanup matters)", () => {
  assert.ok(
    css.includes("body.is-desktop [data-site-footer-nav]"),
    "index.css keeps the body.is-desktop footer hard-hide rule",
  );
});

test("data-tablet-landscape-desktop hides the mobile header (why the cleanup matters)", () => {
  assert.ok(
    css.includes('html[data-tablet-landscape-desktop="true"] [data-site-header]'),
    "index.css keeps the tablet-landscape-desktop header hide rule",
  );
});

test("AppShell cleanup removes every html attribute its check() sets", () => {
  const setAttrs = [...appShell.matchAll(/setAttribute\("(data-[^"]+)", "true"\)/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(setAttrs)].sort(),
    ["data-tablet-landscape", "data-tablet-landscape-desktop"],
    "AppShell manages exactly the two known tablet-landscape attributes",
  );
  const cleanup = cleanupOf(appShell, "AppShell");
  for (const attr of setAttrs) {
    assert.ok(
      cleanup.includes(`removeAttribute("${attr}")`),
      `AppShell cleanup removes ${attr}`,
    );
  }
});

test("AppShell still syncs the attributes live on resize (cleanup is extra, not a replacement)", () => {
  // The check() body (before the cleanup comment) must keep both its live
  // setAttribute AND removeAttribute branches — the cleanup only covers the
  // unmount path.
  const live = appShell.slice(0, appShell.indexOf("Unmount cleanup"));
  assert.ok(live.includes('setAttribute("data-tablet-landscape-desktop", "true")'));
  assert.ok(live.includes('removeAttribute("data-tablet-landscape-desktop")'));
  assert.ok(live.includes('setAttribute("data-tablet-landscape", "true")'));
  assert.ok(live.includes('removeAttribute("data-tablet-landscape")'));
});

test("DesktopShell cleanup removes every body class its effect adds", () => {
  const added = [...desktopShell.matchAll(/classList\.add\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(added)].sort(),
    ["is-desktop", "is-mobile", "is-tablet", "is-tablet-landscape", "is-wide-tablet"],
    "DesktopShell manages exactly the five known body classes",
  );
  const cleanup = cleanupOf(desktopShell, "DesktopShell");
  assert.ok(cleanup.includes("classList.remove("), "DesktopShell cleanup scrubs body classes");
  for (const cls of added) {
    assert.ok(cleanup.includes(`"${cls}"`), `DesktopShell cleanup removes body.${cls}`);
  }
});

test("DesktopShell cleanup removes every html attribute its effect sets", () => {
  const setAttrs = [...desktopShell.matchAll(/setAttribute\("(data-[^"]+)", "true"\)/g)].map((m) => m[1]);
  assert.deepEqual(
    [...new Set(setAttrs)].sort(),
    ["data-tablet-landscape", "data-tablet-landscape-desktop", "data-wide-tablet"],
    "DesktopShell manages exactly the three known html attributes",
  );
  const cleanup = cleanupOf(desktopShell, "DesktopShell");
  for (const attr of setAttrs) {
    assert.ok(
      cleanup.includes(`removeAttribute("${attr}")`),
      `DesktopShell cleanup removes ${attr}`,
    );
  }
});

test("DesktopShell still syncs markers live on resize/orientation (cleanup is extra)", () => {
  const live = desktopShell.slice(0, desktopShell.indexOf("Unmount cleanup"));
  assert.ok(live.includes('classList.add("is-desktop")'));
  assert.ok(live.includes('setAttribute("data-tablet-landscape-desktop", "true")'));
  assert.ok(live.includes('removeAttribute("data-tablet-landscape-desktop")'));
  assert.ok(live.includes('window.addEventListener("resize", updateBodyClass)'));
  assert.ok(live.includes('window.addEventListener("orientationchange", updateBodyClass)'));
});
