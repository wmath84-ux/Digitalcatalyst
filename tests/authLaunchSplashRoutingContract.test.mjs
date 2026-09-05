import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const html = fs.readFileSync("index.html", "utf8");
const opening = fs.readFileSync("src/utils/openingSplash.ts", "utf8");
const brandingPage = fs.readFileSync("src/admin/pages/BrandingPage.tsx", "utf8");
const previewPage = fs.readFileSync("src/components/dev/OpeningAnimationPreview.tsx", "utf8");
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

test("pre-JavaScript and React loading screens play the exact EduOS opening videos", () => {
  // Opening splash is the shipped MP4s — not a CSS recreation of them.
  assert.ok(!fs.existsSync("public/assets/animations/EduOS_app_opening.mp4"), "old opening MP4 must be removed");
  for (const file of [
    "public/assets/animations/EduOS_app_opening_mobile.mp4",
    "public/assets/animations/EduOS_app_opening_desktop.mp4",
  ]) {
    assert.ok(fs.existsSync(file), `${file} is missing`);
    const bytes = fs.readFileSync(file);
    assert.ok(bytes.length > 10_000, `${file} is empty`);
    assert.equal(bytes.subarray(4, 8).toString("latin1"), "ftyp");
  }
  assert.match(html, /\/assets\/animations\/EduOS_app_opening_mobile\.mp4/);
  assert.match(html, /\/assets\/animations\/EduOS_app_opening_desktop\.mp4/);
  assert.match(opening, /APP_OPENING_VIDEO_MOBILE_SRC = "\/assets\/animations\/EduOS_app_opening_mobile\.mp4"/);
  assert.match(opening, /APP_OPENING_VIDEO_DESKTOP_SRC = "\/assets\/animations\/EduOS_app_opening_desktop\.mp4"/);
  // The clip band is decided in ONE place and mirrored pre-React.
  assert.match(opening, /width < OPENING_MOBILE_MAX_WIDTH \? "mobile" : "desktop"/);
  assert.match(opening, /OPENING_MOBILE_MAX_WIDTH = 768/);
  assert.match(html, /window\.innerWidth < 768/);
  // The pre-React script must pick the same two files, never a CSS imitation.
  assert.match(html, /EduOS_app_opening_mobile\.mp4/);
  assert.match(html, /EduOS_app_opening_desktop\.mp4/);
  // React must not own the <video> at all (a remount used to abort playback).
  assert.doesNotMatch(main, /getElementById\("app-opening-video"\)/);
  assert.match(main, /attachOpeningSplash\(\);/);
  // PWA icon remains declared at 192×192 for installability (not the splash).
  const icons192 = manifest.icons.filter((icon) => icon.sizes === "192x192").map((icon) => icon.src);
  assert.ok(icons192.includes("/icons/icon-192x192.svg"), `192x192 SVG missing from manifest: ${icons192.join(", ")}`);
});

test("a branding save can never switch the opening off by accident", () => {
  // `=== true` persisted `false` for every save whose draft value was still
  // undefined — the one-line cause of "no opening on desktop AND mobile".
  assert.match(brandingPage, /const openingAnimationEnabled = merged\.openingAnimationEnabled !== false;/);
  assert.doesNotMatch(brandingPage, /merged\.openingAnimationEnabled === true/);
  // The admin can watch it without a cold boot.
  assert.match(brandingPage, /attachOpeningSplash\(\)\?\.replay\(\)/);
});

test("opening animation is on by default", () => {
  const branding = fs.readFileSync("src/utils/branding.ts", "utf8");
  assert.match(branding, /openingAnimationEnabled: true,/);
  assert.match(branding, /openingAnimationEnabled: data\?\.openingAnimationEnabled !== false/);
  assert.match(html, /openingAnimationEnabled !== false/);
});

