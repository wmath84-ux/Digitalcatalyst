// tests/profileHomeCardContract.test.mjs
//
// OWNER BRIEF (2026-09-30):
//
//   "Mujhe home page ke card ka design look badhiya lagta hai kya tum vahi
//    exactly hi look aur design card ka profile ke cards per apply kar sakte
//    ho and profile page ki sabhi card ko ekadam badhiya look de sakte ho
//    text design bhi exactly jaisa home page ka hai vaise hi profile page ka
//    ho jaaye and abhi bahut jyada text har profile page per to ekadam clean
//    professional aur classic look do profile page ko."
//
// So the Profile page stops borrowing another page's material and takes the
// HOME page's card, exactly:
//
//   · material — `.dc-scene-plate` at the pinned docs sensitivity the Home
//     cards use: tint 0.25 · blur 0 · radius 24 (src/home/components/
//     ProductCard.tsx line for line).
//   · type — the Home card ramp, pinned once in src/profile-glass.css.
//   · copy — the walls of text (a membership paragraph, a renewal paragraph,
//     three upgrade checkpoints, a two-line referral note, duplicate CTAs) are
//     gone; membership and renewal are ONE card.
//
// History: the 2026-09-29 brief put the Cart empty-state's bare pack surface
// on these cards (`tests/profileCartGlassContract.test.mjs`), the following
// morning moved them to the Store's light-blue lens. This brief supersedes
// both — that file is replaced by this one.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (p) => fs.readFileSync(p, "utf8");

const PROFILE_FILES = [
  "src/profile/ProfileLayout.tsx",
  "src/profile/ProfilePreview.tsx",
];

test("the Home reference card is the pinned docs plate", () => {
  const home = read("src/home/components/ProductCard.tsx");
  assert.match(home, /<GlassSurface[\s\S]*?radius=\{24\}[\s\S]*?tint=\{0\.25\}[\s\S]*?blur=\{0\}/);
  assert.match(home, /dc-scene-plate/);
  // Home's card copy: a 13px semibold title in the lifted /85 ink and an 11px
  // muted meta line — the two steps the Profile ramp is built from.
  assert.match(home, /text-\[13px\] font-semibold leading-tight text-white\/85/);
  assert.match(home, /text-\[11px\] text-white\/55/);
});

