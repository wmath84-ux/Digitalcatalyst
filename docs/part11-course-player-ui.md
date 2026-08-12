# Part 11 — Course Player UI / Functionality

## Scope

Per the Part 11 spec, the work focused on the **main Course
Player content (the embed viewer + UX)**, as clarified by the
user during scoping:

> "Don't implement badges, coin or AI only focus on main
> coursplayer content that is embed should work perfectly and
> give better user experience"

The implementation covers all the Part 11 sub-sections that
touch the embed + progress + notes surfaces and the access
state that the resolver feeds into the UI.

The Part 10 `resolveCourseAccess` engine + `useCourseAccess`
hook + `CourseRouteGuard` are preserved unchanged.

## New files

| File | Purpose |
| --- | --- |
| `src/course/NotesPanel.tsx` | Add / edit / delete + multi-device sync via Firestore. |
| `tests/coursePlayerUx.test.mjs` | 35 source-level contract tests for the Course Player UI. |
| `tests/coursePlayerUxRuntime.test.mjs` | 8 runtime sanity tests (Firestore writes, types, data-attrs). |

## Modified files

| File | Change |
| --- | --- |
| `src/CoursePlayerApp.tsx` | Wires the new `NotesPanel`; per-file delete/edit handlers; persists `accessSource`; resumes `lastOpenedFileId`; routes per-module "Buy this module" CTAs to the parent's `onPurchaseUpdate`; preview badge; preview-aware progress denominator. |
| `src/course/CourseSidebar.tsx` | Consumes the resolver's `accessibleModuleIds` / `previewModuleIds` / `moduleAccessSources` / `unmetDependencies`; renders per-module "Buy this module" CTA; surfaces dependency hint inline; preview icon; embedded + mindmap icon; per-row `data-*` hooks. |
| `src/course/ResourceViewer.tsx` | Loading indicator; failure panel + retry button; type-specific native renderers (video / audio / image); iframe sandbox + permissions; open-in-new-tab escape hatch; data-attribute hooks for every embed kind. |
| `src/course/ImageViewer.tsx` | Explicit "Fit to screen" button; friendly image-failure fallback; reset/URL-switch state; 6 documented controls (pinch, wheel, ±, drag, reset, download). |
| `src/types/course.ts` | New `CoursePlayerNote` type with `id / text / createdAt / updatedAt / moduleId / resourceId`. |

## Part 11 sub-section coverage

### ACCESS/UI

* **Full-course access** — sidebar modules open via `accessibleModuleIds.has(moduleId)`.
* **Partial module access** — locked modules remain visible but show the lock icon and a "Buy this module" CTA.
* **Resource-only access** — resources surface the same lock/unlock state through the resolver.
* **Update access** — paid-update modules show the lock when the update is not owned; "Buy this update" CTA in the header card + per-module "Unlock with this update" pill.
* **Subscription access** — `hasActiveSubscription` keeps the "Active subscription" badge (Part 10) and the resolver still drives the lock state.
* **Preview access** — `previewModuleIds` set surfaces a "Preview mode" badge in the header and a sky-blue eye icon next to the module name; preview files do not count toward the progress denominator.
* **Locked module state** — every locked module shows a lock icon and amber-tinted background.
* **Purchase locked module CTA** — `data-course-sidebar-buy-module` button on locked paid-update modules; the click routes through `handleBuyModule` to the parent's `onPurchaseUpdate`.
* **Purchase update CTA** — `data-course-sidebar-buy-update` button on the available-updates card; the click routes through the same `onPurchaseUpdate`.
* **Dependency state** — `unmetDependencies` drives an inline "Requires: …" hint on every module whose required previous module is not in `accessibleModuleIds`.

### RESOURCE VIEWER

Every Part 11 type is wired:

