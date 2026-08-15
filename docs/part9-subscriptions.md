# Part 9 — Server-Side Subscriptions

## Scope

Part 9 removes the subscription simulation in `src/subscription/`
and replaces it with a **server-driven flow** that uses the same
quote / Razorpay / entitlement pipeline the product purchase flow
uses. Concretely:

- **Delete simulation**: `setTimeout` in `handleSubscribe`,
  client-only activation, and the `SuccessOverlay` component
  are all gone. The hard-coded `BASE_MONTHLY=4.99` /
  `BASE_YEARLY=29.99` prices and the hard-coded `COURSES` /
  `FEATURES` / `COUPONS` / `REFERRALS` lists are also gone.

- **Server-driven plans / features**: the page now reads
  `subscriptionPlans` / `subscriptionFeatures` /
  `subscriptionPlanProductUnlocks` /
  `subscriptionPlanModuleUnlocks` from Firestore via
  `/api/subscription-catalog`. Plans have a monthly +
  yearly price in paise, an `allowedCycles` list, an
  `includedFeatureIds` / `includedProductIds` /
  `includedModuleKeys` array, a `trialDays` field, and an
  `autoRenewByDefault` flag.

- **Canonical subscription selection**:
  `{ purchaseKind: "subscription", subscriptionPlanId, billingCycle, featureIds, productIds, moduleIds, couponCode, requestedEduCoins, returnRoute }`. The `CheckoutSelection`
  shape was already in place from Part 1; Part 9 wires
  `subscription` + `subscription_features` through the
  Part 4 engine.

- **Server quote verifies**: plan active, billing cycle,
  plan cycle price, feature active, feature prices,
  included / free features, product / module unlocks,
  coupon (Part 7 engine, unchanged), EduCoins (Part 4
  reservation, unchanged), final cash amount.

- **Checkout line items** (Part 1 `CheckoutLineItem` shape):
  one line per plan, one line per paid feature, one
  line per product-unlock, one line per module-unlock.
  The line `kind` is `subscription` or
  `subscription_features`; the `entitlementId` is
  `subscription:<planId>` /
  `subscription_feature:<planId>:<featureId>` /
  `subscription_product_unlock:<planId>:<productId>` /
  `subscription_module_unlock:<planId>:<productId>:<moduleId>`.

- **Cycle expiry / renewal**: `computeCycleExpiresAt`
  returns `now + (trialDays + cycleDays) * 86_400_000`.
  Cycle days = 30 (monthly) or 365 (yearly). The
  `subscriptions/{uid}/current` doc carries
  `status: "active"`, `activatedAt`, `expiresAt`,
  `autoRenew`, `orderId`, `paymentId`, `amountPaise`,
  `couponCode`, `requestedEduCoins`. The legacy
  `users/{uid}` doc gets a `subscriptionPlanId` /
  `subscriptionCycle` / `subscriptionTier` /
  `subscriptionFeatures` / `subscriptionExpiresAt` /
  `subscriptionAutoRenew` mirror so existing readers
  (profile, admin) keep working.

- **After payment**: `grantSubscriptionFromQuote` runs in
  a separate transaction after `grantEntitlementsFromQuote`
  (mirrors the Part 7 coupon redemption contract: a
  subscription write failure does NOT roll back the
  entitlement grant). It writes per-feature / per-unlock
  entitlements (idempotent — `existing.exists` check),
  the `subscriptions/{uid}/current` doc, and the user-doc
  mirror. The Razorpay response carries a `subscription`
  summary `{ planId, cycle, features, activatedAt,
  expiresAt, orderId }`.

- **Tests**: monthly / yearly / feature combinations /
  expiry all covered. Idempotency covered (replay = same
  entitlements, no double-count). Re-run on a replay path
  is safe.

What is **out of scope** (explicitly preserved as-is):

- **EduCoin** — `requestedEduCoins` is forwarded to the
  Part 4 engine; the actual debit is a later part.
- **Coupons** — fully wired via the Part 7 coupon engine
  (no changes).
- **Subscription auto-renew** — the field is written,
  the cron job that flips `status: "active"` →
  `status: "expired"` is out of scope.
- PDP / Course Player / Profile / Admin — untouched.

## Architectural Changes

### 1. Pure subscription engine (`utils/subscriptions.js` + `.d.ts`)

