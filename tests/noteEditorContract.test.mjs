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
//   4. the toolbar follows the CARET — it is on screen from the moment a text
//      field of the note has a cursor in it, on any device, with a soft
//      keyboard or without one — and it ends just above the player's footer
//      navigation, measured rather than assumed; all without a second keyboard
//      system, hard-coded keyboard heights, or a toolbar out of normal flow;
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
const resourceCard = read("src/course/StudyResourceCard.tsx");
const editor = read("src/course/NoteEditor.tsx");
const toolbar = read("src/course/NoteEditorToolbar.tsx");
const factory = read("src/course/noteEditor/editorFactory.ts");
const commands = read("src/course/noteEditor/editorCommands.ts");
const css = read("src/course/noteEditor/noteEditor.css");
const footerMath = read("src/course/courseFooterInset.ts");
const footerHook = read("src/course/useCourseFooterInset.ts");
const overlay = read("src/course/CourseOverlay.tsx");
const player = read("src/CoursePlayerApp.tsx");
const richText = read("src/utils/richText.ts");
const clipboard = read("src/course/noteEditor/clipboardNormalization.ts");
const mathRendering = read("src/course/noteEditor/mathRendering.ts");
const noteMath = read("src/utils/noteMath.ts");

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

test("official KaTeX rendering and the Markdown parser are direct, pinned dependencies", () => {
  assert.equal(pkg.dependencies.katex, "0.16.47");
  assert.equal(pkg.dependencies.marked, "16.4.2");
  assert.equal(lock.packages[""].dependencies.katex, pkg.dependencies.katex);
  assert.equal(lock.packages[""].dependencies.marked, pkg.dependencies.marked);
  assert.match(pnpmLock, /katex:\n\s+specifier: 0\.16\.47\n\s+version: 0\.16\.47/);
  assert.match(pnpmLock, /marked:\n\s+specifier: 16\.4\.2\n\s+version: 16\.4\.2/);
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
  assert.match(notesPanel, /setNotesSessionView\(\{ view: "compose", draft, title: draftTitle \}\)/);
  assert.match(notesPanel, /setNotesSessionView\(\{ view: "edit", noteId: editingId, draft: editDraft, title: editTitle \}\)/);
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
  assert.match(player, /notesSync=\{\{ status: notesCtl\.status, synced: notesCtl\.synced, errorMessage: notesCtl\.errorMessage \}\}/);
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

test("the schema, links and paste are the player's: safe rich/plain normalization, editable math and one importer", () => {
  assert.match(factory, /const SAFE_LINK = \/\^\(https\?:\|mailto:\|tel:\)\/i;/);
  assert.match(factory, /isValidLink: isNoteLinkAllowed/);
  assert.match(factory, /plainTextAsMarkdown: false/);
  assert.match(factory, /mathBlock: mathBlock\(\)/);
  assert.match(factory, /type: "math" as const/);
  assert.match(factory, /toExternalHTML\(inlineContent\)/);
  assert.match(factory, /toExternalHTML\(block\)/);
  assert.match(factory, /animations: false/);
  assert.match(editor, /normalizeRichClipboardHtml\(html\)/);
  assert.match(editor, /normalizePlainClipboardText\(normalised\)/);
  assert.match(editor, /looksLikeMarkdown\(normalised\)/);
  assert.match(editor, /importLegacyHtml\(clean\)/);
  assert.match(clipboard, /marked\.parse\(prepared\.text/);
  assert.match(clipboard, /scanMathText/);
  assert.match(mathRendering, /output: "htmlAndMathml"/);
  assert.match(factory, /legacyHtml: legacyHtmlBlock\(\)/);
  assert.match(commands, /tr\.setMeta\("addToHistory", false\)/);
});

test("math rendering stays bounded while resource-card identity uses safe text", () => {
  assert.match(mathRendering, /katex\.renderToString/);
  assert.match(mathRendering, /trust: false/);
  assert.match(mathRendering, /maxExpand: 500/);
  assert.match(mathRendering, /CACHE_LIMIT = 256/);
  assert.match(mathRendering, /NOTE_PREVIEW_CACHE_LIMIT = 64/);
  assert.match(noteMath, /MAX_NOTE_MATH_SOURCE_LENGTH = 4096/);
  assert.match(notesPanel, /firstRichTextBlock\(html\)/);
  assert.match(resourceCard, /data-study-resource-topic/);
  assert.doesNotMatch(notesPanel, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(mathRendering, /renderMathInElement|renderMathInDocument/);
});

test("read-only goes through the same renderer", () => {
  assert.match(editor, /editable=\{!readOnly\}/);
  assert.match(editor, /editor\.isEditable = !readOnly;/);
  assert.match(editor, /setReadOnly: \(value\) =>/);
});

// ── 4. The toolbar follows the caret, and the player's keyboard state stays single ──

test("the toolbar is gated on the CARET, not on the soft keyboard", () => {
  // A caret in any of the note's text fields is the whole condition. Gating it
  // on an open soft keyboard as well meant "no toolbar at all" on a desktop, on
  // a big tablet running the player in desktop view and in a floating window —
  // none of those ever opens a keyboard.
  assert.match(editor, /const docked = !readOnly && \(focused \|\| caretWithin \|\| dockFocused\);/);
  assert.doesNotMatch(editor, /keyboardVisible/);
  assert.doesNotMatch(editor, /useCourseKeyboard/);
  // The caret in the TITLE field counts too — the shell's own focus events see
  // it, and they are tracked on the shell so the caret moving title → body
  // never passes through a "no caret" frame that remounts the toolbar.
  assert.match(editor, /const focused = useEditorFocus\(\{ includeEditorUI: true \}\);/);
  assert.match(editor, /onFocus=\{\(\) => setCaretWithin\(true\)\}/);
  assert.match(editor, /if \(!event\.currentTarget\.contains\(event\.relatedTarget as Node \| null\)\) setCaretWithin\(false\);/);
  // Read-only still gets no toolbar at all.
  assert.match(editor, /const docked = !readOnly &&/);
});

test("the editor adds no second keyboard system", () => {
  for (const source of [editor, toolbar, factory, commands]) {
    assert.doesNotMatch(source, /addEventListener\("(resize|orientationchange|focusin|focusout|scroll)"/);
    assert.doesNotMatch(source, /visualViewport(\?|!)?\.(addEventListener|removeEventListener)/);
    assert.doesNotMatch(source, /\bFormattingToolbarController\b|MobileFormattingToolbarController|useVirtualKeyboard/);
    assert.doesNotMatch(source, /data-course-keyboard|--course-kb-inset|--bn-vv-/);
  }
  // The visual viewport is only MEASURED (to clamp menus), never listened to.
  assert.match(editor, /window\.visualViewport/);
  // The one subscription the editor's own modules do make measures a DOM box
  // (the footer navigation), never a keyboard: it computes no keyboard state,
  // so the player's single keyboard rule stays single. It may WATCH the
  // attribute that rule is published on — that is how it notices the footer
  // hiding — but it never reads the state itself.
  assert.match(footerHook, /window\.addEventListener\("resize", schedule\);/);
  // Prose may name the player's keyboard rule (it is the reason a footer can
  // vanish); the CODE must never read or compute it.
  const codeOnly = (source) => source.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const source of [footerHook, footerMath]) {
    assert.doesNotMatch(codeOnly(source), /keyboardVisible|COURSE_KEYBOARD_MIN_INSET|resolveCourseKeyboardState|measureKeyboardCoverage|useCourseKeyboard|--course-kb-inset/);
  }
  assert.match(footerHook, /"data-course-keyboard"\]/);
});

test("no hard-coded keyboard heights or bottom offsets; the docked toolbar is in normal flow", () => {
  for (const [name, source] of [["NoteEditor.tsx", editor], ["NoteEditorToolbar.tsx", toolbar], ["noteEditor.css", css]]) {
    assert.doesNotMatch(source, /\b(280|300|320|336|340)\s*px/, `${name} must not carry a keyboard-sized constant`);
  }
  assert.doesNotMatch(css, /\.dc-note \.dc-note-dock \{[^}]*position:\s*fixed/);
  assert.doesNotMatch(css, /(^|[^-])bottom:\s*-?\d+(\.\d+)?(px|rem)/m);
  assert.match(css, /\.dc-note \.dc-note-dock \{[^}]*position: relative;/);
  // Taps on the toolbar never move focus out of the writing surface.
  assert.match(toolbar, /preventFocusOnTap/);
  assert.match(toolbar, /<UIModeContext\.Provider value="mobile">/);
});

test("the toolbar ends just above the footer navigation — measured, never assumed", () => {
  // Both homes of the player's footer navigation, in one selector.
  assert.match(footerMath, /export const COURSE_FOOTER_SELECTOR = "\[data-course-peek-dock\], \[data-course-dock\]";/);
  // The lift is the px of the writing surface's bottom edge the footer covers,
  // so the overlaying peek dock is cleared and the in-flow dock needs nothing.
  assert.match(footerMath, /const covered = Math\.min\(surface\.bottom, footer\.bottom\) - footer\.top;/);
  assert.match(footerMath, /if \(covered < COURSE_FOOTER_MIN_INSET\) return 0;/);
  // A footer that is not on screen — hidden by the keyboard rule, or absent
  // from the player entirely — lifts nothing: no phantom gap above nothing.
  assert.match(footerMath, /if \(footer\.height <= 0\) return 0;/);
  assert.match(footerMath, /if \(!surface \|\| !footer\) return 0;/);
  // Published as a custom property, applied as a MARGIN (the bar's own paper
  // stops where the footer begins), and never as a fixed offset or a constant.
  assert.match(footerMath, /export const COURSE_FOOTER_INSET_PROPERTY = "--dc-note-footer-inset";/);
  assert.match(css, /\.dc-note \.dc-note-dock \{[^}]*margin-bottom: var\(--dc-note-footer-inset, 0px\);/);
  assert.match(editor, /const footerInset = useCourseFooterInset\(docked, shellRef\);/);
  assert.match(editor, /shell\.style\.setProperty\(COURSE_FOOTER_INSET_PROPERTY, `\$\{footerInset\}px`\);/);
  assert.match(editor, /shell\.style\.removeProperty\(COURSE_FOOTER_INSET_PROPERTY\);/);
  // Measured in a LAYOUT effect, so the first frame the toolbar appears it is
  // already clear of the footer — the learner never sees it jump.
  assert.match(footerHook, /useLayoutEffect\(\(\) => \{/);
  // It only runs while there is a toolbar to place.
  assert.match(footerHook, /export const useCourseFooterInset = \(active: boolean, surfaceRef: RefObject<Element \| null>\): number =>/);
  assert.match(footerHook, /if \(!active\) \{\s*setInset\(0\);/);
  // A footer that is swapped for its other home (the player's footer-dock
  // setting) or hidden by the keyboard rule is picked up without a remount.
  assert.match(footerHook, /new MutationObserver\(\(records\) => \{/);
  assert.match(footerHook, /attributeFilter: \["class", "style", "hidden", "data-open", "data-course-keyboard"\]/);
  assert.match(footerHook, /observer = new ResizeObserver\(schedule\);/);
  // One read per frame, and a read that answers the same number re-renders nothing.
  assert.match(footerHook, /frame = window\.requestAnimationFrame\(read\);/);
  assert.match(footerHook, /setInset\(\(current\) => \(current === next \? current : next\)\);/);
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

test("the previous editor stays as the course notes panel's implementation", () => {
  // The planner's Quick Notes used to import this editor too; it is retired,
  // so the course notes panel is the remaining consumer — and the file is kept
  // because that panel still needs it.
  assert.ok(fs.existsSync(path.join(root, "src/course/RichTextEditor.tsx")));
  assert.match(notesPanel, /import RichTextEditor from "\.\/RichTextEditor";/);
});

test("the player's exit rescue, panel session and keyboard files are untouched in behaviour", () => {
  assert.match(player, /combineHtml\(sessionNotes\.title, sessionNotes\.draft\)/);
  assert.match(player, /appendCloudNote\(user\.id, storageProductId, \{/);
  assert.match(player, /patchCloudNote\(user\.id, storageProductId, sessionNotes\.noteId, safeHtml\);/);
  assert.match(read("src/course/coursePanelSession.ts"), /notes: \{ view: "list" \}/);
  assert.match(read("src/course/useCourseKeyboard.tsx"), /export const useCourseKeyboard = \(\): CourseKeyboardState => useContext\(CourseKeyboardContext\);/);
});

test("sanitizer tightly allow-lists task state and source-only math markers", () => {
  assert.match(richText, /li: new Set\(\["value", "data-checked"\]\)/);
  assert.match(richText, /span: new Set\(\["data-note-math", "data-latex"\]\)/);
  assert.match(richText, /div: new Set\(\["data-note-math", "data-latex"\]\)/);
  assert.match(richText, /tag === "span" && mathMode === "inline"/);
  assert.match(richText, /tag === "div" && mathMode === "block"/);
  assert.match(richText, /mathSource\.length > MAX_NOTE_MATH_SOURCE_LENGTH/);
  assert.doesNotMatch(richText, /data-\*|startsWith\("data-"\)/);
});
