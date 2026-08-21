// tests/revisionAdminPublishKeyWarningContract.test.mjs
//
// Publishing the school AI default WITHOUT sharing a key must never look
// like full success: the admin gets a warning toast, a confirmation dialog,
// a live "students see X" status panel, and a publish preview. The student
// side keeps the shared-key gate untouched (by design).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adminPage = fs.readFileSync("src/admin/pages/RevisionPage.tsx", "utf8");
const providers = fs.readFileSync("src/components/admin/AdminProviders.tsx", "utf8");
const aiSettingsPage = fs.readFileSync("src/revision/pages/AiSettingsPage.tsx", "utf8");
const aiConfig = fs.readFileSync("src/revision/engine/aiConfig.ts", "utf8");

test("admin providers expose a warning toast kind", () => {
  assert.match(providers, /kind: "success" \| "error" \| "info" \| "warning"/);
  assert.match(providers, /border-amber-300 bg-amber-50 text-amber-800/);
});

test("publishing without a shared key asks for explicit confirmation", () => {
  assert.match(adminPage, /useConfirm/);
  assert.match(adminPage, /Publish without a shared key\?/);
  assert.match(adminPage, /Publish anyway/);
  // The confirm gate runs before the settings payload is built, and the
  // publish aborts when the admin cancels.
  assert.ok(
    adminPage.indexOf("Publish without a shared key?") < adminPage.indexOf("const nextSettings"),
    "confirm dialog must appear before the publish payload is built",
  );
  assert.match(adminPage, /if \(!confirmed\) return;/);
});

test("no-key publish never shows a plain success toast", () => {
  assert.match(adminPage, /notify\(\s*"warning",/);
  assert.match(adminPage, /School-provided AI is NOT ready for students \(no shared key\)/);
  // The old ambiguous toast that looked like full success is gone.
  assert.doesNotMatch(adminPage, /users now see this provider & model as the default/);
});

test("admin page shows the live student view of School-provided AI", () => {
  assert.match(adminPage, /data-student-ai-status/);
  assert.match(adminPage, /Students currently see “School-provided AI” as/);
  assert.match(adminPage, /disabled \(no shared key\)/);
  assert.match(adminPage, /not published yet/);
  // Status must be derived from the SAME predicates the student page gates on,
  // so it can never drift from the real button state.
  assert.match(adminPage, /isSchoolAiAvailable\(published\)/);
  assert.match(adminPage, /isSchoolAiPublished\(published\)/);
});

test("admin page previews what the next publish does to students", () => {
  assert.match(adminPage, /data-publish-preview/);
  assert.match(adminPage, /no key goes out/);
  assert.match(adminPage, /remove<\/span> the shared key students are currently using/);
});

test("student gating keeps requiring a shared key (by design)", () => {
  assert.match(aiConfig, /settings\?\.sharedApiKey\?\.trim\(\) && settings\?\.model\?\.trim\(\)/);
  assert.match(aiSettingsPage, /disabled=\{!catalogLoading && !schoolReady\}/);
  assert.match(aiSettingsPage, /hasn't shared a key yet/);
});
