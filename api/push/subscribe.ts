import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "../_lib/firebaseAdmin";

const clean = (value: unknown, max: number) => String(value || "").trim().slice(0, max);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, code: "method_not_allowed", error: "Method not allowed" });
  try {
    const user = await requireFirebaseUser(req);
    const body = (req.body || {}) as Record<string, unknown>;
    const endpoint = clean(body.endpoint, 2000);
    const p256dh = clean(body.p256dh, 500);
    const auth = clean(body.auth, 200);
    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ ok: false, code: "invalid_subscription", error: "Push subscription keys are incomplete." });
    }
    const now = Date.now();
    const documentId = hashString(endpoint);
    await adminDb().collection("users").doc(user.uid).collection("webPushSubscriptions").doc(documentId).set({
      uid: user.uid,
      endpoint,
      p256dh,
      auth,
      platform: clean(body.platform, 40) || "unknown",
      userAgent: clean(body.userAgent, 200),
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    }, { merge: true });
    return res.status(200).json({ ok: true, id: documentId });
  } catch (error) {
    return errorResponse(res, error, "Could not save push subscription.");
  }
}

const hashString = (value: string) => {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};
