// tests/profilePlanGlowContract.test.mjs
//
// Contract for the redesigned (clean, mobile-first) profile page:
//
//   1. The profile hero must identify the resolved subscription plan and keep
//      the plan / status data attributes for the UI and deep-linkers.
//   2. The redesign removes glassmorphism, aurora orbs and animated
//      conic-gradient orbits — the page is flat, with solid white cards on a
//      soft indigo wash.
//   3. The only gradient on the page is the Store's brand CTA gradient
//      (indigo → violet → fuchsia), reused for actions and small accents.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const profile = fs.readFileSync("src/profile/App.tsx", "utf8");
const styles = fs.readFileSync("src/index.css", "utf8");

test("profile hero maps each subscription tier to its plan label", () => {
  assert.match(profile, /basic:\s*"Basic Plan"/);
  assert.match(profile, /premium:\s*"Premium Plan"/);
  assert.match(profile, /pro:\s*"Pro Plan"/);
  assert.match(profile, /data-profile-plan-label/);
  assert.match(profile, /membership\.subscriber \? planLabel : PLAN_LABELS\.normal/);
});

test("profile hero keeps the plan status data attribute", () => {
  assert.match(profile, /data-profile-plan-status=\{membership\.active \? "active" : "expired"\}/);
  assert.match(profile, /data-profile-membership-status=\{membership\.active \? "active" : "expired"\}/);
});

test("profile page is clean: no glassmorphism, orbs or animated gradients", () => {
  // The redesign is deliberately flat — none of the old glass / aurora /
  // conic-orbit machinery may come back to the profile page.
  assert.doesNotMatch(profile, /dc-glass/);
  assert.doesNotMatch(profile, /backdrop-blur/);
  assert.doesNotMatch(profile, /dc-profile-aurora/);
  assert.doesNotMatch(profile, /dc-profile-plan-orbit/);
  assert.doesNotMatch(profile, /dc-profile-status-orbit/);
  assert.doesNotMatch(profile, /conic-gradient/);
  assert.doesNotMatch(profile, /data-glass-mode/);
  // The shared CSS must also drop the profile-only visual machinery.
  assert.doesNotMatch(styles, /dc-profile-orb/);
  assert.doesNotMatch(styles, /dc-profile-plan-orbit/);
  assert.doesNotMatch(styles, /@keyframes dc-profile-blue-orbit/);
  assert.doesNotMatch(styles, /conic-gradient\(/);
});

test("profile reuses the store's brand gradient for actions and accents", () => {
  // The Store's CTA gradient (indigo → violet → fuchsia) is the only
  // gradient on the redesigned profile — buttons, progress and small icon
  // chips carry it, exactly like the Store page's Add-to-Cart button.
  assert.match(profile, /from-indigo-600 via-violet-600 to-fuchsia-600/);
});

test("profile page background is a clean static wash, not a glow field", () => {
  // The page root now uses a simple two-stop indigo wash (the same family
  // as the Store page background) instead of layered radial glows.
  assert.match(styles, /\[data-profile-page\]\s*\{/);
  assert.match(styles, /background-image: linear-gradient\(180deg, #eef2ff 0%, #f8fafc 55%, #ffffff 100%\);/);
});
