# Course Player — keyboard + Footer Navigation: ONE common rule

**Owner's direction:** while the soft keyboard is open inside the Course Player,
the **Footer Navigation must be completely hidden** — never above the keyboard,
never between the keyboard and the writing surface. The rule must be ONE common
keyboard-visible state, not three per-feature hacks, and Notes / Mind Map's
existing content resize / hide / restore behaviour must stay exactly as it is.

---

## 1. What was wrong

| # | Symptom | Root cause |
|---|---------|-----------|
| 1 | Footer Navigation visible **above the keyboard** (a strip between the writing area and the keyboard) | Both footer homes (the bottom-centre **peek dock** and the legacy **in-pane dock**) were keyboard-blind. The peek dock is `position: fixed; bottom: 0`, so on an engine that resizes the viewport it lands exactly on the keyboard's top edge — a strip of glass + a 30 px hit area over the writing area. |
| 2 | Notes / Mind Map "module hide" sometimes not engaging | The deck's `useKeyboardInset` only measured an **overlay** keyboard (`innerHeight − (visualViewport.height + offsetTop)`). An Android WebView with `adjustResize` shrinks the **layout** viewport, where that expression is `0` by definition — so the deck saw "no keyboard". |
| 3 | AI Mentor: module/course content stayed visible while typing | The writing-tab takeover was only enabled for `notes` and `mindmap`. |

---

## 2. The common keyboard state (the architecture ask)

Two new files — the ONE place the player decides whether the keyboard is open.

### `src/course/courseKeyboard.ts` — the maths (no React)

```
COURSE_KEYBOARD_MIN_INSET = 90          // below this it is browser chrome, not a keyboard
COURSE_KEYBOARD_ATTRIBUTE = 'data-course-keyboard'
COURSE_KEYBOARD_INSET_PROPERTY = '--course-kb-inset'

measureKeyboardCoverage()  →  max(
    layout − (visualHeight + visualOffsetTop),   // OVERLAY keyboard (mobile Chrome)
    restingHeight − layout                       // RESIZE keyboard (Android WebView)
)
nextRestingHeight()        →  never follows the viewport down while typing
resolveCourseKeyboardState() →  keyboardVisible === editingInsideScope && coverage ≥ 90
```

* `keyboardVisible === true` **only** while a text-entry element (`input`,
  `textarea`, or a `contenteditable` — the notes / mind-map editors) inside the
  player actually has focus **and** the viewport really made room for a
  keyboard. A rotated device, a browser-chrome (URL bar) shift or a desktop
  window resize can never fake it.
* The `contenteditable` check has an attribute fallback, because engines exist
  that never implement `isContentEditable` — a notes editor that failed to
  register would leave the footer up over the keyboard, i.e. the original bug.

### `src/course/useCourseKeyboard.tsx` — the hook + provider

