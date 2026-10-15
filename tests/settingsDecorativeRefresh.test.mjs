import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const settings = fs.readFileSync("src/settings/SettingsPage.tsx", "utf8");
const settingsCss = fs.readFileSync("src/settings/settings.css", "utf8");
const auth = fs.readFileSync("src/AuthApp.tsx", "utf8");

test("Settings gets decorative section art while keeping its saved controls intact", () => {
  assert.match(settings, /settings-heading-art/);
  assert.match(settings, /settings-section-icon/);
  assert.match(settings, /settings-device-icon/);
  for (const key of ["push", "email", "promotions", "profileVisible", "shareActivity"]) {
    assert.ok(settings.includes(`setting=\"${key}\"`) || settings.includes(`renderSwitch(\"${key}\"`), `${key} preference remains wired`);
  }
  assert.match(settings, /useUserPreferences\(user\?\.id\)/);
  assert.match(settings, /data-switch-state=/);
  assert.match(settingsCss, /\[data-settings-page\]:not\(\[data-public-profile\]\)/);
});

test("the below-card auth trust badges stay removed", () => {
  for (const badge of ["Instant Access", "Firebase Secured", "Multi-Device Sync"]) {
    assert.doesNotMatch(auth, new RegExp(badge));
  }
  assert.match(auth, /<AuthForm/);
  // The "Open dashboard" hint and the "Firebase Security" line were later
  // removed from the learner auth page as well; neither may return.
  assert.doesNotMatch(auth, />Open dashboard</);
  assert.doesNotMatch(auth, /Firebase Security/);
});
