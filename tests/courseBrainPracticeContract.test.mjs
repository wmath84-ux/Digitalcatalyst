// tests/courseBrainPracticeContract.test.mjs
//
// The Brain contract, end to end:
//
//   Admin (Product / Course-content)            Course Player
//   resource type "Brain · practice set"   →    the Brain tab's practice page
//   PracticeSetImportPanel (bulk import)        CourseBrainPanel
//        ↓                                          ↑
//   utils/practiceSet.js  →  utils/productMapping.js  →  CourseFile.practiceQuestions
//
// What this file pins down:
//   1. the shared normaliser (one rule for the admin preview, the stored
//      document and what the learner answers);
//   2. the mapping layer: a URL-less `brain` resource survives every hop of the
//      editor → Firestore → catalog → editor round trip WITH its questions,
//      while every other type still needs a URL;
//   3. the access filter that feeds the Brain tab (a locked / hidden / unowned
//      paid module can never leak its practice set);
//   4. the admin surface: the Brain option in the resource-type list, the
//      importer, the publish rules;
//   5. the player surface: the panel, its wiring, and DESIGN PARITY with
//      src/revision/pages/TestPlayerPage.tsx (the same markup language, the
//      same copy, the same bar) plus the viewport scaling ladder;
//   6. the "Always-visible footer dock" default of ON;
//   7. reachability: the Brain tab follows the watched module, and a set opens
//      from the Modules list, from resume and from a deep link.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAX_PRACTICE_OPTIONS,
  MAX_PRACTICE_QUESTIONS,
  collectBrainPracticeSets,
  countUnmarkedPracticeQuestions,
  normalizePracticeQuestion,
  normalizePracticeQuestions,
  practiceQuestionsReady,
} from "../utils/practiceSet.js";
import {
  canonicalResourceToLegacyFile,
  editorResourceToCanonical,
  editorResourceToFirestore,
  editorToFirestoreBody,
  firestoreResourceToEditor,
  firestoreToCatalogProduct,
  firestoreToEditorForm,
} from "../utils/productMapping.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(root, path), "utf-8");

const practiceSet = read("utils/practiceSet.js");
const mapping = read("utils/productMapping.js");
const courseTypes = read("src/types/course.ts");
const adminTypes = read("src/lib/admin/types.ts");
const editor = read("src/components/admin/products/ModulesResourcesEditor.tsx");
const importer = read("src/components/admin/products/PracticeSetImportPanel.tsx");
const productEditor = read("src/components/admin/products/ProductEditor.tsx");
const overlay = read("src/course/CourseOverlay.tsx");
const playerApp = read("src/CoursePlayerApp.tsx");
const brainPanel = read("src/course/CourseBrainPanel.tsx");
const revisionPlayer = read("src/revision/pages/TestPlayerPage.tsx");
const indexCss = read("src/index.css");
const demo = read("src/data/demoCourseContent.ts");
const playerPanel = read("src/course/PlayerPanel.tsx");

const question = (id, correctIndex = 0) => ({
  id,
  prompt: `Question ${id}?`,
  options: ["First", "Second", "Third"],
  correctIndex,
  explanation: "Because.",
  difficulty: "medium",
  topic: "Algebra",
});

const brainResource = (overrides = {}) => ({
  id: "res_brain",
  name: "Chapter 1 practice",
  type: "brain",
  url: "",
  provider: "Brain",
  sortOrder: 0,
  visibility: "visible",
  accessLevel: "included",
  individuallyPurchasable: false,
  cashPrice: null,
  salePrice: null,
  coinPrice: null,
  paidUpdateId: null,
  entitlementId: "res_brain",
  parentModuleId: "mod_1",
  practiceTitle: "Chapter 1 — practice",
  practiceQuestions: [question("q1"), question("q2", 2)],
  ...overrides,
});

// ---------------------------------------------------------------------------
// 1. The shared normaliser — one rule for every layer
// ---------------------------------------------------------------------------