A pure, no-I/O module that owns every Part 9 rule. The Node
test runner imports the `.js` file directly. The
`api/_lib/subscriptions.ts` server glue wraps the engine
with Firestore + transactional code.

Public surface:

- `normalisePlanDoc(raw, id?)` — coerce a Firestore
  `subscriptionPlans/{id}` doc into the canonical
  `SubscriptionPlanDoc` shape.
- `normaliseFeatureDoc(raw, id?)` — same for
  `subscriptionFeatures/{id}`.
- `isPlanActive`, `isPlanCycleAllowed`,
  `isFeatureSelectable`, `isFeaturePayable`,
  `isFeatureIdAllowed` — one pure predicate per rule.
- `getPlanCyclePricePaise(plan, cycle)` — returns the
  cycle price (paise).
- `computeCycleExpiresAt(plan, cycle, now?)` — returns
  the cycle expiry timestamp.
- `isSubscriptionActive(subscription, now?)` — pure
  helper for the receipt.
- `buildSubscriptionLineItems({ plan, cycle, ... })` —
  returns the canonical `CheckoutLineItem[]` shape.
- `validateSubscriptionSelection(input, now?)` — the
  top-level validator.
- `formatBillingCycle(cycle)` /
  `getCycleDurationDays(cycle)` — display helpers.
- `collectSubscriptionEntitlementIds(...)` — the
  per-user entitlement id set the Part 6 writer
  persists.
- `toPaise(value)` / `fromPaise(paise)` — money
  helpers.

### 2. Part 4 engine integration (`utils/serverQuotes.js`)

- `PURCHASE_KINDS` now includes `subscription` +
  `subscription_features`.
- `QUOTE_KIND_TO_LINE_KIND` maps them to the new line
  `kind` values.
- New structural pre-checks refuse a subscription
  selection that's missing `subscriptionPlanId` or
  `billingCycle`.
- New per-kind branch: when the selection is a
  subscription, the engine accepts pre-built line items
  via the new `subscriptionLineItems` input (computed
  by `buildSubscriptionLineItems` in `utils/subscriptions.js`).
- New `BuildQuoteInput` fields: `subscriptionLineItems`,
  `subscriptionExpiresAt`.
- The returned `ServerPriceQuoteRecord` carries
  `subscriptionPlanId`, `subscriptionCycle`,
  `subscriptionExpiresAt` so the success page can
  render the receipt.
- `selectionsEqual` (idempotency) already includes
  `subscriptionPlanId` + `billingCycle` from Part 1;
  Part 9 just adds the new `subscription` purchase
  kind to the engine's `buildLineId` switch.

### 3. Server-side plumbing (`api/_lib/subscriptions.ts`)

- `loadPlanById`, `loadActivePlans` — single + bulk
  plan loaders.
- `loadActiveFeatures` — feature loader.
- `loadPlanProductUnlocks` / `loadPlanModuleUnlocks` —
  product / module unlock mappings.
- `loadSubscriptionSelectionContext(selection)` — the
  full pipeline: load the plan, validate the cycle,
  load the features, validate each one, build the
  line items, compute the expiry. Returns either
  `{ ok: true, plan, features, lineItems, productUnlocks,
  moduleUnlocks, expiresAt, cycle }` or
  `{ ok: false, status, error, code }`.
- `writeSubscriptionAfterPayment(tx, args)` — runs
  inside a Firestore transaction. Writes the canonical
  `subscriptions/{uid}/current` doc + the user-doc
  mirror (high-value fields only).
- `collectSubscriptionEntitlementIds(args)` — pure
  helper that returns the per-user entitlement id set.

### 4. Quote endpoint extension (`api/_lib/quotes.ts`)

- `parseSelection` accepts `subscription` +
  `subscription_features`.
- `handleCreateQuote` detects the subscription kind,
  calls `loadSubscriptionSelectionContext`, and
  passes the pre-built `subscriptionLineItems` +
  `subscriptionExpiresAt` to `buildQuote`. On a refusal
  the response carries `subscriptionRefused: true` +
  `subscriptionErrorCode`.

### 5. Razorpay endpoints

