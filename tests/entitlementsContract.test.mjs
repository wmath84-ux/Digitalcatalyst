// tests/entitlementsContract.test.mjs
//
// Part 6 — structural / contract tests for the Razorpay endpoints
// + the canonical entitlement writer. These are SOURCE-level tests
// (no live Firestore / no Vercel runtime). They assert that:
//
//   - `api/razorpay/create-order.ts` accepts only `{ quoteId }` and
//     never reads `productId` / `productIds` / `updateSelection` from
//     the request body;
//   - the same handler loads the quote via `loadServerQuoteForUser`
//     and rejects cross-uid / expired / consumed quotes;
//   - the same handler uses `quote.cashPayable` for the Razorpay
//     amount and never falls back to client-supplied prices;
//   - `api/razorpay/verify-payment.ts` calls
//     `grantEntitlementsFromQuote` exactly once and is idempotent on
//     replay (`status === "verified"` short-circuits);
//   - `api/_lib/entitlements.ts` writes the canonical
//     `entitlements/{uid}__{entitlementId}` collection AND the
//     legacy `purchasedProductIds` / `purchasedProductUpdateIds`
//     fields inside one transaction.
//
// The pure-helper unit tests in `tests/entitlements.test.mjs` cover
// the entitlement engine. This file covers the cross-cutting
// contract that the Part 6 spec calls out (idempotency, replay,
// dual-write, etc.).

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");
/**
 * Strip JS/TS line + block comments while preserving `https://` /
 * `http://` URLs (which the `//` regex would otherwise devour).
 * The naive `s.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")` pattern
 * eats the `//` inside `https://...` URLs and leaves the rest of
 * the URL intact but with the `//` removed — e.g.
 * `https://api.razorpay.com/...` becomes `https:api.razorpay.com/...`.
 * We temporarily mask the URLs before stripping, then put them
 * back character-for-character so the assertion substrings survive.
 */
const stripComments = (s) => {
  const urls = [];
  const masked = s.replace(/https?:\/\/[^\s"'`)]+/g, (url) => {
    const token = `__URL_${urls.length}__`;
    urls.push(url);
    return token;
  });
  const stripped = masked.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  return stripped.replace(/__URL_(\d+)__/g, (_m, i) => urls[Number(i)] || "");
};

const createOrder = readSource("api/razorpay/create-order.ts");
const verifyPayment = readSource("api/razorpay/verify-payment.ts");
const entitlements = readSource("api/_lib/entitlements.ts");
const quotes = readSource("api/_lib/quotes.ts");
const entitlementsUtil = readSource("utils/entitlements.js");
const entitlementsUtilDts = readSource("utils/entitlements.d.ts");
const createOrderCode = stripComments(createOrder);
const verifyCode = stripComments(verifyPayment);
const entitlementsCode = stripComments(entitlements);
const quotesCode = stripComments(quotes);

// ---------------------------------------------------------------------------
// create-order.ts — quoteId-only contract
// ---------------------------------------------------------------------------

test("create-order accepts only `quoteId` and ignores client-supplied product ids", () => {
  // The endpoint must not even read req.body.productId / productIds /
  // updateSelection — Part 6 spec: "Create-order must accept quoteId only."
  assert.doesNotMatch(createOrderCode, /req\.body\?\.productId|req\.body\.productId/);
  assert.doesNotMatch(createOrderCode, /req\.body\?\.productIds|req\.body\.productIds/);
  assert.doesNotMatch(createOrderCode, /updateSelection/);

  // It must read the quoteId and only the quoteId.
  assert.match(createOrderCode, /quoteId/);
});

test("create-order always verifies the Firebase ID token first", () => {
  // `requireFirebaseUser` must be called before any Razorpay work.
  const tokenIdx = createOrderCode.indexOf("requireFirebaseUser");
  const razorpayIdx = createOrderCode.indexOf("api.razorpay.com");
  assert.ok(tokenIdx > -1, "create-order must call requireFirebaseUser");
  assert.ok(razorpayIdx > -1, "create-order must call the Razorpay API");
  assert.ok(tokenIdx < razorpayIdx, "requireFirebaseUser must run before the Razorpay call");
});

test("create-order loads the quote via the Part 4 loadServerQuoteForUser helper", () => {
  assert.match(createOrderCode, /loadServerQuoteForUser/);
});

