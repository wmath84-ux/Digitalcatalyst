# Course Player — the Sketch page redesign (the notes / mind-map design system)

The Sketch surface (the Full Editor page **and** the Quick Sketch chip) now
follows the exact design system the owner approved for the **notes** page
(`fbe4f32`) and the **mind map** page (`e6651a9`): headless, read-first, one
side panel, one bottom tray, long-press rows, automatic save.

---

## 1. What the owner asked for, and where it landed

| # | Brief | Where |
|---|-------|-------|
| 1 | Same logic & design system, **headless** | `src/course/SketchPanel.tsx` — no header component anywhere; the only top chrome is the quiet save chip |
| 2 | Every header option moves into the sketch's **left side panel**; header and the "Sketch 1, 2 …" tray under it removed | `sketchSidebarContent` (one implementation, two homes); `SketchPagesTray`, `SketchBoards` and the header switcher deleted |
| 3 | Panel opened by the **same function** as read mode's tray option | one `panelButton(hook)` element, rendered by both trays (`-read-panel`, `-edit-panel`) |
| 4 | The canvas's own 3-line button stays; its panel hides on **outside click** | Excalidraw's own main menu is untouched; the page's panel closes on any outside `mousedown` (its own toggle excepted) and on Escape |
| 5 | Convertible bottom tray, **single-tap hide/show** | `readChromeVisible` + the canvas host's tap rule (`READ_TAP_SLOP_PX = 10`, press that travelled = a pan) — the tray **and** its panel button go together, exactly as on notes/mind map |
| 6 | **Eye** = read mode; **automatic save** | the editing tray's eye returns to reading; the read tray's pencil unlocks it; nothing is ever saved by hand |
| 7 | **Canvas colour** in the bottom tray in editor mode; the tray **slides** | `SketchColourCluster` inside `[data-course-sketch-edit-colour]`; `.dc-sketch-tray { overflow-x: auto }` |
| 8 | **Full Editor** button next to the eye; in the full editor's read mode the panel lists the **sketch canvases**, each long-press deletable / renamable | `modeToggle` sits directly after the eye; the read tray's panel opens the canvas list (`SketchCanvasList`) |
| 9 | Page toolbar — **draw · erase · undo · redo · clear** — in the bottom toolbar | the editing tray's five tiles, plus Excalidraw's own tool row moved down beside them |
| 10 | A **read button** in the full editor: while on, nothing can be drawn | the eye → `viewModeEnabled={!editing}` and the same flag on the chip |

