// tests/fullscreenEverywhereContract.test.mjs
//
// The FULLSCREEN contract for the whole app (owner report, 2026-09-28:
// "Sanctuary ke andar full screen button APK mein nahin kam kar raha hai …
// shayad browser mein kam kar raha hai aur mobile per bhi nahin … tablet per
// bhi").
//
// Root cause, in the shipped code: every fullscreen button called
// `document.documentElement.requestFullscreen()` and swallowed the rejection.
// Android WebView NEVER honours that call unless the host Activity implements
// BOTH halves of the WebChromeClient custom-view contract — and Capacitor's
// stock `BridgeWebChromeClient.onShowCustomView()` answers with an immediate
// `callback.onCustomViewHidden()` (i.e. "no fullscreen"), so the promise always
// rejected inside the APK (phone AND tablet), while iOS Safari never exposed
// the API at all.
//
// What is pinned here:
//
//   1. ANDROID SHELL — a real WebChromeClient (extends BridgeWebChromeClient,
//      hosts the custom view, does NOT answer "no"), the AppFullscreen plugin
//      (immersive system bars through WindowInsetsControllerCompat), both
//      registered in MainActivity.
//   2. SHARED CONTROLLER — src/utils/fullscreen.ts picks the layer: native →
//      web → in-page fallback (`data-app-fullscreen`), reports one snapshot
//      and one subscription, and honours `allowAppFallback: false`.
//   3. CALL SITES — the Sanctuary's Fullscreen row, the Course Player's
//      "Hide status bar" switch and the media viewer's Fullscreen row all go
//      through the controller (no bare swallowed requestFullscreen left).
//   4. RUNTIME — the controller is bundled with esbuild and exercised in
//      jsdom: every platform shape (no API, honoured API, rejected API,
//      element request) lands on a real, released fullscreen state.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const controller = read("src/utils/fullscreen.ts");
const naturePage = read("src/nature3d/NatureStudioPage.tsx");
const settings = read("src/nature3d/SanctuarySettings.tsx");
const winterCss = read("src/nature3d/winter.css");
const statusBar = read("src/utils/courseStatusBar.ts");
const resourceViewer = read("src/course/ResourceViewer.tsx");
const player = read("src/CoursePlayerApp.tsx");
const androidMain = read("android/app/src/main/java/app/eduvora/shop/MainActivity.java");
const plugin = read("android/app/src/main/java/app/eduvora/shop/AppFullscreenPlugin.java");
const chromeClient = read("android/app/src/main/java/app/eduvora/shop/FullscreenWebChromeClient.java");
const manifest = read("android/app/src/main/AndroidManifest.xml");

/* ------------------------------------------------------------------ */
/* 1 · the Android shell can actually go fullscreen                     */
/* ------------------------------------------------------------------ */

test("the APK installs a WebChromeClient that hosts the custom view", () => {
  // Capacitor's stock client answers every request with an immediate "no" —
  // that is the whole APK bug. The subclass must extend it (so dialogs,
  // permissions, the file chooser and geolocation keep working) and must NOT
  // call callback.onCustomViewHidden() on show.
  assert.match(chromeClient, /class FullscreenWebChromeClient extends BridgeWebChromeClient/);
  assert.match(chromeClient, /public FullscreenWebChromeClient\(Bridge bridge, Activity activity\)/);
  assert.match(chromeClient, /public void onShowCustomView\(View view, CustomViewCallback callback\)/);
  assert.match(chromeClient, /public void onHideCustomView\(\)/);
  const show = chromeClient.slice(
    chromeClient.indexOf("public void onShowCustomView"),
    chromeClient.indexOf("public void onHideCustomView"),
  );
  assert.doesNotMatch(
    show,
    /callback\.onCustomViewHidden\(\);\s*\n\s*\}/,
    "onShowCustomView must never answer 'no fullscreen' (the Capacitor stock behaviour)",
  );
  assert.match(show, /decor\.addView\(/, "the custom view is attached to the decor view");
  assert.match(chromeClient, /AppFullscreenPlugin\.setCustomViewActive\(activity, true\)/);
  assert.match(chromeClient, /AppFullscreenPlugin\.setCustomViewActive\(activity, false\)/);
  // Wired in the Activity, after super.onCreate() (where the Bridge — and the
  // WebView — exists).
  assert.match(androidMain, /new FullscreenWebChromeClient\(bridge, this\)/);
  assert.match(androidMain, /webView\.setWebChromeClient\(client\)/);
  assert.match(androidMain, /installFullscreenWebChromeClient\(\)/);
  assert.match(androidMain, /registerPlugin\(AppFullscreenPlugin\.class\)/);
});

