# Part 16 — Mac Mode removal, dead-file sweep, bundle strategy

Date: 2026-09-07. Branch `arena/01a07b45-digitalcatalyst`.
Parts 1 + 2 implemented; Part 3 is investigation only — **no splitting change
without explicit approval.**

## Baseline (Part 14, commit `8e687e5`)

`dist/index.html` 5,110.09 kB raw / 1,357.39 kB gzip, ~4,450 modules,
suite 2184/2184, tsc 6 pre-existing errors.

## Part 1 — Mac Mode removed completely

Deleted:

| Path | Size | Notes |
|---|---|---|
| `src/macos/` (68 files) | 1.1 MB src | Vendored macOS Web Simulator incl. `LICENSE` (MIT, Likhith SP), `README.md`, `MacOSApp.jsx`, `macos.css`, `assets/` |
| `src/components/macmode/` (2 files) | — | `MacModeHost.tsx` (portal + lazy seam + font injection + scroll lock) and `MacModeButton.tsx` (top-bar pill) |
| `public/macos/` (53 files) | **57 MB** | Wallpapers, audio, icons, images — found during verification: still copied to `dist/` on every build, zero references left in `src` |
| `src/index.css` at-rules block | 62 lines | The simulator's `@custom-variant dark`, `@theme inline` shadcn token map, and `@theme --font-syne` block |
| `DesktopShell.tsx` wiring | 16 lines | Import block, `macMode` state, top-bar `<MacModeButton>`, `{macMode ? <MacModeHost/> : null}` portal mount |

Pre-deletion checks: repo-wide grep showed the only references outside
`src/macos/` were `DesktopShell.tsx`, `MacModeHost.tsx`, and the `src/index.css`
block; zero test/doc/script references. The CSS at-rules were safe to drop —
`dark:` utilities, the shadcn token classes (`bg-background`,
`text-muted-foreground`, …), and `font-syne` have no consumers outside the
simulator. No `vite.config.ts` / `tsconfig` / alias mentioned it
(`@/macos/…` resolved through the plain `@ → src` alias).

Kept deliberately (descriptive prose, not simulator references):

- `GlassCommandPalette.tsx` comment ("the way every macOS app does"),
- `index.css` "GLASS DOCK — macOS-style magnifying footer" comment,
- the dated liquid-glass audit/rollout docs (they describe the dock design),
- the `base64 -i … # macOS` comment in `scripts/print-sha1.sh`.

License: the MIT attribution clause applies to *copies* of the software.
The removal is total — no simulator file, asset, or style remains — so no
`NOTICES` obligation survives. (Recorded here so the deletion is auditable.)

Result (Part 1 only): `dist/index.html` **4,197.24 kB raw / 1,156.92 kB
gzip** (−912.85 / −200.47, −17.9% / −14.8%), **3,371 modules** (−1,079),
`dist/` 78 MB → 21 MB. tsc: same 6 pre-existing errors.

## Part 2 — dead-file sweep (13 files, ~103 KB src)

Every file below was re-verified with filename + export-name + path-based
greps over `src/`, `tests/`, `scripts/`, `api/`, `utils/` before deletion.
Three candidates from the original list needed test surgery beyond a plain
delete; all are detailed here.

