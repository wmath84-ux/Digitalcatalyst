# Course Player “hit a snag” (React error #185) — Fix Report

**Date:** 2026-10-16
**Branch:** `arena/f2a30814-digitalcatalyst`

## Reported symptom

> **Course Player hit a snag** — “Something went wrong while opening this
> course. Your saved progress is safe. Reload to retry, or return to your
> purchases.”
> Technical details: `Minified React error #185`.

React error #185 is **“Maximum update depth exceeded”** — React aborted a
component that kept re-rendering itself. It was thrown while the Course Player
was mounting, so the player’s own error boundary
(`src/components/CoursePlayerErrorBoundary.tsx`) caught it and drew the snag
screen. Reloading did not help: the next mount crashed the same way.

## Root cause

`src/course/courseViewSettings.ts` — the store behind **Settings → Course view**
(zoom + the four divider switches) — was handing React a **new object on every
read**:

```ts
export function getCourseViewSettings(): CourseViewSettings {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return COURSE_VIEW_DEFAULT_SETTINGS;   // ← the shared object (stable)
  return normalize(JSON.parse(raw) as unknown);    // ← a FRESH object every call
}

export function useCourseViewSettings() {
  return useSyncExternalStore(subscribe, getCourseViewSettings, () => …);
}
```

`useSyncExternalStore` requires the snapshot to be **identity-stable**: React
calls the getter during render and again straight afterwards, and any change of
reference means “the store changed”. Here the second read always returned a new
object, so React re-rendered, read again, got another new object… forever:

```
Warning: The result of getSnapshot should be cached to avoid an infinite loop
Error:   Maximum update depth exceeded. This can happen when a component
         repeatedly calls setState inside componentWillUpdate or
         componentDidUpdate. React limits the number of nested updates…
         → React error #185
```

### Why it looked intermittent

The getter returns the **shared module object** `COURSE_VIEW_DEFAULT_SETTINGS`
when the device has nothing stored — stable, so a fresh profile opened the same
course perfectly. The loop only started once the device had a stored value in
`dc-course-view-settings`, i.e. **after the learner had ever touched Course
view** (zoom or a divider checkbox). That is exactly the owner’s device, and it
is why “reload and retry” never worked there.

Both surfaces that call the hook crashed: the **Course Player**
(`useCourseViewSettings()` in `CoursePlayerApp.tsx`) and **Work mode**
(`WorkApp.tsx`), since both mount it at the top of their render.

### Reproduced before touching anything

A jsdom harness (esbuild bundle + `react-dom/client`) that mounts a component
reading the real hook, with one stored value in `localStorage`:

```
outcome: THREW: Maximum update depth exceeded. … (React error #185)
console: The result of getSnapshot should be cached to avoid an infinite loop
```

## Fix

| Layer | Change |
| --- | --- |
| `src/course/courseViewSettings.ts` | The getter now caches by the **stored raw string**: an unchanged value returns the *same* object every read, and a real change (a zoom, a divider switch, another tab’s write) re-parses exactly once. Nothing stored, storage denied or unreadable JSON answers the shared `COURSE_VIEW_DEFAULT_SETTINGS` object — always the same reference. Same rule `src/work/storage/workPrefs.ts` already documents for its history snapshot. |
| `tests/courseViewSettingsSnapshotRuntime.test.mjs` (new) | Runtime regression proof, 8 tests: the stored-settings course opens with **zero** React errors; reads return the same object and unrelated re-renders never see a new one; zoom/divider changes and another tab’s write still land live; unreadable JSON and a cleared value fall back to the shared default; unmount → mount again stays clean. |

No other store in the codebase has this problem — every other
`useSyncExternalStore` in `src/` returns a primitive or a cached reference
(`coursePanelSession`, `quadLayout`, `useLocalCourseProgress`,
`footerNavigation*`, `courseViewSettings`’ siblings in Work mode’s
`workPrefs.getWorkHistory`, `utils/preferenceStore`, `useThemeMode`, the toast
shim, `glass.tsx`).

## Verification

* The new runtime test **fails 6/8 against the pre-fix getter** and passes 8/8
  with the fix — it is a real regression guard, not a description of the code.
* The four neighbouring suites still pass: `coursePlayerQuadDeckContract`,
  `coursePlayerQuadDeckRuntime`, `coursePlayerQuadFlexRuntime`,
  `workModeQuadParityContract` (64 tests).
* `npx tsc --noEmit` is clean.

## Learner-visible result

Opening a course no longer depends on whether Course view was ever customised:
the player, Work mode and the Course view settings page all mount normally, and
zoom / divider changes still apply live with no reload.
