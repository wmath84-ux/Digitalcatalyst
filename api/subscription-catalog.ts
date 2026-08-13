// api/subscription-catalog.ts
//
// Part 9 — GET endpoint that returns the full subscription
// catalog (active plans + features + product/module unlock
// mappings). The endpoint is intentionally public so the
// `SubscriptionPage` can load the catalog without requiring
// the user to be signed in (the buyer is asked to sign in
// when they actually subscribe). When the user IS signed in,
// the Firebase ID token is verified for logging / abuse
// prevention but is not required for read access.

import {
  errorResponse,
  requireFirebaseUser,
  type VercelRequest,
  type VercelResponse,
} from "./_lib/firebaseAdmin.js";
import {
  loadActiveFeatures,
  loadActivePlans,
  loadPlanModuleUnlocks,
  loadPlanProductUnlocks,
} from "./_lib/subscriptions.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    // Auth is optional — we still verify the token if it's
    // present so a logged-in buyer gets the same plan list.
    try {
      await requireFirebaseUser(req);
    } catch {
      // ignore — public read is allowed.
    }
    const [plans, features] = await Promise.all([
      loadActivePlans(),
      loadActiveFeatures(),
    ]);
    const productUnlocks: Array<{ planId: string; productId: string; active: boolean }> = [];
    const moduleUnlocks: Array<{ planId: string; productId: string; moduleId: string; active: boolean }> = [];
    for (const plan of plans) {
      const [pl, ml] = await Promise.all([
        loadPlanProductUnlocks(plan.id),
        loadPlanModuleUnlocks(plan.id),
      ]);
      productUnlocks.push(...pl);
      moduleUnlocks.push(...ml);
    }
    return res.status(200).json({
      ok: true,
      catalog: {
        plans,
        features,
        productUnlocks,
        moduleUnlocks,
        loadedAt: Date.now(),
      },
    });
  } catch (error) {
    return errorResponse(res, error, "Could not load subscription catalog.");
  }
}