| Type | Implementation |
| --- | --- |
| YouTube no-cookie | `youtube-nocookie.com/embed/<id>` via `getCourseEmbed`. |
| Direct video | native `<video src={...} controls playsInline preload="metadata">`. |
| Direct audio | native `<audio src={...} controls preload="metadata">` inside a violet gradient card. |
| Drive | `drive.google.com/file/d/<id>/preview` iframe. |
| Cloudinary / direct image | `<ImageViewer>` with pinch + wheel + buttons + drag + reset + download. |
| PDF | drive preview OR `getCourseEmbed` direct iframe. |
| Google Doc | `/document/d/<id>/preview` + `export?format=pdf` download. |
| Google Sheet | `/spreadsheets/d/<id>/preview` + `export?format=xlsx` download. |
| Google Slides | `/presentation/d/<id>/embed`. |
| Google Form | `/forms/.../viewform?embedded=true`. |
| Whimsical | `whimsical.com/embed/<id>`. |
| Generic HTTPS embed | sandboxed iframe with `allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-same-origin allow-presentation` + `allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-read; clipboard-write"`. |

Image viewer controls: pinch (pointer-distance scaling), wheel, +/− buttons, drag (pan when zoomed in), reset, download (CORS-aware), plus the new "Fit to screen" button.

### PROGRESS AND NOTES

* **Last opened file** — persisted on `users/{uid}/courseProgress/{productId}.lastOpenedFileId`; the Course Player restores it on next mount when the resolver still considers the file's parent module accessible.
* **Completed files** — `completedFileIds: arrayUnion(selectedFile.id)` on every mark-complete click.
* **Completed modules** — derived from `completedFileIds` ∩ files-in-module.
* **Percentage** — `totalEligibleFiles` excludes locked modules; the progress bar + label are bound to it.
* **Access source** — written on every mark-complete as `full_product | module_purchase | subscription | locked`.
* **Preview state** — surfaced as the "Preview mode" badge; preview files do not count toward progress.
* **Notes — Add** — textarea + Save button (notes are auto-tagged with `moduleId` + `resourceId`).
* **Notes — Edit** — inline pencil icon → textarea → "Save changes" / "Cancel".
* **Notes — Delete** — trash icon → confirm step → delete.
* **Multi-device sync** — every write goes through `setDoc` on the progress doc; the `onSnapshot` listener in the Course Player propagates every change to every device.

### AI

The AI tab remains wired to the Community AI route
(`#/ai-chat`) via `sessionStorage` keys (`aiInitialPrompt`,
`aiCourseContext`). The user explicitly asked to skip the AI
work in this part, so the existing wiring is preserved but no
new "Return to Course Player" CTA was added on the AI page.

## TypeScript

`npx tsc --noEmit` — only the same pre-existing `utils/*` errors
that were present before Part 11 (`contentAutomator`,
`productImages`, `productPrice`, `productSearch`,
`reviewStableMode`, `subscriptionAccess`, `webPush`). **No new
errors.**

`npx tsc --noEmit -p tsconfig.api.json` — only the pre-existing
`api/push/send.ts` web-push error. **No new errors.**

`npm run build` — `vite build` succeeds, 2962 modules,
`dist/index.html` ≈ 2,681 kB (713.99 kB gzipped).

## Tests

| File | Tests |
| --- | --- |
| `tests/coursePlayerUx.test.mjs` | 35 (new) |
| `tests/coursePlayerUxRuntime.test.mjs` | 8 (new) |
| `tests/courseAccess.test.mjs` | 25 (Part 10) |
| `tests/courseAccessServerContract.test.mjs` | 17 (Part 10) |
| All other passing files | 451 |

**Total: 536 tests pass across 25 test files, 0 failures
introduced by Part 11.** The 47 pre-existing failures in
`tests/{admin,auth,community,courseDriveZoom,…}*.test.mjs`
are out of scope (they reference legacy `App.tsx` /
`components/PaymentModal.tsx` / `components/EduvoraCommunity.tsx`
paths that were removed in earlier refactors and are unrelated
to Part 11).

## What is NOT in this part

* No new coin / EduCoin logic.
* No new "Return to Course Player" CTA on the Community AI
  page (the user asked to skip AI work).
* No PDP / Admin / Subscription work — out of scope per
  "Stop after Part 11".
