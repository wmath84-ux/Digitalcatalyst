// tests/noteEditorBrowser.test.mjs
//
// THE NOTE EDITOR IN A REAL BROWSER. The fixture (tests/fixtures/noteEditorHarness)
// mounts exactly what the Course Player mounts around the notes — the player's
// keyboard provider on a `.course-player-shell`, the real SplitDeck and the real
// NotesPanel / NoteEditor — and this file drives it with real keyboard, mouse,
// touch and viewport events in headless Chromium. Built by Vite with the app's own
// plugins (React + Tailwind), so every utility class the panel relies on is real.
//
// What is proved (each is a separate test):
//   · create / edit / cancel / delete flows and their stored HTML;
//   · legacy notes open with their tables, checklists, quotes and code intact;
//   · slash menu (filter + apply), shortcuts, undo / redo, paste, links;
//   · the selection toolbar floats over a selection and never steals it;
//   · the SOFT KEYBOARD, in BOTH engines the player supports — a layout viewport
//     that resizes (Android WebView `adjustResize`, i.e. the Capacitor shell) and
//     an overlay keyboard where only the visual viewport shrinks (mobile Chrome):
//     the docked toolbar is flush with the visible bottom (no dead space, no
//     double inset), menus stay inside what is visible, a tap on a tool keeps the
//     selection and the keyboard;
//   · typing is batched (a handful of renders for 120 characters) and nothing is
//     persisted until Save; the last words survive the panel or the whole player
//     unmounting a moment after the last keystroke;
//   · 320 / 360 / 375 / 390 / 412 / 430 / 768 / 1024 px: no horizontal overflow.
//
// Needs Chromium, like tests/sanctuaryWorldBrowser.test.mjs: install Playwright's
// (`npx playwright install chromium`) or point PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
// at one. Without it every test here SKIPS with that reason.

import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";

const ROOT = process.cwd();
const FIXTURE = path.join(ROOT, "tests/fixtures/noteEditorHarness/harness.html");
const HANDLE_FIXTURE = path.join(ROOT, "tests/fixtures/noteEditorHarness/handle.html");
const OUT = path.join(ROOT, "node_modules/.cache/note-editor-browser");
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || chromium.executablePath();
const enabled = fs.existsSync(executablePath);

const browserTest = (name, fn) =>
  test(name, { timeout: 120000 }, async (t) => {
    if (!enabled) return t.skip("Install Chromium to run the real-browser note editor tests");
    return fn(t);
  });

let browser;
let server;
let origin = "";

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

