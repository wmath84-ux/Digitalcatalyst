// tests/openingSplashRuntime.test.mjs
//
// End-to-end boot test of the app opening animation, driven against the REAL
// `index.html` (its pre-React boot script included) inside jsdom, for a phone
// viewport and a desktop viewport, and for every state that used to swallow
// the animation: branding off, reduced motion, offline, a media error, a clip
// that already ended before React mounted, and a replay.
//
// This is the test the last three sessions were missing. Every earlier report
// was answered by reading the code; the symptom lived in the interaction
// between the boot script, the splash element and React, so here the DOM is
// actually driven and the question answered is the one that matters: does the
// opening end up on screen, and can it ever get stuck off?
//
// Media is stubbed (jsdom cannot decode H.264): play()/load() are counted and
// the controller is fed the same events a real element fires.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";
import {
  DEFAULT_OPENING_TIMINGS,
  setOpeningRuntimeOverride,
  shouldReleaseOpening,
} from "../src/utils/openingSplash.ts";

const RAW_HTML = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const HTML = RAW_HTML.replace(/<script type="module"[^>]*><\/script>/, "");
const MOBILE = "EduOS_app_opening_mobile.mp4";
const DESKTOP = "EduOS_app_opening_desktop.mp4";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Parse index.html with the given device state (pre-React phase only) and hand
 * back helpers, including `attach()` which runs the controller's takeover — so
 * a test can assert what the user sees BEFORE and AFTER JavaScript takes over.
 */
async function boot({ width = 390, search = "", branding = null, reducedMotion = false, onLine = true, storedOverride = null, preferFull = false, rejectPlay = null, capacitor = false } = {}) {
  const playCalls = { value: 0 };
  const didSetMutedAttribute = { value: false };
  const dom = new JSDOM(HTML, {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url: `http://localhost/${search}`,
    beforeParse(window) {
      Object.defineProperty(window, "innerWidth", { value: width, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: width < 768 ? 844 : 900, configurable: true });
      Object.defineProperty(window.navigator, "onLine", { value: onLine, configurable: true });
      window.matchMedia = (query) => ({
        matches: query.includes("prefers-reduced-motion") ? reducedMotion : false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
      });
      // jsdom cannot decode a clip: count the attempts and keep them resolved,
      // so a stub rejection can never masquerade as the bug under test.
      window.HTMLMediaElement.prototype.play = function play() {
        playCalls.value += 1;
        return Promise.resolve();
      };
      window.HTMLMediaElement.prototype.load = function load() {};
      // The `muted` *attribute* (not the property) is what the boot script
      // only sets on the website — on the Capacitor WebView the property is
      // enough to start unmuted playback. Track calls on the *first* <video>
      // in the document (the opening element) so the test can assert the
      // platform branch fired the right one.
      const origSetAttribute = window.HTMLElement.prototype.setAttribute;
      window.HTMLElement.prototype.setAttribute = function patched(name, value) {
        if (this instanceof window.HTMLVideoElement && name === "muted") {
          didSetMutedAttribute.value = true;
        }
        return origSetAttribute.call(this, name, value);
      };
      if (branding) window.localStorage.setItem("eduvora.branding.v2", JSON.stringify(branding));
      if (storedOverride) window.localStorage.setItem("eduvora.opening.override.v1", storedOverride);
      if (preferFull) window.localStorage.setItem("eduvora.opening.preferFull.v1", "1");
      if (rejectPlay) {
        window.HTMLMediaElement.prototype.play = function rejected() {
          playCalls.value += 1;
          return Promise.reject(Object.assign(new Error("play refused"), { name: rejectPlay }));
        };
      }
      // The Capacitor global is the only signal `index.html` and the
      // controller use to decide "are we inside the Android app?". When the
      // test asks for it, expose the same shape the runtime does: a
      // top-level `window.Capacitor` with an `isNativePlatform()` that
      // returns `true`. The website path simply omits this block.
      if (capacitor) {
        Object.defineProperty(window, "Capacitor", {
          value: { isNativePlatform: () => true },
          configurable: true,
          writable: true,
        });
      }
    },
  });

  const { window } = dom;
  const previous = {};
  for (const key of ["window", "document", "navigator", "localStorage", "matchMedia"]) {
    previous[key] = key in globalThis ? { had: true, value: globalThis[key] } : { had: false };
  }
  // Node exposes some of these as getter-only globals (`navigator` since 21),
  // so every swap goes through defineProperty.
  const setGlobal = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  setGlobal("window", window);
  setGlobal("document", window.document);
  setGlobal("navigator", window.navigator);
  setGlobal("localStorage", window.localStorage);
  setGlobal("matchMedia", window.matchMedia);

  const opening = await import("../src/utils/openingSplash.ts");
  const splash = window.document.getElementById("app-opening-splash");
  const video = window.document.getElementById("app-opening-video");
  let controller = null;

  return {
    window,
    splash,
    video,
    playCalls,
    get didSetMutedAttribute() {
      return didSetMutedAttribute.value;
    },
    get controller() {
      return controller;
    },
    /** React's job: adopt the overlay the boot script already painted. */
    attach(timings) {
      controller = opening.attachOpeningSplash(timings);
      return controller;
    },
    fire(type, target = video) {
      target.dispatchEvent(new window.Event(type));
    },
    set(key, value) {
      Object.defineProperty(video, key, { value, configurable: true, writable: true });
    },
    settle: sleep,
    restore() {
      for (const [key, entry] of Object.entries(previous)) {
        if (entry.had) Object.defineProperty(globalThis, key, { value: entry.value, configurable: true, writable: true });
        else delete globalThis[key];
      }
      dom.window.close();
    },
  };
}

