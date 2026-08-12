// api/quotes/create.ts
//
// Server-authoritative price-quote endpoint. The client posts a
// canonical `CheckoutSelection` (Part 1 + Part 3 type) and an optional
// `idempotencyKey`. The server:
//
//   1. verifies the Firebase ID token,
//   2. refuses untrusted fields (finalPrice, subtotal, discount,
//      entitlementStatus),
//   3. loads the referenced products and the user's purchase / update
//      entitlements from Firestore,
//   4. runs the pure `buildQuote` engine to compute the verified line
//      items + totals (never trusting a client price),
//   5. stores the quote in the server-only `_serverQuotes` collection,
//   6. returns the canonical `ServerPriceQuote` (id, line items, totals,
//      expiresAt, status).
//
// Quote creation is idempotent on `(uid, idempotencyKey)` when the key
// is supplied: a matching active quote is returned as-is.

import { handleCreateQuote } from "../_lib/quotes";
import type { VercelRequest, VercelResponse } from "../_lib/firebaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleCreateQuote(req, res);
}