before(async () => {
  if (!enabled) return;
  const { build } = await import("vite");
  const { default: react } = await import("@vitejs/plugin-react");
  const { default: tailwindcss } = await import("@tailwindcss/vite");
  fs.rmSync(OUT, { recursive: true, force: true });
  await build({
    root: ROOT,
    configFile: false,
    logLevel: "error",
    base: "./",
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": path.join(ROOT, "src") } },
    build: { outDir: OUT, emptyOutDir: true, minify: false, cssMinify: false, rollupOptions: { input: [FIXTURE, HANDLE_FIXTURE] } },
    css: { lightningcss: { errorRecovery: true } },
  });
  server = http.createServer((req, res) => {
    const file = path.join(OUT, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("content-type", MIME[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  // CI sandboxes need --no-sandbox; PLAYWRIGHT_CHROMIUM_ARGS appends more (space separated).
  const extra = (process.env.PLAYWRIGHT_CHROMIUM_ARGS || "").split(/\s+/).filter(Boolean);
  browser = await chromium.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", ...extra] });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => (server ? server.close(resolve) : resolve()));
  fs.rmSync(OUT, { recursive: true, force: true });
});

const PAGE_PATH = "/tests/fixtures/noteEditorHarness/harness.html";
const HANDLE_PATH = "/tests/fixtures/noteEditorHarness/handle.html";

/** A fresh page. `touch` = a phone-like context (coarse pointer, touch events). */
async function open({ width = 1100, height = 760, touch = false, init, pagePath = PAGE_PATH } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: touch ? 2 : 1, isMobile: touch, hasTouch: touch });
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") problems.push(`console.error: ${message.text()}`); });
  await page.goto(`${origin}${pagePath}`);
  await page.waitForSelector(pagePath === PAGE_PATH ? "[data-course-notes-add]" : "[data-note-editor] .bn-editor");
  const press = (selector) => (touch ? page.tap(selector) : page.click(selector));
  const editorReady = async () => { await page.waitForSelector("[data-note-editor] .bn-editor", { timeout: 30000 }); await page.waitForTimeout(350); };
  return { page, context, problems, press, editorReady };
}

const html = (page) => page.evaluate(() => document.querySelector(".bn-editor")?.innerHTML || "");
const bodyText = (page) => page.evaluate(() => document.querySelector(".bn-editor")?.textContent || "");
const firstVisibleRect = (page, selector) =>
  page.evaluate((s) => {
    for (const el of document.querySelectorAll(s)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    }
    return null;
  }, selector);
const status = (page) => page.$eval("[data-course-notes-status]", (el) => el.textContent);
const noteHtml = (page, id) => page.evaluate((i) => window.__notes.find((n) => n.id === i)?.html, id);

// ── Flows ──────────────────────────────────────────────────────────────────

browserTest("create: title → body → slash command → bold → Save stores the note's html dialect", async () => {
  const { page, press, editorReady, problems, context } = await open();
  await press("[data-course-notes-add]");
  await editorReady();
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("dc-note-title")), true, "a new note lands in the title");
  await page.keyboard.type("Cell biology");
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("bn-editor")), true, "Enter in the title moves into the body");
  await page.keyboard.type("Plain then ");
  await page.keyboard.press("Control+KeyB");
  await page.keyboard.type("bold");
  await page.keyboard.press("Control+KeyB");
  await page.keyboard.type(" after");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/check");
  await page.waitForSelector(".bn-ak-menu-item");
  await page.keyboard.press("Enter");
  await page.keyboard.type("revise chapter 4");
  await page.waitForTimeout(400);
  assert.equal(await status(page), "Unsaved");
  await page.click("[data-course-notes-save]");
  await page.waitForFunction(() => window.__log.includes("add"));
  assert.equal(
    await page.evaluate(() => window.__notes[0].html),
    '<h1>Cell biology</h1><hr><p>Plain then <strong>bold</strong> after</p><ul><li data-checked="false">revise chapter 4</li></ul>',
  );
  assert.equal(await page.locator("[data-course-note]").count(), 7, "the new note is in the list");
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("edit: every block round-trips; Cancel discards; Save keeps the rest of the note", async () => {
  const { page, press, editorReady, problems, context } = await open();
  await press('[data-note-id="n1"] [data-course-note-edit]');
  await editorReady();
  assert.equal(await page.$eval(".dc-note-title", (el) => el.value), "Photosynthesis");
  assert.equal(await status(page), "Synced", "an untouched note is not 'Unsaved'");
  await page.keyboard.type("SHOULD NOT PERSIST");
  await page.waitForTimeout(400);
  assert.equal(await status(page), "Unsaved");
  await press("[data-course-note-edit-cancel]");
  await page.waitForTimeout(250);
  assert.doesNotMatch(await noteHtml(page, "n1"), /SHOULD NOT/);

  await press('[data-note-id="n1"] [data-course-note-edit]');
  await editorReady();
  await page.keyboard.type(" — appended");
  await page.waitForTimeout(350);
  await press("[data-course-note-edit-save]");
  await page.waitForFunction(() => window.__log.some((l) => l.startsWith("edit:")));
  const saved = await noteHtml(page, "n1");
  assert.match(saved, /^<h1>Photosynthesis<\/h1><hr>/);
  assert.match(saved, /appended/);
  // The caret opens at the end of the body, so the words land on the last list item;
  // every other block — nested bullets, the numbered list, the bold — is untouched.
  assert.match(saved, /<ul><li>Chlorophyll<\/li><li>Stomata<ul><li>gas exchange<\/li><\/ul><\/li><\/ul><ol><li>Light reactions<\/li><li>Calvin cycle — appended<\/li><\/ol>/);
  assert.match(saved, /<p>Plants turn <strong>light<\/strong> into sugar\.<\/p>/);
  assert.deepEqual(problems, []);
  await context.close();
});

browserTest("delete is a two-step act: the card button only asks; Cancel keeps the note; confirm removes it", async () => {
  const { page, press, context } = await open();
  await press('[data-note-id="n5"] [data-course-note-delete]');
  await page.waitForSelector("[data-course-confirm-delete]");
  assert.equal(await page.evaluate(() => window.__log.length), 0, "the first tap deletes nothing");
  await press("[data-course-confirm-cancel]");
  await page.waitForTimeout(200);
  assert.equal(await page.locator('[data-note-id="n5"]').count(), 1);
  await press('[data-note-id="n5"] [data-course-note-delete]');
  await press("[data-course-confirm-delete]");
  await page.waitForFunction(() => window.__log.includes("delete:n5"));
  assert.equal(await page.locator('[data-note-id="n5"]').count(), 0);
  await context.close();
});

browserTest("legacy notes open intact: table preserved verbatim, checklist / quote / code are real blocks", async () => {
  const { page, press, editorReady, context } = await open();
  await press('[data-note-id="n3"] [data-course-note-edit]');
  await editorReady();
  assert.deepEqual(await page.$$eval(".bn-block-content", (n) => n.map((x) => x.getAttribute("data-content-type"))), ["paragraph", "legacyHtml", "paragraph"]);
  assert.equal(await page.locator(".dc-note-legacy table").count(), 1);
  await press("[data-course-note-edit-save]");
  await page.waitForFunction(() => window.__log.some((l) => l.startsWith("edit:")));
  assert.match(await noteHtml(page, "n3"), /<table><tbody><tr><th>Term<\/th><th>Meaning<\/th><\/tr><tr><td>ATP<\/td><td>Energy<\/td><\/tr><\/tbody><\/table>/, "saving an untouched note must not alter the table");

  await press('[data-note-id="n4"] [data-course-note-edit]');
  await editorReady();
  assert.deepEqual(await page.$$eval(".bn-block-content", (n) => n.map((x) => x.getAttribute("data-content-type"))), ["checkListItem", "checkListItem", "quote", "codeBlock"]);
  assert.deepEqual(await page.$$eval('[data-content-type="checkListItem"] input', (n) => n.map((x) => x.checked)), [true, false]);
  await context.close();
});

browserTest("a plain-text-only legacy note (no html field) opens with its words in the body and saves as paragraphs", async () => {
  const { page, press, editorReady, context } = await open();
  await press('[data-note-id="n5"] [data-course-note-edit]');
  await editorReady();
  assert.equal(await bodyText(page), "Plain only");
  assert.equal(await page.$eval(".dc-note-title", (el) => el.value), "", "no heading → no title; the words stay in the body");
  await press("[data-course-note-edit-save]");
  await page.waitForFunction(() => window.__log.some((l) => l.startsWith("edit:")));
  assert.equal(await noteHtml(page, "n5"), "<p>Plain only</p>");
  await context.close();
});

browserTest("offline-first: if the editor chunk cannot load, the previous editor takes over and a note can still be written and saved", async () => {
  const { page, context, press } = await open();
  // Keep the lazy import from ever resolving: abort the editor chunk, then reload.
  await context.route(/\/assets\/NoteEditor-[^/]*\.js/, (route) => route.abort("internetdisconnected"));
  await page.reload();
  await page.waitForSelector("[data-course-notes-add]");
  await press("[data-course-notes-add]");
  await page.waitForSelector("[data-course-rich-toolbar]", { timeout: 15000 });
  assert.equal(await page.locator("[data-note-editor]").count(), 0, "the block editor never mounted");
  await page.click("[data-course-note-heading-input]");
  await page.keyboard.type("Offline title");
  await page.keyboard.press("Enter");
  await page.keyboard.type("written with the fallback editor");
  await page.click("[data-course-notes-save]");
  await page.waitForFunction(() => window.__log.includes("add"));
  assert.equal(await page.evaluate(() => window.__notes[0].html), "<h1>Offline title</h1><hr>written with the fallback editor");
  await context.close();
});

browserTest("undo / redo and a clean history boundary per note", async () => {
  const { page, press, editorReady, context } = await open();
  await press("[data-course-notes-add]");
  await editorReady();
  await page.keyboard.type("T");
  await page.keyboard.press("Enter");
  await page.keyboard.type("first words");
  await page.waitForTimeout(600);
  await page.keyboard.type(" and more");
  await page.waitForTimeout(100);
  const before = await bodyText(page);
  await page.keyboard.press("Control+KeyZ");
  await page.waitForTimeout(150);
  assert.ok((await bodyText(page)).length < before.length, "Ctrl+Z undoes");
  await page.keyboard.press("Control+KeyY");
  await page.waitForTimeout(150);
  assert.equal(await bodyText(page), before, "Ctrl+Y redoes");
  // A freshly opened note starts with an EMPTY history: undo can never reach the previous note.
  await press("[data-course-notes-cancel]");
  await press('[data-note-id="n2"] [data-course-note-edit]');
  await editorReady();
  const opened = await bodyText(page);
  await page.keyboard.press("Control+KeyZ");
  await page.keyboard.press("Control+KeyZ");
  await page.waitForTimeout(150);
  assert.equal(await bodyText(page), opened);
  await context.close();
});

browserTest("every slash command creates its block: paragraph, headings 1–3, bullet, numbered, checklist, quote, divider, code", async () => {
  const { page, press, editorReady, context } = await open();
  await press("[data-course-notes-add]");
  await editorReady();
  await page.keyboard.press("Enter"); // title → body
  // [what is typed, the block type it must create, the heading level (BlockNote omits data-level for H1)]
  const commands = [
    ["/paragraph", "paragraph", null],
    ["/heading", "heading", null],
    ["/h2", "heading", "2"],
    ["/h3", "heading", "3"],
    ["/bullet", "bulletListItem", null],
    ["/numbered", "numberedListItem", null],
    ["/checklist", "checkListItem", null],
    ["/quote", "quote", null],
    ["/divider", "divider", null],
    ["/code", "codeBlock", null], // last: a code block swallows Enter and "/" as code text
  ];
  for (const [index, [query, type]] of commands.entries()) {
    // Every command but the first starts on a fresh line. After a divider the caret is
    // already on the blank paragraph BlockNote opens below it.
    if (index > 0 && commands[index - 1][1] !== "divider") await page.keyboard.press("Enter");
    await page.keyboard.type(query);
    await page.waitForSelector(".bn-ak-menu[role='listbox'] .bn-ak-menu-item");
    await page.keyboard.press("Enter");
    if (type !== "divider") await page.keyboard.type(`${type} text`);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(350);
  const blocks = await page.$$eval(".bn-block-content", (n) => n.map((b) => ({ type: b.getAttribute("data-content-type"), level: b.getAttribute("data-level") })));
  assert.deepEqual(
    blocks.map((b) => [b.type, b.level]),
    commands.map(([, type, level]) => [type, level]),
    `blocks created: ${JSON.stringify(blocks)}`,
  );
  // …and every one of them reaches the stored note: no block type is lost on the way out.
  await page.click("[data-course-notes-save]");
  await page.waitForFunction(() => window.__log.includes("add"));
  const stored = await page.evaluate(() => window.__notes[0].html);
  for (const fragment of ["<p>paragraph text</p>", "<h1>heading text</h1>", "<h2>heading text</h2>", "<h3>heading text</h3>", "<ul><li>bulletListItem text</li></ul>", "<ol><li>numberedListItem text</li></ol>", '<ul><li data-checked="false">checkListItem text</li></ul>', "<blockquote>quote text</blockquote>", "<hr>", "<pre><code>codeBlock text</code></pre>"]) {
    assert.ok(stored.includes(fragment), `${fragment} missing from: ${stored}`);
  }
  await context.close();
});

browserTest("an older Android WebView (no findLast / toReversed): typing, copy, the slash menu and Save all still work", async () => {
  // Removed BEFORE any page script runs — exactly as in a Chrome 96–109 WebView (the app's
  // browserslist floor; an Android 6 phone, minSdk 23, is stuck on 106). Measured without the editor
  // factory's stand-ins: findLast is called on every transaction, so every keystroke throws, the
  // "/" menu never opens and copy is empty; toReversed is called to serialise a selection, so
  // copy / cut come out empty too. The typed text itself still lands — a silent failure.
  const init = () => {
    for (const name of ["findLast", "findLastIndex", "toReversed"]) delete Array.prototype[name];
    window.__copied = [];
    document.addEventListener("copy", (event) => window.__copied.push(event.clipboardData ? event.clipboardData.getData("text/plain") : null));
  };
  const present = (page) => page.evaluate(() => ["findLast", "findLastIndex", "toReversed"].map((name) => typeof Array.prototype[name]));
  const { page, press, editorReady, problems, context } = await open({ init });
  assert.deepEqual(await present(page), ["undefined", "undefined", "undefined"], "the page really starts without them");
  await press("[data-course-notes-add]");
  await editorReady();
  assert.deepEqual(await present(page), ["function", "function", "function"], "the editor factory put them back");
  assert.deepEqual(await page.evaluate(() => { const keys = []; for (const key in [1]) keys.push(key); return keys; }), ["0"], "…not enumerable");
  await page.keyboard.type("Floor");
  await page.keyboard.press("Enter");
  await page.keyboard.type("typed on an older WebView");
  await page.waitForTimeout(250);
  // Copy: BlockNote serialises the selection through toReversed. The pauses let the DOM selection reach the editor state.
  await page.keyboard.press("Shift+Home");
  await page.waitForTimeout(150);
  await page.keyboard.press("Control+KeyC");
  await page.waitForTimeout(200);
  const copied = await page.evaluate(() => window.__copied);
  assert.equal(copied.length, 1, "one copy event");
  assert.equal(String(copied[0]).trim(), "typed on an older WebView", "copy puts the selection on the clipboard");
  // The slash menu: opened by a transaction that goes through findLast.
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/quote");
  await page.waitForSelector(".bn-ak-menu[role='listbox'] .bn-ak-menu-item", { timeout: 5000 });
  await page.keyboard.press("Enter");
  await page.keyboard.type("quoted");
  await page.waitForTimeout(450);
  assert.equal(await status(page), "Unsaved");
  await page.click("[data-course-notes-save]");
  await page.waitForFunction(() => window.__log.includes("add"));
  const stored = await page.evaluate(() => window.__notes[0].html);
  assert.ok(stored.includes("<h1>Floor</h1>") && stored.includes("<p>typed on an older WebView</p><blockquote>quoted</blockquote>"), stored);
  assert.deepEqual(problems, [], "no page errors on that runtime");
  await context.close();
});

browserTest("typing is batched and nothing is persisted per keystroke", async () => {
  const { page, press, editorReady, context } = await open();
  await press("[data-course-notes-add]");
  await editorReady();
  await page.keyboard.type("Perf");
  await page.keyboard.press("Enter");
  const before = await page.evaluate(() => window.__notesRenders);
  await page.keyboard.type("x".repeat(120), { delay: 0 });
  await page.waitForTimeout(700);
  const renders = (await page.evaluate(() => window.__notesRenders)) - before;
  assert.ok(renders <= 6, `120 keystrokes re-rendered NotesPanel ${renders} times — it must be a handful, not 120`);
  assert.deepEqual(await page.evaluate(() => window.__log), [], "no add / edit / delete until Save");
  await context.close();
});

browserTest("the last words survive the panel — or the whole player — unmounting right after the last keystroke", async () => {
  const { page, press, editorReady, context } = await open();
  await press("[data-course-notes-add]");
  await editorReady();
  await page.keyboard.type("Draft title");
  await page.keyboard.press("Enter");
  await page.keyboard.type("typed milliseconds before leaving");
  await page.evaluate(() => window.__harness.togglePanel()); // a tab switch: unmounts NotesPanel NOW
  await page.waitForTimeout(250);
  await page.evaluate(() => window.__harness.togglePanel());
  await editorReady();
  assert.equal(await page.$eval(".dc-note-title", (el) => el.value), "Draft title");
  assert.match(await bodyText(page), /typed milliseconds before leaving/);
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("bn-editor")), true, "a restored draft puts the caret in the body");
  // …and the player's exit effect — a PASSIVE cleanup on a PARENT — still sees the newest words.
  await page.keyboard.type(" and one more burst");
  await page.evaluate(() => window.__harness.exit());
  const session = JSON.parse(await page.evaluate(() => window.__exitSession));
  assert.equal(session.view, "compose");
  assert.equal(session.title, "Draft title");
  assert.match(session.draft, /one more burst/);
  await context.close();
});

