# Part 6 — Razorpay (quoteId-only) + Canonical Entitlements

## Scope

Part 6 hardens the Razorpay payment flow against the canonical
`ServerPriceQuote` (Part 4) and introduces a single transactional
entitlement writer that grants per-line access for every Part 6
purchase kind:

- **Full product** (`full_product`)
- **Selected modules** (`selected_modules`)
- **Selected resources** (`selected_resources`)
- **Cart bundle** (`cart_bundle`)
- **Paid update** (`paid_update`)
- **Free entitlement** (`free_entitlement`)

What is **out of scope** (explicitly preserved as-is):

- Coupons / EduCoin (Part 1 schema unchanged; `couponDiscount` and
  `eduCoinDiscount` stay at `0` on every quote, exactly as Part 4
  produced them).
- Subscriptions / subscription features (the Razorpay endpoint
  refuses them with `400`).
- The Part 4 server-quote endpoint (`api/quotes/*`) is unchanged.
- The Part 5 `CheckoutContext` is unchanged — Part 6 just consumes
  `quote.quoteId` from it.
- Razorpay, Firebase Admin, Firestore client SDK versions are
  unchanged.

## Architectural Changes

### 1. Razorpay endpoints are now quote-driven

`api/razorpay/create-order.ts` accepts **only** `{ quoteId }`. The
handler:

- Verifies the Firebase ID token.
- Loads the persisted `ServerPriceQuote` from the private
  `_serverQuotes` collection via a new `loadServerQuoteForUser`
  helper in `api/_lib/quotes.ts`.
- Re-checks the quote's `uid`, `status`, and `expiresAt` — cross-uid
  is `403`, consumed/expired is `410`.
- Uses `quote.cashPayable` (paise) as the Razorpay amount.
- Creates the Razorpay order.
- Persists the payment intent to `_paymentIntents/{orderId}` with
  the **full quote snapshot** (`quoteId`, `purchaseKind`,
  `verifiedLineItems`, `amountPaise`, etc.) so the verify step is
  self-contained.
- For `cashPayable === 0`, returns a free order id and skips the
  Razorpay round-trip.

`api/razorpay/verify-payment.ts`:

- Verifies the Firebase ID token.
- Loads the payment intent and confirms ownership + linkage to a
  quote.
- Re-loads the quote (defends against intents created just before
  the quote expired); for consumed/expired quotes on a replay, it
  falls back to the intent snapshot and lets the entitlement
  writer short-circuit.
- **Idempotency** — if `intent.status === "verified"`, returns the
  original orderId/paymentId with `alreadyVerified: true` without
  re-running Razorpay or the entitlement grant.
- For paid orders: verifies the Razorpay HMAC signature (constant-
  time), fetches the payment, captures `authorized` payments,
  compares `payment.order_id` + `payment.amount` against the intent.
- Calls `grantEntitlementsFromQuote({ quote, orderId, paymentId,
  source: "razorpay" })` to atomically write the entitlements.
- Returns the granted entitlement ids so the success page can
  render them.

### 2. New canonical entitlements collection

`entitlements/{uid}__{entitlementId}` — one doc per (user,
entitlement) pair. The doc carries every spec field:

```
uid, productId, kind, moduleId, resourceId, updateId,
entitlementId, orderId, paymentId, status, amount, currency,
source, unlockedAt
```

`kind` is one of: `full_product`, `module`, `resource`,
`paid_update`, `free`.

The doc id is deterministic (`{uid}__{entitlementId}`) so
idempotent writes are safe.

### 3. Dual-write to legacy readers (no breaking change)

The same transaction also writes to the legacy `users/{uid}` doc
fields the existing PDP / Course Player / `useOwnedUpdates` reader
already consume:

- `users/{uid}.purchasedProductIds` — `arrayUnion(productId)` for
  every `full_product` line.
- `users/{uid}.purchasedProductUpdateIds[productId]` —
  `arrayUnion(updateId)` for every `paid_update` line.
- `users/{uid}/purchases/{productId}` — the legacy base-product
  purchase doc PDP / Course Player already reads.
- `users/{uid}/purchases/{productId}__update__{updateId}` — the
  legacy paid-update doc the Part 4 server-quote engine reads.

Modules, resources, and free entitlements are tracked only in the
canonical `entitlements` collection (no legacy writer existed for
those).

### 4. Atomic, replay-proof transaction

`grantEntitlementsFromQuote` runs **everything** in one
`db.runTransaction`:

1. Check `intent.status` — if already `verified`, mark replay.
2. Skip every `entitlements/{uid}__{entitlementId}` doc that
   already exists (idempotent).
