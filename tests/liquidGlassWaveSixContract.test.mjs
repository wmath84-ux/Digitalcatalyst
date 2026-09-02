// tests/liquidGlassWaveSixContract.test.mjs
//
// Wave 6 — the closing pass (docs/liquid-glass-rollout-plan.md §5): the last two
// hand-painted surfaces (`#/home` hero actions, checkout), the theme-detection
// correction that Wave 4's band-aid needed, the a11y + reduced-motion guards, and
// the frozen paths *staying* frozen.
//
// This file is also the rollout's regression net for itself: several assertions
// exist to keep a *rejected* change from coming back (double live regions, a
// forced dark palette on a route that already reports its theme, a per-card
// lens in a scrolling grid, deleting the dock's own material).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const code = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
const exists = (p) => fs.existsSync(new URL(`../${p}`, import.meta.url));

test("dark ink follows the route's own theme signal, not a forced class", () => {
  // FlowPath reports its theme on <html>, so the pack's useGlassDark() is right
  // there; the course player has no theme attribute, so it keeps the CSS rule.
  const themeHook = read("src/flowpath/hooks/useTheme.ts");
  assert.match(themeHook, /documentElement\.setAttribute\("data-theme", resolved\)/);
  assert.match(themeHook, /documentElement\.removeAttribute\("data-theme"\)/);

  for (const f of [
    "src/components/flowpath/CurveSettingsModal.tsx",
    "src/components/flowpath/CreateModal.tsx",
  ]) {
    assert.doesNotMatch(code(read(f)), /dc-slider-on-dark/, `${f} forces a palette`);
    assert.match(read(f), /<GlassSlider/);
  }
  const audio = read("src/course/AudioPlayer.tsx");
  assert.match(audio, /dc-slider-on-dark dc-slider-violet/);

  const css = read("src/glass.css");
  assert.match(css, /html\[data-glass="on"\] \.dc-slider-on-dark > span:first-child/);
  // …and it is scoped to the no-theme-attribute case, never !important on the fill
  assert.match(css, /\.dc-slider-violet > span:nth-child\(2\)/);
});

