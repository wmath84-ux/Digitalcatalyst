// tests/liquidGlassWaveOneContract.test.mjs
//
// Contract for Wave 1 of the website-glass rollout
// (docs/liquid-glass-rollout-plan.md). These are the invariants that make the
// rollout reviewable: what must NOT change (footer nav, admin), what must stay
// intact inside a vendored file, and what the shared wrappers must keep doing
// while their material changes.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const VENDORED = [
  "src/components/ui/glass.tsx",
  "src/components/ui/glass-motion.ts",
  "src/components/ui/glass-button.tsx",
  "src/components/ui/glass-tabs.tsx",
  "src/components/ui/glass-dialog.tsx",
];

const FROZEN = [
  "src/components/BottomNav.tsx",
  "src/components/glass-dock/GlassDock.tsx",
  "src/components/glass-dock/GlassMaterial.tsx",
  "src/components/glass-dock/DesktopPeekDock.tsx",
  "src/cartWishlist/components/BottomNav.tsx",
  "src/revision/components/BottomNav.tsx",
  "src/components/myday/BottomNav.tsx",
];

test("the bottom footer navigation stays off-limits to the registry components", () => {
  // The footer already ships its own hand-rolled glass dock and the owner asked
  // for it explicitly to be left alone. Wave 1 changes shared primitives, so the
  // only way it could leak in here is a new import — none of these files may
  // reach for the registry material (HoldRing and the local GlassDock are fine).
  for (const file of FROZEN) {
    const source = read(file);
    assert.doesNotMatch(
      source,
      /from "[^"]*ui\/glass-(dialog|toast|tabs|card|sheet|input|dropdown)/,
      `${file} must not import registry overlay/form primitives — the footer nav is frozen`,
    );
    assert.doesNotMatch(
      source,
      /from "[^"]*ui\/(GlassSurface|glass)"/,
      `${file} must not switch to the vendored lens engine; it keeps its own GlassMaterial`,
    );
  }
});

test("the admin panel never picks up the glass material", () => {
  // Admin has its own chrome and is out of scope for the rollout; it also does
  // not import the shared ui/* primitives at all, which is what keeps Wave 1
  // free of any edit under src/admin.
  const walk = (dir) =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
          e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith(".tsx") ? [`${dir}/${e.name}`] : [],
        )
      : [];
  const files = [...walk("src/admin"), ...walk("src/components/admin")];
  assert.ok(files.length > 10, "expected to find the admin sources");
  for (const file of files) {
    assert.doesNotMatch(
      read(file),
      // One sanctioned exception: `glass-toast` is the app-wide feedback BUS —
      // admin's notify() pushes into the singleton store while the viewport
      // (GlassToaster) stays mounted in src/main.tsx; no glass surface
      // renders inside the admin tree.
      /from "[^"]*(components\/ui\/glass(?!-toast)|ui\/GlassCard|ui\/LiquidMetalButton|ui\/MacWindowModal)/,
      `${file} must not import the glass rollout primitives`,
    );
  }
});

