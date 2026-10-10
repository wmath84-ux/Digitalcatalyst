import type { Firestore } from "firebase-admin/firestore";
import type { FirestoreProductDoc, FirestorePurchaseDoc } from "../../utils/serverQuotes.js";
import { canonicalOwnershipScopes, filterLegacyOwnershipRecord, isActiveOwnershipRecord, isFullProductPurchase, ownershipTimestamp } from "../../utils/contentOwnership.js";

/** Load real, product-scoped grants. An update/module/resource receipt never
 * masquerades as a full-product purchase just because it names its parent. */
export async function loadQuoteOwnership(db: Firestore, uid: string, products: Map<string, FirestoreProductDoc>, now = Date.now()) {
  const userRef = db.collection("users").doc(uid);
  const [user, purchases, canonical, subscription] = await Promise.all([
    userRef.get(), userRef.collection("purchases").get(),
    db.collection("entitlements").where("uid", "==", uid).get(),
    userRef.collection("subscription").doc("current").get(),
  ]);
  const userData = user.data() || {};
  const sub = subscription.data() || {};
  const subActive = (!sub.uid || sub.uid === uid) && (!sub.status || sub.status === "active") && ownershipTimestamp(sub.expiresAt) > now;
  const result = new Map<string, { purchaseDocs: FirestorePurchaseDoc[]; updateIds: string[] }>();
  for (const [productId, product] of products) {
    const publicId = String((product as unknown as Record<string, unknown>).publicId || product.id || productId);
    const aliases = new Set([productId, publicId, product.documentId || productId]);
    const docs: FirestorePurchaseDoc[] = [];
    const updateIds = new Set<string>();
    const canonicalRecords = canonical.docs.map((doc) => doc.data()).filter((record) => record.uid === uid && !record.planId && !record.subscriptionPlanId && record.source !== "subscription" && aliases.has(String(record.productDocumentId || record.productId || "")));
    const authority = canonicalOwnershipScopes(canonicalRecords);
    const add = (record: Record<string, any>, legacyId?: string) => {
      if (!isActiveOwnershipRecord(record, now)) return;
      const parentId = String(record.productDocumentId || record.productId || legacyId || "");
      if (!aliases.has(parentId)) return;
      const normalized = { ...record, productDocumentId: productId } as FirestorePurchaseDoc;
      if (record.updateId || record.kind === "paid_update") {
        const updateId = String(record.updateId || "");
        if (updateId) updateIds.add(updateId);
      }
      docs.push(normalized);
    };
    for (const record of canonicalRecords) add(record);
    for (const purchase of purchases.docs) {
      const data = purchase.data();
      if (data.planId || data.subscriptionPlanId || data.source === "subscription") continue;
      const prefix = [...aliases].find((id) => purchase.id.startsWith(`${id}__update__`));
      const record = filterLegacyOwnershipRecord(prefix ? { ...data, productDocumentId: prefix, kind: "paid_update", updateId: data.updateId || purchase.id.slice(`${prefix}__update__`.length) }
        : { ...data, productDocumentId: data.productDocumentId || data.productId || (aliases.has(purchase.id) ? purchase.id : "") }, authority);
      if (record) add(record);
    }
    if (!authority.full && Array.isArray(userData.purchasedProductIds) && userData.purchasedProductIds.some((id: unknown) => aliases.has(String(id)))
      && !docs.some(isFullProductPurchase)) docs.push({ productDocumentId: productId, kind: "full_product" });
    for (const alias of aliases) {
      const ids = userData.purchasedProductUpdateIds?.[alias];
      for (const updateId of Array.isArray(ids) ? ids : []) if (!authority.updates.has(String(updateId))) updateIds.add(String(updateId));
    }
    for (const updateId of updateIds) docs.push({ productDocumentId: productId, kind: "paid_update", updateId });
    if (subActive) {
      if (Array.isArray(sub.includedProductIds) && sub.includedProductIds.some((id: unknown) => aliases.has(String(id)))) {
        docs.push({ productDocumentId: productId, kind: "full_product", source: "subscription" });
      }
      for (const key of Array.isArray(sub.includedModuleKeys) ? sub.includedModuleKeys : []) {
        for (const alias of aliases) {
          const prefix = `${alias}:`;
          if (String(key).startsWith(prefix)) docs.push({ productDocumentId: productId, kind: "module", moduleId: String(key).slice(prefix.length), source: "subscription" });
        }
      }
    }
    result.set(productId, { purchaseDocs: docs, updateIds: [...updateIds] });
  }
  return result;
}