- `api/razorpay/create-order.ts` — the
  `allowedKinds` set includes `subscription` +
  `subscription_features`. The intent snapshot carries
  `subscriptionPlanId` / `subscriptionCycle` /
  `subscriptionExpiresAt` so a verify-payment replay
  still knows what subscription was applied.
- `api/razorpay/verify-payment.ts` — calls
  `grantSubscriptionFromQuote` after the entitlement
  grant. The success response carries a
  `subscription` summary on every success branch
  (replay, free, paid). The consumed-replay fallback
  quote also carries the subscription fields so a
  replay still works.

### 6. Post-payment subscription storage

`grantSubscriptionFromQuote` (Part 6 + Part 9) writes
in a single transaction:

- `entitlements/{uid}__<entitlementId>` for every
  subscription entitlement (idempotent — `existing.exists`
  check).
- `subscriptions/{uid}/current` — the canonical record
  with plan, cycle, features, included product/module
  ids, status, activatedAt, expiresAt, autoRenew,
  orderId, paymentId, amountPaise, source, couponCode,
  requestedEduCoins.
- `users/{uid}` — `subscriptionPlanId`,
  `subscriptionCycle`, `subscriptionTier`,
  `subscriptionFeatures`, `subscriptionExpiresAt`,
  `subscriptionAutoRenew`, `subscriptionActivatedAt`
  (legacy mirror so existing readers keep working).

### 7. Client UI (`src/subscription/`)

- `SubscriptionPage` is rewritten end-to-end. The
  page:
  - loads the catalog from `/api/subscription-catalog` on mount,
  - shows a plan picker (chips) + cycle toggle
    (monthly / yearly) + feature picker + product
    picker,
  - shows a coupon input that pre-flights the
    discount via `/api/subscription-coupon` (server
    is the only authority on the math),
  - shows the price summary in paise → rupee
    format,
  - on Subscribe, builds a `CheckoutSelection`,
    persists a session record via
    `utils/checkoutSession.js`, and navigates to
    `#/checkout` — the same `CheckoutApp` from
    Part 5 handles the rest.
- `PlanOverview`, `PriceSummary`, `SubscribeBar`,
  `FeatureSelectModal`, `CourseSelectTrigger`,
  `CourseSelectModal`, `PromoCodeInput` are
  refactored to consume the new `SubscriptionPlanDoc` /
  `SubscriptionFeatureDoc` / `SubscriptionCatalog`
  types (paise throughout, no `$` symbols).
- `SubscriptionPage` no longer references
  `SuccessOverlay`, `setTimeout`, or hard-coded
  prices.
- `src/subscription/data/courses.ts` +
  `src/subscription/data/features.ts` are deleted
  (the data now lives in Firestore).
- `src/subscription/components/SuccessOverlay.tsx`
  is deleted.
- New `src/subscription/utils/subscriptionCatalog.ts` —
  types + `startCheckout` helper that routes the
  subscription through the Part 5 `CheckoutContext`.

### 8. New server endpoints

- `api/subscription-catalog.ts` — `GET` endpoint that
  returns the full catalog (active plans + features
  + product/module unlocks). Auth is optional
  (read-only).
- `api/subscription-coupon.ts` — `POST` endpoint
  that re-quotes a subscription selection with a
  coupon code and returns the server-validated
  `couponDiscount` in paise.

## Files Added

| Path | Purpose |
| --- | --- |
| `utils/subscriptions.js` | Pure subscription engine (every Part 9 rule as a pure function). |
| `utils/subscriptions.d.ts` | Type declarations for the engine + the `SubscriptionPlanDoc` / `SubscriptionFeatureDoc` / `SubscriptionRecord` / etc. shapes. |
| `api/_lib/subscriptions.ts` | Server-side plumbing — loaders, validator, transactional writer. |
| `api/subscription-catalog.ts` | `GET` endpoint that returns the full catalog. |
| `api/subscription-coupon.ts` | `POST` endpoint that pre-flights the coupon. |
| `src/subscription/utils/subscriptionCatalog.ts` | Client types + `startCheckout` helper. |
| `tests/subscriptions.test.mjs` | 32 unit tests — every Part 9 spec rule + math + monthly / yearly / combo / expiry. |
| `tests/subscriptionsServerContract.test.mjs` | 24 source-level contract tests for the server plumbing + the sim-removal contract. |

## Files Modified

