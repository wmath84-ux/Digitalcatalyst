// tests/personalCourseUiContract.test.mjs
//
// Source contracts for the "My Modules" Course Player surface + admin plan
// editor. Like the other *Contract suites in this repo these read the actual
// sources with regexes — they pin the DOM hooks the runtime/UX suites and the
// Course Player rely on, not implementation details.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const overlay = readFileSync("src/course/CourseOverlay.tsx", "utf8");
const player = readFileSync("src/CoursePlayerApp.tsx", "utf8");
const panel = readFileSync("src/course/PersonalModulesPanel.tsx", "utf8");
const playerPanelSource = readFileSync("src/course/PlayerPanel.tsx", "utf8");
const clientSource = readFileSync("src/lib/personalCourseClient.ts", "utf8");
const hookSource = readFileSync("src/hooks/usePersonalModules.ts", "utf8");
const adminPage = readFileSync("src/admin/pages/SubscriptionsPage.tsx", "utf8");
const adminClient = readFileSync("src/lib/admin/client.ts", "utf8");
const rules = readFileSync("firestore.rules", "utf8");
const analytics = readFileSync("src/utils/featureAnalytics.ts", "utf8");

test("the Modules tab hosts a My Modules entry row under the official curriculum", () => {
  // The entry is appended to the SAME list rows the modules tab already
  // renders (dock row look + scroll-snap), never a separate floating UI.
  assert.match(overlay, /personalModulesEntry/);
  assert.match(overlay, /data-course-personal-entry/);
  assert.match(overlay, /"My Modules"/);
  assert.match(overlay, /kind: "personal-entry"/);
});

test("opening My Modules swaps the Modules tab body in place, like the mind-map/player panels", () => {
  // Same ownership pattern as the other panels: the overlay stays
  // presentational, the player owns hook + panel.
  assert.match(overlay, /personalModulesOpen/);
  assert.match(overlay, /personalModulesPanel/);
  assert.match(overlay, /tab === "modules" && personalModulesOpen && personalModulesPanel/);
});

test("the player's My Modules hook never touches official course progress", () => {
  // selectFile + toggleComplete both skip personal files, so completion ids,
  // resume position and the progress % stay an honest record of official
  // content only.
  assert.match(player, /usePersonalModules/);
  assert.match(player, /PersonalModulesPanel/);
  assert.match(player, /file\.source \|\| ""\) !== "personal"/);
  assert.match(player, /selectedFile\.source \|\| ""\) === "personal"/);
});

test("the Player panel flags personal files instead of offering mark-complete", () => {
  assert.match(player, /canMarkComplete=\{Boolean\(selectedFile\) && !activeFileIsPersonal\}/);
  assert.match(playerPanelSource, /activeFilePersonal\?: boolean/);
  assert.match(playerPanelSource, /data-course-personal-progress-note/);
  assert.match(playerPanelSource, /data-course-file-provenance/);
  assert.match(playerPanelSource, /Personal module content/);
});

test("the My Modules panel is a plain tap list (no release-fire) with usage + locked states", () => {
  // List state surfaces the server access snapshot; compose screens re-use
  // the shared pure layer for preflight (single normalization path).
  assert.match(panel, /data-course-personal-modules/);
  assert.match(panel, /data-personal-add-module/);
  assert.match(panel, /data-personal-module-list/);
  assert.match(panel, /data-personal-locked-state/);
  assert.match(panel, /data-personal-usage-summary/);
  assert.match(panel, /sanitizePersonalModuleInput/);
  assert.match(panel, /sanitizePersonalResourceInput/);
  assert.match(panel, /personalLimitMessage/);
  assert.match(panel, /data-personal-type-picker/);
  assert.match(panel, /View subscription plans/);
});

test("personal resources open through the official viewer as provenance-tagged CourseFiles", () => {
  assert.match(clientSource, /personalResourceToCourseFile/);
  assert.match(clientSource, /source: "personal"/);
  assert.match(clientSource, /personalModuleId: moduleId/);
  assert.match(clientSource, /personalResourceId: resource\.id/);
  assert.match(player, /onOpenPersonalFile=\{selectPersonalFile\}/);
});

test("every client mutation talks to the server API — never writes Firestore directly", () => {
  // The client mirrors myDayClient: POST /api/personal-course with the
  // verified token; no firestore import, no optimistic ownership.
  assert.doesNotMatch(clientSource, /firebase\/firestore/);
  assert.match(clientSource, /apiFetch\("\/api\/personal-course"/);
  assert.match(clientSource, /Bearer \$\{token\}/);
  assert.match(hookSource, /fetchPersonalCourseLibrary/);
  assert.match(hookSource, /autoLoad/);
  assert.match(hookSource, /runMutation/);
});

test("the admin plan editor exposes the per-plan My Modules configuration", () => {
  assert.match(adminPage, /PersonalModulesSection/);
  assert.match(adminPage, /data-admin-plan-personal/);
  assert.match(adminPage, /data-admin-plan-personal-enabled/);
  assert.match(adminPage, /data-admin-plan-personal-types/);
  assert.match(adminPage, /All 12 types/);
  assert.match(adminPage, /This block never touches plan prices/);
  // Plan prices are top-level only — the editor card never renders them.
  assert.match(adminClient, /personalModules: normalizePlanPersonalModules\(data, item\.id\)/);
  assert.match(adminClient, /persistPersonalModulesBlock/);
});

test("firestore rules: personal paths are owner-read, server-write only", () => {
  // Client rules can never grant the feature or bypass the server API; the
  // Admin SDK (api/_lib/personalCourse.ts) performs every write.
  assert.match(rules, /personalCourseModules\/\{moduleId\}/);
  assert.match(rules, /allow read: if isOwner\(uid\) \|\| isAdmin\(\);/);
  assert.match(rules, /allow create, update, delete: if false;/);
  assert.match(rules, /personalCourseUsage\/\{productId\}/);
  assert.match(rules, /resources\/\{resourceId\}/);
});

test("product analytics events stay lightweight and cannot break user actions", () => {
  assert.match(analytics, /trackFeatureEvent/);
  assert.match(analytics, /ANALYTICS_EVENT_PREFIX = "personal"/);
  assert.match(analytics, /voided|best-effort|never surface/);
  assert.match(panel, /trackFeatureEvent\("upgrade_clicked"\)/);
});
