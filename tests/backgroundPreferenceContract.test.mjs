import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const backdrop = fs.readFileSync("src/components/ui/GlassBackdrop.tsx", "utf8");
const profile = fs.readFileSync("src/profile/ProfileLayout.tsx", "utf8");
const backgroundCss = fs.readFileSync("src/winter-background.css", "utf8");

test("Clean Board is the permanent default backdrop and stays off admin", () => {
  assert.match(main, /<BackgroundPreferenceProvider>[\s\S]*?<RouteBackdrop \/>[\s\S]*?<DesktopAppHost>/);
  assert.match(main, /if \(hash\.startsWith\(ADMIN_HASH\) \|\| hash\.startsWith\(ADMIN_LOGIN_HASH\)\) return null;\s*return <GlassBackdrop \/>;/);
  assert.equal((main.match(/<GlassBackdrop\b/g) || []).length, 1);
  assert.match(backdrop, /useBackgroundPreference\(\)/);
  assert.match(backdrop, /className="dc-clean-backdrop"/);
  assert.doesNotMatch(backdrop, /<WinterScene/);
  assert.equal(fs.existsSync("src/components/backgrounds/WinterScene.tsx"), false);
});

test("the clean gradient is the default fixed backdrop across all devices", () => {
  const cleanLayer = backgroundCss.match(/\.dc-clean-backdrop\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(cleanLayer, /position:\s*fixed/);
  assert.match(cleanLayer, /inset:\s*0/);
  assert.match(cleanLayer, /z-index:\s*-1/);
  assert.match(cleanLayer, /radial-gradient/);
  assert.doesNotMatch(cleanLayer, /(?:backdrop-)?filter\s*:|animation\s*:/);
});

test("the clean-background switch and controls are completely removed from the Profile page", () => {
  assert.doesNotMatch(profile, /data-profile-background-preference/);
  assert.doesNotMatch(profile, /checked=\{cleanBackgroundEnabled\}/);
  assert.doesNotMatch(profile, /ariaLabel="Clean background"/);
  assert.doesNotMatch(profile, /cleanBackgroundEnabled/);
  assert.doesNotMatch(backdrop, /<button|data-dc-background-toggle/);
  assert.doesNotMatch(backgroundCss, /\.dc-background-toggle/);
});
