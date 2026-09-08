# Personal Course Modules ("My Modules") — Implementation Report

Server-authoritative learner-owned study content inside the Course Player, for
eligible subscription plans, configured per plan + per billing duration from
the admin's Subscriptions editor.

---

## What was implemented

### 1. Shared pure layer — `utils/personalCourse.js` (+ `.d.ts`)
One dependency-free module (Node-testable) that is the single source of truth for:

- **The 12 resource types** — values exactly mirror `CourseFileType`
  (`youtube, video, audio, pdf, doc, sheet, slides, ebook, image,
  google_form, embed, mindmap`) with labels + registry.
- **Per-plan / per-duration configuration + defaults** — `personalModules`
  block per plan: `enabled`, `customEmbedEnabled`, `contentStorageEnabled`
  and `monthly`/`yearly` slices of `moduleLimit`, `resourceLimit`,
  `perModuleResourceLimit`, `allowedTypes` (empty = all 12, `−1` = unlimited).
  Defaults: paid plans → enabled 5 modules / 50 resources / 20 per module, all
  types; free plans → disabled. **Prices are never part of this config** and
  never derived from each other; legacy flat aliases
  (`personalModulesEnabled`, `personalModuleLimit`, …) normalize onto the
  structured shape so existing plan docs migrate safely without a manual pass.
- **Entitlement resolution** from the *actual* subscription record
  (`users/{uid}/subscription/current`, same path every other surface reads) +
  the live plan doc — never from prices or client state.
- **Central URL normalization/validation** used by BOTH the forms and the
  server (a crafted request body cannot bypass it): https-only, no
  credentials/control chars, no private/local hosts for embeds; YouTube →
  `watch?v=` canonical (bare 11-char ids accepted), Google family kind
  matching, Forms → `/viewform?…&embedded=true`, Whimsical → `/embed/{id}`,
  direct-file extension or Drive rules; output shaped into the existing
  `CourseFile` vocabulary so the renderer needs zero changes.
- Structure caps, honest **AI-context availability** per type, provenance
  labels, limit-state helpers + plan-naming limit messages.

### 2. Server-authoritative API — `api/_lib/personalCourse.ts`
Dispatched from the existing multiplexer (`/api/personal-course` rewrite →
`api/referral-leaderboard.ts`) to stay inside the Hobby 12-function cap.

- uid comes ONLY from the verified Firebase ID token; a client `ownerUid` is
  never read.
- **Entitlement + limits re-derived inside Firestore transactions on every
  create** from the live subscription record + plan doc (`subscriptionPlans`).
- Module / total-resource / per-module limits enforced transactionally against
  server-maintained `users/{uid}/personalCourseUsage/{productId}` counters;
  600 ms server-side gap between create/delete mutations (429 otherwise).
- Resource types additionally gated on the live plan's `allowedTypes` +
  `customEmbedEnabled`; server errors carry limit messages that name the plan.
- Full CRUD + transactional reorder (only differing `sortOrder`s rewritten)
  for modules and resources; module delete batches resources and decrements
  usage; owner read checks on every mutation; list/status reads are
  owner-filtered and capped.
- Writes go ONLY to `users/{uid}/personalCourseModules/**` + usage docs —
  official course documents are unreachable by construction.

### 3. Firestore rules — `firestore.rules`
`users/{uid}/personalCourseModules/{moduleId}` (+ nested `resources`) and
`personalCourseUsage/{productId}`: **owner/admin read-only for clients,
client writes denied** (`allow create, update, delete: if false;`) — the Admin
SDK performs every write, so a browser can never grant itself the feature,
inflate limits, or read another learner's content. Downgrades are safe:
existing content stays readable by the owner forever.

### 4. Course Player surface
- **Modules tab** gains a native dock-style **"My Modules"** row under the
  official curriculum (same 44 px plate / scroll-snap row system, violet
  accent, live subtitle: usage vs plan, or a locked hint).
- Tapping it swaps the study pane in place (same ownership pattern as the
  Mind Map / Player panels — no new dock tab, no header, no sheet).
