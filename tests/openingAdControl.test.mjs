// tests/openingAdControl.test.mjs
//
// The header's faded `ad` control is where the EduOS opening animation moved to
// when it stopped playing on every app open. This pins the contract that makes
// that safe:
//
//   · the control is in every app header (mobile, home/FlowPath, desktop, landing);
//   · it fetches NOTHING until it is tapped (no src, no <video>, no request);
//   · it hides itself while the launch playback is on (the reported requirement
//     — "use case mein header per vah ad text na dikhe") and when the admin
//     turned the animation off;
//   · it plays whatever Branding points at, through the same resolver the
//     launch splash uses, so the two can never disagree;
//   · a broken clip URL is reported with the URL instead of a black box;
//   · the player is portalled into <body>, because the headers are `sticky`
//     with `backdrop-blur` — a fixed child would be trapped inside the strip.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const SOURCE = "src/components/ad/OpeningAdControl.tsx";
const source = fs.readFileSync(SOURCE, "utf8");

const HEADERS = [
  "src/components/Header.tsx",
  "src/components/DesktopShell.tsx",
  "src/home/components/Header.tsx",
  "src/components/landing/Header.tsx",
];

test("the faded `ad` control is mounted in every app header", () => {
  for (const file of HEADERS) {
    const header = fs.readFileSync(file, "utf8");
    assert.match(header, /OpeningAdControl/, `${file} must render the control`);
    assert.match(
      header,
      /<OpeningAdControl[^>]*\/>/,
      `${file} must render <OpeningAdControl /> (an import alone shows nothing)`,
    );
  }
  // …and the label itself is literally the lowercase word the owner asked for.
  assert.match(source, />\s*\n?\s*ad\s*\n?\s*<\/button>/);
  assert.match(source, /tracking-\[0\.22em\]/, "the label is small and letter-spaced");
  assert.match(source, /opacity-40/, "…and faded, not a second call to action");
});

test("nothing is downloaded until the learner taps `ad`", () => {
  // The clip is ~5 MB. A control that points a <video> at it on mount would
  // waste exactly the bandwidth the launch animation was removed to save.
  assert.match(source, /\{open && typeof document !== "undefined"/, "the player renders only while open");
  assert.match(source, /const openPlayer = useCallback/, "the tap handler resolves the clip");
  assert.match(source, /setSrc\(openingClipSrcFor\(sources, openingClipForWidth\(window\.innerWidth\)\)\)/);
  assert.match(source, /video\.removeAttribute\("src"\)/, "closing releases the buffer");
  // The URL is never resolved during render of the closed control.
  assert.doesNotMatch(source, /useEffect\([^)]*setSrc\(/);
});

test("the control hides itself when it would be redundant or unwanted", () => {
  assert.match(
    source,
    /if \(branding\.openingAnimationEnabled === false \|\| branding\.openingPlayOnLaunch\) return null;/,
  );
  // Both switches are read from the live branding context, not from a prop, so
  // one admin save updates every header at once.
  assert.match(source, /const branding = useBranding\(\);/);
});

test("the control and the launch splash resolve the clip the same way", () => {
  assert.match(source, /openingClipSrcFor/);
  assert.match(source, /openingClipForWidth/);
  assert.match(source, /import \{ OPENING_CLIP_DURATION_MS, openingClipForWidth, openingClipSrcFor \} from "@\/utils\/openingSplash";/);
});

test("the player is a real dialog: portal, Escape, close-on-backdrop, replay, error copy", () => {
  assert.match(source, /createPortal\(/, "portalled into <body> (the headers are backdrop-blurred)");
  assert.match(source, /document\.body,/, "…into document.body");
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /onClick=\{\(event\) => \{\s*\n\s*if \(event\.target === event\.currentTarget\) closePlayer\(\);/);
  assert.match(source, /↻ Replay/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  // A clip that will not decode names the URL and explains the release-page trap.
  assert.match(source, /releases\/download/);
  assert.match(source, /releases\/tag/);
  assert.match(source, /data-opening-ad-player/);
  assert.match(source, /z-\[2147482000\]/, "below the boot splash (2147483000), above the app chrome");
});

test("no other module owns the splash <video>", () => {
  // The opening controller is the only writer of the boot overlay; the control
  // renders its own element, so a remount can still never abort the launch clip.
  const main = fs.readFileSync("src/main.tsx", "utf8");
  assert.doesNotMatch(main, /getElementById\("app-opening-video"\)/);
  assert.doesNotMatch(source, /app-opening-video|app-opening-splash/);
});