browserTest("paste: structure becomes blocks, a table is preserved, scripts die, plain text stays literal", async () => {
  const { page, press, editorReady, context } = await open();
  const paste = (data) =>
    page.evaluate((d) => {
      const dt = new DataTransfer();
      for (const [k, v] of Object.entries(d)) dt.setData(k, v);
      document.querySelector(".bn-editor").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, data);
  await press("[data-course-notes-add]");
  await editorReady();
  await page.keyboard.press("Enter");
  await paste({ "text/html": "<h2>Pasted heading</h2><ul><li>one</li><li>two</li></ul><table><tr><td>cell</td></tr></table><script>window.__pwn=1</script>", "text/plain": "ignored" });
  await page.waitForTimeout(300);
  const pasted = await html(page);
  assert.match(pasted, /data-content-type="heading"/);
  assert.match(pasted, /data-content-type="bulletListItem"/);
  assert.equal(await page.locator(".dc-note-legacy table").count(), 1);
  assert.equal(await page.evaluate(() => window.__pwn), undefined);
  await paste({ "text/plain": "# not a heading **nor bold**\nsecond line" });
  await page.waitForTimeout(300);
  assert.match(await bodyText(page), /# not a heading \*\*nor bold\*\*/);
  await context.close();
});

browserTest("Save never truncates: an over-long note says so and cannot be saved", async () => {
  const { page, press, editorReady, context } = await open();
  await press("[data-course-notes-add]");
  await editorReady();
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "word ".repeat(13000));
    document.querySelector(".bn-editor").dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await page.waitForFunction(() => document.querySelector("[data-course-notes-status]")?.textContent === "Too long to save", null, { timeout: 15000 });
  assert.equal(await page.$eval("[data-course-notes-save]", (b) => b.disabled), true);
  await context.close();
});

browserTest("links: created from the selection toolbar with safe attributes; clicking one while editing does not navigate", async () => {
  const { page, press, editorReady, context } = await open();
  await press("[data-course-notes-add]");
  await editorReady();
  await page.keyboard.type("Links");
  await page.keyboard.press("Enter");
  await page.keyboard.type("visit docs now");
  await page.keyboard.down("Shift");
  for (let i = 0; i < 8; i += 1) await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  await page.waitForSelector('.bn-toolbar .bn-ak-button[aria-label="Create link"]');
  await page.click('.bn-toolbar .bn-ak-button[aria-label="Create link"]');
  await page.waitForSelector(".bn-ak-popover input");
  await page.keyboard.type("https://example.com/docs");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".bn-editor a");
  const link = await page.$eval(".bn-editor a", (a) => ({ href: a.getAttribute("href"), target: a.getAttribute("target"), rel: a.getAttribute("rel"), text: a.textContent }));
  assert.deepEqual(link, { href: "https://example.com/docs", target: "_blank", rel: "noopener noreferrer", text: "docs now" });
  const url = page.url();
  await page.click(".bn-editor a");
  await page.waitForTimeout(250);
  assert.equal(page.url(), url);
  assert.equal(context.pages().length, 1, "no new window");
  await context.close();
});