test("create-order uses quote.cashPayable for the Razorpay amount (never client-supplied)", () => {
  // The amount must come from `quote.cashPayable`, not the request body.
  assert.match(createOrderCode, /quote\.cashPayable|loaded\.quote\.cashPayable/);
  // The amount sent to Razorpay must reference the quote (not the body).
  assert.match(createOrderCode, /amount:\s*amountPaise/);
  // The amountPaise variable must be derived from the quote.
  assert.match(createOrderCode, /Math\.max\(\s*0\s*,\s*Math\.round\(Number\(quote\.cashPayable/);
});

test("create-order saves the payment intent with quote + verified line items", () => {
  assert.match(createOrder, /quoteId/);
  assert.match(createOrder, /verifiedLineItems/);
  assert.match(createOrder, /purchaseKind/);
  assert.match(createOrder, /_paymentIntents/);
});

// ---------------------------------------------------------------------------
// verify-payment.ts — verification + idempotency + replay contract
// ---------------------------------------------------------------------------

test("verify-payment verifies the Razorpay signature before granting access", () => {
  // `crypto.timingSafeEqual` + `crypto.createHmac` is the standard
  // signature check. It must run before the **paid-path** grant
  // call (the free-path grant is allowed to skip signature
  // verification by design).
  const sigIdx = verifyCode.indexOf("timingSafeEqual");
  const lastGrantIdx = verifyCode.lastIndexOf("grantEntitlementsFromQuote");
  assert.ok(sigIdx > -1, "verify-payment must call crypto.timingSafeEqual");
  assert.ok(lastGrantIdx > -1, "verify-payment must call grantEntitlementsFromQuote");
  assert.ok(sigIdx < lastGrantIdx, "signature check must run before the paid-path entitlement grant");
});

test("verify-payment fetches the payment from Razorpay and captures authorized payments", () => {
  assert.match(verifyCode, /\/v1\/payments\/\$\{paymentId\}/);
  assert.match(verifyCode, /\/capture/);
});

test("verify-payment compares amount and order id against the intent", () => {
  // The order_id and amount comparison is the spec requirement.
  assert.match(verifyCode, /payment\.order_id/);
  assert.match(verifyCode, /payment\.amount/);
  assert.match(verifyCode, /Payment order mismatch|Payment amount mismatch/);
});

test("verify-payment is idempotent on replay (intent.status === verified short-circuits)", () => {
  assert.match(verifyCode, /intent\.status === "verified"/);
  assert.match(verifyCode, /alreadyVerified/);
  // The short-circuit must run before the **paid-path** grant call.
  const replayIdx = verifyCode.indexOf('intent.status === "verified"');
  const lastGrantIdx = verifyCode.lastIndexOf("grantEntitlementsFromQuote");
  assert.ok(replayIdx > -1, "must check intent.status === verified");
  assert.ok(lastGrantIdx > -1, "must call grantEntitlementsFromQuote");
  assert.ok(replayIdx < lastGrantIdx, "replay short-circuit must precede the paid-path grant call");
});

test("verify-payment refuses requests where the intent uid does not match the caller", () => {
  assert.match(verifyCode, /intent\.uid !== firebaseUser\.uid/);
  assert.match(verifyCode, /This payment belongs to a different account/);
});

test("verify-payment grants entitlements via the transactional writer", () => {
  assert.match(verifyCode, /grantEntitlementsFromQuote/);
});

test("verify-payment carries the granted entitlement ids back to the caller", () => {
  assert.match(verifyCode, /grantedEntitlementIds/);
});

// ---------------------------------------------------------------------------
// _lib/quotes.ts — loadServerQuoteForUser contract
// ---------------------------------------------------------------------------

test("loadServerQuoteForUser rejects cross-uid quote lookups (403)", () => {
  assert.match(quotesCode, /loadServerQuoteForUser/);
  assert.match(quotesCode, /quote\.uid !== uid/);
  assert.match(quotesCode, /This quote belongs to a different account/);
});

test("loadServerQuoteForUser rejects consumed and invalid quotes (410)", () => {
  assert.match(quotesCode, /quote\.status === "consumed"/);
  assert.match(quotesCode, /quote\.status === "invalid"/);
});

test("loadServerQuoteForUser rejects expired quotes (410)", () => {
  assert.match(quotesCode, /quote\.expiresAt.*now/);
});

// ---------------------------------------------------------------------------
// _lib/entitlements.ts — transactional grant + dual-write contract
// ---------------------------------------------------------------------------

test("grantEntitlementsFromQuote runs inside a Firestore transaction", () => {
  assert.match(entitlementsCode, /db\.runTransaction/);
});

test("grantEntitlementsFromQuote writes the canonical entitlements collection", () => {
  assert.match(entitlementsCode, /ENTITLEMENTS_COLLECTION\s*=\s*"entitlements"/);
  assert.match(entitlementsCode, /collection\(ENTITLEMENTS_COLLECTION\)/);
  assert.match(entitlementsCode, /buildEntitlementDocId/);
});

test("grantEntitlementsFromQuote writes a doc for every Part 6 entitlement kind", () => {
  assert.match(entitlementsCode, /full_product/);
  assert.match(entitlementsCode, /paid_update/);
  assert.match(entitlementsCode, /module/);
  assert.match(entitlementsCode, /resource/);
  assert.match(entitlementsCode, /"free"/);
});

test("grantEntitlementsFromQuote dual-writes to legacy purchasedProductIds", () => {
  // The user doc's `purchasedProductIds` array must still get every
  // full_product line (PDP / Course Player readers depend on it).
  assert.match(entitlementsCode, /purchasedProductIds/);
  assert.match(entitlementsCode, /FieldValue\.arrayUnion/);
});

test("grantEntitlementsFromQuote dual-writes to legacy purchasedProductUpdateIds map", () => {
  // The user doc's `purchasedProductUpdateIds[productId]` map must
  // still get every paid_update line.
  assert.match(entitlementsCode, /purchasedProductUpdateIds/);
});

test("grantEntitlementsFromQuote writes the users/{uid}/purchases/{productId} legacy doc", () => {
  // base-product purchases write to the legacy `purchases` subcollection
  // so the existing PDP entitlement reads keep working.
  assert.match(entitlementsCode, /PURCHASES_SUBCOLLECTION\s*=\s*"purchases"/);
  assert.match(entitlementsCode, /userRef\.collection\(PURCHASES_SUBCOLLECTION\)/);
});

test("grantEntitlementsFromQuote writes the paid_update legacy doc", () => {
  assert.match(entitlementsCode, /__update__/);
});

test("grantEntitlementsFromQuote writes the siteOrders/{orderId} receipt", () => {
  assert.match(entitlementsCode, /ORDERS_COLLECTION\s*=\s*"siteOrders"/);
  assert.match(entitlementsCode, /collection\(ORDERS_COLLECTION\)\.doc\(orderId\)/);
  assert.match(entitlementsCode, /buildSiteOrder/);
});

test("grantEntitlementsFromQuote marks the quote as consumed inside the transaction", () => {
  // The spec: "Mark quote/payment intent complete."
  assert.match(entitlementsCode, /status:\s*"consumed"/);
  assert.match(entitlementsCode, /consumedAt/);
  assert.match(entitlementsCode, /consumedOrderId/);
});

test("grantEntitlementsFromQuote marks the payment intent as verified", () => {
  assert.match(entitlementsCode, /status:\s*"verified"/);
  assert.match(entitlementsCode, /PAYMENT_INTENTS_COLLECTION\s*=\s*"_paymentIntents"/);
});

test("grantEntitlementsFromQuote is idempotent — skips existing entitlement docs", () => {
  // The writer must read each entitlement doc and skip the ones that
  // already exist, rather than overwriting them. Match the behaviour,
  // not one particular variable name: this previously pinned a literal
  // `existing.exists`, so renaming the snapshot to `entitlementSnaps`
  // failed the test while the guarantee was completely intact.
  const codeOnly = stripComments(entitlements);
  const skipExisting = /if\s*\(\s*[A-Za-z_$][\w$]*(?:\[[^\]]+\])?\.exists\s*\)\s*continue\s*;?/;
  assert.match(codeOnly, skipExisting, "an existing entitlement doc must be skipped, not rewritten");
  // The skip has to apply to the entitlement docs specifically.
  assert.match(codeOnly, /entitlementSnaps\[index\]\.exists\s*\)\s*continue/);
  // ...and to the legacy dual-write, or a replay would duplicate those.
  assert.match(codeOnly, /legacyPurchaseSnaps\[index\]\.exists\s*\)\s*continue/);
});