test("backing out of a fullscreen video leaves the video, not the app", () => {
  // The page-driven exit must NOT fire the callback back at the page (it
  // already knows) …
  assert.match(chromeClient, /public void onHideCustomView\(\) \{[\s\S]{0,400}removeCustomView\(\);/);
  // …but an APP-driven exit (the system back gesture) must: that is how the
  // WebView clears document.fullscreenElement, which is what keeps the
  // Fullscreen / Hide-status-bar labels in sync.
  assert.match(chromeClient, /public boolean hideCustomView\(\)/);
  assert.match(chromeClient, /callback\.onCustomViewHidden\(\)/);
  assert.match(androidMain, /public void onBackPressed\(\)/);
  assert.match(androidMain, /if \(client != null && client\.hideCustomView\(\)\) return;/);
});

test("the AppFullscreen plugin hides both system bars and survives rotation", () => {
  assert.match(plugin, /@CapacitorPlugin\(name = "AppFullscreen"\)/);
  for (const method of ["enter", "exit", "isActive"]) {
    assert.match(plugin, new RegExp(`public void ${method}\\(PluginCall call\\)`));
  }
  assert.match(plugin, /WindowCompat\.getInsetsController\(window, decor\)/);
  assert.match(plugin, /WindowInsetsControllerCompat\.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/);
  assert.match(plugin, /controller\.hide\(WindowInsetsCompat\.Type\.systemBars\(\)\)/);
  assert.match(plugin, /controller\.show\(WindowInsetsCompat\.Type\.systemBars\(\)\)/);
  // Static flag + re-assert hooks: rotation (config changes) and a focus
  // round-trip (notification shade, permission dialog) must not lose it.
  assert.match(plugin, /private static boolean immersive = false;/);
  assert.match(plugin, /static void reapply\(Activity activity\)/);
  assert.match(plugin, /static void setCustomViewActive\(Activity activity, boolean active\)/);
  assert.match(plugin, /result\.put\("active", immersive \|\| customViewFullscreen\)/);
  assert.match(androidMain, /public void onResume\(\)/);
  assert.match(androidMain, /public void onWindowFocusChanged\(boolean hasFocus\)/);
  assert.match(androidMain, /AppFullscreenPlugin\.reapply\(this\)/);
  // The shell must keep handling orientation itself, or every rotation would
  // recreate the Activity and drop the flag.
  assert.match(manifest, /android:configChanges="orientation\|keyboardHidden\|keyboard\|screenSize/);
  // The Sanctuary landscape rule is untouched.
  assert.match(androidMain, /public void lockLandscapeForSanctuary\(\)/);
  assert.match(androidMain, /SCREEN_ORIENTATION_SENSOR_LANDSCAPE/);
});

/* ------------------------------------------------------------------ */
/* 2 · the shared controller owns the platform decision                 */
/* ------------------------------------------------------------------ */

test("the controller layers native → web → in-page fallback", () => {
  assert.match(controller, /registerPlugin<AppFullscreenPlugin>\("AppFullscreen"\)/);
  assert.match(controller, /export const isNativeRuntime = \(\): boolean =>/);
  assert.match(controller, /export const enterFullscreen = async/);
  assert.match(controller, /export const exitFullscreen = async/);
  assert.match(controller, /export const toggleFullscreen = async/);
  assert.match(controller, /export const subscribeFullscreen = /);
  assert.match(controller, /export const getFullscreenSnapshot = /);
  assert.match(controller, /export const isFullscreenActive = /);
  // The web layer keeps the immersive Android options…
  assert.match(controller, /requestFullscreen\(\{ navigationUI: "hide" \}\)/);
  // …with the WebKit / MS prefixes for older WebViews…
  assert.match(controller, /webkitRequestFullscreen/);
  assert.match(controller, /webkitExitFullscreen/);
  // …and the page-level fallback for iOS Safari / in-app browsers.
  assert.match(controller, /data-app-fullscreen/);
  assert.match(controller, /options\.allowAppFallback === false/);
  // Browser exits (swipe-down, Esc) keep the snapshot honest.
  assert.match(controller, /addEventListener\("fullscreenchange", onWebChange\)/);
  assert.match(controller, /addEventListener\("webkitfullscreenchange", onWebChange as EventListener\)/);
  assert.match(controller, /addEventListener\("visibilitychange"/);
});

test("every fullscreen button in the app goes through the controller", () => {
  // Sanctuary → Scene → Fullscreen (the row the owner reported).
  assert.match(naturePage, /toggleFullscreen as toggleAppFullscreen/);
  assert.match(naturePage, /void toggleAppFullscreen\(\);/);
  assert.doesNotMatch(naturePage, /root\.requestFullscreen\?\.\(\)/, "no bare, swallowed request is left");
  assert.doesNotMatch(naturePage, /document\.exitFullscreen\?\.\(\)\.catch/, "the APK path cannot swallow a rejection any more");
  assert.match(settings, /label=\{immersive \? "Exit fullscreen" : "Fullscreen"\}/);
  // The label mirrors the LIVE snapshot, not a local guess.
  assert.match(naturePage, /subscribeFullscreen\(\(\) => setFullscreen\(getFullscreenSnapshot\(\)\)\)/);
  // Leaving the world releases the layer (the system bars must come back).
  assert.match(naturePage, /if \(isFullscreenActive\(\)\) void exitAppFullscreen\(\);/);
  // Course Player → Player tab → "Hide status bar".
  assert.match(statusBar, /enterFullscreen\(\{ allowAppFallback: false \}\)/);
  assert.match(statusBar, /isFullscreenActive\(\)/);
  assert.match(player, /enterCoursePlayerFullscreen\(\)/);
  // Media viewer → Player tab → "Fullscreen" (element request).
  assert.match(resourceViewer, /toggleAppFullscreen\(\{ element: root \}\)/);
});

test("the page-level fallback frees the sanctuary viewport", () => {
  // Only the fallback layer applies, the OS bars arrive by themselves
  // everywhere else — so the HUD chrome steps aside through CSS…
  assert.match(winterCss, /html\[data-app-fullscreen="true"\] \[data-sanctuary-root\] \[data-sanctuary-chrome\]/);
  assert.match(naturePage, /data-sanctuary-chrome/);
  // …and the engine's HUD insets follow the same state.
  assert.match(naturePage, /if \(hudHidden \|\| appImmersive\)/);
  assert.match(naturePage, /const appImmersive = fullscreen\.mode === "app";/);
  // The tray (and the gear inside it) is off-screen in the fallback, so the
  // bottom-right corner button becomes the exit control — a fullscreen mode
  // the learner cannot leave would be a trap.
  assert.match(naturePage, /if \(appImmersive\) \{[\s\S]{0,120}void exitAppFullscreen\(\);\s*return;/);
  assert.match(naturePage, /appImmersive\s*\?\s*"Exit fullscreen"/);
});

/* ------------------------------------------------------------------ */
/* 3 · runtime — the real module, exercised in jsdom                    */
/* ------------------------------------------------------------------ */

const OUT_DIR = path.join(ROOT, "node_modules/.tmp-fullscreen-contract");
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT_BUNDLE = path.join(OUT_DIR, "fullscreen.mjs");
await build({
  entryPoints: ["src/utils/fullscreen.ts"],
  outfile: OUT_BUNDLE,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  tsconfig: "tsconfig.json",
  absWorkingDir: ROOT,
  logLevel: "silent",
});
const BUNDLE_URL = new URL(`file://${OUT_BUNDLE}`).href;

let doms = [];
after(() => {
  for (const { dom } of doms) dom.window.close();
});

/** Fresh jsdom + a FRESH module instance (its state is module-level). */
function freshController() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  doms.push({ dom });
  const { window } = dom;
  for (const key of ["window", "document", "Element", "Node", "Event", "CustomEvent", "HTMLElement", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"]) {
    globalThis[key] = window[key];
  }
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  const url = `${BUNDLE_URL}?instance=${doms.length}`;
  return { window, load: () => import(url) };
}

/** A document fullscreen element that can be set from the test. */
function fakeFullscreenElement(window, element) {
  Object.defineProperty(window.document, "fullscreenElement", {
    configurable: true,
    get: () => element,
  });
}

test("no Fullscreen API (iOS Safari) → the page-level layer still answers", async () => {
  const { window, load } = freshController();
  window.document.documentElement.requestFullscreen = undefined;
  window.document.documentElement.webkitRequestFullscreen = undefined;
  const mod = await load();

  const snapshot = await mod.enterFullscreen();
  assert.equal(snapshot.active, true, "the button is never a no-op");
  assert.equal(snapshot.mode, "app");
  assert.equal(window.document.documentElement.getAttribute("data-app-fullscreen"), "true");
  assert.equal(mod.isFullscreenActive(), true);

  const after = await mod.exitFullscreen();
  assert.equal(after.active, false);
  assert.equal(window.document.documentElement.hasAttribute("data-app-fullscreen"), false);
});

test("an honoured requestFullscreen is the layer that wins", async () => {
  const { window, load } = freshController();
  let requested = 0;
  window.document.documentElement.requestFullscreen = () => {
    requested += 1;
    fakeFullscreenElement(window, window.document.documentElement);
    return Promise.resolve();
  };
  window.document.documentElement.webkitExitFullscreen = undefined;
  window.document.exitFullscreen = () => {
    fakeFullscreenElement(window, null);
    return Promise.resolve();
  };

  const mod = await load();
  const snapshot = await mod.enterFullscreen();
  assert.equal(requested, 1);
  assert.equal(snapshot.mode, "web");
  assert.equal(snapshot.active, true);
  assert.equal(
    window.document.documentElement.hasAttribute("data-app-fullscreen"),
    false,
    "a real fullscreen never needs the in-page flag",
  );

  const exited = await mod.toggleFullscreen();
  assert.equal(exited.active, false);
  assert.equal(exited.mode, "none");
});

test("a rejected request falls back — unless the caller forbade it", async () => {
  const first = freshController();
  first.window.document.documentElement.requestFullscreen = () => Promise.reject(new Error("denied"));
  const fallback = await (await first.load()).enterFullscreen();
  assert.equal(fallback.mode, "app", "a denial still gives the learner a full-bleed screen");

  const second = freshController();
  second.window.document.documentElement.requestFullscreen = () => Promise.reject(new Error("denied"));
  const honest = await (await second.load()).enterFullscreen({ allowAppFallback: false });
  assert.equal(honest.active, false, "the Course Player switch must not claim a fullscreen it does not have");
  assert.equal(honest.mode, "none");
  assert.equal(second.window.document.documentElement.hasAttribute("data-app-fullscreen"), false);
});

test("an element request targets that element, and subscribers hear every change", async () => {
  const { window, load } = freshController();
  const mod = await load();
  const stage = window.document.createElement("div");
  window.document.body.appendChild(stage);
  let called = 0;
  stage.requestFullscreen = () => {
    called += 1;
    fakeFullscreenElement(window, stage);
    return Promise.resolve();
  };
  window.document.exitFullscreen = () => {
    fakeFullscreenElement(window, null);
    return Promise.resolve();
  };

  const seen = [];
  const unsubscribe = mod.subscribeFullscreen(() => seen.push(mod.getFullscreenSnapshot().mode));

  const entered = await mod.enterFullscreen({ element: stage });
  assert.equal(called, 1);
  assert.equal(entered.mode, "web");
  assert.ok(seen.includes("web"), "subscribers were told");

  await mod.exitFullscreen();
  assert.ok(seen.includes("none"), "and told again when it ended");
  unsubscribe();
});