| Path | Change |
| --- | --- |
| `utils/serverQuotes.js` | `PURCHASE_KINDS` + `QUOTE_KIND_TO_LINE_KIND` extended. Structural pre-checks for subscription selections. New per-kind branch consumes the pre-built `subscriptionLineItems`. `buildLineId` switch handles the two new line kinds. `selectionsEqual` already included `subscriptionPlanId` / `billingCycle`. |
| `utils/serverQuotes.d.ts` | `BuildQuoteInput` extended with `subscriptionLineItems` + `subscriptionExpiresAt`. `ServerPriceQuoteRecord` extended with the subscription metadata. |
| `src/types/commerce.ts` | `ServerPriceQuote` interface extended with `subscriptionPlanId` / `subscriptionCycle` / `subscriptionExpiresAt`. |
| `api/_lib/quotes.ts` | `PURCHASE_KINDS` extended. `handleCreateQuote` loads the subscription context when the selection is a subscription. On refusal, the response carries `subscriptionRefused: true` + `subscriptionErrorCode`. |
| `api/razorpay/create-order.ts` | `allowedKinds` extended. Intent snapshot carries the subscription metadata. |
| `api/razorpay/verify-payment.ts` | Calls `grantSubscriptionFromQuote`. Success response carries a `subscription` summary on every branch. Consumed-replay fallback quote carries the subscription metadata. |
| `api/_lib/entitlements.ts` | New `grantSubscriptionFromQuote` helper that writes entitlements + the subscription record + the user-doc mirror in a single transaction. |
| `tsconfig.api.json` | `include` adds `utils/subscriptions.d.ts`. |
| `src/subscription/components/SubscriptionPage.tsx` | Full rewrite — server-driven, no simulation, no hard-coded prices, no `setTimeout`, no `SuccessOverlay`. |
| `src/subscription/components/PlanOverview.tsx` | New prop shape (plans + features). Renders plan pills, cycle toggle, included-feature pills. |
| `src/subscription/components/PriceSummary.tsx` | Paise throughout, plan + features + coupon + min-payable rows. |
| `src/subscription/components/SubscribeBar.tsx` | Paise throughout, "Subscribe via Razorpay" CTA. |
| `src/subscription/components/FeatureSelectTrigger.tsx` + `FeatureSelectModal.tsx` + `CourseSelectTrigger.tsx` + `CourseSelectModal.tsx` + `PromoCodeInput.tsx` | Server-driven, paise throughout, includes/selected/excluded states. |

## Files Deleted

- `src/subscription/components/SuccessOverlay.tsx` —
  the fake success overlay.
- `src/subscription/data/courses.ts` — the hard-coded
  10 courses list.
- `src/subscription/data/features.ts` — the hard-coded
  8 features list.

## Spec Coverage

| Spec requirement | Where it lives | Test |
| --- | --- | --- |
| Plan active | `isPlanActive` (rule 1) | `subscriptions.test.mjs` |
| Billing cycle | `isPlanCycleAllowed` (rule 2) | `subscriptions.test.mjs` |
| Plan cycle price | `getPlanCyclePricePaise` (rule 3) | `subscriptions.test.mjs` |
| Feature active | `validateSubscriptionSelection` (rule 4) | `subscriptions.test.mjs` |
| Feature prices | `isFeaturePayable` (rule 5) | `subscriptions.test.mjs` |
| Included / free features | `buildSubscriptionLineItems` skips `included` (rule 6) | `subscriptions.test.mjs` |
| Product unlock mappings | `subscriptionPlanProductUnlocks` collection (rule 7) | `subscriptionsServerContract.test.mjs` |
| Module unlock mappings | `subscriptionPlanModuleUnlocks` collection (rule 8) | `subscriptionsServerContract.test.mjs` |
| Coupon (delegated to Part 7) | `validateCoupon` from `utils/coupons.js` (rule 9) | `subscriptions.test.mjs` |
| EduCoins (delegated to Part 4) | `eduCoinsReserved` on the verified quote (rule 10) | `subscriptions.test.mjs` |
| Final cash amount | `cashPayable` on the verified quote (rule 11) | `subscriptions.test.mjs` |
| Expiry / renewal | `computeCycleExpiresAt` + `subscriptions/{uid}/current` (rule 12) | `subscriptions.test.mjs` |
| Test monthly / yearly / combos / expiry | `tests/subscriptions.test.mjs` | 32 tests |
| Delete `setTimeout` simulation | SubscriptionPage rewrite | `subscriptionsServerContract.test.mjs` |
| Delete client-only activation | SubscriptionPage rewrite | `subscriptionsServerContract.test.mjs` |
| Delete fake success overlay | `SuccessOverlay.tsx` deleted | `subscriptionsServerContract.test.mjs` |
| After payment: store subscription tier / plan / cycle / features / activatedAt / expiresAt / autoRenew / granted entitlements / order record | `grantSubscriptionFromQuote` | `subscriptionsServerContract.test.mjs` |

