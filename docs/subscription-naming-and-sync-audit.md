# Subscription + AI: naming, error copy, and admin→server→frontend sync audit

Owner request (summary):

1. Names are wrong in many places — "Revision Studio" is written where it should
   say **Lumen AI** (subscription).
2. The AI error copy is not understandable: a learner with **no subscription at
   all** is told "**AI access limit reached**", so they think they crossed a
   limit they never had. It must say plainly that AI needs a subscription.
3. The subscription page copy must be rewritten in the same clear language.
4. On the subscription page, switching **Monthly / Yearly** must update the table
   and the lists accordingly.
5. Every subscription customisation set in the admin panel must actually reach
   the server verification and the frontend — verify function by function,
   nothing may be left unsynced.

Status legend: **DONE** · **TODO** · **DECISION NEEDED** · **BLOCKED (naming)**

---

## 1. Naming inventory — where the wrong name lives

All sites below are user-facing unless marked `(comment)`.

| # | File:line | Current text | Status |
|---|---|---|---|
| 1 | `api/_lib/subscriptions.ts:144` | seeds `subscriptionFeatures/revision` as name **"Revision Studio"** (admin catalog source of truth) | DECISION NEEDED |
| 2 | `src/subscription/data/fallbackCatalog.ts:88` | feature name **"Revision Studio"** in the offline fallback catalog | DECISION NEEDED |
| 3 | `src/components/checkout/CheckoutReviewStep.tsx:461` | line-item label `revision: "Revision Studio"` | DECISION NEEDED |
| 4 | `src/components/subscription/PremiumGate.tsx:220, 315, 316, 436` | marketing copy + `aria-label` "Revision Studio subscription" | DECISION NEEDED |
| 5 | `src/subscription/components/PlanOverview.tsx:224-225` | "With Revision Studio: save up to N tests…" | DECISION NEEDED |
| 6 | `src/revision/RevisionApp.tsx:392` | "…active Revision Studio access chahiye" (Test Bank paywall) | DECISION NEEDED |
| 7 | `src/revision/pages/RevisionProfilePage.tsx:33` | profile card eyebrow "Revision Studio" | DECISION NEEDED |
| 8 | `src/revision/engine/aiUsage.ts:214` | "An active Revision Studio subscription is required for new AI tests." | DECISION NEEDED |
| 9 | `api/_lib/revisionGenerate.ts:738, 834, 1389` | same sentence from the server (403 `REVISION_SUBSCRIPTION_REQUIRED`) | DECISION NEEDED |
| 10 | `api/_lib/revisionData.ts:364` | "Creating a new Revision test requires an active **Revision Studio** subscription." | DECISION NEEDED |
| 11 | `api/_lib/flowpathAccess.ts:94, 111` | two more "Revision Studio" errors | DECISION NEEDED |
| 12 | `utils/subscriptionAccess.ts:221-228` | lock copy says **"Eduvora Plus+"** — a plan name that need not exist (plans are admin-defined) and the whole file is imported by **nothing** (dead code) | DECISION NEEDED |
| 13 | `src/lumen/components/MessageList.tsx:141`, `LumenErrorBoundary.tsx:49, 63` | the course-player assistant calls itself **"AI Mentor"** | DECISION NEEDED |
| 14 | `src/lumen/components/MessageList.tsx` label row | the same assistant is labelled **"Lumen"** inside the chat | DECISION NEEDED |
| 15 | `api/_lib/personalAi.ts` (old copy) | "AI **study engine** on your modules" — engineering jargon in a learner-facing message | FIXED (this change) |

**Decision needed:** one name per surface. Recommended reading of the owner's
instruction is *"Revision Studio" → "Lumen AI"* everywhere the **AI product** is
sold, while the Revision *test* area keeps a plain "Revision" label. Until that
is confirmed the rename is not started, because it touches the seeded catalog
doc (`subscriptionFeatures/revision.name`), 6 templates/tests and 9 API strings,
and the `revision` **feature id must stay** (it is the entitlement key written
into every paid membership).

---

## 2. AI error copy — "AI access limit reached" (DONE)