browserTest("desktop: the selection toolbar floats ABOVE the words, never steals the selection, and Bold works", async () => {
  const { page, press, editorReady, context } = await open();
  await press('[data-note-id="n4"] [data-course-note-edit]');
  await editorReady();
  const box = await page.$eval('[data-content-type="quote"] .bn-inline-content', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; });
  await page.mouse.move(box.x + 6, box.y + box.h / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + box.h / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForSelector(".bn-toolbar");
  const selected = await page.evaluate(() => window.getSelection().toString());
  const selectionRect = await page.evaluate(() => { const r = window.getSelection().getRangeAt(0).getBoundingClientRect(); return { top: r.top }; });
  const toolbar = await firstVisibleRect(page, ".bn-toolbar");
  assert.ok(toolbar.bottom <= selectionRect.top + 1, "above the selection");
  assert.deepEqual(await page.$$eval(".bn-toolbar .bn-ak-button", (n) => n.map((b) => (b.getAttribute("aria-label") || b.textContent.trim()))), ["Quote", "Bold", "Italic", "Underline", "Strike", "Code", "Create link"]);
  await page.click('.bn-toolbar .bn-ak-button[aria-label="Bold"]');
  assert.equal(await page.evaluate(() => window.getSelection().toString()), selected, "the selection survives the click");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("bn-editor")), true);
  assert.ok((await page.$$eval('[data-content-type="quote"] strong', (n) => n.length)) >= 1);
  await context.close();
});