test("a phone boots the portrait EduOS clip over the brand card", async () => {
  const t = await boot({ width: 390 });
  try {
    // 1 · pre-React: the splash is up, the card is the picture, and the phone
    //     clip was chosen and started before any module executed.
    assert.equal(t.splash.dataset.preReact, "boot");
    assert.equal(t.splash.dataset.opening, undefined, "the opening must start visible");
    assert.match(t.video.getAttribute("src"), new RegExp(MOBILE));
    assert.ok(t.playCalls.value >= 1, "the boot script must try to play the clip");
    assert.ok(t.splash.querySelector(".app-boot-name").textContent.length > 0, "the card shows the brand");

    // 2 · the controller keeps the card up until the clip proves itself…
    const controller = t.attach();
    assert.equal(controller.state, "pending");
    assert.equal(t.splash.dataset.video, "off");

    // 3 · …then hands the screen to the clip on the first real frame.
    t.fire("loadeddata");
    assert.equal(controller.state, "playing");
    assert.equal(t.splash.dataset.video, "on");
    t.set("currentTime", 0.1);
    t.fire("timeupdate");
    assert.notEqual(controller.firstFrameMs, null, "the first frame is measured");

    // 4 · a clean ending releases the app — never before the visible floor.
    t.set("ended", true);
    t.fire("ended");
    await t.settle(300);
    assert.equal(t.splash.dataset.opening, "playing", "the opening may not be cut short");
    await t.settle(2300);
    assert.equal(controller.state, "done");
    assert.equal(t.splash.dataset.opening, "done");
    assert.equal(t.splash.style.display, "none");
  } finally {
    t.restore();
  }
});

test("tablet and desktop use the wide clip, never the phone one", async () => {
  for (const width of [768, 1024, 1440]) {
    const t = await boot({ width });
    try {
      assert.match(t.video.getAttribute("src"), new RegExp(DESKTOP), `width ${width} must use the desktop clip`);
      assert.doesNotMatch(t.video.getAttribute("src"), new RegExp(MOBILE));
      assert.equal(t.splash.dataset.opening, undefined, "the opening is on screen at this width too");
    } finally {
      t.restore();
    }
  }
});

test("branding off hides the opening, and ?opening=on overrides it on the device", async () => {
  const off = await boot({ width: 390, branding: { appName: "Learnbook", openingAnimationEnabled: false } });
  try {
    const controller = off.attach();
    assert.equal(controller.state, "skipped");
    assert.equal(off.splash.dataset.opening, "skipped");
    assert.match(controller.decision.reason, /branding/);
    // The admin is told the exact switch, and the dev sandbox link exists.
    const preview = fs.readFileSync("src/components/dev/OpeningAnimationPreview.tsx", "utf8");
    assert.match(preview, /App behaviour/);
    assert.match(preview, /__eduosOpening|attachOpeningSplash/);
  } finally {
    off.restore();
  }

  const forced = await boot({ width: 390, search: "?opening=on", branding: { appName: "Learnbook", openingAnimationEnabled: false } });
  try {
    assert.equal(forced.splash.dataset.opening, undefined, "?opening=on must show the opening pre-React too");
    assert.equal(forced.attach().state, "pending");
  } finally {
    forced.restore();
  }
});

