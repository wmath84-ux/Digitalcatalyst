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
  getSubscriptionGateSettings,
  isPlanVisibleForAudience,
} from "./_lib/subscriptionGate.js";
import { isOwnedSubscriptionActive } from "../../utils/subscriptionOwnership.js";
import {
  loadActiveFeatures,
  loadActivePlans,
  loadCurrentSubscription,
  loadPlanModuleUnlocks,
  loadPlanProductUnlocks,
  loadSubscriptionProducts,
  repairSubscriptionFeatures,
} from "./_lib/subscriptions.js";
import { applyCors } from "./_lib/cors.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET" && req.method !== "OPTIONS") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    // Auth is optional — we still verify the token if it's
    // present so a logged-in buyer gets a catalog filtered for
    // their subscriber vs guest audience.
    let uid = "";
    try {
      const user = await requireFirebaseUser(req);
      uid = String(user?.uid || "");
      // Self-heal a membership whose stored feature list is missing
      // plan-included features before we answer (best-effort).
      try { if (uid) await repairSubscriptionFeatures(uid); } catch { /* read-only endpoint */ }
    } catch {
      // ignore — public read is allowed.
    }
    const [plans, features, subProducts, gateSettings, currentSub] = await Promise.all([
      loadActivePlans(),
      loadActiveFeatures(),
      loadSubscriptionProducts(),
      getSubscriptionGateSettings(),
      uid ? loadCurrentSubscription(uid) : Promise.resolve(null),
    ]);
    const isSubscriber = Boolean(currentSub && isOwnedSubscriptionActive(currentSub, Date.now()));
    const ownedPlanId = isSubscriber ? String(currentSub?.planId || "") : "";
    const visiblePlans = plans.filter((plan) =>
      isPlanVisibleForAudience(plan.id, isSubscriber, gateSettings, { ownedPlanId }),
    );
    const productUnlocks: Array<{ planId: string; productId: string; active: boolean }> = [];
    const moduleUnlocks: Array<{ planId: string; productId: string; moduleId: string; active: boolean }> = [];
    for (const plan of visiblePlans) {
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
        plans: visiblePlans,
        features,
        subscriptionProducts: subProducts || [],
        productUnlocks,
        moduleUnlocks,
        loadedAt: Date.now(),
      },
    });
  } catch (error) {
    return errorResponse(res, error, "Could not load subscription catalog.");
  }
}