browserTest("desktop: hovering a block reveals insert + handle; the handle menu moves or deletes the block", async () => {
  const { page, press, editorReady, context } = await open();
  await press('[data-note-id="n4"] [data-course-note-edit]');
  await editorReady();
  const point = await page.$eval('[data-content-type="quote"]', (e) => { const r = e.getBoundingClientRect(); return { x: r.x + 60, y: r.y + r.height / 2 }; });
  await page.mouse.move(point.x, point.y);
  await page.waitForSelector(".bn-side-menu .bn-ak-button");
  assert.equal(await page.locator(".bn-side-menu .bn-ak-button").count(), 2);
  await page.click('.bn-side-menu .bn-ak-button[draggable="true"]');
  await page.waitForSelector(".bn-ak-menu-item");
  assert.deepEqual(await page.$$eval(".bn-ak-menu-item", (n) => n.map((x) => x.textContent.trim())), ["Move up", "Move down", "Delete block"]);
  await page.click(".bn-ak-menu-item:has-text('Delete block')");
  await page.waitForTimeout(250);
  assert.deepEqual(await page.$$eval(".bn-block-content", (n) => n.map((x) => x.getAttribute("data-content-type"))), ["checkListItem", "checkListItem", "codeBlock"]);
  await context.close();
});

// ── The programmatic handle: the ONE surface NotesPanel uses ───────────────

