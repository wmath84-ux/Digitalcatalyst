// tests/brainQuestionTypesComposerContract.test.mjs
//
// The shape of the creation surfaces (owner brief — creation must be a
// nested PAGE, never a modal; the type selector always visible; har type ka
// apna editor; Live Experiment ka “+” bottom-right aur SELF-only):
//
//   1. the Brain composer fills the study pane as a page: no dimmed
//      backdrop, no narrow card, its own Back in the header, and the Brain
//      listing is REPLACED by it (state returns untouched behind it);
//   2. its sections run A name → B question type (eight chips, always
//      visible) → C topic/level/count/language → D CMD → E paste → F Parse
//      → G editable review → H Create;
//   3. the per-type editor covers all eight types with their own fields —
//      pair rows, placement targets, image stage, click-to-place regions —
//      and a missing image is a visible not-ready state;
//   4. the Brain listing gains the question-type filter under its header
//      (SELF only), and playback branches: pure MCQ → the sliding deck, any
//      typed question → the typed player;
//   5. Live Experiment: the one create affordance is the circular pink “+”
//      anchored bottom-right, SELF mode only; the experiment creator is the
//      same nested page, reusing the Study Library's own editor.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const composer = read("src/course/SelfPracticeSetComposer.tsx");
const editor = read("src/course/BrainQuestionEditor.tsx");
const player = read("src/course/BrainTypedPlayer.tsx");
const brainPanel = read("src/course/CourseBrainPanel.tsx");
const app = read("src/CoursePlayerApp.tsx");
const expPanel = read("src/course/ExperimentPanel.tsx");
const expComposer = read("src/course/ExperimentComposer.tsx");

/* ── 1 + 2. The Brain composer is a page with ordered sections ───────────── */

