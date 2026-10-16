# The Mind map page, rebuilt to the notes design system — headless home, ONE side-panel library, read-first maps, and a centred eye-led toolbar

This page now wears **exactly the notes page's design system** (`fbe4f32`), by
the owner's brief of 2026-10-16. In the owner's words, the seven requirements:

1. **the same complete, exact UI design system as the notes page**;
2. **the mind map must be headless too** — no header anywhere, and no button in
   any chrome that opens a side panel;
3. **its side panel has the same problem the notes library had** → the same
   logic and the same design fix;
4. **the whole mind map page is redesigned**;
5. the notes page's "read mode" control becomes a **simple eye button in the
   same design as the other toolbar buttons**, and the same eye button goes into
   the mind map toolbar (it replaces `data-course-mindmap-done`);
6. the mind map toolbar was **offset left** — it must be **centred**;
7. mind map **read mode shows the same bottom tray as the notes page**:
   the side-panel option plus a **New mind map** create button;
8. shared by **both** read modes: **one tap hides the bottom tray** (the
   side-panel button and the rest) — **tapping again shows it**.

Everything above is built. The notes-side half of points 5 and 8 (the eye tile
and the read tray's one-tap hide) is documented in
`COURSE_PLAYER_NOTES_PAGE_REDESIGN_REPORT.md`; this report covers the mind map.

---

## 1. Three places, and nothing else

`src/course/MindMapPanel.tsx` renders exactly three surfaces. **No header on any
of them**, and no corner button anywhere.

| # | Place | What it is | Hooks |
| --- | --- | --- | --- |
| 1 | **HOME** — the `libraryOpen` branch | a clean, headerless page: three centred buttons (New mind map · My Library · Course Library) and nothing else | `data-course-mindmap-home`, `data-mindmap-home-actions`, `data-mindmap-home-new` (+`data-course-mindmap-new`), `data-mindmap-home-mine`, `data-mindmap-home-course` |
| 2 | **THE LIBRARY PANEL** (`panelOpen`) | the ONE side panel: almost the full page (a thin strip stays visible on the right, so it still reads as a panel), MASTER / SELF at its **top centre**, exactly ONE button at its bottom | `data-mindmap-left-panel` + `data-course-mindmap-library`, `data-mindmap-panel-scrim`, `data-mindmap-panel-head` + `data-course-mindmap-collections`, `data-course-mindmap-map-list`, `data-course-mindmap-map-grid` (SELF) / `-master-grid` (MASTER), `data-mindmap-panel-foot` + `data-mindmap-panel-new` |
| 3 | **THE CANVAS** | the map itself, in `data-mindmap-mode="read"` or `"edit"` — the SAME diagram | `data-course-mindmap-canvas`, `data-mindmap-mode`, `data-mindmap-read-tray` (+6 buttons), `data-course-mindmap-status` (the edit bar), `data-mindmap-edit-read` |

There is no fourth surface. The old page header (`CoursePageHeader` with its
MASTER / SELF tabs), the two corner buttons
(`data-mindmap-open-left-panel` / `-open-right-panel`), the whole right-hand
options panel (`data-mindmap-right-panel` with its rename field) and the
floating `+` create button are all **gone**, and every hook they owned went with
them (`data-course-mindmap-done` — the old "Done" pill — included).

**The panel is ONE element mounted in ONE place** (`{panelOpen ? libraryPanel :
null}` at the shell, after the home/canvas branch), so opening it from the home
page's My Library, from the read tray's library button, or over an open map
gives the identical panel.

**How each place is reached**

* the page opens on **HOME** (or restores the learner's last view — canvas stays
  canvas, home stays home, as before);
* `New mind map` → a fresh map **straight into the editor** (there is nothing to
  read yet);
* `My Library` → the panel, SELF active; `Course Library` → the panel, MASTER
  active; the collection choice is still remembered per user;
* inside a map, read mode's **tray** opens the panel — that is the only way in,
  and the visible strip (or Escape) closes it;
* read mode's **home** button, the canvas's `Escape`, and the panel's own rows
  are the ways back.

## 2. The panel: the same problem, the same fix

The owner's report on the notes library — *"text vertically spread ho gaye
hain… shrink ho gaye hain"* — was the row: a pencil and a trash button sharing
the line with the name, squeezing it onto two or three lines on a narrow pane.
The mind map library had exactly that, inside a page-wide overlay. Both are
fixed the same way:

* **rows are one clean line, with NO pencil / trash**: both trees ask the shared
  menu for `leafActionMenu="long-press"`, so a row renders its name, its
  `SELF` / `MASTER` tag and its node count, and nothing else;
* **a long press** (450 ms, movement-aware — a secondary click, the menu key or
  `Shift+F10` also work) opens `[data-branched-menu-popup]` with **Rename** and
  **Delete**; **Rename turns that row's own name into the input**
  (`[data-branched-rename-input]`) — Enter saves, Escape cancels, and the title
  goes through the panel's `onRename: (nextTitle) => onRenameMap?.(entry.mapKey,
  nextTitle)`. Delete still lands in the same two-step confirmation dialog;
* **geometry**: `w-[calc(100%-2.5rem)]` with 18 px right-hand radii and a
  `data-mindmap-panel-scrim` strip that closes it — a panel, not a full page;
* **head**: `data-mindmap-panel-head` is `h-14 … justify-center` and carries the
  shared MASTER / SELF control (`data-course-mindmap-collections`);
* **foot**: exactly ONE button, `data-mindmap-panel-new` → *New mind map*. The
  old bottom row (a "back to library" button next to a create button) is gone —
  this panel **is** the library;
* **Work Mode is device-only**, so its head is a plain "My mind maps" label
  instead of a MASTER / SELF tablist that could not go anywhere (the same rule
  the notes panel follows).

## 3. Read mode: the notes page's tray, and one tap to hide it

A saved map **opens read-first**: `openMap` sets read mode, clears the selection
and re-arms the chrome, so a single tap on a node only selects — it never
edits. Nothing about a tap or a double tap unlocks the editor (the preview's
nodes are not draggable and there is no edit gesture on the canvas).

**Read mode's tray** — `data-mindmap-read-tray`, bottom centre, the notes read
navigation control for control:

`library (→ the panel)` · `prev` · `next` | `new` · `edit` | `home`

* `data-mindmap-read-library` (Library icon) → `openPanel("self")`;
* `-read-prev` / `-read-next` (ChevronLeft / ChevronRight) walk the SELF
  collection around the open map, disabled at the ends;
* `-read-new` (Plus) → a new map in the editor; `-read-edit` (Pencil) → the
  editor for this map; `-read-home` (House) → HOME (flushing first);
* a read-only **MASTER** map's tray keeps **library + home only** — nothing that
  could open an editor appears on it;
* the tray is drawn in the mind map's own tokens (`.mm-read-tray`,
  `.mm-read-tray-sep`, `.mm-tool`) and lifts over the player's footer navigation
  by the shared `--dc-note-footer-inset`.

**One tap hides it, the next shows it.** The canvas records the pointer's start
(`onPointerDown`) and toggles on `click` only when the pointer did not travel
more than `READ_TAP_SLOP_PX = 10` — a pan, a pinch or a drag is never a tap —
and never while the panel is open. The tray exists only while
`readChromeVisible` is on: `{libraryOpen || !readOnlyCanvas || !readChromeVisible
? null : (…)}`. Hiding takes the **side-panel button with it**, exactly as the
owner asked; `goHome`, `enterEditMode`, `enterReadMode` and `openMap` re-arm it,
so it is always back the next time a map is read.

Keyboard: `Enter` / `F2` on the focused canvas opens the editor, `Escape` closes
the panel first and otherwise leaves the editor (or goes home from read mode).

## 4. The editing bar: centred, note-sized, eye-led

* **Centred, not offset left** — `[data-course-mindmap-status]` is
  `position: absolute; left: 50%; transform: translateX(-50%)`, so the bar sits
  on the pane's centre line instead of hugging the left edge (its drop-downs are
  portalled to `<body>` via `createPortal`, so the transform cannot drag a menu
  along);
* **note-editor sized and opaque**: `--mm-tool-size: 36px`, padding
  `0.375rem 0.5rem`, `border-radius: 999px`, a solid `--mm-pill-bg`
  (`#0d1424` dark / `#ffffff` light — no glass tokens), and the same
  `bottom: calc(max(0.5rem, env(safe-area-inset-bottom)) + var(--dc-note-footer-inset, 0px))`
  resting spot as the note dock;
