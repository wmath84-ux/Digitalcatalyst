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
//   5. the player surface: the panel, its wiring, and THE QUESTION CARD as the
//      owner's reference deck (https://aicanvas.me/components/product-card-deck)
//      — the reference's stack geometry, drag-tilt, flick thresholds and
//      fly-off, ANY-direction swipe, the answer-tap flow with no buttons on the
//      card at all, the round `3/10` counter in its top-right corner, the
//      no-glass palette, and the scaling language that keeps it readable in
//      whatever box the Split Deck gives the study pane;
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

/**
 * The source with its comments removed. A file's header is allowed to say what
 * the code deliberately does NOT do ("no Previous / Next / Skip button", "the
 * glass is gone"), so the negative assertions below read the code, not the prose.
 */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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
const brainDeck = read("src/course/BrainQuestionDeck.tsx");
const brainCards = read("src/course/BrainCards.tsx");
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
  // `brain` joins RESOURCE_TYPES (it is no longer the last entry: the
  // Interactive 2D experiment is its URL-less sibling — see
  // tests/adminInteractiveExperimentsContract.test.mjs).
  assert.match(editor, /"iframe",\s*\n\s*"brain",/, "brain joins RESOURCE_TYPES");
  assert.match(editor, /brain: "Brain · practice set"/);
  assert.match(editor, /if \(type === "brain"\) return "Brain";/);
  assert.match(adminTypes, /\| "brain"/, "the editor's ProductResource type knows brain");
  assert.match(adminTypes, /export type ProductPracticeQuestion = \{/);
  assert.match(adminTypes, /practiceQuestions\?: ProductPracticeQuestion\[\];/);
});

