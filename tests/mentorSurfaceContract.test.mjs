// tests/mentorSurfaceContract.test.mjs
//
// The two chat surfaces around the mentor, as the LEARNER meets them.
//
//   A. RENDER level (the real components, server-rendered through esbuild):
//      · the Course Player's empty state no longer carries the four dummy
//        suggestion cards — it is the orb, the heading and one honest line;
//      · every layout the server produces renders as real headings, lists,
//        tables, code and callouts in BOTH renderers, never as raw `###`, `**`
//        or `|---|` characters.
//   B. SOURCE level (the seams between the layers):
//      · the player asks with the learner's own words and trusts the server's
//        `format` for its chip;
//      · "nothing readable" no longer removes the Library chat's composer;
//      · the server answers with the mentor prompt, repairs replies, and stores
//        answers without flattening them.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { MENTOR_FORMATS, renderMentorAnswer, validateMentorAnswer } from "../utils/mentorAnswer.js";

const require = createRequire(import.meta.url);
const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

/* ── A. render level ───────────────────────────────────────────────────── */

const OUT_DIR = path.join(ROOT, "node_modules/.tmp-mentor-surface-render");
let rendered = null;
let loadError = null;
try {
  const esbuildPkg = path.join(ROOT, "node_modules/esbuild");
  if (!fs.existsSync(esbuildPkg)) throw new Error("esbuild is not installed");
  const { build } = await import(pathToFileURL(path.join(esbuildPkg, "lib/main.js")).href);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const entry = path.join(OUT_DIR, "entry.tsx");
  fs.writeFileSync(entry, `
import { renderToStaticMarkup } from "react-dom/server";
import MessageList from ${JSON.stringify(path.join(ROOT, "src/lumen/components/MessageList"))};
import Markdown from ${JSON.stringify(path.join(ROOT, "src/lumen/components/Markdown"))};
import { AiMarkdown } from ${JSON.stringify(path.join(ROOT, "src/ai/AiMarkdown"))};

const noop = () => {};
export const emptyState = (courseShort, tier = "md") => renderToStaticMarkup(
  <MessageList
    chat={{ id: "c1", title: "New chat", course: courseShort, courseShort, modelId: "default", messages: [] }}
    tier={tier}
    generating={false}
    onRetry={noop} onImageClick={noop} onToggleThinking={noop} onQuizAnswer={noop} onQuizSubmit={noop} onFollowUp={noop} onOpenPlans={noop}
  />,
);
export { splitStable } from ${JSON.stringify(path.join(ROOT, "src/lumen/lib/perf"))};
export const withAnswer = (format, content, status = "complete") => renderToStaticMarkup(
  <MessageList
    chat={{ id: "c1", title: "Chat", course: "Physics 201", courseShort: "Physics 201", modelId: "default", messages: [
      { id: "u1", role: "user", content: "question", createdAt: 1, status: "complete" },
      { id: "a1", role: "assistant", content, createdAt: 2, status, format, modelLabel: "Course AI" },
    ] }}
    tier="md"
    generating={false}
    onRetry={noop} onImageClick={noop} onToggleThinking={noop} onQuizAnswer={noop} onQuizSubmit={noop} onFollowUp={noop} onOpenPlans={noop}
  />,
);
export const lumenMarkdown = (text) => renderToStaticMarkup(<Markdown text={text} />);
export const aiMarkdown = (text) => renderToStaticMarkup(<AiMarkdown text={text} />);
`);
  await build({
    entryPoints: [entry],
    outfile: path.join(OUT_DIR, "bundle.cjs"),
    bundle: true,
    format: "cjs",
    platform: "node",
    jsx: "automatic",
    logLevel: "silent",
    loader: { ".css": "empty" },
  });
  rendered = require(path.join(OUT_DIR, "bundle.cjs"));
} catch (error) {
  loadError = error;
}
after(() => fs.rmSync(OUT_DIR, { recursive: true, force: true }));
const skip = rendered ? false : `render harness unavailable: ${loadError?.message}`;

