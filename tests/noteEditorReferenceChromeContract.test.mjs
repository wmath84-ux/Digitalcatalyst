// tests/noteEditorReferenceChromeContract.test.mjs
//
// Pins the Notes surfaces as the owner's 2026-10-15 redesign defines them
// ("pure note me koi header hoga hi nahin", "yah side panel almost full page
// hi hoga", "library ke naam shrink ho gaye hain", "3 dot button remove",
// "sabse aage ek clear Read button"). The three places are:
//
//   · HOME   — a clean, headerless page whose centre carries three buttons:
//              New note · My Library · Course Library.
//   · LIBRARY — the ONE side panel, anchored left and nearly a page wide (a
//              thin strip of the page stays visible on the right). Headerless:
//              the shared MASTER / SELF control sits top-centre, the list fills
//              the middle, and exactly ONE button — New note — sits at the very
//              bottom. Rows are one clean line with NO pencil / trash buttons:
//              rename + delete live in the row's long-press popup, and Rename
//              turns that row's own name into an input.
//   · WRITING — read mode first, always: the bottom pill is
//              library(→ the panel) · prev · next | new · edit | home, and edit
//              mode swaps it for the editing pill whose FIRST control is the
//              black Read capsule, then a SLIDING tray of tools.
//
// Saving is automatic (the owner's decision), so there is no Save, no Cancel
// and no right-hand options panel anywhere in notes.
//
// The save pipeline itself is pinned by noteEditorContract.test.mjs; this file
// pins the chrome the owner asked for.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const notesPanel = read("src/course/NotesPanel.tsx");
const notesCss = read("src/course/notesLibrary.css");
const menu = read("src/components/branched-menu/BranchedMenu.tsx");
const toolbar = read("src/course/NoteEditorToolbar.tsx");
const css = read("src/course/noteEditor/noteEditor.css");

// The editor branch of NotesPanel (its early return) and the home branch.
const editorBranch = notesPanel.slice(notesPanel.indexOf("if (editorOpen)"), notesPanel.indexOf('data-course-notes-mode="home"'));
const homeBranch = notesPanel.slice(notesPanel.indexOf('data-course-notes-mode="home"'));
const panelBranch = notesPanel.slice(notesPanel.indexOf("const libraryPanel"), notesPanel.indexOf("if (viewingMasterNote)"));

