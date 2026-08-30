// api/_lib/subscriptionGateServer.ts
//
// HTTP handler for the public read endpoint at `/api/subscription-gate`.
// Shares the deployment with the other rewrites in
// `api/referral-leaderboard.ts` so we stay within the Hobby plan's
// 12-function limit.
//
// Auth: read access is PUBLIC. Admin writes go through
// `/api/admin/subscriptions/gate` in `src/lib/admin/client.ts`, which
// uses the same admin-only server helper and is gated by the standard
// admin auth check.

import { errorResponse, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import { getSubscriptionGateSettings } from "./subscriptionGate.js";

export async function handleSubscriptionGate(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }
  try {
    const settings = await getSubscriptionGateSettings();
    res.status(200).json({ ok: true, settings });
  } catch (error) {
    errorResponse(res, error, "Could not load subscription gate settings.");
  }
}