test("the practice normaliser is the single source of truth for the question shape", () => {
  const parsed = normalizePracticeQuestion({ prompt: "  What is   2 + 2? ", options: ["3", "4", "5", ""], correctIndex: 1 }, 0);
  assert.equal(parsed.prompt, "What is 2 + 2?", "whitespace is collapsed in the prompt");
  assert.deepEqual(parsed.options, ["3", "4", "5"], "trailing blank options are dropped");
  assert.equal(parsed.correctIndex, 1);
  assert.equal(parsed.difficulty, "medium", "a missing difficulty defaults to medium");
  assert.equal(parsed.id, "q1");
  // A question needs a prompt and at least two options — nothing else counts.
  assert.equal(normalizePracticeQuestion({ prompt: "", options: ["a", "b"] }), null);
  assert.equal(normalizePracticeQuestion({ prompt: "Only one option", options: ["a"] }), null);
});

test("the normaliser caps the set at the Test Bank's 100 questions and 6 options", () => {
  assert.equal(MAX_PRACTICE_QUESTIONS, 100);
  assert.equal(MAX_PRACTICE_OPTIONS, 6);
  const many = Array.from({ length: MAX_PRACTICE_QUESTIONS + 12 }, (_, index) => question(`q${index}`));
  assert.equal(normalizePracticeQuestions(many).length, MAX_PRACTICE_QUESTIONS);
  const wide = normalizePracticeQuestions([{ prompt: "x", options: ["a", "b", "c", "d", "e", "f", "g", "h"], correctIndex: 7 }])[0];
  assert.equal(wide.options.length, MAX_PRACTICE_OPTIONS);
  assert.ok(wide.correctIndex < wide.options.length, "an answer outside the kept options is cleared, never kept out of range");
});

test("the normaliser keeps ids unique so two tiles can never select together", () => {
  const ids = normalizePracticeQuestions([question("q1"), question("q1"), question("q1")]).map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ["q1", "q1-2", "q1-3"]);
});

test("publish-readiness means every question has a marked answer", () => {
  assert.equal(practiceQuestionsReady([question("q1")]), true);
  assert.equal(practiceQuestionsReady([question("q1"), { ...question("q2"), correctIndex: -1 }]), false);
  assert.equal(practiceQuestionsReady([]), false);
  assert.equal(countUnmarkedPracticeQuestions([question("q1"), { ...question("q2"), correctIndex: -1 }]), 1);
});

// ---------------------------------------------------------------------------
// 2. The mapping layer — a URL-less brain resource keeps its questions
// ---------------------------------------------------------------------------

test("a brain resource round-trips editor → canonical → Firestore → player → editor", () => {
  const resource = brainResource();
  const canonical = editorResourceToCanonical(resource);
  assert.equal(canonical.type, "brain");
  assert.equal(canonical.practiceQuestions.length, 2);
  assert.equal(canonical.practiceTitle, "Chapter 1 — practice");

  const stored = editorResourceToFirestore(resource);
  assert.equal(stored.type, "brain");
  assert.equal(stored.practiceQuestions.length, 2);

  // The Course Player's own shape (`courseContent[].files[]`).
  const playerFile = canonicalResourceToLegacyFile(canonical);
  assert.equal(playerFile.type, "brain");
  assert.equal(playerFile.practiceQuestions.length, 2);
  assert.equal(playerFile.practiceTitle, "Chapter 1 — practice");

  // …and back into the editor, so the admin can reopen and extend the set.
  const backInEditor = firestoreResourceToEditor(stored);
  assert.equal(backInEditor.type, "brain");
  assert.equal(backInEditor.practiceQuestions.length, 2);
  assert.equal(backInEditor.practiceTitle, "Chapter 1 — practice");
});

test("the full product projection carries the brain set to the player tree", () => {
  const module = { id: "mod_1", title: "Module", parentModuleId: null, resources: [brainResource()] };
  const body = editorToFirestoreBody({ id: "p1", title: "Product", modules: [module] });
  const product = firestoreToCatalogProduct({ ...body, adminProduct: { modules: [module] } }, "p1");
  const file = product.courseContent[0].files[0];
  assert.equal(file.type, "brain");
  assert.equal(file.practiceQuestions.length, 2, "the player's tree carries the questions, not just the type");
  assert.equal(product.canonicalModules[0].resources[0].practiceQuestions.length, 2);
  const form = firestoreToEditorForm({ ...body, title: "Product" }, "p1");
  assert.equal(form.modules[0].resources[0].practiceQuestions.length, 2);
});