test("grantEntitlementsFromQuote never re-stamps consumedAt on replay", () => {
  // The spec: "Be idempotent. Prevent replay." A quote may only move
  // active → consumed; an already-consumed quote must keep its original
  // consumedAt. The transition is expressed as a guard on the CURRENT
  // status, so assert that guard rather than a fixed string.
  const codeOnly = stripComments(entitlements);
  assert.match(codeOnly, /status:\s*"consumed"/, "the quote must be marked consumed");
  assert.match(
    codeOnly,
    /current\.status === "active"/,
    "the consumed stamp must be gated on the quote still being active",
  );
  assert.match(codeOnly, /consumedAt:\s*nowTs/);
});

// ---------------------------------------------------------------------------
// utils/entitlements.js — pure helper contract
// ---------------------------------------------------------------------------

test("utils/entitlements.js is pure (no Firestore / no fetch / no Node-only imports)", () => {
  assert.doesNotMatch(entitlementsUtil, /firebase-admin/);
  assert.doesNotMatch(entitlementsUtil, /require\(/);
  assert.doesNotMatch(entitlementsUtil, /process\.env/);
  assert.doesNotMatch(entitlementsUtil, /from "node:/);
});

test("utils/entitlements.js exports the spec-required helpers", () => {
  for (const name of [
    "toEntitlementKind",
    "isGrantableLine",
    "deriveEntitlementId",
    "buildEntitlementDocId",
    "buildEntitlementRecord",
    "collectGrantableEntitlementIds",
    "isQuoteReplayable",
    "isEntitlementActive",
    "partitionGrantable",
    "buildSuccessReceipt",
  ]) {
    assert.match(entitlementsUtil, new RegExp(`export const ${name}`), `missing export ${name}`);
  }
});

test("utils/entitlements.d.ts declares the canonical record shape", () => {
  for (const field of [
    "uid",
    "productId",
    "kind",
    "moduleId",
    "resourceId",
    "updateId",
    "entitlementId",
    "orderId",
    "paymentId",
    "status",
    "amount",
    "source",
    "unlockedAt",
  ]) {
    assert.match(entitlementsUtilDts, new RegExp(`\\b${field}\\b`), `missing field ${field}`);
  }
});