test("1 — no header on any notes page, and nothing at the top of one", () => {
  assert.doesNotMatch(notesPanel, /CoursePageHeader|data-course-page-header|<header/);
  assert.doesNotMatch(notesPanel, /data-course-notes-bar/);
  // The old corner-button row (and with it the right-hand options panel) is
  // gone: no top-left, no top-right, no PanelLeft / PanelRight glyphs.
  assert.doesNotMatch(notesPanel, /data-note-editor-chrome/);
  assert.doesNotMatch(notesPanel, /PanelLeft|PanelRight|setSidePanel/);
  // The autosave chip is INVISIBLE now (owner, 2026-10-16+): "upar ek
  // syncing synced ka button dikhta hai usko remove karo, function
  // background mein chalti rahana chahie" — an sr-only live region keeps
  // announcing the state while nothing shows at the top of the page.
  assert.match(editorBranch, /className="sr-only" data-note-status-chip data-note-autosave/);
  assert.doesNotMatch(editorBranch, /justify-center[^"]*"[\s\S]{0,200}?data-note-status-chip/, "no visible centred chip row");
});

test("home — a clean headless page with three centred buttons", () => {
  assert.match(homeBranch, /data-course-notes-home/);
  assert.match(homeBranch, /data-notes-home-actions/);
  for (const [hook, label, handler] of [
    ["data-notes-home-new", "New note", "onClick={openComposer}"],
    ["data-notes-home-library", "My Library", 'onClick={() => openLibrary("self")}'],
    ["data-notes-home-course", "Course Library", 'onClick={() => openLibrary("master")}'],
  ]) {
    assert.ok(homeBranch.includes(hook), `${label} carries ${hook}`);
    assert.ok(homeBranch.includes(label), `the button is named "${label}"`);
    assert.ok(homeBranch.includes(handler), `${label} -> ${handler}`);
  }
  // The three buttons are the whole page: no header, no other action.
  assert.equal((homeBranch.match(/<button/g) || []).length, 3, "three buttons and nothing else");
  assert.match(homeBranch, /flex min-h-0 flex-1 items-center justify-center/, "centred");
});

test("2 — the ONE side panel: nearly a page wide, MASTER / SELF top-centre, one button at the bottom", () => {
  assert.match(panelBranch, /data-note-left-panel/);
  assert.match(panelBranch, /absolute inset-y-0 left-0 z-40 flex w-\[calc\(100%-2\.5rem\)\] flex-col/);
  assert.match(panelBranch, /border-r shadow-2xl/, "which is what makes it read as a panel");
  assert.match(panelBranch, /data-note-panel-scrim[\s\S]{0,200}?closeLibrary/, "the visible strip dismisses it");
  assert.match(editorBranch, /event\.key === "Escape" && libraryOpen\) \{ closeLibrary\(\);/);
  // MASTER / SELF, top centre.
  assert.match(panelBranch, /data-note-library-head/);
  assert.match(panelBranch, /items-center justify-center px-3/);
  assert.match(panelBranch, /<MasterSelfControl[\s\S]{0,400}?ariaLabel="Note collection"[\s\S]{0,200}?feature="notes"/);
  // The list is the same branched library it has always been…
  assert.match(panelBranch, /data-course-notes-list/);
  assert.match(panelBranch, /<BranchedMenu\s+items=\{selfTree\}/);
  assert.match(panelBranch, /data-course-notes-grid/);
  assert.match(panelBranch, /data-course-master-notes-grid/);
  // …and the bottom carries exactly ONE button: New note.
  assert.match(panelBranch, /data-note-library-foot/);
  assert.match(panelBranch, /data-note-panel-new[\s\S]{0,600}?onClick=\{openComposer\}/);
  const foot = panelBranch.slice(panelBranch.indexOf("data-note-library-foot"));
  assert.equal((foot.match(/<button/g) || []).length, 1, "the panel's foot carries exactly one button");
  // The panel's only other button is the scrim that dismisses it.
  assert.equal((panelBranch.match(/<button/g) || []).length, 2, "New note + the dismissing scrim");
  assert.doesNotMatch(panelBranch, /Back to library|data-note-panel-back/);
});

test("3 — rows are one line with NO pencil / trash; long press opens Rename + Delete", () => {
  // The library asks the menu for the long-press action menu (the default stays
  // the inline pencil/trash the other libraries keep).
  assert.match(notesPanel, /leafActionMenu="long-press"/);
  assert.match(menu, /leafActionMenu\?: "inline" \| "long-press";/);
  assert.match(menu, /leafActionMenu = "inline",/);
  assert.match(menu, /const popupMode = actionMenu === "long-press"/);
  // The popup: rename + delete, on a long press (or a secondary click / menu key).
  assert.match(menu, /const LONG_PRESS_MS = 450;/);
  assert.match(menu, /data-branched-menu-popup/);
  assert.match(menu, /role="menu"/);
  assert.match(menu, /data-branched-menu-rename/);
  assert.match(menu, /data-branched-menu-delete/);
  assert.match(menu, /onPointerDown[\s\S]{0,400}?pressTimer\.current = window\.setTimeout/);
  assert.match(menu, /onContextMenu=\{\(event\) => \{/);
  assert.match(menu, /key === "ContextMenu"/);
  assert.match(menu, /event\.key === "F2"/);
  // Rename turns the row's OWN name area into an input.
  assert.match(menu, /const beginRename = \(\) => \{[\s\S]{0,200}?setRenaming\(true\)/);
  assert.match(menu, /className="branched-menu__rename-input"/);
  assert.match(menu, /data-branched-rename-input/);
  // In popup mode the two row buttons are NOT rendered at all.
  assert.match(menu, /\{!popupMode && \(item\.onRename \|\| item\.onDelete\) \? \(/);
  // And the library's rows are single-line: names truncate, they never wrap.
  assert.match(notesCss, /\[data-note-left-panel\] \.notes-library-menu \.branched-menu__label,[\s\S]{0,200}?white-space: nowrap;[\s\S]{0,120}?text-overflow: ellipsis;/);
});

test("4+7 — read mode's bottom navigation: library · prev · next | new · edit | home", () => {
  assert.match(editorBranch, /\{readView && readChromeVisible \? \([\s\S]{0,1600}?data-note-read-nav/);
  for (const hook of ["data-note-read-library", "data-note-read-prev", "data-note-read-next", "data-note-read-new", "data-note-read-edit", "data-note-read-home"]) {
    assert.match(editorBranch, new RegExp(hook), hook);
  }
  // The library button opens the ONE side panel…
  assert.match(editorBranch, /data-note-read-library[\s\S]{0,200}?openLibrary\("self"\)/);
  // …prev / next walk the SELF collection, the pencil edits, home leaves.
  assert.match(editorBranch, /if \(prevNote\) openNote\(prevNote\)/);
  assert.match(editorBranch, /if \(nextNote\) openNote\(nextNote\)/);
  assert.match(editorBranch, /data-note-read-edit onClick=\{enterEditMode\}/);
  // ONE tap on the page hides that tray, and the next tap brings it straight
  // back (owner brief, 2026-10-15): the whole nav — the side-panel button
  // included — disappears so a note can be read whole. A press that TRAVELLED
  // is a selection drag or a swipe, never a tap, and the chrome itself (the
  // tray, the panel, a dialog) is never a tap on the page.
  assert.match(notesPanel, /const READ_TAP_SLOP_PX = 10;/);
  assert.match(editorBranch, /onPointerDown=\{\(event\) => \{ readTapStartRef\.current = \{ x: event\.clientX, y: event\.clientY \}; \}\}/);
  assert.match(editorBranch, /if \(!readView \|\| libraryOpen\) return;/);
  assert.match(editorBranch, /Math\.hypot\(event\.clientX - start\.x, event\.clientY - start\.y\) > READ_TAP_SLOP_PX/);
  assert.match(editorBranch, /closest\("\[data-note-read-nav\], \[data-note-library-panel\], \[data-course-confirm-delete\]"\)/);
  assert.match(editorBranch, /setReadChromeVisible\(\(visible\) => !visible\)/);
  // …and the tray only ever exists while that flag is on, so the tap really
  // takes the side-panel button away with everything else.
  assert.match(editorBranch, /\{readView && readChromeVisible \? \(/);
  assert.match(editorBranch, /data-note-read-home onClick=\{goHome\}/);
  // The 3-dot drawer button is gone for good.
  assert.doesNotMatch(notesPanel, /data-note-read-more|MoreHorizontal/);
  // A note ALWAYS lands in read mode first, and the mode flips by the
  // established gestures: a double tap on the page, or Enter / F2.
  assert.match(notesPanel, /setSelfReadOnly\(true\); \/\/ §14 — a saved note opens as a read-only view/);
  assert.match(notesPanel, /useDoubleTapToEdit\(Boolean\(editingId && selfReadOnly\), enterEditMode\)/);
  assert.match(editorBranch, /data-note-view-mode=\{readView \? "read" : "edit"\}/);
});

test("10 — the editing pill: the EYE tile FIRST, then the sliding tray", () => {
  const dock = toolbar.slice(toolbar.indexOf("export function NoteDockedToolbar"));
  // The read control leads the bar — one more tile of the SAME row, built from
  // BlockNote's own toolbar button, so it cannot drift from its neighbours in
  // size, weight or colour. It is pinned OUTSIDE the scroller, so it can never
  // scroll out of reach. (The solid black "Read" capsule is gone: owner brief,
  // 2026-10-15 — "simple eye button, same design as the other toolbar buttons".)
  assert.ok(dock.indexOf('className="dc-note-read-eye"') < dock.indexOf("dc-note-dock-tools"), "the eye comes first");
  assert.match(dock, /className="dc-note-read-eye"[\s\S]{0,200}?data-note-edit-read=""/);
  assert.match(dock, /icon=\{<Eye size=\{16\} \/>\}/);
  assert.match(dock, /<Components\.FormattingToolbar\.Button/);
  assert.doesNotMatch(dock, /dc-note-dock-read/, "no capsule, no <span>Read</span>");
  assert.doesNotMatch(css, /0b1220/, "and no black capsule left in the sheet");
  // The tile takes the dock's own sizing rules, like every button beside it.
  assert.match(css, /\.dc-note \.dc-note-dock \.bn-ak-button[\s\S]{0,400}?width: 2\.25rem;/);
  assert.match(css, /\.dc-note \.dc-note-dock \.dc-note-read-eye \{[\s\S]{0,120}?flex: 0 0 auto;/);
  // The tools are a sliding tray: nothing shrinks, it scrolls sideways.
  assert.match(css, /\.dc-note \.dc-note-dock-tools \{[\s\S]{0,400}?overflow-x: auto;/);
  assert.match(css, /\.dc-note \.dc-note-dock-tools > \* \{\s*flex: 0 0 auto;/);
  // The panel keeps a floating Read capsule for the moments the caret has left
  // the note (the tray follows the caret, the way back never disappears).
  assert.match(editorBranch, /!readView && !dockUp[\s\S]{0,900}?data-note-edit-read-float/);
  assert.match(notesPanel, /onReadRequest=\{enterReadMode\}/);
  assert.match(notesPanel, /onDockChange=\{setDockUp\}/);
  // Leaving the editor for the read view is a SAVE POINT (automatic save).
  assert.match(notesPanel, /const enterReadMode = useCallback\(\(\) => \{\s*setReadChromeVisible\(true\);\s*saveNowRef\.current\(\);/);
});

test("the editing pill's tools are the reference order — and every one of them acts", () => {
  const dock = toolbar.slice(toolbar.indexOf("export function NoteDockedToolbar"));
  const order = [
    'direction="undo"',
    'direction="redo"',
    "<BlockTypeSelect",
    'basicTextStyle="bold"',
    'basicTextStyle="italic"',
    'basicTextStyle="strike"',
    "<HighlightButton",
    'basicTextStyle="code"',
    'command="quote"',
    "<CreateLinkButton",
    'command="bulletList"',
    'command="numberedList"',
    'command="checklist"',
    'direction="indent"',
    'direction="outdent"',
  ];
  let last = -1;
  for (const needle of order) {
    const at = dock.indexOf(needle);
    assert.ok(at > last, `${needle} appears in the reference order`);
    last = at;
  }
  // Functionality, not decoration: block commands run the note's own slash
  // commands, highlight toggles the schema's background-colour style.
  assert.match(toolbar, /onClick=\{\(\) => runSlashCommand\(editor, command\)\}/);
  assert.match(toolbar, /editor\.toggleStyles\(\{ backgroundColor: "yellow" \}\)/);
  assert.match(toolbar, /live\.getActiveStyles\(\)\.backgroundColor/);
  // The owner's report — "usi toolbar mein 3 line wala ek button hai lekin
  // abhi vah koi function nahin kar raha" — was the indent / outdent pair:
  // BlockNote cannot nest a block with nothing above it, so BOTH were
  // hard-disabled on a note's first line. They now always act: indent nests
  // when it can and otherwise turns the line into a list item; outdent lifts
  // the block out, and a top-level list item becomes a paragraph again.
  assert.match(toolbar, /if \(editor\.canNestBlock\(\)\) editor\.nestBlock\(\);/);
  assert.match(toolbar, /editor\.updateBlock\(block, \{ type: "bulletListItem" \} as never\)/);
  assert.match(toolbar, /else if \(editor\.canUnnestBlock\(\)\) \{[\s\S]{0,200}?editor\.unnestBlock\(\)/);
  assert.match(toolbar, /editor\.updateBlock\(block, \{ type: "paragraph" \} as never\)/);
  assert.match(toolbar, /const disabled = direction === "indent" \? !swappable : !caret\.canUnnest && !inList;/);
  // …and the block-type control always spells out the type the caret is in, so
  // an icon-only "three-line button" can never be a mystery again.
  assert.doesNotMatch(css, /\.dc-note \.dc-note-dock \[role="combobox"\] \{[^}]*font-size: 0;/);
  assert.match(css, /\.dc-note \.dc-note-dock \[role="combobox"\] \{[\s\S]{0,300}?font-size: 0\.8125rem;/);
  // The floating selection toolbar keeps the full inline set (underline too).
  assert.match(toolbar, /const InlineActions = \(\) => \([\s\S]*?basicTextStyle="underline"/);
  assert.match(toolbar, /<InlineActions \/>/);
});

test("the pill's geometry is the reference's: bottom-left, round, 36px buttons", () => {
  assert.match(css, /\.dc-note \.dc-note-dock \{[^}]*position: absolute;[^}]*left: 0\.5rem;/);
  assert.match(css, /\.dc-note \.dc-note-dock \.dc-note-dock-bar \{[^}]*border-radius: 999px;[^}]*box-shadow: 0 10px 25px/);
  assert.match(css, /\.dc-note \.dc-note-dock \.bn-ak-button \{[^}]*height: 2\.25rem;[^}]*border-radius: 999px;/);
  assert.match(css, /\.dc-note \.dc-note-dock-sep \{[^}]*height: 1\.25rem;/);
  assert.equal((toolbar.match(/<DockSeparator/g) || []).length, 3, "history | inline | link | lists");
});

test("the MASTER viewer stays read-only, and its one control returns to the library", () => {
  const viewer = notesPanel.slice(notesPanel.indexOf("function MasterNoteViewer"), notesPanel.indexOf("export default function NotesPanel"));
  assert.doesNotMatch(viewer, /<header/);
  assert.match(viewer, /data-course-master-note-viewer/);
  assert.match(viewer, /data-course-notes-mode="master-readonly"/);
  assert.match(viewer, /Read only · Master/);
  assert.match(viewer, /readOnly/);
  // A master note is opened FROM the panel, so its single control goes back
  // there (the panel is the library — there is no other library page).
  assert.match(viewer, /data-course-master-note-chrome/);
  assert.match(viewer, /data-course-master-note-back/);
  assert.match(notesPanel, /onClose=\{\(\) => \{ setViewingMasterNoteId\(null\); openLibrary\("master"\); \}\}/);
});
