import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "../_lib/firebaseAdmin.js";

const clean = (value: unknown, max: number) => String(value || "").trim().slice(0, max);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const user = await requireFirebaseUser(req);
    const body = (req.body || {}) as Record<string, unknown>;
    const productId = clean(body.productId, 120);
    const comment = clean(body.comment, 2000);
    const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating || 0))));
    if (!productId) return res.status(400).json({ ok: false, error: "Product is required." });
    if (comment.length < 10) return res.status(400).json({ ok: false, error: "Please write at least 10 characters." });
    const ref = await adminDb().collection("siteReviews").add({
      productId,
      productTitle: clean(body.productTitle, 200),
      customerId: user.uid,
      userId: user.uid,
      uid: user.uid,
      customerName: clean(body.customerName, 80) || user.name || "Learner",
      rating,
      comment,
      verifiedPurchase: Boolean(body.verifiedPurchase),
      status: "pending",
      createdAt: Date.now(),
      source: "api",
    });
    return res.status(200).json({ ok: true, id: ref.id });
  } catch (error) {
    return errorResponse(res, error, "Could not save review.");
  }
}
