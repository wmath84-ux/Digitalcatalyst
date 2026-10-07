// tests/adminBrainPracticePromptContract.test.mjs
//
// Owner brief (2026-10-07), the admin Product Builder's "Brain · practice set"
// resource:
//
//   "… vahan per ek ai cmd bhi add karo jisse admin directly copy paste karke
//    questions generate karva sake aur cmd me clear format likha ho ki kaise AI
//    ko likhna hai … aur CMD mein topic aur class placeholder banana taki user
//    edit kar sake samajh sake … explanation ko optional mat rakhna."
//
// Two promises are pinned here:
//
//   1. the CMD (`src/utils/practicePrompt.ts`) asks the AI for questions in the
//      EXACT plain-text shape the importer parses, with the topic and class
//      written as editable placeholders and the "Explanation:" line demanded on
//      every question — and the example inside the CMD is fed through the real
//      parser below, so the shape the AI is told to copy is proven importable;
//   2. an explanation is never optional: the shared per-question rule names it,
//      the publish rule refuses a set without it, and the panel's Explanation
//      field is marked required. The PLAYER's own rule stays lenient on purpose,
//      so a set published before this rule keeps playing.
//
// The last test drives the real panel in a real DOM (esbuild bundle + jsdom):
// typing a topic and a class rewrites the CMD, the copy button copies it, the
// box is editable, and a hand-added question is flagged "no explanation".

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { JSDOM } from "jsdom";

import {
  PRACTICE_PROMPT_DEFAULT_COUNT,
  PRACTICE_PROMPT_EXAMPLE,
  PRACTICE_PROMPT_LANGUAGES,
  PRACTICE_PROMPT_LEVELS,
  PRACTICE_PROMPT_LEVEL_PLACEHOLDER,
  PRACTICE_PROMPT_RULES,
  PRACTICE_PROMPT_TOPIC_PLACEHOLDER,
  buildPracticeAiPrompt,
} from "../src/utils/practicePrompt.ts";
import { parseQuestionText } from "../src/revision/engine/bulkParser.ts";
import {
  MAX_PRACTICE_QUESTIONS,
  countIncompletePracticeQuestions,
  practiceQuestionIssues,
  practiceQuestionsExplained,
  practiceQuestionsReady,
} from "../utils/practiceSet.js";

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const panel = read("src/components/admin/products/PracticeSetImportPanel.tsx");
const modulesEditor = read("src/components/admin/products/ModulesResourcesEditor.tsx");
const productEditor = read("src/components/admin/products/ProductEditor.tsx");
const mapping = read("utils/productMapping.js");

// ---------------------------------------------------------------------------
// 1. The CMD
// ---------------------------------------------------------------------------

test("the CMD carries the topic and class the admin typed, and every format rule", () => {
  const prompt = buildPracticeAiPrompt({
    topic: "Photosynthesis",
    level: "Class 10 (CBSE)",
    count: 12,
    language: "Hinglish",
  });

  // The two slots the owner asked for, filled from the panel's own fields.
  assert.match(prompt, /CLASS \/ LEVEL: Class 10 \(CBSE\)/);
  assert.match(prompt, /TOPIC: Photosynthesis/);
  assert.match(prompt, /NUMBER OF QUESTIONS: 12/);
  assert.match(prompt, /LANGUAGE OF THE QUESTIONS: Hinglish/);

  // The format the paste parser reads — letters, the ✓ marker, plain text.
  assert.match(prompt, /Number the questions 1\. 2\. 3\./);
  assert.match(prompt, /lettered A\. B\. C\. D\./);
  assert.match(prompt, /putting ✓ at the END of its line/);
  assert.match(prompt, /Plain text only/);

  // …and the explanation is demanded, not suggested.
  assert.match(prompt, /EXPLANATION — REQUIRED ON EVERY QUESTION \(this is not optional\)/);
  assert.match(prompt, /never skip it/);

  // The example the AI is told to copy is the parser's own fixture, verbatim.
  assert.ok(prompt.includes(PRACTICE_PROMPT_EXAMPLE), "the CMD ships the worked example");
});

test("with nothing typed the CMD still shows the editable topic and class placeholders", () => {
  const prompt = buildPracticeAiPrompt({ topic: "", level: "" });
  assert.ok(prompt.includes(PRACTICE_PROMPT_TOPIC_PLACEHOLDER));
  assert.ok(prompt.includes(PRACTICE_PROMPT_LEVEL_PLACEHOLDER));
  assert.match(prompt, new RegExp(`NUMBER OF QUESTIONS: ${PRACTICE_PROMPT_DEFAULT_COUNT}`));

  // The count is clamped to the set's own ceiling and to "at least one".
  assert.match(buildPracticeAiPrompt({ topic: "x", count: 0 }), new RegExp(`NUMBER OF QUESTIONS: ${PRACTICE_PROMPT_DEFAULT_COUNT}`));
  assert.match(buildPracticeAiPrompt({ topic: "x", count: 5000 }), new RegExp(`NUMBER OF QUESTIONS: ${MAX_PRACTICE_QUESTIONS}`));
});