test("reduced motion swaps the clip for the static card — the opening is never deleted", async () => {
  const t = await boot({ width: 390, reducedMotion: true });
  try {
    // THE regression: the old `@media (prefers-reduced-motion: reduce) {
    // #app-opening-splash { display: none } }` deleted the opening for anyone
    // with Android "Reduce animation" / Windows "animation effects off" / iOS
    // "Reduce Motion" — on every screen size, which is exactly what "no
    // animation, desktop or mobile" looked like from the outside.
    assert.notEqual(t.splash.dataset.opening, "skipped");
    assert.notEqual(t.splash.style.display, "none");
    assert.equal(t.playCalls.value, 0, "no decode work on a reduced-motion device");
    const controller = t.attach();
    assert.equal(controller.decision.mode, "static");
    assert.equal(t.splash.dataset.motion, "reduce");
    assert.ok(t.splash.querySelector(".app-boot-name").textContent.length > 0, "the card is the opening");
    await t.settle(1800);
    assert.equal(controller.state, "done", "and the app is still released");
  } finally {
    t.restore();
  }

  const force = await boot({ width: 390, reducedMotion: true, search: "?opening=force" });
  try {
    assert.ok(force.playCalls.value >= 1, "?opening=force plays the real clip anyway");
  } finally {
    force.restore();
  }
});

test("a reduced-motion device that asked for the full clip gets the whole clip", async () => {
  // Without the opt-in this is the second way to end up with "1 s of card, then
  // the landing page" — and the only way that is *not* a code bug.
  const plain = await boot({ width: 390, reducedMotion: true });
  try {
    assert.equal(plain.attach().decision.mode, "static");
  } finally {
    plain.restore();
  }
  const opted = await boot({ width: 390, reducedMotion: true, preferFull: true });
  try {
    const controller = opted.attach();
    assert.equal(controller.decision.mode, "video");
    assert.ok(opted.playCalls.value >= 1, "the clip is played from the boot script itself");
    assert.notEqual(opted.splash.dataset.opening, "skipped");
  } finally {
    opted.restore();
  }
});

test("a media error before the first frame degrades to the card instead of vanishing", async () => {
  const t = await boot({ width: 1440 });
  try {
    const controller = t.attach();
    t.set("error", { code: 4, message: "MEDIA_SRC_NOT_SUPPORTED" });
    t.fire("error");
    assert.equal(controller.state, "fallback", "a broken clip must not hide the opening instantly");
    assert.equal(t.splash.dataset.video, "off", "the brand card carries the opening");
    assert.notEqual(t.splash.style.display, "none", "still on screen when the error arrives");
    await t.settle(2300);
    assert.equal(t.splash.style.display, "none", "…and the app is released anyway");
    assert.match(controller.lastError, /media error/);
  } finally {
    t.restore();
  }
});

test("offline boot skips the clip and connectivity hands the opening back", async () => {
  const t = await boot({ width: 390, onLine: false });
  try {
    const controller = t.attach();
    assert.equal(controller.state, "skipped");
    assert.match(controller.decision.reason, /offline/);
    Object.defineProperty(t.window.navigator, "onLine", { value: true, configurable: true });
    t.fire("online", t.window);
    await t.settle(60);
    assert.notEqual(controller.state, "skipped", "the opening returns when the radio is up");
    assert.ok(t.playCalls.value >= 1);
  } finally {
    t.restore();
  }
});

test("a clip that already ended before React mounted is replayed, not treated as handled", async () => {
  // The old `if (video.ended) finished()` shortcut made a resumed PWA skip the
  // opening for the whole session — there was no reload, so nothing ever
  // cleared it, and every refresh of the fix looked like a failed fix.
  const t = await boot({ width: 390 });
  try {
    const before = t.playCalls.value;
    t.set("ended", true);
    t.set("currentTime", 9.8);
    const controller = t.attach();
    assert.equal(controller.state, "pending", "an ended clip must restart, not close the splash");
    assert.ok(t.playCalls.value > before, "and it must actually be played again");
    assert.notEqual(t.splash.style.display, "none");
  } finally {
    t.restore();
  }
});