| # | Item | Status |
|---|---|---|
| 2.1 | The player titled **both** a plan problem and a used-up allowance "AI access limit reached" (`MessageList.tsx`) | DONE — headings split: **"AI needs an active subscription"** vs **"AI limit reached for now"** |
| 2.2 | Server sent one generic sentence for every blocked learner (`personalAi.ts:822`) | DONE — `describeAiSubscriptionBlock()` now distinguishes: no membership yet / cancelled / **ended on `<date>`** / AI not included in `<plan>` |
| 2.3 | `personalAi.context` showed the same vague `blockedReason` to module AI screens | DONE — same resolver, so the paywall copy matches |
| 2.4 | Client mapper (`utils/personalAi.js`) fallback said "An active subscription is required for the AI **study engine**" | DONE — plain wording, still `kind: "entitlement"`, `upgrade: true` |
| 2.5 | The error card was a **dead end**: `retryable: false` → no Retry button, and no way to act | DONE — "View subscription plans" CTA in the chat card, wired through `CoursePlayerApp` → `#/subscription` |
| 2.6 | Regression test for the copy split | DONE — `tests/aiGateCopyClarityContract.test.mjs` |
| 2.7 | Copy still says "AI Mentor"/"Lumen" mixed | BLOCKED (naming) — item 1.13 |

Error codes were deliberately **not** renamed (`REVISION_SUBSCRIPTION_REQUIRED`,
`AI_MENTOR_PLAN_REQUIRED`): they are the contract the client mapper, the tests
and any stored telemetry rely on. Only the human sentence changed.

---

## 3. Subscription page: Monthly ↔ Yearly switch does not update the table/lists

Root cause found (three separate mechanisms, all in the read path):

| # | Finding | Evidence | Status |
|---|---|---|---|
| 3.1 | The catalog API **strips** the admin's per-cycle fields before the page ever sees them: `normaliseFeatureDoc()` drops `visibleCycles`, `hiddenPlanIds`, `userLimit`, `subscriberPricingOverride`, `visibilityMode` | `utils/subscriptions.js:98-133` vs what the admin writes (`src/lib/admin/client.ts:289-335`) | TODO |
| 3.2 | Same for plans: `normalisePlanDoc()` drops `visibleCycles`, `subscriberPricingOverride`, `personalModules`, `studyPacks`, `accessTier`, `featured`, `cta` | `utils/subscriptions.js:63-93` vs `src/lib/admin/client.ts:242-274` | TODO |
| 3.3 | The client type therefore has no such fields, so `PlanComparisonTable`, `FeaturePricingTiers` and `FeatureSelectModal` list **the same features for both cycles** — exactly the reported "table/list update nahi hoti" | `src/subscription/utils/subscriptionCatalog.ts:59-105` | TODO |
| 3.4 | The `settings/subscriptionGate` matrix (`features[key].durations`, `.tiers`, `hideFromNonSubscribers`, `planVisibility[key].durations`) is read on the client for **plans only** (`isPlanVisibleForAudience`, no cycle), so per-cycle/per-tier visibility is invisible on the page | `src/subscription/components/SubscriptionPage.tsx:646-656, 763-781` | TODO |
| 3.5 | Prices *are* cycle-aware once the data arrives (`resolveFeaturePrice(feature, planId, cycle)` on both page and server) — this half is correct | `utils/featurePricing.js:88-133`, `utils/subscriptions.js:339` | verified ✓ |

Fix plan (3.6–3.9):

| # | Fix | Status |
|---|---|---|
| 3.6 | Deliver the admin fields through the catalog: keep `visibleCycles` (normalised, never empty), `hiddenPlanIds`, `userLimit`, `subscriberPricingOverride`, `visibilityMode` in `normaliseFeatureDoc`, and `visibleCycles` + `subscriberPricingOverride` in `normalisePlanDoc`; extend `SubscriptionFeatureDoc` / `SubscriptionPlanDoc` types | TODO |
| 3.7 | Make the page honour them for the selected cycle: hide a feature from a plan when `hiddenPlanIds` contains it, hide it for a cycle when `visibleCycles` excludes that cycle, and treat gate `durations.monthly/yearly` the same way so the row list changes with the toggle | TODO |
| 3.8 | Fix the admin editor ↔ stored shape mismatch for every knob in 3.1/3.2 (admin must display exactly what it writes; a knob that is saved but ignored is worse than no knob) | TODO |
| 3.9 | Add a contract test: for a fixture catalog with per-cycle visibility, the rendered rows/prices differ between `monthly` and `yearly` | TODO |

**Open question for the owner:** the exact symptom (see Q2 in chat) — per-cycle
feature visibility (3.1/3.3) or prices not changing (which 3.5 says works) —
decides whether 3.2 is in scope or 3.5 needs a deeper repro.

---

## 4. Admin customisation → server → frontend, function by function

Every knob the admin panel exposes, where it is written, where it is enforced,
and whether the frontend sees it.