test("the Course Player's empty state is the orb, the heading and one line — no dummy suggestion cards", { skip }, () => {
  for (const tier of ["md", "sm", "xxs"]) {
    const html = rendered.emptyState("Physics 201", tier);
    assert.match(html, /How can I help you/);
    assert.doesNotMatch(html, /<button/, `no clickable suggestion of any kind (${tier})`);
    for (const dummy of [
      "Explain binary search simply", "Practice quiz", "answer right here", "Draw a diagram of the Calvin cycle", "Generates an image",
      "Compare the chain and product rules", "CS 101", "BIO 110", "MATH 121", "Algorithms", "Cell Biology", "Calculus I", "suggestion",
    ]) assert.ok(!html.includes(dummy), `"${dummy}" must not be on the front page (${tier})`);
  }
  assert.match(rendered.emptyState("Physics 201"), /Ask about any lesson in Physics 201, paste a problem, or share a screenshot/);
});

const SLOTS = {
  lead: "Binary search finds a value in a sorted array.",
  points: ["It halves the range.", "It needs sorted data."],
  steps: [{ title: "Set pointers", detail: "lo = 0, hi = n - 1." }, { title: "Probe", detail: "Compare the middle." }],
  table: { columns: ["Case", "Cost"], rows: [["Best", "O(1)"], ["Worst", "O(log n)"]] },
  events: [{ when: "1946", what: "First described." }],
  code: { language: "python", source: "def f():\n    return 1" },
  walk: ["Line 1 defines f."],
  diagram: "[lo] --> [mid] --> [hi]",
  legend: [{ label: "mid", meaning: "The probe." }],
  questions: [{ question: "What is the cost?", options: ["O(n)", "O(log n)", "O(1)", "O(n²)"], answer: "B", why: "It halves each time." }],
  strengths: ["Clear claim."],
  improvements: [{ issue: "Thin evidence", fix: "Add a statistic." }],
  pitfall: "The array must be sorted.",
  takeaway: "Sorted data is the price of speed.",
  closing: "Want the full walkthrough?",
  nextStep: "Rewrite the opening.",
};

/**
 * A section heading: a real <h3> in the Course Player, a `role="heading"` label in
 * the Library chat (see AiMarkdown for why it is not an <h3>).
 */
const heading = (title) => new RegExp(`<(?:h3|div role="heading" aria-level="3")[^>]*>${title.replace(/[()']/g, "\\$&")}</`);

