# Course Player — double tap a file to open it in the lower split area

Owner brief (2026-10-04): on the Module page, a **single click** on a file keeps
opening it in the upper/main area exactly as before. **Double tap / double
click** on the same file now opens it in the split (lower/secondary) area, so a
lecture and its notes can be read together. Scrolling is never a double tap.

## What changed

| Surface | File |
| --- | --- |
| The file row: one press path, two gestures | `src/course/CourseOverlay.tsx` |
| The player host: main + split state | `src/CoursePlayerApp.tsx` |
| The lower pane body (new) | `src/course/SplitFilePane.tsx` |

Single click is untouched: the row's only press callback is still
`press: () => onSelectFile(file)` → `selectFile()` → `setSelectedFile`, i.e. the
upper area. The double gesture calls a **new** `onOpenFileInSplit(file)`.

## How the gesture is read

* The row remembers where the pointer went down and how far it travelled.
  Beyond a small slop the press is a **scroll**, the click that follows is
  swallowed, and no half-open pair is left behind — the same rule the repo's
  own `useDragScroll` applies.
* Two presses on the **same file** inside the double-tap window open the split.
  Two presses spaced further apart are two single clicks; a quick tap on a
  *different* file is two single clicks (the gesture is per file).
* The browser's own `dblclick` counts on its own (some desktop browsers collapse
  the second `click`), and it can never fire the split twice.
* Mouse double-click and touch double-tap arrive through the same pointer
  events, so both work without a separate code path.
* Module header rows (the expanders) never split — only file rows carry the
  gesture.
* The upper area is not disturbed by the row: the pair's first press is
  delivered immediately (a fast single click is never delayed behind a
  double-tap timer), and the player puts the upper area back when it hands the
  file to the split — so what the learner sees is "single click = upper",
  "double tap = lower, upper stays as it was".

## Where the split file goes

The player already renders one `ResourceViewer` per visited file in its viewer
stack (each stays mounted, hidden and paused when inactive). The split file is
rendered through the same `ResourceViewer`, in the Study slot of the existing
`SplitDeck` (`studyPanels.tsx`) that already hosts Notes / Mind map / AI Mentor —
there is no second player, no duplicate state, and the split divider's
activation/collapse behaviour is the deck's own.

## Tests

`tests/coursePlayerFileDoubleTapRuntime.test.mjs` drives the real overlay in a
DOM with real pointer events (9 ✓):

1. one click runs the single-click path and nothing else;
2. two clicks on the same row → one single press + the split press;
3. `dblclick` never fires the split twice;
4. a lone `dblclick` still opens the split;
5. two clicks spaced apart are two single clicks;
6. a quick tap on another row is not a double tap;
7. a press whose pointer travelled is a scroll — nothing opens, nothing armed;
8. module rows never split;
9. while the split is active the pane hosts the split file and the tab body
   steps aside.

Full suite: 3028 tests, 2950 pass, 33 fail — the 33 failures are the
pre-existing repository failures (identical names to the baseline run); the
Course Player's own contracts and runtimes stay green.
