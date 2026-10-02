// tests/noteEditorDataPipeline.test.mjs
//
// DATA SAFETY for the block-document note editor (BlockNote), run for real:
// the actual importer, serialiser, commands, sanitiser, device mirror and
// Firestore payload code, bundled with esbuild and executed in Node + jsdom
// (BlockNote's own core runs headless there — no mocks of the editor).
//
//   stored note html
//     → detect → normalise → import   (src/course/noteEditor/editorMigration.ts)
//     → BlockNote blocks
//     → explicit serialisation adapter (…/editorSerialization.ts)
//     → note html
//     → sanitiser → notesStore mirror → Firestore payload (utils/courseNotes.js)
//
// What is proved:
//   1. every construct the old editor wrote imports to the right block, and the
//      constructs the editor cannot hold (tables, images) are PRESERVED VERBATIM,
//      never flattened, never dropped;
//   2. import → serialise is a fixed point over a corpus of real-world shapes
//      (including the AI-note and legacy plain-text formats), so opening and
//      saving a note can never drift;
//   3. what the serialiser writes is a fixed point of the player's sanitiser
//      (CoursePlayerApp sanitises on save) — checklist state included;
//   4. hostile HTML never survives, and unreadable colours are dropped and
//      reported rather than leaving invisible text on the white page;
//   5. the title/body split the panel and the player's exit rescue use
//      (`splitFirstHeading` / `combineHtml`) round-trips through the editor;
//   6. editor HTML survives the local mirror and the Firestore payload byte for
//      byte, and the 60 000-character cap is a hard boundary the panel checks.
//
// The interactive behaviour (typing, slash menu, undo/redo, keyboard, widths)
// is in tests/noteEditorBrowser.test.mjs; the source-level promises are in
// tests/noteEditorContract.test.mjs.

import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { build } from "esbuild";

const ROOT = process.cwd();
const DIR = path.join(ROOT, "node_modules/.cache/note-editor-data-pipeline");
fs.mkdirSync(DIR, { recursive: true });

// ── a DOM for BlockNote and the sanitiser ──────────────────────────────────
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
for (const key of [
  "window", "document", "HTMLElement", "Node", "Element", "DOMParser", "MutationObserver", "getComputedStyle",
  "requestAnimationFrame", "cancelAnimationFrame", "DocumentFragment", "Range", "Selection", "CustomEvent", "Event",
  "KeyboardEvent", "MouseEvent", "XMLSerializer", "HTMLInputElement", "HTMLTextAreaElement", "HTMLAnchorElement",
  "ClipboardEvent", "DOMRect", "localStorage",
]) {
  if (dom.window[key] !== undefined) {
    try { globalThis[key] = dom.window[key]; } catch { /* read-only global */ }
  }
}
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
dom.window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
globalThis.ResizeObserver = dom.window.ResizeObserver;

await build({
  stdin: {
    resolveDir: ROOT,
    loader: "ts",
    contents: `
export * from "./src/course/noteEditor/editorFactory";
export * from "./src/course/noteEditor/editorMigration";
export * from "./src/course/noteEditor/editorSerialization";
export * from "./src/course/noteEditor/editorCommands";
export { sanitizeRichText, plainToRichText, splitFirstHeading, isEmptyRichText, richTextToPlain } from "./src/utils/richText";
export { combineHtml, loadLocalNotes, persistLocalNotes } from "./src/course/notesStore";
export { normalizeNote, toFirestoreNote, parseCloudNote, mergeNoteSets, MAX_NOTE_HTML_LENGTH } from "./utils/courseNotes.js";
`,
  },
  outfile: path.join(DIR, "pipeline.mjs"),
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  logLevel: "silent",
});
const m = await import(pathToFileURL(path.join(DIR, "pipeline.mjs")).href);

after(() => {
  dom.window.close();
  fs.rmSync(DIR, { recursive: true, force: true });
});

const run = (html) => m.importLegacyHtml(html);
const body = (html) => m.serializeNoteBody(run(html).blocks);
const types = (html) => run(html).blocks.map((block) => block.type);
const texts = (blocks) =>
  blocks.map((block) => (Array.isArray(block.content) ? block.content.map((run) => run.text ?? run.content?.map((c) => c.text).join("")).join("") : ""));

// ── 1. The importer ────────────────────────────────────────────────────────