browserTest("the editor handle: load, read, isEmpty, focus, reset, read-only, undo, redo", async () => {
  const { page, context, problems } = await open({ pagePath: HANDLE_PATH });
  const call = (fn, ...args) => page.evaluate(([name, a]) => window.__handle()[name](...a), [fn, args]);
  await page.waitForTimeout(300);

  // read / isEmpty — the model the panel stores
  assert.deepEqual(await call("read"), { title: "Hello", bodyHtml: "<p>World</p>" });
  assert.equal(await call("isEmpty"), false);

  // load — replaces the whole document (title included) and starts a clean history
  await call("load", { title: "New", bodyHtml: '<h2>Head</h2><ul><li data-checked="true">x</li></ul><table><tbody><tr><td>t</td></tr></tbody></table>' });
  assert.equal(await page.$eval(".dc-note-title", (el) => el.value), "New");
  assert.deepEqual(await page.$$eval(".bn-block-content", (n) => n.map((x) => x.getAttribute("data-content-type"))), ["heading", "checkListItem", "legacyHtml"]);
  assert.deepEqual(await call("read"), { title: "New", bodyHtml: '<h2>Head</h2><ul><li data-checked="true">x</li></ul><table><tbody><tr><td>t</td></tr></tbody></table>' });
  assert.equal(await call("undo"), false, "loading a note can never be undone into the previous one");
  assert.equal(await page.evaluate(() => window.__events.dirty.at(-1)), false, "a freshly loaded note is not dirty");

  // focus — title, then body at either end
  await call("focusTitle");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("dc-note-title")), true);
  await call("focusBody", "end");
  await page.keyboard.type(" END");
  await page.waitForTimeout(350);
  assert.match((await call("read")).bodyHtml, /<table>/, "typing at the end touched only the last text block");
  assert.equal(await page.evaluate(() => window.__events.dirty.at(-1)), true);
  await call("focusBody", "start");
  await page.keyboard.type("START ");
  assert.match((await call("read")).bodyHtml, /^<h2>START Head<\/h2>/);

  // undo / redo through the handle
  assert.equal(await call("undo"), true);
  assert.equal(await call("redo"), true);
  assert.match((await call("read")).bodyHtml, /START Head/);

  // read-only goes through the same renderer
  await call("setReadOnly", true);
  assert.equal(await page.$eval(".bn-editor", (el) => el.getAttribute("contenteditable")), "false");
  assert.equal(await page.$eval(".dc-note-title", (el) => el.readOnly), true);
  const frozen = await call("read");
  await page.click(".bn-editor [data-content-type='heading']");
  await page.keyboard.type("nope");
  assert.deepEqual(await call("read"), frozen, "a read-only note ignores typing");
  await call("setReadOnly", false);
  assert.equal(await page.$eval(".bn-editor", (el) => el.getAttribute("contenteditable")), "true");
  assert.equal(await page.$eval(".dc-note-title", (el) => el.readOnly), false);

  // reset — a blank note, clean history
  await call("reset");
  assert.equal(await call("isEmpty"), true);
  assert.deepEqual(await call("read"), { title: "", bodyHtml: "" });
  assert.equal(await call("undo"), false);
  assert.equal(await page.evaluate(() => window.__events.empty.at(-1)), true);

  // the save shortcut is reported, never acted on, by the editor
  await call("focusBody", "end");
  await page.keyboard.press("Control+Enter");
  assert.equal(await page.evaluate(() => window.__events.saves), 1);
  assert.deepEqual(problems, []);
  await context.close();
});

