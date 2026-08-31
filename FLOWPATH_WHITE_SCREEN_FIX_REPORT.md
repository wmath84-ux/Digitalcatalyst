# FlowPath White-Screen Fix Report

**Date:** 2026-08-31
**Branch:** `arena/01a0582c-digitalcatalyst`
**PR:** #521

## Reported symptom

> "Whenever we try to open the FlowPath page it first opens successfully,
> then after a little while the page shows a white screen and we can't go
> back from that page."

## Root cause

The Firestore merge in `FlowPathView` cast every server `kind` straight onto
the local `Activity.type`. The server can store kinds the local
`ActivityType` union does not model:

1. **`lecture` docs** — created by the FlowPath lecture planner
   (`flowpath.bulk`). The merge passed `type: fp.kind = "lecture"` into the
   cards/nodes.
2. **`schedule` docs** — the merge spread `type: fp.scheduleType`
   (`"personal"`, `"study"`, …), overwriting the valid `"schedule"` type.

`ActivityCard` / `ActivityNode` then looked up `ACTIVITY_TYPE_META[type]`
→ `undefined` → `meta.color` threw:

```
TypeError: Cannot read properties of undefined (reading 'color')
```

React 19 unmounted the whole root → white screen. Because the app is
hash-routed through that same tree, every navigation (Home button, browser
Back) was dead too. The crash fired when the first `flowpath.list` response
landed (≈1 s after mount) — exactly the "opens fine, then white after a
moment" behaviour.

## Fix

| Layer | Change |
| --- | --- |
| Merge (`FlowPathView.tsx`) | New `toLocalActivity()`: unmodelled kinds normalize to `"other"` while the original kind rides along in `activity.flowKind`; safe ISO date parsing; schedule times mapped to labels; `scheduleType` can no longer overwrite `type`. |
| Display resolution (`types/flowpath.ts`, `icons.tsx`) | `flowPathKindMeta()` + `getFlowKindIcon()` always return a value (fallback meta/icon) — cards/nodes can never do an undefined lookup again. Lecture rows now render the real "Lecture" label/colour/icon plus module, minutes and preview badge. |
| Recovery (`FlowPathErrorBoundary.tsx`, `main.tsx`) | A dedicated error boundary wraps the FlowPath route. Any future render crash stays contained to FlowPath and shows a working **Try again / Go back / Go to Home** screen instead of a dead white page. |
| Data poll (`useFlowPathFirestore.ts`) | Validates the list payload shape (`Array.isArray`, per-item guards) before `setState`. |
| Sync (`useFlowPathSync.ts`) | Diff-based against a fingerprint snapshot: only new → create, changed → update, removed → delete (with 404 → create fallback). Stops re-sending the whole activity list on every edit, which re-fired immediate push notifications and forced an id-token refresh per call. |
| Server (`api/_lib/flowpathControl.ts`) | `flowpath.update` now merges per-kind fields (priority, times, progress, testConfig) so diff-based updates don't silently drop them. |

## Verification

- Reproduced the exact crash on the old code path:
  `ACTIVITY_TYPE_META["lecture"].color` → `TypeError: Cannot read properties
  of undefined (reading 'color')`.
- Runtime render checks (server-render of `ActivityCard`/`ActivityNode`) pass
  for lecture, schedule and corrupt/unknown-kind docs.
- New `tests/flowpathWhiteScreenContract.test.mjs` (5 tests) pins the fix.
- Full suite **1827/1827 pass** — the 3 pre-existing failures were fixed
  afterwards (see below), so nothing is left red.
- `vite build` succeeds; dev server serves the updated modules.

## Pre-existing failures — fixed afterwards

The 3 red tests at the time of the FlowPath fix were fixed by restoring the
app's intended behaviour (keeping the latest updates intact):

1. `adminCustomizableModuleSubscriptionContract` — the latest admin
   Subscriptions page dropped the **"Configure My Day"** label from the
   My Day feature editor. Restored it as the section eyebrow above
   "Non-subscriber daily free creations".
2. `appPortraitOrientationLockContract` — `public/manifest.webmanifest` had
   `"orientation": "any"`; the app's hard rule is portrait-lock everywhere
   except the course player (which unlocks at runtime via
   `screen.orientation.unlock()`), so the static manifest is back to
   `"orientation": "portrait"`.
3. `pwaInstallabilityContract` — same static-manifest orientation
   assertion; fixed by the same one-word change.

Full suite after these two changes: **1827 passed, 0 failed**.

## Course Player: panel state session + mind map theme follow (same PR)

### 1. Notes / Mind Map state stays put while switching inside the player

- Naya shared session store: `src/course/coursePanelSession.ts` (notes view —
  list / compose / edit with draft, mind map view — library / canvas, mind
  map theme override). Module-scope isliye hai ki tab switch par panels
  unmount ho jaate hain, lekin session zinda rehta hai.
- **NotesPanel** ab mount par session se apni jagah restore karta hai:
  agar learner ne editor khola tha (compose ya edit) aur Module/Mind map par
  switch karke wapas aaya, toh **wahi editor wahi draft ke saath** khulta hai.
  Draft ab tab-switch par auto-save (flush) nahi hota — editor mein hi rehta
  hai.
- **MindMapPanel** bhi session se restore karta hai: library par tha toh
  library, canvas par tha toh canvas — "vahi state rahe".
- **Player exit = full reset**: CoursePlayerApp ka unmount cleanup
  `resetCoursePanelSession()` bulata hai, isliye dobara entry karne par
  default state (notes list, mind map library) se khulta hai. Ek hi safety
  net rakha hai — khula hua notes draft exit par saved note ban jaata hai,
  learner ka kaam kabhi nahi khota.
- Purana `saveSignal`/`fireSaveSignal` auto-save plumbing hata diya (ab
  zaroori nahi), aur notes ke localStorage helpers `src/course/notesStore.ts`
  mein share ho gaye (player + panel dono use karte hain).

### 2. Mind map theme hamesha course player ko follow karta hai

- Mind map ka apna light/dark button **per-visit choice** ban gaya: override
  session mein rehta hai (tab switch par bhi wahi rahe), lekin player se bahar
  nikalte hi reset — agli entry par map **hamesha course player ki theme
  follow karta hai** (`themeOverride ?? playerTheme`). Purana
  `dc.mindMapThemeOverride` localStorage (forever-persist) override hata diya.
  Button se user ab bhi sirf mind map ke liye light/dark chun sakta hai.

### 3. Purane 2 TypeScript errors bhi fix

- `src/admin/pages/SubscriptionsPage.tsx` ke unused `SectionCard` / `StatCard`
  imports hata diye (koi behavior change nahi, sirf warnings khatam).

### Verification

- Naya contract test `tests/coursePlayerPanelSessionContract.test.mjs` (6
  tests) + 4 existing test files naye behavior ke hisaab se update.
- Runtime checks: NotesPanel ko actually render karke verify kiya —
  compose/edit state tab-switch ke baad restore hota hai aur exit ke baad
  list par reset hota hai (9/9 pass).
- Full suite: **1833/1833 pass, 0 fail**.
- `vite build` successful; touched files mein 0 TypeScript errors.