test("an empty or unanswerable brain set is NOT publishable, and other types still need a URL", () => {
  assert.equal(editorResourceToCanonical(brainResource({ practiceQuestions: [] })), null);
  assert.equal(editorResourceToCanonical(brainResource({ practiceQuestions: [{ prompt: "x", options: ["a", "b"], correctIndex: -1 }] })), null);
  // A brain resource is valid with NO url at all…
  assert.ok(editorResourceToCanonical(brainResource({ url: "" })));
  // …while a URL-less resource of any other type is still dropped.
  assert.equal(editorResourceToCanonical({ ...brainResource(), type: "pdf", practiceQuestions: [] }), null);
});

test("the mapping layer knows brain as a first-class type", () => {
  assert.match(mapping, /s === "brain"/, "normResourceType keeps brain instead of narrowing it to embed");
  assert.match(mapping, /const isBrainResourceType = \(type\) => type === "brain"/);
  assert.match(mapping, /practiceQuestions: isBrainResourceType\(type\) \? practiceQuestionsOf\(raw\) : undefined/);
  assert.match(mapping, /import \{ normalizePracticeQuestions, practiceQuestionsReady \} from "\.\/practiceSet\.js"/);
});

// ---------------------------------------------------------------------------
// 3. Access — the Brain tab can never leak paid or hidden content
// ---------------------------------------------------------------------------

test("collectBrainPracticeSets lists only the sets the learner may open", () => {
  const tree = [
    { id: "m1", title: "Free", accessLevel: "included", files: [
      { id: "b1", name: "Set one", type: "brain", practiceQuestions: [question("q1")] },
      { id: "b2", name: "Empty", type: "brain", practiceQuestions: [] },
      { id: "v1", name: "Video", type: "youtube", url: "https://youtu.be/x" },
    ], modules: [] },
    { id: "m2", title: "Paid", accessLevel: "paidUpdate", paidUpdateId: "u1", files: [
      { id: "b3", name: "Paid set", type: "brain", practiceQuestions: [question("q3")] },
    ], modules: [] },
    { id: "m3", title: "Hidden", accessLevel: "hidden", files: [
      { id: "b4", name: "Hidden set", type: "brain", practiceQuestions: [question("q4")] },
    ], modules: [] },
    { id: "m4", title: "Parent", accessLevel: "included", files: [], modules: [
      { id: "m5", title: "Child", accessLevel: "included", files: [
        { id: "b5", name: "Child set", type: "brain", practiceQuestions: [question("q5")] },
      ], modules: [] },
    ] },
  ];
  const unlocked = new Set(["m1", "m4", "m5"]);
  const sets = collectBrainPracticeSets(tree, unlocked);
  assert.deepEqual(sets.map((set) => set.id), ["b1", "b5"], "locked, hidden and unowned paid sets are never built");
  assert.equal(sets[0].moduleTitle, "Free");
  assert.equal(sets[0].title, "Set one", "the resource name is the fallback title");
  // Owning the paid update adds only that set.
  assert.deepEqual(collectBrainPracticeSets(tree, new Set([...unlocked, "m2"])).map((set) => set.id), ["b1", "b3", "b5"]);
  // The learner-facing title prefers practiceTitle.
  const titled = collectBrainPracticeSets(
    [{ id: "m1", title: "Free", accessLevel: "included", files: [{ ...tree[0].files[0], practiceTitle: "Chapter 1 — practice" }], modules: [] }],
    unlocked,
  );
  assert.equal(titled[0].title, "Chapter 1 — practice");
});

