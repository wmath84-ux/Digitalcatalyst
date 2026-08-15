# Acceptance test — subscription / My Day work (PR #369, merged into main)

> **Instructions for the reviewing session:** Do not take any claim below on
> trust. Verify every item independently against the code and, where possible,
> the live app. If something does not hold, say so plainly.
>
> All items below were requested across one working session, merged to `main`
> via PR #369 ("Subscription fixes, exact-time My Day reminders, and a green
> test suite") on 2026-08-15. This document was re-verified against the merged
> tree on 2026-08-15.

---

## 1. Coupon input hidden for free / ₹0 orders

**Request:** Free product ya subscription par coupon-code input kahin na
dikhe — PDP, subscription page, checkout — kahin bhi.

**Verify:**
- `utils/couponVisibility.js` exists, exports `isFreeProduct`,
  `shouldShowCouponInput`, `payableBeforeCouponPaise` (+ `.d.ts`).
- All three surfaces import it: `src/PdpApp.tsx`,
  `src/subscription/components/SubscriptionPage.tsx`,
  `src/components/checkout/CheckoutReviewStep.tsx`.
- Referral input on the subscription page was deliberately left visible
  (user chose that).
- Tests: `tests/couponVisibility.test.mjs` (16 tests).

**Known gap (deliberate):** server (`/api/quotes/create`) still accepts a
coupon on a ₹0 order if hit directly — UI-level hiding only.

---

## 2. Plan/cycle-wise feature pricing

**Request:** Subscription page par pricing-wise feature set — per-plan aur
per-cycle alag price, admin se configurable.

**Verify:**
- Engine: `utils/featurePricing.js` — `resolveFeaturePrice(feature, planId,
  cycle)`, `normalisePlanPricing`, `resolveFeaturesForPlan`.
- Server charges the SAME resolver: `utils/subscriptions.js`
  (`buildSubscriptionLineItems`) imports `resolveFeaturePrice` — display and
  charge cannot diverge.
- Admin editor: `src/admin/pages/SubscriptionsPage.tsx` has per-cycle price
  fields, per-plan overrides, "Free on this plan" checkbox, and summary pills
  in the feature list.
- Subscription page: `src/subscription/components/FeaturePricingTiers.tsx`
  ("Features by price" strip, tier-select in one tap).
- Tests: `tests/featurePricing.test.mjs` (20 tests).

**Known gap (deliberate):** `FeatureSelectModal.tsx` still shows flat
`f.pricePaise` — not yet migrated to the plan-aware resolver.

---

## 3. Expiry / renewal notification design + test sandbox

**Request:** Subscription expiry notification aur renewal message ka design,
aur usko test karne ka tarika.

**Verify:**
- Presentation layer: `utils/renewalPresentation.js` — stage-wise tones
  (7d blue/info, 3d amber, 1d amber-urgent, due red/critical non-dismissable,
  expired red/critical non-dismissable).
- Components: `src/components/subscription/RenewalBanner*` and the
  notification card components.
- **Sandbox:** open `#/dev/subscription-preview` in the app (no login
  needed). Slider + presets (30d/7d/3d/tomorrow/due/expired) show all four
  surfaces live: in-app banner, notification row, renewal status card,
  raw scheduler payload. It runs the real `getRenewalReminder`, not a mock.
- Banner is mounted in the app shell: `src/main.tsx` renders
  `RenewalBannerHost` (once per stage, dismissal keyed by expiry+stage,
  due/expired not dismissable, hidden on subscription/checkout/admin/auth
  routes, respects reminder opt-out; CTA opens `#/subscription?renew=1`).
- Tests: `tests/renewalPresentation.test.mjs` (22),
  `tests/renewalBannerMountContract.test.mjs` (9).

---

## 4. Four live-testing bugs

**Request (all four reported from a live test):**

### 4a. Subscription unlock celebration
Checkout success for a membership shows a full-screen sparkle-blast
(`src/components/subscription/UnlockCelebration.tsx`, framer-motion + SVG,
respects `prefers-reduced-motion`), CTA becomes "Open my membership",
"Replay celebration" button, and the server writes a proper welcome
notification (plan name, feature count, expiry) deep-linking to
`#/subscription`. Wired in `CheckoutSuccessStep.tsx` and
`api/razorpay/verify-payment.ts` (`announceUnlock`).

### 4b. Subscriber view (no re-purchase screen)
`SubscriptionPage.tsx` listens to `users/{uid}/subscription/current`; active
members see `ActiveMemberView.tsx` (plan hero, renewal status, unlocked
features, included courses, reminder toggle). Buy flow only opens via
"Renew early" / "Change plan" / `renew=1`.

