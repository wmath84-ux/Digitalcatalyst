import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const sw = fs.readFileSync("public/sw.js", "utf8");
const provider = fs.readFileSync("src/context/ConnectivityContext.tsx", "utf8");
const screen = fs.readFileSync("src/components/offline/OfflineScreen.tsx", "utf8");
const gate = fs.readFileSync("src/components/offline/OfflineGate.tsx", "utf8");
const ripple = fs.readFileSync("src/components/offline/ConnectionRipple.tsx", "utf8");
const blur = fs.readFileSync("src/components/offline/BlurFade.tsx", "utf8");
const css = fs.readFileSync("src/offline.css", "utf8");

const offlineFiles = [provider, screen, gate, ripple, blur, css];

test("offline overlay is a Root sibling and does not remount GlassBackdrop", () => {
  assert.match(main, /import OfflineGate from "\.\/components\/offline\/OfflineGate"/);
  assert.match(main, /import \{ ConnectivityProvider, useConnectivity \} from "\.\/context\/ConnectivityContext"/);
  assert.match(main, /<ConnectivityProvider>/);
  assert.match(main, /<OfflineGate \/>/);
  assert.match(main, /<RouteBackdrop \/>/);
  assert.match(main, /return <GlassBackdrop \/>/);
  // Overlay, not an early-return that would unmount the winter scene.
  assert.match(gate, /never unmounts the app tree/);
  assert.match(gate, /if \(!offline\) return null/);
  assert.equal((main.match(/createRoot\(/g) || []).length, 1);
});

test("the gate is flag-only: no network request may ever decide offline", () => {
  // v1-v3 application-level network checks gated learners who had working
  // internet (flaky proxies, CDNs, ad-blockers, service-worker races). The
  // provider must decide from navigator.onLine alone — nothing else.
  assert.doesNotMatch(provider, /fetch\(|XMLHttpRequest|probe/i);
  assert.match(provider, /navigator\.onLine === false/);
  assert.equal(fs.existsSync("src/utils/connectivity.ts"), false,
    "the old network utility must stay deleted");
  for (const src of offlineFiles) {
    assert.doesNotMatch(src, /fetch\(|XMLHttpRequest/);
  }
});

test("transient radio dips are ignored and recovery is instant", () => {
  // Gate only after the flag has been down for the whole grace window.
  assert.match(provider, /GRACE_MS = 8000/);
  assert.match(provider, /WATCH_INTERVAL_MS = 4000/);
  assert.match(provider, /window\.addEventListener\("online"/);
  assert.match(provider, /window\.addEventListener\("offline"/);
  assert.match(provider, /document\.addEventListener\("visibilitychange"/);
  // Online event → ungate immediately, with no confirmation request.
  assert.match(provider, /const onOnline = \(\) => \{\s*clearGrace\(\);\s*setOffline\(false\);\s*\};/);
  // First paint never gates: the offline state starts false.
  assert.match(provider, /useState\(false\)/);
});

test("offline boot skips the opening splash so the overlay paints immediately", () => {
  assert.match(main, /playOpening && !offline && \(!openingVideoDone \|\| launchPending\)/);
  assert.match(main, /!playOpening \|\| offline/);
  assert.match(main, /if \(offline\) setOpeningVideoDone\(true\)/);
  // A transient blip must not eat the brand opening for the session: the
  // splash comes back once connectivity recovers if it never actually played.
  assert.match(main, /openingPlayed/);
  assert.match(main, /if \(played\) openingPlayed\.current = true;/);
  // A load error / stall must not count as "played" — the splash stays replayable.
  assert.match(main, /const aborted = \(\) => \{\s*if \(!cancelled\) onEnded\(false\);\s*\};/);
  assert.match(gate, /app-opening-splash/);
});

test("offline copy, Try Again, and EduOS glass — no video, GIF, Wi-Fi glyph, or red error", () => {
  assert.match(screen, /You&apos;re Offline|You're Offline/);
  assert.match(screen, /Connect to the internet to continue learning\./);
  assert.match(screen, /Try Again/);
  assert.match(screen, /GlassSurface/);
  assert.match(screen, /GlassButton/);
  assert.match(screen, /BrandMark/);
  assert.match(screen, /onRetry/);
  assert.match(screen, /checking/);
  for (const src of offlineFiles) {
    assert.doesNotMatch(src, /\.mp4|\.webm|\.gif|wifi|wi-fi|WiFi|lucide-react/i);
    assert.doesNotMatch(src, /bg-red-|text-red-|border-red-|from-red-/);
  }
});

test("energy field is Magic UI Ripple + Blur Fade, restyled to EduOS cyan/violet on framer-motion", () => {
  assert.match(ripple, /magicui\.design\/docs\/components\/ripple/);
  assert.match(ripple, /eduos-ripple-ring/);
  assert.match(ripple, /data-connection/);
  assert.match(ripple, /cyan|violet|211, 238|167, 139, 250/);
  assert.match(css, /@keyframes eduos-ripple/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(blur, /magicui\.design\/docs\/components\/blur-fade/);
  assert.match(blur, /from "framer-motion"/);
  assert.match(blur, /useReducedMotion/);
  assert.match(screen, /useReducedMotion/);
  assert.doesNotMatch(JSON.stringify(pkg.dependencies), /"motion"|magicui|aceternity|animata/);
});

test("Try Again re-reads the flag synchronously and the SW offline shell is untouched", () => {
  assert.match(gate, /onRetry=\{\(\) => \{ retry\(\); \}\}/);
  assert.match(provider, /\{ offline, checking, retry \}/);
  assert.match(sw, /event\.request\.mode === 'navigate'/);
});
