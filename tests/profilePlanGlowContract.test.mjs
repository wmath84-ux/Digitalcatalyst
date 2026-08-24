// tests/profilePlanGlowContract.test.mjs
//
// The profile hero must identify the resolved subscription plan and keep the
// blue/cyan orbit on the hero plus the genuinely active status badge.

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

test("profile hero has a continuous blue conic-gradient orbit", () => {
  assert.match(profile, /className="dc-profile-plan-orbit"/);
  assert.match(styles, /@keyframes dc-profile-blue-orbit/);
  assert.match(styles, /\.dc-profile-plan-orbit::before/);
  assert.match(styles, /conic-gradient\(/);
  assert.match(styles, /animation:\s*dc-profile-blue-orbit 2\.8s linear infinite/);
});

test("only the active plan status receives the matching animated glow", () => {
  assert.match(profile, /data-profile-plan-status=\{membership\.active \? "active" : "expired"\}/);
  assert.match(profile, /membership\.active \? "dc-profile-status-orbit" : ""/);
  assert.match(styles, /\.dc-profile-status-orbit::before/);
  assert.match(styles, /\.dc-profile-status-orbit::after/);
});
