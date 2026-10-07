# Quick Sketch — the Course Player's freehand canvas

The Sketch tab hosts **two** boards. The *Full Editor* is the official
Excalidraw component (see `COURSE_PLAYER_SKETCH_REPORT.md`); **Quick Sketch** is
the perfect-freehand canvas — the editor from
[perfectfreehand.com](https://www.perfectfreehand.com/) /
[steveruizok/perfect-freehand](https://github.com/steveruizok/perfect-freehand),
rebuilt inside the player. The two coexist: switching between them loses
nothing, because each persists separately.

| Piece | File |
| --- | --- |
| The canvas, its chrome and its undo history | `src/components/PerfectFreehandSketch.tsx` |
| The options panel (the editor's own) | `src/components/quickSketch/QuickSketchPanel.tsx` |
| The row controls behind it | `src/components/quickSketch/QuickSketchControls.tsx` |
| The ported design (CSS) | `src/components/quickSketch/quickSketch.css` |
| Strokes, documents, identity, the eraser | `src/utils/quickSketch.ts` |
| The style and everything `getStroke` reads | `src/utils/quickSketchStyle.ts` |
| Outlines, bounds, "Copy to SVG" | `src/utils/quickSketchSvg.ts` |
| Persistence, canvases, cloud sync | `src/course/usePerfectFreehandSketch.ts` |
| The tab that hosts it | `src/course/SketchPanel.tsx` |

## The design is the editor's own

The panel is a row-for-row port of perfect-freehand's own editor, including the
parts that are easy to lose:

- **Size, Thinning, Streamline, Smoothing** as sliders, each with its own number
  field and its own double-click-to-reset label;
- **Easing** (all nineteen of the editor's easings, names *and* functions);
- **Taper Start / Cap Start / Easing Start** and the mirror end — the cap and
  the easing appear only while the taper does not, exactly as the editor
  switches them;
- **Fill** (with its colour row) and **Stroke** width (with its colour row);
- **Reset Options**, **Copy Options** (the options object, ready to paste into
  your own `getStroke(points, { … })`) and **Copy to SVG**;
- the chrome: the hamburger that opens the panel, **Draw** bottom-left,
  **Undo · Redo · Clear** bottom-right, and — where the editor has its title —
  the canvas's name, its save state and its canvas switcher.

**One style for the whole drawing.** A stroke is geometry (`{ id, points }`);
the look belongs to the drawing, so moving "Thinning" restyles every stroke
live. That is the editor's model, and it is what makes the sliders worth
having.

Two deliberate adaptations: the labels use the app's font rather than the
site's 'Recursive' webfont, and the bottom bars' 40px side padding collapses to
16px on a narrow pane (a container query), because a phone's sketch pane is a
third of the width the site assumes.

## Drawing

- Pointer events with real pressure: a pen's pressure is used as measured, a
  mouse / finger reports the spec's flat `0.5`, and perfect-freehand then
  **simulates** pressure from velocity (that is what stops a mouse drawing from
  looking like a constant-width ribbon). A tap is a dot.
- The live stroke is outlined with `last: false`; the moment it is let go it is
  re-rendered with `last: true`, which is what makes finished ink settle.
- **Erase** rubs whole strokes out (the pointer's distance to a stroke's line,
  `strokeHitByPoint`), and the eraser's reach follows the ink's width.
- **Undo / Redo / Clear** are the editor's, over one history of
  `{ strokes, style }` snapshots. A slider drag, a typed number, a stroke and
  an erase session are each ONE step; clearing is undoable, so a stray tap can
  never cost a learner their drawing. ⌘/Ctrl+Z, ⇧⌘/Ctrl+Shift+Z, ⌘/Ctrl+C
  (SVG), ⇧⌘/Ctrl+Shift+C (options) and `E`/Backspace (clear) work while the
  canvas has the keyboard.

## Storage

| Piece | Value |
| --- | --- |
| Collection | `users/{uid}/quickSketches/{docId}` — owner-only, per learner |
| Doc id | `{uid}__{productId}__{moduleId}` for the first canvas of a module, `…__{sketchKey}` for every further canvas |
| Payload | `{ uid, productId, moduleId, sketchKey, title, strokes, resourceId, resourceName, createdAt, updatedAt }` |
| Ceilings | 600 strokes per canvas, 120-character titles, coordinates rounded to 2 decimals, 12 canvases per module |

- **Scope is the MODULE**, exactly like the Excalidraw boards: switching lessons
  inside a module keeps the canvas; switching modules opens that module's own.
- **Two layers**: Firestore is the source of truth (so the same learner sees the
  same canvases everywhere) and localStorage mirrors every save within 350 ms,
  so a refused or failed write never strands a drawing. Reopening picks the
  NEWER of the cloud copy and the device mirror.
- **The device mirror is also the canvas index**, so the switcher works offline.
- The rules (`firestore.rules` → `match /quickSketches/{sketchId}`) re-derive
  the doc id from the payload, so one learner can never write into another's
  namespace, and they mirror the ceilings above.

### The two bugs this feature had

Both were real, both are fixed, and both are pinned by tests:

1. **A stroke vanished the instant the finger lifted.** `updateStrokes()` wrote
   the new list into a ref but never into React state, and the canvas renders
   the state — so the stroke it had just drawn was immediately replaced by the
   list from before it. Every write now goes through the hook's state.
2. **Nothing was ever saved.** Saves went to a **root-level** `quickSketches`
   collection that (a) sat outside the learner's own namespace and (b) had no
   `match` block in `firestore.rules` — and a collection with no rule is denied
   outright, so every write was refused. The hook now writes
   `users/{uid}/quickSketches/…` and the rules cover it.

## Tests

- `tests/coursePlayerQuickSketchRuntime.test.mjs` — the real component, the real
  hook and the real `getStroke` pipeline in jsdom against an in-memory
  Firestore: a stroke survives its own pointerup and reaches the document;
  reopening shows it again (cloud, then the device mirror); undo / redo / clear
  / erase move the screen *and* the document; the panel is the editor's; a style
  change restyles every stroke as one undo step; Copy Options and Copy to SVG
  produce the editor's own text; an unscoped board still draws; a second canvas
  is its own document.
- `tests/coursePlayerQuickSketchContract.test.mjs` — the rules block and the
  save path, the document a save writes, tolerant loads, the eraser's geometry,
  the style's ranges and easings, the options text, the SVG export, and the
  design's own rows and buttons.
- `tests/firestoreRules.emulator.mjs` — the same rules against the real
  Firestore emulator (`npm run test:firestore:rules`), including the id
  derivations and the ceilings.
