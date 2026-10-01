import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const preference = fs.readFileSync("src/context/BackgroundPreferenceContext.tsx", "utf8");
const backdrop = fs.readFileSync("src/components/ui/GlassBackdrop.tsx", "utf8");
const profile = fs.readFileSync("src/profile/ProfileLayout.tsx", "utf8");
const profilePreview = fs.readFileSync("src/profile/ProfilePreview.tsx", "utf8");
const backgroundCss = fs.readFileSync("src/winter-background.css", "utf8");

test("one shared preference controls learner routes and stays off admin", () => {
  assert.match(main, /<BackgroundPreferenceProvider>[\s\S]*?<RouteBackdrop \/>[\s\S]*?<DesktopAppHost>/);
  assert.match(main, /if \(hash\.startsWith\(ADMIN_HASH\) \|\| hash\.startsWith\(ADMIN_LOGIN_HASH\)\) return null;\s*return <GlassBackdrop \/>;/);
  assert.equal((main.match(/<GlassBackdrop\b/g) || []).length, 1);
  assert.match(backdrop, /useBackgroundPreference\(\)/);
});

test("the clean gradient is the default and the snowfall scene remains opt-in", () => {
  assert.match(preference, /const STORAGE_KEY = "dc\.background\.mode"/);
  assert.match(preference, /return value === "winter" \? "winter" : "clean"/);
  assert.match(preference, /useState<BackgroundMode>\(readMode\)/);
  assert.match(preference, /enabled \? "clean" : "winter"/);
  assert.match(preference, /window\.localStorage\.setItem\(STORAGE_KEY, nextMode\)/);
  assert.match(backdrop, /if \(mode === "winter"\) return <WinterScene \/>/);
  assert.match(backdrop, /className="dc-clean-backdrop"/);

  const cleanLayer = backgroundCss.match(/\.dc-clean-backdrop\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(cleanLayer, /position:\s*fixed/);
  assert.match(cleanLayer, /inset:\s*0/);
  assert.match(cleanLayer, /z-index:\s*-1/);
  assert.match(cleanLayer, /radial-gradient/);
  assert.doesNotMatch(cleanLayer, /(?:backdrop-)?filter\s*:|animation\s*:/);
});

test("the clean-background switch is on the Profile page, not a floating global control", () => {
  assert.match(profile, /data-profile-background-preference/);
  assert.match(profile, /checked=\{cleanBackgroundEnabled\}/);
  assert.match(profile, /ariaLabel="Clean background"/);
  assert.match(profilePreview, /useBackgroundPreference\(\)/);
  assert.match(profilePreview, /cleanBackgroundEnabled=\{cleanBackgroundEnabled\}/);
  assert.match(profilePreview, /onCleanBackgroundChange=\{setCleanBackgroundEnabled\}/);
  assert.doesNotMatch(backdrop, /<button|data-dc-background-toggle/);
  assert.doesNotMatch(backgroundCss, /\.dc-background-toggle/);
});

test("the saved background preference stays in sync across tabs", () => {
  assert.match(preference, /window\.addEventListener\("storage", onStorage\)/);
});