/** What each layout must turn into once rendered. */
const TAGS = {
  concise: [/<p[^>]*>Binary search/, /<ul/],
  steps: [heading("The walkthrough"), /<ol/, /<strong[^>]*>Set pointers<\/strong>/, /<blockquote/],
  comparison: [/<table/, /<th[^>]*>Case<\/th>/, /<td[^>]*>O\(log n\)<\/td>/],
  timeline: [/<ul/, /<strong[^>]*>1946<\/strong>/, /<blockquote/],
  code: [/<pre/, /<code/, heading("Reading it line by line"), /<ol/],
  "deep-dive": [heading("The key points"), heading("How it actually runs"), heading("At a glance"), heading("In code"), /<table/, /<pre/, /<blockquote/],
  visual: [/<pre/, heading("How to read it")],
  practice: [heading("Questions"), heading("Answer key"), /<ol/, /<ul/],
  feedback: [/<(?:h3|div role="heading" aria-level="3")[^>]*>What(?:'|&#x27;)s working</, heading("What to sharpen"), heading("Try this next")],
};

test("every layout renders as real structure in BOTH chat renderers — never as raw Markdown characters", { skip }, () => {
  for (const format of MENTOR_FORMATS) {
    const markdown = renderMentorAnswer(SLOTS, format);
    assert.ok(validateMentorAnswer(markdown, format).ok, format);
    for (const [name, render] of [["Course Player", rendered.lumenMarkdown], ["Library chat", rendered.aiMarkdown]]) {
      const html = render(markdown);
      for (const tag of TAGS[format]) assert.match(html, tag, `${format} in the ${name} must contain ${tag}`);
      const visible = html.replace(/<[^>]+>/g, "");
      assert.doesNotMatch(visible, /###/, `${format}/${name}: a heading rendered as raw ###`);
      assert.doesNotMatch(visible, /\*\*/, `${format}/${name}: bold rendered as raw **`);
      assert.doesNotMatch(visible, /\|\s*---/, `${format}/${name}: a table rendered as raw pipes`);
      assert.doesNotMatch(visible, /^\s*>\s/m, `${format}/${name}: a callout rendered as a raw >`);
      assert.ok(!visible.includes("```"), `${format}/${name}: a code fence rendered as raw backticks`);
    }
  }
});

test("code keeps every space of its indentation all the way to the screen", { skip }, () => {
  const markdown = renderMentorAnswer({ lead: "Loop.", code: { language: "python", source: "for i in range(3):\n    if i:\n        print(i)" }, walk: ["Runs three times."] }, "code");
  for (const render of [rendered.lumenMarkdown, rendered.aiMarkdown]) {
    assert.match(render(markdown), /for i in range\(3\):\n    if i:\n        print\(i\)/);
  }
});

test("a structured answer inside the Course Player message list shows its layout chip and its body", { skip }, () => {
  for (const format of ["steps", "comparison", "deep-dive", "practice"]) {
    const html = rendered.withAnswer(format, renderMentorAnswer(SLOTS, format));
    assert.match(html, /fmt-chip/, "the chip is shown");
    assert.ok(/Step-by-step|Comparison|Deep dive|Practice set/.test(html), `${format}: the chip names the layout`);
    assert.match(html, /<h3|<table/, `${format}: the body is structure, not one paragraph`);
  }
});

test("streaming: every finished line is real structure; only the line being typed stays plain", { skip }, () => {
  const { splitStable } = rendered;
  const full = renderMentorAnswer(SLOTS, "steps");
  const mid = full.slice(0, full.indexOf("2. **Probe**") + "2. **Probe** — Compare the mi".length);
  const split = splitStable(mid);
  assert.equal(split.stable, "Binary search finds a value in a sorted array.\n\n### The walkthrough\n\n1. **Set pointers** — lo = 0, hi = n - 1.");
  assert.equal(split.tail, "2. **Probe** — Compare the mi");

  // The old split fell at the last BLANK line, so this whole list sat in the raw tail.
  const html = rendered.withAnswer("steps", mid, "streaming");
  assert.match(html, /<ol>\s*<li><strong>Set pointers<\/strong> — lo = 0, hi = n - 1\.<\/li>/, "the finished step is already a real list item");
  assert.match(html, /2\. \*\*Probe\*\* — Compare the mi/, "the half-typed line is plain text");
  assert.match(html, /stream-caret/);

  // A table arrives row by row instead of as a blob of pipes.
  const comparison = renderMentorAnswer(SLOTS, "comparison");
  const cut = comparison.indexOf("| Worst") + 6;
  const tableHtml = rendered.withAnswer("comparison", comparison.slice(0, cut), "streaming");
  assert.match(tableHtml, /<table/);
  assert.match(tableHtml, /<td[^>]*>Best<\/td>/);

  // An unclosed code fence is never parsed as prose.
  const code = renderMentorAnswer(SLOTS, "code");
  const open = splitStable(code.slice(0, code.indexOf("return 1") + 4));
  assert.match(open.tail, /^```python\ndef f\(\):\n    retu/);
  assert.equal(open.stable, "Binary search finds a value in a sorted array.");
  assert.deepEqual(splitStable("no newline yet"), { stable: "", tail: "no newline yet" });
});

test("streaming: walking any layout one character at a time, the rendered part only ever grows", { skip }, () => {
  const { splitStable } = rendered;
  for (const format of MENTOR_FORMATS) {
    const text = renderMentorAnswer(SLOTS, format);
    let previous = "";
    for (let end = 0; end <= text.length; end += 1) {
      const { stable, tail } = splitStable(text.slice(0, end));
      assert.ok(stable.startsWith(previous), `${format}: rendered text shrank at ${end}`);
      assert.ok(text.slice(0, end).startsWith(stable) && text.slice(0, end).endsWith(tail), `${format}: nothing may be lost or duplicated at ${end}`);
      previous = stable;
    }
    assert.equal(splitStable(text).stable.length > 0, true, format);
  }
});

test("the answer renderers never render raw HTML from a model — it is shown as text, links are neutralised", { skip }, () => {
  const hostile = "Lead <script>alert(1)</script> and <img src=x onerror=alert(1)>\n\n### The walkthrough\n\n1. **a** — <b onmouseover=alert(1)>b</b>\n\n[link](javascript:alert(1))";
  const allowed = new Set(["div", "p", "h3", "ol", "ul", "li", "strong", "em", "a", "code", "pre", "blockquote", "table", "thead", "tbody", "tr", "th", "td", "hr"]);
  for (const render of [rendered.lumenMarkdown, rendered.aiMarkdown]) {
    const html = render(hostile);
    const tags = new Set((html.match(/<\/?([a-z][a-z0-9]*)/g) || []).map((tag) => tag.replace(/[</]/g, "")));
    for (const tag of tags) assert.ok(allowed.has(tag), `a model can never create a <${tag}> element`);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, "the markup is shown as text, not executed");
    assert.doesNotMatch(html, /href="javascript:/i);
  }
});

/* ── B. source level ───────────────────────────────────────────────────── */

test("the four dummy suggestion inputs are gone from the source, the handler and the styles", () => {
  const list = read("src/lumen/components/MessageList.tsx");
  const app = read("src/lumen/App.tsx");
  const css = read("src/lumen/index.css");
  assert.doesNotMatch(list, /SUGGESTIONS/);
  assert.doesNotMatch(list, /onSuggestion/);
  assert.doesNotMatch(app, /cbSuggestion|onSuggestion/);
  assert.doesNotMatch(css, /\.suggestion\b|\.suggestion__icon/);
  for (const dummy of ["Explain binary search simply", "Practice quiz — answer right here", "Draw a diagram of the Calvin cycle", "Compare the chain and product rules"]) {
    for (const [file, source] of [["MessageList.tsx", list], ["App.tsx", app]]) assert.ok(!source.includes(dummy), `${file} still carries "${dummy}"`);
  }
  assert.doesNotMatch(list, /CS 101|BIO 110|MATH 121/);
});

test("the player asks with the learner's own words and trusts the server's layout for the chip", () => {
  const source = read("src/lumen/productionAi.ts");
  assert.match(source, /import \{ detectMentorFormat, isMentorFormat \} from "\.\.\/\.\.\/utils\/mentorAnswer"/);
  assert.doesNotMatch(source, /\\b\(practice\|quiz\|test me\)/, "the weaker copy of the layout rule is gone");
  assert.doesNotMatch(source, /currently studying/, "the course's title must not be glued to the question the layout is chosen from");
  assert.doesNotMatch(source, /withCourseLead/);
  assert.match(source, /const delivered: ResponseFormat = isMentorFormat\(result\.format\) \? result\.format : format;/);
  assert.match(source, /format: delivered,/);
  // Where the learner is still reaches the server — as data, not as prose.
  assert.match(source, /courseTitle: scope\.courseTitle,[\s\S]*moduleTitle: scope\.moduleTitle,[\s\S]*resourceName: scope\.resourceName,/);
});

test("the footnote on an own-knowledge answer is information, never a refusal or a permission claim", () => {
  const source = read("src/lumen/productionAi.ts");
  const note = source.slice(source.indexOf("const withGroundingNote = "), source.indexOf("export async function runProductionAssistant"));
  assert.match(note, /if \(result\.grounded !== false\) return answer;/, "an answer built on the files carries no footnote");
  assert.match(note, /so I answered from general knowledge\./);
  assert.doesNotMatch(note, /access denied|no access|not entitled|can'?t answer|cannot answer|not in the file/i);
  assert.doesNotMatch(note, /comes from titles and your own notes/, "the old copy described a dead end");
});

test("the Library chat never removes its composer for lack of readable files, and renders the real layout", () => {
  const source = read("src/ai/AiChatView.tsx");
  assert.doesNotMatch(source, /Nothing readable in this module yet/, "that dead-end card replaced the input");
  assert.match(source, /const noReadableNotice = ai\.phase === "ready" && !gate && !ai\.hasReadableContent;/);
  assert.match(source, /\{!gate \? \(\s*<div className=\{cn\("shrink-0 border-t/, "the composer is gated only by plan / provider, never by content");
  assert.match(source, /<AiMarkdown text=\{message\.text\} \/>/);
  assert.doesNotMatch(source, /<AiProse text=\{message\.text\} \/>/);
  assert.doesNotMatch(source, /I answer only from what I could actually read|Answers come only from|I only use content I could actually read/);
  assert.doesNotMatch(source, /treat it as a pointer rather than a fact/);
  assert.match(source, /mentorMarkdownToPlainText\(message\.text\)/, "notes and re-prompts get plain text, not Markdown marks");
  assert.doesNotMatch(source, /Answered from limited material/, "no toast scolds the learner for a general-knowledge answer");
});

test("the server answers with the mentor prompt, repairs replies, and keeps stored answers structured", () => {
  const server = read("api/_lib/personalAi.ts");
  const ask = server.slice(server.indexOf("async function handleAsk("), server.indexOf("const GENERATION_KINDS"));
  assert.match(ask, /system: PERSONAL_AI_MENTOR_SYSTEM_PROMPT,/);
  assert.match(ask, /lenientJson: true,/);
  assert.match(ask, /const format = detectMentorFormat\(question, attachedImages\.length > 0\);/, "only what the learner attached counts as media — the same signal the player's chip uses");
  assert.match(ask, /normalizePersonalAiMentorAnswer\(call\.payload, unitIds/);
  assert.doesNotMatch(ask, /normalizePersonalAiAnswer\(/, "the free-text normaliser is not the ask path any more");
  assert.match(ask, /isMentorDeadEnd\(probe\.answer\) \? MENTOR_RETRY_NOTE : null/);

  const thread = server.slice(server.indexOf("async function loadThread("), server.indexOf("async function appendThread("));
  assert.match(thread, /text: cleanAiAnswerText\(message\.text/);
  assert.doesNotMatch(thread, /text: cleanAiText\(message\.text/, "cleanAiText folds every newline: it flattened every stored answer");

  // One metered call: the correction shares the reservation and the charge.
  const call = server.slice(server.indexOf("async function groundedCompletion("), server.indexOf("/* Actions"));
  assert.match(call, /estimatedInputTokens \* attempts/);
  assert.match(call, /!isBudgetLow\(CORRECTION_MIN_BUDGET_MS\)/, "the correction only starts when the handler has time for it");
  assert.match(call, /withinMs\(\s*completeJsonText\(/, "and is capped, so a stalled provider cannot cost the answer already held");
  assert.equal((call.match(/await finalizeUsage\(/g) || []).length, 1, "however many provider calls, the learner is charged once");
});

test("lists keep their numbers and bullets in the Course Player (Tailwind's preflight removes them unless restored)", () => {
  const css = read("src/lumen/index.css");
  // A real browser run found `list-style-type: none` on every `.md ol/ul/li`:
  // the stylesheet only COLOURED a marker that was never drawn, so a numbered
  // walkthrough lost its numbers, bullets lost their dots, and a quiz's answer
  // key could not be matched to its questions.
  assert.match(css, /\.md ul \{ list-style: disc outside; \}/);
  assert.match(css, /\.md ol \{ list-style: decimal outside; \}/);
  assert.match(css, /\.md ul ul, \.md ol ul \{ list-style-type: circle; \}/);
  assert.match(css, /\.md li::marker \{/, "the marker colour rule is still there to style what is now drawn");
  assert.match(read("src/index.css"), /@import "tailwindcss";/, "the reset these lines undo is real: preflight ships with the app");
});

test("the Library answer's section labels are not <h3> elements — the global tablet pass resizes every h3", () => {
  const source = read("src/ai/AiMarkdown.tsx");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(code, /role="heading" aria-level=\{3\}/);
  assert.doesNotMatch(code, /<h[1-6]\b/, "an element selector in src/index.css would override the label size with !important");
});

test("the generators are untouched: only chat and explain-again take the mentor's own-knowledge policy", () => {
  const server = read("api/_lib/personalAi.ts");
  const generate = server.slice(server.indexOf("async function handleGenerate("), server.indexOf("/** `personalAi.thread`"));
  assert.match(generate, /\.\.\.\(effectiveType === "explanation" \? \{ system: PERSONAL_AI_MENTOR_SYSTEM_PROMPT \} : \{\}\),/);
  assert.match(generate, /if \(!chunks\.length && effectiveType !== "explanation"\) \{/);
});
