// tests/noteEditorContract.test.mjs
//
// SOURCE-LEVEL CONTRACT for the Course Player's block-document note editor
// (BlockNote). tests/noteEditorDataPipeline.test.mjs runs the data code and
// tests/noteEditorBrowser.test.mjs drives a real browser; this file pins the
// promises that live in the SHAPE of the code — the ones that keep the rebuild
// honest long after it ships:
//
//   1. the smallest BlockNote dependency set, pinned, in BOTH lockfiles;
//   2. the editor is rebuilt IN PLACE — NotesPanel keeps its list / session /
//      save / delete behaviour and talks to the editor only through one handle;
//   3. one editor instance, batched change handling, no React state or storage
//      write per keystroke, a flush that cannot lose the last words;
//   4. the player's ONE keyboard state is reused — no second keyboard system, no
//      hard-coded keyboard heights, the docked toolbar sits in normal flow;
//   5. the visual brief: a white continuous page, a serif title that is part of
//      the page, no card, safe areas, nothing that can overflow;
//   6. nothing that still has consumers was removed.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
const pnpmLock = read("pnpm-lock.yaml");
const notesPanel = read("src/course/NotesPanel.tsx");
const editor = read("src/course/NoteEditor.tsx");
const toolbar = read("src/course/NoteEditorToolbar.tsx");
const factory = read("src/course/noteEditor/editorFactory.ts");
const commands = read("src/course/noteEditor/editorCommands.ts");
const css = read("src/course/noteEditor/noteEditor.css");
const overlay = read("src/course/CourseOverlay.tsx");
const player = read("src/CoursePlayerApp.tsx");
const boards = read("src/nature3d/boards/StudyBoards.tsx");
const richText = read("src/utils/richText.ts");

// ── 1. Dependencies ────────────────────────────────────────────────────────

test("the BlockNote dependency set is the smallest that works, pinned exactly", () => {
  for (const name of ["@blocknote/core", "@blocknote/react", "@blocknote/ariakit"]) {
    assert.equal(pkg.dependencies[name], "0.55.0", `${name} must be pinned: BlockNote is 0.x and a minor bump can break the schema`);
  }
  // `@floating-ui/react` is imported directly (menu clamping), so it is declared
  // directly — under pnpm a transitive dependency is not resolvable from src/.
  assert.match(pkg.dependencies["@floating-ui/react"], /^0\.27\.\d+$/);
  for (const forbidden of ["@blocknote/mantine", "@blocknote/shadcn", "@blocknote/server-util", "@mantine/core", "@mantine/hooks", "yjs", "y-prosemirror"]) {
    assert.equal(pkg.dependencies[forbidden], undefined, `${forbidden} is not needed and must not be added`);
  }
  assert.equal(Object.keys(pkg.dependencies).filter((name) => name.startsWith("@blocknote/xl-")).length, 0);
  assert.equal(pkg.pnpm.overrides.sharp, "^0.34.5", "the pnpm overrides Vercel's frozen install checks are untouched");
});

test("package-lock.json and pnpm-lock.yaml agree on the BlockNote versions", () => {
  for (const name of ["core", "react", "ariakit"]) {
    assert.equal(lock.packages[`node_modules/@blocknote/${name}`].version, "0.55.0");
    assert.match(pnpmLock, new RegExp(`'@blocknote/${name}':\\n\\s+specifier: 0\\.55\\.0\\n\\s+version: 0\\.55\\.0`));
  }
  assert.equal(lock.packages[""].dependencies["@floating-ui/react"], pkg.dependencies["@floating-ui/react"]);
  assert.match(pnpmLock, new RegExp(`'@floating-ui/react':\\n\\s+specifier: ${pkg.dependencies["@floating-ui/react"].replace(/\./g, "\\.")}`));
});

// ── 2. Rebuilt in place ────────────────────────────────────────────────────

