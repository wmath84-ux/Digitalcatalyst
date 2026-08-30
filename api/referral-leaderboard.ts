import { adminDb, errorResponse, type VercelRequest, type VercelResponse } from "./_lib/firebaseAdmin.js";
import { referralCodeForUid, runReferralRepairOnce } from "./_lib/referrals.js";
import { handleEmbedProxy } from "./_lib/embedProxy.js";
import { handleRevisionGenerate } from "./_lib/revisionGenerate.js";
import { handleRevisionData } from "./_lib/revisionData.js";
import { handleMyDay } from "./_lib/myDay.js";
import { handleFlowPathControl } from "./_lib/flowpathControl.js";
import { handleManifest } from "./_lib/manifest.js";
import { handleBrandIcon } from "./_lib/brandIcon.js";

type SubscriberRow = {
  uid: string;
  name: string;
  photoURL: string | null;
  planId: string;
  referralCode: string;
  usedCount: number;
  available: boolean;
};

type UserRow = {
  uid: string;
  name: string;
  photoURL: string | null;
};

const PUBLIC_COLLECTION = "publicLeaderboard";
const PUBLIC_DOC = "referrals";

const firstNonEmptyString = (...values: unknown[]) => {
  for (const value of values) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text) return text;
  }
  return "";
};

const resolvePhotoURL = (data: Record<string, unknown>) =>
  firstNonEmptyString(data.photoURL, data.avatar, data.profilePhoto, data.profileImage) || null;

const resolveName = (data: Record<string, unknown>, fallback = "Learner") =>
  firstNonEmptyString(data.name, data.displayName, data.username) || fallback;

const toSubscriberRow = async (uid: string, data: Record<string, unknown>): Promise<SubscriberRow> => {
  const db = adminDb();
  const code = String(data.referralCode || referralCodeForUid(uid));
  let usedCount = 0;
  let available = true;
  try {
    const coupon = await db.collection("coupons").doc(code).get();
    usedCount = Math.max(0, Number(coupon.data()?.usedCount || 0));
    available = usedCount < 1 && (!coupon.exists || coupon.data()?.status !== "inactive");
  } catch {
    usedCount = Math.max(0, Number(data.referralUsedCount || 0));
  }
  return {
    uid,
    name: resolveName(data, "Subscriber"),
    photoURL: resolvePhotoURL(data),
    planId: String(data.subscriptionPlanId || data.subscriptionTier || "subscription"),
    referralCode: code,
    usedCount,
    available,
  };
};

const toUserRow = (uid: string, data: Record<string, unknown>): UserRow => ({
  uid,
  name: resolveName(data),
  photoURL: resolvePhotoURL(data),
});

const isSubscriber = (data: Record<string, unknown>) =>
  Boolean(data.subscriptionPlanId || (data.subscriptionTier && data.subscriptionTier !== "basic"));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // PWA manifest + brand icon share this deployed function to stay within the
  // 12-function Hobby cap (see vercel.json rewrites). Dispatch on path first
  // so these never fall through to the leaderboard/embed logic below.
  const reqWithUrl = req as VercelRequest & { url?: string };
  const path = String(reqWithUrl.url || "").split("?")[0].replace(/\/+$/, "");
  if (path === "/api/manifest") {
    return handleManifest(req, res);
  }
  if (path === "/api/brand-icon") {
    return handleBrandIcon(req, res);
  }
  // Course-player GitHub embed proxy. `/api/embed-proxy` rewrites here
  // (see vercel.json) because the Hobby plan caps serverless functions at
  // 12 and the project is already at the limit — the proxy logic lives in
  // the private `_lib/embedProxy` helper so no extra function is deployed.
  if (req.method === "GET" && req.query?.url) {
    return handleEmbedProxy(req, res);
  }
  // Revision APIs share this deployed function to stay within the 12-function
  // Hobby cap. The body action safely dispatches cloud Test Bank writes while
  // the existing generation action keeps its original handler.
  if (req.method === "POST") {
    const rawBody = typeof req.body === "string" ? (() => { try { return JSON.parse(req.body); } catch { return {}; } })() : (req.body || {});
    const action = String(rawBody?.action || "");
    if (action.startsWith("revision.data.")) {
      return handleRevisionData(req, res);
    }
    if (action.startsWith("myday.")) {
      return handleMyDay(req, res);
    }
    if (action.startsWith("flowpath.")) {
      return handleFlowPathControl(req, res);
    }
    // AI generation can run tens of seconds; if anything ever rejects above
    // the handler's own try/catch (e.g. an unexpected Firestore fault), still
    // answer JSON so the client can show a real message instead of parsing a
    // platform error page.
    try {
      return await handleRevisionGenerate(req, res);
    } catch (error) {
      return errorResponse(res, error, "Could not generate questions with AI.");
    }
  }
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const db = adminDb();
    // One-time self-healing: backfill referral usage that predates the
    // single-use fix so used IDs drop out of "Unused IDs" without any
    // manual step. After the first run this is a single doc read.
    try {
      await runReferralRepairOnce();
    } catch (repairError) {
      console.warn("[leaderboard] referral usage repair skipped", repairError);
    }
    type LeaderboardDoc = { id: string; data: () => Record<string, unknown> };
    const recent = await db.collection("users").limit(200).get();
    const allDocs: LeaderboardDoc[] = recent.docs;
    const subscriberDocs = allDocs.filter((doc: LeaderboardDoc) => isSubscriber((doc.data() || {}) as Record<string, unknown>));

    const [subscribers, users] = await Promise.all([
      Promise.all(subscriberDocs.map((doc: LeaderboardDoc) => toSubscriberRow(doc.id, (doc.data() || {}) as Record<string, unknown>))),
      Promise.resolve(allDocs.map((doc: LeaderboardDoc) => toUserRow(doc.id, (doc.data() || {}) as Record<string, unknown>))),
    ]);
    subscribers.sort((a, b) => b.usedCount - a.usedCount || a.name.localeCompare(b.name));
    users.sort((a, b) => a.name.localeCompare(b.name));
    try {
      await db.collection(PUBLIC_COLLECTION).doc(PUBLIC_DOC).set({
        ok: true,
        updatedAt: Date.now(),
        subscribers,
        users,
      });
    } catch (error) {
      console.warn("[leaderboard] public cache write skipped", error);
    }
    return res.status(200).json({ ok: true, subscribers, users });
  } catch (error) {
    try {
      const cached = await adminDb().collection(PUBLIC_COLLECTION).doc(PUBLIC_DOC).get();
      const data = cached.data() || {};
      if (cached.exists && Array.isArray(data.subscribers)) {
        return res.status(200).json({
          ok: true,
          subscribers: data.subscribers,
          users: Array.isArray(data.users) ? data.users : [],
          cached: true,
        });
      }
    } catch {
      // Fall through to the public error.
    }
    return errorResponse(res, error, "Could not open leaderboard.");
  }
}
