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

// ---------------------------------------------------------------------------
// Wave A2 — Checkout + Subscription: no white / frost element inside the page
// ---------------------------------------------------------------------------
const A2_FILES = [
  "src/components/checkout/CheckoutApp.tsx",
  "src/components/checkout/CheckoutReviewStep.tsx",
  "src/components/checkout/CheckoutSuccessStep.tsx",
  "src/components/checkout/CheckoutLineItemCard.tsx",
  "src/components/PaymentGateway.tsx",
  "src/subscription/components/SubscriptionPage.tsx",
  "src/subscription/components/PlanOverview.tsx",
  "src/subscription/components/PriceSummary.tsx",
  "src/subscription/components/ActiveMemberView.tsx",
  "src/subscription/components/OwnedPlanCard.tsx",
  "src/subscription/components/SubscribeBar.tsx",
  "src/subscription/components/StackedCards.tsx",
  "src/subscription/components/FeaturePricingTiers.tsx",
  "src/subscription/components/FeatureSelectTrigger.tsx",
  "src/subscription/components/CourseSelectTrigger.tsx",
  "src/subscription/components/PromoCodeInput.tsx",
  "src/subscription/components/HelpModal.tsx",
  "src/subscription/components/FeatureSelectModal.tsx",
  "src/subscription/components/CourseSelectModal.tsx",
  "src/components/subscription/PremiumGate.tsx",
  "src/components/subscription/RenewalPreviewPage.tsx",
  "src/components/subscription/UnlockCelebration.tsx",
  "src/components/subscription/RenewalBanner.tsx",
  "src/components/subscription/RenewalStatusCard.tsx",
];