test("NotesPanel loads the editor as its own chunk and warms it before it is needed", () => {
  assert.match(notesPanel, /const loadNoteEditor = \(\) => import\("\.\/NoteEditor"\);/);
  assert.match(notesPanel, /const NoteEditor = lazy\(loadNoteEditor\);/);
  assert.doesNotMatch(notesPanel, /import NoteEditor from/);
  assert.match(notesPanel, /const warm = \(\) => \{ void loadNoteEditor\(\)\.catch\(\(\) => undefined\); \};/);
  // …in idle time (never on the critical path), with a timer fallback.
  assert.match(notesPanel, /window\.requestIdleCallback\(warm, \{ timeout: 4000 \}\)/);
  assert.match(notesPanel, /window\.setTimeout\(warm, 1500\)/);
  // …and a chunk that cannot load never blanks the pane or blocks writing.
  assert.match(notesPanel, /class EditorBoundary extends Component/);
});

test("NotesPanel talks to the editor only through its handle — no DOM, no BlockNote", () => {
  assert.doesNotMatch(notesPanel, /@blocknote/);
  assert.doesNotMatch(notesPanel, /document\.(querySelector|getElementById)|contentEditable|execCommand|\.innerHTML\s*=/);
  assert.match(notesPanel, /const editorRef = useRef<NoteEditorHandle \| null>\(null\);/);
  // Save writes what the editor holds NOW (flushed), not the debounced copy.
  assert.match(notesPanel, /const live = editorRef\.current\?\.read\(\);/);
  for (const method of ["load", "read", "isEmpty", "focusTitle", "focusBody", "reset", "setReadOnly", "undo", "redo"]) {
    assert.match(read("src/course/noteEditor/editorTypes.ts"), new RegExp(`\\b${method}: `), `NoteEditorHandle.${method}`);
  }
});