Scope (owner's pick): **both** surfaces — the Full Editor page *and* the Quick
Sketch chip. Panel door (owner's pick): **the bottom tray only** — the canvas's
own 3-line button is left exactly as Excalidraw ships it. Read tray (owner's
pick): **notes-exact** — `panel · prev · next | new · pencil`. Editing tray
(owner's pick): the briefed set **plus Excalidraw's own tool bar shifted into
the bottom tray**.

---

## 2. The page, top to bottom

```
┌──────────────────────────────────────────────┐
│                 ● Saving…                    │  the quiet chip — no buttons
│                                              │
│                 the canvas                   │
│  (one tap in read mode hides everything      │
│   below; the next tap brings it back)        │
│                                              │
│         [ zoom · undo · redo ]               │  Excalidraw's utility island
│      [ shapes · text · arrows ]              │  Excalidraw's tool row
│  [≡][⌄][⌃] │ [＋][✎]                          │  the page's own tray (slides)
└──────────────────────────────────────────────┘
```

* **Read mode's tray** — `panel · previous · next │ new sketch · pencil`:
  the notes page's read navigation, control for control (a sketch has no
  library home to go to, so there is no Home button).
* **Editing mode's tray** — `panel · eye · Full Editor/Quick Sketch │ colour │
  draw · erase · undo · redo · clear`.
* **The ONE side panel** — `w-[calc(100%-2.5rem)]`, a thin visible strip on its
  right edge, centred `Sketch canvases` head, the canvas list, then the options
  block (mode switch, library read-out, canvas colour, save state + Retry) and
  exactly **one** bottom button: **New sketch**.
* **The canvas list** — `BranchedMenu` rows, one ellipsised line each, **no
  row buttons**: a **long press** opens Rename (edits that row's own label in
  place) and Delete (the red confirmation dialog that names the canvas). The
  guaranteed first canvas can never be deleted.

## 3. Excalidraw's own chrome, moved rather than duplicated

Excalidraw renders its tool row in the top menu's middle cell and its
zoom/undo/redo island in the footer. The page's tray is the bottom line of
chrome now, so both moved up one row each, with only their **anchor** changed —
widths, padding and pointer behaviour stay Excalidraw's, so pen/touch/keyboard
interaction is untouched:

* `.App-menu_top > .shapes-section` → row 2, centred (the owner's "shift the
  editor's own tool bar into the bottom tray").
* `.layer-ui__wrapper__footer` (zoom · undo · redo) → row 3, left.
* `.App-bottom-bar` (the phone toolbar) → row 2 as well, so only one of the two
  ever shows.
* Read mode shows the tool row never (nothing can be drawn), and the utility
  island keeps zoom one tap away.

All of it lives in the new `src/course/sketchLibrary.css`, keyed off the panel's
own `data-sketch-editing` / `data-sketch-reading` hooks, and every coordinate is
built from the same `--dc-note-footer-inset` the note dock uses — so the whole
stack lifts together over the player's footer navigation.

## 4. The Quick Sketch chip

`src/components/PerfectFreehandSketch.tsx` lost its four corner bars and gained
**one sliding tray** in the page's design:

```
[ ✎ Draw ][ ⌫ Erase ] │ [ ↺ Undo ][ ↻ Redo ][ 🗑 Clear ] │ [ Full Editor ][ 👁 Read | ✎ Edit ]
```

* the editor's own tools come first, then the page's own doors — and the chip
  takes the **same** page doors the trays do (`onRequestEdit`,
  `onRequestRead`, `onShowFullEditor`), so the chip is no longer a dead end:
  the pencil unlocks it and Full Editor swaps it for the real editor;
* read mode keeps the tray's single-tap hide rule too
  (`[data-quick-sketch-tray-visible]`), and the style panel can only open while
  editing.

## 5. Store changes

`renameBoard(sketchKey, title)` was added to all three sketch stores
(`useCourseSketch`, `usePerfectFreehandSketch`, `useWorkSketch`) — the title is
normalised, sanitized to ≤80 chars, written to the index and mirrored, and the
open session's title follows immediately (revision++, dirty, local persist,
cloud schedule). `useWorkSketch` returns `onRenameBoard` / `onDeleteBoard`;
the page wires them at both call sites (`CoursePlayerApp`, `WorkSketchSurface`).
`canDeleteActive` is gone — deletion is the row's own long-press menu now.

## 6. Verification

* `./node_modules/.bin/tsc --noEmit` — clean.
* New/rewritten pins: `courseSketchFullEditorChromeContract` (headless · panel
  from the tray · notes-library rows), `sketchEditModeContract` (read-first,
  identical tiles), `workModeSketchContract`, `coursePlayerQuickSketchContract`,
  `coursePlayerQuickSketchRuntime`, `courseSketchIntegrationContract`, and the
  Work runtime flow — which now drives the real sequence: read-first → tray →
  panel → create → **long-press rename through Work's device store** → row
  switch → pencil → draw → Saved on this device → eye → **single tap hides the
  tray, next tap restores it** → canvas round-trip keeps the drawing.
* `coursePanelsBrowser.test.mjs` was brought onto the new doors (open the panel,
  create from its foot, select rows, Retry from the panel). It still skips
  without Chromium, and it is the one suite that cannot be executed here.

**Note on a trap met while writing the Work runtime flow:** handing a raw jsdom
element to `assert.equal/ok` makes Node serialise the whole DOM when the
assertion fails — which kills the process with an out-of-memory error instead of
a readable failure. The file now asserts on `Boolean(element)` and on DOM
strings only.