- **`PersonalModulesPanel`** (`src/course/PersonalModulesPanel.tsx`):
  - Locked / disabled states with plan-aware copy + **View subscription plans**
    CTA (`#/subscription`).
  - Usage summary naming the plan + used/limit counts; add-module / expandable
    module lists; per-resource open, edit, delete, reorder; module rename,
    delete (with the player's portal `CourseConfirmDialog` confirmations) and
    reorder; honest limit notices (module / total / per-module) instead of
    disabled buttons with no explanation.
  - Compose screens (module/resource create+edit) preflighted through the same
    pure layer, plan-gated type chips for all 12 types with per-type URL hints,
    and server messages shown verbatim on rejection. A resource whose type left
    the plan stays readable and editable (dashed legacy chip + note).
  - Plain tap-list interaction (no release-fire) because rows carry real
    per-row controls.
- **Opening a personal resource** maps it into the official `CourseFile`
  shape with provenance fields (`source: "personal"`, `ownerUid`,
  `personalModuleId`, `personalResourceId`) and opens it in the **existing
  ResourceViewer** — same YouTube/PDF/Docs/Forms/Whimsical/embed sandboxes,
  same permissions, no second viewer.
- **Official progress is never polluted**: `selectFile`/`toggleComplete` skip
  personal files (no `lastOpenedFileId`, no completion ids); the Player panel
  hides Mark-complete for personal content and shows a
  "Personal module content — not counted in official course progress" note +
  a "My Modules" provenance badge on the active file.
- Per-resource downloads/opens keep working through the existing action model
  (they are the learner's own files).

### 5. Admin per-plan editor — `SubscriptionsPage` + `admin/client`
New "Personal Course Modules (My Modules)" card in the plan editor: enable /
custom-embeds / storage toggles, per-duration module/resource/per-module
limits (−1 = unlimited), and an "All 12 types" chip matrix — monthly and
yearly independently. Persisted as the canonical `personalModules` block
(null-safe — Firestore rejects null `allowedTypes`), prices untouched; plan
cards show a My Modules summary line.

### 6. Analytics (lightweight)
`src/utils/featureAnalytics.ts` — lazy, optional `firebase/analytics`
(measurementId is configured but no SDK was wired anywhere in the app; helper
is a no-op until a supported build appears, never blocks/throws). Events:
`module_created/updated/deleted`, `resource_added/updated/deleted/opened`,
`upgrade_clicked`.

### 7. Tests
- `tests/personalCourseContract.test.mjs` — **29 pure-layer contract tests**
  (types registry, plan defaults & free/paid determination incl. price-less
  plans, legacy aliases, entitlement states incl. expiry/disabled, usage
  limits & messaging, per-type URL canonicalization incl. bare YouTube ids,
  sanitizers, AI-availability honesty, provenance labels).
- `tests/personalCourseUiContract.test.mjs` — **10 source contracts** for the
  overlay entry + panel host, progress isolation, Player-panel provenance
  hooks, viewer reuse mapper, server-only client, admin editor data hooks,
  rules posture, and analytics.

### Verification
- Full suite: **2216 tests — 2212 pass, 4 fail (the same four pre-existing
  failing files as baseline; untouched)**.
- `tsc` (web + api configs): zero errors in any new/changed file (only the
  pre-existing 8 remain); `pnpm build` succeeds.

---

## Deferred / intentionally out of scope, and why

| Item | Status | Why |
|---|---|---|
| AI-context reads of personal content (transcripts, PDF text) | Pure-layer honest answers exist (`personalAiAvailability` — all types report readable:false today + reason); no read pipeline wired | No transcript/PDF-read pipeline exists in the app yet; a screenshot-based assist path can later decide through the existing permission model. The player's AI tab is a placeholder today. |
| Live multi-device sync of the module list | Refetch on panel open + after every mutation | Server-authoritative CRUD + freshness on open is the established pattern in this codebase (revision/my-day); a realtime sub is not needed for a study list and would double Firestore read costs against personal usage docs. |
| Drag-and-drop reordering (touch long-press) | Up/down controls instead | Spec allowed desktop drag optional; touch-safe buttons ship first, panel stays a plain tap list by design. |
| Demo/seed content for "My Modules" | Not included | Personal content is per-authenticated-user and server-written by design; a fake "demo" inside a real learner's namespace would violate the owner-only rules posture. Empty states + create flow are first-class instead. |
| Feature paywall via the older feature-catalog (`subscriptionFeatures`) engine | Feature is plan-configured directly (`personalModules` per plan) | The catalog engine charges per add-on feature; this requirement is a plan-level entitlement (per plan + per duration), so it deliberately lives beside `aiAllowances`/`revisionTestBankLimits` rather than duplicating a second subscription engine. |
| Notes/mindmap surfaces for personal files | Not attached | Notes and mind maps are scoped to official modules/files; personal files carry provenance fields so any future surface can include/exclude them explicitly, and currently they simply don't join official module maps/progress (excluded, per spec). |

## Files

New: `utils/personalCourse.js(.d.ts)`, `api/_lib/personalCourse.ts`,
`src/types/personalCourse.ts`, `src/lib/personalCourseClient.ts`,
`src/hooks/usePersonalModules.ts`, `src/course/PersonalModulesPanel.tsx`,
`src/utils/featureAnalytics.ts`,
`tests/personalCourseContract.test.mjs`,
`tests/personalCourseUiContract.test.mjs`.

Edited: `src/types/course.ts` (provenance fields), `firestore.rules`,
`api/referral-leaderboard.ts`, `vercel.json`,
`src/CoursePlayerApp.tsx`, `src/course/CourseOverlay.tsx`,
`src/course/PlayerPanel.tsx`,
`src/admin/pages/SubscriptionsPage.tsx`, `src/lib/admin/client.ts`.
