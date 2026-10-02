// tests/myDayQuickNotesBigEditorContract.test.mjs
//
// Contract: My Day's quick notes use the COURSE PLAYER'S note editor — the
// BlockNote block-document page (src/course/NoteEditor.tsx) — not a second,
// My Day-local editor. The owner's direction: "My Day ke notes editor ke liye
// bhi vahi exactly vahi Note editor jo course player ke andar hai, vahi yahan
// per bhi implement karo… purana wala delete karke."
//
// What is pinned here is the shape that keeps the two in step:
//   • the editor is IMPORTED from the course player (its own lazy chunk, warmed
//     while the grid is on screen) — never copied, never re-implemented;
//   • it is wired exactly as src/course/NotesPanel.tsx wires it: uncontrolled,
//     opened once from a seed, keyed by the note's identity, read through the
//     handle on Save, batched draft reporting, Ctrl/Cmd+Enter to save;
//   • the editor REPLACES the grid while open, so the white page gets the whole
//     card and scrolls internally;
//   • the previous RichTextEditor survives ONLY as the boundary fallback for a
//     chunk that fails to load offline — the same emergency exit the course
//     player keeps, bound to the same draft.
//
// Pure code-shape — no React, no DOM, no browser.
// (tests/myDayQuickNotesEditorRuntime.test.mjs mounts the real thing.)

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const quickNotes = fs.readFileSync("src/components/myday/QuickNotes.tsx", "utf8");
const notesPanel = fs.readFileSync("src/course/NotesPanel.tsx", "utf8");

test("the editor is the course player's, imported — not a second implementation", () => {
  // The same module the course player loads, as its own lazy chunk.
  assert.match(quickNotes, /const loadNoteEditor = \(\) => import\("\.\.\/\.\.\/course\/NoteEditor"\);/);
  assert.match(quickNotes, /const NoteEditor = lazy\(loadNoteEditor\);/);
  assert.match(quickNotes, /<NoteEditor$/m);
  // The handle + draft types come from the editor's own module, not a copy.
  assert.match(quickNotes, /import type \{ NoteDraft, NoteEditorHandle \} from "\.\.\/\.\.\/course\/noteEditor\/editorTypes";/);
  // Nothing in My Day re-implements an editor: no contentEditable surface, no
  // execCommand, no textarea-as-editor, no second toolbar.
  for (const forbidden of [/contentEditable/, /execCommand/, /<textarea/, /document\.queryCommandState/]) {
    assert.doesNotMatch(quickNotes, forbidden, "My Day must not carry its own editor implementation");
  }
});

test("the chunk is warmed while the grid is on screen, in idle time", () => {
  assert.match(quickNotes, /const warm = \(\) => \{ void loadNoteEditor\(\)\.catch\(\(\) => undefined\); \};/);
  assert.match(quickNotes, /window\.requestIdleCallback\(warm, \{ timeout: 4000 \}\)/);
  assert.match(quickNotes, /window\.setTimeout\(warm, 1500\)/);
  // Same as the course player: code only, no editor instance until a note opens.
  assert.match(notesPanel, /const warm = \(\) => \{ void loadNoteEditor\(\)\.catch\(\(\) => undefined\); \};/);
});

