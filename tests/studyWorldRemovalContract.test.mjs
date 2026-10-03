// Removal contract for the retired 3D study destination: it must not be
// reachable from routing or navigation, and its renderer/assets stay deleted.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const exists = (file) => fs.existsSync(path.join(ROOT, file));

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const file = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (/\.(tsx?|mjs|css|html|json)$/.test(entry.name)) out.push(file);
  }
  return out;
};

test("the retired study-world route and both navigation entries are absent", () => {
  const main = read("src/main.tsx");
  const bottomNav = read("src/components/BottomNav.tsx");
  const home = read("src/home/App.tsx");
  const desktopShell = read("src/components/DesktopShell.tsx");
  const desktopPeekDock = read("src/components/glass-dock/DesktopPeekDock.tsx");
  const siteFooter = read("src/components/SiteFooterNav.tsx");
  const glassDock = read("src/components/glass-dock/GlassDock.tsx");

  assert.doesNotMatch(main, /NatureStudioPage|nature3d|nature-studio|sanctuary/i);
  assert.doesNotMatch(bottomNav, /sanctuary|nature-studio/i);
  assert.doesNotMatch(home, /showSanctuary|nature-studio/i);
  for (const [name, source] of [
    ["desktop side panel", desktopShell],
    ["desktop peek dock", desktopPeekDock],
    ["site footer", siteFooter],
    ["shared dock", glassDock],
  ]) {
    assert.doesNotMatch(source, /sanctuary|nature-studio/i, `${name} must not expose the removed destination`);
  }

  for (const file of walk("src")) {
    assert.doesNotMatch(read(file), /(?:src\/nature3d|\/sanctuary\/|#\/nature-studio|NatureStudioPage)/i, file);
  }
});

test("the 3D scene, model libraries, icon and source assets are deleted", () => {
  for (const file of [
    "src/nature3d",
    "public/sanctuary",
    "public/safari",
    "public/icons/sanctuary-dinosaur.png",
    "Beach+House_Pack+JSGraphics_CGTrader.blend",
    "pahadon ke upar gras replace hill.blend",
  ]) {
    assert.equal(exists(file), false, `${file} must be removed`);
  }
});
