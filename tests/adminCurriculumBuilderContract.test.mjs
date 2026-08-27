// tests/adminCurriculumBuilderContract.test.mjs
//
// Contract tests for the split between the AI Configuration admin
// page (`/admin/revision`) and the new Curriculum Builder admin
// page (`/admin/curriculum`). The previous design packed both jobs
// into one long form, which made the page overflow on mobile. The
// new design gives each job its own URL, while still sharing the
// same Firestore-backed catalog so a publish on one page is
// instantly visible on the other.
//
// The contract is:
//   1. The AI Configuration page no longer renders the curriculum
//      tree or the AI generation panel — those are on the new
//      page.
//   2. The Curriculum Builder page renders the manual editor and
//      the AI generation panel side by side.
//   3. Both pages consume the revision catalog from a shared
//      `useRevisionCatalog` context (no duplicate fetches, no
//      stale data on cross-page navigation).
//   4. The admin nav exposes both entries.
//   5. Manual edits and the AI generation both still persist to
//      the same `planningCurriculum` field on the catalog, so
//      students continue to see a single source of truth.
//
// These are pure code-shape tests — no React, no DOM — so they
// fail fast if the split is reverted by accident.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const adminApp = fs.readFileSync("src/admin/AdminApp.tsx", "utf8");
const adminPage = fs.readFileSync("src/admin/pages/RevisionPage.tsx", "utf8");
const curriculumPage = fs.readFileSync("src/admin/pages/CurriculumBuilderPage.tsx", "utf8");
const providers = fs.readFileSync("src/components/admin/AdminProviders.tsx", "utf8");
const nav = fs.readFileSync("src/components/admin/nav.ts", "utf8");
const section = fs.readFileSync("src/admin/pages/RevisionCurriculumSection.tsx", "utf8");
const editor = fs.readFileSync("src/admin/pages/ManualCurriculumEditor.tsx", "utf8");
const indexCss = fs.readFileSync("src/index.css", "utf8");

test("admin nav exposes AI Configuration and Curriculum Builder as two separate entries", () => {
  assert.match(nav, /href: "\/admin\/revision", label: "AI Configuration"/);
  assert.match(nav, /href: "\/admin\/curriculum", label: "Curriculum Builder"/);
  // The old combined entry is gone.
  assert.doesNotMatch(nav, /Revision · AI & Curriculum/);
});

test("AdminApp routes /admin/curriculum to the Curriculum Builder page", () => {
  assert.match(adminApp, /import CurriculumBuilderPage from "\.\/pages\/CurriculumBuilderPage"/);
  assert.match(adminApp, /if \(path === "\/admin\/curriculum"\) return <CurriculumBuilderPage \/>/);
});

test("AI Configuration page no longer renders the curriculum tree or the AI generation panel", () => {
  // The page used to render both `RevisionCurriculumSection` and
  // `ManualCurriculumEditor` at the bottom; both have moved.
  assert.doesNotMatch(adminPage, /<RevisionCurriculumSection/);
  assert.doesNotMatch(adminPage, /<ManualCurriculumEditor/);
  assert.doesNotMatch(adminPage, /import RevisionCurriculumSection/);
  assert.doesNotMatch(adminPage, /import ManualCurriculumEditor/);
  // The page does still render the "school-provided AI" status
  // panel, the publish form and the live student view.
  assert.match(adminPage, /data-student-ai-status/);
  assert.match(adminPage, /Publish default for all users/);
  assert.match(adminPage, /useConfirm/);
});