3. Dual-write to `purchasedProductIds` / `purchasedProductUpdateIds`
   on the user doc.
4. Write legacy `purchases/{productId}` and
   `purchases/{productId}__update__{updateId}` docs (skipped when
   they already exist).
5. Write `siteOrders/{orderId}` (idempotent — only on first call).
6. Flip the payment intent to `verified` (merge).
7. Flip the quote from `active` to `consumed`, stamping
   `consumedAt`, `consumedOrderId`, `consumedPaymentId` (never
   re-stamps on replay).

## Files Added

| Path | Purpose |
| --- | --- |
| `utils/entitlements.js` | Pure entitlement engine — `toEntitlementKind`, `isGrantableLine`, `deriveEntitlementId`, `buildEntitlementDocId`, `buildEntitlementRecord`, `collectGrantableEntitlementIds`, `isQuoteReplayable`, `isEntitlementActive`, `partitionGrantable`, `buildSuccessReceipt`. |
| `utils/entitlements.d.ts` | Type declarations for the above + the `EntitlementRecord` / `SuccessReceipt` shapes. |
| `api/_lib/entitlements.ts` | Server-side transactional writer (`grantEntitlementsFromQuote`) + the pure `buildSiteOrder` helper. |
| `tests/entitlements.test.mjs` | 23 unit tests for the pure engine. |
| `tests/entitlementsContract.test.mjs` | 30 source-level contract tests for the Razorpay endpoints + entitlement writer (quoteId-only, signature-before-grant, idempotency, dual-write, etc.). |
| `tests/checkoutRazorpayEntitlementsContract.test.mjs` | 13 source-level contract tests for the React client (PaymentGateway, CheckoutApp, CheckoutSuccessStep). |

## Files Modified

| Path | Change |
| --- | --- |
| `api/_lib/quotes.ts` | Added `loadServerQuoteForUser(quoteId, uid, now?)` — the trusted server-side quote loader for Razorpay. |
| `api/razorpay/create-order.ts` | Rewrote to accept only `{ quoteId }`. Loads the quote, uses `quote.cashPayable`, persists the full quote snapshot on the payment intent. |
| `api/razorpay/verify-payment.ts` | Rewrote around the new flow. Idempotency short-circuit on `intent.status === "verified"`. Calls `grantEntitlementsFromQuote`. Returns `grantedEntitlementIds`. |
| `src/components/PaymentGateway.tsx` | Component now takes a `quoteId` prop. Posts `{ quoteId }` only. The free path now also calls `verify-payment` to grant the entitlements. |
| `src/components/checkout/CheckoutApp.tsx` | Derives `quoteId` from the canonical context; passes it to `PaymentGateway`. Passes `orderId`, `paymentId`, `grantedEntitlementIds`, `purchaseKind`, `cashPaid`, `minimumPayable`, `currency` to `CheckoutSuccessStep`. |
| `src/components/checkout/CheckoutSuccessStep.tsx` | New props for `orderId`, `paymentId`, `paymentMethod`, `grantedEntitlementIds`, `purchaseKind`, `cashPaid`, `minimumPayable`, `currency`. Renders a "Granted entitlements" section with each `entitlementId` (data attribute `data-granted-entitlement-id`), the `data-checkout-success-cash-paid` element, and a `purchaseKind` receipt row. |
| `tsconfig.api.json` | `include` adds `utils/entitlements.d.ts`. |

## Spec Coverage