test("A2: checkout + subscription paint no opaque white / light-wash surface and no gradient wash", () => {
  for (const file of A2_FILES) {
    const src = read(file);
    // Opaque white / slate-50/100 fills — the only allowed `bg-white` is the
    // translucent `bg-white/[0.06]`-style soft panel and the two solid CTA
    // pills that sit on a coloured card (their text is dark, not white).
    const opaque = src.match(/\b(bg-white|bg-slate-(?:50|100)|bg-gray-(?:50|100))(?=["'`\s])/g) || [];
    const allowed = (src.match(/"bg-white text-(?:slate|indigo)-\d00[^"]*"|bg-white text-violet-600|"w-6 bg-white"|bg-white [^"]*text-indigo-700/g) || []).length;
    assert.ok(opaque.length <= allowed, `${file}: ${opaque.length - allowed} opaque white/light fill(s) left`);
    // Gradient washes on surfaces (text-clip gradients on headlines are fine).
    const gradients = (src.match(/bg-gradient-to-[a-z]+(?![^"]*bg-clip-text)/g) || []).length;
    const clipOnly = (src.match(/bg-gradient-to-[a-z]+[^"]*bg-clip-text/g) || []).length;
    const overlays = (src.match(/absolute inset-0 bg-gradient-to-/g) || []).length; // image legibility scrims
    assert.equal(gradients - overlays, 0, `${file}: gradient wash left`);
    void clipOnly;
    // No hand-rolled fixed white sheet — bottom sheets are the pack's GlassSheet.
    assert.doesNotMatch(src, /fixed inset-x-0 bottom-0[^"]*bg-white/, `${file}: hand-rolled white bottom sheet`);
  }
});

test("A2: the three subscription pickers are the pack's GlassSheet (side=bottom)", () => {
  for (const file of [
    "src/subscription/components/HelpModal.tsx",
    "src/subscription/components/FeatureSelectModal.tsx",
    "src/subscription/components/CourseSelectModal.tsx",
  ]) {
    const src = read(file);
    assert.match(src, /from "\.\.\/\.\.\/components\/ui\/glass-sheet"/, `${file}: imports GlassSheet`);
    assert.match(src, /<GlassSheetContent side="bottom"/, `${file}: renders a bottom GlassSheet`);
    assert.doesNotMatch(src, /framer-motion/, `${file}: no framer sheet left`);
  }
});

test("A2: checkout sections and subscription cards are GlassCard / GlassSurface, not painted panels", () => {
  for (const file of [
    "src/components/checkout/CheckoutReviewStep.tsx",
    "src/components/checkout/CheckoutSuccessStep.tsx",
    "src/subscription/components/ActiveMemberView.tsx",
    "src/subscription/components/OwnedPlanCard.tsx",
    "src/subscription/components/PlanOverview.tsx",
    "src/subscription/components/PriceSummary.tsx",
  ]) {
    const src = read(file);
    assert.match(src, /<GlassCard/, `${file}: uses GlassCard`);
    assert.doesNotMatch(src, /rounded-3xl border border-slate-200 bg-white/, `${file}: painted card left`);
  }
  // Wave 14: the premium gate became the pack GlassSheet (bottom) — its body
  // is the sheet's own GlassSurface, so the file references GlassSheetContent.
  assert.match(read("src/components/subscription/PremiumGate.tsx"), /<GlassSheetContent/, "PremiumGate: bottom sheet");
  assert.match(read("src/components/subscription/UnlockCelebration.tsx"), /<GlassSurface/, "UnlockCelebration: modal body is a GlassSurface");
});

test("the pack's own light/dark material is user-switchable via the docs' GlassSwitch example — no app-side scheme logic in the vendored files", () => {
  // Owner direction: keep websiteglass.com's components exactly as published
  // (both materials, chosen by html.dark / html.light) and expose that choice
  // through the pack's own switch, not by pinning a class from applyGlassTier.
  const glass = read("src/lib/glass.ts");
  assert.doesNotMatch(glass, /classList\.(add|remove|toggle)\("dark"/, "applyGlassTier must not pin the scheme");
  const scheme = read("src/lib/glassScheme.ts");
  assert.match(scheme, /classList\.toggle\("dark", scheme === "dark"\)/);
  assert.match(scheme, /classList\.toggle\("light", scheme === "light"\)/);
  assert.match(main, /applyGlassScheme\(\)/);
  const header = read("src/home/components/Header.tsx");
  assert.match(header, /<GlassSwitch checked=\{scheme === "dark"\} onCheckedChange=\{[^}]+\} ariaLabel="Dark mode" \/>/);
  // The vendored engine still carries upstream's scheme reader untouched.
  const engine = read("src/components/ui/glass.tsx");
  assert.match(engine, /if \(root\.classList\.contains\("light"\)\) return false;/);
});

// ---------------------------------------------------------------------------
// Wave A3 — Profile + Settings + Subscriber experience
// ---------------------------------------------------------------------------
test("A3: profile + settings paint no opaque white / gradient surface; cards, actions and dialogs are pack components", () => {
  for (const file of [
    "src/profile/App.tsx",
    "src/profile/ProfileLayout.tsx",
    "src/profile/ProfilePreview.tsx",
    "src/profile/SubscriberExperiencePage.tsx",
    "src/settings/SettingsPage.tsx",
  ]) {
    const src = read(file);
    const opaque = src.match(/\b(bg-white|bg-slate-(?:50|100|900)|bg-gray-(?:50|100))(?=["'`\s])/g) || [];
    assert.equal(opaque.length, 0, `${file}: ${opaque.length} opaque white/light fill(s) left`);
    assert.doesNotMatch(src, /bg-gradient-to-/, `${file}: gradient wash left`);
    assert.doesNotMatch(src, /backdrop-blur/, `${file}: hand-rolled frost left`);
  }
  const layout = read("src/profile/ProfileLayout.tsx");
  assert.match(layout, /<GlassCard data-profile-hero/);
  assert.match(layout, /<GlassCard data-profile-membership-tier/);
  assert.match(layout, /<GlassCard data-renewal-card/);
  assert.match(layout, /<GlassButton variant="capsule"/);
  assert.match(layout, /<DialogContent/);
  assert.match(layout, /<GlassSwitch/);
  assert.doesNotMatch(layout, /^const CARD =/m, "the hand-painted CARD token is gone");
  const settings = read("src/settings/SettingsPage.tsx");
  assert.match(settings, /<GlassCard>/);
  assert.match(settings, /<GlassButton variant="capsule"/);
});
