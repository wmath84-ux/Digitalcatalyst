// tests/adminBrandingAssetsContract.test.mjs
//
// Branding → Logo and Branding → App behaviour are where the owner now controls
// the installed app icon and the opening animation. These are the rules that
// keep that surface honest:
//
//   · the logo can come from an UPLOAD or from a direct RELEASE URL, and both
//     write the same `logoUrl` field (nothing else has to change downstream);
//   · the panel shows the exact three icon files the installed PWA will ask
//     for, so the mask-safe rendering is visible before installing;
//   · the animation has two switches — "available in the app" and "play by
//     itself while the app opens" — and the second one is OFF by default;
//   · the clip can point at a release asset, per band, with the release-PAGE
//     trap called out;
//   · a save can never turn the launch playback on by accident, and never
//     starts one by accident either.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyReleaseUrl } from "../src/utils/releaseUrl.ts";

const page = fs.readFileSync("src/admin/pages/BrandingPage.tsx", "utf8");
const field = fs.readFileSync("src/components/admin/BrandUrlField.tsx", "utf8");
// `src/utils/branding.ts` imports a sibling without an extension (bundler
// resolution), so it cannot be imported by a node test — its rules are pinned
// as source contracts below, exactly like the rest of the repo's config tests.
const branding = fs.readFileSync("src/utils/branding.ts", "utf8");