test("the opening always paints something: card first, clip on top", () => {
  // A CSS-only brand card sits UNDER the video so a missing / slow /
  // undecodable clip degrades to the card instead of to a blank screen.
  assert.match(html, /class="app-boot-fallback"/);
  assert.match(html, /\.app-boot-fallback \{[^}]*opacity: 1/);
  assert.match(html, /\.app-boot-video \{[^}]*opacity: 0/);
  assert.match(html, /\[data-video="on"\] \.app-boot-video \{ opacity: 1; \}/);
  // Hiding is state-driven, never an inline `display` set by a stranger.
  assert.match(html, /#app-opening-splash\[data-opening="skipped"\][^}]*display: none !important/);
  // …and a stale cached shell cannot leave it hanging forever.
  assert.match(html, /app-boot-failsafe/);
  // The clip gets the whole screen until `ended`; every number below is a
  // backstop for a dead clip, not a deadline for a slow one. The old
  // `OPENING_FIRST_FRAME_GRACE_MS = 3_000` + 12 s ceiling are what truncated
  // the animation on real devices.
  assert.match(opening, /OPENING_MIN_VISIBLE_MS = 1_400/);
  assert.match(opening, /OPENING_LOAD_CEILING_MS = 20_000/);
  assert.match(opening, /OPENING_STALL_TIMEOUT_MS = 6_000/);
  assert.match(opening, /OPENING_HARD_CEILING_MS = 60_000/);
  assert.match(opening, /OPENING_HOLD_AFTER_END_MS = 260/);
  assert.doesNotMatch(opening, /OPENING_MAX_WAIT_MS|OPENING_FIRST_FRAME_GRACE_MS/);
  // `ended` (or a hard failure) is the only normal exit.
  assert.match(opening, /if \(input\.ended\) return \{ kind: "ended"/);
  assert.match(opening, /window\.setInterval\(evaluate, decision\.timings\.watchdogMs\)/);
});

test("reduced motion swaps the clip for the static card — it never hides the opening", () => {
  // The old `@media (prefers-reduced-motion: reduce) { #app-opening-splash {
  // display: none } }` is exactly why the opening was invisible for anyone
  // with Android "Reduce animation" / Windows "animation effects off" / iOS
  // "Reduce Motion". Reduced motion must mean "no motion", not "nothing".
  assert.doesNotMatch(html, /prefers-reduced-motion[^{]*\{[^}]*#app-opening-splash \{ display: none/);
  assert.match(html, /\/\* Reduced motion means "no motion", NOT "nothing"/);
  assert.match(opening, /if \(input\.reducedMotion && input\.override !== "force" && !input\.preferFullClip\)/);
  // …and a device can opt into the full clip, so the downgrade is never silent.
  assert.match(opening, /OPENING_PREFER_FULL_KEY = "eduvora\.opening\.preferFull\.v1"/);
  assert.match(opening, /mode: "static"/);
  // and the escape hatch that makes the rule testable on a real phone
  assert.match(opening, /opening=force plays the clip anyway/);
});

test("a refused or failed play() cannot end the opening", () => {
  // Autoplay refusals stay recoverable (first gesture / retry), and a media
  // error BEFORE the first frame falls back to the card instead of hiding.
  assert.match(opening, /AbortError" \|\| errorName === "NotAllowedError/);
  assert.match(opening, /retrying on first gesture/);
  assert.match(opening, /if \(firstFrameAt === null && release\.kind !== "ended"\) \{/);
  assert.match(opening, /window\.addEventListener\(\s*"pointerdown"/);
  // React keeps a screen-reader announcement and nothing else.
  assert.match(main, /function OpeningAnnouncer\(\)/);
  assert.match(main, /role="status" aria-live="polite"/);
  assert.doesNotMatch(main, /AppLaunchSplash/);
});

test("the opening is debuggable on the device that is complaining", () => {
  // Every prior report needed a rebuild to be checked; these four strings are
  // what finally makes "it does not play" answerable from a screenshot.
  for (const token of ["on", "off", "force", "static", "debug"]) {
    assert.ok(opening.includes(`"${token}"`), `missing ?opening=${token} override`);
  }
  assert.match(opening, /OPENING_QUERY_KEY = "opening"/);
  assert.match(opening, /OPENING_OVERRIDE_STORAGE_KEY = "eduvora\.opening\.override\.v1"/);
  assert.match(main, /OPENING_PREVIEW_HASH = "#\/dev\/opening"/);
  assert.match(previewPage, /Replay the real opening/);
  assert.match(previewPage, /method: "HEAD"/);
});

test("offline overlay is gated beside Root and does not replace the opening MP4s", () => {
  assert.match(main, /<OfflineGate \/>/);
  assert.match(main, /<OpeningAnnouncer \/>/);
  assert.match(opening, /APP_OPENING_VIDEO_MOBILE_SRC = "\/assets\/animations\/EduOS_app_opening_mobile\.mp4"/);
  assert.match(opening, /APP_OPENING_VIDEO_DESKTOP_SRC = "\/assets\/animations\/EduOS_app_opening_desktop\.mp4"/);
});
