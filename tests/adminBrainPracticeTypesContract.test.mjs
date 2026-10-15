// tests/adminBrainPracticeTypesContract.test.mjs
//
// The Admin Product Builder's Brain Practice Set grows from MCQ-only to the
// full eight-type Brain authoring system (the Course Player creator's own
// editors, CMD, parsers and player), saved through the existing cloud
// product pipeline:
//
//   Product Builder → module resource type "Brain Practice Set"
//     → PracticeSetImportPanel (type selector → typed CMD / typed parser →
//       BrainQuestionEditor cards → BrainTypedPlayer preview)
//     → ProductEditor save normalises → siteProducts (admin-only write)
//     → utils/productMapping.js → Course Player Brain (MASTER side)
//
// …while the learner's own sets stay on their device-local Study Library
// path (utils/selfPracticeSets.js) and never touch the product pipeline.
//
// Sections 1–2 pin the wiring; section 3 drives the real model, mapping and
// Brain collection functions; section 4 drives the real panel in a real DOM
// (esbuild bundle + jsdom), the same harness as
// tests/adminBrainPracticePromptContract.test.mjs.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

import {
  collectBrainPracticeSets,
  countIncompletePracticeQuestions,
  normalizePracticeQuestions,
  practiceQuestionIssues,
  practiceQuestionsExplained,
  practiceQuestionsReady,
} from "../utils/practiceSet.js";
import { editorResourceToFirestore, firestoreResourceToCanonical } from "../utils/productMapping.js";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const panel = read("src/components/admin/products/PracticeSetImportPanel.tsx");
const modulesEditor = read("src/components/admin/products/ModulesResourcesEditor.tsx");
const productEditor = read("src/components/admin/products/ProductEditor.tsx");
const adminTypes = read("src/lib/admin/types.ts");
const adminClient = read("src/lib/admin/client.ts");
const rules = read("firestore.rules");
const registry = read("utils/productResourceTypes.js");

// ---------------------------------------------------------------------------
// 1. The resource option and the panel wiring
// ---------------------------------------------------------------------------