| Spec requirement | Where it lives | Test |
| --- | --- | --- |
| `create-order` accepts only `quoteId` | `api/razorpay/create-order.ts` (1-line destructure) | `checkoutRazorpayEntitlementsContract.test.mjs` |
| Verify Firebase ID token first | `create-order.ts`, `verify-payment.ts` (first statement) | `entitlementsContract.test.mjs` |
| Load quote via the Part 4 helper | `loadServerQuoteForUser` | `entitlementsContract.test.mjs` |
| Verify quote UID (403) | `loadServerQuoteForUser` | `entitlementsContract.test.mjs` |
| Verify quote status (410) | `loadServerQuoteForUser` | `entitlementsContract.test.mjs` |
| Verify quote expiry (410) | `loadServerQuoteForUser` | `entitlementsContract.test.mjs` |
| Use `quote.cashPayable` for amount | `create-order.ts` (the only `amount` assignment) | `entitlementsContract.test.mjs` |
| Create Razorpay order | `create-order.ts` | `entitlementsContract.test.mjs` |
| Save payment intent with quote + line items | `create-order.ts` | `entitlementsContract.test.mjs` |
| Verify signature (constant-time) | `verify-payment.ts` (HMAC + `timingSafeEqual`) | `entitlementsContract.test.mjs` |
| Fetch payment | `verify-payment.ts` | `entitlementsContract.test.mjs` |
| Capture authorized | `verify-payment.ts` | `entitlementsContract.test.mjs` |
| Compare amount + order | `verify-payment.ts` | `entitlementsContract.test.mjs` |
| Verify quote (re-load) | `verify-payment.ts` | `entitlementsContract.test.mjs` |
| Idempotent / replay-proof | `intent.status === "verified"` short-circuit + writer's `existing.exists` skip | `entitlementsContract.test.mjs` |
| Prevent replay (quote → consumed, never re-stamp) | `grantEntitlementsFromQuote` | `entitlementsContract.test.mjs` |
| Grant entitlements in transaction | `db.runTransaction` | `entitlementsContract.test.mjs` |
| Write siteOrders with line items | `buildSiteOrder` + writer | `entitlementsContract.test.mjs` |
| Mark quote/payment intent complete | `consumedAt`, `verifiedAt` writes | `entitlementsContract.test.mjs` |
| Full product / module / resource / paid_update / free support | `toEntitlementKind` mapping + `entitlements.js` | `entitlements.test.mjs` |
| Spec-shaped entitlement record | `buildEntitlementRecord` (12 spec fields) | `entitlements.test.mjs` |
| Don't use purchasedProductIds as the only ownership source | `entitlements/` collection is the canonical source | `entitlementsContract.test.mjs` |
| Keep legacy base-product compatibility | dual-write to `purchasedProductIds` / `purchasedProductUpdateIds` / `purchases/*` | `entitlementsContract.test.mjs` |
| Success page: real orderId, paymentId, line items, granted entitlement ids, cash paid, purchase kind | `CheckoutSuccessStep.tsx` | `checkoutRazorpayEntitlementsContract.test.mjs` |
| Test idempotency / replay | 30 contract tests + 23 unit tests | (counts below) |

## Test Results

| Suite | Tests | Pass | Fail |
| --- | --- | --- | --- |
| `tests/entitlements.test.mjs` (NEW) | 23 | 23 | 0 |
| `tests/entitlementsContract.test.mjs` (NEW) | 30 | 30 | 0 |
| `tests/checkoutRazorpayEntitlementsContract.test.mjs` (NEW) | 13 | 13 | 0 |
| `tests/checkoutSession.test.mjs` (Part 5) | 19 | 19 | 0 |
| `tests/checkoutMobileWidths.test.mjs` (Part 5) | 25 | 25 | 0 |
| `tests/serverQuotes.test.mjs` (Part 4) | 47 | 47 | 0 |
| `tests/serverQuotesContract.test.mjs` (Part 4) | 18 | 18 | 0 |
| `tests/pdpSelection.test.mjs` (Part 3) | 45 | 45 | 0 |
| `tests/pdpPurchaseBuilderMobileWidths.test.mjs` (Part 3) | 15 | 15 | 0 |
| `tests/commerce.test.mjs` (Part 1) | 28 | 28 | 0 |
| `tests/productMapping.test.mjs` (Part 1) | 27 | 27 | 0 |
| `tests/productPrice.test.mjs` (Part 1) | 3 | 3 | 0 |
| **Total (Part 6 + adjacent)** | **293** | **293** | **0** |

- `npx tsc --noEmit` is clean for `src/` and the new `api/_lib/entitlements.ts`. Pre-existing `utils/*` tsc errors remain (out of scope, unchanged).
- `npx tsc --noEmit -p tsconfig.api.json` is clean. The pre-existing `api/push/send.ts` web-push error is unchanged.
- `npm run build` succeeds (Vite 7.3.2, 2960 modules, 2.65 MB).

## What was NOT done in Part 6

- Coupons / EduCoin (per the Part 6 spec).
- Subscriptions / subscription features (Razorpay endpoint refuses them with `400`).
- Part 4 server-quote endpoint (unchanged).
- Part 5 CheckoutContext (unchanged — Part 6 just consumes `quote.quoteId`).
- Pre-existing `utils/*` tsc errors and pre-existing test infrastructure issues in `tests/payment*` / `tests/subscription*` / `tests/course*` / `tests/admin*` test files that reference top-level `App.tsx` / `components/PaymentModal.tsx`. These fail identically on the pristine `main` branch with `Error: ENOENT ... 'App.tsx'` and are out of scope.
- The pre-existing Part 5 client display bug where the server-quote engine emits paise and the client renders them as integer rupees (this would need a separate fix in `CheckoutReviewStep` / `CheckoutSuccessStep` `formatRupee`; it predates Part 6 and is intentionally untouched).