test("contenteditable notes: one block per <div> line, a blank line stays a blank line", () => {
  const { blocks } = run("<div>line one</div><div><br></div><div>line <b>two</b> &amp; <i>more</i></div>");
  assert.deepEqual(blocks.map((b) => b.type), ["paragraph", "paragraph", "paragraph"]);
  assert.deepEqual(texts(blocks), ["line one", "", "line two & more"]);
  // …and a bare first line with no wrapper is a line too.
  assert.deepEqual(texts(run("first<div>second</div>").blocks), ["first", "second"]);
});

test("lists nest, a numbered list keeps its start, checklists keep their checked state", () => {
  const nested = run('<ul><li>a<ul><li>a1</li><li>a2</li></ul></li><li>b</li></ul><ol start="3"><li>x</li><li>y</li></ol>').blocks;
  assert.deepEqual(nested.map((b) => b.type), ["bulletListItem", "bulletListItem", "numberedListItem", "numberedListItem"]);
  assert.deepEqual(nested[0].children.map((c) => c.type), ["bulletListItem", "bulletListItem"]);
  assert.equal(nested[2].props.start, 3);
  const tasks = run('<ul><li data-checked="true">done</li><li data-checked="false">todo</li></ul>').blocks;
  assert.deepEqual(tasks.map((b) => [b.type, b.props.checked]), [["checkListItem", true], ["checkListItem", false]]);
  // <li><p>…</p></li> (Docs / Notion / Word): the first paragraph IS the item's text.
  const wrapped = run("<ul><li><p>one</p><p>more</p></li></ul>").blocks;
  assert.deepEqual(texts(wrapped), ["one"]);
  assert.deepEqual(wrapped[0].children.map((c) => c.type), ["paragraph"]);
});

test("headings 1–3 map one to one; h4–h6 become H3 and the report says so", () => {
  const report = run("<h1>A</h1><h2>B</h2><h3>C</h3><h4>D</h4><h6>F</h6>");
  assert.deepEqual(report.blocks.map((b) => b.props.level), [1, 2, 3, 3, 3]);
  assert.deepEqual(texts(report.blocks), ["A", "B", "C", "D", "F"]);
  assert.ok(report.downgrades.includes("heading-level"));
  assert.deepEqual(run("<h1>A</h1>").downgrades, []);
});

test("quote, code (indentation intact) and divider", () => {
  const { blocks } = run("<blockquote>quoted <b>text</b></blockquote><pre><code>let a = 1;\n  let b = 2;</code></pre><hr><p>after</p>");
  assert.deepEqual(blocks.map((b) => b.type), ["quote", "codeBlock", "divider", "paragraph"]);
  assert.equal(blocks[1].content[0].text, "let a = 1;\n  let b = 2;");
  // A multi-paragraph quote reads as one quote: a run of quote blocks.
  assert.deepEqual(types("<blockquote><p>a</p><p>b</p></blockquote>"), ["quote", "quote"]);
});

test("inline marks, safe links, sub/superscript, highlights and colours", () => {
  const out = body('<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <del>d</del> <code>c</code> <a href="https://x.com">link</a> <mark>m</mark> H<sub>2</sub>O x<sup>2</sup></p>');
  assert.equal(
    out,
    '<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <s>d</s> <code>c</code> <a href="https://x.com" target="_blank" rel="noopener noreferrer">link</a> <span style="background-color: rgb(255, 245, 157)">m</span> H<sub>2</sub>O x<sup>2</sup></p>',
  );
  const colored = body('<p><span style="color: rgb(255, 0, 0); background-color: #ffff00">hot</span></p>');
  assert.equal(colored, '<p><span style="color: rgb(255, 0, 0); background-color: rgb(255, 255, 0)">hot</span></p>');
  // A link that is not http(s)/mailto/tel keeps its words and loses the link.
  assert.equal(body('<p><a href="javascript:alert(1)">click</a></p>'), "<p>click</p>");
});

test("text colour that would vanish on the white page is dropped — and reported", () => {
  const report = run('<p><span style="color:#eeeeee">pale</span> <span style="color:#111111">ink</span></p>');
  assert.deepEqual(texts(report.blocks), ["pale ink"]);
  assert.ok(report.downgrades.includes("colour-contrast"));
  assert.equal(m.serializeNoteBody(report.blocks), '<p>pale <span style="color: rgb(17, 17, 17)">ink</span></p>');
});