test("Curriculum Builder page renders the manual editor and the AI generation panel", () => {
  // The manual tree editor lives on the new page.
  assert.match(curriculumPage, /useRevisionCatalog/);
  assert.match(curriculumPage, /<RevisionCurriculumSection/);
  // The page also keeps the same business logic as the previous
  // editor (single-item add, bulk paste, JSON import, save &
  // publish, instructor icons, slug uniqueness).
  assert.match(curriculumPage, /parseBulkLines/);
  assert.match(curriculumPage, /parseBulkConcepts/);
  assert.match(curriculumPage, /uniqueKey/);
  assert.match(curriculumPage, /guessIcon/);
  assert.match(curriculumPage, /PLANNING_CLASSES|RevisionCurriculumSection/);
  // The AI generation panel is the imported `RevisionCurriculumSection`
  // — verify it still references the default prompt and the
  // syllabus generator function from the engine.
  assert.match(section, /defaultCurriculumPrompt/);
  assert.match(section, /generatePlanningCurriculumClass/);
  // The new page still POSTs to the same endpoint the manual
  // editor used to.
  assert.match(curriculumPage, /adminFetch<\{ catalog: RevisionCatalog \}>\("\/api\/admin\/revision"/);
  // The page also re-reads the admin's own AI config from
  // localStorage so the AI generation panel works without the
  // admin ever opening the AI Configuration page in this session.
  assert.match(curriculumPage, /loadAdminAiConfig/);
});

test("Curriculum Builder page uses the shared `useRevisionCatalog` context", () => {
  // Both pages now consume the catalog from the provider instead
  // of fetching it themselves. The provider exposes `catalog`,
  // `error`, `loading`, `reload` and `setCatalog`.
  assert.match(providers, /useRevisionCatalog/);
  assert.match(providers, /type CatalogContextValue/);
  assert.match(providers, /CatalogContext\.Provider/);
  assert.match(curriculumPage, /useRevisionCatalog\(\)/);
  // The AI Configuration page also uses the same context.
  assert.match(adminPage, /useRevisionCatalog/);
});

test("the manual editor is still a self-contained component", () => {
  // The original `ManualCurriculumEditor` is still on disk so
  // existing imports in tests / storybook keep working, but it is
  // no longer rendered by the AI Configuration page (the contract
  // is enforced by the test above).
  assert.match(editor, /export default function ManualCurriculumEditor/);
  assert.match(editor, /Save & publish/);
});

test("the curriculum AI generation panel keeps its existing API contract", () => {
  assert.match(section, /Generate latest-year syllabus/);
  assert.match(section, /Replace live student lists/);
  assert.match(section, /PLANNING_CLASSES/);
  assert.match(section, /generatePlanningCurriculumClass/);
  assert.match(section, /defaultCurriculumPrompt/);
});

test("Curriculum Builder exposes a top-level pill rail for navigation", () => {
  // The new drill-down pattern needs a pill rail at the top of
  // the page. The contract is that the rail selector + the add /
  // paste data-attributes exist on the page so test/e2e suites can
  // find the right controls.
  assert.match(curriculumPage, /data-pill-rail/);
  assert.match(curriculumPage, /data-pill-rail-label=\{label\}/);
  assert.match(curriculumPage, /data-pill-action="add"/);
  assert.match(curriculumPage, /data-pill-action="paste"/);
  assert.match(curriculumPage, /data-pill-rail-pill/);
});

test("Curriculum Builder shows a single focused card at a time (focus mode)", () => {
  // The active class is the only one rendered as a full card.
  // The other classes live in the rail; tapping a pill switches
  // focus. The implementation also clears subject + chapter focus
  // when the class changes, so the right-pane never shows stale
  // selections.
  assert.match(curriculumPage, /setActiveSubjectKey\(null\)/);
  assert.match(curriculumPage, /setActiveChapterKey\(null\)/);
  // The save bar is sticky at the bottom — the publish button is
  // always in reach on mobile without having to scroll.
  assert.match(curriculumPage, /sticky bottom-0/);
  assert.match(curriculumPage, /Save & publish/);
});

test("mobile-first only — pill rails use horizontally-scrolling containers", () => {
  // The contract is that the pill rail is mobile-first: a single
  // row of horizontally-scrolling pills, never a multi-column
  // grid. Any future desktop redesign must opt in explicitly.
  assert.match(curriculumPage, /scrollbar-hide -mx-1 flex gap-1\.5 overflow-x-auto/);
});

test("curriculum import / paste / JSON still works on the new page", () => {
  assert.match(curriculumPage, /handleJsonPaste/);
  assert.match(curriculumPage, /Imported /);
  assert.match(curriculumPage, /Paste list/);
  assert.match(curriculumPage, /data-sheet-mode="bulk"/);
  assert.match(curriculumPage, /data-sheet-mode="single"/);
});