test("the Brain composer is a full-pane nested page, not a modal", () => {
  assert.match(composer, /data-brain-composer-page=""/);
  assert.match(composer, /data-brain-self-composer-close/);
  assert.doesNotMatch(composer, /bg-black\/60/, "no dimmed backdrop behind the creator");
  assert.doesNotMatch(composer, /max-w-lg/, "no narrow card");
  assert.doesNotMatch(composer, /role="dialog"/, "a page is not a dialog");
  // The panel REPLACES the listing with it (the listing returns untouched).
  assert.match(brainPanel, /data-brain-screen=\{composerOpen \? "create" : "library"\}/);
  assert.match(brainPanel, /composerOpen && onCreateSelfSet \? \([\s\S]*?<SelfPracticeSetComposer/);
  assert.match(brainPanel, /onUploadImage=\{onUploadSelfSetImage\}/);
  assert.match(app, /onUploadSelfSetImage=\{uploadSelfSetImage\}/);
  assert.match(app, /uploadMyCourseResourceFile\(user\.id, SELF_PRACTICE_SETS_COURSE_ID, file\)/);
});

test("the composer sections run name → type → brief → CMD → paste → parse → review → create", () => {
  const at = (needle) => {
    const index = composer.indexOf(needle);
    assert.ok(index > -1, `${needle} exists`);
    return index;
  };
  const name = at("data-brain-self-title");
  const type = at("data-brain-question-types");
  const topic = at("data-brain-self-topic");
  const cmd = at("data-brain-self-prompt-text");
  const paste = at("data-brain-self-paste-input");
  const parse = at("data-brain-self-parse");
  const review = at("data-brain-self-preview-list");
  const create = at("data-brain-self-create");
  assert.ok(name < type && type < topic && topic < cmd && cmd < paste && paste < parse && parse < review && review < create,
    "sections A–H in the brief's order");
  // The type selector is ALWAYS visible (not behind a mode): eight chips.
  assert.match(composer, /data-brain-question-types=""/);
  assert.match(composer, /PRACTICE_QUESTION_TYPE_OPTIONS\.map/);
  assert.match(composer, /data-brain-question-type=\{option\.value\}/);
  // Both modes share the page: AI batch and by-hand questions.
  assert.match(composer, /data-brain-self-mode/);
  assert.match(composer, /data-brain-self-ai/);
  assert.match(composer, /data-brain-self-manual/);
  // Parse is explicit and staleness still locks Create.
  assert.match(composer, /const parseFresh = parsed !== null && parsed\.source === paste;/);
  assert.match(composer, /const createReady = mode === "ai" \? parseFresh && summary\.createReady : summary\.createReady;/);
  assert.match(composer, /disabled=\{!canCreate\}/);
});

/* ── 3. The per-type editor ──────────────────────────────────────────────── */

test("one shared editor serves all eight types with type-specific fields", () => {
  assert.match(editor, /data-brain-question-editor/);
  assert.match(editor, /data-brain-question-type-select/);
  assert.match(editor, /selfPracticeEmptyQuestionOfType\(next, index\)/, "a type switch rebuilds the draft");
  assert.match(editor, /data-brain-self-mark/, "MCQ keeps its mark-the-answer control");
  for (const hook of [
    "data-brain-editor-fill-blank",
    "data-brain-editor-blank-answer",
    "data-brain-editor-one-word",
    "data-brain-editor-assertion",
    "data-brain-editor-reason",
    "data-brain-editor-ar-choice",
    "data-brain-editor-match",
    "data-brain-editor-match-left",
    "data-brain-editor-match-right",
    "data-brain-editor-drag-item",
    "data-brain-editor-drag-target",
    "data-brain-editor-drag-answer",
    "data-brain-editor-label-diagram",
    "data-brain-editor-label-target",
    "data-brain-editor-hotspot",
    "data-brain-editor-hotspot-correct",
  ]) {
    assert.ok(editor.includes(hook), `${hook} exists`);
  }
  // The A&R editor uses the ONE shared convention.
  assert.match(editor, /ASSERTION_REASON_CHOICES/);
  // Missing image = a visible, explicit state (never fake-complete).
  assert.match(editor, /data-brain-editor-image-missing=""/);
  assert.match(editor, /data-brain-editor-image-stage=""/);
  assert.match(editor, /data-brain-editor-image-url/);
  assert.match(editor, /data-brain-editor-image-file/);
  // Readiness comes from the shared rule, shown per question.
  assert.match(editor, /data-brain-question-issues=""/);
  assert.match(editor, /practiceQuestionIssues\(question\)/);
});

/* ── 4. Listing filter + playback branch ─────────────────────────────────── */

test("the Brain listing filters by question type (SELF) and playback branches per set", () => {
  assert.match(brainPanel, /data-brain-type-filter=""/);
  assert.match(brainPanel, /data-brain-type-filter-option=\{option\.value\}/);
  assert.match(brainPanel, /\{!workMode && personalLibrary \? \(/, "the filter is SELF-only");
  assert.match(brainPanel, /data-brain-filter-empty=""/);
  // Playback: one non-MCQ question routes the whole set to the typed player;
  // a pure-MCQ set keeps the deck, fed only its numeric answers.
  assert.match(brainPanel, /const typedSet = questions\.some\(\(question\) => \(question\.questionType \?\? "mcq"\) !== "mcq"\);/);
  assert.match(brainPanel, /<BrainTypedPlayer/);
  assert.match(brainPanel, /selections=\{deckSelections\}/);
  assert.match(brainPanel, /<BrainQuestionDeck/);
  // Scoring is the shared evaluator for every type now.
  assert.match(brainPanel, /evaluatePracticeAnswer\(item, selections\[index\]\)/);
});

test("the typed player offers every interaction without a swipe", () => {
  assert.match(player, /data-brain-typed-player=""/);
  assert.match(player, /data-brain-typed-check=""/);
  assert.match(player, /data-brain-typed-next=""/);
  assert.match(player, /data-brain-typed-feedback=\{verdict \?\? ""\}/);
  assert.match(player, /data-brain-typed-input=""/);
  assert.match(player, /data-brain-typed-blank=\{at\}/);
  assert.match(player, /data-brain-match-left=\{pair\.left\}/);
  assert.match(player, /data-brain-match-right=\{right\}/);
  assert.match(player, /data-brain-drag-item=\{item\}/);
  assert.match(player, /data-brain-drop-target=\{target\.id\}/);
  assert.match(player, /data-brain-typed-reset=""/);
  assert.match(player, /data-brain-label-chip=\{label\}/);
  assert.match(player, /data-brain-label-target=\{target\.id\}/);
  assert.match(player, /data-brain-typed-hotspot=""/);
  assert.match(player, /data-brain-typed-missing-image=""/);
  // No card deck, no pointer-flick machinery in here.
  assert.doesNotMatch(player, /data-brain-deck/);
  assert.doesNotMatch(player, /onFlick/);
});

/* ── 5. Live Experiment ──────────────────────────────────────────────────── */

test("Live Experiment's create affordance is the SELF-only bottom-right pink +", () => {
  assert.match(expPanel, /\{selfMode && \(onCreateSelfExperiment \|\| onCreateSelfMindMap\) \? \(/);
  assert.match(expPanel, /data-experiment-self-add=""/);
  assert.match(expPanel, /background: "#FF6BF5"/);
  assert.match(expPanel, /absolute bottom-4 right-4 z-30 grid h-12 w-12 place-items-center rounded-full/);
  // One affordance only: the header carries the MASTER/SELF control, no second +.
  const adds = expPanel.match(/data-experiment-self-add/g) ?? [];
  assert.equal(adds.length, 1, "exactly one create button");
  // The menu opens UP from it and keeps its ways in.
  assert.match(expPanel, /bottom: 76/);
  assert.match(expPanel, /data-experiment-self-menu=""/);
  assert.match(expPanel, /data-experiment-self-menu-item="scratch"/);
  // MASTER/SELF behaviour is unchanged.
  assert.match(expPanel, /<MasterSelfControl\s+feature="experiment"/);
});

test("the experiment creator is a nested page reusing the library editor", () => {
  assert.match(expPanel, /data-experiment-screen=\{composerOpen \? "create" : "library"\}/);
  assert.match(expPanel, /composerOpen && onCreateSelfExperiment \? \([\s\S]*?<ExperimentComposer/);
  assert.match(expComposer, /data-experiment-self-composer=""/);
  assert.match(expComposer, /data-experiment-self-composer-back=""/);
  assert.doesNotMatch(expComposer, /bg-black\/60/, "no modal backdrop");
  assert.doesNotMatch(expComposer, /max-w-lg/, "no narrow sheet");
  assert.doesNotMatch(expComposer, /role="dialog"/);
  // Still THE library editor — not a second builder, not a second prompt.
  assert.match(expComposer, /<MyCourseExperimentEditor/);
  assert.match(expComposer, /const canCreate = Boolean\(draft\.name\.trim\(\)\) && issues\.length === 0 && !busy;/);
  assert.match(expComposer, /data-experiment-self-create/);
  assert.match(expComposer, /data-experiment-self-error/);
});
