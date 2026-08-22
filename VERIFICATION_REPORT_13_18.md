# Verification Report — Checklists 13 → 18

**Date:** 2026-08-22 · **Branch:** `arena/01a02aac-digitalcatalyst` (commit `b39e5ab`)
**Verdict:** All 6 checklists are **present, wired, and active** in the code. Build, API TypeScript, and 1144/1146 tests pass.

---

## TL;DR — why "page pe kuch nahi dikha" is almost certainly a DEPLOYMENT issue, not code

I verified every item end-to-end (code present → route reachable → component rendered → not gated/hidden → backend enforced → build/test green). The code is correct and active. The features depend on **runtime infrastructure** that lives outside this repo:

| Likely cause of "blank page" | Where it lives | Action |
|---|---|---|
| **Firestore rules not deployed** to project `my-website-761e9` | `firestore.rules` (correct in repo) | `firebase deploy --only firestore:rules` (checklist 17.4 — explicitly a separate deploy step) |
| **Branch not deployed** to Vercel | Vercel project settings | Point production/preview at the merged commit; the live site may be stale |
| **Catalog data not seeded** in Firestore | `subscriptionPlans`, `subscriptionFeatures/my-day`, revision catalog | Pages fall back to built-in defaults, but admin-configured values need the docs to exist |
| **Looking at an auth-gated page while signed out** | `appRoutes.ts` | Admin pages need admin login; My Day / Subscription need a signed-in user |

The app **boots locally** (HTTP 200, boot splash renders) and a live preview is running.

---

## Bugs found & fixed this session (commit `b39e5ab`)

Both were genuine defects in the **Revision AI / curriculum-planning path** (checklist 13):

1. **`src/revision/engine/aiConfig.ts`** — imported `type CurriculumClass` from `./curriculumCatalog`, but that module never exports it (it's defined in `../data/curriculum`). Now imports from the correct module. (`tsc` error `TS2724`.)
2. **`src/revision/engine/curriculumCatalog.ts`** — `fillCurriculumPrompt` used `String.replaceAll`, which is ES2021 and violates the project's `ES2020` tsconfig `lib`. Replaced with `split/join` (also avoids replacement-string special-char issues). (`tsc` error `TS2550`.)

Result: main `tsc` errors **20 → 18** (remaining 18 are all pre-existing & outside checklists 13-18).

---

## Per-item report (found / issue / fixed / pending)

Legend: ✅ found+active · 🔧 fixed · ⏳ pending (ops/non-code)

### 13. Dynamic AI provider/model configuration
- ✅ Gemini/OpenAI/Anthropic/OpenRouter/Groq/custom — `aiConfig.ts` `AI_PROVIDERS` + `AiConfigForm`
- ✅ Publish current provider/model — `RevisionPage.tsx` `publishDefault`
- ✅ Custom OpenAI-compatible base URL — `custom` provider + `baseUrl`
- ✅ Model IDs updated from Admin (no source edit) — model dropdown, persisted to catalog
- ✅ Input/output token prices configurable — `modelPricing` rows (`inputUsdPerMillion`/`outputUsdPerMillion`)
- ✅ USD per 1M tokens format — "Input / 1M", "Output / 1M" placeholders
- ✅ No redeploy needed on model change — catalog-driven
- ✅ Hybrid requires published pricing — enforced in `publishDefault` (`allowancePolicy==='hybrid' && !pricing…`)
- ✅ No fake "ready" without shared key — `isSchoolAiAvailable` requires `sharedApiKey`+`model`
- ✅ No-key publish warning/confirmation — confirm dialog + live preview banner
- 🔧 Above 2 type defects fixed

### 14. My Day non-subscriber daily-free policy
- ✅ All 16 items active in `MyDayApp.tsx` + `useMyDayAccess.ts` + `api/_lib/myDay.ts`
- ✅ Browse for everyone; server-resolved free allowance; default 1/day; admin `0` = browse-only
- ✅ Applies to task/schedule/note/reminder; counts NEW item ids only (delete ≠ refund)
- ✅ Daily reset, timezone-locked (no hopping), browse-only after use, subscriber unlimited
- ✅ Free used/remaining/reset shown; feature-off preserves old behavior

### 15. My Day backend/security
- ✅ Server `runTransaction` (not client localStorage); client cannot direct-write (rules)
- ✅ Owner read-only / server-write-only; existing data preserved; cloud refresh works
- ✅ Timezone preserved for push; expiry-time refresh (`useMyDayAccess` deadline timer)

### 16. Admin + subscription-page integration
- ✅ Saved-test limits, AI daily-gen limits, AI cost budgets — `SubscriptionsPage.tsx` plan editor
- ✅ Monthly/yearly side-by-side independently editable
- ✅ My Day `freeItemsPerDay` field — feature editor (shown for `my-day`)
- ✅ Revision page hybrid/generation-only switch + dynamic model-pricing rows
- ✅ Consumer `PlanOverview.tsx` shows **Test Bank capacity** (l.168), **School AI tests/day** (l.179), **model-cost budget/term** (l.180)
- ✅ Backend resolver uses same normalized values (`api/_lib/subscriptions.ts` → shared `utils/subscriptions.js`)

### 17. Firestore / API / deployment constraints
- ✅ Revision + My Day APIs route through the **shared** `referral-leaderboard.ts` function (Hobby 12-fn cap respected — `vercel.json` rewrites are by design)
- ✅ AI usage server-only (`aiUsage: … if false`), My Day usage server-only, revision counters transactional
- ✅ Stable JSON + actionable codes (`MYDAY_DAILY_FREE_USED`, `MYDAY_TOO_LARGE`, `no_proxy`, etc.); no secrets committed
- ⏳ **Firestore rules deploy** — correct in repo, but `firebase` CLI not in this sandbox; run `firebase deploy --only firestore:rules`

### 18. Existing functionality intact
- ✅ `pnpm build` passes; API `tsc` passes; app boots (HTTP 200)
- ✅ 1144/1146 tests pass; all **364** feature-specific tests (My Day / Revision / Subscription / entitlements) pass
- ⏳ 2 pre-existing test failures (`authLaunchSplashRoutingContract` #42, `coursePlayerUx` #431) — assert a **literal** `src="/icons/icon-192x192.svg"` in source, but the boot-splash & course-player logo now use `src={logoUrl}` from `useBranding()` so the admin **can customize the logo**. Satisfying them by hardcoding would break branding. **Pre-existing, unrelated to checklists 13-18, by design.**
- ⏳ 18 pre-existing `tsc` nits in files outside 13-18 (`firebase.ts`, `PdpApp.tsx`, `CheckoutContext.tsx`, dead orphan `utils/productImages.ts`+`utils/productSearch.ts`, etc.) — don't affect the `vite build` that deploys.