| # | Admin control | Written to | Enforced in | Frontend | Status |
|---|---|---|---|---|---|
| 4.1 | Plan price (monthly/yearly) | `subscriptionPlans.price…` | `buildSubscriptionLineItems` → quote | PlanOverview / table | ✓ OK |
| 4.2 | Plan active / badge / sort / trial / min-payable / allowed cycles | plan doc | `loadActivePlans`, `validateSubscriptionSelection` | page + table | ✓ OK |
| 4.3 | Plan included products / modules | plan doc + `subscriptionPlanProductUnlocks` / `…ModuleUnlocks` | quote + entitlements writer | table "Courses bundled" | ✓ OK |
| 4.4 | Feature price, monthly/yearly base, per-plan `planPricing` (incl. `included`) | feature doc | `resolveFeaturePrice` on **both** sides | page + table + modal | ✓ OK |
| 4.5 | Feature active / badge / sort / `freeItemsPerDay` | feature doc | `loadActiveFeatures`, My Day quota | page | ✓ OK |
| 4.6 | **Subscriber-only override price** | `settings/subscriptionGate.subscriberPricing` (and a duplicate `plan.subscriberPricingOverride`) | **FIXED** — `api/_lib/subscriptions.ts` resolves `resolveSubscriberOnlyPrice` for an already-subscribed buyer right after `buildSubscriptionLineItems` and overwrites the plan line's `regularPrice` / `effectivePrice` (rupees→paise once), so the charge equals the badge the page shows | page shows the discount, server charges it | ✓ OK (turn 4) |
| 4.7 | **AI questions/day cap** (`usageLimits.aiQuestionsPerDay[plan]`, feature `userLimit.aiQuestionsPerDay`) | settings doc + feature doc | **still nobody** — `resolveAiQuestionsPerDay()` has zero callers; the AI engine enforces `aiAllowances.dailyTokenBudget` + `dailyGenerationLimit` (default plans ship 20/day) instead | admin now labels the field **"legacy; not enforced"** and points at the enforced allowances (`data-admin-ai-cap-legacy`, `data-admin-feature-ai-cap-legacy`) | ⚠ honest label only — owner decision needed: enforce it as a second cap, or delete the field |
| 4.8 | **Per-cycle feature visibility** (`feature.visibleCycles`) | feature doc | **FIXED** — normaliser emits it, `isFeatureVisibleForCycle` gates the page rows/prices/total, `subscriptionVisibility.js` shared with the server, and the quote rejects a hidden feature (`SUBSCRIPTION_FEATURE_NOT_OFFERED`) | monthly/yearly rows differ | ✓ OK (turn 4) |
| 4.9 | **Per-plan feature hiding** (`feature.hiddenPlanIds`) | feature doc | **FIXED** — `isFeatureHiddenForPlan` runs first in `featuresForPlanCycle` and on the server before pricing | feature disappears for that plan in every cycle | ✓ OK (turn 4) |
| 4.10 | **Feature visibility mode gate/hide** (`visibilityMode`) | feature doc | read directly from Firestore by `useRevisionAccess.ts` (rail) + `api/_lib/myDay.ts` (snapshot) **and** carried by the catalog normaliser | rail + nav + My Day | ✓ OK (turn 6) |
| 4.11 | Gate matrix: `features[key].gated`, `.tiers`, `.durations`, `.hideFromNonSubscribers` | settings doc | **`durations`** → per-cycle rows + the quote (turn 5). **`gated` / `hideFromNonSubscribers` / global `hideUntilPurchasedEnabled` / `tiers[planId]`** → `isFeatureHiddenForAudience()` (turn 6), read by `useRevisionAccess.ts` (rail) and `api/_lib/myDay.ts` (with the plan-scoped tier) | rail / nav hide for non-subscribers | ✓ OK — deliberately NOT applied to the store rows: hiding a feature from the purchase page would make it unbuyable, which the gate never promised |
| 4.12 | `planVisibility[key].visible / visibleToSubscribers` | settings doc | `isPlanVisibleForAudience` (catalog API + server guard `SUBSCRIPTION_PLAN_HIDDEN_FOR_SUBSCRIBERS`) | page filters the picker | ✓ OK |
| 4.13 | Subscriber pricing in the admin list (`p.subscriberPricingOverride`) | plan doc | **FIXED** — `mergeSubscriberPricing()` + `resolveEffectiveSubscriberPrice()` (shared by page + quote): the plan sheet's own value wins per cycle, the gate matrix is the fallback, an empty box never erases the other surface. The plan form's "₹0 = free" promise was removed because every resolver treats ≤ 0 as "not set" | badge, admin list + quote all agree | ✓ OK (turn 6) |
| 4.14 | Per-plan personal-modules limits (`personalModules.per cycle`) | plan doc | `api/_lib/personalCourse.ts` | personal modules UI | ✓ OK |
| 4.15 | Per-plan Study Packs (`studyPacks.per cycle`) | plan doc | `api/_lib/studyPacks.ts` — reads the raw plan doc and picks the slice from the membership's own cycle (`studyPacksCycle`) | create/import limits enforced per cycle; the UI shows the server's error copy | ✓ OK (verified turn 6) |
| 4.16 | Plan AI allowances (`aiAllowances.monthly/yearly`: tokens, generation count, cost micros) | plan doc → snapshotted onto the membership | `resolveEffectiveAiPolicy` (+ token ledger) | `PlanOverview` benefit strip, `AiQuotaCard` | ✓ OK |
| 4.17 | Catalog AI settings: provider/key/model, `allowancePolicy`, `dailyLimit`, `windowLimit`, `estimatedOutputTokensPerQuestion`, `modelPricing` | `settings/revisionCatalog.aiSettings` | `resolveEffectiveAiPolicy`, `reserveUsage`/`finalizeUsage` | `AiQuotaCard`, admin only otherwise | ✓ OK |
| 4.18 | Subscription page content (`utils/subscriptionAccess.ts`: title, subtitle, cycle labels, AI Mentor/community/profile lock copy) | — (no admin editor) | nothing | **deleted** — the file was imported by nothing and still carried old "Eduvora Plus+" copy, so it could only ever drift from the page | ✓ OK (turn 6) |
| 4.19 | Plan-change rules (no downgrade, yearly→monthly lock) | — | `evaluatePlanChange` server-side + page guards | page | ✓ OK |
| 4.20 | AI Mentor feature gate (`subscriptionFeatures/ai-mentor`) | feature doc | `assertAiMentorEntitlement` (server, both chat surfaces) | paywall copy from the gate | ✓ OK |
| 4.21 | Own-API-key learners and the subscription gate | — | **FIXED (owner decision: bypass)** — `groundedCompletion` computes `requestedSource` first and wraps both AI gates in `if (requestedSource !== "own")`; `personalAi.context` / `usage.status` report `ownKeyExempt` + `planAllowsAi = policy.hasAccess \|\| ownKeyExempt`. School / shared key stays fully gated | paywall copy only when the plan blocks the learner *and* no own key | ✓ OK (turn 3) |