test("dismiss + replay: the opening can be shown again after it is over", async () => {
  const t = await boot({ width: 1440 });
  try {
    const controller = t.attach();
    controller.dismiss();
    await t.settle(2300);
    assert.equal(controller.state, "done");
    assert.equal(t.splash.style.display, "none");
    controller.replay();
    assert.equal(controller.state, "pending", "replay() must put the splash back on screen");
    assert.notEqual(t.splash.style.display, "none");
    assert.equal(t.splash.dataset.hiding, undefined, "the fade-out state must be cleared");
  } finally {
    t.restore();
  }
});

test("an advancing clip is never cut short — only `ended` releases it", async () => {
  // The scaled-down schedule stands in for the real one (load ceiling 20 s,
  // stall 6 s, backstop 60 s) so the *rule* is verified in milliseconds:
  // while frames keep arriving, the opening stays up, even past the point the
  // old fixed 12 s ceiling used to tear it away mid-clip.
  const t = await boot({ width: 1440 });
  try {
    const controller = t.attach({
      minVisibleMs: 60,
      loadCeilingMs: 200,
      stallTimeoutMs: 400,
      hardCeilingMs: 10_000,
      watchdogMs: 30,
      holdAfterEndMs: 0,
      fadeMs: 0,
    });
    t.fire("loadeddata");
    assert.equal(controller.state, "playing");
    // 900 ms of steady playback — over 4× the old 12 s ceiling scaled here.
    for (let i = 1; i <= 15; i += 1) {
      await t.settle(60);
      t.set("currentTime", i * 0.6);
      t.fire("timeupdate");
    }
    assert.equal(controller.state, "playing", "a running clip must not be dismissed");
    assert.notEqual(t.splash.style.display, "none");
    assert.equal(t.splash.dataset.video, "on", "the clip, not the card, is on screen");

    t.set("ended", true);
    t.fire("ended");
    await t.settle(120);
    assert.equal(controller.state, "done", "and it is released as soon as it ends");
  } finally {
    t.restore();
  }
});

test("a clip that cannot produce a frame falls back to the card, then opens the app", async () => {
  // 20 s of patience for frame one (a 5 MB file on a weak link still gets to
  // play), scaled here to 240 ms: the release reason is load-timeout and the
  // brand card carries the rest of the window.
  const t = await boot({ width: 390 });
  try {
    const controller = t.attach({
      minVisibleMs: 60,
      loadCeilingMs: 240,
      stallTimeoutMs: 400,
      hardCeilingMs: 10_000,
      watchdogMs: 30,
      holdAfterEndMs: 0,
      fadeMs: 0,
    });
    await t.settle(120);
    assert.equal(controller.state, "pending", "still waiting for frame one — not a failure yet");
    await t.settle(400);
    assert.equal(controller.state, "done");
    assert.equal(t.splash.dataset.video, "off", "the card was the picture, never a blank screen");
  } finally {
    t.restore();
  }
});

test("the release rule itself: what may cut the opening, and what may not", () => {
  const t = DEFAULT_OPENING_TIMINGS;
  const base = { mode: "video", elapsedMs: 11_900, sinceProgressMs: 120, firstFrameMs: 400, ended: false, error: false, buffering: false, timings: t };
  // 11.9 s into a 10 s clip with the download still trickling: the OLD code
  // released here (hard 12 s ceiling). The clip must be allowed to finish.
  assert.equal(shouldReleaseOpening(base), null);
  assert.equal(shouldReleaseOpening({ ...base, elapsedMs: 30_000, sinceProgressMs: 90 }), null);
  // A finished clip releases immediately once the floor is behind us.
  assert.deepEqual(shouldReleaseOpening({ ...base, ended: true }), { kind: "ended", waitMs: 0 });
  // Before the floor, `ended` waits out the remainder instead of flashing.
  assert.equal(shouldReleaseOpening({ ...base, ended: true, elapsedMs: 200 }).waitMs, t.minVisibleMs - 200);
  // Hard failures are the only other exit.
  assert.equal(shouldReleaseOpening({ ...base, error: true }).kind, "media-error");
  assert.equal(shouldReleaseOpening({ ...base, elapsedMs: t.hardCeilingMs + 1 }).kind, "hard-ceiling");
  assert.equal(shouldReleaseOpening({ ...base, firstFrameMs: null, elapsedMs: t.loadCeilingMs + 1 }).kind, "load-timeout");
  // …and frame one is NOT due at 3 s any more; that timeout was the truncation.
  assert.equal(shouldReleaseOpening({ ...base, firstFrameMs: null, elapsedMs: 3_000 }), null);
  // A dead buffer releases; a refill does not.
  assert.equal(shouldReleaseOpening({ ...base, sinceProgressMs: t.stallTimeoutMs + 1 }).kind, "stalled");
  assert.equal(shouldReleaseOpening({ ...base, sinceProgressMs: t.stallTimeoutMs + 1, buffering: true }), null);
  // The static (reduced-motion) opening holds exactly the minimum window.
  assert.equal(shouldReleaseOpening({ ...base, mode: "static", firstFrameMs: null, elapsedMs: 0 }).waitMs, t.minVisibleMs);
});

