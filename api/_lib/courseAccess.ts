// Server-authoritative fallback for the Course Player / PDP access resolver.
//
// Normal client listeners remain the fast path. If Firestore rules deny a
// learner's own entitlement, purchase, account or subscription read (for
// example while a rules deployment is incomplete), this endpoint verifies the
// same UID from the Firebase ID token and rebuilds the exact same resolution
// with the Admin SDK. No access data is accepted from the request body.

import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import { loadQuoteOwnership } from "./quoteOwnership.js";
import { isFullProductPurchase, ownershipTimestamp } from "../../utils/contentOwnership.js";
import { resolveCourseAccess, isSubscriptionRecordActive, type CourseAccessResolution, type SubscriptionRecordShape } from "../../utils/courseAccess.js";
import { firestoreToCatalogProduct } from "../../utils/productMapping.js";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));

const cleanId = (value: unknown) => {
  if (typeof value !== "string") return "";
  const id = value.trim();
  return id && id.length <= 160 && !/[\/\u0000-\u001f]/.test(id) ? id : "";
};

const toMillis = (value: unknown) => {
  const result = ownershipTimestamp(value);
  return Number.isFinite(result) ? result : 0;
};

async function loadProduct(db: ReturnType<typeof adminDb>, productId: string, documentId: string) {
  const candidates = [...new Set([documentId, productId].filter(Boolean))];
  for (const candidate of candidates) {
    const snapshot = await db.collection("siteProducts").doc(candidate).get();
    if (snapshot.exists) return snapshot;
  }
  if (productId) {
    const matches = await db.collection("siteProducts").where("id", "==", productId).limit(1).get();
    if (matches.docs[0]) return matches.docs[0];
    if (/^\d+$/.test(productId)) {
      const numeric = await db.collection("siteProducts").where("id", "==", Number(productId)).limit(1).get();
      if (numeric.docs[0]) return numeric.docs[0];
    }
  }
  return null;
}

const serialiseResolution = (resolution: CourseAccessResolution) => ({
  hasFullProductAccess: resolution.hasFullProductAccess,
  hasPurchasedFullProduct: resolution.hasPurchasedFullProduct,
  hasSubscriptionProductAccess: resolution.hasSubscriptionProductAccess,
  ownedModuleIds: [...resolution.ownedModuleIds],
  ownedResourceIds: [...resolution.ownedResourceIds],
  ownedUpdateIds: [...resolution.ownedUpdateIds],
  subscriptionGrantedModuleIds: [...resolution.subscriptionGrantedModuleIds],
  accessibleModuleIds: [...resolution.accessibleModuleIds],
  accessibleResourceIds: [...resolution.accessibleResourceIds],
  lockedModuleIds: [...resolution.lockedModuleIds],
  previewModuleIds: [...resolution.previewModuleIds],
  moduleAccessSources: resolution.moduleAccessSources,
  resourceAccessSources: resolution.resourceAccessSources,
  unmetDependencies: resolution.unmetDependencies,
});

const safeSubscription = (raw: Record<string, unknown>, uid: string, now: number): SubscriptionRecordShape | null => {
  if (raw.uid && raw.uid !== uid) return null;
  const record: SubscriptionRecordShape = {
    uid,
    planId: typeof raw.planId === "string" ? raw.planId : undefined,
    cycle: raw.cycle === "yearly" ? "yearly" : "monthly",
    status: typeof raw.status === "string" ? raw.status : undefined,
    expiresAt: toMillis(raw.expiresAt),
    activatedAt: toMillis(raw.activatedAt),
    autoRenew: Boolean(raw.autoRenew),
    includedProductIds: Array.isArray(raw.includedProductIds) ? raw.includedProductIds.map(String) : [],
    includedModuleKeys: Array.isArray(raw.includedModuleKeys) ? raw.includedModuleKeys.map(String) : [],
  };
  return isSubscriptionRecordActive(record, now) ? record : null;
};

export async function handleCourseAccess(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Use POST to verify course access." });
  }

  try {
    const user = await requireFirebaseUser(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!isRecord(body)) return res.status(400).json({ ok: false, error: "Choose a product to verify." });
    const productId = cleanId(body.productId);
    const documentId = cleanId(body.documentId);
    if (!productId && !documentId) return res.status(400).json({ ok: false, error: "Choose a valid product to verify." });

    const db = adminDb();
    const snapshot = await loadProduct(db, productId, documentId);
    if (!snapshot?.exists) return res.status(404).json({ ok: false, error: "This course is no longer available." });
    const raw = snapshot.data() || {};
    const publicId = String(raw.id || snapshot.id);
    if (productId && productId !== snapshot.id && productId !== publicId) {
      return res.status(404).json({ ok: false, error: "This course is no longer available." });
    }

    // Use the same Firestore → Catalog mapping as the client, while retaining
    // canonical trees that were stored directly by newer product writers.
    const mapped = firestoreToCatalogProduct(raw, snapshot.id);
    const product = {
      id: publicId,
      documentId: snapshot.id,
      canonicalModules: Array.isArray(raw.canonicalModules) && raw.canonicalModules.length
        ? raw.canonicalModules
        : mapped?.canonicalModules || [],
      courseContent: Array.isArray(raw.courseContent) ? raw.courseContent : mapped?.courseContent || [],
      paidUpdates: Array.isArray(raw.paidUpdates) && raw.paidUpdates.length
        ? raw.paidUpdates
        : mapped?.paidUpdates || [],
    };
    const quoteProduct = { id: snapshot.id, documentId: snapshot.id, publicId };
    const ownershipByProduct = await loadQuoteOwnership(db, user.uid, new Map([[snapshot.id, quoteProduct as never]]));
    const ownership = ownershipByProduct.get(snapshot.id);
    const purchases = ownership?.purchaseDocs || [];
    const permanent = purchases.filter((record) => record.source !== "subscription");
    const subscription = purchases.filter((record) => record.source === "subscription");
    const ownedProductIds = permanent.filter(isFullProductPurchase)
      .map((record) => String(record.productDocumentId || record.productId || snapshot.id));
    const ownedModuleIds = permanent.filter((record) => record.kind === "module" && record.moduleId)
      .map((record) => String(record.moduleId));
    const ownedResourceIds = permanent.filter((record) => record.kind === "resource" && record.resourceId)
      .map((record) => String(record.resourceId));
    const ownedUpdateIds = ownership?.updateIds || [];
    const subscriptionProductIds = subscription.filter(isFullProductPurchase)
      .map((record) => String(record.productDocumentId || record.productId || snapshot.id));
    const subscriptionModuleIds = subscription.filter((record) => record.kind === "module" && record.moduleId)
      .map((record) => String(record.moduleId));
    const now = Date.now();
    const resolution = resolveCourseAccess({
      product,
      ownedProductIds,
      ownedUpdateIds,
      ownedModuleIds,
      ownedResourceIds,
      subscriptionProductIds,
      subscriptionModuleIds,
      subscriptionResourceIds: [],
      now,
    });
    const currentSubscription = await db.collection("users").doc(user.uid).collection("subscription").doc("current").get();
    const activeSubscription = currentSubscription.exists
      ? safeSubscription(currentSubscription.data() || {}, user.uid, now)
      : null;

    return res.status(200).json({
      ok: true,
      resolution: serialiseResolution(resolution),
      subscription: activeSubscription,
    });
  } catch (error) {
    return errorResponse(res, error, "Your course access could not be verified. Please retry.");
  }
}