* **the eye leads it**: the bar's first child is
  `<button className="mm-tool" data-mindmap-edit-read><Eye size={16} /></button>`
  → `handleDone` (blur the field, flush the save, back to read mode, tray
  re-armed). The old violet "Done" pill (`data-course-mindmap-done`) is gone;
* **every other control is kept, unchanged in behaviour**: the cloud-save beacon
  and its menu (`-save`, `-save-now`, `-save-message`, `-save-label`,
  `-save-blink`), the map switcher (`-maps`), JSON import (`-json-import`),
  auto-arrange (`-auto-arrange`), the align menu (`-align`, `-arrangement`),
  the look / style menus (`-look`, `-style`, `-style-reset`,
  `-text-fit-option`), Fit (`-fit`) and Delete branch (`-delete`), plus the
  node/level readout (`-stats`) where there is room;
* the bar is still **one side-scrolling line** that resets its scroll offset on
  open, so a narrow sheet never wraps or clips a tool.

## 5. Saving stays automatic

There is no Save / Cancel pair and no options panel — the same rule as notes.
The map is committed by the pen itself (`onMindChange` → the course player's
map store) and flushed when the learner leaves a surface (`onFlush` on the eye,
on Home, on opening another map). The strip's cloud is a **status beacon**, not
a button pair: tapping it opens the sync message, and the only action inside is
"save on this device now" for a device-only map.

