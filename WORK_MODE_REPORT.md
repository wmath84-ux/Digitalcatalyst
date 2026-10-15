# Work Mode — implementation report

**Status (2026-10-15):** Phases 0–5 are implemented on `arena/0846f33a-digitalcatalyst`. The reported Course Player startup crash was traced to `courseAudio` being read while `buildStudyPane` eagerly created the Music tab before the `useMemo` initialized it; the declaration now precedes the pane construction and has a regression check. Work-created content has no app-cloud save/sync path; AI prompts and any opted-in Work Notes sent for generation are still transmitted to the learner’s configured AI provider for processing, while chat history stays on-device. Phase 4 includes a local JSON backup/export and an explicitly confirmed restore. Phase 5 includes scoped light/dark coverage, accessible lazy-loading states, reduced-motion support, device safe-area spacing, and documented bundle measurements.

**Implementation is complete; final external sign-off is still pending.** This sandbox cannot verify Android notifications while the app is asleep or terminated, and visual browser inspection could not launch because the available Chromium build requires the missing system library `libnspr4.so`. Do not interpret those checks as passed. The full design specification is in `docs/work-mode-implementation-plan.md`.

## Latest verification

- `npm run test:work` — **28/28 passed**, including local-storage isolation, My Day reminder/repeat logic, Work split interactions, lazy page loading, and Work Revision backup/restore.
- Course Brain deck, practice, and SELF contracts — **54/54 passed**; Course score history and SELF controls remain covered separately from Work.
- `npm run test:course-sync` — **152/152 passed**, including Course Notes/Mind Map cloud-sync/runtime contracts and Course player session/scope behavior.
- `npm run test:chat` — **75 passed, 1 browser-only test skipped**; Course split and AI regressions remain green.
- `node --test tests/coursePlayerWhiteScreenRecoveryContract.test.mjs` — **3/3 passed**, including the new eager-study-pane initialization contract; a Vite SSR smoke render of `CoursePlayerApp` also succeeded after the ordering fix.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.
- `NODE_OPTIONS=--max-old-space-size=2560 npm run build:low-heap` — passed. The ordinary heap setting previously failed from memory pressure. Existing warnings remain for missing `VITE_YOUTUBE_API_KEY`, mixed dynamic/static imports, and shared chunks over the configured size warning.
- Production chunks: the initial Work route is **22.0 KB (7.8 KB gzip)**; Work Revision is **77.3 KB (19.5 KB gzip)**. Notes, Mind Map, Sketch, AI, My Day, and Revision feature surfaces are loaded on demand.
- `npm ci` restored the repository's locked dependencies after the unsuccessful sandbox browser launch attempt; the lockfile was not changed for that attempt.

## Implemented phases

- **0–1 — foundation and split deck:** immersive `#/work` route, Home/Work startup choice and Settings preference, desktop/mobile entry points, scoped Work theme, six-destination footer, last-page/history preferences, and the Course `SplitDeck` with Work-only split policy. The Course Player's light-only theme behavior remains unchanged.
- **2 — reused surfaces:** Notes, Mind Map, Sketch, and AI receive Work theme and device-only overrides. Work displays personal content rather than course masters; sketch scenes/library use Dexie, and AI chat history is local-only and receives Work Notes.
- **3 — My Day:** Dexie-backed local items/notebooks, editor/library flow, recurrence calculations, and browser foreground reminders are implemented and runtime-tested. The browser deliberately reports that reminders do not run in the background. Native notification scheduling is implemented, but recurring delivery reliability on a physical Android device is still unverified.
- **4 — Work Revision:** local sets, Brain/FSRS study, AI generation, CSV/TSV, Markdown and JSON import, isolated Work score history, and JSON backup/export/restore. Anki `.apkg` archives are not opened directly; export them from Anki as TSV/plain text first. Restore checks the Work namespace and requires an explicit overwrite confirmation.
- **5 — polish:** reduced-motion preferences are passed to Work motion components; the shell respects top/left/right safe areas and the footer owns the bottom inset; page loading announcements and empty/error states are present; heavy feature surfaces are lazy-loaded and measured above.

## Remaining checks / limitations

1. On a real Android device, validate notification permission, time-zone behavior, and recurring reminders across screen-off, sleep, app swipe-away, and force-stop. Current runtime coverage proves recurrence calculation and foreground/browser behavior only; it does **not** prove recurring delivery after termination.
2. Perform manual visual and touch inspection on desktop, phone, and tablet in light/dark mode. The browser-launch attempt in this sandbox failed on the missing `libnspr4.so`, so no visual sign-off is claimed here.
3. Convert Anki `.apkg` files to TSV or plain-text export before importing; direct `.apkg` archive parsing remains out of scope.

These are device/browser validation constraints, not unfinished code tasks that can be safely completed in this sandbox.

## Historical Phase 0 + 1 checkpoint

At that checkpoint the Work page bodies were explicitly labelled placeholders, not shipped feature pages. Those placeholders were subsequently replaced by the Phase 2–4 implementations above.

## Design references

- `docs/work-mode-implementation-plan.md` — repository map, original product specification, responsive rules, phase gates, and risks.
- `recreate-obsidian-notes-design.zip` — toolbar/header/drawer reference extracted into the plan.
- `https://uiverse.io/asgardOP/great-badger-21` — footer geometry and motion values adapted in `src/work/work-footer-nav.css`.
