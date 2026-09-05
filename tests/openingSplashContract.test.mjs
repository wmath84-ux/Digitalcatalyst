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
  OPENING_FADE_MS,
  OPENING_MAX_WAIT_MS,
  OPENING_MIN_VISIBLE_MS,
  OPENING_MOBILE_MAX_WIDTH,
  openingClipForWidth,
  parseOpeningOverride,
  readOpeningOverride,
  resolveOpeningDecision,
} from "../src/utils/openingSplash.ts";

const base = {
  width: 1440,
  brandingEnabled: true,
  reducedMotion: false,
  offline: false,
  override: null,
};

test("the opening plays by default, on every band", () => {
  for (const width of [320, 430, 767, 768, 1024, 1440]) {
    const decision = resolveOpeningDecision({ ...base, width });
    assert.equal(decision.show, true, `width ${width} must show the opening`);
    assert.equal(decision.mode, "video", `width ${width} must play the clip`);
    assert.match(decision.reason, /playing the opening animation/);
  }
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

test("the opening is always long enough to see and short enough to never trap the app", () => {
  const decision = resolveOpeningDecision({ ...base });
  assert.ok(decision.minVisibleMs >= 1200, "the opening must not flash by");
  assert.ok(decision.maxWaitMs >= 10_000, "the 10.006s clips must be able to finish");
  assert.ok(decision.maxWaitMs >= OPENING_MIN_VISIBLE_MS + OPENING_FADE_MS);
  assert.equal(OPENING_MAX_WAIT_MS, 12_006);
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
});