test("one editor instance per open note: the panel keys it by the note's identity", () => {
  assert.match(notesPanel, /<NoteEditor\s+key=\{seed\.key\}/);
  assert.match(notesPanel, /key: `edit:\$\{note\.id\}`|setSeed\(\{ key: `edit:\$\{note\.id\}`/);
  assert.match(notesPanel, /setSeed\(\{ key: `compose:\$\{composeCount\.current\}`/);
  assert.match(editor, /const \[editor\] = useState<NoteEditorInstance>\(\(\) => \{/);
  assert.doesNotMatch(editor, /useCreateBlockNote/);
  // The importer runs once, when the instance is made — never on a re-render.
  assert.equal((editor.match(/importLegacyHtml\(initialBodyHtml\)/g) || []).length, 1);
});

test("save semantics are the existing ones: explicit Save / Cancel, session sync, delete confirm", () => {
  assert.match(notesPanel, /onAdd\(html\);/);
  assert.match(notesPanel, /onEdit\(editingId, html\);/);
  assert.match(notesPanel, /combineHtml\(live \? live\.title : fallbackTitle, live \? live\.bodyHtml : fallbackBody\)/);
  assert.match(notesPanel, /setNotesSessionView\(\{ view: "compose", draft, title: draftTitle \}, sessionKey\)/);
  assert.match(notesPanel, /setNotesSessionView\(\{ view: "edit", noteId: editingId, draft: editDraft, title: editTitle \}, sessionKey\)/);
  assert.match(notesPanel, /<ConfirmDeleteDialog/);
  for (const hook of [
    "data-course-notes-save", "data-course-notes-cancel", "data-course-note-edit-save", "data-course-note-edit-cancel",
    "data-course-notes-composer", "data-course-notes-input", "data-course-note-edit-input", "data-course-notes-add",
  ]) {
    assert.match(notesPanel, new RegExp(hook), `${hook} test hook is kept`);
  }
});

test("Save never truncates silently: the stored-note cap is checked first", () => {
  assert.match(notesPanel, /import \{ MAX_NOTE_HTML_LENGTH \} from "\.\.\/\.\.\/utils\/courseNotes";/);
  assert.equal((notesPanel.match(/html\.length > MAX_NOTE_HTML_LENGTH\) \{ setTooLong\(true\); return; \}/g) || []).length, 2, "both Save paths");
  assert.match(notesPanel, /disabled=\{empty \|\| tooLong\}/);
});

test("the subtle status chip: Unsaved · Saving… · Saved · Synced, fed by the persistence hook", () => {
  assert.match(notesPanel, /function NoteStatus\(/);
  for (const label of ["Unsaved", "Saving…", "Synced", "Saved"]) assert.match(notesPanel, new RegExp(`"${label}"`));
  assert.match(notesPanel, /role="status"/);
  assert.match(overlay, /syncState=\{props\.notesSync\}/);
  assert.match(player, /notesSync=\{\{ status: notesCtl\.status, synced: notesCtl\.synced \}\}/);
  assert.match(boards, /syncState=\{\{ status: notes\.status,/);
});

// ── 3. Engine behaviour ────────────────────────────────────────────────────

test("changes are batched; no React state and no storage write per keystroke", () => {
  assert.match(editor, /const EMIT_DELAY_MS = 250;/);
  assert.match(editor, /const EMIT_MAX_WAIT_MS = 1500;/);
  assert.match(editor, /onChange=\{schedule\}/);
  // Booleans notify on a FLIP only; the draft goes out through one batched callback.
  assert.match(editor, /if \(empty !== flags\.current\.empty\)/);
  assert.match(editor, /if \(dirty !== flags\.current\.dirty\)/);
  assert.doesNotMatch(editor, /useState<(string|NoteDraft)/);
  assert.doesNotMatch(editor, /localStorage|sessionStorage|\b(setDoc|addDoc|updateDoc)\(|\bfetch\(/);
  // The title is uncontrolled — typing in it never re-renders React.
  assert.match(editor, /element\.value = initialTitle;/);
});

test("the last words can never be lost: flush on hide, on page leave and — before any passive cleanup — on unmount", () => {
  assert.match(editor, /window\.addEventListener\("pagehide", flush\)/);
  assert.match(editor, /document\.visibilityState === "hidden"/);
  assert.match(editor, /useLayoutEffect\(\(\) => \(\) => \{ if \(pending\.current\) flushNow\(\); \}, \[flushNow\]\);/);
  // A detached title field must not blank the title during that final flush.
  assert.match(editor, /const titleText = useRef\(initialTitle\.trim\(\)\);/);
  // The panel drops a flush that arrives after Save / Cancel closed the editor.
  assert.match(notesPanel, /if \(discardingRef\.current\) return;/);
  assert.match(notesPanel, /discardingRef\.current = true;/);
});

test("the engine's runtime floor: BlockNote's unguarded ES2023 array calls are covered before any editor exists", () => {
  const runtime = read("src/course/noteEditor/editorRuntime.ts");
  // The app promises Chrome 96+ and minSdk 23; TipTap 3 calls findLast (Chrome 97) on every
  // transaction and toReversed (Chrome 110) on copy / cut / drag, unguarded.
  assert.doesNotMatch(runtime, /^import\s/m, "self-contained — nothing for the player's other chunks to pull in");
  for (const method of ["findLast", "findLastIndex", "toReversed"]) assert.match(runtime, new RegExp(`\\["${method}",`), method);
  assert.match(runtime, /enumerable: false/, "installed like a native: a for…in over an array must not see them");
  assert.match(runtime, /typeof \(target as Record<string, unknown>\)\[name\] === "function"\) continue/, "only when absent — a native is never replaced");
  assert.match(factory, /import \{ installRuntimeCompat \} from "\.\/editorRuntime";/);
  assert.match(factory, /export function createNoteEditor[\s\S]*?installRuntimeCompat\(\);[\s\S]*?BlockNoteEditor\.create\(/, "installed before the first transaction can exist");
  assert.doesNotMatch(notesPanel + overlay + player, /installRuntimeCompat|editorRuntime/, "the player's other chunks never import it");
});

test("the schema, links and paste are the player's: allow-listed links, literal plain text, one importer", () => {
  assert.match(factory, /const SAFE_LINK = \/\^\(https\?:\|mailto:\|tel:\)\/i;/);
  assert.match(factory, /isValidLink: isNoteLinkAllowed/);
  assert.match(factory, /plainTextAsMarkdown: false/);
  assert.match(factory, /animations: false/);
  assert.match(editor, /sanitizeRichText\(html\)/);
  assert.match(editor, /importLegacyHtml\(clean\)/);
  assert.match(factory, /legacyHtml: legacyHtmlBlock\(\)/);
  assert.match(commands, /tr\.setMeta\("addToHistory", false\)/);
});

test("read-only goes through the same renderer", () => {
  assert.match(editor, /editable=\{!readOnly\}/);
  assert.match(editor, /editor\.isEditable = !readOnly;/);
  assert.match(editor, /setReadOnly: \(value\) =>/);
});

// ── 4. The player's one keyboard state ─────────────────────────────────────

test("the editor reuses the player's keyboard state and adds no second keyboard system", () => {
  assert.match(editor, /import \{ useCourseKeyboard \} from "\.\/useCourseKeyboard";/);
  assert.match(editor, /const \{ keyboardVisible \} = useCourseKeyboard\(\);/);
  for (const source of [editor, toolbar, factory, commands]) {
    assert.doesNotMatch(source, /addEventListener\("(resize|orientationchange|focusin|focusout|scroll)"/);
    assert.doesNotMatch(source, /visualViewport(\?|!)?\.(addEventListener|removeEventListener)/);
    assert.doesNotMatch(source, /\bFormattingToolbarController\b|MobileFormattingToolbarController|useVirtualKeyboard/);
    assert.doesNotMatch(source, /data-course-keyboard|--course-kb-inset|--bn-vv-/);
  }
  // The visual viewport is only MEASURED (to clamp menus), never listened to.
  assert.match(editor, /window\.visualViewport/);
});

test("no hard-coded keyboard heights or bottom offsets; the docked toolbar is in normal flow", () => {
  for (const [name, source] of [["NoteEditor.tsx", editor], ["NoteEditorToolbar.tsx", toolbar], ["noteEditor.css", css]]) {
    assert.doesNotMatch(source, /\b(280|300|320|336|340)\s*px/, `${name} must not carry a keyboard-sized constant`);
  }
  assert.doesNotMatch(css, /position:\s*fixed/);
  assert.doesNotMatch(css, /(^|[^-])bottom:\s*-?\d+(\.\d+)?(px|rem)/m);
  assert.match(css, /\.dc-note \.dc-note-dock \{[^}]*position: relative;/);
  assert.match(editor, /const docked = !readOnly && keyboardVisible && \(focused \|\| dockFocused\);/);
  // Taps on the toolbar never move focus out of the writing surface.
  assert.match(toolbar, /preventFocusOnTap/);
  assert.match(toolbar, /<UIModeContext\.Provider value="mobile">/);
});

test("menus portal to <body> (never clipped by the player) and clamp to the visible area", () => {
  assert.match(editor, /portalElements=\{portalElements\}/);
  assert.match(editor, /\{ default: typeof document !== "undefined" \? document\.body : undefined \}/);
  assert.match(editor, /const visibleRect = \(\) =>/);
  assert.match(editor, /\[data-note-dock\]/);
  assert.match(editor, /withVisibleBoundary/);
  assert.match(editor, /zIndex: 130/);
});

// ── 5. The visual brief ────────────────────────────────────────────────────

test("a white continuous page: no card, no frame, no glass", () => {
  assert.match(css, /--dc-note-paper: #ffffff;/);
  assert.match(css, /\.dc-note\.bn-container \{[^}]*background: var\(--dc-note-paper\);/);
  for (const selector of [".dc-note.bn-container", ".dc-note .dc-note-shell", ".dc-note .dc-note-page", ".dc-note .dc-note-scroll"]) {
    const block = css.match(new RegExp(`${selector.replace(/[.]/g, "\\.")} \\{[^}]*\\}`));
    assert.ok(block, selector);
    assert.doesNotMatch(block[0], /box-shadow|backdrop-filter|border(?!-box)|border-radius/, `${selector} must stay a flat page`);
  }
  assert.match(css, /color-scheme: light;/);
  assert.match(notesPanel, /className="flex h-full flex-col overflow-hidden bg-white"/);
});

test("the title is a large bold left-aligned serif, part of the page — not an input card", () => {
  const title = css.match(/\.dc-note \.dc-note-title \{[^}]*\}/)[0];
  assert.match(title, /font-family: var\(--dc-note-serif\);/);
  assert.match(title, /font-weight: 800;/);
  assert.match(title, /text-align: left;/);
  assert.match(title, /border: 0;/);
  assert.match(title, /background: transparent;/);
  assert.match(css, /--dc-note-serif: [^;]*Georgia[^;]*serif;/);
  assert.match(css, /\.dc-note \.dc-note-title:focus-visible \{ outline: none; box-shadow: none; \}/);
  assert.match(editor, /className="dc-note-title"/);
  assert.match(editor, /aria-label="Note title"/);
});

test("compact body, a comfortable measure, safe areas, no overflow", () => {
  assert.match(css, /font-size: 0\.9375rem;/);
  assert.match(css, /--dc-note-measure: 44rem;/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /env\(safe-area-inset-right\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.dc-note \.dc-note-scroll \{[^}]*overflow-x: hidden;/);
  assert.match(css, /overflow-wrap: anywhere;/);
  assert.match(css, /@media \(min-width: 768px\)/);
  assert.match(css, /@media \(pointer: coarse\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("only BlockNote's structural stylesheet is imported — no default UI skin", () => {
  assert.match(editor, /import "@blocknote\/react\/style\.css";/);
  assert.match(editor, /import "\.\/noteEditor\/noteEditor\.css";/);
  for (const source of [editor, toolbar, css]) {
    assert.doesNotMatch(source, /@blocknote\/(ariakit|mantine|shadcn)\/style\.css|@blocknote\/core\/fonts/);
  }
  // Both the editor container and the floating wrappers under <body> are themed
  // by the same `.dc-note` class.
  assert.match(editor, /className="dc-note"/);
});

// ── 6. Nothing with consumers was removed ──────────────────────────────────

test("the previous editor stays: My Day still uses it and it is the emergency fallback", () => {
  assert.ok(fs.existsSync(path.join(root, "src/course/RichTextEditor.tsx")));
  assert.match(read("src/components/myday/QuickNotes.tsx"), /import RichTextEditor from "\.\.\/\.\.\/course\/RichTextEditor";/);
  assert.match(notesPanel, /import RichTextEditor from "\.\/RichTextEditor";/);
});

test("the player's exit rescue, panel session and keyboard files are untouched in behaviour", () => {
  assert.match(player, /combineHtml\(sessionNotes\.title, sessionNotes\.draft\)/);
  assert.match(player, /appendCloudNote\(user\.id, storageProductId, \{/);
  assert.match(player, /patchCloudNote\(user\.id, storageProductId, sessionNotes\.noteId, safeHtml\);/);
  assert.match(read("src/course/coursePanelSession.ts"), /notes: \{ view: "list" \}/);
  assert.match(read("src/course/useCourseKeyboard.tsx"), /export const useCourseKeyboard = \(\): CourseKeyboardState => useContext\(CourseKeyboardContext\);/);
});

test("the sanitiser gained exactly one attribute: data-checked on <li>", () => {
  assert.match(richText, /li: new Set\(\["value", "data-checked"\]\)/);
  assert.equal((richText.match(/data-checked/g) || []).length >= 3, true);
  assert.doesNotMatch(richText, /data-\*|startsWith\("data-"\)/);
});
