// api/quotes/fetch.ts
//
// Fetch a previously-created price quote by `quoteId`. Verifies the
// requester is the owner of the quote (cross-user access returns 403)
// and refuses to return expired or consumed quotes (410 Gone).

import { handleFetchQuote } from "../_lib/quotes";
import type { VercelRequest, VercelResponse } from "../_lib/firebaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleFetchQuote(req, res);
}
