# Part 18 — the classroom's surfaces actually render (and scroll)

> Owner report, sitting in the finished room:
> *"3D mein sab kuch dikh raha hai, board dikh raha hai, sabhi board dikh rahe
> hain — bas un par koi content nahi dikh raha, kuch bhi nahi dikh raha."*

Every slab was there: framed, lit, glowing. Every slab was empty. This note
records why, because the cause was invisible by construction — nothing threw,
nothing logged, and every component was mounted and correct.

---

## 1. The real bug: a scale that was 40× too small

The room's live surfaces are DOM welded onto geometry with drei's
`<Html transform>`. That component does **not** map one CSS pixel to one world
unit. Its transform maths is:

```js
// @react-three/drei/web/Html.js
transformInnerRef.current.style.transform =
  getObjectCSSMatrix(matrix, 1 / ((distanceFactor || 10) / 400));
```

`getObjectCSSMatrix(matrix, f)` scales the matrix **basis** by `1 / f`, and
with `distanceFactor` unset `f = 400 / 10 = 40`. drei states the same ratio a
second time when it sizes its optional occlusion mesh:

```js
const ratio = (distanceFactor || 10) / 400;
const w = el.clientWidth * ratio;   // ← the DOM's width in WORLD units
```

So: **40 CSS px = 1 world unit.** A panel authored at `pixelWidth` covers
`pixelWidth / 40 × scale` metres.

Parts 1–14 shipped:

```ts
const scale = width / pixelWidth;         // ✗ 40× too small
```

which put a **16 cm** sliver of DOM on the 6.4 m lecture board, an 8 cm one on
the notes wall and a **3 cm** one on the 1.16 m desk tablet. From the seat —
six metres away — that is a few pixels of unreadable smear on an otherwise
perfect blackboard. Not "broken": *invisible*.

The correct mapping now lives in one place, `src/classroom3d/surfaceScale.ts`:

```ts
export const HTML_PX_PER_UNIT = 40;
export const surfaceScale = (widthMetres, pixelWidth) =>
  (widthMetres / pixelWidth) * HTML_PX_PER_UNIT;
```

`SurfaceFrame` and `DeskConsole` both go through it. A contract test asserts
the helper's formula **and** reads the installed drei source, so a library bump
that changes the ratio fails the suite instead of silently emptying the room
again.

| Surface | Slab | Authored | Was | Now |
|---|---|---|---|---|
| Lecture board | 6.40 m | 1600 px | 0.16 m | 6.40 m |
| Notes wall | 3.50 m | 1100 px | 0.09 m | 3.50 m |
| Mind wall | 4.20 m | 1240 px | 0.11 m | 4.20 m |
| Desk tablet | 1.16 m | 1100 px | 0.03 m | 1.16 m |

## 2. The second bug: a wall you turn to never woke up

Part 13 put a wall to sleep (`content-visibility: hidden`) unless it was the
room's `focus` — and `focus` is only ever set by a HUD chip, a desk button or a
keyboard shortcut. **Dragging** the view round to the notes wall does not
change `focus`, so the learner arrived at a wall that had switched its own
contents off.

On-screen-ness is now its own signal (`src/classroom3d/wallFocus.ts`).
`WallVisibility` already computes it every frame to gate painting; it publishes
the same edges to the store, and the room gates each wall on **focus OR
on-screen**:

```tsx
<WallActivity wall="notes" active={focus === "notes" || onScreen.notes}>
```

Edge-triggered, so the store notifies a handful of times per session, never per
frame. Media follows the same rule, which is the honest reading of "don't play
what nobody is watching": a board you turned away from pauses, a board still in
your peripheral vision keeps playing.

## 3. The third bug: nothing could be scrolled by finger

`.dc-classroom-root` is `touch-action: none` — it has to be, or every head-turn
drag would scroll and zoom the page underneath. But `touch-action` is
intersected **down the ancestor chain**, so that one rule also disabled native
touch panning inside every panel. A finger on the board moved nothing, and the
3D-transformed DOM inside drei's portal makes native panning unreliable even
without the rule.

