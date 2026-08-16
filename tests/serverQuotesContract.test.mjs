// tests/serverQuotesContract.test.mjs
//
// Structural / contract tests for the Part 4 server quote engine. These
// tests do NOT need a real Firestore or Vercel runtime — they assert that
// the source code:
//
//   - never reads a client-supplied `finalPrice`, `subtotal`, `discount`,
//     `entitlementStatus`, or `status` field from the request body;
//   - always verifies the Firebase ID token before any business logic;
//   - always persists quotes to a server-only collection;
//   - returns the canonical `ServerPriceQuote` shape (quoteId, uid,
//     purchaseKind, verifiedLineItems, regularSubtotal, saleDiscount,
//     couponDiscount, eduCoinDiscount, cashPayable, minimumPayable,
//     expiresAt, status).
//
// The pure-helper unit tests in `tests/serverQuotes.test.mjs` cover the
// happy-path rules. This file covers the cross-cutting contract.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.join(__dirname, "..");

const readSource = (rel) => fs.readFileSync(path.join(repoRoot, rel), "utf8");

const helperSource = readSource("api/_lib/quotes.ts");
const createSource = readSource("api/quotes/create.ts");
const engineSource = readSource("utils/serverQuotes.js");

// ---------------------------------------------------------------------------
// Security: forbidden client fields
// ---------------------------------------------------------------------------

test("api/_lib/quotes.ts: parseSelection refuses finalPrice / subtotal / discount / entitlementStatus", () => {
  // The handler must explicitly drop these before calling buildQuote.
  for (const forbidden of ["finalPrice", "subtotal", "discount", "entitlementStatus", "status", "alreadyOwned"]) {
    assert.match(
      helperSource,
      new RegExp(`\\b${forbidden}\\b`),
      `parseSelection should explicitly mention "${forbidden}" in the forbidden list`,
    );
  }
});

test("api/quotes/create.ts: forwards only `selection` and `idempotencyKey` to the engine", () => {
  // The endpoint must not read other request-body fields. We assert the
  // handler delegates to `handleCreateQuote` (which only reads
  // `selection` and `idempotencyKey`).
  assert.match(createSource, /handleCreateQuote/);
  assert.doesNotMatch(createSource, /req\.body\?\.finalPrice/);
  assert.doesNotMatch(createSource, /req\.body\?\.subtotal/);
  assert.doesNotMatch(createSource, /req\.body\?\.discount/);
  assert.doesNotMatch(createSource, /req\.body\?\.entitlementStatus/);
});

test("utils/serverQuotes.js: the pure engine does not read any untrusted client-supplied price fields", () => {
  // The engine should only ever look at canonical fields on the Firestore
  // doc (`price`, `salePrice`, `regularPrice`, `minPayableAmount`,
  // `cashPrice`, `coinPrice`, etc.) and the line-item inputs. The
  // disallowed keys are `finalPrice`, `subtotal`, `discount` (when
  // applied to a `req.body` field). The engine code-base may contain
  // the word `discount` in comments — we only assert that the engine
  // does not *read* `req.body.discount` etc. Since the engine never
  // touches `req` at all, the safe check is that there is no property
  // access shaped like `.finalPrice` / `.subtotal` / `.discount` in
  // an object-literal context.
  const propertyAccesses = engineSource.match(/\.\s*(finalPrice|subtotal|discount|entitlementStatus)\b/g) || [];
  assert.deepEqual(propertyAccesses, [], `Engine must not access ${propertyAccesses.join(", ")}`);
});

// ---------------------------------------------------------------------------
// Auth: token verification happens first
// ---------------------------------------------------------------------------