test("the Module Resource Type selector offers Brain Practice Set (value unchanged)", () => {
  assert.match(registry, /value: "brain", label: "Brain Practice Set"/, "the durable value stays \"brain\"; only the label grew");
  assert.match(modulesEditor, /if \(type === "brain"\) return "Brain";/);
  assert.match(modulesEditor, /\{isBrain \? \(\s*\n\s*<PracticeSetImportPanel/);
  // The existing Brain resource keeps its URL-less save: link fields cleared,
  // questions normalised by the one shared normaliser.
  assert.match(productEditor, /if \(resource\.type === "brain"\) \{[\s\S]*?url: ""/);
  assert.match(productEditor, /practiceQuestions: normalizePracticeQuestions\(resource\.practiceQuestions\) as ProductPracticeQuestion\[\]/);
});

test("the admin question record is the canonical eight-type record", () => {
  assert.match(adminTypes, /export type ProductPracticeQuestion = MyCourseQuestion;/);
  assert.match(adminTypes, /practiceQuestions\?: ProductPracticeQuestion\[\];/);
});

test("the panel offers all eight types and builds the type-aware CMD", () => {
  assert.match(panel, /data-practice-type/);
  assert.match(panel, /PRACTICE_QUESTION_TYPE_OPTIONS\.map\(\(option\) => \(/);
  assert.match(panel, /language: aiLanguage,\s*questionType,/);
  assert.match(panel, /practicePromptRulesFor\(questionType\)/, "the rule pills follow the selected type");
  // Both parsers, dispatched exactly like the learner composer's Parse.
  assert.match(panel, /import \{ parsePracticeImport, parseTypedPracticeImport \} from "@\/utils\/practiceImport";/);
  assert.match(panel, /parseTypedPracticeImport\(paste, questionType\)/);
  // Hand-added questions start as the selected type's empty shape.
  assert.match(panel, /selfPracticeEmptyQuestionOfType\(questionType, questions\.length\)/);
});

test("questions are edited in the shared type-specific editor and previewed in the real player", () => {
  assert.match(panel, /import BrainQuestionEditor from "@\/course\/BrainQuestionEditor";/);
  assert.match(panel, /<BrainQuestionEditor/);
  assert.match(panel, /import BrainTypedPlayer from "@\/course\/BrainTypedPlayer";/);
  assert.match(panel, /<BrainTypedPlayer/);
  assert.match(panel, /data-practice-preview-toggle/, "the learner preview is one tap away");
  assert.match(panel, /onUploadImage=\{onUploadImage\}/, "diagram/hotspot image upload reaches the editors");
  // Resources edits REPLACE on a type switch (never a silent field carry-over).
  assert.match(panel, /onReplace=\{\(next\) => replaceQuestion\(index, next\)\}/);
});

test("the resource card hands the panel raw drafts and the admin image pipeline", () => {
  // Normalising on the way IN would drop a blank/half-written question
  // before the admin could type into it — the panel owns drafts as typed.
  assert.match(modulesEditor, /questions=\{resource\.practiceQuestions \?\? \[\]\}/);
  assert.doesNotMatch(modulesEditor, /questions=\{brainQuestions\}/);
  // Diagram/hotspot images: Cloudinary (the admin convention), URL stored in
  // the question; unconfigured → the editors' URL field only.
  assert.match(modulesEditor, /async function uploadBrainPracticeImage\(file: File\): Promise<string>/);
  assert.match(modulesEditor, /uploadImageToCloudinary\(file, \{ folder: "brain-practice", tags: \["brain", "practice-set"\] \}\)/);
  assert.match(modulesEditor, /onUploadImage=\{isCloudinaryImageUploadConfigured\(\) \? uploadBrainPracticeImage : undefined\}/);
  assert.doesNotMatch(panel, /base64|data:image/, "no base64 images are ever written into the product document");
});

test("admin cloud persistence stays admin-only and separate from the learner's local sets", () => {
  // The canonical cloud write path: the whole product document in
  // siteProducts, writable by admins only.
  assert.match(adminClient, /doc\(db, "siteProducts", String\(body\.id \|\| id\(\)\)\)/);
  assert.match(rules, /match \/siteProducts\/\{productId\} \{\s*allow read: if true;\s*allow write: if isAdmin\(\);/);
  // The admin panel never touches the learner persistence path (and vice
  // versa, the learner shelf is a different storage: users/{uid}/myCourses).
  assert.doesNotMatch(panel, /myCourseClient|placeSelfPracticeSet|saveSelfPracticeSet|SELF_PRACTICE_SETS_COURSE/);
  assert.doesNotMatch(modulesEditor, /myCourseClient|selfPracticeSetsFromCourses/);
});

// ---------------------------------------------------------------------------
// 2. The publish gate reads every type through the one shared rule
// ---------------------------------------------------------------------------

const MATCH_SET = [
  {
    id: "q1",
    questionType: "match",
    prompt: "Match the organ to its function.",
    options: [],
    correctIndex: -1,
    explanation: "Each organ has one primary job.",
    difficulty: "medium",
    topic: "Human body",
    matchPairs: [
      { left: "Heart", right: "Pumps blood" },
      { left: "Lungs", right: "Exchange gases" },
    ],
  },
];

test("typed sets pass the same readiness and explanation gates as MCQ sets", () => {
  assert.equal(practiceQuestionsReady(MATCH_SET), true);
  assert.equal(practiceQuestionsExplained(MATCH_SET), true);
  assert.equal(countIncompletePracticeQuestions(MATCH_SET), 0);
  // The explanation is never optional, whatever the type.
  assert.equal(practiceQuestionsExplained([{ ...MATCH_SET[0], explanation: " " }]), false);
  assert.deepEqual(practiceQuestionIssues({ ...MATCH_SET[0], explanation: "" }), ["no explanation"]);
  // A hotspot with no image or no marked region is not playable, let alone publishable.
  const hotspot = {
    id: "q1",
    questionType: "hotspot",
    prompt: "Tap the heart.",
    options: [],
    correctIndex: -1,
    explanation: "It sits left of centre.",
    difficulty: "easy",
    topic: "",
    imageUrl: "",
    hotspots: [{ id: "s1", x: 50, y: 40, r: 10 }],
    correctHotspotIds: ["s1"],
  };
  assert.equal(practiceQuestionsReady([hotspot]), false);
  assert.ok(practiceQuestionIssues(hotspot).includes("image missing"));
});

test("legacy MCQ records keep loading as MCQs; unknown types are named, never converted", () => {
  const legacy = normalizePracticeQuestions([
    { id: "q1", prompt: "2 + 2?", options: ["3", "4"], correctIndex: 1, explanation: "4.", difficulty: "easy", topic: "" },
  ]);
  assert.equal(legacy[0].questionType, "mcq");
  const unknown = normalizePracticeQuestions([
    { id: "q1", questionType: "essay", prompt: "Discuss.", options: [], correctIndex: -1, explanation: "x", difficulty: "easy", topic: "" },
  ]);
  assert.equal(unknown[0].questionType, "essay", "the record survives untouched");
  assert.deepEqual(practiceQuestionIssues(unknown[0]), ["unsupported question type"]);
});

// ---------------------------------------------------------------------------
// 3. Cloud round-trip and Brain discovery (the real mapping + collection)
// ---------------------------------------------------------------------------

const LABEL_SET = [
  {
    id: "q1",
    questionType: "label_diagram",
    prompt: "Label the parts of a plant cell.",
    options: [],
    correctIndex: -1,
    explanation: "The nucleus controls the cell.",
    difficulty: "medium",
    topic: "Cells",
    imageUrl: "https://res.cloudinary.com/demo/brain-practice/cell.png",
    labelTargets: [
      { id: "t1", x: 50, y: 30, label: "Nucleus" },
      { id: "t2", x: 25, y: 65, label: "Cell wall" },
    ],
    labelOptions: ["Nucleus", "Cell wall"],
  },
  ...MATCH_SET,
];

test("a typed set survives editor → Firestore shape → player file unchanged", () => {
  const resource = {
    id: "res1",
    name: "Cell practice",
    type: "brain",
    url: "",
    practiceTitle: "Cells & organs",
    practiceQuestions: LABEL_SET,
  };
  const stored = editorResourceToFirestore(resource);
  const storedQuestion = stored.practiceQuestions.find((question) => question.questionType === "label_diagram");
  assert.equal(storedQuestion.imageUrl, "https://res.cloudinary.com/demo/brain-practice/cell.png", "the asset reference is the stored URL");
  assert.deepEqual(storedQuestion.labelTargets, LABEL_SET[0].labelTargets, "relative % coordinates survive serialisation");
  const file = firestoreResourceToCanonical(stored);
  assert.equal(file.practiceTitle, "Cells & organs");
  assert.deepEqual(
    file.practiceQuestions.map((question) => question.questionType),
    ["label_diagram", "match"],
    "each question keeps its OWN type through the cloud round-trip",
  );
  // Re-normalising a saved set is a no-op — editing and re-saving can never
  // churn ids, order or answers into a duplicate-looking resource.
  assert.deepEqual(normalizePracticeQuestions(file.practiceQuestions), file.practiceQuestions);
});

const brainFile = (id, title, questions, extra = {}) => ({
  id,
  type: "brain",
  name: title,
  practiceTitle: title,
  practiceQuestions: questions,
  ...extra,
});

test("Brain discovery is scoped to the opened product's unlocked modules", () => {
  const productA = [
    { id: "mod-a1", title: "Biology", accessLevel: "included", files: [brainFile("res-a", "Cell practice", LABEL_SET)], modules: [] },
    { id: "mod-a2", title: "Secret", accessLevel: "included", files: [brainFile("res-hidden", "Hidden draft", LABEL_SET)], modules: [] },
  ];
  const productB = [
    { id: "mod-b1", title: "Biology", accessLevel: "included", files: [brainFile("res-b", "Cell practice", LABEL_SET)], modules: [] },
  ];

  const setsA = collectBrainPracticeSets(productA, new Set(["mod-a1"]));
  assert.equal(setsA.length, 1, "the locked module's set is never even built");
  assert.equal(setsA[0].id, "res-a");
  assert.equal(setsA[0].title, "Cell practice", "the resource's own name shows, not the first question");
  assert.equal(setsA[0].moduleId, "mod-a1");
  assert.deepEqual(
    setsA[0].questions.map((question) => question.questionType),
    ["label_diagram", "match"],
  );

  const setsB = collectBrainPracticeSets(productB, new Set(["mod-b1"]));
  assert.deepEqual(
    setsB.map((set) => set.id),
    ["res-b"],
    "same module title, same questions — Product B still only ever sees its own resource",
  );

  // A hidden module or a hidden resource never surfaces, even when unlocked.
  const hiddenModule = [{ id: "m", title: "X", accessLevel: "hidden", files: [brainFile("r", "T", MATCH_SET)], modules: [] }];
  assert.equal(collectBrainPracticeSets(hiddenModule, new Set(["m"])).length, 0);
  const hiddenFile = [
    { id: "m", title: "X", accessLevel: "included", files: [brainFile("r", "T", MATCH_SET, { accessLevel: "hidden" })], modules: [] },
  ];
  assert.equal(collectBrainPracticeSets(hiddenFile, new Set(["m"])).length, 0);
});

// ---------------------------------------------------------------------------
// 4. The real panel in a real DOM
// ---------------------------------------------------------------------------

const CACHE = path.join(ROOT, "node_modules", ".cache", "admin-brain-practice-types");
const FIXTURE = `
import * as React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import PracticeSetImportPanel from ${JSON.stringify(path.join(ROOT, "src/components/admin/products/PracticeSetImportPanel.tsx"))};

export const latest = { questions: [], title: "" };

export function mount(host, props) {
  const root = createRoot(host);
  function Harness() {
    const [questions, setQuestions] = React.useState(props.initialQuestions || []);
    const [title, setTitle] = React.useState(props.initialTitle || "");
    return (
      <PracticeSetImportPanel
        questions={questions}
        title={title}
        resourceName={props.resourceName || ""}
        onChange={({ questions: nextQuestions, title: nextTitle }) => {
          latest.questions = nextQuestions;
          latest.title = nextTitle;
          setQuestions(nextQuestions);
          setTitle(nextTitle);
        }}
      />
    );
  }
  act(() => { root.render(<Harness />); });
  return { unmount: () => act(() => root.unmount()) };
}

export { act };
`;

function buildFixture() {
  fs.mkdirSync(CACHE, { recursive: true });
  const entry = path.join(CACHE, "fixture.tsx");
  const out = path.join(CACHE, "fixture.cjs");
  fs.writeFileSync(entry, FIXTURE);
  execFileSync(
    require.resolve("esbuild/bin/esbuild"),
    [
      entry,
      "--bundle",
      "--format=cjs",
      "--platform=node",
      "--jsx=automatic",
      "--target=node20",
      `--tsconfig=${path.join(ROOT, "tsconfig.json")}`,
      `--outfile=${out}`,
      "--log-level=error",
    ],
    { cwd: ROOT, stdio: "pipe" },
  );
  return out;
}

const dom = new JSDOM(`<!doctype html><html><body><div id="host"></div></body></html>`, {
  pretendToBeVisual: true,
  url: "http://localhost/",
});
const { window } = dom;
const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
define("window", window);
define("document", window.document);
define("navigator", window.navigator);
define("HTMLElement", window.HTMLElement);
define("Element", window.Element);
define("Node", window.Node);
define("Event", window.Event);
define("MouseEvent", window.MouseEvent);
define("requestAnimationFrame", window.requestAnimationFrame.bind(window));
define("cancelAnimationFrame", window.cancelAnimationFrame.bind(window));
define("getComputedStyle", window.getComputedStyle.bind(window));
window.HTMLElement.prototype.scrollIntoView = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots = [];
after(() => {
  for (const mounted of mountedRoots) mounted.unmount();
  dom.window.close();
  for (const handle of process._getActiveHandles?.() || []) {
    if (handle?.constructor?.name === "MessagePort") {
      try {
        handle.close();
      } catch {
        /* already closed */
      }
      try {
        handle.unref();
      } catch {
        /* not a Node port */
      }
    }
  }
});

const fixture = require(buildFixture());
const act = fixture.act;

const mountPanel = (props = {}) => {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const mounted = fixture.mount(host, props);
  const entry = { unmount: () => mounted.unmount() };
  mountedRoots.push(entry);
  return { host, unmount: entry.unmount };
};
const q = (host, selector) => host.querySelector(selector);
const click = (element) =>
  act(() => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
const type = (element, value) =>
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, "value").set;
    setter.call(element, value);
    element.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
const choose = (element, value) =>
  act(() => {
    element.value = value;
    element.dispatchEvent(new window.Event("change", { bubbles: true }));
  });

const MATCH_JSON = JSON.stringify({
  questions: [
    {
      questionType: "match",
      prompt: "Match the organ to its function.",
      matchPairs: [
        { left: "Heart", right: "Pumps blood" },
        { left: "Lungs", right: "Exchange gases" },
      ],
      explanation: "Each organ has one primary job.",
      difficulty: "medium",
      topic: "Human body",
    },
    {
      questionType: "one_word",
      prompt: "What is the SI unit of force?",
      acceptedAnswers: ["newton", "N"],
      explanation: "Force is measured in newtons.",
      difficulty: "easy",
      topic: "Force",
    },
  ],
});

test("the type selector drives the CMD, the parser and hand-added questions", async () => {
  const { host, unmount } = mountPanel({ resourceName: "Chapter 1 practice" });

  const typeSelect = q(host, "[data-practice-type]");
  assert.ok(typeSelect, "the question-type selector is on the panel");
  assert.equal(typeSelect.options.length, 8, "all eight question types are offered");

  // Switching to Match rebuilds the CMD as the strict-JSON contract.
  choose(typeSelect, "match");
  assert.match(q(host, "[data-practice-ai-prompt-text]").value, /"questionType": "match"/);

  // The typed JSON imports whole, each question keeping its OWN type.
  type(q(host, "[data-practice-paste]"), MATCH_JSON);
  await act(async () => {});
  assert.match(q(host, "[data-practice-preview]").textContent, /Detected 2 questions · 2 ready/);
  click(q(host, "[data-practice-import]"));
  await act(async () => {});
  assert.equal(fixture.latest.questions.length, 2);
  assert.equal(fixture.latest.questions[0].questionType, "match");
  assert.deepEqual(fixture.latest.questions[0].matchPairs, [
    { left: "Heart", right: "Pumps blood" },
    { left: "Lungs", right: "Exchange gases" },
  ]);
  assert.equal(fixture.latest.questions[1].questionType, "one_word", "a mixed batch is never flattened into the selected type");
  assert.deepEqual(fixture.latest.questions[1].acceptedAnswers, ["newton", "N"]);
  assert.equal(practiceQuestionsReady(fixture.latest.questions), true, "the imported set is playable as-is");
  assert.match(q(host, "[data-practice-question]").textContent, /Ready/);

  // A hand-added question starts as the selected type, in the shared editor.
  click([...host.querySelectorAll("button")].find((button) => /Add question manually/.test(button.textContent)));
  await act(async () => {});
  assert.equal(fixture.latest.questions.length, 3);
  const cards = host.querySelectorAll("[data-practice-question]");
  assert.equal(cards[2].querySelector("[data-brain-question-editor]").dataset.brainQuestionType, "match");

  // Switching that card to Label the Diagram brings up the image editor —
  // and the missing image is named, never quietly accepted.
  choose(cards[2].querySelector("[data-brain-question-type-select]"), "label_diagram");
  await act(async () => {});
  assert.ok(cards[2].querySelector("[data-brain-editor-image-url]"), "the diagram image field is on the card");
  assert.match(cards[2].textContent, /diagram image missing/);
  assert.match(q(host, "[data-practice-set-panel]").textContent, /things left to fix/);

  unmount();
});

test("an invalid typed question imports as a flagged draft, never a silent success", async () => {
  const { host, unmount } = mountPanel({ resourceName: "Chapter 2 practice" });
  choose(q(host, "[data-practice-type]"), "hotspot");
  const broken = JSON.stringify({
    questions: [
      {
        questionType: "hotspot",
        prompt: "Tap the heart.",
        hotspots: [{ id: "s1", x: 50, y: 40, r: 10 }],
        correctHotspotIds: ["s1"],
        explanation: "It sits left of centre.",
      },
    ],
  });
  type(q(host, "[data-practice-paste]"), broken);
  await act(async () => {});
  assert.match(q(host, "[data-practice-paste-errors]").textContent, /image missing/, "the parse names what is wrong");
  click(q(host, "[data-practice-import]"));
  await act(async () => {});
  assert.equal(fixture.latest.questions.length, 1, "the draft is kept for fixing, not dropped");
  assert.equal(fixture.latest.questions[0].questionType, "hotspot");
  assert.equal(practiceQuestionsReady(fixture.latest.questions), false, "…and it can never pass as publishable");
  assert.match(q(host, "[data-practice-question]").textContent, /image missing/);
  unmount();
});

test("unsupported types in a paste are reported, not converted into MCQs", async () => {
  const { host, unmount } = mountPanel({ resourceName: "Chapter 3 practice" });
  const foreign = JSON.stringify({
    questions: [{ questionType: "essay", prompt: "Discuss photosynthesis.", explanation: "…" }],
  });
  type(q(host, "[data-practice-paste]"), foreign);
  await act(async () => {});
  assert.match(q(host, "[data-practice-paste-errors]").textContent, /unsupported question type "essay"/);
  unmount();
});