// ── The soft keyboard, in both engines the player supports ─────────────────

/** Overlay engine: the layout viewport keeps its height, only the visual one shrinks. */
const overlayKeyboardInit = () => {
  const fake = new EventTarget();
  Object.assign(fake, { width: 390, height: window.innerHeight, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 });
  Object.defineProperty(window, "visualViewport", { value: fake, configurable: true });
  window.__setVV = (height) => { fake.height = height; fake.dispatchEvent(new Event("resize")); };
};

for (const engine of ["resize", "overlay"]) {
  browserTest(`soft keyboard (${engine} engine): docked toolbar flush with the visible bottom, menus clamped, taps keep the selection`, async () => {
    const { page, context, editorReady, problems } = await open({ width: 390, height: 844, touch: true, init: engine === "overlay" ? overlayKeyboardInit : undefined });
    const visible = () => page.evaluate(() => ({ bottom: window.visualViewport.offsetTop + window.visualViewport.height }));
    const keyboard = async (px) => {
      if (engine === "resize") await page.setViewportSize({ width: 390, height: 844 - px });
      else await page.evaluate((h) => window.__setVV(h), 844 - px);
      await page.waitForFunction((open) => window.__kb.visible === open, px > 0, { timeout: 8000 });
      await page.waitForTimeout(300);
    };

    await page.tap("[data-course-notes-add]");
    await editorReady();
    await page.keyboard.type("Keyboard test");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Some body text that we will format on a phone with a docked toolbar");
    assert.equal(await page.locator("[data-note-dock]").count(), 0, "no dock while the keyboard is closed");

    await keyboard(320);
    const deck = await page.$eval("[data-course-split-deck]", (d) => ({ takeover: d.getAttribute("data-keyboard-takeover"), pad: getComputedStyle(d).paddingBottom }));
    assert.equal(deck.takeover, "true", "the study pane takes the whole deck");
    assert.equal(deck.pad, engine === "overlay" ? "320px" : "0px", "overlay: the deck pads by the inset; resize: the layout already shrank — never both");
    const dock = await firstVisibleRect(page, "[data-note-dock]");
    assert.ok(dock, "the docked toolbar is shown");
    assert.ok(Math.abs(dock.bottom - (await visible()).bottom) <= 1.5, `dock must end at the visible bottom (dock ${dock.bottom}, visible ${(await visible()).bottom})`);
    const scroll = await firstVisibleRect(page, "[data-note-scroll]");
    assert.ok(Math.abs(scroll.bottom - dock.top) <= 1.5, "the page ends exactly where the dock begins");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal overflow");
    const dockLabels = () => page.$$eval("[data-note-dock] .bn-ak-button", (n) => n.map((b) => b.getAttribute("aria-label") || b.textContent.trim()));
    // With only a caret there is nothing to link; the link tool joins once words are selected.
    assert.deepEqual(await dockLabels(), ["Insert block", "Paragraph", "Bold", "Italic", "Underline", "Strike", "Code", "Undo", "Redo"]);

    // A tool tap keeps the selection and the keyboard.
    await page.evaluate(() => {
      const p = [...document.querySelectorAll(".bn-editor .bn-inline-content")].pop();
      const range = document.createRange();
      range.setStart(p.firstChild, 5);
      range.setEnd(p.firstChild, 9);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });
    await page.waitForTimeout(250);
    const selected = await page.evaluate(() => window.getSelection().toString());
    await page.waitForSelector('[data-note-dock] .bn-ak-button[aria-label="Create link"]');
    assert.deepEqual(await dockLabels(), ["Insert block", "Paragraph", "Bold", "Italic", "Underline", "Strike", "Code", "Create link", "Undo", "Redo"]);
    await page.tap('[data-note-dock] .bn-ak-button[aria-label="Bold"]');
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.getSelection().toString()), selected);
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("bn-editor")), true);
    assert.ok((await page.$$eval(".bn-editor strong", (n) => n.map((x) => x.textContent))).includes(selected));

    // Block type list: opens without stealing focus, inside the visible area, converts the block.
    await page.tap('[data-note-dock] [role="combobox"]');
    await page.waitForSelector(".bn-ak-select-item");
    const list = await firstVisibleRect(page, ".bn-ak-popover");
    assert.ok(list.bottom <= (await visible()).bottom + 1.5 && list.top >= -1);
    assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("bn-editor")), true);
    assert.deepEqual(await page.$$eval(".bn-ak-select-item", (n) => n.map((i) => i.textContent.trim())), ["Paragraph", "Heading 1", "Heading 2", "Heading 3", "Quote", "Bullet List", "Numbered List", "Check List", "Code"]);
    await page.tap(".bn-ak-select-item:has-text('Heading 2')");
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.bn-block-content[data-content-type="heading"][data-level="2"]').count(), 1);

    // "+" opens the slash menu above the keyboard AND above the dock.
    await page.tap('[data-note-dock] .bn-ak-button[aria-label="Insert block"]');
    await page.waitForSelector(".bn-ak-menu[role='listbox']");
    const menu = await firstVisibleRect(page, ".bn-ak-menu[role='listbox']");
    const dockNow = await firstVisibleRect(page, "[data-note-dock]");
    assert.ok(menu.bottom <= dockNow.top + 1.5, `the menu must stay clear of the dock (menu ${menu.bottom}, dock ${dockNow.top})`);
    assert.ok(menu.top >= -1);
    await page.keyboard.press("Escape");

    await keyboard(0);
    assert.equal(await page.locator("[data-note-dock]").count(), 0, "the dock goes with the keyboard");
    assert.equal(await page.$eval("[data-course-split-deck]", (d) => d.getAttribute("data-keyboard-takeover")), null, "the lesson pane is back");
    assert.deepEqual(problems, []);
    await context.close();
  });
}