test("the hero's action pills and shortcut use the pack material", () => {
  const h = read("src/home/components/Header.tsx");
  assert.equal(h.match(/dc-home-pill/g)?.length, 4, "expected four pills");
  assert.match(h, /data-home-actions/); // the row a home contract reads
  assert.match(h, /from "\.\.\/\.\.\/components\/ui\/glass-tooltip"/);
  assert.match(h, /<TooltipTrigger/);
  assert.doesNotMatch(code(h), /title="/, "a native title bubble is still in the hero");
  assert.match(h, /aria-label="Open profile"/);

  const learn = read("src/home/components/ContinueLearning.tsx");
  assert.match(learn, /className="dc-card/);
  assert.match(learn, /role="button"/);
  assert.match(learn, /onKeyDown/);
});

test("checkout keeps its identity colours and gains only the gloss", () => {
  const pg = read("src/components/PaymentGateway.tsx");
  // money card: Phase A removed the gradient — solid brand indigo, rim + highlight
  assert.match(pg, /dc-quote rounded-2xl bg-indigo-600/);
  assert.doesNotMatch(pg, /from-indigo-600 to-violet-700/);
  // pay button: emerald paint kept, pack gloss added *behind* the content
  assert.match(pg, /bg-emerald-600/);
  assert.match(pg, /<GlassSurface tint=\{0\.7\} radius=\{16\} className="pointer-events-none absolute inset-0" \/>/);
  assert.match(pg, /<span className="relative z-10 flex items-center justify-center gap-2">/);
  assert.match(pg, /disabled=\{busy\}/);
  assert.match(pg, /disabled:cursor-wait/);
  assert.match(pg, /dc-glass-soft w-full rounded-2xl bg-white\/\[0\.06\]/);
  assert.match(pg, /role="alert"/); // the error surface
  const css = read("src/glass.css");
  assert.match(css, /:where\(\.dc-card\) \{/);
  assert.match(css, /:where\(\.dc-quote\) \{/);
  assert.match(css, /:where\(\.dc-home-pill\) \{/);
});

test("no scrolling grid mounts a per-card lens (the budget rule)", () => {
  for (const f of ["src/components/ProductCard.tsx", "src/home/components/ProductCard.tsx"]) {
    assert.doesNotMatch(read(f), /<GlassLens/, `${f} puts a lens on every card`);
  }
  // the meter stays available for whoever needs it, and the preview still
  // exercises it, but no page claims a lens today — see plan §4 rule 1.
  const lib = read("src/lib/glass.ts");
  assert.match(lib, /export function claimLens/);
  assert.match(lib, /export function releaseLens/);
  assert.match(lib, /GLASS_LENS_BUDGET_PHONE = 12/);
});

test("announce once: the toast host defers to the card's own live role", () => {
  const host = read("src/components/ui/glass-toast.tsx");
  const card = host.slice(host.indexOf("export function GlassToastCard"));
  assert.match(card, /role=\{tone === "error" \? "alert" : "status"\}/);
  const viewport = host.slice(host.indexOf("export function ToastViewport"));
  assert.doesNotMatch(code(viewport), /aria-live/, "the wrapper would double-announce");
  assert.match(viewport, /createPortal\(/);
  assert.match(viewport, /z-\[120\]/);
  assert.match(card, /aria-label="Dismiss notification"/);
});

test("every glass surface has a keyboard path and a motion opt-out", () => {
  const css = read("src/glass.css");
  assert.match(css, /:where\(\.dc-field, \.dc-glass-select, \.dc-segment, \.dc-tile, \.dc-home-pill[^)]*\):focus-visible/);
  const rm = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  for (const cls of [".dc-segment", ".dc-tile", ".dc-switch", ".dc-home-pill"]) {
    assert.ok(rm.includes(cls), `reduced-motion misses ${cls}`);
  }
  // the registry's own springs check reduceMotion(), and the tier probe drops to
  // lite for reduced-motion users before any component mounts
  const lib = read("src/lib/glass.ts");
  assert.match(lib, /prefers-reduced-motion: reduce.*return "lite"/s);

  // a `role="slider"` div is not labelable: the captions became plain text and
  // each control names itself
  for (const f of ["src/components/flowpath/CurveSettingsModal.tsx", "src/components/flowpath/CreateModal.tsx"]) {
    const s = code(read(f));
    assert.match(s, /ariaLabel=\{label\}|ariaLabel="Progress"/);
  }
  const audio = read("src/course/AudioPlayer.tsx");
  assert.match(audio, /aria-label=\{playing \? "Pause" : "Play"\}/);
  assert.match(audio, /aria-label="Toggle mute"/);
});

test("the dock keeps its own material: the plan's cleanup item was declined", () => {
  // §5 Wave 6 said "delete the now-dead GlassMaterial duplication (except footer
  // nav)". It is not dead: both dock files import it, and both paths are frozen
  // by decision D4 + the footer-nav constraint. Pinned here so nobody deletes it
  // to satisfy the old bullet.
  assert.ok(exists("src/components/glass-dock/GlassMaterial.tsx"));
  for (const f of ["src/components/glass-dock/GlassDock.tsx", "src/components/glass-dock/DesktopPeekDock.tsx"]) {
    assert.match(read(f), /from ['"]\.\/GlassMaterial['"]/);
  }
  assert.doesNotMatch(read("src/components/BottomNav.tsx"), /ui\/glass-/, "the footer nav must stay untouched");
});

test("the rollout documents its own escape hatches", () => {
  const readme = read("README.md");
  assert.match(readme, /Liquid Glass/);
  for (const needle of ["?glass=off", "?glass=lite", "verify-glass-registry", "#/dev/glass-preview", "src/glass.css"]) {
    assert.ok(readme.includes(needle), `README missing ${needle}`);
  }
  const plan = read("docs/liquid-glass-rollout-plan.md");
  assert.match(plan, /\*\*6\. Polish & hand-off\*\* ✅/);
  assert.match(plan, /21 of 22 items/);
});