| File | Bytes | Dead because | Live replacement |
|---|---|---|---|
| `src/admin/pages/ManualCurriculumEditor.tsx` | 35,178 | Zero imports. `AdminApp` routes `/admin/curriculum` → `CurriculumBuilderPage`, which renders `RevisionCurriculumSection` | `CurriculumBuilderPage` + `RevisionCurriculumSection` |
| `src/flowpath/components/ActivityEditor.tsx` | 26,786 | Zero imports. `FlowPathView` creates via `CreateModal` + `LecturePicker` | `src/components/flowpath/CreateModal.tsx` |
| `src/flowpath/components/BulkRevisionCreator.tsx` | 15,418 | Zero imports (same) | `CreateModal` + `LecturePicker` |
| `src/components/ui/MacWindowModal.tsx` | 2,581 | Zero imports. The project's own audit (`docs/liquid-glass-full-audit-2026-09-02.md:243`) prescribed: "0 call-sites → delete" | Pack `GlassSurface` / `Modal` |
| `src/components/ui/TrafficLights.tsx` | 718 | Only consumer was `MacWindowModal` | — (deleted together) |
| `src/components/ui/taga-toggle.tsx` | 6,712 | Zero references anywhere (any case) | — |
| `src/hooks/useFeatureVisibility.ts` | 2,610 | Zero imports, zero calls. Same-named live hook in `FeatureVisibilityContext` (different signature) | `src/context/FeatureVisibilityContext.tsx` |
| `src/hooks/useUsageThisMonth.ts` | 3,827 | Zero imports. Pricing math lives in `utils/subscriptionPricing.ts` | `utils/subscriptionPricing.ts` |
| `src/course/useRotatedScroll.ts` | 5,488 | Zero imports (the immersive rotation view was already removed) | Browser scrolling + `data-course-landscape-scroll` CSS |
| `src/components/data/products.ts` | 2,298 | Zero imports. Diff proved it an older subset of `src/data/products.ts` (missing `E-book`/`Live` categories, `images`, `filterIds`, `status`, …) | `src/data/products.ts` |
| `src/subscription/types.ts` | 188 | Zero imports. `BillingCycle` is re-declared live in `subscriptionCatalog`; `PromoState` unused | `src/subscription/utils/subscriptionCatalog.ts` |
| `src/utils/courseContent.ts` | 1,069 | Self-declared legacy shim; `sanitizeUrlOnlyCourseContent` unused | `utils/productMapping.js` |
| `src/revision/engine/aiBankService.ts` | 2,770 | `addAiQuestionsToBank` / `AddAiQuestionsInput` unused anywhere | `aiGenerate.ts` / `aiUsage.ts` engine path |

Test + comment surgery (all verified, suite green — see below):

- `adminCurriculumBuilderContract`: dropped the `editor` read and the
  "self-contained component" test; kept the `doesNotMatch` guards on the AI
  Configuration page; reworded the stale "both have moved" comment.
- `flowpathControlContract`: dropped the 2 reads and the whole
  "Client: ActivityEditor + BulkRevisionCreator" section (5 tests).
  `flowpathLectureContract`: reworded a comment naming the deleted editor.
- `liquidGlassWaveFiveContract`: dropped the `ActivityEditor`/`BulkRevisionCreator`
  blocks from the "remaining selects" test (`AiConfigForm` + `SearchPage` still pin it).
- `liquidGlassWaveOneContract`: removed the `ui/MacWindowModal` alternative from the
  admin-import allowlist regex.
- `subscriptionGateLogicContract`: dropped the dead-hook reads and 3 tests
  (the `useFeatureVisibility` impl test, the `useUsageThisMonth` impl test, and the
  legacy gate-default test that pinned the deleted hook's return line — the last
  one was caught by a post-edit failure, proving the suite guards the surgery).
  The live context API stays covered by `subscriptionVisibilityMatrixContract`.
- `coursePlayerDownloadRotationChromeContract`: replaced the hook-implementation
  test with a deletion-guard test (`!existsSync(useRotatedScroll.ts)`); kept the
  "immersive view is removed" test. `coursePlayerWhiteThemeVerticalLandscapeContract`:
  dropped the hook read + 1 test.
- `scripts/glass-coverage.mjs`, `src/glass.css` (2 comments), `utils/productMapping.js`
  (2 comments): reworded comments that named deleted files.
- `src/index.css`: deleted the dead `.course-rotated-surface` block (comment + 2
  rules, zero TSX/TS references). The PortraitOnlyGuard "rotate your phone" CSS is
  a different, live feature — kept.

`/admin/curriculum` render check: route wiring confirmed
(`AdminApp.tsx:42` → `<CurriculumBuilderPage/>`, which renders
`<RevisionCurriculumSection/>` at line 1392); the route contract test passes
11/11; the dev server transforms `CurriculumBuilderPage.tsx` HTTP 200, proving
the page's full import graph resolves post-deletion.

Result (Parts 1+2): `dist/index.html` **4,195.60 kB raw / 1,156.69 kB gzip**,
suite **2174/2174** (net −10: 11 obsolete tests removed, 1 deletion guard added),
tsc: same 6 pre-existing errors, zero new. Part 2 moves the bundle by only
−1.64 kB raw — expected, since dead files were never bundled; the delta is the
CSS/comment cleanup.

## Part 3 — vite-plugin-singlefile investigation (docs only, NOT implemented)

### Why singlefile is there