## 6. Files

| File | What changed |
| --- | --- |
| `src/course/MindMapPanel.tsx` | the rewrite: the headless HOME, the ONE library panel, the read tray + `READ_TAP_SLOP_PX`, the centred eye-led edit bar, `enterEditMode` / `enterReadMode` / `handleDone`, and the deletion of the header, the two corner buttons, both old panels and the `+` create button |
| `src/course/mindMapLibrary.css` | **new** — the panel's scrim/rows, the single-line label rule, the home plate, the dark home plate (a sibling of `notesLibrary.css`) |
| `src/index.css` | `.mm-read-tray` / `.mm-read-tray-sep`; `[data-course-mindmap-status]` centred, note-sized, opaque; the footer-inset lift |
| `src/course/courseTheme.css` | the light plate now paints the home page and the panel (it painted the old overlay) |
| `src/course/flatPlayerChrome.css` | the flat player's sheet follows the home page as well as the panel |
| `src/course/coursePageHeader.css` | the mind map library is **unpainted** here on purpose: the page is headless and wears its own `--mm-*` palette |
| `src/course/NoteEditorToolbar.tsx`, `src/course/NotesPanel.tsx`, `noteEditor.css`, `notesLibrary.css` | the notes half of the shared brief: the eye tile instead of the black Read capsule, and the one-tap hide for the notes read tray |

Deliberately **not** changed: the map data layer (`useCourseMindMap`, the JSON
dialect, auto-arrange, `mindMapDrag`), the MASTER / SELF preference layer, the
course master-map banner and its "back" action, the footer/immersive rules, and
everything the mind map tab shares with the player.

## 7. Tests

