import { pushConfigured } from "./pushNotify.js";
import { fcmConfigured } from "./fcm.js";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import { mailConfigured } from "./userQueries.js";
import { normalizeUserPreferences, notificationPolicy, publicLearningSummary, publicProfileIdentity, validatePreferencePatch } from "../../utils/userPreferences.js";

/** Authenticated account settings live in the existing shared function. The UID
 * comes exclusively from the verified token, never from a request body. */
const preferenceRevision = (value: unknown) => {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 && revision < Number.MAX_SAFE_INTEGER ? revision : 0;
};

export async function handleAccountPreferences(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" && req.method !== "PATCH") return res.status(405).json({ ok: false, error: "Use GET to load settings or PATCH to change one setting." });
  try {
    const user = await requireFirebaseUser(req);
    const db = adminDb();
    const ref = db.collection("users").doc(user.uid);
    let data: Record<string, any>;
    if (req.method === "PATCH") {
      let body: any = req.body;
      try { if (typeof body === "string") body = JSON.parse(body); }
      catch { return res.status(400).json({ ok: false, error: "Settings request must contain valid JSON." }); }
      let patch: ReturnType<typeof validatePreferencePatch>;
      try { patch = validatePreferencePatch(body?.preferences); }
      catch (error) { return res.status(400).json({ ok: false, error: (error as Error).message }); }
      data = await db.runTransaction(async (transaction) => {
        const current = (await transaction.get(ref)).data() || {};
        const raw = current.preferences;
        const malformed = raw !== null && raw !== undefined && (typeof raw !== "object" || Array.isArray(raw) || (Object.getPrototypeOf(raw) !== Object.prototype && Object.getPrototypeOf(raw) !== null));
        const recovered = malformed ? normalizeUserPreferences(raw) : {};
        const preferences = { ...(malformed ? recovered : current.preferences || {}), [patch.key]: patch.value,
          ...(patch.key === "shareActivity" && patch.value ? { activityConsentVersion: 1 } : {}) };
        const revision = preferenceRevision(current.preferencesRevision) + 1;
        const updatedAt = Timestamp.now();
        transaction.set(ref, { preferences: { ...recovered, [patch.key]: patch.value,
          ...(patch.key === "shareActivity" && patch.value ? { activityConsentVersion: 1 } : {}) },
          preferencesRevision: revision, preferencesUpdatedAt: updatedAt, updatedAt }, { merge: true });
        return { ...current, preferences, preferencesRevision: revision };
      });
      // Old public-cache fallback data is never trusted without fresh privacy
      // verification, but also remove it proactively on a privacy change.
      if (patch.key === "profileVisible" || patch.key === "shareActivity") {
        await db.collection("publicLeaderboard").doc("referrals").delete().catch((error) => {
          console.warn("[settings] public cache invalidation deferred", error);
        });
      }
    } else data = (await ref.get()).data() || {};
    return res.status(200).json({ ok: true, preferences: normalizeUserPreferences(data.preferences),
      revision: preferenceRevision(data.preferencesRevision), capabilities: { emailConfigured: mailConfigured(), webPushConfigured: pushConfigured(), fcmConfigured: fcmConfigured() } });
  } catch (error) {
    return errorResponse(res, error, "Could not load or save your account settings.");
  }
}

/** Explicit public projection. No stale fallback and no private user document
 * returned. Hiding a profile takes effect at the very next request. */
export async function handlePublicProfile(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Use GET to view a public profile." });
  const rawUid = req.query?.uid;
  const uid = String(Array.isArray(rawUid) ? rawUid[0] : rawUid || "");
  if (!uid || uid.length > 128 || /[\/.\x00-\x1f]/.test(uid)) return res.status(400).json({ ok: false, error: "Choose a valid learner profile." });
  try {
    const db = adminDb();
    const ref = db.collection("users").doc(uid);
    const snapshot = await ref.get();
    const data = snapshot.data() || {};
    const profile = snapshot.exists ? publicProfileIdentity(uid, data) : null;
    if (!profile) return res.status(404).json({ ok: false, error: "This learner's profile is private or unavailable." });
    const policy = notificationPolicy(data.preferences);
    // Count private progress only after versioned sharing consent. Names,
    // purchases, notes and resource ids never leave this endpoint.
    const activity = policy.publicActivity
      ? publicLearningSummary((await ref.collection("courseProgress").get()).docs.map((doc) => doc.data()))
      : null;
    return res.status(200).json({ ok: true, profile, activity });
  } catch (error) {
    return errorResponse(res, error, "This public profile could not be loaded. Please retry.");
  }
}
