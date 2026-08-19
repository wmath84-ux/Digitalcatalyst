// tests/profileAdminOpenDashboardContract.test.mjs
//
// The approved admin account gets a tiny "Open dashboard" link at the
// bottom of the profile page — same 9px type as the auth-page hint — so
// the dashboard can be opened without a loud button. Regular learners
// never see it.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const profile = fs.readFileSync("src/profile/App.tsx", "utf8");
const auth = fs.readFileSync("src/AuthApp.tsx", "utf8");

test("auth page keeps the tiny Open dashboard hint", () => {
  assert.match(auth, /text-\[9px\] font-medium tracking-wide/);
  assert.match(auth, />Open dashboard</);
  assert.match(auth, /#\/admin-login/);
});

test("profile shows the same-size Open dashboard link only for the approved admin", () => {
  assert.match(profile, /APPROVED_ADMIN_EMAIL/);
  assert.match(profile, /user\.role === "admin"/);
  assert.match(profile, /data-profile-open-dashboard/);
  assert.match(profile, /text-\[9px\] font-medium tracking-wide/);
  assert.match(profile, />Open dashboard</);
  assert.match(profile, /#\/admin-login/);
});
