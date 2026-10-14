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

const LANDING = "src/components/landing/Header.tsx";
// The app shells no longer paint the label: 2026-10-14 the owner moved the `ad`
// option OUT of the header strip and INTO the side panel — the phone drawer,
// the tablet glass rail and the desktop rail all carry it as a row.
const SHELL_HEADERS = [
  "src/components/Header.tsx",
  "src/components/DesktopShell.tsx",
  "src/home/components/Header.tsx",
];
const MENU = "src/components/MobileHeaderMenu.tsx";

test("the `ad` option lives in the side panels, and the faded label only on the landing page", () => {
  for (const file of SHELL_HEADERS) {
    const header = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(
      header,
      /<OpeningAdControl/,
      `${file} must not paint the label — the side panel owns the option now`,
    );
  }
  // The landing page has no side panel, so it keeps the faded label.
  const landing = fs.readFileSync(LANDING, "utf8");
  assert.match(landing, /<OpeningAdControl[^>]*\/>/);

  // The phone side panel (the quick-actions drawer) appends the option…
  const menu = fs.readFileSync(MENU, "utf8");
  assert.match(menu, /const openingAd = useOpeningAdPlayer\(\);/);
  assert.match(menu, /OPENING_AD_ITEM_ID/);
  assert.match(menu, /openingAd\.player/);
  // …and so do the two headers, but only as the fallback for the one band
  // that has NO side panel: 640–959 portrait (the desktop shell, and with it
  // every rail, only starts at 960 or in landscape).
  for (const file of ["src/components/Header.tsx", "src/home/components/Header.tsx"]) {
    const header = fs.readFileSync(file, "utf8");
    assert.match(header, /const openingAd = useOpeningAdPlayer\(\);/);
    assert.match(header, /tabletWithoutSidePanel/, `${file} only offers the pill on the no-panel band`);
    assert.match(header, /openingAd\.player/, `${file} renders the player it can open`);
  }
  // The home header has two variants (Home / FlowPath) and the Flow one filters
  // the shared list down to its gear — the pill is appended AFTER that filter,
  // so both variants keep it.
  const home = fs.readFileSync("src/home/components/Header.tsx", "utf8");
  assert.match(home, /const openingAdTabItem: ExpandingTabItem \| null = tabletWithoutSidePanel && openingAd\.available/);
  assert.match(home, /\.\.\.\(openingAdTabItem \? \[openingAdTabItem\] : \[\]\)/);

  // …and the desktop / tablet rails (the same shell file) do too.
  const shell = fs.readFileSync("src/components/DesktopShell.tsx", "utf8");
  assert.match(shell, /const openingAd = useOpeningAdPlayer\(\);/);
  assert.match(shell, /id: OPENING_AD_ITEM_ID/);
  assert.match(shell, /openingAd\.openPlayer/);
  assert.match(shell, /\{openingAd\.player\}/, "the shell renders the player it opens");

  // …and the label itself is still literally the lowercase word the owner asked
  // for, on the one surface that shows it.
  assert.match(source, />\s*\n?\s*ad\s*\n?\s*<\/button>/);
  assert.match(source, /tracking-\[0\.22em\]/, "the label is small and letter-spaced");
  assert.match(source, /opacity-40/, "…and faded, not a second call to action");
});

test("nothing is downloaded until the learner taps `ad`", () => {
  // The clip is ~5 MB. A control that points a <video> at it on mount would
  // waste exactly the bandwidth the launch animation was removed to save.
  assert.match(source, /isOpen && typeof document !== "undefined"/, "the player renders only while open");
  assert.match(source, /const openPlayer = useCallback/, "the tap handler resolves the clip");
  assert.match(source, /setSrc\(openingClipSrcFor\(sources, openingClipForWidth\(window\.innerWidth\)\)\)/);
  assert.match(source, /video\.removeAttribute\("src"\)/, "closing releases the buffer");
  // The URL is never resolved during render of the closed control.
  assert.doesNotMatch(source, /useEffect\([^)]*setSrc\(/);
});

test("the control hides itself when it would be redundant or unwanted", () => {
  assert.match(
    source,
    /const available = !\(branding\.openingAnimationEnabled === false \|\| branding\.openingPlayOnLaunch\);/,
  );
  // `available` is what every side panel switches on to show/hide its row.
  assert.match(source, /return \{ available, openPlayer, player \};/);
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