test("tables and images are PRESERVED VERBATIM as read-only blocks — never flattened, never dropped", () => {
  const table = '<table><tbody><tr><th>Term</th><td>c &amp; d</td></tr></tbody></table>';
  const image = '<img src="https://x.com/a.png" alt="pic">';
  const report = run(`<p>before</p>${table}${image}<p>after</p>`);
  assert.deepEqual(report.blocks.map((b) => b.type), ["paragraph", "legacyHtml", "legacyHtml", "paragraph"]);
  assert.equal(report.preservedBlocks, 2);
  assert.equal(report.blocks[1].props.html, table);
  assert.equal(report.blocks[2].props.html, image);
  // Written back exactly as read.
  assert.equal(m.serializeNoteBody(report.blocks), `<p>before</p>${table}${image}<p>after</p>`);
  // An image inside a list item or a paragraph is kept too (as a child / its own block).
  assert.equal(run('<ul><li>text <img src="https://x.com/b.png"></li></ul>').preservedBlocks, 1);
  assert.equal(run('<p>look <img src="https://x.com/c.png"> here</p>').preservedBlocks, 1);
});

test("hostile HTML is neutralised before it is imported", () => {
  assert.equal(body('<p>ok</p><script>alert(1)</script><p onclick="x()">safe</p>'), "<p>ok</p><p>safe</p>");
  assert.equal(body('<p><img src="javascript:alert(1)" onerror="x()">hi</p>').includes("javascript:"), false);
  assert.equal(body('<iframe src="https://evil.example"></iframe><p>text</p>'), "<p>text</p>");
  assert.doesNotMatch(body('<p style="position:fixed;background:url(https://evil.example/x.png)">styled</p>'), /position|url\(/);
});

test("empty, whitespace-only and plain-text input", () => {
  assert.deepEqual(run("").blocks, []);
  assert.deepEqual(run("   \n  ").blocks, []);
  assert.deepEqual(texts(run("just text\nsecond line").blocks), ["just text", "second line"]);
  assert.deepEqual(texts(run("Fish &amp; chips").blocks), ["Fish & chips"]);
});

test("alignment, runs of spaces and leading spaces survive", () => {
  assert.equal(body('<p style="text-align:center">centred</p><h2 align="right">right</h2>'), '<p style="text-align: center">centred</p><h2 style="text-align: right">right</h2>');
  assert.equal(body("<div>a&nbsp;&nbsp;&nbsp;b</div>"), "<p>a&nbsp;&nbsp; b</p>");
  assert.equal(body("<div>&nbsp;lead</div>"), "<p>&nbsp;lead</p>");
});

// ── 2. Round-trip stability ────────────────────────────────────────────────

const AI_NOTE = '<h1>AI note</h1><hr><p>First paragraph<br>second line</p><ul><li>point one</li><li>point two</li></ul>';
const CORPUS = {
  contenteditableLines: "<div>line one</div><div><br></div><div>line <b>two</b> &amp; <i>more</i></div>",
  nestedLists: '<ul><li>a<ul><li>a1<ul><li>a2</li></ul></li></ul></li><li>b</li></ul><ol start="3"><li>x</li><li>y</li></ol>',
  listWithParagraphs: "<ul><li><p>one</p><p>more</p></li></ul>",
  headings: "<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4>",
  blocks: "<blockquote>quoted <b>text</b></blockquote><pre><code>let a = 1;\n  let b = 2;</code></pre><hr><p>after</p>",
  marks: '<p><strong>b</strong> <em>i</em> <u>u</u> <s>s</s> <code>c</code> <a href="https://x.com">link</a> H<sub>2</sub>O x<sup>2</sup></p>',
  colours: '<p><span style="color: rgb(255, 0, 0); background-color: #ffff00">hot</span> plain</p>',
  tableAndImages: '<p>before</p><table><tbody><tr><th>h</th><td>c</td></tr></tbody></table><img src="https://x.com/a.png" alt="a"><p>after <img src="https://x.com/b.png"> inline</p>',
  checklist: '<ul><li data-checked="true">done</li><li data-checked="false">todo</li></ul><ul><li>plain bullet after</li></ul>',
  alignment: '<p style="text-align:center">centred</p><h2 align="right">right</h2>',
  spaces: "<div>a&nbsp;&nbsp;b</div><div> lead</div>",
  aiNote: AI_NOTE,
  legacyPlainText: undefined, // filled below from plainToRichText
};
CORPUS.legacyPlainText = m.plainToRichText("Line one\n\n  indented line\nlast & final <tag>");

test("round trip: import → serialise is stable — open and save can never drift", () => {
  for (const [name, html] of Object.entries(CORPUS)) {
    const once = body(html);
    const twice = body(once);
    assert.equal(twice, once, `${name}: second pass changed the note`);
    // Words are never lost: the visible text is identical before and after.
    assert.equal(m.richTextToPlain(once), m.richTextToPlain(m.sanitizeRichText(html)), `${name}: text changed`);
  }
});

test("the AI-note format and legacy plain-text notes import intact", () => {
  assert.deepEqual(types(AI_NOTE), ["heading", "divider", "paragraph", "bulletListItem", "bulletListItem"]);
  const plain = run(CORPUS.legacyPlainText);
  assert.deepEqual(texts(plain.blocks), ["Line one", "", "  indented line", "last & final <tag>"]);
});

test("the plain-text projection keeps words from different blocks apart (search, previews, AI grounding)", () => {
  assert.equal(m.richTextToPlain("<ul><li>one<p>more</p></li></ul>"), "one more");
  assert.equal(m.richTextToPlain("<ul><li>a<ul><li>a1</li></ul></li></ul>"), "a a1");
  assert.equal(m.richTextToPlain("<h1>Title</h1><hr><p>Body</p>"), "Title Body");
  assert.equal(m.richTextToPlain("<p>one</p><p>two</p>"), "one two");
  assert.equal(m.richTextToPlain("<p>in<b>word</b></p>"), "inword");
});

test("everything the serialiser writes is a fixed point of the player's sanitiser", () => {
  for (const [name, html] of Object.entries(CORPUS)) {
    const written = body(html);
    assert.equal(m.sanitizeRichText(written), written, `${name}: the sanitiser would rewrite what the editor saved`);
  }
});

test("the sanitiser allows data-checked (true/false only) and no other data attribute", () => {
  assert.equal(m.sanitizeRichText('<ul><li data-checked="true">a</li></ul>'), '<ul><li data-checked="true">a</li></ul>');
  assert.equal(m.sanitizeRichText('<ul><li data-checked="TRUE">a</li></ul>'), '<ul><li data-checked="true">a</li></ul>');
  assert.equal(m.sanitizeRichText('<ul><li data-checked="javascript:1" data-x="1">a</li></ul>'), "<ul><li>a</li></ul>");
  assert.equal(m.sanitizeRichText('<p data-checked="true" data-x="1">a</p>'), "<p>a</p>");
});

// ── 3. The title / body model the panel and the exit rescue speak ──────────

test("title pipeline: split → body import → serialise → combine reproduces canonical notes", () => {
  const canonical = [
    '<h1>Photosynthesis</h1><hr><p>Plants turn <strong>light</strong> into sugar.</p><ul><li>Chlorophyll</li></ul>',
    '<h1>Tasks</h1><hr><ul><li data-checked="true">Read</li></ul><blockquote>Quote</blockquote>',
    '<h1>Only a title</h1>',
    "<p>No title at all</p>",
  ];
  for (const html of canonical) {
    const { heading, body: rest } = m.splitFirstHeading(html);
    const edited = m.combineHtml(heading, body(rest));
    assert.equal(edited, html);
  }
});

test("an untouched new note is the empty string, and trailing blank lines are trimmed", () => {
  assert.equal(m.serializeNoteBody([{ type: "paragraph", content: [] }]), "");
  assert.equal(m.isEmptyRichText(m.combineHtml("", m.serializeNoteBody([{ type: "paragraph", content: [] }]))), true);
  assert.equal(body("<p>text</p><div><br></div><div><br></div>"), "<p>text</p>");
});

// ── 4. Persistence: local mirror + Firestore payload ───────────────────────

test("editor HTML survives the device mirror and the Firestore payload byte for byte", () => {
  const html = m.combineHtml("Mixed", body(CORPUS.tableAndImages + CORPUS.checklist + CORPUS.marks));
  const note = { id: "note-1", text: m.richTextToPlain(html), html, createdAt: 1, updatedAt: 2, links: [] };
  m.persistLocalNotes("uid1", "course1", [note]);
  const [loaded] = m.loadLocalNotes("uid1", "course1");
  assert.equal(loaded.html, html);
  const payload = m.toFirestoreNote(loaded, { uid: "uid1", productId: "course1" });
  assert.equal(payload.html, html);
  assert.equal(m.parseCloudNote(payload).html, html);
  // The merge keeps the newer edit, html and all.
  const merged = m.mergeNoteSets([{ ...note, html: "<p>old</p>", updatedAt: 1 }], [{ ...note, updatedAt: 9 }], []);
  assert.equal(merged.notes[0].html, html);
});

test("the stored-note cap is a hard boundary the panel checks BEFORE saving", () => {
  assert.equal(m.MAX_NOTE_HTML_LENGTH, 60000);
  // `normalizeNote` truncates silently — that is exactly why NotesPanel refuses
  // to save an over-long note instead of letting this happen to it.
  const over = "<p>" + "x".repeat(m.MAX_NOTE_HTML_LENGTH) + "</p>";
  assert.equal(m.normalizeNote({ id: "n", html: over }).html.length, m.MAX_NOTE_HTML_LENGTH);
  assert.ok(over.length > m.MAX_NOTE_HTML_LENGTH);
});

// ── 5. Commands ────────────────────────────────────────────────────────────

test("slash commands: the documented set, filterable by title and alias", () => {
  assert.deepEqual(
    m.NOTE_BLOCK_COMMANDS.map((c) => c.key),
    ["paragraph", "heading1", "heading2", "heading3", "bulletList", "numberedList", "checklist", "quote", "code", "divider"],
  );
  assert.equal(m.filterNoteCommands("").length, 10);
  assert.deepEqual(m.filterNoteCommands("head").map((c) => c.key), ["heading1", "heading2", "heading3"]);
  assert.deepEqual(m.filterNoteCommands("list").map((c) => c.key), ["bulletList", "numberedList", "checklist"]);
  assert.deepEqual(m.filterNoteCommands("todo").map((c) => c.key), ["checklist"]);
  assert.deepEqual(m.filterNoteCommands("hr").map((c) => c.key), ["divider"]);
  assert.deepEqual(m.filterNoteCommands("zzzz"), []);
});

test("the document API: load → read round-trips inside a real editor instance", () => {
  const editor = m.createNoteEditor();
  const html = '<p>hello <strong>world</strong></p><ul><li data-checked="true">x</li></ul><table><tbody><tr><td>t</td></tr></tbody></table>';
  m.loadNoteBody(editor, html);
  assert.deepEqual(editor.document.map((b) => b.type), ["paragraph", "checkListItem", "legacyHtml"]);
  assert.equal(m.readNoteBody(editor), html);
  assert.equal(m.isNoteBodyEmpty(editor), false);
  m.loadNoteBody(editor, "");
  assert.equal(editor.document.length, 1);
  assert.equal(m.readNoteBody(editor), "");
  assert.equal(m.isNoteBodyEmpty(editor), true);
});

test("the schema is exactly the documented blocks, styles and inline content", () => {
  assert.deepEqual(
    Object.keys(m.noteSchema.blockSpecs).sort(),
    ["bulletListItem", "checkListItem", "codeBlock", "divider", "heading", "legacyHtml", "numberedListItem", "paragraph", "quote"],
  );
  assert.deepEqual(
    Object.keys(m.noteSchema.styleSpecs).sort(),
    ["backgroundColor", "bold", "code", "italic", "strike", "sub", "sup", "textColor", "underline"],
  );
  // No file / media / table blocks: nothing that would need a panel we did not build.
  for (const forbidden of ["image", "video", "audio", "file", "table", "toggleListItem"]) {
    assert.equal(m.noteSchema.blockSpecs[forbidden], undefined, forbidden);
  }
  assert.equal(m.isNoteLinkAllowed("https://a.b"), true);
  assert.equal(m.isNoteLinkAllowed("mailto:a@b.c"), true);
  assert.equal(m.isNoteLinkAllowed("javascript:alert(1)"), false);
  assert.equal(m.isNoteLinkAllowed("data:text/html,x"), false);
});
