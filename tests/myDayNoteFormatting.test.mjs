// My Day's live editor stores Markdown and renders it only at the preview edge.
// These tests bundle the same module the shipped iframe loads, then exercise
// rich paste, plain Markdown paste, save-format toolbar actions, the shared
// sanitizer/KaTeX path and responsive preview wrappers in a real DOM.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { build } from "esbuild";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules/.cache/myday-note-formatting");
fs.mkdirSync(DIR, { recursive: true });
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://myday.test/", pretendToBeVisual: true });
for (const key of ["window", "document", "DOMParser", "Node", "Element", "HTMLElement", "HTMLInputElement", "Text", "DocumentFragment"]) {
  if (dom.window[key] !== undefined) globalThis[key] = dom.window[key];
}

await build({
  entryPoints: [path.join(ROOT, "src/joplin/myDayNoteFormatting.ts")],
  outfile: path.join(DIR, "formatting.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  plugins: [{
    name: "ignore-stylesheets-in-node-test-bundle",
    setup(builder) {
      builder.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: "test-css" }));
      builder.onLoad({ filter: /.*/, namespace: "test-css" }, () => ({ contents: "", loader: "js" }));
    },
  }],
  logLevel: "silent",
});
const formatting = await import(pathToFileURL(path.join(DIR, "formatting.mjs")).href);

after(() => {
  dom.window.close();
  fs.rmSync(DIR, { recursive: true, force: true });
});

test("toolbar actions write structural Markdown and preserve the active selection", () => {
  const cases = [
    ["bold", "**hello**", "hello"],
    ["italic", "*hello*", "hello"],
    ["bold-italic", "***hello***", "hello"],
    ["strike", "~~hello~~", "hello"],
    ["inline-code", "`hello`", "hello"],
    ["link", "[hello](https://example.com)", "hello"],
    ["inline-math", "$hello$", "hello"],
  ];
  for (const [action, expected, selection] of cases) {
    const result = formatting.formatMyDayMarkdown("hello", 0, 5, action);
    assert.equal(result.value, expected, action);
    assert.equal(result.value.slice(result.selectionStart, result.selectionEnd), selection, `${action} keeps the content selected`);
  }
  const bold = formatting.formatMyDayMarkdown("hello", 0, 5, "bold");
  assert.equal(formatting.formatMyDayMarkdown(bold.value, bold.selectionStart, bold.selectionEnd, "bold").value, "hello", "clicking the active inline format toggles it off");
  assert.equal(formatting.formatMyDayMarkdown("", 0, 0, "bold").value, "**bold text**");
  assert.equal(formatting.formatMyDayMarkdown("label", 0, 5, "link", { linkUrl: "https://example.com/a(b)" }).value, "[label](https://example.com/a\\(b\\))");
  assert.equal(formatting.formatMyDayMarkdown("label", 0, 5, "link", { linkUrl: "javascript:alert(1)" }).value, "label", "unsafe toolbar links are not persisted");

  const blank = formatting.formatMyDayMarkdown("", 0, 0, "inline-math");
  assert.equal(blank.value, "$x^2$");
  assert.equal(blank.value.slice(blank.selectionStart, blank.selectionEnd), "x^2", "the placeholder remains selected for immediate editing");
});

test("block toolbar actions edit complete selected lines, task state, code fences, math and tables", () => {
  assert.equal(formatting.formatMyDayMarkdown("alpha\nbeta", 0, 10, "heading", { headingLevel: 3 }).value, "### alpha\n### beta");
  assert.equal(formatting.formatMyDayMarkdown("### title", 0, 8, "paragraph").value, "title");
  assert.equal(formatting.formatMyDayMarkdown("alpha\nbeta", 0, 10, "bullet").value, "- alpha\n- beta");
  assert.equal(formatting.formatMyDayMarkdown("alpha\nbeta", 0, 10, "numbered").value, "1. alpha\n2. beta");
  assert.equal(formatting.formatMyDayMarkdown("alpha\nbeta", 0, 10, "checklist").value, "- [ ] alpha\n- [ ] beta");
  assert.equal(formatting.formatMyDayMarkdown("- [ ] alpha", 0, 10, "check-complete").value, "- [x] alpha");
  assert.equal(formatting.formatMyDayMarkdown("- [x] alpha", 0, 10, "check-complete").value, "- [ ] alpha");
  assert.equal(formatting.formatMyDayMarkdown("alpha", 0, 5, "quote").value, "> alpha");

  const fenced = formatting.formatMyDayMarkdown("const x = `ok`;", 0, 15, "code-block", { language: "js" });
  assert.match(fenced.value, /^```js\n/);
  assert.equal(fenced.value.slice(fenced.selectionStart, fenced.selectionEnd), "const x = `ok`;", "fenced code is preserved literally, even with backticks inside");
  assert.equal(formatting.formatMyDayMarkdown("", 0, 0, "block-math").value, "$$\n\\frac{a}{b}\n$$");
  assert.equal(formatting.formatMyDayMarkdown("", 0, 0, "table").value, "| Heading 1 | Heading 2 |\n| --- | --- |\n| Cell 1 | Cell 2 |");
  assert.equal(formatting.formatMyDayMarkdown("", 0, 0, "horizontal-rule").value, "---");
  const tableInParagraph = formatting.formatMyDayMarkdown("beforeafter", 6, 6, "table");
  assert.match(tableInParagraph.value, /^before\n\n\| Heading 1[\s\S]*Cell 2 \|\n\nafter$/);
  const codeInParagraph = formatting.formatMyDayMarkdown("before body after", 7, 11, "code-block", { language: "text" });
  assert.match(codeInParagraph.value, /before \n\n```text\nbody\n```\n\n after/);
  assert.equal(codeInParagraph.value.slice(codeInParagraph.selectionStart, codeInParagraph.selectionEnd), "body");
});

test("rich HTML paste becomes editable Markdown with marks, lists, task checks, tables, math, code and safe links", () => {
  const html = `<h2>Revision</h2>
    <p>Use <strong>bold</strong>, <em>italic</em>, <del>removed</del> and <u>underlined</u>; H<sub>2</sub>O, x<sup>2</sup>.</p>
    <ul><li data-checked="true">Done</li><li data-checked="false">Open</li></ul>
    <ol start="3"><li>Third</li></ol>
    <blockquote><p>Remember <strong>the rule</strong>.</p></blockquote>
    <table><thead><tr><th>Term</th><th style="text-align:center">Value</th></tr></thead><tbody><tr><td>Energy</td><td>$E=mc^2$</td></tr></tbody></table>
    <pre><code class="language-js">const literal = "$x^2$";\nconsole.log(literal);</code></pre>
    <p><a href="https://example.com">safe link</a> <a href="javascript:alert(1)">bad link</a></p>`;
  const markdown = formatting.richHtmlToMyDayMarkdown(html);
  assert.match(markdown, /^## Revision/m);
  assert.match(markdown, /\*\*bold\*\*/);
  assert.match(markdown, /\*italic\*/);
  assert.match(markdown, /~~removed~~/);
  assert.match(markdown, /H₂O, x²/);
  assert.match(markdown, /- \[x\] Done/);
  assert.match(markdown, /- \[ \] Open/);
  assert.match(markdown, /3\. Third/);
  assert.match(markdown, /> Remember \*\*the rule\*\*\./);
  assert.match(markdown, /\| Term \| Value \|\n\| --- \| :---: \|/);
  assert.match(markdown, /\$E=mc\^2\$/);
  assert.match(markdown, /```js\nconst literal = "\$x\^2\$";/, "code stays literal and keeps its language");
  assert.match(markdown, /\[safe link\]\(https:\/\/example\.com\)/);
  assert.match(markdown, /bad link/);
  assert.doesNotMatch(markdown, /javascript:/i);
});