## Test Results

| Suite | Tests | Pass | Fail |
| --- | --- | --- | --- |
| `tests/subscriptions.test.mjs` (NEW) | 32 | 32 | 0 |
| `tests/subscriptionsServerContract.test.mjs` (NEW) | 24 | 24 | 0 |
| `tests/coupons.test.mjs` (Part 7) | 42 | 42 | 0 |
| `tests/couponsServerContract.test.mjs` (Part 7) | 28 | 28 | 0 |
| `tests/checkoutCouponContract.test.mjs` (Part 7) | 22 | 22 | 0 |
| `tests/serverQuotes.test.mjs` (Part 4) | 47 | 47 | 0 |
| `tests/serverQuotesContract.test.mjs` (Part 4) | 18 | 18 | 0 |
| `tests/entitlements.test.mjs` (Part 6) | 23 | 23 | 0 |
| `tests/entitlementsContract.test.mjs` (Part 6) | 30 | 30 | 0 |
| `tests/checkoutRazorpayEntitlementsContract.test.mjs` (Part 6) | 13 | 13 | 0 |
| `tests/checkoutSession.test.mjs` (Part 5) | 19 | 19 | 0 |
| `tests/checkoutMobileWidths.test.mjs` (Part 5) | 25 | 25 | 0 |
| `tests/pdpSelection.test.mjs` (Part 3) | 45 | 45 | 0 |
| `tests/pdpPurchaseBuilderMobileWidths.test.mjs` (Part 3) | 15 | 15 | 0 |
| `tests/commerce.test.mjs` (Part 1) | 28 | 28 | 0 |
| `tests/productMapping.test.mjs` (Part 1) | 27 | 27 | 0 |
| `tests/productPrice.test.mjs` (Part 1) | 3 | 3 | 0 |
| **Total (Part 9 + adjacent)** | **441** | **441** | **0** |

- `npx tsc --noEmit` is clean for new code. Pre-existing `utils/*` errors remain (out of scope, unchanged).
- `npx tsc --noEmit -p tsconfig.api.json` is clean. Pre-existing `api/push/send.ts` web-push error is unchanged.
- `npm run build` succeeds (Vite 7.3.2, 2960 modules, 2.65 MB).

## What was NOT done in Part 9

- **EduCoin debit** — `requestedEduCoins` is forwarded to
  the Part 4 engine as a reservation; the actual
  decrement happens in a later part. The price section
  still shows "EduCoin discount = ₹0" as a placeholder
  (Part 4 behavior — unchanged).
- **Subscription auto-renew cron** — the `autoRenew`
  field is written; the cron job that flips
  `status: "active"` → `status: "expired"` is out of
  scope. The `subscriptions/{uid}/current` doc is the
  data foundation; a future part can read it to drive
  expiry notifications.
- **Subscription cancellation flow** — the page doesn't
  expose a cancel button. Part 9 is buy-only.
- PDP / Course Player / Profile / Admin — the
  `subscriptionTier` / `subscriptionFeatures` fields on
  `users/{uid}` are read by the existing readers; the
  Part 9 mirror is for backward compat. No new
  subscription-tier UI was added in this part.
- Pre-existing `utils/*` tsc errors + pre-existing test
  infrastructure issues in `payment*` /
  `subscription*` / `course*` / `admin*` test files
  (which reference top-level `App.tsx` /
  `components/PaymentModal.tsx` that don't exist in
  `src/`). These fail identically on the pristine
  `main` branch with `Error: ENOENT ... 'App.tsx'`
  and are out of scope.

---

## Addendum — Duplicate purchase of an already-owned subscription

### Problem

