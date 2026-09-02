// Phase A — wave A1 "Foundation" contract.
//
// Owner direction (2026-09-02): the blurred Black Ice backdrop is the ONLY
// page background. Every white page and every gradient page wash is removed
// at the source — mobile, tablet and desktop alike — before the 22 pack
// components are adopted everywhere.
//
// This file pins the foundation so a later change cannot quietly bring a
// painted page back:
//   1. the backdrop mounts exactly once, at the routing level, for every
//      non-admin route (checkout / auth / landing / course player included)
//   2. no page root paints white / a light wash / a navy plate
//   3. no `data-app-frame` paints the old "phone card" (white + shadow + border)
//   4. the CSS-file page paint (shell gradient, aurora orbs, frame wash,
//      profile wash, hero gradients) is gone from src/index.css
//   5. the canvas behind the backdrop is the base ink, never white
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const main = read("src/main.tsx");
const indexCss = read("src/index.css");
const glassCss = read("src/glass.css");
const indexHtml = read("index.html");

const FROZEN = ["src/admin/", "src/components/admin/", "src/AdminLoginApp.tsx", "src/components/BottomNav.tsx", "src/components/glass-dock/"];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}
const srcRoot = new URL("../src", import.meta.url).pathname;
const appFiles = walk(srcRoot)
  .map((p) => p.slice(srcRoot.length - 3))
  .filter((p) => !FROZEN.some((f) => p.startsWith(f)))
  .filter((p) => !p.startsWith("src/components/ui/"));

test("the Black Ice backdrop mounts once, at the routing level, for every non-admin route", () => {
  assert.match(main, /import \{ GlassBackdrop \} from "\.\/components\/ui\/GlassBackdrop"/);
  assert.match(main, /function RouteBackdrop\(\)/);
  assert.match(main, /if \(hash\.startsWith\(ADMIN_HASH\) \|\| hash\.startsWith\(ADMIN_LOGIN_HASH\)\) return null;\s*return <GlassBackdrop \/>;/);
  assert.match(main, /<RouteBackdrop \/>\s*<DesktopAppHost>/);
  // No second mount anywhere in app code — two layers would double the grain.
  const mounts = appFiles.filter((p) => /<GlassBackdrop\b/.test(read(p)));
  assert.deepEqual(mounts, ["src/main.tsx"], `GlassBackdrop must mount only in main.tsx, found: ${mounts.join(", ")}`);
});

test("no page root paints a white page, a light wash or a navy plate", () => {
  const offenders = [];
  for (const p of appFiles) {
    const src = read(p);
    if (/min-h-screen bg-white\b/.test(src)) offenders.push(`${p}: min-h-screen bg-white`);
    if (/min-h-\[100dvh\][^"]*\bbg-white\b(?!\/)/.test(src)) offenders.push(`${p}: min-h-[100dvh] bg-white`);
    if (/min-h-screen bg-gradient-to-b from-indigo-50/.test(src)) offenders.push(`${p}: indigo page wash`);
    if (/(min-h-screen|h-\[100dvh\]|min-h-\[100dvh\])[^"]*bg-\[#05060f\]/.test(src)) offenders.push(`${p}: navy plate`);
    if (/(min-h-screen|h-\[100dvh\]|min-h-\[100dvh\])[^"]*bg-\[#f6f7fb\]/.test(src)) offenders.push(`${p}: desktop grey plate`);
    if (/(min-h-screen|h-\[100dvh\]|min-h-\[100dvh\])[^"]*bg-slate-50\b/.test(src)) offenders.push(`${p}: slate-50 plate`);
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("no data-app-frame paints the old phone card (white + shadow + border)", () => {
  const offenders = [];
  for (const p of appFiles) {
    const src = read(p);
    const re = /data-app-frame[^>]*className="([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) {
      const cls = m[1];
      if (/\bbg-white\b(?!\/)/.test(cls) || /\blg:bg-white\b/.test(cls) || /shadow-xl/.test(cls) || /border-slate-200/.test(cls)) {
        offenders.push(`${p}: ${cls}`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("src/index.css no longer paints any page-level background", () => {
  // shell + frame + profile + hero paint is gone at the source
  assert.doesNotMatch(indexCss, /\.dc-app-shell::before\s*\{/, "aurora orb ::before must be deleted");
  assert.doesNotMatch(indexCss, /\.dc-app-shell::after\s*\{/, "aurora orb ::after must be deleted");
  assert.doesNotMatch(indexCss, /linear-gradient\(180deg, #f6f8ff/, "shell wash must be deleted");
  assert.doesNotMatch(indexCss, /linear-gradient\(180deg, #f7f8fc/, "tablet/desktop shell wash must be deleted");
  assert.doesNotMatch(indexCss, /linear-gradient\(180deg, #eef2ff/, "profile wash must be deleted");
  assert.doesNotMatch(indexCss, /#f4f6fb/, "reduced-motion grey plate must be deleted");
  assert.doesNotMatch(indexCss, /linear-gradient\(160deg, #4f46e5 0%, #7c3aed 55%, #a21caf 100%\)/, "hero gradient must be deleted");
  const frame = indexCss.match(/\.dc-app-frame\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(frame, /background:\s*transparent/);
  assert.match(frame, /box-shadow:\s*none/);
  const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const block of stripComments(indexCss).matchAll(/\.dc-app-shell\s*\{[^}]*\}/g)) {
    assert.doesNotMatch(block[0], /gradient/, `.dc-app-shell must not paint a gradient: ${block[0]}`);
  }
  const hero = stripComments(indexCss).match(/\.dc-glass-hero\s*\{[^}]*\}/)?.[0] ?? "";
  assert.match(hero, /background-color:\s*rgba\(60, 62, 68, 0\.21\)/, "hero is the GlassSurface dark-scheme material");
  assert.doesNotMatch(hero, /gradient/);
});

test("the canvas behind the backdrop is the base ink, never white", () => {
  assert.match(indexCss, /html,\s*body,\s*#root\s*\{[^}]*background-color:\s*#0a0c12/);
  assert.match(indexCss, /body,\s*#root\s*\{\s*background-color:\s*transparent;\s*\}/);
  assert.doesNotMatch(indexCss, /html,\s*body,\s*#root\s*\{[^}]*background-color:\s*#ffffff/);
  // The pre-React boot splash paints the same palette so there is no flash.
  assert.match(indexHtml, /html \{ background-color: #0a0c12; \}/);
  assert.match(indexHtml, /\.app-boot-splash \{[^}]*background-color: #0a0c12;[^}]*radial-gradient\(58% 72% at 12% 30%/);
  assert.doesNotMatch(indexHtml, /#312e81/);
});

test("the blanket CSS overrides for that paint are retired (removed at source instead)", () => {
  assert.doesNotMatch(glassCss, /html\[data-glass="on"\] \.dc-app-shell\s*\{\s*background:\s*transparent !important/);
  assert.doesNotMatch(glassCss, /html\[data-glass="on"\] \.dc-app-shell::before/);
  assert.doesNotMatch(glassCss, /html\[data-glass="on"\] \.dc-glass-hero,/);
  assert.match(glassCss, /Phase A \(2026-09-02\)/);
});
