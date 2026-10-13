// tests/openingSplashContract.test.mjs
//
// Behaviour tests for the single owner of the app opening animation
// (src/utils/openingSplash.ts). These are real unit tests, not greps: the
// decision table is pure, so every "why did I not see it" branch can be
// exercised here instead of on a phone.
//
// The regression each block guards:
//   • the opening was invisible on BOTH desktop and mobile for three sessions
//     (branding coercion, an `error`/`ended` shortcut, and a reduced-motion
//     `display:none`), and
//   • nothing in the old code could be checked without a rebuild.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  APP_OPENING_VIDEO_DESKTOP_SRC,
  APP_OPENING_VIDEO_MOBILE_SRC,
  DEFAULT_OPENING_TIMINGS,
  OPENING_CLIP_DURATION_MS,
  OPENING_FADE_MS,
  OPENING_MIN_VISIBLE_MS,
  OPENING_MOBILE_MAX_WIDTH,
  PERSISTED_OPENING_OVERRIDES,
  openingClipForWidth,
  openingClipSrcFor,
  readStickyOpeningOverride,
  parseOpeningOverride,
  readOpeningOverride,
  resolveOpeningDecision,
} from "../src/utils/openingSplash.ts";

// The launch playback is OPT-IN (`openingPlayOnLaunch`, off by default), so
// every test about what plays while the app opens asks for it explicitly; the
// tap-only default has its own block below.
const base = {
  width: 1440,
  brandingEnabled: true,
  playOnLaunch: true,
  reducedMotion: false,
  offline: false,
  override: null,
};

test("with the launch playback on, the opening plays on every band", () => {
  for (const width of [320, 430, 767, 768, 1024, 1440]) {
    const decision = resolveOpeningDecision({ ...base, width });
    assert.equal(decision.show, true, `width ${width} must show the opening`);
    assert.equal(decision.mode, "video", `width ${width} must play the clip`);
    assert.match(decision.reason, /playing the opening animation/);
  }
});

test("the opening is TAP-ONLY by default — the header ad control plays it", () => {
  // The reported requirement: "bye default user ko app open hote samay dikhana
  // ho to main vahan se on kar sakun". Absent or false both mean tap-only, so
  // an old branding document (which has no such field) opens the app straight
  // away, downloads nothing, and shows the faded `ad` control instead.
  for (const playOnLaunch of [undefined, false]) {
    const decision = resolveOpeningDecision({ ...base, playOnLaunch });
    assert.equal(decision.show, false, "nothing plays while the app opens");
    assert.equal(decision.mode, "video", "…but the clip is still what the control plays");
    assert.match(decision.reason, /tap/);
    assert.match(decision.reason, /ad control/);
    // The reason names the switch AND the per-device override, like every other
    // branch, so a report can be answered from the debug badge alone.
    assert.match(decision.reason, /App behaviour/);
    assert.match(decision.reason, /\?opening=on/);
  }
  // The two escapes: an explicit device override, and the admin switch.
  assert.equal(resolveOpeningDecision({ ...base, playOnLaunch: false, override: "on" }).show, true);
  assert.equal(resolveOpeningDecision({ ...base, playOnLaunch: false, override: "force" }).show, true);
  assert.equal(resolveOpeningDecision({ ...base, playOnLaunch: true }).show, true);
  // Turning the animation off entirely wins over the launch playback.
  assert.equal(resolveOpeningDecision({ ...base, brandingEnabled: false, playOnLaunch: true }).show, false);
});

test("admin release-URL clips replace the bundled MP4s, per band, safely", () => {
  const shared = "https://github.com/o/r/releases/download/v2/open.mp4";
  const phone = "https://github.com/o/r/releases/download/v2/phone.mp4";
  const wide = "https://github.com/o/r/releases/download/v2/wide.mp4";
  // Both bands, then per-band overrides.
  assert.equal(resolveOpeningDecision({ ...base, clips: { any: shared } }).src, shared);
  assert.equal(resolveOpeningDecision({ ...base, width: 390, clips: { any: shared } }).src, shared);
  assert.equal(resolveOpeningDecision({ ...base, width: 390, clips: { any: shared, mobile: phone } }).src, phone);
  assert.equal(resolveOpeningDecision({ ...base, clips: { any: shared, desktop: wide } }).src, wide);
  // A band override does not leak into the other band.
  assert.equal(resolveOpeningDecision({ ...base, width: 1440, clips: { any: shared, mobile: phone } }).src, shared);
  // Anything that is not an absolute https URL falls back to the shipped clip.
  for (const broken of ["/local.mp4", "http://insecure/x.mp4", "javascript:void 0", "", "   ", null, undefined]) {
    assert.equal(resolveOpeningDecision({ ...base, clips: { any: broken } }).src, APP_OPENING_VIDEO_DESKTOP_SRC);
    assert.equal(
      resolveOpeningDecision({ ...base, width: 390, clips: { mobile: broken } }).src,
      APP_OPENING_VIDEO_MOBILE_SRC,
    );
  }
  // The pure helper agrees with the decision (the admin preview and the ad
  // control use it directly).
  assert.equal(openingClipSrcFor({ any: shared }, "mobile"), shared);
  assert.equal(openingClipSrcFor(null, "desktop"), APP_OPENING_VIDEO_DESKTOP_SRC);
  assert.equal(openingClipSrcFor({ mobile: phone }, "desktop"), APP_OPENING_VIDEO_DESKTOP_SRC);
});