A member who already held, say, **Premium · yearly** could re-open the
subscription page, tap the Premium pill and the Yearly toggle, and be shown
the complete buy flow again: the product picker, the feature picker, the
coupon field, a price summary and a violet **"Subscribe via Razorpay"**
button. Nothing on the page said the plan was already active, so the second
payment went through and the only visible effect was a silently extended
expiry date.

The pre-existing `ActiveMemberView` only covered the *default* landing state.
As soon as the member entered "manage plan" mode — the documented way to
change plan or renew — the guard was gone and every plan × cycle combination,
including the owned one, was purchasable again.

### The rule

A **subscription type** is the plan **and** the billing cycle together, so
Basic/Premium/Pro × monthly/yearly are six distinct things a user can own.

* A selection is **owned** when the buyer has an active, unexpired
  subscription whose `planId` *and* `cycle` both match the selection.
  Switching either one is still a legitimate purchase.
* An owned selection is **blocked** until the membership enters its renewal
  window — the final `RENEWAL_WINDOW_DAYS` (7) days before expiry — or has
  expired. Deliberate renewals keep working; accidental double purchases
  become impossible.

### What the member now sees

When the current plan + cycle selection is the owned one:

* The entire buy flow is replaced by `OwnedPlanCard`. The course picker, the
  feature picker, the price-tier strip, the coupon/referral inputs and the
  price summary are **not rendered at all** — there is nothing to select and
  nothing to mis-read.
* The card states the active plan, its cycle, the days remaining, exactly
  which features and courses it unlocks, and when renewal opens.
* The plan pill and the cycle toggle for the owned combination are tinted
  emerald and marked `· ACTIVE`, so the member can tell which subscription
  type they hold *before* tapping.
* The sticky bottom button switches from the violet
  "Subscribe via Razorpay" to an emerald **"Subscribed"** (or
  "Subscribed · Renew" inside the renewal window). The colour itself is the
  signal. Outside the renewal window it is disabled.

### Enforcement

The rule lives once, as pure functions, in `utils/subscriptionOwnership.js`:

| Export | Role |
| --- | --- |
| `evaluateSubscriptionSelection` | The single decision — `owned` / `renewalEligible` / `blocked` + machine code + human reason. |
| `buildOwnedPlanSummary` | View-model for the owned card (plan, cycle, countdown, owned features, owned courses). |
| `resolveSubscribeCta` | Label + colour tone + disabled flag for the bottom bar. |

Three surfaces consume it, so they cannot disagree:

1. `SubscriptionPage.tsx` renders the owned state and refuses to call
   `startCheckout` for a blocked selection.
2. `SubscribeBar.tsx` derives its label / tone / disabled state from
   `resolveSubscribeCta`.
3. `api/_lib/quotes.ts` calls `assertSubscriptionPurchasable` **before**
   loading the subscription context, and returns `409` with
   `subscriptionErrorCode: SUBSCRIPTION_ALREADY_ACTIVE`. The client is never
   the authority — a crafted request cannot buy the same membership twice.

### Files added

| Path | Purpose |
| --- | --- |
| `utils/subscriptionOwnership.js` | Pure duplicate-purchase rules. |
| `utils/subscriptionOwnership.d.ts` | Type declarations for those rules. |
| `src/subscription/components/OwnedPlanCard.tsx` | The "already subscribed" state that replaces the buy flow. |
| `tests/subscriptionRepurchaseGuard.test.mjs` | 26 tests — the rules, the view-model, the CTA, and the UI/server wiring contracts. |

### Files modified

| Path | Change |
| --- | --- |
| `src/subscription/components/SubscriptionPage.tsx` | Derives `ownershipState`; renders `OwnedPlanCard` instead of the buy flow for an owned selection; clears stale coupons; blocks `handleSubscribe`. |
| `src/subscription/components/SubscribeBar.tsx` | Emerald "Subscribed" CTA driven by `resolveSubscribeCta`. |
| `src/subscription/components/PlanOverview.tsx` | New `ownedPlanId` / `ownedCycle` props mark the active plan pill and cycle toggle. |
| `api/_lib/subscriptions.ts` | New `loadCurrentSubscription` + `assertSubscriptionPurchasable`. |
| `api/_lib/quotes.ts` | Calls the guard for every subscription quote. |