| File | Tests | What it proves |
| --- | --- | --- |
| `tests/courseMindMapReferenceChromeContract.test.mjs` | 7 | the whole redesign, pinned: headless home and its three buttons, the ONE panel's geometry / head / single foot button / long-press rows, read-first with no unlock gesture, the read tray and its one-tap hide (`READ_TAP_SLOP_PX`, the toggle, the slop rule), the note-sized **centred** strip with the eye first, no `-done`, the rename path through `onRenameMap` |
| `tests/workModeMindMapContract.test.mjs` | 6 | Work mounts the same panel: no header, no corner buttons, the panel's width and centred head, long-press rows, the read tray, the toolbar's eye, Work's device-only rename |
| `tests/workModeMindMapRuntime.test.mjs` | 1 | the whole flow in jsdom inside Work: home (3 buttons) → My Library opens the ONE panel (head centred, one foot button, no row buttons) → a row opens **read-first** → the tray hidden and restored by a canvas tap → pencil → edit with the eye first → rename through the long-press popup into the device store → the strip closes the panel → home |
| `tests/coursePlayerMindMapContract.test.mjs` | 49 | the canvas, the strip (now centred, note-sized, opaque, menus upward) and the module's map lifecycle |
| `tests/coursePlayerMindMapMultiAutoArrangeContract.test.mjs` | 26 | many maps per module: the shared branched list, the panel, the switcher, the session view |
| `tests/courseMindMapLibraryDismissContract.test.mjs` | 3 | the panel's scrim / Escape dismissal |
| `tests/coursePlayerMindMapStyleContract.test.mjs` | 11 | the map's own Light / Dark palettes and looks |
| `tests/coursePlayerMindMapDragPerf.test.mjs` | 8 | dragging stays cheap (timing-based; it can flake on a loaded machine) |
| `tests/coursePlayerPanelSessionContract.test.mjs` | 6 | the panel session restore (canvas stays canvas, home stays home) |
| `tests/mindMapEditorRedesignContract.test.mjs` | 9 | the editor surfaces the redesign kept |
| `tests/courseMasterMindMapPlacement.test.mjs` | 9 | course master maps stay read-only and separate |
| `tests/coursePageHeaderContract.test.mjs` | 6 | **no header** on the mind map (or notes): its collections control heads the library panel instead |
| `tests/noteEditorReferenceChromeContract.test.mjs` | 9 | the notes half: the eye-first edit tray, the read tray and its one-tap hide |
| `tests/coursePlayerNoteToolbarCaretRuntime.test.mjs` | 11 | the dock follows the caret, the caret's block type is always spelled out, Indent acts |
| `tests/noteEditorBrowser.test.mjs` | 35 (skipped here) | real-browser suite: its mind map flows were re-pointed to the new chrome (headless home → the ONE panel → read-first → the tray's hide/show → pencil → the eye). It could **not** be executed in this sandbox — there is no Chromium — so those flows are proved instead by `workModeMindMapRuntime` and `courseMindMapReferenceChromeContract` |

Results on this branch (2026-10-16):

| Run | Result |
| --- | --- |
| `node --test tests/*.test.mjs` (the whole suite) | **4242 tests, 4048 pass, 0 fail, 194 skipped** |
| the mind map suites above | **0 fail** (every count in the table above re-run on its own) |
| `tests/noteEditorBrowser.test.mjs` | 35 skipped — no Chromium in this sandbox (`npx playwright install chromium`, or `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, runs them) |
| `./node_modules/.bin/tsc --noEmit` | clean |
| `npm run build:low-heap` | OK — built in ~47 s (the plain `npm run build` OOMs on this sandbox) |

## 8. Notes for the next hand

* **The panel is one element, mounted once** (`{panelOpen ? libraryPanel : null}`
  at the shell level). A change to the library lands on the home page and over
  the canvas alike — never re-mount it inside a branch.
* **`libraryOpen` is the page** (home ↔ canvas, and it is what the panel session
  stores); **`panelOpen` is the overlay**. They are different states on purpose:
  the tray's library button sets `panelOpen`, the tray's home button sets
  `libraryOpen`.
* **Read-first is a state, not a route**: `openMap` clears edit mode and
  re-arms the tray, `enterEditMode` is the only way in, and `handleDone` (the
  eye) is the only way out. A new exit must call `onFlush?.()` or the field's
  last keystrokes are lost.
* **Never re-introduce a chrome button that opens a panel** — not in the home,
  not in the strip, not as an `sr-only` focus target (the old "Back to mind map
  library" button was removed for exactly that reason). The tray and the visible
  strip are the doors.
* **`READ_TAP_SLOP_PX` is the difference between "tap to hide" and "pan"**: the
  toggle lives in the canvas's own `onClick`, gated on `readOnlyCanvas`,
  `!panelOpen` and a still pointer. If a new gesture is added to the canvas, keep
  the slop rule or the tray will flicker while panning.
* **The strip is centred with a transform** — anything it opens must be
  portalled (menus already are, via `createPortal`).
* Data, drag and auto-arrange behaviour were deliberately untouched; the mind
  map's `--mm-*` palette (Light / Dark) is its own and does not follow the
  player's page plate.
* In this sandbox `npm run build` needs `build:low-heap`; a timing-based perf
  test can flake while a build runs in parallel — re-run it on a quiet machine
  before believing it.