test("every profile card wears the HOME plate via ProfileCard", () => {
  const card = read("src/profile/ProfileCard.tsx");
  assert.match(card, /tint=\{0\.25\}/);
  assert.match(card, /blur=\{0\}/);
  assert.match(card, /radius=\{24\}/);
  assert.match(card, /dc-scene-plate dc-profile-card text-white/);
  // No store lens, no tint colour, no scrim on the card itself.
  assert.doesNotMatch(card, /tintColor|dc-store-glass/);
  assert.doesNotMatch(card, /className=\{cn\("[^"]*dc-scene-ink/);

  for (const file of PROFILE_FILES) {
    const src = read(file);
    assert.doesNotMatch(src, /<GlassSurface|<GlassCard/, `${file}: raw surface left`);
    assert.doesNotMatch(src, /dc-store-glass|tintColor=/, `${file}: store lens left`);
    assert.doesNotMatch(src, /hover:-translate-y/, `${file}: hover lift left`);
  }

  const layout = read(PROFILE_FILES[0]);
  for (const hook of ["data-profile-hero", "data-profile-membership-card", "data-profile-upgrade-card", "data-profile-referral", "data-profile-study-library", "data-renewal-card"]) {
    assert.ok(layout.includes(hook), `ProfileLayout keeps ${hook}`);
  }
});

test("the profile type ramp is the Home card's", () => {
  const css = read("src/profile-glass.css");
  // title 14px/600 · meta 11px/500 · note 12.5px · accent 11px indigo-300.
  assert.match(css, /\.dc-profile-card-title \{[\s\S]*?font-size: 0\.875rem;[\s\S]*?font-weight: 600;/);
  assert.match(css, /\.dc-profile-card-meta \{[\s\S]*?font-size: 0\.6875rem;/);
  assert.match(css, /\.dc-profile-card-note \{[\s\S]*?font-size: 0\.78125rem;/);
  assert.match(css, /\.dc-profile-card-accent \{[\s\S]*?#a5b4fc/);
  // Home's progress bar: 6px track, white/15 rim, indigo-500 fill.
  assert.match(css, /\.dc-profile-bar \{[\s\S]*?height: 0\.375rem/);
  assert.match(css, /\.dc-profile-bar > span \{[\s\S]*?background: #6366f1/);
  // The page title wears Home's greeting type, not the old display clamp.
  assert.match(css, /\.dc-profile-title \{[\s\S]*?clamp\(0\.875rem, 4\.8vw, 1\.25rem\)/);
  assert.match(read("src/main.tsx"), /import "\.\/profile-glass\.css";/);
  // The retired Store-glass profile block is gone from store-glass.css.
  assert.doesNotMatch(read("src/store-glass.css"), /\.dc-profile-card h2/);
});

test("the copy diet: the profile page's walls of text are gone", () => {
  const layout = read(PROFILE_FILES[0]);
  assert.doesNotMatch(layout, /Account, plan and library — in one place\./);
  assert.doesNotMatch(layout, /You are enjoying the \$\{tierLabel\} experience/);
  assert.doesNotMatch(layout, /No automatic charge without your confirmation\./);
  assert.doesNotMatch(layout, /You are currently learning on the free plan/);
  assert.doesNotMatch(layout, /Unlock subscriber-only learning features/);
  assert.doesNotMatch(layout, /<ProfileRenewalCard/);
  assert.doesNotMatch(layout, /Membership renewal/);
  // One trust line survives (pinned by subscriptionRenewalContract).
  assert.match(layout, /Renewal is manual and secure/);

  // The Profile-only My Day card: one line per state, no three-chip stat row.
  const myDay = read("src/components/MyDayAllowanceCard.tsx");
  assert.match(myDay, /My Day remains browse-only until reset/);
  assert.doesNotMatch(myDay, /grid-cols-3 gap-2/);
  assert.doesNotMatch(myDay, /counted in your own time zone/);
});

test("the profile instances of the shared cards take the same material", () => {
  // Profile-only My Day card: it renders ProfileCard itself, so it follows.
  const myDay = read("src/components/MyDayAllowanceCard.tsx");
  assert.match(myDay, /import \{ ProfileCard as GlassSurface \} from "\.\.\/profile\/ProfileCard"/);
  assert.match(myDay, /dc-profile-card-title/);

  // AI quota card: an opt-in `home` material + a compact copy mode, so the
  // Revision Profile page's card stays byte-identical while the Profile page
  // gets the Home look and drops the explanation paragraph.
  const ai = read("src/components/AiQuotaCard.tsx");
  assert.match(ai, /material\?: "store" \| "cart" \| "home"/);
  assert.match(ai, /"dc-scene-plate dc-profile-card relative text-white"/);
  assert.match(ai, /compact\?: boolean/);
  assert.match(read("src/profile/App.tsx"), /<AiQuotaCard uid=\{user\.id\} material="home" compact \/>/);
  // Revision keeps the default store material.
  assert.doesNotMatch(read("src/revision/pages/RevisionProfilePage.tsx"), /<AiQuotaCard[^>]*material=/);
});

test("the shared material still comes from ONE module — ui/glass", () => {
  // Frost / tint / sheen / rim are the pack engine's own numbers; the Profile
  // contributes no skin of its own, so a Home card and a Profile card can
  // never drift.
  const engine = read("src/components/ui/glass.tsx");
  assert.match(engine, /tint = 0\.5/, "default tint");
  assert.match(engine, /blur = 14/, "default blur");
  assert.match(engine, /saturation = 1\.6/, "default saturation");
  for (const file of [...PROFILE_FILES, "src/components/MyDayAllowanceCard.tsx", "src/components/AiQuotaCard.tsx"]) {
    assert.match(read(file), /from "\.\.\/components\/ui\/glass"|from "\.\/ui\/glass"|ProfileCard"/, `${file} imports the pack surface`);
  }
});