test("a remembered `static` preview can no longer replace the clip on boot", async () => {
  // Exactly the reported symptom: one second of card, then the landing page.
  const t = await boot({ width: 390, storedOverride: "static" });
  try {
    // Pre-React: the boot script must not have honoured the remembered `static`.
    assert.equal(t.splash.dataset.opening, undefined, "the splash starts visible");
    assert.ok(t.playCalls.value >= 1, "the boot script started the clip, not the card");
    const controller = t.attach();
    assert.equal(controller.decision.mode, "video", "the controller plays the clip too");
    assert.equal(controller.state, "pending");
    // the stale value is dropped so the next boot is clean too
    assert.equal(t.window.localStorage.getItem("eduvora.opening.override.v1"), null);
  } finally {
    t.restore();
  }
});

test("a refused play() waits for the clip instead of handing over the screen", async () => {
  // The other half of that symptom: a play() rejection with no media error is a
  // policy hiccup, so the opening keeps its window and retries.
  const t = await boot({ width: 390, rejectPlay: "NotSupportedError" });
  try {
    const controller = t.attach();
    await t.settle(1800);
    assert.equal(controller.state, "pending", "past the floor, but the clip is not abandoned");
    assert.notEqual(t.splash.style.display, "none");
    assert.equal(t.splash.dataset.video, "off", "the brand card holds the screen meanwhile");
    assert.match(controller.lastError, /play\(\) rejected/);
    // once the element reports frames, playback resumes normally
    t.fire("loadeddata");
    assert.equal(controller.state, "playing");
  } finally {
    t.restore();
  }
});

test("the static preview is one-shot: the next opening is the clip again", async () => {
  const t = await boot({ width: 390 });
  try {
    const controller = t.attach();
    setOpeningRuntimeOverride("static");
    controller.replay();
    assert.equal(controller.decision.mode, "static", "the preview plays the card once");
    await t.settle(1800);
    assert.equal(controller.state, "done");
    setOpeningRuntimeOverride(null);
    controller.replay();
    assert.equal(controller.decision.mode, "video", "…and never again");
    assert.match(t.video.getAttribute("src"), /mobile\.mp4$/, "the clip is pointed at again");
  } finally {
    setOpeningRuntimeOverride(null);
    t.restore();
  }
});