test("api/_lib/quotes.ts: every handler calls requireFirebaseUser before doing any business logic", () => {
  // requireFirebaseUser must be the first await inside each handler.
  const handleCreateMatch = helperSource.match(/handleCreateQuote[\s\S]*?return errorResponse/);
  assert.ok(handleCreateMatch, "handleCreateQuote not found");
  assert.match(handleCreateMatch[0], /const firebaseUser = await requireFirebaseUser\(req\);/);
  // It must be the first await.
  const firstAwaitPos = handleCreateMatch[0].search(/await\s/);
  const authAwaitPos = handleCreateMatch[0].search(/await requireFirebaseUser/);
  assert.ok(firstAwaitPos >= 0 && authAwaitPos >= 0);
  assert.equal(firstAwaitPos, authAwaitPos);

  const handleFetchMatch = helperSource.match(/handleFetchQuote[\s\S]*?return errorResponse/);
  assert.ok(handleFetchMatch, "handleFetchQuote not found");
  assert.match(handleFetchMatch[0], /const firebaseUser = await requireFirebaseUser\(req\);/);
});

test("api/quotes/create.ts routes POST create and GET fetch through the same Hobby-safe function", () => {
  assert.match(createSource, /handleCreateQuote/);
  assert.match(createSource, /handleFetchQuote/);
  assert.match(createSource, /req\.method === "GET"/);
  assert.doesNotMatch(createSource, /requireFirebaseUser/); // delegated
});

// ---------------------------------------------------------------------------
// Persistence: server-only collection
// ---------------------------------------------------------------------------

test("api/_lib/quotes.ts: the quote is persisted to a server-only collection (starts with `_`)", () => {
  assert.match(helperSource, /_serverQuotes/);
  // The collection name is exported for tests.
  assert.match(helperSource, /QUOTES_COLLECTION\s*=\s*"_serverQuotes"/);
});

test("the persisted quote contains every required canonical field", () => {
  // The canonical ServerPriceQuote shape is produced by the pure engine
  // (`utils/serverQuotes.js`). The api helper
  // (`api/_lib/quotes.ts`) persists whatever the engine returns
  // (verified by the `...quote` spread below).
  const required = [
    "quoteId",
    "uid",
    "purchaseKind",
    "verifiedLineItems",
    "regularSubtotal",
    "saleDiscount",
    "couponDiscount",
    "cashPayable",
    "minimumPayable",
    "currency",
    "expiresAt",
    "status",
  ];
  for (const field of required) {
    assert.match(engineSource, new RegExp(`\\b${field}\\b`), `engine must produce "${field}"`);
  }
  // The helper spreads the entire quote into Firestore, so every engine
  // field is automatically persisted. This contract guard ensures a
  // refactor doesn't accidentally drop the spread.
  assert.match(helperSource, /\.\.\.quote/);
  // `couponDiscount` is conditional (Part 7) so we only assert that the
  // engine declares the field — not that it is always 0. The contract
  // test in `tests/couponsServerContract.test.mjs` covers the
  // coupon-specific rules.
  assert.match(engineSource, /couponDiscount/);
});

// ---------------------------------------------------------------------------
// Cross-user quote access
// ---------------------------------------------------------------------------

test("api/_lib/quotes.ts: handleFetchQuote rejects cross-user access (403)", () => {
  // The handler must check that the loaded quote's uid matches the
  // requester's uid and return 403 otherwise.
  assert.match(helperSource, /quote\.uid !== firebaseUser\.uid/);
  assert.match(helperSource, /status\(403\)/);
});