* `useCourseKeyboardViewport(scopeRef)` subscribes to `visualViewport`
  `resize` / `scroll`, `window resize`, `focusin` / `focusout` and orientation
  changes, coalesces them to one read per animation frame, and re-renders
  **only** when the resolved state actually changes (identity-stable state, so
  the keyboard's animation burst costs nothing).
* `<CourseKeyboardProvider scopeRef={playerShellRef}>` wraps the whole player
  shell in `CoursePlayerApp.tsx` and publishes the state on the DOM:
  `data-course-keyboard="open|closed"` + `--course-kb-inset` — the same
  pattern the AI chat already uses with `.kb-open`. Nothing is persisted: the
  state is derived, so closing the keyboard restores everything automatically.
* `useCourseKeyboard()` is the single reader used by every surface.

### The rule

```
keyboardVisible === true  →  Footer Navigation HIDDEN
```

Enforced from that one state, in both footer homes:

* `src/course/CoursePeekDock.tsx` — the peek dock root gets
  `data-keyboard-hidden` + the `hidden` class (`display: none`, so the line,
  the open dock **and** its 30 px hit strip all leave the layout — no strip of
  glass, no stray tap target above the keyboard).
* `src/course/CourseOverlay.tsx` — the legacy in-pane dock carries the same
  class off the same state.
* `src/index.css` — the shared backstop:
  `.course-player-shell[data-course-keyboard="open"] [data-course-peek-dock],
   .course-player-shell[data-course-keyboard="open"] [data-course-dock] { display: none !important }`.

The footer is **hidden, not unmounted**, so the learner gets back exactly the
footer they had — no remount flicker, no chance of a second footer while the
first animates away, and no persisted "hidden" flag that could stick.

---

## 3. The three flows

| Flow | Keyboard OPEN | Keyboard CLOSE |
|------|---------------|----------------|
| **Notes** → writing | Study pane takes the whole deck (module/lesson hidden, divider hidden), footer navigation `display:none`. Unchanged sizing/padding of the notes editor. | Editor, split ratio, pane collapse, lesson and footer all return exactly as they were. |
| **Mind Map** → tap/edit a node | Same: module content hidden, map canvas + its keyboard area use the whole screen, footer navigation `display:none`. | Fully restored. |
| **AI Mentor** → tap the chat input | Same takeover (new): module/course content hidden, the chat + composer own the whole deck, footer navigation `display:none`. | Module content, split and footer restored. |

Visual result in every case:

```
[ Notes / Mind Map / AI Mentor active area ]
[ Keyboard ]
```

Never: `[ feature ] [ Footer Navigation ] [ Keyboard ]`.

### Notes / Mind Map behaviour preserved

* `useKeyboardInset` (the deck's own overlay-inset hook, its focus scope check
  and its `paddingBottom: keyboardInset ? keyboardInset : undefined` padding)
  is **untouched** — it still pads only for an OVERLAY keyboard, so an engine
  that already resized under the keyboard never gets a second pad (that would
  have left an empty strip exactly where the old footer sat).
* The takeover condition is the same expression with the common state OR'd in:
  `(keyboardInset > 0 || keyboardVisible) && keyboardExpandEnabled && collapsed !== "study"`.
  In the overlay engine the result is identical to before; in the resize engine
  the takeover now engages instead of silently not firing.
* `keyboardExpandEnabled` now also covers the `ai` tab — the only behavioural
  widening requested, and it is the same prop / same logic for all three.
* The Footer Navigation's design, dimensions, colours, gestures, look and the
  "Always-visible footer dock" Player preference are untouched.

---

## 4. Files touched

| File | Change |
|------|--------|
| `src/course/courseKeyboard.ts` | **new** — the viewport maths + the one rule's definition |
| `src/course/useCourseKeyboard.tsx` | **new** — the hook, the provider, `useCourseKeyboard()`, DOM publishing |
| `src/CoursePlayerApp.tsx` | mounts the provider around the shell; `keyboardExpandEnabled` covers `notes` / `mindmap` / `ai` |
| `src/course/CoursePeekDock.tsx` | peek dock hides while `keyboardVisible` |
| `src/course/CourseOverlay.tsx` | legacy in-pane dock hides while `keyboardVisible` |
| `src/course/studyPanels.tsx` | takeover reads the common state as well as the deck's own inset |
| `src/index.css` | the shared CSS backstop for both footer homes |
| `tests/coursePlayerKeyboardFooterContract.test.mjs` | **new** — 11 contract tests for the whole rule |
| `tests/coursePlayerDockMagneticNotesKeyboardContract.test.mjs` | the two takeover assertions extended to the new expression + AI tab (everything else pinned and unchanged) |

---

## 5. Verification

**Contract tests** — `node --test tests/*.test.mjs`:

* 2447 subtests, 2415 pass, **32 failures — the exact same 32 that fail on the
  base commit** (unrelated, pre-existing; verified by diffing the failure list
  against a stashed clean tree). My new file adds 11 passing tests.
* `npx tsc --noEmit` — clean apart from one pre-existing, unrelated error
  (`src/subscription/components/PricingGlassCard.tsx` unused variable).
* `npx vite build` — clean; the rule survives minification as
  `.course-player-shell[data-course-keyboard=open] [data-course-peek-dock],…{display:none!important}`,
  and Tailwind's `.hidden{display:none}` is emitted.

**Runtime harnesses** (real components, real DOM, both keyboard engines):

* The shared maths was exercised directly: overlay keyboard, resize keyboard,
  closed keyboard, browser-chrome (48 px) movement, viewport scroll, rotation
  re-baselining, blur restore, text-entry detection.
* The provider + the **real** `CoursePeekDock`, `CourseOverlay` (legacy dock)
  and `SplitDeck` were mounted together and driven through:
  1. **Notes** — open the composer, focus the real editor, keyboard opens
     (both engines) → `data-course-keyboard="open"`, peek dock `display:none`,
     lesson pane `display:none`, `data-keyboard-takeover="true"`, exactly one
     footer in the DOM; keyboard closes → byte-identical state to the start.
  2. **Mind map** and **AI** tabs → the same rule, in both engines.
  3. **Legacy in-pane dock** preference → hidden while typing, restored after.
  4. **10 open/close cycles** (alternating engines) → no duplicate footer, no
     stuck-hidden footer, no leftover attribute, no layout state drift.
  5. Unmount → `data-course-keyboard` and `--course-kb-inset` are gone from the
     DOM (no other screen can inherit the state).

**Manual check on device** (recommended):

1. Course Player → Notes → tap the editor → keyboard open → footer gone.
2. Close the keyboard → footer back at exactly the same spot.
3. Mind Map → tap a node / rename → same two checks.
4. AI Mentor → tap the chat input → module content hidden, chat + composer
   above the keyboard, footer gone; close → module content + footer restored.
5. Repeat 1–4 a few times, and rotate once in between: no layout jump, no blank
   strip above the keyboard, no duplicate footer, no stuck-hidden footer.