test("the example inside the CMD imports exactly as written — options, ✓ and explanation", () => {
  const parsed = parseQuestionText(PRACTICE_PROMPT_EXAMPLE);
  assert.equal(parsed.length, 1, "the example is ONE question");
  assert.equal(parsed[0].prompt, "What is 2 + 2?");
  assert.deepEqual(parsed[0].options, ["3", "4", "5", "6"]);
  assert.equal(parsed[0].correctIndex, 1, "the ✓ line marks option B");
  assert.match(parsed[0].explanation, /Adding 2 and 2/);
  assert.equal(parsed[0].detected, true);
});

test("the CMD's rule pills and quick-fill lists match what the format allows", () => {
  assert.ok(PRACTICE_PROMPT_RULES.some((rule) => /Explanation/.test(rule)), "the pills say the explanation is required");
  assert.ok(PRACTICE_PROMPT_LEVELS.includes("Class 9–10") && PRACTICE_PROMPT_LEVELS.includes("JEE / NEET"));
  assert.deepEqual(PRACTICE_PROMPT_LANGUAGES, ["English", "Hinglish", "Hindi"]);
});

// ---------------------------------------------------------------------------
// 2. The explanation is never optional — one rule, two gates
// ---------------------------------------------------------------------------

const question = (overrides = {}) => ({
  id: "q1",
  prompt: "What is 2 + 2?",
  options: ["3", "4", "5", "6"],
  correctIndex: 1,
  explanation: "2 + 2 = 4.",
  difficulty: "medium",
  topic: "",
  ...overrides,
});

test("a question without its explanation is named as incomplete", () => {
  assert.deepEqual(practiceQuestionIssues(question()), []);
  assert.deepEqual(practiceQuestionIssues(question({ explanation: "   " })), ["no explanation"]);
  assert.deepEqual(practiceQuestionIssues(question({ correctIndex: -1, explanation: "" })), ["no answer marked", "no explanation"]);
});

test("the publish rule refuses a set without explanations while the player rule stays lenient", () => {
  const legacy = [question({ id: "q1", explanation: "" }), question({ id: "q2", explanation: "" })];
  assert.equal(practiceQuestionsReady(legacy), true, "a set published before the rule keeps playing in the player");
  assert.equal(practiceQuestionsExplained(legacy), false, "…but it can never pass the admin publish rule");
  assert.equal(practiceQuestionsReady([question({ correctIndex: -1 })]), false, "the player rule still needs a marked answer");
  assert.equal(practiceQuestionsExplained([question()]), true);

  // The mapping layer (what the learner actually receives) reads the lenient rule.
  assert.match(mapping, /if \(isBrainResourceType\(type\)\) return practiceQuestionsReady\(raw && raw\.practiceQuestions\);/);
});

test("the publish counter counts missing explanations and unusable drafts", () => {
  assert.equal(countIncompletePracticeQuestions([question()]), 0);
  assert.equal(countIncompletePracticeQuestions([question(), question({ id: "q2", explanation: "" })]), 1);
  assert.equal(countIncompletePracticeQuestions([question(), question({ id: "q2", explanation: "" }), { prompt: "" }]), 2);
  assert.equal(countIncompletePracticeQuestions([]), 0);
});