test("plain text paste preserves Markdown and line breaks without an HTML save-format migration", () => {
  const markdown = "# Study\n\n*italic* and ***bold italic***; inline $y^2$ and literal `$x^2$`.\n\n- [x] checked\n- [ ] open\n\n```text\n$x^2$ stays literal\n```";
  assert.equal(formatting.normalizeMyDayPlainTextPaste(markdown), markdown);
  const rendered = formatting.renderMyDayMarkdown(markdown);
  assert.match(rendered, /<h1>Study<\/h1>/);
  assert.match(rendered, /<em>italic<\/em>/);
  assert.match(rendered, /<strong><em>bold italic<\/em><\/strong>|<em><strong>bold italic<\/strong><\/em>/);
  assert.match(rendered, /data-note-math-rendered="inline"/);
  assert.match(rendered, /class="language-text"/);
  assert.match(rendered, /\$x\^2\$ stays literal/);
  assert.match(rendered, /data-checked="true"/);
  assert.match(rendered, /data-checked="false"/);
  const previewDocument = new DOMParser().parseFromString(`<body>${rendered}</body>`, "text/html");
  assert.deepEqual(Array.from(previewDocument.querySelectorAll(".myday-checklist-control")).map((input) => [input.checked, input.disabled]), [[true, true], [false, true]]);
});

test("KaTeX render, responsive tables and malicious Markdown/HTML are safe at preview time", () => {
  const stress = [
    "## Inline and display math",
    "Unicode: A = πr²; x²; √(a+b); 3 × 10⁸; ∞.",
    "$$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$",
    "",
    "| Column A | Column B | Column C |",
    "| --- | --- | --- |",
    "| alpha alpha alpha | beta beta beta | gamma gamma gamma |",
    "",
    "<p onclick=\"alert(1)\">safe <strong>format</strong><script>window.__xss=1</script><iframe src=\"https://evil.test\"></iframe><img src=x onerror=\"alert(1)\"></p>",
  ].join("\n");
  const rendered = formatting.renderMyDayMarkdown(stress);
  const document = new DOMParser().parseFromString(`<body>${rendered}</body>`, "text/html");
  assert.ok(document.querySelectorAll(".katex").length >= 5, "inline Unicode expressions and display TeX render through KaTeX");
  assert.equal(document.querySelectorAll(".katex-display").length, 1);
  assert.equal(document.querySelectorAll(".myday-table-scroll > table").length, 1, "a responsive wrapper contains the wide semantic table");
  assert.equal(document.querySelectorAll("script, iframe, [onerror], [onclick]").length, 0, "untrusted paste never produces executable HTML");
  assert.equal(document.querySelector(".editor-preview"), null, "preview HTML is data to insert into its container, not a new editor/container");
  assert.match(rendered, /safe <strong>format<\/strong>/);
});

test("render/copy/re-paste retains Markdown-compatible tables, task state and editable math sources", () => {
  const original = "# Copy round trip\n\nFormula: $\\frac{3}{4}$ and x².\n\n- [x] complete\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
  const preview = formatting.renderMyDayMarkdown(original);
  const copied = formatting.richHtmlToMyDayMarkdown(preview);
  assert.match(copied, /^# Copy round trip/m);
  assert.match(copied, /\$\\frac\{3\}\{4\}\$/);
  assert.match(copied, /- \[x\] complete/);
  assert.match(copied, /\| A \| B \|\n\| --- \| --- \|/);
  assert.doesNotMatch(copied, /katex|mathml|data-note-math/i);
});