test("phones get the portrait clip, tablet + desktop get the wide one", () => {
  assert.equal(openingClipForWidth(0), "mobile");
  assert.equal(openingClipForWidth(OPENING_MOBILE_MAX_WIDTH - 1), "mobile");
  assert.equal(openingClipForWidth(OPENING_MOBILE_MAX_WIDTH), "desktop");
  assert.equal(openingClipForWidth(1024), "desktop");
  // A missing measurement must not fall back to the phone clip.
  assert.equal(openingClipForWidth(Number.NaN), "desktop");
  assert.equal(resolveOpeningDecision({ ...base, width: 390 }).src, APP_OPENING_VIDEO_MOBILE_SRC);
  assert.equal(resolveOpeningDecision({ ...base, width: 1280 }).src, APP_OPENING_VIDEO_DESKTOP_SRC);
});

test("the four ways the opening used to disappear are each answered", () => {
  // 1 · admin branding off → hidden, but the reason names the exact switch.
  const off = resolveOpeningDecision({ ...base, brandingEnabled: false });
  assert.equal(off.show, false);
  assert.match(off.reason, /App behaviour/);
  assert.match(off.reason, /\?opening=on|opening=on/);

  // 2 · reduced motion → still an opening, just without the clip.
  const reduced = resolveOpeningDecision({ ...base, reducedMotion: true });
  assert.equal(reduced.show, true);
  assert.equal(reduced.mode, "static");
  assert.match(reduced.reason, /reduced motion/);

  // 3 · offline at boot → the offline screen wins, no stalled 5 MB fetch.
  const offline = resolveOpeningDecision({ ...base, offline: true });
  assert.equal(offline.show, false);
  assert.match(offline.reason, /offline/);

  // 4 · override off → explicit and honoured.
  assert.equal(resolveOpeningDecision({ ...base, override: "off" }).show, false);
});

test("reduced motion may be answered by an explicit device opt-in", () => {
  // Reduced motion must not be *silently* upgraded to "no opening": the card is
  // the answer, and a device can ask for the full clip on top of it.
  assert.equal(resolveOpeningDecision({ ...base, reducedMotion: true }).mode, "static");
  assert.equal(resolveOpeningDecision({ ...base, reducedMotion: true, preferFullClip: true }).mode, "video");
  assert.equal(resolveOpeningDecision({ ...base, reducedMotion: true, preferFullClip: true, offline: true }).show, false);
  const html = fs.readFileSync("index.html", "utf8");
  // …and the pre-React mirror reads the same key, so there is no 1 s card
  // flash before React can say anything.
  assert.match(html, /eduvora\.opening\.preferFull\.v1/);
  assert.match(html, /override !== "force" && !preferFull/);
});

test("overrides beat the device and the branding cache", () => {
  // `on` re-arms a branding-off opening; `force` also outruns reduced motion
  // and the offline skip, so a report can always be reproduced.
  assert.equal(resolveOpeningDecision({ ...base, brandingEnabled: false, override: "on" }).show, true);
  const forced = resolveOpeningDecision({ ...base, brandingEnabled: false, reducedMotion: true, offline: true, override: "force" });
  assert.equal(forced.show, true);
  assert.equal(forced.mode, "video");
  // `static` proves the card path without any media at all.
  assert.equal(resolveOpeningDecision({ ...base, override: "static" }).mode, "static");
  assert.equal(resolveOpeningDecision({ ...base, override: "debug" }).debug, true);
  assert.equal(resolveOpeningDecision({ ...base }).debug, false);
});

test("override parsing: comma lists, junk, and query-before-cache", () => {
  assert.equal(parseOpeningOverride("on,debug"), "on");
  assert.equal(parseOpeningOverride(" debug "), "debug");
  assert.equal(parseOpeningOverride("off,on"), "off");
  assert.equal(parseOpeningOverride("force"), "force");
  assert.equal(parseOpeningOverride(""), null);
  assert.equal(parseOpeningOverride("maybe"), null);
  assert.equal(parseOpeningOverride(null), null);

  assert.equal(readOpeningOverride("?opening=static", "off"), "static");
  assert.equal(readOpeningOverride("", "static"), "static");
  assert.equal(readOpeningOverride("?opening=%20", "off"), "off");
  assert.equal(readOpeningOverride("?other=1", null), null);
  // …and before the app's own hash route, which is how it is typed in practice.
  assert.equal(readOpeningOverride("?opening=debug#/home", null), "debug");
});