test("the player builds the sets from the SAME access rule as the modules list", () => {
  assert.match(
    playerApp,
    /collectBrainPracticeSets\(modules, unlockedModuleIds\(modules, resolution\.accessibleModuleIds, resolution\.ownedUpdateIds\)\)/,
  );
  assert.match(overlay, /export const unlockedModuleIds = \(/);
});

// ---------------------------------------------------------------------------
// 4. Admin — the Brain option on the Product / Course-content page
// ---------------------------------------------------------------------------

test("resource type list offers Brain · practice set", () => {
  assert.match(editor, /"iframe",\s*\n\s*"brain",\s*\n\] as const;/, "brain joins RESOURCE_TYPES");
  assert.match(editor, /brain: "Brain · practice set"/);
  assert.match(editor, /if \(type === "brain"\) return "Brain";/);
  assert.match(adminTypes, /\| "brain";/, "the editor's ProductResource type knows brain");
  assert.match(adminTypes, /export type ProductPracticeQuestion = \{/);
  assert.match(adminTypes, /practiceQuestions\?: ProductPracticeQuestion\[\];/);
});

test("picking Brain swaps the URL fields for the importer", () => {
  assert.match(editor, /import PracticeSetImportPanel from "@\/components\/admin\/products\/PracticeSetImportPanel";/);
  assert.match(editor, /const isBrain = resource\.type === "brain";/);
  assert.match(editor, /\{isBrain \? \(\s*\n\s*<PracticeSetImportPanel/);
  assert.match(editor, /practiceTitle: title \|\| undefined,/);
  // The URL-only publish rule must not fire for a type that has no URL.
  assert.match(editor, /\{!cleanUrl && !isBrain \? \(/);
  assert.match(editor, /\{!isBrain \? \(\s*\n\s*<SecondaryButton/);
  // …and a ready / incomplete set is spelled out on the resource card.
  assert.match(editor, /const brainReady = isBrain && practiceQuestionsReady\(resource\.practiceQuestions\);/);
});

test("the importer is the revision bulk-import flow, plus hand-written questions", () => {
  assert.match(importer, /import \{ parseQuestionText \} from "@\/revision\/engine\/bulkParser";/, "the SAME parser the revision importer uses");
  assert.match(importer, /from "\.\.\/\.\.\/\.\.\/\.\.\/utils\/practiceSet\.js"/, "and the SAME normaliser the player reads");
  assert.match(importer, /const preview = useMemo\(\(\) => \(paste\.trim\(\) \? parseQuestionText\(paste\) : \[\]\), \[paste\]\);/);
  assert.match(importer, /data-practice-paste/);
  assert.match(importer, /data-practice-import/);
  assert.match(importer, /Add question manually/, "create/add by hand, not only bulk paste");
  assert.match(importer, /data-practice-correct=\{correct \? "true" : "false"\}/, "tap the circle to mark the correct answer");
  assert.match(importer, /data-practice-question/);
  assert.match(importer, /MAX_PRACTICE_QUESTIONS/, "the 100-question ceiling is enforced at import time");
});

test("publishing blocks on an incomplete brain set (and skips the URL rule for it)", () => {
  assert.match(productEditor, /if \(r\.type === "brain"\) \{/);
  assert.match(productEditor, /Brain practice set .* has no questions yet/);
  assert.match(productEditor, /incomplete question/);
  assert.match(productEditor, /\} else if \(!normalizeResourceUrl\(r\.url, r\.type\)\) \{/);
  assert.match(productEditor, /import \{[^}]*practiceQuestionsReady[^}]*\} from "\.\.\/\.\.\/\.\.\/\.\.\/utils\/practiceSet\.js";/);
});

test("saving normalises the brain set, and a brain resource keeps no URL", () => {
  // persist() must write the CANONICAL question shape, not whatever the editor
  // happened to hold: the player reads the same normaliser at render time, so
  // an un-normalised write would surface as drifting ids / stale correct marks.
  assert.match(productEditor, /practiceQuestions: normalizePracticeQuestions\(resource\.practiceQuestions\)/);
  assert.match(productEditor, /import \{[^}]*normalizePracticeQuestions[^}]*\} from "\.\.\/\.\.\/\.\.\/\.\.\/utils\/practiceSet\.js";/);
  // A Brain resource has no URL by definition: saving clears the link fields a
  // card may still carry from the type it used to be.
  assert.match(productEditor, /if \(resource\.type === "brain"\) \{[\s\S]*?url: ""/);
  assert.match(productEditor, /if \(resource\.type === "brain"\) \{[\s\S]*?youtubeVideoId: ""/);
  assert.match(productEditor, /practiceTitle: \(resource\.practiceTitle \|\| ""\)\.trim\(\)/);
});

// ---------------------------------------------------------------------------
// 5. Player — the Brain page IS the revision test-taking page
// ---------------------------------------------------------------------------

test("the Brain page reuses the revision page's exact markup language", () => {
  // Every one of these literals must appear in BOTH the revision test player
  // and the Brain panel — that is what "the same design" means in code.
  const shared = [
    "dc-tile aspect-auto",
    "[&>span]:w-full [&>span]:justify-start [&>span]:gap-3",
    "dc-scene-plate dc-scene-plate--bar",
    "grid-cols-5",
    "Skip this question",
    "Tap any question to jump back and change your answer before you submit.",
    "Keep Reviewing",
    "Answered",
    "Unanswered",
    "ProgressBar",
    "GlassTile",
    "Badge",
  ];
  for (const literal of shared) {
    assert.ok(revisionPlayer.includes(literal), `revision TestPlayerPage is missing "${literal}" (the design reference changed)`);
    assert.ok(brainPanel.includes(literal), `the Brain panel is missing the revision design's "${literal}"`);
  }
  // The selected answer's indigo ink + letter circle, exactly as revision paints it.
  assert.match(brainPanel, /selected \? "bg-indigo-600 text-white" : "border border-white\/20 text-white\/75"/);
  // The submit dialog is the revision dialog (its own scoped copy: the panel
  // lives inside the player's study pane, not a revision page column).
  assert.match(brainPanel, /data-brain-submit-dialog/);
  assert.match(brainPanel, /GlassSurface/);
  assert.match(brainPanel, /unanswered question\{unansweredCount === 1 \? "" : "s"\}/);
});

test("the Brain page covers the whole practice loop: questions, review, submit, result, answers", () => {
  assert.match(brainPanel, /data-brain-screen="library"/);
  assert.match(brainPanel, /data-brain-screen="question"/);
  assert.match(brainPanel, /data-brain-screen="review"/);
  assert.match(brainPanel, /data-brain-screen="result"/);
  assert.match(brainPanel, /data-brain-screen="answers"/);
  assert.match(brainPanel, /Submit Practice/);
  assert.match(brainPanel, /Review Answers/);
  assert.match(brainPanel, /Practice again/);
  assert.match(brainPanel, /const SWIPE_THRESHOLD = 60;/, "the revision page's swipe threshold");
  assert.match(brainPanel, /export const BRAIN_PASS_SCORE = 60;/);
});

test("text and cards scale with the viewport", () => {
  // Every metric the design fixes in px is written as a scaled calc…
  assert.match(brainPanel, /const S = \(px: number\) => `calc\(\$\{px\}px \* var\(--brain-scale, 1\)\)`;/);
  assert.ok(!/fontSize: \d+/.test(brainPanel), "no raw numeric font size may bypass the scale");
  assert.match(brainPanel, /style=\{\{ fontSize: S\(16\) \}\}/, "the panel root carries the scaled type scale");
  assert.match(brainPanel, /style=\{\{ minHeight: S\(56\), fontSize: S\(15\), padding: `\$\{S\(12\)\} \$\{S\(16\)\}` \}\}/, "the answer tile");
  // …and the ladder itself lives in the one global stylesheet.
  assert.match(indexCss, /\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1;/);
  assert.match(indexCss, /@media \(min-width: 560px\) \{\s*\n\s*\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1\.08;/);
  assert.match(indexCss, /@media \(min-width: 820px\) \{\s*\n\s*\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1\.16;/);
  assert.match(indexCss, /@media \(min-width: 1200px\) \{\s*\n\s*\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1\.24;/);
  assert.match(indexCss, /@media \(max-height: 460px\) \{\s*\n\s*\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1;/);
});

test("the Brain tab hosts the panel and keeps the placeholder as a fallback", () => {
  assert.match(overlay, /brainPanel\?: ReactNode;/);
  assert.match(overlay, /brainPanel \?\? \(\s*\n\s*<ComingSoonPanel/);
  assert.match(overlay, /brainPanel=\{props\.brainPanel\}/);
  assert.match(playerApp, /brainPanel=\{[\s\S]{0,400}?<CourseBrainPanel/);
});

test("a brain resource is visible and reachable without a URL", () => {
  assert.match(overlay, /const isBrainFile = \(file: CourseFile\) => file\.type === "brain" && \(file\.practiceQuestions\?\.length \?\? 0\) > 0;/);
  assert.match(overlay, /\(isBrainFile\(file\) \|\| Boolean\(file\.url \|\| file\.embedUrl \|\| file\.youtubeUrl \|\| file\.youtubeVideoId\)\)/);
  assert.match(overlay, /if \(file\.type === "brain"\) return Brain;/);
  assert.match(overlay, /subtitle: isBrainFile\(file\) \? `\$\{file\.practiceQuestions\?\.length \?\? 0\} practice questions` : file\.type,/);
});

test("selecting a brain resource opens the Brain tab instead of the viewer stack", () => {
  assert.match(playerApp, /if \(file\.type === "brain"\) \{\s*\n\s*userSelectedRef\.current = true;\s*\n\s*openBrainSet\(file\.id\);\s*\n\s*return;\s*\n\s*\}/);
  assert.match(playerApp, /const openBrainSet = useCallback\(\(setId: string\) => \{\s*\n\s*setBrainOpenSetId\(setId\);\s*\n\s*setDockTab\("brain"\);\s*\n\s*splitDeckRef\.current\?\.activateStudy\(\);\s*\n\s*\}, \[\]\);/);
  // Resume and deep links take the same road (never a URL-less file to the viewer).
  assert.match(playerApp, /if \(match\.type === "brain"\) \{/);
  assert.match(playerApp, /if \(first\?\.type === "brain"\) \{/);
  // `files` — the viewer stack — still requires a real URL, so the brain set
  // can never be handed to ResourceViewer through it.
  assert.match(playerApp, /const files = useMemo\(\(\) => allFiles\(modules\)\.filter\(\(file\) => file\.accessLevel !== "hidden" && Boolean\(file\.url \|\| file\.embedUrl \|\| file\.youtubeUrl \|\| file\.youtubeVideoId\)\), \[modules\]\);/);
});

test("passing a set marks its resource complete exactly once and stays inside the progress maths", () => {
  assert.match(playerApp, /const markFileComplete = useCallback\(async \(fileId: string\) => \{/);
  assert.match(playerApp, /completedFileIds: arrayUnion\(fileId\)/);
  assert.match(brainPanel, /if \(score >= BRAIN_PASS_SCORE && scoredRef\.current !== passKey\)/, "a pass is scored once per attempt, not per render");
  assert.match(brainPanel, /onPass\?\.\(activeSet\.id, score\);/);
  // The denominator includes the brain sets the learner can actually complete,
  // and the bar is clamped so progress can never exceed 100%.
  assert.match(playerApp, /const brainFiles = brainSets\.map\(\(set\) => \(\{ id: set\.id \}\) as CourseFile\);/);
  assert.match(playerApp, /return \[\.\.\.eligible, \.\.\.brainFiles\];/);
  assert.match(playerApp, /Math\.min\(100, Math\.round\(\(completedIds\.size \/ totalEligibleFiles\.length\) \* 100\)\)/);
});

test("practice history is per device and never touches the revision bank", () => {
  assert.match(brainPanel, /const scoreKey = \(productId: string\) => `dc:courseBrain:\$\{productId\}`;/);
  assert.match(brainPanel, /best: Math\.max\(score, scores\[activeSet\.id\]\?\.best \?\? 0\)/);
  assert.doesNotMatch(brainPanel, /from "\.\.\/revision\/engine\//, "practice sets never write to the revision Test Bank");
});

// ---------------------------------------------------------------------------
// 6. Course data + the footer dock default
// ---------------------------------------------------------------------------

test("the course types describe the brain payload the player reads", () => {
  assert.match(courseTypes, /\| "brain";/);
  assert.match(courseTypes, /export interface CoursePracticeQuestion \{/);
  assert.match(courseTypes, /practiceQuestions\?: CoursePracticeQuestion\[\];/);
  assert.match(courseTypes, /practiceTitle\?: string;/);
  assert.match(practiceSet, /export const MAX_PRACTICE_QUESTIONS = 100;/);
  assert.match(practiceSet, /export const collectBrainPracticeSets = \(modules, unlockedModuleIds\) => \{/);
});

test("the demo course ships a real Brain practice set", () => {
  assert.match(demo, /id: "mod-brain"/);
  assert.match(demo, /id: "file-brain-1"/);
  assert.match(demo, /type: "brain"/);
  assert.match(demo, /practiceQuestions: \[/);
  assert.match(demo, /practiceTitle: "Algebra Warm-up"/);
  assert.match(demo, /\{ type: "brain", module: "Brain — Practice Sets", price: "₹129", coins: 129 \}/);
});

test("Always-visible footer dock defaults ON, still remembered per device", () => {
  assert.match(playerApp, /return localStorage\.getItem\(legacyFooterDockStorageKey\) !== "0";/);
  assert.match(playerApp, /catch \{\s*\n\s*return true;\s*\n\s*\}/);
  assert.match(playerApp, /DEFAULT IS ON/);
  assert.match(playerPanel, /`legacyFooterDock` = ON \(the DEFAULT\)/);
  // The peek dock is now the opt-out, never the default.
  assert.match(playerApp, /peekDock=\{!legacyFooterDock\}/);
});

// ---------------------------------------------------------------------------
// 7. The Brain tab follows the lesson — per-module practice
// ---------------------------------------------------------------------------

test("the Brain tab follows the module of the lesson being watched", () => {
  // The player hands the panel the module of the ACTIVE file (same source the
  // mind map uses), so "practice for what I am watching" is the default view.
  assert.match(playerApp, /const activeBrainModuleId = selectedFile \? moduleIdByFileId\[String\(selectedFile\.id\)\] \?\? null : null;/);
  assert.match(playerApp, /activeModuleId=\{activeBrainModuleId\}/);
  assert.match(brainPanel, /activeModuleId\?: string \| null;/);
  // A module with no practice of its own shows that module's empty state (plus
  // the way out) — never another module's questions.
  assert.match(brainPanel, /const target = moduleOverride === ALL_MODULES \? null : moduleOverride \?\? activeModuleId;/);
  assert.match(brainPanel, /return sets\.filter\(\(set\) => set\.moduleId === target\);/);
  assert.match(brainPanel, /No practice sets in this module yet\./);
  assert.match(brainPanel, /Show all practice sets/);
  // Switching lessons re-scopes the tab and closes a half-played set.
  assert.match(brainPanel, /\}, \[activeModuleId\]\);/);
  assert.match(brainPanel, /setModuleOverride\(null\);/);
  // The chip row is how a learner moves between modules' practice by hand.
  assert.match(brainPanel, /data-brain-module-row/);
  assert.match(brainPanel, /data-brain-module-chip=/);
  assert.match(brainPanel, /label="All modules"/);
});

test("a Brain resource is reachable from the Modules list, resume and a deep link", () => {
  // Tapping the row opens the set on the Brain tab (never the viewer stack).
  assert.match(playerApp, /if \(file\.type === "brain"\) \{\s*\n\s*userSelectedRef\.current = true;\s*\n\s*openBrainSet\(file\.id\);/);
  assert.match(playerApp, /const openBrainSet = useCallback\(\(setId: string\) => \{\s*\n\s*setBrainOpenSetId\(setId\);\s*\n\s*setDockTab\("brain"\);/);
  // Resume: the last opened file being a practice set reopens its practice.
  assert.match(playerApp, /if \(match\.type === "brain"\) \{/);
  assert.match(playerApp, /resumedBrainSetRef\.current !== match\.id/);
  // Deep link: a module whose only content is a practice set still resolves.
  assert.match(playerApp, /const firstBrainFileInModule = \(/);
  assert.match(playerApp, /return firstBrainFileInModule\(target, resolution\.accessibleModuleIds\)\?\.id \?\? null;/);
  assert.match(playerApp, /const deepBrain = deepLinkFileId \? brainSets\.find\(\(set\) => set\.id === deepLinkFileId\) : null;/);
  // The Brain tab is a real dock tab in every list (dock, peek dock, keys).
  assert.match(overlay, /\{ key: "brain", label: "Brain", heading: "Brain", hint: "Practice sets — apna Brain test"/);
  assert.match(overlay, /brainPanel \?\? \(/);
});

test("the Brain surface survives an unknown resource type in the AI reader", () => {
  // The Lumen reader types its own resource domain; a type it has no icon for
  // must draw a stage instead of crashing on an undefined component.
  const lumenPlayer = read("src/lumen/components/CoursePlayer.tsx");
  assert.match(lumenPlayer, /const Icon = ICONS\[type\] \?\? SquareCode;/);
});