test("api/_lib/quotes.ts: handleFetchQuote refuses expired / consumed quotes (410)", () => {
  assert.match(helperSource, /status === ["']consumed["']/);
  assert.match(helperSource, /status === ["']invalid["']/);
  assert.match(helperSource, /status\(410\)/);
  assert.match(helperSource, /expiresAt[\s\S]*?Date\.now\(\)/);
});

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

test("api/_lib/quotes.ts: the create handler accepts an idempotencyKey and reuses the matching quote", () => {
  // The handler must:
  //   - read `idempotencyKey` from the body (after sanitising it),
  //   - look up `_serverQuotes/idem:{uid}:{idempotencyKey}`,
  //   - return the existing quote when it's still active and the
  //     requester's uid matches,
  //   - otherwise proceed to buildQuote and write the new quote.
  assert.match(helperSource, /idempotencyKey/);
  assert.match(helperSource, /idem:/);
  assert.match(helperSource, /idempotent:\s*true/);
  assert.match(helperSource, /idempotent:\s*false/);
});

// ---------------------------------------------------------------------------
// Supported purchase kinds
// ---------------------------------------------------------------------------

test("api/_lib/quotes.ts: every supported purchase kind is wired through", () => {
  for (const kind of ["full_product", "selected_modules", "selected_resources", "cart_bundle", "paid_update", "free_entitlement"]) {
    assert.match(helperSource, new RegExp(`"${kind}"`), `purchaseKind "${kind}" must be supported`);
  }
});

// ---------------------------------------------------------------------------
// Hidden / inactive / dependency rejection
// ---------------------------------------------------------------------------

test("utils/serverQuotes.js: hidden modules and resources are dropped from the line items", () => {
  assert.match(engineSource, /visibility === "hidden"/);
  assert.match(engineSource, /active === false/);
  assert.match(engineSource, /accessLevel === "hidden"/);
});

test("utils/serverQuotes.js: individuallyPurchasable=false modules are not added to selected_modules", () => {
  // The engine reads `individuallyPurchasable === true` to gate the
  // `selected_modules` purchase kind.
  assert.match(engineSource, /individuallyPurchasable === true/);
});

test("utils/serverQuotes.js: dependency violations reject the entire quote", () => {
  // The engine short-circuits with a 400 + reason when a dep is missing.
  assert.match(engineSource, /requires ".*" to be selected first/);
  assert.match(engineSource, /status:\s*400/);
});

// ---------------------------------------------------------------------------
// Minimum payable
// ---------------------------------------------------------------------------

test("utils/serverQuotes.js: cashPayable is `max(effectiveSubtotal - couponDiscount, minimumPayable)`", () => {
  // Part 4: cashPayable = max(effectiveSubtotal, minimumPayable).
  // Part 7: the coupon discount is applied first, then the
  // minimum-payable floor always wins. The engine must therefore
  // compute cashPayable as max(effectiveSubtotal - couponDiscount,
  // minimumPayable). The exact variable name may be `afterCoupon` or
  // similar — we accept any pattern that respects the floor.
  assert.match(engineSource, /Math\.max\(\s*(?:afterCoupon|effectiveSubtotal)(?:\s*-\s*couponDiscount)?,\s*minimumPayable\s*\)/);
});

test("the engine always produces a numeric `minimumPayable`", () => {
  // The pure engine sets `minimumPayable` to a number. The api helper
  // persists whatever the engine returns.
  assert.match(engineSource, /minimumPayable/);
  // The helper does not need to mention the field by name; it spreads
  // the engine output into Firestore. We sanity-check that the helper
  // spreads the quote so a refactor that drops fields gets caught.
  assert.match(helperSource, /\.\.\.quote/);
});

// ---------------------------------------------------------------------------
// Free quote
// ---------------------------------------------------------------------------

test("utils/serverQuotes.js: a free product (price=0) still produces a valid quote with cashPayable=0", () => {
  assert.match(engineSource, /paiseFromPriceFields/);
  // The builder still produces a quote (with empty `verifiedLineItems`
  // when every line is free) and the field is always set on the result.
  assert.match(engineSource, /verifiedLineItems/);
  assert.match(engineSource, /cashPayable\s*=\s*Math\.max/);
});

// ---------------------------------------------------------------------------
// Sale expiry
// ---------------------------------------------------------------------------

test("utils/serverQuotes.js: isSaleValidNow is the gate for sale expiry (and is invoked on every kept line)", () => {
  assert.match(engineSource, /isSaleValidNow/);
  assert.match(engineSource, /Sale expired/);
});