test("the clip is allowed to finish: floors, backstops and what they must clear", () => {
  const decision = resolveOpeningDecision({ ...base });
  const t = decision.timings;
  assert.deepEqual(t, DEFAULT_OPENING_TIMINGS);
  assert.ok(t.minVisibleMs >= 1200, "the opening must not flash by");
  // Frame one may take a while on a phone connection — a 5 MB file is the
  // product's own choice — so patience, not a deadline, governs the start.
  assert.ok(t.loadCeilingMs >= 15_000, "the first frame gets real time to arrive");
  assert.ok(t.stallTimeoutMs >= 5_000, "a buffer refill is not a finished clip");
  // The backstop must sit far above the whole clip plus the patience above, or
  // it becomes the thing that cuts the animation off.
  assert.ok(
    t.hardCeilingMs >= OPENING_CLIP_DURATION_MS + t.loadCeilingMs + 2_000,
    "the backstop must never fire during a full clip",
  );
  assert.ok(t.holdAfterEndMs > 0 && t.holdAfterEndMs < 1_000, "the last frame is held, briefly");
  assert.ok(t.fadeMs > 100 && t.fadeMs < 1_000, "the hand-over is a fade, not a jump");
  assert.equal(OPENING_CLIP_DURATION_MS, 10_006, "both shipped clips are 10.006s");
  assert.ok(OPENING_MIN_VISIBLE_MS + OPENING_FADE_MS < t.hardCeilingMs);
});

test("an override that changes what plays is never remembered", () => {
  // The bug this pins: "Preview the static card" wrote `static` to
  // localStorage, so every boot after that showed the 1.4 s card and opened
  // the app — reported as "I see a one-second frame, then the landing page".
  const store = (values) => (key) => values[key] ?? null;
  const fresh = { "eduvora.opening.override.v1": "static" };
  assert.equal(readStickyOpeningOverride(store(fresh)), null, "static must not survive the URL");
  assert.deepEqual(PERSISTED_OPENING_OVERRIDES, ["debug", "off"]);

  assert.equal(readStickyOpeningOverride(store({ "eduvora.opening.override.v1": "off" })), "off");
  assert.equal(readStickyOpeningOverride(store({ "eduvora.opening.override.v1": "debug", "eduvora.opening.override.at.v1": String(Date.now()) })), "debug");
  // …and even those expire.
  const staleDay = Date.now() - 25 * 60 * 60 * 1000;
  assert.equal(
    readStickyOpeningOverride(store({ "eduvora.opening.override.v1": "debug", "eduvora.opening.override.at.v1": String(staleDay) })),
    null,
    "a week-old debug flag must not still be steering the opening",
  );

  // Priority: this tap's URL > the one-shot preview > what the device remembers.
  assert.equal(readOpeningOverride("?opening=static", "off"), "static");
  assert.equal(readOpeningOverride("", "off", "force"), "force");
  assert.equal(readOpeningOverride("", "off"), "off");
  // A remembered value the policy rejects cannot force a mode on its own.
  assert.equal(readStickyOpeningOverride(store({ "eduvora.opening.override.v1": "force" })), null);
  assert.equal(resolveOpeningDecision({ ...base, override: null }).mode, "video");
});

test("index.html's pre-React mirror agrees with the module", () => {
  const html = fs.readFileSync("index.html", "utf8");
  // Same breakpoint, same two files, same "missing flag means ON" rule.
  assert.match(html, new RegExp(`window\\.innerWidth < ${OPENING_MOBILE_MAX_WIDTH}`));
  assert.match(html, new RegExp(APP_OPENING_VIDEO_MOBILE_SRC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, new RegExp(APP_OPENING_VIDEO_DESKTOP_SRC.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /data\.openingAnimationEnabled !== false/);
  // The pre-React layer must not hide anything on its own beyond the states the
  // controller also derives (off / branding / offline) — reduced motion in
  // particular is handled by the module, not by a CSS `display:none`.
  assert.match(html, /var show = override !== "off" && \(enabled \|\| override === "on" \|\| override === "force"\)/);
  assert.doesNotMatch(html, /@media \(prefers-reduced-motion: reduce\) \{[^}]*display: none/);
  // Brand card + video are both in the served markup, before any JS runs.
  assert.ok(html.indexOf('class="app-boot-fallback"') < html.indexOf('id="root"'));
  // …and the mirror refuses a remembered override that would change what plays.
  assert.match(html, /stored !== "debug" && stored !== "off"/);
  assert.match(html, /eduvora\.opening\.override\.at\.v1/);
  // …and the pre-React script must honour the tap-only default too: it stops
  // before assigning a `src` when the launch playback is off, so a tap-only
  // boot downloads nothing (the clip is opened on demand instead).
  assert.match(html, /var auto = show && \(playOnLaunch \|\| override === "on" \|\| override === "force"\)/);
  assert.match(html, /playOnLaunch = data\.openingPlayOnLaunch === true/);
  assert.match(html, /openingAnimationUrlMobile/);
});