test("the Capacitor native shell starts the opening clip UNMUTED, the website keeps it muted", async () => {
  // Browsers (incl. mobile Chrome) silently refuse any autoplay that is NOT
  // muted — that is the platform rule this fix is built around. The Capacitor
  // Android WebView is the only host where the unmuted autoplay is allowed, so
  // the SAME <video> element must be muted on the website and unmuted on the
  // device, and the controller must not re-mute the device mid-clip when a
  // loadedmetadata/buffer-refill replay fires.
  const native = await boot({ width: 390, capacitor: true });
  try {
    // 1 · pre-React boot script honours the native flag: the `muted` property
    //     is false (so the WebView actually starts playback with audio) and
    //     the boot script does NOT redundantly write `muted=""` again (which
    //     is the visible difference between the website and the device paths
    //     the task is fixing).
    assert.equal(native.video.muted, false, "the boot script must not mute the native app");
    assert.equal(
      native.didSetMutedAttribute,
      false,
      "the boot script must not call setAttribute('muted', '') on the native app",
    );
    assert.equal(native.playCalls.value >= 1, true, "the boot script still tries to play the clip");

    // 2 · the controller (createController → startVideo) must keep the
    //     unmuted state through a fresh opening.
    const controller = native.attach();
    assert.equal(controller.decision.show, true);
    assert.equal(controller.decision.mode, "video");
    assert.equal(native.video.muted, false, "attach() must not mute the native app");

    // 3 · a mid-play replay (the loadedmetadata / buffer-refill path) must
    //     not re-mute the device — that is the exact regression the task is
    //     fixing.
    native.fire("progress");
    assert.equal(native.video.muted, false, "a mid-play replay must keep audio on the device");
    native.fire("loadedmetadata");
    assert.equal(native.video.muted, false, "loadedmetadata must not re-mute the device");

    // 4 · a tap on the device is a no-op for audio: the controller is the
    //     source of truth, and the global pointerdown listener must not toggle
    //     `muted` from `false` to `true` and silence the opening.
    native.video.muted = false;
    native.set("paused", false);
    native.set("ended", false);
    const playsBefore = native.playCalls.value;
    native.window.dispatchEvent(new native.window.Event("pointerdown", { bubbles: true }));
    assert.equal(native.video.muted, false, "a tap on the device must not change the muted state");
    assert.equal(native.playCalls.value, playsBefore, "and it must not restart the clip");
  } finally {
    native.restore();
  }

  // The website (no Capacitor global at all) keeps the existing behaviour.
  const web = await boot({ width: 390 });
  try {
    assert.equal(web.video.muted, true, "the website must keep the opening muted");
    assert.equal(
      web.didSetMutedAttribute,
      true,
      "the website boot script must write muted='' so the attribute matches the property",
    );

    const controller = web.attach();
    assert.equal(controller.decision.show, true);
    assert.equal(web.video.muted, true, "attach() must keep the website muted");

    // A mid-play replay on the web must also stay muted.
    web.fire("progress");
    assert.equal(web.video.muted, true, "a mid-play replay on the web must stay muted");
    web.fire("loadedmetadata");
    assert.equal(web.video.muted, true, "loadedmetadata on the web must stay muted");

    // And the legacy "tap to unmute" affordance still works on the website.
    web.video.muted = true;
    web.set("paused", false);
    web.set("ended", false);
    web.window.dispatchEvent(new web.window.Event("pointerdown", { bubbles: true }));
    assert.equal(web.video.muted, false, "a tap still unmutes the website");
  } finally {
    web.restore();
  }
});

test("a tap anywhere unmutes the opening clip without restarting it", async () => {
  const t = await boot({ width: 390 });
  try {
    const controller = t.attach();
    assert.equal(controller.decision.show, true);
    assert.equal(controller.decision.mode, "video");
    // The decorative pill tells the user a tap helps — it is never a button.
    const hint = t.splash.querySelector(".app-boot-sound-hint");
    assert.ok(hint, "the tap-for-sound hint must be in the splash");
    assert.match(hint.textContent ?? "", /Tap for sound/);
    assert.equal(t.splash.dataset.soundHint, "on", "the hint shows while the muted clip plays");
    // Clip already playing (not paused): a tap must unmute without restarting.
    t.set("paused", false);
    t.set("ended", false);
    t.video.muted = true;
    const playsBefore = t.playCalls.value;
    t.window.dispatchEvent(new t.window.Event("pointerdown", { bubbles: true }));
    assert.equal(t.video.muted, false, "pointerdown must unmute the clip");
    assert.equal(t.playCalls.value, playsBefore, "unmuting must not restart the clip");
    assert.equal(t.splash.dataset.soundHint, "off", "the first tap dismisses the hint");
  } finally {
    t.restore();
  }
});

test("the shipped clips are real H.264 files that can start before they finish downloading", async () => {
  for (const file of [MOBILE, DESKTOP]) {
    const bytes = fs.readFileSync(new URL(`../public/assets/animations/${file}`, import.meta.url));
    const text = bytes.toString("latin1");
    assert.ok(bytes.length > 1_000_000, `${file} looks truncated`);
    assert.equal(bytes.subarray(4, 8).toString("latin1"), "ftyp", `${file} is not an MP4`);
    assert.ok(text.includes("avc1"), `${file} is not H.264 (Chrome/Safari/Android floor)`);
    // Faststart: without the movie header near the front, a 5 MB clip cannot
    // paint its first frame until the whole file has arrived — which is another
    // way a boot splash ends up looking like "nothing happened".
    const moov = text.indexOf("moov", text.indexOf("ftyp"));
    assert.ok(moov > 0 && moov < 100_000, `${file} is not fast-start optimised (moov at ${moov})`);
  }
});