test("picking Brain swaps the URL fields for the importer", () => {
  assert.match(editor, /import PracticeSetImportPanel from "@\/components\/admin\/products\/PracticeSetImportPanel";/);
  assert.match(editor, /const isBrain = resource\.type === "brain";/);
  assert.match(editor, /\{isBrain \? \(\s*\n\s*<PracticeSetImportPanel/);
  assert.match(editor, /practiceTitle: title \|\| undefined,/);
  // The URL-only publish rule must not fire for a type that has no URL. The
  // Interactive 2D experiment is the second such type, so both conditions name
  // it next to Brain (Brain's own behaviour is unchanged).
  assert.match(editor, /\{!cleanUrl && !isBrain && !isExperiment \? \(/);
  assert.match(editor, /\{!isBrain && \(!isExperiment \|\| cleanUrl\) \? \(\s*\n\s*<SecondaryButton/);
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
// 5. Player — the Brain question card IS the reference Product Card Deck
// ---------------------------------------------------------------------------
//
// Owner brief, 2026-10-03:
//
//   "Course Player ke andar Mind/Brain page par jo Test/MCQ cards hain, unka
//    current design completely replace karo. Is reference design ko exactly
//    follow karo: https://aicanvas.me/components/product-card-deck … Glass
//    design bilkul use nahi karna hai … user jis option per click kare vahi
//    submit ho jaaye aur card out ho slide hokar next per jaaye … user kisi
//    bhi direction mein swipe kar sake … top-right corner mein ek small
//    circular box add karo jismein current question ka count show ho."
//
// The revision test-taking design the Brain page used to copy is gone from the
// question screen. These tests pin the reference's mechanics instead — the
// ones the owner asked to be followed "exactly" — so a later edit cannot
// quietly turn the deck back into a form.

test("the Brain question card is the reference deck, mechanically", () => {
  // The reference's own source, line for line: four slots at a straight stack,
  // each card owning its own motion values, the drag-tilt capped at ±18°, the
  // 300/30 slot spring.
  assert.match(brainDeck, /const VISIBLE = 4;/);
  assert.match(brainDeck, /const SLOT_Y = \[0, 12, 24, 36\];/);
  assert.match(brainDeck, /const SLOT_SCALE = \[1, 0\.95, 0\.9, 0\.86\];/);
  assert.match(brainDeck, /const SLOT_OPACITY = \[1, 1, 0\.92, 0\.82\];/);
  assert.match(brainDeck, /const SPRING = \{ type: "spring", stiffness: 300, damping: 30 \} as const;/);
  assert.match(brainDeck, /zIndex: 100 - slot,/);
  assert.match(brainDeck, /const rotate = useTransform\(x, \[-200, 200\], \[-18, 18\], \{ clamp: true \}\);/);
  assert.match(brainDeck, /const x = useMotionValue\(0\);/);
  assert.match(brainDeck, /const y = useMotionValue\(SLOT_Y\[safeSlot\]\);/);
  assert.match(brainDeck, /const scale = useMotionValue\(SLOT_SCALE\[safeSlot\]\);/);
  assert.match(brainDeck, /const opacity = useMotionValue\(0\);/);
  assert.match(brainDeck, /animate\(y, SLOT_Y\[safeSlot\], SPRING\)/);
  assert.match(brainDeck, /animate\(scale, SLOT_SCALE\[safeSlot\], SPRING\)/);
  assert.match(brainDeck, /if \(!isTop\) controls\.push\(animate\(x, 0, SPRING\)\);/);
  // The reference's flick test and its slow-but-far fallback.
  assert.match(brainDeck, /const FLICK_SPEED = 500;/);
  assert.match(brainDeck, /const FLICK_DISTANCE = 130;/);
  assert.match(brainDeck, /if \(speed > FLICK_SPEED \|\| distance > FLICK_DISTANCE\) \{/);
  assert.match(brainDeck, /speed > SLOW_FLICK_SPEED \? \{ x: info\.velocity\.x, y: info\.velocity\.y \} : \{ x: info\.offset\.x \* 9, y: info\.offset\.y \* 9 \}/);
  // …a weak drag springs back into the top slot, never costing a question.
  assert.match(brainDeck, /animate\(x, 0, SPRING\);\s*\n\s*animate\(y, SLOT_Y\[0\], SPRING\);/);
  // …and a flick flies off along the release velocity: normalized × 1500,
  // fading over 0.45 s, shrinking to 0.85 over 0.5 s, then `safeToRemove`.
  assert.match(brainDeck, /const FLY_DISTANCE = 1500;/);
  assert.match(brainDeck, /animate\(x, \(velocity\.x \/ magnitude\) \* FLY_DISTANCE, \{ duration: 0\.5, ease: "easeOut" \}\)/);
  assert.match(brainDeck, /animate\(y, \(velocity\.y \/ magnitude\) \* FLY_DISTANCE, \{ duration: 0\.5, ease: "easeOut" \}\)/);
  assert.match(brainDeck, /animate\(opacity, 0, \{ duration: 0\.45, ease: "easeOut" \}\)/);
  assert.match(brainDeck, /animate\(scale, 0\.85, \{/);
  assert.match(brainDeck, /usePresence\(\)/);
  assert.match(brainDeck, /<AnimatePresence>/);
  // The top card is FREE to drag — no axis, no constraints, touch-action none —
  // which is what makes left / right / up / down / diagonal swipes all work.
  assert.match(brainDeck, /drag=\{isTop\}/);
  assert.doesNotMatch(brainDeck, /dragConstraints|drag="x"|drag="y"/, "the card is never locked to one direction");
  // (`pan-y` only on a card whose content is taller than any card can be, where
  // the pane's own scroll gesture is the only way to reach the last answers.)
  assert.match(brainDeck, /touchAction: isTop \? \(scrolls \? "pan-y" : "none"\) : "auto",/);
  assert.match(brainDeck, /pointerEvents: isTop \? "auto" : "none",/);
});

test("a practice card has no buttons: answers answer, a swipe skips", () => {
  // Nothing on the card navigates it. (The result screen still offers Review
  // Answers / Practice again / All practice sets — those are not on the card.)
  for (const banned of ["Previous", "Next", "Skip this question", "Review & Submit"]) {
    assert.ok(!code(brainDeck).includes(banned), `the deck must not carry a "${banned}" button`);
    assert.ok(!code(brainPanel).includes(banned), `the Brain panel must not carry a "${banned}" button`);
  }
  // The card carries exactly three things: the question, its answers, the count.
  assert.match(brainDeck, /data-brain-card-prompt=""/);
  assert.match(brainDeck, /data-brain-options=""/);
  assert.match(brainDeck, /data-brain-option=\{optionIndex\}/);
  assert.match(brainDeck, /<BrainCounter/);
  // Tapping an answer RECORDS it first, then the card flicks itself away — the
  // owner's flow: option click → answer saved → card slides out → next card.
  assert.match(
    brainDeck,
    /onAnswer\(item\.index, optionIndex\);\s*\n\s*holdTimer\.current = window\.setTimeout\(\(\) => flick\(ANSWER_FLICK\), ANSWER_HOLD_MS\);/,
  );
  assert.match(brainDeck, /const ANSWER_FLICK = \{ x: -1, y: 0 \};/);
  assert.match(brainDeck, /const ANSWER_HOLD_MS = 260;/);
  // Only the top card answers, and only once: the card that is leaving cannot
  // record a second answer.
  assert.match(brainDeck, /if \(!isTop \|\| flying\.current \|\| picked !== null\) return;/);
  // A card DRAG over an answer can never answer it — the pointer has to come
  // back up on the same spot to count (which is how swipe-any-direction and
  // tap-an-answer live on the same surface).
  assert.match(brainDeck, /if \(Math\.hypot\(event\.clientX - press\.x, event\.clientY - press\.y\) > TAP_SLOP\) return;/);
  // The deck DRAINS, and the last card's fly-off hands the practice to the
  // existing review → submit → result flow (no button, no dead end).
  assert.match(brainPanel, /const dismissTopCard = useCallback\(\(\) => \{\s*\n\s*setDeck\(\(previous\) => previous\.slice\(1\)\);/);
  assert.match(brainPanel, /const finishDeck = useCallback\(\(\) => \{\s*\n\s*setMode\("review"\);/);
  assert.match(brainDeck, /if \(lastExit\.current\) onEmpty\(\);/);
  assert.match(brainPanel, /onFlick=\{dismissTopCard\}/);
  assert.match(brainPanel, /onEmpty=\{finishDeck\}/);
  // A question swiped without an answer stays unanswered: only a tapped option
  // is ever written to `selections` (an unanswered one counts as skipped).
  assert.match(brainPanel, /const answerQuestion = useCallback\(\(questionIndex: number, optionIndex: number\) => \{\s*\n\s*setSelections\(\(previous\) => \(\{ \.\.\.previous, \[questionIndex\]: optionIndex \}\)\);/);
  assert.match(brainDeck, /data-brain-deck-hint=""/);
});

test("the question count is a small round box in the card's top-right corner", () => {
  // "MCQ card ke top-right corner mein ek small circular box add karo. Ismein
  //  current question ka count show ho. Example: 1/10, 2/10, 3/10."
  assert.match(brainCards, /export function BrainCounter\(/);
  assert.match(brainCards, /borderRadius: 9999,/);
  assert.match(brainCards, /\{value\}\/\{total\}/);
  assert.match(brainCards, /fontVariantNumeric: "tabular-nums"/);
  assert.match(brainCards, /aria-label=\{`Question \$\{value\} of \$\{total\}`\}/);
  assert.match(brainDeck, /<BrainCounter\s*\n\s*value=\{ordinal\}\s*\n\s*total=\{total\}\s*\n\s*size=\{unitNum\(44\) \* fit\}/);
  assert.match(brainDeck, /style=\{\{ position: "absolute", top: unit\(14 \* fit\), right: unit\(14 \* fit\) \}\}/);
  // It is measured in the SAME scale as the text it sits above, so it stays a
  // small clean circle on a card that had to be fitted into a short pane.
  assert.match(brainDeck, /const unitNum = \(px: number\) => px \* scale;/);
  // The question reserves exactly that corner, so the count never sits on the
  // words the learner is reading.
  assert.match(brainDeck, /paddingRight: unit\(48\),/);
  // The count is the CURRENT question of the SET: 1/10, 2/10, 3/10 …
  assert.match(brainDeck, /ordinal=\{item\.index \+ 1\}/);
  assert.match(brainDeck, /total=\{total\}/);
});

test("the Brain practice flow is solid — the glass design is gone from it", () => {
  // "Glass design bilkul use nahi karna hai" — none of the revision page's
  // glass materials may survive in the Brain tab's own surfaces.
  const banned = ["GlassSurface", "GlassTile", "GlassButton", "backdrop", "dc-scene-plate", "dc-rev-glass", "dc-tile", "[aria-hidden]:nth-of-type"];
  for (const [name, source] of [["panel", brainPanel], ["deck", brainDeck], ["cards", brainCards]]) {
    for (const token of banned) {
      assert.ok(!code(source).includes(token), `the Brain ${name} must not carry glass (${token})`);
    }
  }
  // …and what paints it instead is the reference's own palette, verbatim:
  // the #D3DDEE card, the #111111 ink, the #141312 / #F5F1E8 pill, the two
  // shadows and the 22 px radius.
  assert.match(brainCards, /card: "#D3DDEE"/);
  assert.match(brainCards, /ink: "#111111"/);
  assert.match(brainCards, /pill: "#141312"/);
  assert.match(brainCards, /pillHover: "#2C2825"/);
  assert.match(brainCards, /pillPress: "#000000"/);
  assert.match(brainCards, /pillInk: "#F5F1E8"/);
  assert.match(brainCards, /shadowTop: "0 30px 60px rgba\(0,0,0,0\.30\), 0 10px 20px rgba\(0,0,0,0\.20\)"/);
  assert.match(brainCards, /shadowRest: "0 14px 30px rgba\(0,0,0,0\.18\)"/);
  assert.match(brainCards, /radius: 22/);
  // The reference card's own paint: heavier shadow on the TOP card only.
  assert.match(brainDeck, /boxShadow: isTop \? BRAIN\.shadowTop : BRAIN\.shadowRest,/);
  // The reference pill's hover / press states, and its stopPropagation rule.
  assert.match(brainCards, /whileHover=\{disabled \? undefined : hover\}/);
  assert.match(brainCards, /whileTap=\{disabled \? undefined : tap\}/);
  assert.match(brainCards, /scale: 1\.06, backgroundColor: BRAIN\.pillHover/);
  assert.match(brainCards, /scale: 0\.93, backgroundColor: BRAIN\.pillPress/);
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
  assert.match(brainPanel, /export const BRAIN_PASS_SCORE = 60;/);
  // The question screen is the deck: the panel hands it the queue, the
  // recorded answers and the two flow callbacks, and owns no button of its own
  // inside the pane below the header row.
  assert.match(
    brainPanel,
    /<BrainQuestionDeck\s*\n\s*items=\{deck\}\s*\n\s*questions=\{questions\}\s*\n\s*total=\{total\}\s*\n\s*selections=\{selections\}\s*\n\s*onAnswer=\{answerQuestion\}\s*\n\s*onFlick=\{dismissTopCard\}\s*\n\s*onEmpty=\{finishDeck\}/,
  );
  // The review grid still jumps back into the deck at any question, so an
  // answer can be changed before submitting.
  assert.match(brainPanel, /data-brain-review-tile=\{index \+ 1\}/);
  assert.match(brainPanel, /onClick=\{\(\) => openDeck\(index\)\}/);
  assert.match(brainPanel, /Tap any question to jump back and change your answer before you submit\./);
  // …and Back resumes at the first question that still has no answer, so a
  // learner returning to finish what they skipped is not sent through the whole
  // set again (the cards they answered have left the deck for good).
  assert.match(brainPanel, /const firstUnanswered = questions\.findIndex\(\(_, index\) => selections\[index\] === undefined\);/);
  assert.match(brainPanel, /openDeck\(firstUnanswered < 0 \? 0 : firstUnanswered\);/);
});

test("the deck scales with its own box, and the panel keeps the S() language", () => {
  // Every metric the panel fixes in px is written as a scaled calc…
  assert.match(brainPanel, /const S = \(px: number\) => `calc\(\$\{px\}px \* var\(--brain-scale, 1\)\)`;/);
  assert.ok(!/fontSize: \d+/.test(brainPanel), "no raw numeric font size may bypass the scale");
  assert.match(brainPanel, /style=\{\{ fontSize: S\(16\) \}\}/, "the panel root carries the scaled type scale");
  // …the deck measures its own box out of the pane…
  assert.match(brainDeck, /const box = useMemo\(\(\) => brainDeckSize\(pane\.width, pane\.height\), \[pane\.width, pane\.height\]\);/);
  assert.match(brainDeck, /new ResizeObserver\(\(\) => setSize\(\{ width: node\.clientWidth, height: node\.clientHeight \}\)\)/);
  // …and derives every card metric from the reference card's own width, so the
  // reference design is the design at 1× and stays proportional at any size.
  assert.match(brainDeck, /const unitScale = width \/ BRAIN_DECK_REFERENCE_WIDTH;/);
  assert.match(brainDeck, /fontSize: unit\(21\),/);
  assert.match(brainDeck, /minHeight: unit\(46\),/);
  // A card whose content is taller than the pane shares the deck's one fit and
  // is never cut off (the fit is a transform; deep overflow scrolls instead).
  assert.match(brainDeck, /const contentFit = tallest > heightCap \? Math\.max\(CONTENT_FLOOR, heightCap \/ tallest\) : 1;/);
  assert.match(brainDeck, /fit={scrolls \? 1 : fit}/);
  // …and the ladder itself lives in the one global stylesheet.
  assert.match(indexCss, /\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1;/);
  assert.match(indexCss, /@media \(min-width: 560px\) \{\s*\n\s*\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1\.08;/);
  assert.match(indexCss, /@media \(min-width: 820px\) \{\s*\n\s*\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1\.16;/);
  assert.match(indexCss, /@media \(min-width: 1200px\) \{\s*\n\s*\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1\.24;/);
  assert.match(indexCss, /@media \(max-height: 460px\) \{\s*\n\s*\[data-course-brain-panel\] \{\s*\n\s*--brain-scale: 1;/);
});

test("the deck has its own dev sandbox, wired like the app's other previews", () => {
  // The card lives inside the player's study pane — the one place that is
  // hardest to reach while designing (sign in, open a course, pick a module,
  // drag the Split Deck divider). `#/dev/brain-deck` mounts the REAL panel with
  // the demo course's real practice set on a box you can size by hand.
  const main = read("src/main.tsx");
  const preview = read("src/components/dev/BrainDeckPreview.tsx");
  assert.match(main, /const BRAIN_DECK_PREVIEW_HASH = "#\/dev\/brain-deck";/);
  assert.match(main, /const BrainDeckPreview = lazyRoute\(\(\) => import\("\.\/components\/dev\/BrainDeckPreview"\)\);/);
  assert.match(main, /if \(hash\.startsWith\(BRAIN_DECK_PREVIEW_HASH\)\) return <BrainDeckPreview \/>;/);
  // …the real panel, the real demo set, no copy of either.
  assert.match(preview, /import CourseBrainPanel from "@\/course\/CourseBrainPanel";/);
  assert.match(preview, /collectBrainPracticeSets\(\s*\n\s*demoCourseContent,/);
  assert.match(preview, /<CourseBrainPanel productId="dev-brain-deck" sets=\{SETS\} \/>/);
  // It is read-only, and it styles nothing of its own.
  assert.match(preview, /never writes Firestore/);
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