test("the admin surfaces all read the same rule", () => {
  // The panel's per-question pill and the publish validation share ONE function.
  assert.match(panel, /import \{[^}]*practiceQuestionIssues[^}]*\} from "\.\.\/\.\.\/\.\.\/\.\.\/utils\/practiceSet\.js";/);
  assert.match(panel, /const questionIssues = \(question: ProductPracticeQuestion\): string\[\] => practiceQuestionIssues\(question\);/);
  assert.match(productEditor, /import \{[^}]*practiceQuestionsExplained[^}]*\} from "\.\.\/\.\.\/\.\.\/\.\.\/utils\/practiceSet\.js";/);
  assert.match(productEditor, /\} else if \(!practiceQuestionsReady\(questions\) \|\| !practiceQuestionsExplained\(questions\)\) \{/);
  assert.match(productEditor, /two options, a marked answer and an explanation\./);
  assert.match(productEditor, /countIncompletePracticeQuestions\(questions\)/);
  // The resource card shows the stricter state, naming what is left to fix.
  assert.match(modulesEditor, /const brainExplained = brainReady && practiceQuestionsExplained\(resource\.practiceQuestions\);/);
  assert.match(modulesEditor, /const brainIncomplete = isBrain \? countIncompletePracticeQuestions\(resource\.practiceQuestions\) : 0;/);
  assert.doesNotMatch(modulesEditor, /· answer missing`/);
});

// ---------------------------------------------------------------------------
// 3. The real panel in a real DOM
// ---------------------------------------------------------------------------

const CACHE = path.join(ROOT, "node_modules", ".cache", "admin-brain-practice-prompt");
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

/* The DOM must exist BEFORE the bundle is required: react-dom captures the
   document/event system when it loads, and jsdom's pretendToBeVisual keeps a
   requestAnimationFrame loop alive until the window is closed. */
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
// jsdom's pretendToBeVisual keeps a requestAnimationFrame loop alive, and
// React's `await act(async …)` creates one MessageChannel per call whose Node
// ports stay ref'd — both would keep `node --test` open forever. Close them.
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
    }
  }
});

/** What the copy button wrote, newest last. */
const clipboard = [];
Object.defineProperty(window.navigator, "clipboard", {
  value: { writeText: async (text) => clipboard.push(String(text)) },
  configurable: true,
});

const fixture = require(buildFixture());
const act = fixture.act;

/** A fresh container per test — one root per host, always unmounted. */
const newHost = () => {
  const element = window.document.createElement("div");
  window.document.body.append(element);
  return element;
};
const mountedRoots = [];
const mountPanel = (props) => {
  const host = newHost();
  const mounted = fixture.mount(host, props);
  let live = true;
  const unmount = () => {
    if (!live) return;
    live = false;
    mounted.unmount();
  };
  const entry = { unmount };
  mountedRoots.push(entry);
  return { host, unmount };
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

const panelText = (host) => q(host, "[data-practice-ai-prompt-text]").value;

test("the admin can copy the CMD, edit it, and every field rewrites it in place", async () => {
  const { host, unmount } = mountPanel({ resourceName: "Chapter 1 practice" });

  // The AI block is the first thing an empty set shows.
  assert.ok(q(host, "[data-practice-ai-prompt]"), "the CMD block is on the panel");
  assert.match(panelText(host), /TOPIC: Chapter 1 practice/, "the resource name seeds the topic slot");
  assert.match(panelText(host), /CLASS \/ LEVEL: <your class \/ level/, "the class slot starts as a placeholder");

  // Typing the two slots the owner asked for rewrites the CMD.
  type(q(host, "[data-practice-ai-topic]"), "Photosynthesis");
  assert.match(panelText(host), /TOPIC: Photosynthesis/);
  click(q(host, '[data-practice-ai-level="Class 9–10"]'));
  assert.match(panelText(host), /CLASS \/ LEVEL: Class 9–10/);
  type(q(host, "[data-practice-ai-count]"), "25");
  assert.match(panelText(host), /NUMBER OF QUESTIONS: 25/);

  // The copy button hands the whole CMD to the clipboard.
  await act(async () => {
    q(host, "[data-practice-ai-copy]").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(clipboard.length, 1);
  assert.match(clipboard[0], /TOPIC: Photosynthesis/);
  assert.match(clipboard[0], /EXPLANATION — REQUIRED ON EVERY QUESTION/);
  assert.ok(q(host, "[data-practice-ai-copy-note]"), "the panel confirms the copy");

  // The box itself is editable, and copying takes the edited text.
  type(q(host, "[data-practice-ai-prompt-text]"), "MY OWN CMD");
  await act(async () => {
    q(host, "[data-practice-ai-copy]").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  assert.equal(clipboard[clipboard.length - 1], "MY OWN CMD");

  // …and the reset brings the standard CMD back, topic and all.
  click([...host.querySelectorAll("button")].find((button) => /Reset to the standard CMD/.test(button.textContent)));
  assert.match(panelText(host), /TOPIC: Photosynthesis/);

  unmount();
});

test("a hand-added question needs its explanation, and the CMD's own example imports ready", async () => {
  // 1. A blank question is flagged the moment it exists.
  const hand = mountPanel({ resourceName: "Chapter 1 practice" });
  click([...hand.host.querySelectorAll("button")].find((button) => /Add question manually/.test(button.textContent)));
  assert.equal(fixture.latest.questions.length, 1);
  await act(async () => {});
  assert.match(
    q(hand.host, "[data-practice-question]").textContent,
    /no explanation/,
    "a hand-written question without an explanation is flagged, never quietly accepted",
  );
  const explanationLabel = [...hand.host.querySelectorAll("label")].find((label) => /^Explanation/.test(label.textContent.trim()));
  assert.ok(explanationLabel, "the Explanation field is on the card");
  assert.match(explanationLabel.textContent, /\*/, "…and is marked required");
  hand.unmount();

  // 2. The CMD's own example pastes in and arrives complete.
  const pasted = mountPanel({ resourceName: "Chapter 2 practice" });
  type(q(pasted.host, "[data-practice-paste]"), PRACTICE_PROMPT_EXAMPLE);
  await act(async () => {});
  assert.match(
    q(pasted.host, "[data-practice-preview]").textContent,
    /1 with an explanation \(required on every question\)/,
    "the preview counts explanations as required",
  );
  click(q(pasted.host, "[data-practice-import]"));
  await act(async () => {});
  const imported = fixture.latest.questions;
  assert.equal(imported.length, 1);
  assert.equal(imported[0].prompt, "What is 2 + 2?");
  assert.equal(imported[0].correctIndex, 1);
  assert.match(imported[0].explanation, /Adding 2 and 2/);
  assert.equal(practiceQuestionIssues(imported[0]).length, 0);
  assert.match(q(pasted.host, "[data-practice-question]").textContent, /Ready/);
  pasted.unmount();
});