`git log` / `git blame` give no signal — history is squash-merged into one
commit. The stated reason lives in `capacitor.config.ts`: singlefile produces
one HTML file with the JS inlined, and Capacitor wraps that output in a native
Android shell (TWA/WebView). No test pins singlefile itself, but two scripts
assume its output shape and would need updates under multi-chunk:
`scripts/verify-backdrop.mjs` (expects a `<style>` block *in* `dist/index.html`)
and the `oklchInDist` gate in `scripts/glass-coverage.mjs` (greps `dist/index.html`
for `oklch(` — under splitting, CSS lives in `dist/assets/*.css`).

Current state: **zero `React.lazy` / dynamic `import()` in `src/`** — the app has
no code-splitting seams at all; every route is statically reachable from `main.tsx`
(the hash router in `App.tsx`/`main.tsx` imports all pages up front).

### Is multi-chunk viable under Capacitor?

Yes. Capacitor serves `webDir` over a local HTTP origin (`capacitor://localhost`
/ `http://localhost`), so dynamic `import()` chunk fetches work exactly like
online; every chunk a normal Vite build emits ships inside `webDir` automatically.
Code-splitting is the standard recommended perf lever for Capacitor apps, with
30–50% load-time gains reported for single-giant-bundle starting points [4](https://nextnative.dev/blog/improve-mobile-app-performance).
Caveats to handle in the plan, not blockers: the service worker precache
manifest must enumerate the chunks (`sw.js` — check current precache list
before splitting), and the two scripts above must be repointed at `dist/assets/`.

### Feature ranking (source modules — what a split would carve)

| Feature dir | .ts/.tsx files | Source size | Notes for splitting |
|---|---|---|---|
| `src/revision` | 40 | 620 KB | Largest feature; AI engine + bank + sessions |
| `src/subscription` | 21 | 240 KB | Plans/paywalls; mostly one flow |
| `src/admin` | 20 | 376 KB | Entirely separate audience (admins) — cleanest cut |
| `src/course` | 19 | 420 KB | Player + viewer; heavy per-file |
| `src/classroom3d` | 15 | 168 KB | Small src, but pulls `three` + `@react-three/*` vendor |
| `src/flowpath` | 12 | 116 KB | Small; shares client with FlowPathView |
| `src/components` (shared) | 126 | 1,376 KB | Stays in the shell chunk; per-page lazy is the lever, not this dir |

Vendor weight (all in the single chunk today): `three`, `@react-three/fiber`,
`@react-three/drei`, `framer-motion`, `firebase`, `@xyflow/react`, `matter-js`,
`react-day-picker`. `three` (via classroom3d) is the obvious first vendor split.

### Proposed route-based plan (requires approval — DO NOT implement yet)

1. **Phase 0 — seams, no output change.** Introduce `React.lazy` + `Suspense`
   boundaries at the hash-router level (`main.tsx`/`App.tsx`) per top-level
   route (store, course player, revision, my-day, classroom3d, admin, …) with a
   minimal shell fallback. Build output stays single-file; this only proves the
   boundaries suspend/resume correctly.
2. **Phase 1 — admin + classroom3d first.** Remove `viteSingleFile()`, add
   `manualChunks`: `admin` (zero student impact, cleanest cut) and
   `vendor-three` (classroom3d only). Update `sw.js` precache, `verify-backdrop.mjs`,
   and the oklch gate to the multi-file layout. Measure cold start on a mid-tier
   Android device via Capacitor before/after.
3. **Phase 2 — revision / course / flowpath.** Split the next-heaviest route
   subtrees once Phase 1 numbers justify it. Keep `firebase`, `framer-motion`,
   and `react-dom` in the shell chunk (used on first paint nearly everywhere).
4. **Gate for each phase:** suite green, tsc unchanged, Capacitor `cap sync` +
   on-device smoke (chunks load from `capacitor://localhost`, offline mode works),
   and a recorded before/after of time-to-interactive — not just bytes.

## Verification log

- `npx tsc --noEmit`: 6 pre-existing errors before and after (listed in each
  commit message), zero new.
- Full suite: 2184/2184 (Part 14) → 2174/2174 twice consecutively (one transient
  single-test flake observed on an intermediate run; two clean runs after).
- `npm run build`: 5,110.09/1,357.39 → 4,197.24/1,156.92 (Part 1) →
  4,195.60/1,156.69 kB raw/gzip (Parts 1+2); 3,371 modules; `dist/` 78 MB → 21 MB.
