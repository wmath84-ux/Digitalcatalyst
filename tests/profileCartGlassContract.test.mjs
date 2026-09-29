// tests/profileCartGlassContract.test.mjs
//
// OWNER BRIEF (2026-09-29):
//
//   "Tum Cart page per jao vahan per jab koi product add nahin hota to vahan
//    per continue shopping ka ek card dikhta hai — uss card ka jo blur, aur
//    jo bhi setting hai aur jo bhi text ka design hai, us per koi shadow
//    nahin hai jo ki bahut badhiya lagta hai dekhne mein. Vah card ka jo
//    exact setting hai exactly vahi profile page ke sabhi cards per apply
//    karo."
//
// The Cart empty-state "Continue Shopping" card
// (src/cartWishlist/components/EmptyState.tsx) is the pack's BARE
// <GlassSurface> at its defaults with radius 32 — frost blur 9.8px +
// saturate 1.3, flat rgba(60,62,68,0.21) tint, the pack sheen + rim — with
// NO re-skin class, NO hover lift and NO text scrim, and its title is
// font-bold (not black). Every card on the Profile page now wears EXACTLY
// that recipe — same component, same props, zero drift.
//
// (History: the 2026-09-29 morning brief put the Revision Progress page's
// `.dc-rev-glass` on these same cards; this brief replaces that material
// with the Cart card's. Revision keeps its own file untouched.)

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const PROFILE_FILES = [
  "src/profile/ProfileLayout.tsx",
  "src/profile/ProfilePreview.tsx",
];

test("the Cart reference card is the bare pack surface, radius 32", () => {
  const cart = read("src/cartWishlist/components/EmptyState.tsx");
  // The recipe everything below copies: GlassSurface, radius 32, every other
  // material prop at its default (tint 0.5 · rgb(60,62,68) · blur 14 ·
  // saturate 1.6 · specular on), and NO re-skin hook.
  assert.match(cart, /<GlassSurface radius=\{32\}/);
  assert.doesNotMatch(cart, /tint=\{|tintColor|blur=\{|saturation=\{|specular=\{/);
  assert.doesNotMatch(cart, /dc-rev-glass|dc-store-glass|dc-scene-ink|dc-glass-card/);
  // …and the text design: a font-bold white title with a true-white/55
  // subtitle — no scrim class anywhere to lift or shadow it.
  assert.match(cart, /text-xl font-bold text-white/);
  assert.match(cart, /text-sm leading-relaxed text-white\/55/);
});

test("every profile card is the Cart card's bare surface, radius 32", () => {
  for (const file of PROFILE_FILES) {
    const src = read(file);
    // No wrapper, no material props, no re-skin hooks, no hover lift left.
    assert.doesNotMatch(src, /<GlassCard/, `${file}: GlassCard wrapper left`);
    assert.doesNotMatch(src, /tint=\{|tintColor|blur=\{/, `${file}: material override left`);
    assert.doesNotMatch(src, /dc-rev-glass/, `${file}: revision glass left`);
    assert.doesNotMatch(src, /dc-store-glass/, `${file}: store glass left`);
    assert.doesNotMatch(src, /dc-scene-ink/, `${file}: text scrim left`);
    assert.doesNotMatch(src, /dc-glass-card/, `${file}: card plate hook left`);
    assert.doesNotMatch(src, /hover:-translate-y/, `${file}: hover lift left`);
  }
  const layout = read(PROFILE_FILES[0]);
  const preview = read(PROFILE_FILES[1]);
  // ProfileLayout's 9 surfaces (hero, 3 quick-stats via one component,
  // membership, upgrade, referral, study library, courses, renewal,
  // preferences) + ProfilePreview's 2 mock allowance cards: every one a
  // radius-32 surface. Count the prop (the doc comment spells "radius 32"
  // without braces, so it cannot inflate this).
  const countRadius = (src) => (src.match(/radius=\{32\}/g) || []).length;
  assert.equal(countRadius(layout), 9, `ProfileLayout: expected 9 radius-32 surfaces, found ${countRadius(layout)}`);
  assert.equal(countRadius(preview), 2, `ProfilePreview: expected 2 radius-32 surfaces, found ${countRadius(preview)}`);
  // The surfaces still carry the page's data hooks and content padding.
  for (const hook of [
    "data-profile-hero",
    "data-profile-membership-card",
    "data-profile-upgrade-card",
    "data-profile-referral",
    "data-profile-study-library",
    "data-renewal-card",
  ]) {
    assert.ok(layout.includes(hook), `ProfileLayout keeps ${hook}`);
  }
  assert.match(layout, /contentClassName="p-5"/);
});

test("profile card titles wear the Cart title's font-bold weight", () => {
  for (const file of PROFILE_FILES) {
    const src = read(file);
    // No card heading stays font-black; sizes and hierarchy are untouched.
    assert.doesNotMatch(src, /<h[23][^>]*font-black/, `${file}: black card title left`);
  }
  const layout = read(PROFILE_FILES[0]);
  assert.match(layout, /text-xl font-bold/, "hero title");
  assert.match(layout, /text-lg font-bold/, "section titles");
  assert.match(layout, /text-base font-bold/, "card titles");
});

test("the My Day allowance card (profile-only) wears the same surface", () => {
  const src = read("src/components/MyDayAllowanceCard.tsx");
  assert.match(src, /<GlassSurface radius=\{32\}/);
  assert.doesNotMatch(src, /tint=\{|tintColor|blur=\{/);
  assert.doesNotMatch(src, /dc-rev-glass|dc-store-glass|dc-scene-ink|dc-glass-card/);
  assert.doesNotMatch(src, /<h[23][^>]*font-black/);
  assert.match(src, /text-lg font-bold/);
});

test("the AI quota card follows the profile only when asked", () => {
  const src = read("src/components/AiQuotaCard.tsx");
  // Shared with the Revision Profile page, so the Cart surface is opt-in:
  // `store` (default) keeps the old recipe byte-identical, `cart` is bare.
  assert.match(src, /material\?: "store" \| "cart"/);
  assert.match(src, /material = "store"/);
  assert.match(src, /radius=\{cartGlass \? 32 : 24\}/);
  assert.match(src, /className=\{cartGlass \? "text-white" : "dc-glass-card dc-store-glass dc-scene-ink relative text-white"\}/);
  // The Profile page opts in; the Revision page keeps the default.
  assert.match(read("src/profile/App.tsx"), /<AiQuotaCard uid=\{user\.id\} material="cart" \/>/);
  assert.doesNotMatch(
    read("src/revision/pages/RevisionProfilePage.tsx"),
    /<AiQuotaCard[^>]*material=/,
    "revision keeps the default store material",
  );
});

test("the shared material still comes from ONE module — ui/glass", () => {
  // Frost / tint / sheen / rim are the pack engine's own numbers; the
  // profile contributes no skin of its own, so the Cart card and the
  // profile cards can never drift.
  const engine = read("src/components/ui/glass.tsx");
  assert.match(engine, /tint = 0\.5/, "default tint");
  assert.match(engine, /blur = 14/, "default blur");
  assert.match(engine, /saturation = 1\.6/, "default saturation");
  for (const file of [...PROFILE_FILES, "src/components/MyDayAllowanceCard.tsx", "src/components/AiQuotaCard.tsx"]) {
    assert.match(read(file), /from "\.\.\/components\/ui\/glass"|from "\.\/ui\/glass"/, `${file} imports the pack surface`);
  }
});
