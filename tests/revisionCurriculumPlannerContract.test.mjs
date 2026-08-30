// Admin can generate the latest-year Class → Subject → Chapter → Concept
// tree with AI and one-click replace the lists students see on planning.
//
// The planner used to live in the same page as the AI Configuration
// form. After the mobile-first split it moved to its own
// `/admin/curriculum` page; the contract still holds — the AI
// generation panel is reachable from the curriculum builder, the
// engine helpers are unchanged, and the resulting tree is still
// persisted on the shared revision catalog.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adminPage = fs.readFileSync("src/admin/pages/RevisionPage.tsx", "utf8");
const curriculumPage = fs.readFileSync("src/admin/pages/CurriculumBuilderPage.tsx", "utf8");
const section = fs.readFileSync("src/admin/pages/RevisionCurriculumSection.tsx", "utf8");
const catalog = fs.readFileSync("src/revision/engine/catalogService.ts", "utf8");
const engine = fs.readFileSync("src/revision/engine/curriculumCatalog.ts", "utf8");
const generatePage = fs.readFileSync("src/revision/pages/AiGeneratePage.tsx", "utf8");
const server = fs.readFileSync("api/_lib/revisionGenerate.ts", "utf8");
const aiConfig = fs.readFileSync("src/revision/engine/aiConfig.ts", "utf8");
const client = fs.readFileSync("src/lib/admin/client.ts", "utf8");

test("admin exposes a latest-year curriculum planner on its own page", () => {
  // The AI Configuration page no longer renders the planner (the
  // Curriculum Builder page does). The planner component is still
  // the source of truth for the AI generation flow.
  assert.doesNotMatch(adminPage, /<RevisionCurriculumSection/);
  assert.match(curriculumPage, /RevisionCurriculumSection/);
  assert.match(section, /Latest-year curriculum/);
  assert.match(section, /Generate latest-year syllabus/);
  assert.match(section, /Replace live student lists/);
  assert.match(section, /{{board}}/);
  assert.match(section, /{{year}}/);
  assert.match(section, /{{className}}/);
});

test("the default curriculum prompt is editable and pre-filled", () => {
  assert.match(engine, /export function defaultCurriculumPrompt/);
  assert.match(engine, /ONLY subjects, chapters and concepts that are included/);
  assert.match(section, /defaultCurriculumPrompt/);
  assert.match(section, /Reset prompt to default/);
});

test("generated curriculum is persisted on the shared catalog", () => {
  assert.match(catalog, /planningCurriculum: PlanningCurriculum/);
  assert.match(catalog, /normalizePlanningCurriculum\(raw\.planningCurriculum\)/);
  assert.match(client, /planningCurriculum: incoming\.planningCurriculum/);
});

test("students read the published latest-year lists on the planning page", () => {
  assert.match(generatePage, /planningCurriculum/);
  assert.match(generatePage, /setCurriculum/);
  assert.match(generatePage, /curriculum\.map/);
  assert.match(generatePage, /curriculumMeta/);
  assert.match(generatePage, /included syllabus/);
});

test("curriculum generation reuses the existing AI proxy, including custom APIs", () => {
  assert.match(server, /revision\.curriculum/);
  assert.match(aiConfig, /generatePlanningCurriculumClass/);
  assert.match(aiConfig, /action: \"revision.curriculum\"/);
  assert.match(aiConfig, /className,/);
  assert.match(server, /chat\/completions/);
  assert.doesNotMatch(server, /curriculumCatalog/);
});

test("academic year starts in April", () => {
  assert.match(engine, /month >= 3/);
  assert.match(engine, /export function currentAcademicYear/);
});

test("a partially-filled tree is preserved instead of silently wiped", () => {
  // The old normalizer dropped chapters with zero topics and subjects with
  // zero chapters, so a half-built publish normalised the ENTIRE
  // `planningCurriculum` to null and students kept seeing the built-in
  // fallback. Named nodes must now survive (lossless round-trip).
  assert.doesNotMatch(engine, /if \(!topics\.length\) continue;/);
  assert.doesNotMatch(engine, /if \(!chapters\.length\) continue;/);
  assert.match(engine, /lossless/);
});