So the room scrolls its own panels, with pointer events
(`src/classroom3d/surfaceScroll.ts`):

* **`attachDragScroll(root)`** — press and drag anywhere on a panel; the
  nearest scrollable ancestor of the press target follows the pointer 1:1 and
  glides on release (friction fling, disabled under
  `prefers-reduced-motion`). Attached to every `SurfaceFrame`, the
  `DeskConsole` and the floating sheet, so the lecture board, the note grid,
  the mind map library, the module columns and the chooser all scroll the same
  way, by thumb or by mouse.
* **`startHoldScroll(getTarget, direction)`** — the board's `▲ ▼` keys are
  **press-and-hold**, not one fixed jump per click: `pointerdown` starts a
  `requestAnimationFrame` loop that ramps from 4 px to 26 px per frame over
  550 ms; `pointerup` / `pointerleave` / `pointercancel` cancel it.

Rules that keep the engine out of everybody else's way: it never starts unless
something is genuinely scrollable (so the mind map's own pan/pinch is
untouched), it skips `input` / `textarea` / `contenteditable` and any
`[data-no-surface-scroll]` subtree, and a drag past 6 px swallows its trailing
click so scrolling a list never opens the row under the thumb.

`tests/classroom3dSurfaceScrollRuntime.test.mjs` executes all of this against a
jsdom document rather than pattern-matching the source — it is what caught the
click-suppression flag surviving a drag that had no trailing click.

## 4. The floating in-room library

> *"Module button par click karne par usi 3D classroom ke andar ek floating
> module open hona chahiye centre mein, aur usse scroll karke finger se module
> switch kiya ja sake… lekin jo bhi content ho — note writing, note library,
> mind map library, mind map — board par render hona chahiye."*

Three keys on the right-hand tray — **Modules**, **Notes**, **Maps** — open a
floating panel in the middle of the room (`src/classroom3d/RoomSheet.tsx`).

The split is strict, and the contract test enforces it:

* the **sheet is a chooser**. It contains no viewer, no editor, no canvas —
  the test fails the build if `ResourceViewer`, `MindMapPanel`,
  `RichTextEditor` or an `<iframe>` ever appears in it;
* the **boards are the content**. Picking a lesson puts it on the front board;
  picking a note turns the head to the notes wall and opens that note in the
  wall's own `NotesPanel` editor (new `openNoteSignal` / `openNoteId` props);
  picking a map turns the head to the mind wall and draws it there with its
  full toolbar. Every pick closes the sheet.

It floats above the WebGL canvas rather than sitting on a slab on purpose: a
list you are actively reading and thumbing through must be crisp and upright,
where a slab-mounted chooser would be perspective-skewed exactly when it is
being used. The room stays lit behind it and tapping the room dismisses it, so
it reads as a panel summoned into the classroom, not a page on top of the app.

The floating panel keeps its own expanded-module index, separate from the desk
console's `browseIndex`, so collapsing a module in the sheet never empties the
tablet's lesson column behind it.

## 5. Tests

| File | What it pins |
|---|---|
| `tests/classroom3dSurfaceRenderingContract.test.mjs` | the ×40 mapping (incl. drei's own source), focus-OR-on-screen gating, drag + hold scrolling, the chooser/board split, the note-open signal, player + sandbox wiring |
| `tests/classroom3dSurfaceScrollRuntime.test.mjs` | the scroll engine executed in jsdom: 1:1 drag, end clamping, tap vs. drag, opt-outs, hold acceleration and cancellation |

Two older assertions were updated rather than worked around:
`classroom3dPerformanceContract` (the wall gate is now `focus || onScreen`, and
an active wall is `content-visibility: visible` — `auto` is unsafe inside a
3D-transformed portal, where Chromium can measure the portal root as a
near-zero box and skip the subtree) and `classroom3dEmbedImpostorContract` (the
same `auto` removed from the wall base rule).
