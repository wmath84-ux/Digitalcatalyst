// tests/revisionAiSettingsWiringContract.test.mjs
//
// School-provided AI must be wired to the admin-published catalog.
// Own-key must stay a blank slate (empty API box, empty model list).
// Offline must jump to bulk import. AI Configuration is config-only.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const aiSettingsPage = fs.readFileSync("src/revision/pages/AiSettingsPage.tsx", "utf8");
const aiConfig = fs.readFileSync("src/revision/engine/aiConfig.ts", "utf8");
const catalogService = fs.readFileSync("src/revision/engine/catalogService.ts", "utf8");
const form = fs.readFileSync("src/revision/components/AiConfigForm.tsx", "utf8");
const bulkImport = fs.readFileSync("src/revision/pages/BulkImportPage.tsx", "utf8");
const adminPage = fs.readFileSync("src/admin/pages/RevisionPage.tsx", "utf8");

test("school-provided AI reads the admin catalog and does not copy it onto own-key", () => {
  assert.match(aiSettingsPage, /isSchoolAiAvailable/);
  assert.match(aiSettingsPage, /fetchRemoteCatalog/);
  assert.match(aiSettingsPage, /data-school-ai-preview/);
  assert.match(aiSettingsPage, /School-provided AI/);
  // The old bug: admin provider/model was prefilled into the student's own form.
  assert.doesNotMatch(aiSettingsPage, /Prefill the user's provider form/);
  assert.doesNotMatch(aiSettingsPage, /config: \{\s*\.\.\.prev\.config,\s*provider: adminSettings/);
  assert.match(aiConfig, /export function isSchoolAiAvailable/);
  assert.match(aiConfig, /export function schoolAiConfig/);
  assert.match(aiConfig, /label: \"School-provided AI\"/);
});

test("own API key starts as a blank form with no school models", () => {
  assert.match(aiSettingsPage, /blankOwnAiConfig/);
  assert.match(aiSettingsPage, /liveModelsOnly/);
  assert.match(aiConfig, /export function blankOwnAiConfig/);
  assert.match(form, /liveModelsOnly/);
  assert.match(form, /liveModelsOnly \? \"\" /);
  assert.match(form, /Add an API key to see models/);
});

test("offline mode navigates to bulk import so the student can paste a full plan", () => {
  assert.match(aiSettingsPage, /source === \"offline\"/);
  assert.match(aiSettingsPage, /#\/revision\/bulk-import/);
  assert.match(aiSettingsPage, /navigate\(\"#\/revision\/bulk-import\"\)/);
  assert.match(bulkImport, /Paste your revision plan/);
  assert.match(bulkImport, /correct answers/);
});

test("AI configuration page has no generate-questions CTA", () => {
  assert.doesNotMatch(aiSettingsPage, /Generate questions with this AI/);
  assert.doesNotMatch(aiSettingsPage, /ai-generate/);
  assert.doesNotMatch(aiSettingsPage, /PrimaryButton/);
  assert.doesNotMatch(adminPage, /generateQuestionsWithAi/);
});

test("catalog parse keeps aiSettings even when question-bank arrays are missing", () => {
  assert.doesNotMatch(
    catalogService,
    /if \(!Array\.isArray\(raw\.subjects\) \|\| !Array\.isArray\(raw\.topics\) \|\| !Array\.isArray\(raw\.questions\)\)/,
  );
  assert.match(catalogService, /subjectRows/);
  assert.match(catalogService, /normalizeCatalogAiSettings\(raw\.aiSettings\)/);
});
