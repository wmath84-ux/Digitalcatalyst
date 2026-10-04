# Course Player — the divider's SWITCH swaps the two panes (and the file double tap is gone)

Owner brief (2026-10-04):

> Pichhle branch wali **double tap** wali functionality sahi nahin hai — use hata
> do. Split mode mein jo **center line** divide karti hai, us line par click
> karne par ek **bahut chhota sa switch ka icon** dikhe. Us par click karne par
> jo cheez ek taraf chal rahi hai woh **dusri taraf aa jaaye** aur dusri taraf
> wali pehle ki jagah — matlab **swap**. Dobara click karne par bhi wahi same
> function ho: swap.

## 1. The double tap is gone

| Removed | Where |
| --- | --- |
| the row's second gesture (`doublePress`, the tap window, the slop, the `dblclick` fallback) | `src/course/CourseOverlay.tsx` |
| `onSelectFileInSplit`, `splitPane`, `splitPaneActive` | `src/course/CourseOverlay.tsx` |
| `splitFile` state, `openFileInSplit`, `closeSplitFile`, `promoteSplitFile`, `preSelectRef` | `src/CoursePlayerApp.tsx` |
| the lower pane's file host | `src/course/SplitFilePane.tsx` (deleted) |
| its runtime test | `tests/coursePlayerFileDoubleTapRuntime.test.mjs` (deleted) |

A module file row is back to **one** gesture: a single press opens the file in
the lesson area, exactly as it always did (`press: () => onSelectFile(file)`).
The study pane is back to one body: the active tab's content. No row listens
for `dblclick`, nothing arms a tap timer, and `touch-action: manipulation` is
no longer forced on file rows.

## 2. The divider's switch

`src/course/studyPanels.tsx` — the `SplitDivider` keeps its bare 2px yellow line
at rest. New behaviour on top of it:

* **Tap the line** → a 22px round button with a 12px switch icon fades in on
  the line (`ArrowLeftRight` in landscape, `ArrowUpDown` in portrait). Tap the
  line again → it fades out; it also fades out on its own after
  `SWAP_HINT_MS` (3.6s) of being ignored, and a rotation clears it.
* **Tap vs drag.** The divider's resize drag owns the pointer, so the tap is
  decided on pointer *up*: the press counts only if the pointer stayed within
  `SWAP_TAP_SLOP_PX` (6px) and came up inside `SWAP_TAP_MS` (400ms). A real
  resize never reveals the switch.
* **Press the switch** → the two panes trade places. Press it again → they
  trade back; it is one toggle, so *every* press swaps (the switch stays on
  screen after a press, with its idle timer restarted).
* The button stops its own pointer/click/dblclick events, so pressing it can
  never start a drag or hit the divider's 50/50 double-click.
* Keyboard: `s` on the focused divider swaps as well (and shows the switch
  while it does), alongside the arrows / Home / End / Enter it already had.

## 3. What a swap actually changes

The swap is a **flex reorder**, not a re-render into another part of the tree:

* the lesson pane gets `order: swapped ? 2 : 0`, the study pane
  `order: swapped ? 0 : 2`, and the divider always keeps `order: 1`;
* both panes stay exactly where they are in the DOM, so the lesson's viewer
  stack is **never unmounted** — a playing video, a scrolled PDF or a Google
  Doc iframe survives the swap untouched (the runtime test asserts the element
  identity is the same node before and after);
* `ratio` keeps meaning "the study pane's percent": `ratioFromPointer` flips
  its measurement while swapped (`100 - raw`), so the divider still follows the
  finger and the fill-to-edge / snap / collapse rules are unchanged;
* a collapsed pane's peek rail keeps its 2px glow on the divider-facing edge
  (`glowSide`), and the drag's "compressed pane leans on its divider edge"
  shadow flips with the panes (`[data-split-swapped="true"]` in `src/index.css`);
* the deck publishes `data-split-swapped="true" | "false"`.

The arrangement is remembered **per course** (`dc.splitDeck.swapped.v1:{courseId}`,
`src/course/splitMotion.ts`) — unlike the ratio and the collapse state it is not
per axis, because rotating the device must not quietly put the panes back.

## 4. Tests

* `tests/coursePlayerSplitSwapRuntime.test.mjs` (6 ✓) drives the real Split Deck
  in a DOM with real pointer events: no switch at rest; a tap reveals it and a
  second tap hides it; a resize drag never reveals it; a press swaps the panes
  (`order` 0/2 → 2/0) and the next press swaps them back; the lesson's DOM node
  is the same element across a swap; the arrangement comes back on the next
  visit to that course and leaves other courses alone.
* `tests/coursePlayerSplitSwapContract.test.mjs` (10 ✓) pins the source shape:
  the double-tap gesture, the split-file pane and their props are gone, the
  single press still opens the upper area, and the switch's pieces (tap
  detection, idle fade, toggle, reorder, persistence) stay where they are.

Full suite: `node --test tests/*.test.mjs` → **3041 tests, 2963 pass, 33 fail** —
the 33 are the repository's pre-existing failures (same names as the baseline
run; `storeChromeDockDragScroll`, `flowpath`, `myDay`, `revision`, … — none in
the Course Player). `tsc --noEmit` reports only the pre-existing unused-symbol
errors, and `vite build` succeeds.
