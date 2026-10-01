import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const main = fs.readFileSync("src/main.tsx", "utf8");
const backdrop = fs.readFileSync("src/components/ui/GlassBackdrop.tsx", "utf8");
const backgroundCss = fs.readFileSync("src/winter-background.css", "utf8");

test("one shared background controller covers learner routes and stays off admin", () => {
  assert.match(main, /function RouteBackdrop\(\)/);
  assert.match(main, /if \(hash\.startsWith\(ADMIN_HASH\) \|\| hash\.startsWith\(ADMIN_LOGIN_HASH\)\) return null;\s*return <GlassBackdrop \/>;/);
  assert.match(main, /<RouteBackdrop \/>\s*<DesktopAppHost>/);
  assert.equal((main.match(/<GlassBackdrop\b/g) || []).length, 1);
});

test("the clean gradient is the default and the continuous snowfall scene is opt-in", () => {
  assert.match(backdrop, /const STORAGE_KEY = "dc\.background\.mode"/);
  assert.match(backdrop, /return value === "winter" \? "winter" : "clean"/);
  assert.match(backdrop, /useState<BackgroundMode>\(readMode\)/);
  assert.match(backdrop, /\{snowfallEnabled \? \([\s\S]*?<WinterScene \/>[\s\S]*?: \([\s\S]*?className="dc-clean-backdrop"/);
  assert.match(backdrop, /window\.localStorage\.setItem\(STORAGE_KEY, mode\)/);
  assert.match(backdrop, /role="switch"[\s\S]*?aria-checked=\{snowfallEnabled\}/);
  assert.match(backdrop, /aria-label="Snowfall background"/);

  const cleanLayer = backgroundCss.match(/\.dc-clean-backdrop\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(cleanLayer, /position:\s*fixed/);
  assert.match(cleanLayer, /inset:\s*0/);
  assert.match(cleanLayer, /z-index:\s*-1/);
  assert.match(cleanLayer, /radial-gradient/);
  assert.doesNotMatch(cleanLayer, /(?:backdrop-)?filter\s*:|animation\s*:/);
});

test("the background preference follows hash navigation and syncs across tabs", () => {
  assert.match(backdrop, /window\.addEventListener\("hashchange", onHashChange\)/);
  assert.match(backdrop, /window\.addEventListener\("storage", onStorage\)/);
  assert.match(backdrop, /data-dc-background-toggle/);
  assert.match(backdrop, /dc-background-toggle--immersive/);
});