// ── Responsive ─────────────────────────────────────────────────────────────

for (const width of [320, 360, 375, 390, 412, 430, 768, 1024]) {
  browserTest(`${width}px: no horizontal overflow in the list or the editor; actions reachable; title never clipped`, async () => {
    const touch = width <= 768;
    const { page, context, press, editorReady } = await open({ width, height: width >= 768 ? 900 : 800, touch });
    const overflow = () =>
      page.evaluate(() => {
        const panel = document.querySelector("[data-course-notes-panel]");
        const scroller = document.querySelector("[data-note-scroll]");
        return { doc: document.documentElement.scrollWidth - window.innerWidth, panel: panel ? panel.scrollWidth - panel.clientWidth : 0, scroller: scroller ? scroller.scrollWidth - scroller.clientWidth : 0 };
      });
    let o = await overflow();
    assert.ok(o.doc <= 0 && o.panel <= 0, `list overflow ${JSON.stringify(o)}`);
    await press('[data-note-id="n6"] [data-course-note-edit]');
    await editorReady();
    o = await overflow();
    assert.ok(o.doc <= 0 && o.panel <= 0 && o.scroller <= 0, `editor overflow ${JSON.stringify(o)} (long URL, wide table, long code line, deep nesting, long title)`);
    const m = await page.evaluate(() => {
      const rect = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, r: r.right, h: r.height }; };
      const title = document.querySelector(".dc-note-title");
      return { title: rect(".dc-note-title"), clipped: title.scrollHeight > title.clientHeight + 1, save: rect("[data-course-note-edit-save]"), cancel: rect("[data-course-note-edit-cancel]"), legacy: rect(".dc-note-legacy"), editor: rect(".bn-editor"), inner: window.innerWidth };
    });
    assert.equal(m.clipped, false, "the title auto-grows instead of clipping");
    assert.ok(m.title.l >= 0 && m.title.r <= m.inner + 0.5);
    assert.ok(m.save.r <= m.inner + 0.5 && m.cancel.l >= 0, "Save / Cancel are inside the viewport");
    assert.ok(m.save.h >= 36 && m.cancel.h >= 36, "Save / Cancel are touch-sized");
    assert.ok(m.legacy.r <= m.inner + 0.5, "the preserved table scrolls inside its block");
    if (width <= 430) assert.ok((m.editor.r - m.editor.l) / m.inner >= 0.85, "near-full width on a phone");
    if (width >= 1024) assert.ok((m.editor.r - m.editor.l) / m.inner <= 0.75, "a comfortable measure on desktop");
    await context.close();
  });
}

browserTest("the page is white and flat; the title is a bold serif; the focus ring is the caret, not a box", async () => {
  const { page, press, editorReady, context } = await open();
  await press("[data-course-notes-add]");
  await editorReady();
  const style = await page.evaluate(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s));
    const title = cs(".dc-note-title");
    const page = cs(".dc-note.bn-container");
    return {
      paper: page.backgroundColor, pageShadow: page.boxShadow, pageBorder: page.borderTopWidth,
      titleFont: title.fontFamily, titleWeight: title.fontWeight, titleAlign: title.textAlign, titleOutline: title.outlineStyle, titleBorder: title.borderTopWidth, titleBg: title.backgroundColor,
      scheme: page.colorScheme,
    };
  });
  assert.equal(style.paper, "rgb(255, 255, 255)");
  assert.equal(style.pageShadow, "none");
  assert.equal(style.pageBorder, "0px");
  assert.match(style.titleFont, /Georgia|serif/);
  assert.equal(style.titleWeight, "800");
  assert.equal(style.titleAlign, "left");
  assert.equal(style.titleOutline, "none");
  assert.equal(style.titleBorder, "0px");
  assert.equal(style.titleBg, "rgba(0, 0, 0, 0)");
  assert.equal(style.scheme, "light");
  await context.close();
});
