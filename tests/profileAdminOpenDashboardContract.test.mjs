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
const profileLayout = fs.readFileSync("src/profile/ProfileLayout.tsx", "utf8");
const auth = fs.readFileSync("src/AuthApp.tsx", "utf8");

test("learner auth page carries no dashboard hint; the admin entry stays dedicated", () => {
  // The tiny 9px "Open dashboard" hint was removed from the learner auth
  // page. The dashboard is reached through the approved admin's Profile
  // (below) or the dedicated #/admin-login route.
  assert.doesNotMatch(auth, /Open dashboard/);
  assert.doesNotMatch(auth, /#\/admin-login/);
  assert.match(fs.readFileSync("src/AdminLoginApp.tsx", "utf8"), />Open dashboard</);
  assert.match(fs.readFileSync("src/main.tsx", "utf8"), /"#\/admin-login"/);
});

test("profile keeps a readable dashboard link only for the approved admin", () => {
  assert.match(profile, /APPROVED_ADMIN_EMAIL/);
  assert.match(profile, /String\(user\.role \|\| ""\) === "admin"/);
  assert.match(profileLayout, /data-profile-open-dashboard/);
  assert.match(profileLayout, /isAdmin \? <button/);
  assert.match(fs.readFileSync("src/profile/profile-minimal.css", "utf8"), /\.dc-account-legal > \*[^}]*min-height: 2\.75rem/);
  assert.match(profileLayout, /Open dashboard/);
  assert.match(profile, /#\/admin-login/);
});
