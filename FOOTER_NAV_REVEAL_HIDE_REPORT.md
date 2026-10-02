# Footer navigation — reveal on click/drag, hide only when the pointer really leaves

Owner brief, 2026-10-02:

> "Line par click ya drag karne par footer navigation reveal hota hai. Abhi problem ye
> hai ki line se footer navigation ki taraf pointer le jaate hi footer navigation turant
> hide ho jata hai, jiski wajah se footer ke kisi button par click nahi ho pata. Pointer
> line se button tak smoothly travel kar sake, har button properly clickable ho,
> drag-to-reveal bhi same behave kare, touch devices par bhi ye problem na ho — aur
> footer tabhi hide ho jab user actual interaction area se bahar chala jaaye."

Applies to both bottom-centre peek docks:

* the desktop shell's line + MAG dock — `src/components/glass-dock/DesktopPeekDock.tsx`;
* the course player's line + dock — `src/course/CoursePeekDock.tsx`.

## The short version

The line and the dock it reveals were wired as **two separate hover targets**. The line
revealed the dock; the line's own `pointerleave` armed an 80 ms close, and the only thing
that could cancel it was the *panel's* `pointerenter`. There are real gestures where that
enter never arrives:

* a **touch / pen drag** has no hover events at all while the contact is down, so the
  dock flashed open and then closed around the finger;
* any **pointer capture** in the path (both docks capture on press for drag-to-select)
  makes the browser suppress `pointerenter` / `pointerleave` on every other element;
* a **fractional device-pixel ratio** can leave a sub-pixel seam between the line's top
  edge and the panel's bottom edge, and the panel's own open transition moves it too.

The fix is one rule, expressed as geometry instead of event order: **the line and the
panel are one interaction area**, and a close is only committed when the pointer's last
known position is genuinely outside the union of those two boxes. A pointer anywhere
between the line and the buttons can never hide the dock — whatever the event order was.

No CSS and no visual design was touched. The dock's material, seat, size, animation and
item layout are byte-for-byte what shipped.

## The rule

New shared module `src/components/glass-dock/peekDockArea.ts`:

```ts
export const PEEK_DOCK_AREA_SLACK = 10            // hairline of slack, not a page region
export function peekDockAreaOf(el): Box | null    // getBoundingClientRect, null when 0×0
export function isInsidePeekDockArea(x, y, boxes, slack = PEEK_DOCK_AREA_SLACK): boolean
```

Both docks now:

1. track the pointer's last known position while the dock is live — a passive,
   window-level `pointermove` (so a captured pointer is still followed) plus every
   enter / leave / down / move they already receive;
2. `hide()` arms the same old 80 ms grace, and the timer then asks the **area**
   (`pointerInArea()`) before it sets the dock closed;
3. treat a mouse leaving the **document** as an exit — and only a real window exit
   (`pointerout` bubbles to `document` for every element-to-element move; a release at
   the end of a touch contact fires one too, on the very point the learner tapped, so
   neither may null the tracked position);
4. keep the **touch tap** a toggle of the *pin*, decided from the pin captured at
   `pointerdown` (`wasPinnedRef`), never from `open` — a touch contact fires a synthetic
   enter before its `pointerdown`, so `open` is already true and reading it turned the
   first tap into a close. This was a real regression found while testing the fix.

## Click, tap and drag — all three reveal, and all three end in a clickable button

* **Mouse hover** — enter on the line reveals; while the pointer walks down (or
  diagonally) from the line to a button, the area rule keeps it open; the button's own
  click lands.
* **Mouse press on the line, drag onto a button, release** — the dock is revealed at
  `pointerdown`, the button under the release is resolved by geometry
  (`document.elementsFromPoint` → `[data-glass-dock-item]`) on the host that every
  button bubbles through, and that button's `navigate` / `handleSelect` runs. A
  press-drag never produces a `click` on its own, so this is what makes drag-to-reveal
  end on the tab the pointer settled on. The course dock keeps its horizontal-dominance
  check (`|dx| ≥ 12 && |dx| > |dy|`), so a mostly-vertical swipe can never activate a tab.
* **Touch / pen tap** — the line tap pins the dock open (verified at 120 ms *and*
  720 ms after the contact ends, i.e. past the synthetic leave); tapping a button
  selects it and closes; tapping anywhere outside closes. Unchanged: a mouse selection
  leaves the dock open while the pointer rests in it, exactly as before.

## Files

| File | Change |
| --- | --- |
| `src/components/glass-dock/peekDockArea.ts` | **new** — the shared area predicate (pure, unit-tested) |
| `src/components/glass-dock/DesktopPeekDock.tsx` | rewritten close/reveal wiring on the area rule; press-drag selection on the host; window-exit guard |
| `src/course/CoursePeekDock.tsx` | same rule; every existing contract pin kept (handlers on the pre-existing `[data-course-peek-line-hit]` strip) |
| `tests/peekDockRevealContract.test.mjs` | **new** — pins the rule and both docks' wiring to it |
| `tests/peekDockRevealBrowser.test.mjs` | **new** — the real-browser regression suite (skips without Chromium) |
| `tests/fixtures/peekDockHarness/` | **new** — mounts the real `DesktopPeekDock` and the real `CoursePeekDock` (and the real `DesktopShell`) for the browser suite |

## Verification

**Contract suites** (source-string pins, `node --test`) — 134 pass / 0 fail, including
`peekDockRevealContract` 7/7, `desktopRailPeekDockContract` 17/17 and
`coursePlayerPeekDockContract`, `siteFooterNavUnificationContract`,
`coursePlayerKeyboardFooterContract`, `footerDockSmoothDragContract`,
`footerDockSmoothDragRuntime`, `coursePlayerDockMagneticNotesKeyboardContract`,
`desktopFooterNavHiddenContract`, `coursePlayerUx`.

**Real browser** (`tests/peekDockRevealBrowser.test.mjs`, Chromium 1440×900, the real
components on the real chrome) — 7 pass / 0 fail:

* desktop: the pointer walks the line → buttons in 3 px steps, open at every step, and
  the click lands (`#/store`);
* desktop: a leave delivered on the line *while the pointer is over the buttons* — the
  exact reported failure, replayed synthetically — does **not** hide the dock;
* desktop: press → drag → release selects the button under the release;
* desktop: the pointer leaving for real (up the page) **does** hide the dock;
* desktop touch: the tap pins the dock open past the synthetic leave, and a tap on a
  button selects + closes;
* course: the same line → tab walk + click (`notes` selected);
* course touch: the tap pins the dock, the task selects.

**Hand-driven repro against the real `DesktopShell`** — `shell-hover` (16 × 3 px travel:
`open=true` at every step, click `#/store`, still open), `shell-diag` (21-point diagonal:
open at every sample), `shell-touch` (opens on a line tap — pre-fix this was `false` at
120 ms and 720 ms — then selects + closes), `desktop-drag` (open mid-drag, release lands
on `store`), `course-hover` (`notes` selected, closes), `course-touch`, `course-drag`
(`notes` selected, closes).

**No regressions**: the full 3,236-assertion suite was run against the fixed tree and
against a stashed baseline. The fixed tree's 69 failures are a strict subset of the
baseline's 73 — the four extra baseline failures are the new `peekDockRevealContract`
tests (they assert the fix, so they fail on the old code). Every remaining failure is a
pre-existing, unrelated one (Sanctuary/FlowPath/Store/style pins and the Sanctuary engine
`pretest` build artifacts).

## Note

The change is left in the working tree on `arena/01a0fd9c-digitalcatalyst` (uncommitted,
same as the rest of this session's work).