test("the logo can be uploaded or pasted as a release URL", () => {
  assert.match(page, /data-branding-logo-source=\{option\.id\}/);
  assert.match(page, /\{ id: "upload" as const, label: "Upload" \}/);
  assert.match(page, /\{ id: "url" as const, label: "Release URL" \}/);
  // Both modes write `logoUrl` — the release URL is not a parallel field.
  assert.match(page, /logoSource === "upload" \? \(\s*\n\s*<CloudinaryImageUploadField/);
  assert.match(page, /<BrandUrlField\s*\n\s*label="Logo release URL"\s*\n\s*kind="image"/);
  // …and the panel states what an Android rebuild does with it, because the
  // launcher icon of an installed APK cannot change remotely.
  assert.match(page, /run the Android build: it bakes this same logo in/);
});

test("the panel previews the exact icon files the installed PWA requests", () => {
  assert.match(page, /data-branding-logo-live/);
  for (const url of ["/api/brand-icon?size=192", "/api/brand-icon?size=512", "/api/brand-icon?size=512&maskable=1"]) {
    assert.ok(page.includes(url), `the preview must request ${url}`);
  }
  assert.match(page, /data-branding-logo-preview=\{icon\.label\}/);
  // Rendered as circles, so the launcher's round mask is visible right here.
  assert.match(page, /rounded-full border border-slate-200 bg-white object-cover/);
});

test("the animation has two switches and the launch playback is opt-in", () => {
  assert.match(page, /data-branding-opening-enabled/);
  assert.match(page, /data-branding-opening-play-on-launch/);
  assert.match(page, /data-branding-opening-quick-launch/);
  // Fail-safe persistence: undefined/false must both mean "do not play by
  // itself", never "start a ten-second video in front of every app open".
  assert.match(page, /const openingPlayOnLaunch = merged\.openingPlayOnLaunch === true;/);
  assert.match(page, /const openingAnimationEnabled = merged\.openingAnimationEnabled !== false;/);
  // The quick switch saves immediately (same pattern as the border-lines one).
  assert.match(page, /void persist\(\{ openingAnimationEnabled: on \? true : draft\.openingAnimationEnabled, openingPlayOnLaunch: on \}\);/);
  // …and the persisted document carries every new field.
  for (const key of [
    "openingPlayOnLaunch",
    "openingAnimationUrl",
    "openingAnimationUrlMobile",
    "openingAnimationUrlDesktop",
  ]) {
    assert.ok(page.includes(`${key},`), `persist() must write ${key}`);
    assert.ok(page.includes(key), `writeCachedBranding() must cache ${key}`);
  }
  assert.match(page, /if \(\/\^https:\\\/\\\/i\.test\(text\)\) return "";|const httpsOnly = \(value: string\) => \{/);
});

test("clip URLs are probed as media, never with fetch()", () => {
  // GitHub release assets send no CORS headers, and playback does not need
  // them — a fetch() probe would reject a URL that plays perfectly.
  assert.match(field, /document\.createElement\("video"\)/);
  assert.match(field, /video\.src = text;/);
  assert.match(field, /loadedmetadata/);
  assert.doesNotMatch(field, /fetch\(/);
  // Images are probed with an <img> and report their real size + squareness.
  assert.match(field, /new Image\(\)/);
  assert.match(field, /naturalWidth/);
  assert.match(field, /square \? "square ✓"/);
});

test("the release-URL rules catch the page-link trap and http", () => {
  assert.deepEqual(classifyReleaseUrl(""), { ok: true, warning: null, status: "empty" });
  assert.equal(classifyReleaseUrl("https://github.com/o/r/releases/download/v1/open.mp4", "video").status, "ok");
  assert.equal(classifyReleaseUrl("https://github.com/o/r/releases/tag/v1", "video").status, "release-page");
  assert.equal(classifyReleaseUrl("https://github.com/o/r/releases/latest", "image").status, "release-page");
  assert.equal(classifyReleaseUrl("http://cdn.example/x.png", "image").status, "insecure");
  assert.equal(classifyReleaseUrl("javascript:alert(1)", "image").status, "insecure");
  assert.equal(classifyReleaseUrl("/icons/icon.png", "image").status, "insecure");
  // Cloudinary-style extension-less URLs stay usable, with a gentle note.
  assert.equal(classifyReleaseUrl("https://res.cloudinary.com/demo/image/upload/v1/brand", "image").status, "missing-extension");
  assert.match(classifyReleaseUrl("https://github.com/o/r/releases/tag/v1", "video").warning, /releases\/download/);
});

test("branding defaults keep the launch playback off and the clip bundled", () => {
  // Defaults…
  assert.match(branding, /openingPlayOnLaunch: false,/);
  assert.match(branding, /openingAnimationUrl: "",/);
  assert.match(branding, /openingAnimationUrlMobile: "",/);
  assert.match(branding, /openingAnimationUrlDesktop: "",/);
  assert.match(branding, /openingAnimationEnabled: true,/);
  // …and the normaliser, which is what an older branding document goes
  // through: only a literal `true` arms the launch playback, and every clip URL
  // must be absolute https (a typo, a path or `javascript:` becomes "").
  assert.match(branding, /openingPlayOnLaunch: data\?\.openingPlayOnLaunch === true,/);
  assert.match(branding, /openingAnimationUrl: sanitizeAnimationUrl\(data\?\.openingAnimationUrl\),/);
  assert.match(branding, /openingAnimationUrlMobile: sanitizeAnimationUrl\(data\?\.openingAnimationUrlMobile\),/);
  assert.match(branding, /openingAnimationUrlDesktop: sanitizeAnimationUrl\(data\?\.openingAnimationUrlDesktop\),/);
  assert.match(branding, /function sanitizeAnimationUrl\(value: unknown\): string \{\s*\n\s*const text = typeof value === "string" \? value\.trim\(\) : "";\s*\n\s*if \(!text\) return "";\s*\n\s*if \(!\/\^https:\\\/\\\/\/i\.test\(text\)\) return "";/);
});

test("the preview button works in tap-only mode too", () => {
  // Without arming the launch mode for that one playback, replay() would
  // resolve to "tap-only" and the button would look broken.
  assert.match(page, /setOpeningRuntimeOverride\("on"\);/);
  assert.match(page, /void controller\?\.whenDone\(\)\.then\(\(\) => setOpeningRuntimeOverride\(null\)\);/);
  assert.match(page, /data-branding-opening-preview/);
});
