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

import { handleCreateQuote, handleFetchQuote } from "../_lib/quotes.js";
import type { VercelRequest, VercelResponse } from "../_lib/firebaseAdmin.js";
import { applyCors } from "../_lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  // GET keeps quote lookup on this same function so the Hobby plan
  // stays within Vercel's 12-function limit (fetch used to be a
  // separate serverless entry).
  if (req.method === "GET") return handleFetchQuote(req, res);
  return handleCreateQuote(req, res);
}
