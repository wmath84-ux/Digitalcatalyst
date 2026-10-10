// tests/systemThemeStatusBarContract.test.mjs
//
// Contract test for system-theme based status bar styling across PWA and APK:
// - Light mode -> White status bar (#ffffff) with dark icons.
// - Dark mode -> Dark status bar (#000000) with light icons.
// - No blue status bar (#2563eb, #303F9F, #3F51B5).
// - Dynamic system-theme listener at runtime.
// - Native Android styles, night mode config changes, and Capacitor bridge.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

test("index.html contains system-theme media queries for status bar chrome", () => {
  const html = read("index.html");
  assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: light\)" content="#ffffff" \/>/);
  assert.match(html, /<meta name="theme-color" media="\(prefers-color-scheme: dark\)" content="#000000" \/>/);
  assert.doesNotMatch(html, /content="#2563eb"/);
});

test("web manifests do not use blue theme-color", () => {
  const manifestJson = JSON.parse(read("public/manifest.webmanifest"));
  assert.notEqual(manifestJson.theme_color, "#2563eb");
  assert.equal(manifestJson.theme_color, "#000000");

  const manifestTs = read("api/_lib/manifest.ts");
  assert.doesNotMatch(manifestTs, /theme_color:\s*"#2563eb"/);
});

test("src/utils/themeColor.ts synchronizes with system theme and notifies native APK", () => {
  const themeColorTs = read("src/utils/themeColor.ts");
  assert.match(themeColorTs, /STATUS_BAR_LIGHT = "#ffffff"/);
  assert.match(themeColorTs, /STATUS_BAR_DARK = "#000000"/);
  assert.match(themeColorTs, /prefers-color-scheme: dark/);
  assert.match(themeColorTs, /export function syncSystemThemeColor/);
  assert.match(themeColorTs, /export function setThemeColor/);
  // The native call moved to the single coordinator; themeColor.ts only reports overrides.
  assert.match(themeColorTs, /setSystemBarOverride/);
  const systemBars = read("src/utils/systemBars.ts");
  assert.match(systemBars, /AppStatusBar/);
  assert.match(systemBars, /setSystemBars/);
});

test("Android color resources define light and night status bar colors without blue fallback", () => {
  const colorsLight = read("android/app/src/main/res/values/colors.xml");
  const colorsNight = read("android/app/src/main/res/values-night/colors.xml");

  assert.match(colorsLight, /<color name="statusBarColor">#FFFFFF<\/color>/);
  assert.match(colorsLight, /<color name="colorPrimary">#FFFFFF<\/color>/);
  assert.doesNotMatch(colorsLight, /#303F9F/);
  assert.doesNotMatch(colorsLight, /#3F51B5/);

  assert.match(colorsNight, /<color name="statusBarColor">#000000<\/color>/);
  assert.match(colorsNight, /<color name="colorPrimary">#000000<\/color>/);
});

test("Android style resources configure light and dark status bar with icon contrast", () => {
  const stylesLight = read("android/app/src/main/res/values/styles.xml");
  const stylesNight = read("android/app/src/main/res/values-night/styles.xml");

  assert.match(stylesLight, /<item name="android:statusBarColor">@color\/statusBarColor<\/item>/);
  assert.match(stylesLight, /<item name="android:windowLightStatusBar">true<\/item>/);

  assert.match(stylesNight, /<item name="android:statusBarColor">@color\/statusBarColor<\/item>/);
  assert.match(stylesNight, /<item name="android:windowLightStatusBar">false<\/item>/);
});

test("Android native code includes AppStatusBarPlugin and handles configuration changes", () => {
  const mainActivity = read("android/app/src/main/java/app/eduvora/shop/MainActivity.java");
  const plugin = read("android/app/src/main/java/app/eduvora/shop/AppStatusBarPlugin.java");
  const fullscreen = read("android/app/src/main/java/app/eduvora/shop/AppFullscreenPlugin.java");

  assert.match(mainActivity, /registerPlugin\(AppStatusBarPlugin\.class\)/);
  assert.match(mainActivity, /public void onConfigurationChanged\(android\.content\.res\.Configuration newConfig\)/);
  assert.match(mainActivity, /syncStatusBarThemeWithSystem\(\)/);

  assert.match(fullscreen, /public static boolean isImmersiveActive\(\)/);

  assert.match(plugin, /@CapacitorPlugin\(name = "AppStatusBar"\)/);
  assert.match(plugin, /setAppearanceLightStatusBars/);
  assert.match(plugin, /setStatusBarColor/);
});