test("the tier is resolved per route and forced off on admin routes", () => {
  const main = read("src/main.tsx");
  assert.match(main, /import \{ applyGlassTier, detectGlassTier \} from "\.\/lib\/glass";/);
  assert.match(
    main,
    /applyGlassTier\(adminRoute \? "off" : detectGlassTier\(\)\)/,
    "admin must run with the material off, not merely unstyled",
  );
  // The CSS layer has to honour that: every glass rule is gated, so `off`
  // restores the pre-rollout look instead of half-applying it.
  const css = read("src/glass.css");
  assert.match(css, /html\[data-glass="on"\]/);
  assert.doesNotMatch(css, /^\s*\.glass-dialog-in\s*\{/m, "un-gated glass rules would leak into admin");
});

test("vendored registry files keep their provenance banner and the cn shim", () => {
  for (const file of VENDORED) {
    const source = read(file);
    assert.match(
      source,
      /^\/\/ Vendored from the website-glass shadcn registry/m,
      `${file} must say which registry item it came from`,
    );
    assert.match(
      source,
      /npx shadcn@latest add https:\/\/websiteglass\.com\/r\//,
      `${file} must record the exact install command that reproduces it`,
    );
  }
  // The registry convention is `@/lib/utils`; the repo helper is `@/utils/cn`.
  const shim = read("src/lib/utils.ts");
  assert.match(shim, /export \{ cn \} from "@\/utils\/cn";/);
});

test("no vendored file grew app-specific logic", () => {
  // Composing the primitives is the wrappers' job. If one of these strings
  // shows up inside a vendored file, the next `shadcn add` will conflict.
  for (const file of VENDORED) {
    const source = read(file);
    assert.doesNotMatch(source, /useBranding|useAuth|useNavigate|location\.hash|fetch\(/, `${file} must stay app-agnostic`);
    assert.doesNotMatch(source, /\[digitalcatalyst\][^\n]*\n[^\n]*if \(/, `${file} must not add behaviour`);
  }
});

test("the overlays keep their own scoping maths, only the panel is glass", () => {
  // Regression guard for the whole app: these two calls are what stop a My Day
  // sheet from sliding under the desktop rail (see myDayOverlayDesktopRailContract).
  const modal = read("src/components/ui/Modal.tsx");
  const confirm = read("src/components/ui/ConfirmDialog.tsx");
  assert.match(modal, /useOverlayBox\(open, resolvedBounds\)/);
  assert.match(confirm, /useOverlayBox\(open, boundsRef\)/);
  assert.match(modal, /lockBodyScroll\(\)/);
  assert.match(confirm, /lockBodyScroll\(\)/);
  assert.match(modal, /event\.key === "Escape"/);
  assert.match(confirm, /event\.key === "Escape"/);
  // Both panels are the pack's frosted surface now.
  assert.match(modal, /<GlassSurface/);
  assert.match(confirm, /<GlassSurface/);
});

test("the sheet-vs-card corner shape stays a CSS decision", () => {
  // GlassSurface writes border-radius inline, so a rounded-* class would lose.
  // The var is what lets phones keep a top-only radius without JS width probes.
  const css = read("src/glass.css");
  assert.match(css, /--glass-sheet-radius: 1\.75rem 1\.75rem 0 0/);
  assert.match(css, /@media \(min-width: 640px\)[\s\S]*--glass-sheet-radius: 1\.5rem/);
  assert.match(read("src/components/ui/Modal.tsx"), /borderRadius: "var\(--glass-sheet-radius\)"/);
});

test("toasts: one material, two entry points (Wave 14: the vendored pack glass-toast)", () => {
  const wrapper = read("src/components/ui/Toast.tsx");
  const card = read("src/components/ui/glass-toast.tsx");
  // The app's prop-driven API survives unchanged.
  assert.match(wrapper, /interface ToastProps \{\n  toasts: ToastMessage\[\];\n  onRemove: \(id: string\) => void;\n\}/);
  // …but it forwards into the pack store instead of painting its own card.
  assert.match(wrapper, /pushGlassToast\(\{ title: t\.text, variant: variantOf\[t\.type\] \}\)/);
  // The singleton + viewport are the registry item's own exports.
  // (2026-09-02: the card renderer is the AI Canvas glass-toast design —
  // variants, rAF progress bar, spring stacking — behind the same store API.)
  assert.match(card, /^\/\/ Glass Toast — AI Canvas design/m);
  assert.match(card, /export function toast\(input: string \| Omit<ToastData, "id">\): number/);
  assert.match(card, /export function GlassToaster\(/);
  // AI Canvas material: variant palette, draining rAF progress bar, popLayout stacking.
  assert.match(card, /success: \{ color: "#06D6A0", Icon: CheckCircle2, label: "Success" \}/);
  assert.match(card, /warning: \{ color: "#FFBE0B", Icon: AlertTriangle, label: "Warning" \}/);
  assert.match(card, /requestAnimationFrame\(tick\)/);
  assert.match(card, /<AnimatePresence mode="popLayout" initial=\{false\}>/);
});

test("the primary button keeps its hooks while the material becomes glass", () => {
  const button = read("src/components/ui/LiquidMetalButton.tsx");
  assert.match(button, /liquid-metal-button eduvora-primary-action/);
  assert.match(button, /data-liquid-tone=\{tone\}/);
  assert.match(button, /forwardRef<HTMLButtonElement, LiquidMetalButtonProps>/);
  assert.match(button, /import "\.\/liquidMetalButton\.css";/);
  // The gel press comes from the shared motion core, not a copy of it.
  assert.match(button, /from "\.\/glass-motion"/);
  const css = read("src/glass.css");
  assert.match(
    css,
    /html\[data-glass="on"\] :where\(\.liquid-metal-button\)[\s\S]*?background: transparent/,
    "the opaque gradient must be removed only while glass is on",
  );
});

test("the dev sandbox exercises every Wave 1 primitive", () => {
  const preview = read("src/GlassPreview.tsx");
  for (const name of ["PageTabs", "Modal", "ConfirmDialog", "Toast", "LiquidMetalButton"]) {
    assert.ok(preview.includes(`<${name}`), `#/dev/glass-preview must render <${name}> so the wave is reviewable`);
  }
});