### 4c. Feature unlock (My Day locked after purchase)
Root cause: free/included features produced no priced line item, and the
grant step rebuilt the feature list from line items only. Fix: quote carries
`subscriptionFeatureIds` (see `utils/serverQuotes.js` ~line 979,
`api/_lib/entitlements.ts`, `api/razorpay/verify-payment.ts`); old
line-item derivation is legacy fallback only.
Tests: `tests/subscriptionFeatureGrantContract.test.mjs` (6).

### 4d. Referral crash on Vercel
`api/subscription-referral.ts` imported `./_lib/firebaseAdmin` without
`.js` → `Cannot find module /var/task/api/_lib/firebaseAdmin`. Fixed; a
guard test enforces `.js` on every relative import under `api/`:
`tests/apiRelativeImportExtensionContract.test.mjs`.

---

## 5. Three follow-ups

### 5a. My Day task time picker
Task modal's Time field was a plain text input (`e.g., 04:00 PM`), so no
clock ever opened. Now `type="time"` + `showPicker()`, optional with Clear,
and legacy free-text values ("4 pm", "9:5", "16") are coerced via shared
`utils/timeOfDay.js` so old data isn't silently dropped.
Tests: `tests/mydayTaskTimePickerContract.test.mjs` (7).

### 5b. Replay path self-heal
If the payment intent was already `verified` (refresh/webhook retry), the
handler used to early-return and skip both grants. Now replays re-run both
idempotent grants (stuck purchases self-repair on revisiting the success
page), and `writeSubscriptionAfterPayment` (`api/_lib/subscriptions.ts`
~line 343) has an orderId replay guard so a re-run can never double the
expiry. Tests: `tests/verifyPaymentReplayRepairContract.test.mjs` (7).

### 5c. Renewal banner mounted — see item 3.

---

## 6. Exact-time system notifications (app closed or open)

**Request:** User ne jo exact time set kiya hai — task, schedule, reminder —
us time par system notification jaye, app band ho tab bhi.

**Verify:**
- Infra (service worker, web push, `tzOffsetMinutes` on the user doc,
  scheduler endpoint `api/cron/subscription-renewals.ts`) pre-existed.
- Fixes: lookback window now derives from the last successful run
  (`utils/pushScheduler.js` `resolveLookbackMs`, capped at 1h) instead of a
  fixed 15 min; push tag is per-item per-day so simultaneous reminders no
  longer collapse into one; matches the foreground tag so no duplicates.
- `vercel.json` stays daily (`30 3 * * *`) because Vercel Hobby rejects
  sub-daily crons; a minute-level GitHub Actions pinger is provided.
- Tests: `tests/myDayExactTimeDeliveryContract.test.mjs` (9).

**⚠️ NOT ACTIVE UNTIL MANUAL STEPS DONE:**
1. `.github/workflows/push-scheduler.yml` must exist on `main`. The agent's
   GitHub App cannot push workflow files — the template is at
   `ops/push-scheduler.workflow.yml` with copy instructions.
2. GitHub repo secrets: `CRON_SECRET` (same value as Vercel) and
   `SCHEDULER_URL` (`https://<domain>/api/cron/subscription-renewals`).
3. Vercel env: `WEB_PUSH_VAPID_PUBLIC_KEY` / `WEB_PUSH_VAPID_PRIVATE_KEY`
   must be set or every send silently no-ops.
4. iOS: Safari only delivers push to a Home-Screen-installed PWA.

Until (1)+(2) are done, reminders only go out with the once-a-day Vercel
cron — i.e. almost never on time. See `ops/README-push-scheduler.md`.

---

## 7. Test suite: 62 failures → 0

- 11 were stale assertions against working code (variable renames, changed
  copy, superseded landing policy, admin-configurable price replacing a
  hardcode) — assertions re-pointed at the real behaviour, production code
  untouched.
- 51 referenced files/features that do not exist in this repo (root-level
  `App.tsx` monolith, Community, AI Q&A, old CoursePlayer, `rounded-[22px]`
  design system). All 48 files crashed on a missing file with zero passing
  assertions; deleted with user approval. Judge this decision yourself — if
  you think deleting was wrong, say so.
- Current state: `node --test tests/*.mjs` → **841 pass / 0 fail**
  (re-verified on the merged tree, 2026-08-15).

---

## Deliberately NOT done (carry-overs)

1. Server-side ₹0 coupon guard in `/api/quotes/create`.
2. `FeatureSelectModal.tsx` plan-aware pricing migration.
3. Workflow install + secrets (manual, see item 6).