test("the editor is uncontrolled, seeded once and keyed by the note's identity", () => {
  assert.match(quickNotes, /key=\{seed\.key\}/);
  assert.match(quickNotes, /ref=\{editorRef\}/);
  assert.match(quickNotes, /initialTitle=\{seed\.title\}/);
  assert.match(quickNotes, /initialBodyHtml=\{seed\.body\}/);
  // A fresh note lands in the title, a note that already has words in the body.
  assert.match(quickNotes, /autoFocus=\{editing \|\| seed\.title \|\| seed\.body \? "body" : "title"\}/);
  // The seed is replaced on open — never fed back on every keystroke.
  assert.match(quickNotes, /setSeed\(\{ key: `edit:\$\{note\.id\}`, title: heading, body \}\);/);
  assert.match(quickNotes, /setSeed\(\{ key: `compose:\$\{composeCount\.current\}`, title: "", body: "" \}\);/);
  // The block editor is UNCONTROLLED: no `value` / `onChange` pair anywhere in
  // its props (only the offline RichTextEditor fallback is controlled).
  const from = quickNotes.indexOf("<NoteEditor");
  const block = quickNotes.slice(from, quickNotes.indexOf("/>", from));
  assert.ok(block.length > 0, "the NoteEditor element must exist");
  assert.doesNotMatch(block, /\bvalue=\{|\bonChange=\{/, "the block editor owns its content");
});

test("Save reads through the handle, so the last words are never lost", () => {
  // `read()` flushes the editor's debounce first and returns the live model.
  assert.match(quickNotes, /const live = editorRef\.current\?\.read\(\);/);
  assert.match(quickNotes, /return combineHtml\(live \? live\.title : fallbackTitle, live \? live\.bodyHtml : fallbackBody\);/);
  assert.match(quickNotes, /const html = currentHtml\(draftTitle, draft\);/);
  assert.match(quickNotes, /const html = currentHtml\(editTitle, editDraft\);/);
  // An empty note is never written, and the cap is checked BEFORE writing.
  assert.match(quickNotes, /if \(isEmptyRichText\(html\)\) return;/);
  assert.match(quickNotes, /if \(html\.length > MAX_NOTE_HTML_LENGTH\) \{ setTooLong\(true\); return; \}/);
  assert.match(quickNotes, /import \{ MAX_NOTE_HTML_LENGTH \} from "\.\.\/\.\.\/\.\.\/utils\/courseNotes";/);
});

test("typing is batched: one draft report, not one React render per keystroke", () => {
  assert.match(quickNotes, /onDraftChange=\{handleDraftChange\}/);
  assert.match(quickNotes, /onEmptyChange=\{setEditorEmpty\}/);
  assert.match(quickNotes, /onDirtyChange=\{setDirty\}/);
  // A draft that arrives after Save / Cancel closed the editor is dropped.
  assert.match(quickNotes, /if \(discardingRef\.current\) return;/);
  assert.match(quickNotes, /discardingRef\.current = true;/);
  // Ctrl / Cmd + Enter saves from inside the editor.
  assert.match(quickNotes, /onSaveShortcut=\{editing \? submitEdit : submitAdd\}/);
});

test("the editor replaces the grid and gets the whole card", () => {
  // The editor branch comes first and returns; the grid is the fallthrough.
  const editorIndex = quickNotes.indexOf("data-myday-notes-editor");
  const listIndex = quickNotes.indexOf('className="grid grid-cols-2 gap-3.5 sm:grid-cols-3"');
  assert.ok(editorIndex !== -1 && listIndex !== -1, "both views must exist");
  assert.ok(editorIndex < listIndex, "the editor view must come before the grid view");
  assert.match(quickNotes, /if \(editorOpen\) \{/);
  // A real height (not a max-height the flex column can collapse through), and
  // the white page fills what is left under the slim bar.
  assert.match(quickNotes, /h-\[min\(72dvh,680px\)\]/);
  assert.match(quickNotes, /sm:h-\[min\(75dvh,720px\)\]/);
  assert.match(quickNotes, /className="relative min-h-0 flex-1">/);
  assert.match(quickNotes, /data-myday-notes-mode=\{editing \? "edit" : "compose"\}/);
  // The slim bar: status · Cancel · Save — the same three the player shows.
  assert.match(quickNotes, /data-myday-notes-bar/);
  assert.match(quickNotes, /data-myday-notes-status=\{tone\}/);
});

test("the previous editor stays as the offline fallback — and nothing else", () => {
  assert.match(quickNotes, /import RichTextEditor from "\.\.\/\.\.\/course\/RichTextEditor";/);
  assert.match(quickNotes, /class EditorBoundary extends Component</);
  assert.match(quickNotes, /onFail=\{\(\) => setLegacyFallback\(true\)\}/);
  // Exactly one RichTextEditor use: inside the boundary's fallback.
  assert.equal((quickNotes.match(/<RichTextEditor/g) ?? []).length, 1);
  // The fallback is bound to the same draft the block editor was using, and
  // the empty/too-long gate falls back to measuring that draft directly.
  assert.match(quickNotes, /const empty = legacyFallback \? isEmptyRichText\(combineHtml\(titleValue, value\)\) : editorEmpty;/);
  assert.match(quickNotes, /<Suspense fallback=\{<div className="h-full bg-white" aria-busy="true" data-myday-notes-editor-loading \/>\}>/);
});

test("legacy plain-text notes still open, and the stored dialect is unchanged", () => {
  // No `html` on an old note → its `text` is converted on the fly.
  assert.match(quickNotes, /note\.html \|\| plainToRichText\(note\.text \|\| ""\)/);
  // The stored note's leading heading becomes the title field; the rest stays
  // in the body — the same split the course player uses.
  assert.match(quickNotes, /const \{ heading, body \} = splitFirstHeading\(noteHtml\(note\)\);/);
  // And saving writes the same combined dialect back.
  assert.match(quickNotes, /onAdd\(html\);/);
  assert.match(quickNotes, /onEdit\(editingId, html\);/);
});
