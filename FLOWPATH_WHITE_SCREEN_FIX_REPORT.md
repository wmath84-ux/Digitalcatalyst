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
- All 72 FlowPath contract tests pass; full suite 1824/1827 — the 3 failures
  are pre-existing and unrelated (admin-subscription UI text, PWA manifest
  orientation).
- `vite build` succeeds; dev server serves the updated modules.
