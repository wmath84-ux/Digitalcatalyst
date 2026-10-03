# Course Player — the note toolbar follows the CURSOR, and ends above the Footer Navigation

**Owner's direction:** the Course Player toolbar loads only when the keyboard is
opened. That is fine on a phone, and broken everywhere else — a desktop, a big
tablet running the player in desktop view, a floating window: none of those ever
opens a soft keyboard, so a learner who clicks a text field and sees a cursor
still gets no toolbar. Show it the instant a cursor is detected. The Course
Player's footer navigation is also on screen, so the toolbar must sit just above
it — and the case where the footer navigation is off must be cared for too.

---

## 1. What was wrong

The note editor's one toolbar was gated on the player's keyboard state:

```ts
// src/course/NoteEditor.tsx (before)
const { keyboardVisible } = useCourseKeyboard();
const docked = !readOnly && keyboardVisible && (focused || dockFocused);
```

`keyboardVisible` is only ever `true` when a text field inside the player has
focus **and** the viewport has made room for a keyboard
(`src/course/courseKeyboard.ts`). That second half is right for what it was
built for — hiding the footer navigation, taking the study pane over the deck —
but it silently made the toolbar a *keyboard* feature instead of a *writing*
feature:

| Device | Keyboard opens? | Toolbar before | Toolbar now |
|---|---|---|---|
| Phone / small tablet | yes | appears with the keyboard | appears with the cursor (a beat earlier) |
| Big tablet, player in desktop view | **no** | **never** | appears with the cursor |
| Desktop browser | **no** | **never** | appears with the cursor |
| Floating / freeform window | **no** | **never** | appears with the cursor |

And once it did appear, nothing told it where the footer navigation was: the
toolbar is laid out in flow at the bottom of the note pane, and the
bottom-centre **peek dock** is pinned to the bottom of the player, so the
toolbar would sit underneath the footer's line and its 30 px hit strip —
unreachable, not merely covered.

---

## 2. The new rule

```
a cursor in the note  →  the toolbar is on screen
the cursor leaves     →  the toolbar is gone
```

No keyboard involved, on any device.

```ts
// src/course/NoteEditor.tsx (after)
const focused = useEditorFocus({ includeEditorUI: true });   // body + BlockNote's popovers
const [caretWithin, setCaretWithin] = useState(false);       // the shell: sees the TITLE field
const [dockFocused, setDockFocused] = useState(false);       // a toolbar control in use
const docked = !readOnly && (focused || caretWithin || dockFocused);
```

* **`caretWithin` is tracked on the shell**, not per field (React's focus events
  bubble), so the caret moving title → body never passes through a "no caret"
  frame that would unmount the toolbar and remount it a frame later — the
  learner sees no flicker on the hand-off. Proven at runtime: the toolbar DOM
  node is *the same node* before and after the hand-off.
* **Read-only still gets no toolbar**, cursor or not.
* **A finger as the primary pointer** still replaces the floating selection
  toolbar with the docked one (one set of tools, no bubble under a thumb). With
  a **fine pointer both exist**: the dock is always reachable at the bottom and
  the floating toolbar still follows the words being formatted — the desktop
  behaviour that was there before is untouched.
* **Undo / Redo no longer steal the cursor out of the title.** The toolbar is
  now up while the title field has the caret, so `HistoryButton` checks who owns
  the caret and only refocuses the body when the body already had it.

---

## 3. Where the toolbar ends: measured, never assumed

Two new files, in the same shape as the player's keyboard state
(`courseKeyboard.ts` + `useCourseKeyboard.tsx`): the maths with no React in it,
then the subscription.

### `src/course/courseFooterInset.ts` — the maths

```
COURSE_FOOTER_SELECTOR = "[data-course-peek-dock], [data-course-dock]"
COURSE_FOOTER_INSET_PROPERTY = "--dc-note-footer-inset"

measureFooterInset(surface, footer) →  covered = min(surface.bottom, footer.bottom) − footer.top
```

The lift is **how many px of the writing surface's bottom edge the footer
covers**, which answers all three of the owner's cases with no setting, no flag
and no constant:

