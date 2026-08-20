// Admin can generate the latest-year Class → Subject → Chapter → Concept
// tree with AI and one-click replace the lists students see on planning.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adminPage = fs.readFileSync("src/admin/pages/RevisionPage.tsx", "utf8");
const section = fs.readFileSync("src/admin/pages/RevisionCurriculumSection.tsx", "utf8");
const catalog = fs.readFileSync("src/revision/engine/catalogService.ts", "utf8");
const engine = fs.readFileSync("src/revision/engine/curriculumCatalog.ts", "utf8");
const generatePage = fs.readFileSync("src/revision/pages/AiGeneratePage.tsx", "utf8");
const server = fs.readFileSync("api/_lib/revisionGenerate.ts", "utf8");
const aiConfig = fs.readFileSync("src/revision/engine/aiConfig.ts", "utf8");
const client = fs.readFileSync("src/lib/admin/client.ts", "utf8");

test("admin revision page has a latest-year curriculum planner beside AI configuration", () => {
  assert.match(adminPage, /RevisionCurriculumSection/);
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