---

## 5. What these changes (turns 1–5) ship

* **Turn 1** — section 2 in full (clear copy, split headings, upgrade CTA,
  regression test) + this audit.
* **Turn 2/3** — section 1 rename: every user-visible "Revision Studio" /
  "AI Mentor" / "Lumen" string is **"Roman AI Pro"**; machine ids (`revision`,
  `ai-mentor`), error codes and `LEGACY_FEATURE_LABELS` unchanged; store repair
  only rewrites a stored name that still equals the old default. Section 4.21
  (own-key bypass) shipped in `api/_lib/personalAi.ts`.
* **Turn 4/5** — section 3 (per-cycle rows) end-to-end: the shared rule in
  `utils/subscriptionVisibility.js`, both normalisers, the server + client
  type declarations, `SubscriptionPage` / `PlanOverview` wiring, server
  enforcement of plan-cycle + feature visibility and the 4.6 subscriber price.
  `tests/subscriptionCycleVisibilitySyncContract.test.mjs` (9 cases) pins the
  whole chain; 4.6/4.8/4.9 marked fixed above.
* The plan card's School AI allowance line was rewritten in plain language
  (`data-plan-ai-allowance`) — the old "counted from real model usage /
  hybrid metering" wording is gone.
* **Turn 6** — remaining admin-sync rows: the hide model reaches the rail
  (`isFeatureHiddenForAudience`, turn 6 helper in the shared module) and My Day
  (plan-scoped `tiers`); one subscriber-price resolver merges both admin
  surfaces (4.13); the plan-sheet copy no longer promises a ₹0 renewal that no
  resolver honours; the legacy AI-questions knob is labelled honestly (4.7);
  the dead `utils/subscriptionAccess.ts` is deleted (4.18); a stray
  "fallback catalog in use" flag on the subscription page is now surfaced and
  the two stale subscription-area test assertions (badge + content column) are
  fixed. `tsc --noEmit` is clean for **both** `tsconfig.json` (client) and
  `tsconfig.api.json` (API).

Test status: `node --test tests/*.test.mjs` → **2436 tests, 2429 pass / 7 fail**
(the 7 failures are the same ones that fail on the base commit `9d0e61a`,
verified in a clean worktree; three base failures in the subscription area were
stale assertions and are fixed here). `tsc --noEmit` is clean for both the
client and the API project. New suites pinning the new behaviour:
`tests/subscriptionCycleVisibilitySyncContract.test.mjs` (11, incl. the hide
model + subscriber-price precedence) and `tests/aiGateCopyClarityContract.test.mjs` (5).