| Footer navigation | Measured lift | Result |
|---|---|---|
| **Peek dock** (bottom centre, pinned to the player, overlays the pane) | the covered px — line + hit strip + open panel | toolbar ends exactly at the footer's top edge, clear of its hit strip |
| **Always-visible dock** (the study pane's last child, in flow *below* the notes panel) | `0` — it starts exactly where the pane ends | toolbar already ends at it; no empty strip above it |
| **Off** — hidden by the player's ONE keyboard rule (`display: none`, i.e. a zeroed rect), or absent altogether | `0` | toolbar drops flush to the bottom edge, **no phantom gap above nothing** |

A sub-pixel seam counts as 0, and a full-height footer can never invert the page.
Every footer in the document is considered and the largest answer wins, so the
rule needs no help from the player's footer-dock setting: whichever home the
footer lives in is the one measured, and a hidden one simply answers 0.

### `src/course/useCourseFooterInset.ts` — the subscription

`useCourseFooterInset(active, surfaceRef) → px`, re-read only when something can
actually move the footer or the pane: the viewport (resize / visualViewport /
rotation), a `ResizeObserver` on the pane and on the footer (the peek dock
*grows* when it opens and collapses to zero when the keyboard rule hides it; the
split divider drags the pane), and a `MutationObserver` that fires **only** for a
change touching a footer — the learner flipping "Always-visible footer dock"
(one footer unmounts, the other mounts) or the player shell republishing
`data-course-keyboard`. The mutation filter asks O(1) questions of the changed
node, so the editor's per-keystroke DOM writes never scan a subtree.

It runs in a **layout effect** and only while the toolbar is on screen: the first
frame the toolbar appears it is already in the right place, and an idle note
editor subscribes to nothing.

### The CSS — one line

```css
.dc-note .dc-note-dock { margin-bottom: var(--dc-note-footer-inset, 0px); }
```

A **margin**, not padding: the bar's own paper stops where the footer begins and
what is between them is the pane's own background. No `position: fixed`, no
keyboard-sized constant, no hard-coded footer height — the toolbar stays in
normal flow, so the pinned "no hard-coded heights" contract still holds.

---

## 4. Files touched

| File | Change |
|---|---|
| `src/course/courseFooterInset.ts` | **new** — the footer-lift maths, no React |
| `src/course/useCourseFooterInset.ts` | **new** — the hook: viewport / resize / mutation subscriptions, layout-effect measure |
| `src/course/NoteEditor.tsx` | the toolbar is gated on the caret, not the keyboard; publishes the lift on the shell (`--dc-note-footer-inset` + `data-note-footer-inset`); floating selection toolbar kept on fine pointers |
| `src/course/NoteEditorToolbar.tsx` | Undo / Redo keep the caret in the title; the header describes the new rule |
| `src/course/noteEditor/noteEditor.css` | `.dc-note-dock { margin-bottom: var(--dc-note-footer-inset, 0px) }` |
| `tests/coursePlayerNoteToolbarCaretRuntime.test.mjs` | **new** — 10 runtime tests, the real `NoteEditor` in React + jsdom |
| `tests/coursePlayerNoteToolbarFooterRuntime.test.mjs` | **new** — 13 runtime tests, the real maths + hook in React + jsdom |
| `tests/noteEditorContract.test.mjs` | the caret rule, the "no second keyboard system" promise and the footer-lift contract |
| `tests/noteEditorBrowser.test.mjs` | the toolbar no longer waits for the keyboard; the selection-toolbar selectors name the floating one; two new footer-navigation tests |
| `tests/fixtures/noteEditorHarness/harness.tsx` | opt-in footer navigation (`?footer=peek` / `?footer=pane`), both homes, real geometry |

Nothing about the keyboard rule itself moved: the footer navigation still hides
completely while the keyboard is open, the study-pane takeover still reads the
common state, and Notes / Mind Map / AI Mentor keep their existing behaviour.

---

## 5. Verification

**Runtime (the real code, executed):**

* `node --test tests/coursePlayerNoteToolbarCaretRuntime.test.mjs` — 10/10 pass.
  The **real** `NoteEditor` (BlockNote + ProseMirror + ariakit) mounted in
  React 19 inside jsdom, in an environment with **no `visualViewport` and no
  keyboard provider at all**:
  * no cursor → no toolbar;
  * a cursor in the **title** → the toolbar is up instantly (the exact broken
    case: no keyboard anywhere);
  * title → body hand-off → **the same toolbar node**, no remount;
  * caret leaves → toolbar gone; focus on a toolbar control → stays;
  * read-only → never;
  * peek dock present → `data-note-footer-inset="48"` and `--dc-note-footer-inset: 48px`;
  * in-flow dock → no lift and no gap; footer hidden → lift dropped, toolbar
    still there; footer back → lift back; no footer → no lift.
* `node --test tests/coursePlayerNoteToolbarFooterRuntime.test.mjs` — 13/13 pass.
  The real `measureFooterInset` / `readCourseFooterInset` / `useCourseFooterInset`,
  driven through overlaying footers, in-flow footers, `display:none` footers,
  swapped footers, a footer that only moves, the `data-course-keyboard` backstop,
  and the `active === false` case (subscribes to nothing).

**Whole suite** — `node --test tests/*.test.mjs`:

* **3187 tests, 3057 pass, 85 fail** — and those 85 are *byte-identical* to the
  85 that fail on the base commit (verified by stashing the tree and diffing the
  sorted failure lists: no new failures, none fixed by accident). 27 tests added,
  all passing.
* `npx tsc --noEmit` — identical to the base commit (11 pre-existing errors in
  unrelated files: `FlowPathImportModal`, `ReadingBoard`, `interiors.ts`, …;
  none in a file touched here).
* `npx vite build` — clean, built in 21 s.

**Could NOT be run here:** `tests/noteEditorBrowser.test.mjs` (the real-browser
suite) **skips** in this sandbox — Playwright's Chromium download is blocked
(`cdn.playwright.dev` and `storage.googleapis.com` both reset the connection),
and no system Chromium is installed. Its assertions were updated to the new rule
and the two new footer tests were added, but they are **unverified until run on
a machine with Chromium** (`npx playwright install chromium`).

**Manual check on device** (recommended):

1. Big tablet, player in desktop view → Notes → tap a text field → the toolbar
   is there the instant the cursor is, above the footer navigation.
2. Same on a desktop browser and in a floating window.
3. Player settings → "Always-visible footer dock" ON → the toolbar ends at that
   dock, with no strip between them.
4. Phone → tap the editor → the toolbar is above the keyboard and the footer
   navigation is hidden (unchanged); close the keyboard → the toolbar stays (the
   cursor is still there) and the footer comes back under it.
5. Tap away from the note → the toolbar goes.
