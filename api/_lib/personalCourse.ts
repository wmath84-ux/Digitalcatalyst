// Authenticated, server-authoritative API for My Study Library / Personal Modules.
//
// Storage remains under the existing owner-scoped hierarchy:
//   users/{uid}/personalCourseModules/{moduleId}
//   users/{uid}/personalCourseModules/{moduleId}/resources/{resourceId}
//
// Saved for Later is represented by deterministic hidden system modules. The
// client sees `state: "saved"` and no personal module id; system modules never
// consume a plan module slot. Direct Firestore writes remain denied by rules.

import { createHash, randomUUID } from "node:crypto";
import type { DocumentSnapshot, Firestore, Transaction } from "firebase-admin/firestore";
import { adminDb, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import {
  PERSONAL_MODULE_LIMIT_MAX,
  PERSONAL_PER_MODULE_LIMIT_MAX,
  PERSONAL_RESOURCE_LIMIT_MAX,
  isPersonalTypeAllowed,
  isValidPersonalId,
  personalAllowedTypes,
  personalLimitMessage,
  resolvePersonalModulesEntitlement,
  sanitizePersonalModuleInput,
  sanitizePersonalResourceInput,
} from "../../utils/personalCourse.js";
import { personalResourceIdentityDescriptor } from "../../utils/personalLibrary.js";
import { firestoreToCatalogProduct } from "../../utils/productMapping.js";
import {
  collectEntitlementOwnership,
  isSubscriptionRecordActive,
  resolveCourseAccess,
} from "../../utils/courseAccess.js";

const GLOBAL_USAGE_ID = "__library__";
/**
 * Actions that only read. Kept in sync with READ_ACTIONS in
 * src/lib/personalCourseClient.ts: a load failure is retryable and must never
 * be worded like a lost write, so both layers need to agree on what is a read.
 */
const LIBRARY_READ_ACTIONS = new Set(["personalCourse.library", "personalCourse.status", "personalCourse.list"]);
const USAGE_SCHEMA_VERSION = 2;
const SORT_STEP = 1024;
const MAX_BATCH_WRITES = 400;
const MODULE_QUERY_LIMIT = PERSONAL_MODULE_LIMIT_MAX + PERSONAL_RESOURCE_LIMIT_MAX + 100;
const RESOURCE_QUERY_LIMIT = PERSONAL_RESOURCE_LIMIT_MAX + 100;

type Body = Record<string, unknown>;
type Db = Firestore;
type Tx = Transaction;
type DocSnapshot = DocumentSnapshot;
type CourseFileType =
  | "youtube" | "video" | "audio" | "pdf" | "doc" | "sheet"
  | "slides" | "ebook" | "image" | "google_form" | "embed" | "mindmap";
type CleanModule = Extract<ReturnType<typeof sanitizePersonalModuleInput>, { ok: true }>;
type CleanResource = Extract<ReturnType<typeof sanitizePersonalResourceInput>, { ok: true }>;

class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const fail = (status: number, code: string, message: string, details?: unknown): never => {
  throw new ApiError(status, code, message, details);
};

const cleanModuleInput = (raw: unknown): CleanModule => {
  const result = sanitizePersonalModuleInput(raw);
  if (!result.ok) fail(400, "VALIDATION", result.errors[0]?.message || "Check the module details.", result.errors);
  return result as CleanModule;
};
const cleanResourceInput = (raw: unknown, status = 400, code = "VALIDATION"): CleanResource => {
  const result = sanitizePersonalResourceInput(raw);
  if (!result.ok) fail(status, code, result.errors[0]?.message || "Check the resource details.", result.errors);
  return result as CleanResource;
};

const json = (res: VercelResponse, status: number, body: unknown) => res.status(status).json(body);
const text = (value: unknown) => String(value == null ? "" : value).trim();
const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const timestampMs = (value: unknown) => {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return number((value as { toMillis: () => number }).toMillis());
  }
  if (value && typeof value === "object" && "seconds" in value) {
    const item = value as { seconds?: unknown; nanoseconds?: unknown };
    return number(item.seconds) * 1000 + Math.floor(number(item.nanoseconds) / 1e6);
  }
  return number(value);
};
const safeId = (value: unknown, label: string) => {
  const id = text(value);
  if (!isValidPersonalId(id)) fail(400, "INVALID_ID", `${label} is invalid.`);
  return id;
};
const makeId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "")}`;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const identityKey = (raw: Record<string, unknown>) => `v1_${hash(personalResourceIdentityDescriptor(raw))}`;
const savedBucketId = (contextProductId: string) => `saved_${hash(contextProductId || GLOBAL_USAGE_ID).slice(0, 32)}`;
const isSystemModule = (data: Body) => Boolean(data.system) || text(data.kind) === "saved";
const moduleCollection = (db: Db, uid: string) => db.collection("users").doc(uid).collection("personalCourseModules");
const usageRef = (db: Db, uid: string) => db.collection("users").doc(uid).collection("personalCourseUsage").doc(GLOBAL_USAGE_ID);
const ownedResourcesQuery = (db: Db, uid: string) => db.collectionGroup("resources").where("ownerUid", "==", uid).limit(RESOURCE_QUERY_LIMIT);
const moduleQuery = (db: Db, uid: string) => moduleCollection(db, uid).limit(MODULE_QUERY_LIMIT);
const isOwnedResourcePath = (uid: string, snapshot: DocSnapshot) => {
  const parts = snapshot.ref.path.split("/");
  return parts.length === 6
    && parts[0] === "users"
    && parts[1] === uid
    && parts[2] === "personalCourseModules"
    && parts[4] === "resources";
};
const storageModuleIdOf = (snapshot: DocSnapshot) => snapshot.ref.parent.parent?.id || "";

const allowedOrigin = (raw: unknown): Record<string, unknown> => {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Body : {};
  if (text(source.kind) === "official") {
    return {
      kind: "official",
      productId: text(source.productId),
      productDocumentId: text(source.productDocumentId),
      productTitle: text(source.productTitle),
      moduleId: text(source.moduleId),
      moduleTitle: text(source.moduleTitle),
      resourceId: text(source.resourceId),
      resourceName: text(source.resourceName),
      copiedAt: timestampMs(source.copiedAt),
    };
  }
  return { kind: "manual", createdAt: timestampMs(source.createdAt) };
};

const resourcePayload = (
  uid: string,
  snapshot: DocSnapshot | { id: string; data: () => Body },
  parentModule: Body | null,
) => {
  const data = snapshot.data() || {};
  const internalModuleId = "ref" in snapshot ? storageModuleIdOf(snapshot as DocSnapshot) : text(data.storageModuleId);
  const system = parentModule ? isSystemModule(parentModule) : text(data.state) === "saved";
  const publicModuleId = system ? null : (text(data.personalModuleId || internalModuleId) || null);
  const origin = allowedOrigin(data.origin);
  const createdAt = timestampMs(data.createdAt);
  return {
    id: snapshot.id,
    ownerUid: uid,
    source: "personal" as const,
    personalModuleId: publicModuleId,
    storageModuleId: internalModuleId,
    state: system ? "saved" as const : "module" as const,
    productId: text(data.productId || parentModule?.productId || GLOBAL_USAGE_ID),
    name: text(data.name || "Untitled resource"),
    description: text(data.description),
    type: text(data.type || "embed") as CourseFileType,
    sourceUrl: text(data.sourceUrl || data.url),
    url: text(data.url),
    embedUrl: text(data.embedUrl),
    youtubeUrl: text(data.youtubeUrl),
    youtubeVideoId: text(data.youtubeVideoId),
    provider: text(data.provider),
    contentType: text(data.contentType),
    metadata: data.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? Object.fromEntries(Object.entries(data.metadata as Body).map(([key, value]) => [key, text(value)]))
      : {},
    identityKey: text(data.identityKey) || identityKey(data),
    originKind: text(data.originKind || origin.kind) === "official" ? "official" as const : "manual" as const,
    origin,
    sortOrder: number(data.sortOrder),
    createdAt,
    updatedAt: timestampMs(data.updatedAt) || createdAt,
    lastOpenedAt: timestampMs(data.lastOpenedAt) || null,
  };
};

const modulePayload = (uid: string, snapshot: DocSnapshot, resources: ReturnType<typeof resourcePayload>[]) => {
  const data = snapshot.data() || {};
  const createdAt = timestampMs(data.createdAt);
  return {
    id: snapshot.id,
    ownerUid: uid,
    source: "personal" as const,
    kind: "module" as const,
    system: false as const,
    productId: text(data.productId || GLOBAL_USAGE_ID),
    productTitle: text(data.productTitle),
    title: text(data.title || "Untitled module"),
    description: text(data.description),
    sortOrder: number(data.sortOrder),
    resourceCount: resources.length,
    createdAt,
    updatedAt: timestampMs(data.updatedAt) || createdAt,
    resources: resources.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt),
  };
};

const usagePayload = (moduleCount: number, resourceCount: number, updatedAt = Date.now()) => ({
  schemaVersion: USAGE_SCHEMA_VERSION as 2,
  scope: "account" as const,
  moduleCount: Math.max(0, Math.floor(moduleCount)),
  resourceCount: Math.max(0, Math.floor(resourceCount)),
  updatedAt,
});

async function authenticate(req: VercelRequest): Promise<string> {
  try {
    const decoded = await requireFirebaseUser(req);
    if (!decoded.uid) fail(401, "AUTH_REQUIRED", "Your sign-in session is invalid.");
    return text(decoded.uid);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const status = error && typeof error === "object" && "statusCode" in error
      ? number((error as { statusCode?: unknown }).statusCode, 401)
      : 401;
    if (status === 503) throw error;
    return fail(401, "AUTH_REQUIRED", "Your sign-in session expired. Please sign in again.");
  }
}

async function readEntitlement(db: Db, uid: string) {
  const subscriptionSnapshot = await db.collection("users").doc(uid).collection("subscription").doc("current").get();
  const record = subscriptionSnapshot.exists ? subscriptionSnapshot.data() || {} : {};
  const planId = text(record.planId);
  const planSnapshot = planId ? await db.collection("subscriptionPlans").doc(planId).get() : null;
  const plan = planSnapshot?.exists ? { id: planSnapshot.id, ...(planSnapshot.data() || {}) } : (planId ? { id: planId } : {});
  return resolvePersonalModulesEntitlement({ record, plan });
}

async function readEntitlementInTransaction(tx: Tx, db: Db, uid: string) {
  const subscriptionSnapshot = await tx.get(db.collection("users").doc(uid).collection("subscription").doc("current"));
  const record = subscriptionSnapshot.exists ? subscriptionSnapshot.data() || {} : {};
  const planId = text(record.planId);
  const planSnapshot = planId ? await tx.get(db.collection("subscriptionPlans").doc(planId)) : null;
  const plan = planSnapshot?.exists ? { id: planSnapshot.id, ...(planSnapshot.data() || {}) } : (planId ? { id: planId } : {});
  return resolvePersonalModulesEntitlement({ record, plan });
}

const assertCreationEntitled = (entitlement: ReturnType<typeof resolvePersonalModulesEntitlement>) => {
  if (!entitlement.entitled) {
    fail(
      403,
      entitlement.disabled ? "FEATURE_DISABLED" : "PLAN_REQUIRED",
      entitlement.disabled
        ? `My Study Library creation is disabled${entitlement.planName ? ` on ${entitlement.planName}` : " on your plan"}. Your existing content remains readable.`
        : "An eligible active plan is required to add new personal study content. Your existing content remains readable.",
    );
  }
  return entitlement.limits;
};

const assertResourceTypeAllowed = (entitlement: ReturnType<typeof resolvePersonalModulesEntitlement>, type: string) => {
  if (!isPersonalTypeAllowed(entitlement.config, entitlement.cycle || "monthly", type)) {
    fail(403, "TYPE_NOT_ALLOWED", `${type} resources aren't included in ${entitlement.planName || "your plan"}.`);
  }
};

async function ensureGlobalUsage(db: Db, uid: string) {
  return db.runTransaction(async (tx) => {
    const ref = usageRef(db, uid);
    const current = await tx.get(ref);
    const data = current.data() || {};
    if (current.exists && number(data.schemaVersion) === USAGE_SCHEMA_VERSION && text(data.scope) === "account") {
      return usagePayload(number(data.moduleCount), number(data.resourceCount), timestampMs(data.updatedAt));
    }

    // Firestore transactions require every read before every write. This also
    // reconciles all legacy per-product data before global limits are enforced.
    const [modulesSnapshot, resourcesSnapshot] = await Promise.all([
      tx.get(moduleQuery(db, uid)),
      tx.get(ownedResourcesQuery(db, uid)),
    ]);
    const moduleCount = modulesSnapshot.docs.filter((item) => !isSystemModule(item.data())).length;
    const resourceCount = resourcesSnapshot.docs.filter((item) => isOwnedResourcePath(uid, item)).length;
    const next = usagePayload(moduleCount, resourceCount);
    tx.set(ref, next, { merge: false });
    return next;
  });
}

async function readUsageAndInventoryInTransaction(tx: Tx, db: Db, uid: string) {
  // Reads happen before any caller writes. Inventory, not a client counter, is
  // authoritative for limits and duplicate checks under stale/concurrent tabs.
  const [usageSnapshot, modulesSnapshot, resourcesSnapshot] = await Promise.all([
    tx.get(usageRef(db, uid)),
    tx.get(moduleQuery(db, uid)),
    tx.get(ownedResourcesQuery(db, uid)),
  ]);
  const modules = modulesSnapshot.docs;
  const resources = resourcesSnapshot.docs.filter((item) => isOwnedResourcePath(uid, item));
  const usage = usagePayload(
    modules.filter((item) => !isSystemModule(item.data())).length,
    resources.length,
    timestampMs(usageSnapshot.data()?.updatedAt) || Date.now(),
  );
  return { usageSnapshot, modules, resources, usage };
}

const moduleFromInventory = (modules: DocSnapshot[], id: string) => modules.find((item) => item.id === id) || null;
const resourcesInStorageModule = (resources: DocSnapshot[], storageModuleId: string) => resources.filter((item) => storageModuleIdOf(item) === storageModuleId);
const savedResourcesFromInventory = (modules: DocSnapshot[], resources: DocSnapshot[]) => resources.filter((item) =>
  isSystemModule(moduleFromInventory(modules, storageModuleIdOf(item))?.data() || {}));
const identityOfSnapshot = (snapshot: DocSnapshot) => text(snapshot.data()?.identityKey) || identityKey(snapshot.data() || {});
const nextSortOrder = (resources: DocSnapshot[]) => resources.reduce((max, item) => Math.max(max, number(item.data()?.sortOrder)), -SORT_STEP) + SORT_STEP;

/**
 * Apply move semantics with at most two writes. Up/down controls take the
 * adjacent swap path; arbitrary clients receive a fractional rank between the
 * new neighbours. This stays below Firestore's 500-write transaction ceiling
 * even when an administrator configures the 1,000-item hard maximum.
 */
const applyOrderMove = (tx: Tx, items: DocSnapshot[], from: number, destination: number): DocSnapshot[] => {
  if (from === destination) return items;
  const moving = items[from];
  const target = items[destination];
  const movingOrder = number(moving.data()?.sortOrder);
  const targetOrder = number(target.data()?.sortOrder);
  const now = Date.now();
  const ordered = [...items];
  const [removed] = ordered.splice(from, 1);
  ordered.splice(destination, 0, removed);

  if (Math.abs(from - destination) === 1 && movingOrder !== targetOrder) {
    tx.update(moving.ref, { sortOrder: targetOrder, updatedAt: now });
    tx.update(target.ref, { sortOrder: movingOrder, updatedAt: now });
    return ordered;
  }

  const previous = ordered[destination - 1];
  const next = ordered[destination + 1];
  const previousOrder = previous ? number(previous.data()?.sortOrder) : null;
  const nextOrderValue = next ? number(next.data()?.sortOrder) : null;
  let order: number;
  if (previousOrder == null && nextOrderValue == null) order = 0;
  else if (previousOrder == null) order = nextOrderValue! - SORT_STEP;
  else if (nextOrderValue == null) order = previousOrder + SORT_STEP;
  else if (nextOrderValue > previousOrder) order = previousOrder + (nextOrderValue - previousOrder) / 2;
  else order = targetOrder + (destination < from ? -0.5 : 0.5);
  tx.update(moving.ref, { sortOrder: order, updatedAt: now });
  return ordered;
};

const moduleData = (uid: string, input: { productId: string; productTitle: string; title: string; description: string; sortOrder: number; now: number }) => ({
  ownerUid: uid,
  source: "personal",
  kind: "module",
  system: false,
  productId: input.productId,
  productTitle: input.productTitle,
  title: input.title,
  description: input.description,
  sortOrder: input.sortOrder,
  resourceCount: 0,
  createdAt: input.now,
  updatedAt: input.now,
});

const systemBucketData = (uid: string, productId: string, productTitle: string, now: number, existing?: Body) => ({
  ownerUid: uid,
  source: "personal",
  kind: "saved",
  system: true,
  productId,
  productTitle,
  title: "Saved for Later",
  description: "",
  sortOrder: number(existing?.sortOrder),
  resourceCount: number(existing?.resourceCount),
  createdAt: timestampMs(existing?.createdAt) || now,
  updatedAt: now,
});

interface OfficialSnapshot {
  productId: string;
  productDocumentId: string;
  productTitle: string;
  moduleId: string;
  moduleTitle: string;
  resourceId: string;
  resourceName: string;
  cleaned: CleanResource;
  productForAccess: Record<string, unknown>;
}

const findLegacyResource = (nodes: unknown[], moduleId: string, resourceId: string): { module: Body; resource: Body } | null => {
  for (const rawNode of nodes) {
    if (!rawNode || typeof rawNode !== "object" || Array.isArray(rawNode)) continue;
    const node = rawNode as Body;
    const nodeId = text(node.id);
    const files = Array.isArray(node.files) ? node.files : Array.isArray(node.resources) ? node.resources : [];
    if (!moduleId || nodeId === moduleId) {
      const resource = files.find((item) => item && typeof item === "object" && text((item as Body).id) === resourceId) as Body | undefined;
      if (resource) return { module: node, resource };
      if (nodeId && resourceId === `${nodeId}__embedded-page` && text(node.embedContentUrl)) {
        const embedType = text(node.embedContentTypeId);
        return {
          module: node,
          resource: {
            id: resourceId,
            name: text(node.embedContentTypeLabel || "Embedded resource"),
            type: embedType === "google_doc" ? "doc" : embedType === "whimsical_mindmap" ? "mindmap" : "embed",
            url: text(node.embedContentUrl),
            embedUrl: text(node.embedContentUrl),
            provider: embedType || "external",
          },
        };
      }
    }
    const nested = findLegacyResource(Array.isArray(node.modules) ? node.modules : [], moduleId, resourceId);
    if (nested) return nested;
  }
  return null;
};

async function loadOfficialSnapshot(db: Db, body: Body): Promise<OfficialSnapshot> {
  const productId = safeId(body.productId, "Product id");
  const moduleId = safeId(body.sourceModuleId || body.moduleId, "Official module id");
  const resourceId = safeId(body.sourceResourceId || body.resourceId, "Official resource id");
  const requestedDocumentId = text(body.productDocumentId);
  if (requestedDocumentId && !isValidPersonalId(requestedDocumentId)) fail(400, "INVALID_ID", "Product document id is invalid.");

  const candidates = Array.from(new Set([requestedDocumentId, productId].filter(Boolean)));
  let productSnapshot: DocSnapshot | null = null;
  for (const candidate of candidates) {
    const current = await db.collection("siteProducts").doc(candidate).get();
    if (current.exists) { productSnapshot = current; break; }
  }
  if (!productSnapshot) {
    const byPublicId = await db.collection("siteProducts").where("id", "==", productId).limit(1).get();
    productSnapshot = byPublicId.docs[0] || null;
  }
  if (!productSnapshot?.exists) fail(404, "OFFICIAL_PRODUCT_NOT_FOUND", "That official product no longer exists.");
  const productDoc = productSnapshot!;

  const raw = productDoc.data() || {};
  const publicId = text(raw.id || productId);
  if (publicId !== productId && productDoc.id !== productId) fail(404, "OFFICIAL_PRODUCT_NOT_FOUND", "That official product no longer exists.");
  const catalogCandidate = firestoreToCatalogProduct(raw, productDoc.id);
  if (!catalogCandidate) fail(409, "OFFICIAL_PRODUCT_INVALID", "That official product cannot be copied right now.");
  const catalog = catalogCandidate!;
  const foundCandidate = findLegacyResource(Array.isArray(catalog.courseContent) ? catalog.courseContent : [], moduleId, resourceId)
    || findLegacyResource(Array.isArray(raw.courseContent) ? raw.courseContent : [], moduleId, resourceId);
  if (!foundCandidate) fail(404, "OFFICIAL_RESOURCE_NOT_FOUND", "That official resource was removed or changed. Refresh the course and try again.");
  const found = foundCandidate!;

  const source = found.resource;
  const sourceUrl = text(source.sourceUrl || source.youtubeUrl || source.url || source.embedUrl || source.youtubeVideoId);
  const type = text(source.type || "embed");
  const cleanedCandidate = sanitizePersonalResourceInput({
    type,
    name: text(source.name || "Official resource"),
    description: text(source.description),
    url: sourceUrl,
    provider: text(source.provider),
    metadata: source.metadata,
  });
  if (!cleanedCandidate.ok) fail(409, "OFFICIAL_RESOURCE_INVALID", "That official resource does not have a valid reusable link.", cleanedCandidate.errors);
  const cleaned = cleanedCandidate as CleanResource;

  return {
    productId: publicId,
    productDocumentId: productDoc.id,
    productTitle: text(raw.title || (raw.adminProduct as Body | undefined)?.title || "Official course"),
    moduleId: text(found.module.id || moduleId),
    moduleTitle: text(found.module.title || "Course module"),
    resourceId: text(source.id || resourceId),
    resourceName: text(source.name || cleaned.value.name),
    cleaned,
    productForAccess: { id: publicId, canonicalModules: catalog.canonicalModules, courseContent: catalog.courseContent },
  };
}

async function assertOfficialCourseAccess(db: Db, uid: string, official: OfficialSnapshot) {
  const [userSnapshot, purchaseSnapshot, entitlementSnapshot, subscriptionSnapshot] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("users").doc(uid).collection("purchases").get(),
    db.collection("entitlements").where("uid", "==", uid).get(),
    db.collection("users").doc(uid).collection("subscription").doc("current").get(),
  ]);
  const user = userSnapshot.data() || {};
  const entitlements = collectEntitlementOwnership(entitlementSnapshot.docs.map((item) => item.data()));
  const ownedProducts = new Set<string>([
    ...entitlements.ownedProductIds,
    ...(Array.isArray(user.purchasedProductIds) ? user.purchasedProductIds.map(String) : []),
    ...purchaseSnapshot.docs.map((item) => text(item.data().productDocumentId || item.id)),
  ]);
  if (ownedProducts.has(official.productDocumentId)) ownedProducts.add(official.productId);
  if (ownedProducts.has(official.productId)) ownedProducts.add(official.productDocumentId);
  const updateMap = user.purchasedProductUpdateIds && typeof user.purchasedProductUpdateIds === "object"
    ? Object.values(user.purchasedProductUpdateIds as Body).flatMap((item) => Array.isArray(item) ? item.map(String) : [])
    : [];
  const subscription = subscriptionSnapshot.data() || {};
  const activeSubscription = isSubscriptionRecordActive(subscription as never);
  const resolution = resolveCourseAccess({
    product: official.productForAccess,
    ownedProductIds: [...ownedProducts],
    ownedUpdateIds: [...entitlements.ownedUpdateIds, ...updateMap],
    ownedModuleIds: [...entitlements.ownedModuleIds],
    ownedResourceIds: [...entitlements.ownedResourceIds],
    subscriptionProductIds: activeSubscription && Array.isArray(subscription.includedProductIds) ? subscription.includedProductIds.map(String) : [],
    subscriptionModuleIds: activeSubscription && Array.isArray(subscription.includedModuleKeys)
      ? subscription.includedModuleKeys.map((key: unknown) => text(key).split(":").pop() || "").filter(Boolean)
      : [],
    subscriptionResourceIds: [],
    requireBaseCourseForUpdate: true,
  });
  if (!resolution.accessibleModuleIds.has(official.moduleId) && !resolution.accessibleResourceIds.has(official.resourceId)) {
    fail(403, "OFFICIAL_ACCESS_REQUIRED", "You no longer have access to that official resource.");
  }
}

async function resolveContextProduct(
  db: Db,
  productIdRaw: unknown,
  productDocumentIdRaw?: unknown,
): Promise<{ productId: string; productTitle: string }> {
  const productId = text(productIdRaw) || GLOBAL_USAGE_ID;
  if (productId === GLOBAL_USAGE_ID) return { productId, productTitle: "My Study Library" };
  if (!isValidPersonalId(productId)) fail(400, "INVALID_PRODUCT", "Product id is invalid.");
  const documentId = text(productDocumentIdRaw);
  const candidates = Array.from(new Set([documentId, productId].filter(Boolean)));
  for (const id of candidates) {
    if (!isValidPersonalId(id)) continue;
    const snapshot = await db.collection("siteProducts").doc(id).get();
    if (snapshot.exists) {
      const data = snapshot.data() || {};
      return { productId: text(data.id || productId), productTitle: text(data.title || (data.adminProduct as Body | undefined)?.title) };
    }
  }
  const found = await db.collection("siteProducts").where("id", "==", productId).limit(1).get();
  if (!found.empty) {
    const data = found.docs[0].data();
    return { productId: text(data.id || productId), productTitle: text(data.title || (data.adminProduct as Body | undefined)?.title) };
  }
  return fail(404, "PRODUCT_NOT_FOUND", "That course no longer exists.");
}

const buildResourceData = (input: {
  uid: string;
  cleaned: CleanResource;
  productId: string;
  storageModuleId: string;
  personalModuleId: string | null;
  origin: Record<string, unknown>;
  identity: string;
  sortOrder: number;
  now: number;
  existing?: Body;
}) => ({
  ownerUid: input.uid,
  source: "personal",
  personalModuleId: input.personalModuleId,
  storageModuleId: input.storageModuleId,
  state: input.personalModuleId ? "module" : "saved",
  productId: input.productId,
  name: input.cleaned.value.name,
  description: input.cleaned.value.description,
  type: input.cleaned.value.type,
  sourceUrl: input.cleaned.value.sourceUrl,
  url: input.cleaned.value.url,
  embedUrl: input.cleaned.value.embedUrl,
  youtubeUrl: input.cleaned.value.youtubeUrl,
  youtubeVideoId: input.cleaned.value.youtubeVideoId,
  provider: input.cleaned.value.provider,
  contentType: input.cleaned.value.contentType,
  metadata: input.cleaned.value.metadata,
  identityKey: input.identity,
  originKind: text(input.origin.kind) === "official" ? "official" : "manual",
  origin: input.origin,
  sortOrder: input.sortOrder,
  createdAt: timestampMs(input.existing?.createdAt) || input.now,
  updatedAt: input.now,
  lastOpenedAt: timestampMs(input.existing?.lastOpenedAt) || null,
});

function assertModuleLimit(moduleCount: number, limits: { moduleLimit: number } | null, planName: string | null) {
  if (limits && limits.moduleLimit >= 0 && moduleCount >= limits.moduleLimit) {
    fail(409, "MODULE_LIMIT", personalLimitMessage("module", limits as never, planName));
  }
}
function assertResourceLimit(resourceCount: number, limits: { resourceLimit: number } | null, planName: string | null) {
  if (limits && limits.resourceLimit >= 0 && resourceCount >= limits.resourceLimit) {
    fail(409, "RESOURCE_LIMIT", personalLimitMessage("resource", limits as never, planName));
  }
}
function assertPerModuleLimit(count: number, limits: { perModuleResourceLimit: number } | null, planName: string | null) {
  if (limits && limits.perModuleResourceLimit >= 0 && count >= limits.perModuleResourceLimit) {
    fail(409, "PER_MODULE_LIMIT", personalLimitMessage("per-module", limits as never, planName));
  }
}

async function listLibrary(db: Db, uid: string) {
  // Exactly one owner-filtered collection-group resource query plus one module
  // query. This replaces the legacy one-query-per-module hydration pattern.
  const [modulesSnapshot, resourcesSnapshot] = await Promise.all([
    moduleQuery(db, uid).get(),
    ownedResourcesQuery(db, uid).get(),
  ]);
  const moduleById = new Map(modulesSnapshot.docs.map((item) => [item.id, item]));
  const resourcesByModule = new Map<string, ReturnType<typeof resourcePayload>[]>();
  const savedResources: ReturnType<typeof resourcePayload>[] = [];

  for (const snapshot of resourcesSnapshot.docs) {
    if (!isOwnedResourcePath(uid, snapshot)) continue;
    const storageModuleId = storageModuleIdOf(snapshot);
    const parent = moduleById.get(storageModuleId);
    if (!parent) continue; // orphaned legacy row: never leak it into another bucket
    const payload = resourcePayload(uid, snapshot, parent.data());
    if (isSystemModule(parent.data())) savedResources.push(payload);
    else {
      const list = resourcesByModule.get(storageModuleId) || [];
      list.push(payload);
      resourcesByModule.set(storageModuleId, list);
    }
  }

  const modules = modulesSnapshot.docs
    .filter((item) => !isSystemModule(item.data()) && !Boolean(item.data().deleting))
    .map((item) => modulePayload(uid, item, resourcesByModule.get(item.id) || []))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
  savedResources.sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);
  const usage = usagePayload(
    modulesSnapshot.docs.filter((item) => !isSystemModule(item.data()) && !Boolean(item.data().deleting)).length,
    resourcesSnapshot.docs.filter((item) => isOwnedResourcePath(uid, item)).length,
  );
  return { modules, savedResources, usage };
}

async function handleLibrary(db: Db, uid: string) {
  const [entitlement, library] = await Promise.all([
    readEntitlement(db, uid),
    listLibrary(db, uid),
  ]);
  // The list already read account inventory; use that same snapshot rather
  // than trusting a possibly legacy counter or issuing duplicate queries.
  const usage = library.usage;
  return {
    ...library,
    usage,
    access: {
      entitled: entitlement.entitled,
      disabled: entitlement.disabled,
      reason: entitlement.reason,
      planId: entitlement.planId,
      planName: entitlement.planName,
      cycle: entitlement.cycle,
      limits: entitlement.limits,
      allowedTypes: entitlement.config ? personalAllowedTypes(entitlement.config, entitlement.cycle || "monthly") : [],
      moduleCount: usage.moduleCount,
      resourceCount: usage.resourceCount,
    },
  };
}

async function handleStatus(db: Db, uid: string) {
  const [usage, entitlement] = await Promise.all([ensureGlobalUsage(db, uid), readEntitlement(db, uid)]);
  return {
    usage,
    access: {
      entitled: entitlement.entitled,
      disabled: entitlement.disabled,
      reason: entitlement.reason,
      planId: entitlement.planId,
      planName: entitlement.planName,
      cycle: entitlement.cycle,
      limits: entitlement.limits,
      allowedTypes: entitlement.config ? personalAllowedTypes(entitlement.config, entitlement.cycle || "monthly") : [],
      moduleCount: usage.moduleCount,
      resourceCount: usage.resourceCount,
    },
  };
}

async function createModule(db: Db, uid: string, body: Body) {
  const cleaned = cleanModuleInput(body);
  const context = await resolveContextProduct(db, body.productId, body.productDocumentId);
  const id = makeId("pm");
  const now = Date.now();
  let result: { module: ReturnType<typeof modulePayload>; usage: ReturnType<typeof usagePayload> } | null = null;

  await db.runTransaction(async (tx) => {
    const entitlement = await readEntitlementInTransaction(tx, db, uid);
    const inventory = await readUsageAndInventoryInTransaction(tx, db, uid);
    const limits = assertCreationEntitled(entitlement);
    const userModules = inventory.modules.filter((item) => !isSystemModule(item.data()) && !Boolean(item.data().deleting));
    assertModuleLimit(userModules.length, limits, entitlement.planName);
    const maxOrder = userModules.reduce((max, item) => Math.max(max, number(item.data().sortOrder)), -SORT_STEP);
    const data = moduleData(uid, {
      productId: context.productId,
      productTitle: context.productTitle,
      title: cleaned.value.title,
      description: cleaned.value.description,
      sortOrder: maxOrder + SORT_STEP,
      now,
    });
    const ref = moduleCollection(db, uid).doc(id);
    const nextUsage = usagePayload(userModules.length + 1, inventory.resources.length, now);
    tx.create(ref, data);
    tx.set(usageRef(db, uid), nextUsage, { merge: false });
    const fake = { id, data: () => data, ref } as unknown as DocSnapshot;
    result = { module: modulePayload(uid, fake, []), usage: nextUsage };
  });
  return result!;
}

async function updateModule(db: Db, uid: string, body: Body) {
  const moduleId = safeId(body.moduleId, "Module id");
  const cleaned = cleanModuleInput(body);
  const ref = moduleCollection(db, uid).doc(moduleId);
  let module: ReturnType<typeof modulePayload> | null = null;
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists || text(snapshot.data()?.ownerUid) !== uid || isSystemModule(snapshot.data() || {})) fail(404, "MODULE_NOT_FOUND", "That module no longer exists.");
    if (snapshot.data()?.deleting) fail(409, "MODULE_DELETING", "That module is already being deleted.");
    const data = { ...(snapshot.data() || {}), ...cleaned.value, updatedAt: Date.now() };
    tx.update(ref, { ...cleaned.value, updatedAt: data.updatedAt });
    const resources: ReturnType<typeof resourcePayload>[] = [];
    module = modulePayload(uid, { ...snapshot, data: () => data } as unknown as DocSnapshot, resources);
  });
  return { module };
}

async function deleteModule(db: Db, uid: string, body: Body) {
  const moduleId = safeId(body.moduleId, "Module id");
  const ref = moduleCollection(db, uid).doc(moduleId);
  let expectedResourceCount = 0;
  let removedResourceCount = 0;

  await ensureGlobalUsage(db, uid);
  // Mark first so concurrent resource creates/moves reject the destination.
  await db.runTransaction(async (tx) => {
    const [snapshot, resources] = await Promise.all([
      tx.get(ref),
      tx.get(ref.collection("resources").limit(PERSONAL_PER_MODULE_LIMIT_MAX + 10)),
    ]);
    if (!snapshot.exists || text(snapshot.data()?.ownerUid) !== uid || isSystemModule(snapshot.data() || {})) fail(404, "MODULE_NOT_FOUND", "That module no longer exists.");
    expectedResourceCount = Math.max(0, number(snapshot.data()?.resourceCount), resources.size);
    if (!snapshot.data()?.deleting) tx.update(ref, { deleting: true, updatedAt: Date.now() });
  });

  try {
    for (;;) {
      const resources = await ref.collection("resources").limit(MAX_BATCH_WRITES).get();
      if (resources.empty) break;
      const batch = db.batch();
      resources.docs.forEach((item) => batch.delete(item.ref));
      await batch.commit();
      removedResourceCount += resources.size;
    }
  } catch (error) {
    // A failed cascade must not strand an invisible, permanently locked
    // module. Any completed batches stay deleted, while clearing the marker
    // makes the remaining module visible and safely retryable.
    await db.runTransaction(async (tx) => {
      const current = await tx.get(ref);
      if (current.exists && Boolean(current.data()?.deleting)) tx.update(ref, { deleting: false, updatedAt: Date.now() });
    }).catch(() => undefined);
    throw error;
  }

  let nextUsage: ReturnType<typeof usagePayload> | null = null;
  await db.runTransaction(async (tx) => {
    // Recompute instead of subtracting the pre-delete count. A concurrent
    // resource delete/move may already have changed both the module count and
    // usage document while the batched cascade was running; exact inventory
    // prevents a double decrement or underflow.
    const inventory = await readUsageAndInventoryInTransaction(tx, db, uid);
    const snapshot = moduleFromInventory(inventory.modules, moduleId);
    const remainingModules = inventory.modules.filter((item) =>
      item.id !== moduleId && !isSystemModule(item.data()) && !Boolean(item.data().deleting));
    const remainingResources = inventory.resources.filter((item) => storageModuleIdOf(item) !== moduleId);
    nextUsage = usagePayload(remainingModules.length, remainingResources.length, Date.now());
    if (snapshot) tx.delete(snapshot.ref);
    tx.set(usageRef(db, uid), nextUsage, { merge: false });
  });
  return {
    moduleId,
    removedResourceCount: Math.max(expectedResourceCount, removedResourceCount),
    usage: nextUsage,
  };
}

async function reorderModule(db: Db, uid: string, body: Body) {
  const moduleId = safeId(body.moduleId, "Module id");
  const toIndex = Math.floor(number(body.toIndex, -1));
  const scopeProductId = text(body.scopeProductId);
  if (toIndex < 0) fail(400, "INVALID_ORDER", "Choose a valid module position.");
  let orderedIds: string[] = [];
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(moduleQuery(db, uid));
    const modules = snapshot.docs
      .filter((item) => !isSystemModule(item.data()) && !Boolean(item.data().deleting))
      .filter((item) => !scopeProductId || text(item.data().productId) === scopeProductId)
      .sort((a, b) => number(a.data().sortOrder) - number(b.data().sortOrder) || timestampMs(a.data().createdAt) - timestampMs(b.data().createdAt));
    const from = modules.findIndex((item) => item.id === moduleId);
    if (from < 0) fail(404, "MODULE_NOT_FOUND", "That module no longer exists.");
    const destination = Math.min(toIndex, modules.length - 1);
    orderedIds = applyOrderMove(tx, modules, from, destination).map((item) => item.id);
  });
  return { orderedIds };
}

async function createManualResource(db: Db, uid: string, body: Body) {
  const cleaned = cleanResourceInput(body);
  const destinationState = text(body.destination) === "saved" || !text(body.moduleId) ? "saved" : "module";
  const destinationModuleId = destinationState === "module" ? safeId(body.moduleId, "Module id") : "";
  const context = destinationState === "saved"
    ? await resolveContextProduct(db, body.productId || GLOBAL_USAGE_ID, body.productDocumentId)
    : null;
  const id = makeId("pr");
  const now = Date.now();
  const origin = { kind: "manual", createdAt: now };
  const identity = identityKey({ ...cleaned.value, origin });
  let result: Body | null = null;

  await db.runTransaction(async (tx) => {
    const entitlement = await readEntitlementInTransaction(tx, db, uid);
    const inventory = await readUsageAndInventoryInTransaction(tx, db, uid);
    const limits = assertCreationEntitled(entitlement);
    assertResourceTypeAllowed(entitlement, cleaned.value.type);
    assertResourceLimit(inventory.resources.length, limits, entitlement.planName);

    let moduleSnapshot: DocSnapshot | null;
    let storageModuleId: string;
    let productId: string;
    let productTitle: string;
    if (destinationState === "module") {
      moduleSnapshot = moduleFromInventory(inventory.modules, destinationModuleId);
      if (!moduleSnapshot || isSystemModule(moduleSnapshot.data() || {}) || moduleSnapshot.data()?.deleting) fail(404, "MODULE_NOT_FOUND", "That destination module no longer exists.");
      const foundModule = moduleSnapshot!;
      storageModuleId = foundModule.id;
      productId = text(foundModule.data()?.productId || GLOBAL_USAGE_ID);
      productTitle = text(foundModule.data()?.productTitle);
    } else {
      storageModuleId = savedBucketId(context!.productId);
      moduleSnapshot = moduleFromInventory(inventory.modules, storageModuleId);
      productId = context!.productId;
      productTitle = context!.productTitle;
    }
    const targetResources = resourcesInStorageModule(inventory.resources, storageModuleId);
    const duplicatePool = destinationState === "saved"
      ? savedResourcesFromInventory(inventory.modules, inventory.resources)
      : targetResources;
    const duplicate = duplicatePool.find((item) => identityOfSnapshot(item) === identity);
    if (duplicate) {
      const duplicateParent = moduleFromInventory(inventory.modules, storageModuleIdOf(duplicate));
      result = { resource: resourcePayload(uid, duplicate, duplicateParent?.data() || null), alreadyExists: true, usage: inventory.usage };
      return;
    }
    if (destinationState === "module") assertPerModuleLimit(targetResources.length, limits, entitlement.planName);
    const data = buildResourceData({
      uid, cleaned, productId, storageModuleId,
      personalModuleId: destinationState === "module" ? storageModuleId : null,
      origin,
      identity,
      sortOrder: nextSortOrder(destinationState === "saved" ? savedResourcesFromInventory(inventory.modules, inventory.resources) : targetResources),
      now,
    });
    const parentRef = moduleCollection(db, uid).doc(storageModuleId);
    const resourceRef = parentRef.collection("resources").doc(id);
    const nextUsage = usagePayload(inventory.usage.moduleCount, inventory.resources.length + 1, now);
    if (destinationState === "saved") {
      tx.set(parentRef, { ...systemBucketData(uid, productId, productTitle, now, moduleSnapshot?.data()), resourceCount: targetResources.length + 1 }, { merge: true });
    } else {
      tx.update(parentRef, { resourceCount: targetResources.length + 1, updatedAt: now });
    }
    tx.create(resourceRef, data);
    tx.set(usageRef(db, uid), nextUsage, { merge: false });
    const fake = { id, data: () => data, ref: resourceRef } as unknown as DocSnapshot;
    result = { resource: resourcePayload(uid, fake, destinationState === "saved" ? { kind: "saved", system: true } : moduleSnapshot?.data() || null), alreadyExists: false, usage: nextUsage };
  });
  return result!;
}

async function addOfficialResource(db: Db, uid: string, body: Body) {
  const official = await loadOfficialSnapshot(db, body);
  await assertOfficialCourseAccess(db, uid, official);
  const destinationState = text(body.destination) === "saved" ? "saved" : "module";
  const existingModuleId = destinationState === "module" && text(body.moduleId) ? safeId(body.moduleId, "Module id") : "";
  let newModuleInput: CleanModule | null = null;
  if (destinationState === "module" && !existingModuleId) {
    if (!text(body.newModuleTitle)) fail(400, "VALIDATION", "Choose a module or create a new one.");
    newModuleInput = cleanModuleInput({ title: body.newModuleTitle, description: body.newModuleDescription });
  }
  const now = Date.now();
  const resourceId = makeId("pr");
  const newModuleId = newModuleInput ? makeId("pm") : "";
  const origin = {
    kind: "official",
    productId: official.productId,
    productDocumentId: official.productDocumentId,
    productTitle: official.productTitle,
    moduleId: official.moduleId,
    moduleTitle: official.moduleTitle,
    resourceId: official.resourceId,
    resourceName: official.resourceName,
    copiedAt: now,
  };
  const identity = identityKey({ ...official.cleaned.value, origin });
  let result: Body | null = null;

  await db.runTransaction(async (tx) => {
    const entitlement = await readEntitlementInTransaction(tx, db, uid);
    const inventory = await readUsageAndInventoryInTransaction(tx, db, uid);
    const duplicateSnapshots = inventory.resources.filter((item) => {
      const parent = moduleFromInventory(inventory.modules, storageModuleIdOf(item));
      return parent && !Boolean(parent.data()?.deleting) && identityOfSnapshot(item) === identity;
    });
    const userModules = inventory.modules.filter((item) => !isSystemModule(item.data()) && !Boolean(item.data().deleting));

    let destinationSnapshot: DocSnapshot | null = null;
    let storageModuleId: string;
    let destinationModuleData: Body | null = null;
    let createdModuleData: Body | null = null;

    if (destinationState === "saved") {
      storageModuleId = savedBucketId(official.productId);
      destinationSnapshot = moduleFromInventory(inventory.modules, storageModuleId);
      destinationModuleData = destinationSnapshot?.data() || null;
      const alreadySaved = duplicateSnapshots.find((item) => isSystemModule(moduleFromInventory(inventory.modules, storageModuleIdOf(item))?.data() || {}));
      if (alreadySaved) {
        result = {
          resource: resourcePayload(uid, alreadySaved, moduleFromInventory(inventory.modules, storageModuleIdOf(alreadySaved))?.data() || null),
          alreadyExists: true,
          existingState: "saved",
          existingModuleId: null,
          usage: inventory.usage,
        };
        return;
      }
      // Saving a resource already organised in any module is idempotent: do
      // not make a second "unsorted" copy merely because the button repeated.
      const organised = duplicateSnapshots.find((item) => !isSystemModule(moduleFromInventory(inventory.modules, storageModuleIdOf(item))?.data() || {}));
      if (organised) {
        const parent = moduleFromInventory(inventory.modules, storageModuleIdOf(organised));
        result = {
          resource: resourcePayload(uid, organised, parent?.data() || null),
          alreadyExists: true,
          existingState: "module",
          existingModuleId: parent?.id || null,
          usage: inventory.usage,
        };
        return;
      }
    } else if (existingModuleId) {
      destinationSnapshot = moduleFromInventory(inventory.modules, existingModuleId);
      if (!destinationSnapshot || isSystemModule(destinationSnapshot.data() || {}) || destinationSnapshot.data()?.deleting) fail(404, "MODULE_NOT_FOUND", "That destination module no longer exists.");
      const foundDestination = destinationSnapshot!;
      storageModuleId = foundDestination.id;
      destinationModuleData = foundDestination.data() || {};
    } else {
      const limits = assertCreationEntitled(entitlement);
      assertModuleLimit(userModules.length, limits, entitlement.planName);
      storageModuleId = newModuleId;
      const maxOrder = userModules.reduce((max, item) => Math.max(max, number(item.data().sortOrder)), -SORT_STEP);
      createdModuleData = moduleData(uid, {
        productId: official.productId,
        productTitle: official.productTitle,
        title: newModuleInput!.value.title,
        description: newModuleInput!.value.description,
        sortOrder: maxOrder + SORT_STEP,
        now,
      });
      destinationModuleData = createdModuleData;
    }

    const targetResources = resourcesInStorageModule(inventory.resources, storageModuleId);
    const targetDuplicate = duplicateSnapshots.find((item) => storageModuleIdOf(item) === storageModuleId);
    if (targetDuplicate) {
      result = {
        resource: resourcePayload(uid, targetDuplicate, destinationModuleData),
        alreadyExists: true,
        existingState: destinationState,
        existingModuleId: destinationState === "module" ? storageModuleId : null,
        usage: inventory.usage,
      };
      return;
    }

    // Add-to-module consumes a prior Saved snapshot instead of creating a
    // second account-wide resource. Copies in other real modules remain valid.
    const savedDuplicate = destinationState === "module"
      ? duplicateSnapshots.find((item) => isSystemModule(moduleFromInventory(inventory.modules, storageModuleIdOf(item))?.data() || {}))
      : null;
    const limits = entitlement.entitled ? entitlement.limits : null;
    if (savedDuplicate) {
      assertPerModuleLimit(targetResources.length, limits, entitlement.planName);
      const sourceParentId = storageModuleIdOf(savedDuplicate);
      const sourceParent = moduleFromInventory(inventory.modules, sourceParentId);
      const oldData = savedDuplicate.data() || {};
      const data = {
        ...oldData,
        ownerUid: uid,
        source: "personal",
        personalModuleId: storageModuleId,
        storageModuleId,
        state: "module",
        productId: text(destinationModuleData?.productId || official.productId),
        sortOrder: nextSortOrder(targetResources),
        updatedAt: now,
      };
      const destinationRef = moduleCollection(db, uid).doc(storageModuleId);
      const targetRef = destinationRef.collection("resources").doc(resourceId);
      if (createdModuleData) tx.create(destinationRef, { ...createdModuleData, resourceCount: 1 });
      else tx.update(destinationRef, { resourceCount: targetResources.length + 1, updatedAt: now });
      if (sourceParent) tx.update(sourceParent.ref, { resourceCount: Math.max(0, resourcesInStorageModule(inventory.resources, sourceParentId).length - 1), updatedAt: now });
      tx.create(targetRef, data);
      tx.delete(savedDuplicate.ref);
      if (createdModuleData) tx.set(usageRef(db, uid), usagePayload(userModules.length + 1, inventory.resources.length, now), { merge: false });
      const fake = { id: resourceId, data: () => data, ref: targetRef } as unknown as DocSnapshot;
      const moduleFake = createdModuleData ? { id: newModuleId, data: () => ({ ...createdModuleData, resourceCount: 1 }), ref: destinationRef } as unknown as DocSnapshot : null;
      result = {
        resource: resourcePayload(uid, fake, destinationModuleData),
        module: moduleFake ? modulePayload(uid, moduleFake, [resourcePayload(uid, fake, destinationModuleData)]) : undefined,
        alreadyExists: false,
        movedFromSaved: true,
        usage: usagePayload(userModules.length + (createdModuleData ? 1 : 0), inventory.resources.length, now),
      };
      return;
    }

    const creationLimits = assertCreationEntitled(entitlement);
    assertResourceTypeAllowed(entitlement, official.cleaned.value.type);
    assertResourceLimit(inventory.resources.length, creationLimits, entitlement.planName);
    if (destinationState === "module") assertPerModuleLimit(targetResources.length, creationLimits, entitlement.planName);
    const data = buildResourceData({
      uid,
      cleaned: official.cleaned,
      productId: destinationState === "module" ? text(destinationModuleData?.productId || official.productId) : official.productId,
      storageModuleId,
      personalModuleId: destinationState === "module" ? storageModuleId : null,
      origin,
      identity,
      sortOrder: nextSortOrder(destinationState === "saved" ? savedResourcesFromInventory(inventory.modules, inventory.resources) : targetResources),
      now,
    });
    const destinationRef = moduleCollection(db, uid).doc(storageModuleId);
    const targetRef = destinationRef.collection("resources").doc(resourceId);
    if (destinationState === "saved") {
      tx.set(destinationRef, { ...systemBucketData(uid, official.productId, official.productTitle, now, destinationModuleData || undefined), resourceCount: targetResources.length + 1 }, { merge: true });
    } else if (createdModuleData) {
      tx.create(destinationRef, { ...createdModuleData, resourceCount: 1 });
    } else {
      tx.update(destinationRef, { resourceCount: targetResources.length + 1, updatedAt: now });
    }
    tx.create(targetRef, data);
    const nextUsage = usagePayload(userModules.length + (createdModuleData ? 1 : 0), inventory.resources.length + 1, now);
    tx.set(usageRef(db, uid), nextUsage, { merge: false });
    const fake = { id: resourceId, data: () => data, ref: targetRef } as unknown as DocSnapshot;
    const payload = resourcePayload(uid, fake, destinationState === "saved" ? { system: true, kind: "saved" } : destinationModuleData);
    const moduleFake = createdModuleData ? { id: newModuleId, data: () => ({ ...createdModuleData, resourceCount: 1 }), ref: destinationRef } as unknown as DocSnapshot : null;
    result = {
      resource: payload,
      module: moduleFake ? modulePayload(uid, moduleFake, [payload]) : undefined,
      alreadyExists: false,
      movedFromSaved: false,
      usage: nextUsage,
    };
  });
  return result!;
}

async function updateResource(db: Db, uid: string, body: Body) {
  const storageModuleId = safeId(body.storageModuleId || body.moduleId, "Module id");
  const resourceId = safeId(body.resourceId, "Resource id");
  const ref = moduleCollection(db, uid).doc(storageModuleId).collection("resources").doc(resourceId);
  const cleaned = cleanResourceInput(body);
  let resource: ReturnType<typeof resourcePayload> | null = null;

  await db.runTransaction(async (tx) => {
    const entitlement = await readEntitlementInTransaction(tx, db, uid);
    const [resourceSnapshot, parentSnapshot, siblings] = await Promise.all([
      tx.get(ref),
      tx.get(moduleCollection(db, uid).doc(storageModuleId)),
      tx.get(moduleCollection(db, uid).doc(storageModuleId).collection("resources").limit(PERSONAL_PER_MODULE_LIMIT_MAX + 10)),
    ]);
    if (!resourceSnapshot.exists || text(resourceSnapshot.data()?.ownerUid) !== uid || !parentSnapshot.exists || text(parentSnapshot.data()?.ownerUid) !== uid) fail(404, "RESOURCE_NOT_FOUND", "That resource no longer exists.");
    if (Boolean(parentSnapshot.data()?.deleting)) fail(409, "MODULE_DELETING", "That module is being deleted. Refresh your library and try again.");
    const old = resourceSnapshot.data() || {};
    if (cleaned.value.type !== text(old.type)) {
      assertCreationEntitled(entitlement);
      assertResourceTypeAllowed(entitlement, cleaned.value.type);
    }
    const origin = allowedOrigin(old.origin);
    const nextIdentity = identityKey({ ...cleaned.value, origin });
    const duplicate = siblings.docs.find((item) => item.id !== resourceId && identityOfSnapshot(item) === nextIdentity);
    if (duplicate) fail(409, "DUPLICATE_RESOURCE", "That resource is already in this destination.");
    const now = Date.now();
    const data = buildResourceData({
      uid,
      cleaned,
      productId: text(old.productId || parentSnapshot.data()?.productId || GLOBAL_USAGE_ID),
      storageModuleId,
      personalModuleId: isSystemModule(parentSnapshot.data() || {}) ? null : storageModuleId,
      origin,
      identity: nextIdentity,
      sortOrder: number(old.sortOrder),
      now,
      existing: old,
    });
    tx.set(ref, data, { merge: false });
    resource = resourcePayload(uid, { ...resourceSnapshot, data: () => data } as unknown as DocSnapshot, parentSnapshot.data() || null);
  });
  return { resource };
}

async function deleteResource(db: Db, uid: string, body: Body) {
  const storageModuleId = safeId(body.storageModuleId || body.moduleId, "Module id");
  const resourceId = safeId(body.resourceId, "Resource id");
  let nextUsage: ReturnType<typeof usagePayload> | null = null;

  await db.runTransaction(async (tx) => {
    // IMPORTANT: inventory + target/parent reads all precede delete/update.
    // Inventory also reconciles a legacy/missing usage document, so a direct
    // delete request cannot underflow an account-wide counter.
    const inventory = await readUsageAndInventoryInTransaction(tx, db, uid);
    const snapshot = inventory.resources.find((item) => storageModuleIdOf(item) === storageModuleId && item.id === resourceId);
    const parentSnapshot = moduleFromInventory(inventory.modules, storageModuleId);
    if (!snapshot || !parentSnapshot) fail(404, "RESOURCE_NOT_FOUND", "That resource no longer exists.");
    const resourceRef = snapshot!.ref;
    const moduleRef = parentSnapshot!.ref;
    const parentResources = resourcesInStorageModule(inventory.resources, storageModuleId);
    const count = Math.max(0, parentResources.length - 1);
    nextUsage = usagePayload(inventory.usage.moduleCount, Math.max(0, inventory.resources.length - 1), Date.now());
    tx.delete(resourceRef);
    tx.update(moduleRef, { resourceCount: count, updatedAt: Date.now() });
    tx.set(usageRef(db, uid), nextUsage, { merge: false });
  });
  return { resourceId, storageModuleId, usage: nextUsage };
}

async function reorderResource(db: Db, uid: string, body: Body) {
  const storageModuleId = safeId(body.storageModuleId || body.moduleId, "Module id");
  const resourceId = safeId(body.resourceId, "Resource id");
  const toIndex = Math.floor(number(body.toIndex, -1));
  if (toIndex < 0) fail(400, "INVALID_ORDER", "Choose a valid resource position.");
  let orderedIds: string[] = [];
  await db.runTransaction(async (tx) => {
    const inventory = await readUsageAndInventoryInTransaction(tx, db, uid);
    const parent = moduleFromInventory(inventory.modules, storageModuleId);
    if (!parent || Boolean(parent.data()?.deleting)) fail(404, "RESOURCE_NOT_FOUND", "That resource no longer exists.");
    const resources = (isSystemModule(parent!.data() || {})
      ? inventory.resources.filter((item) => isSystemModule(moduleFromInventory(inventory.modules, storageModuleIdOf(item))?.data() || {}))
      : resourcesInStorageModule(inventory.resources, storageModuleId))
      .sort((a, b) => number(a.data()?.sortOrder) - number(b.data()?.sortOrder) || timestampMs(a.data()?.createdAt) - timestampMs(b.data()?.createdAt));
    const from = resources.findIndex((item) => item.id === resourceId && storageModuleIdOf(item) === storageModuleId);
    if (from < 0) fail(404, "RESOURCE_NOT_FOUND", "That resource no longer exists.");
    const destination = Math.min(toIndex, resources.length - 1);
    orderedIds = applyOrderMove(tx, resources, from, destination).map((item) => item.id);
  });
  return { orderedIds, storageModuleId };
}

async function moveResource(db: Db, uid: string, body: Body) {
  const fromStorageModuleId = safeId(body.fromStorageModuleId || body.storageModuleId || body.moduleId, "Source module id");
  const resourceId = safeId(body.resourceId, "Resource id");
  const toState = text(body.destination) === "saved" || !text(body.toModuleId) ? "saved" : "module";
  const explicitToModuleId = toState === "module" ? safeId(body.toModuleId, "Destination module id") : "";
  let result: Body | null = null;

  await db.runTransaction(async (tx) => {
    const entitlement = await readEntitlementInTransaction(tx, db, uid);
    const inventory = await readUsageAndInventoryInTransaction(tx, db, uid);
    const sourceSnapshot = inventory.resources.find((item) => storageModuleIdOf(item) === fromStorageModuleId && item.id === resourceId);
    const sourceParent = moduleFromInventory(inventory.modules, fromStorageModuleId);
    if (!sourceSnapshot || !sourceParent) fail(404, "RESOURCE_NOT_FOUND", "That resource no longer exists.");
    const sourceResource = sourceSnapshot!;
    const sourceModule = sourceParent!;
    if (Boolean(sourceModule.data()?.deleting)) fail(409, "MODULE_DELETING", "That source module is being deleted. Refresh your library and try again.");
    const old = sourceResource.data() || {};
    const origin = allowedOrigin(old.origin);
    const contextProductId = text((origin.kind === "official" ? origin.productId : old.productId) || GLOBAL_USAGE_ID);
    const contextProductTitle = text((origin.kind === "official" ? origin.productTitle : sourceModule.data()?.productTitle));
    const toStorageModuleId = toState === "module" ? explicitToModuleId : savedBucketId(contextProductId);
    if (toStorageModuleId === fromStorageModuleId) {
      result = { resource: resourcePayload(uid, sourceResource, sourceModule.data() || null), moved: false, usage: inventory.usage };
      return;
    }
    const destinationParent = moduleFromInventory(inventory.modules, toStorageModuleId);
    if (toState === "module" && (!destinationParent || isSystemModule(destinationParent.data() || {}) || destinationParent.data()?.deleting)) {
      fail(404, "MODULE_NOT_FOUND", "That destination module no longer exists.");
    }
    const targetResources = resourcesInStorageModule(inventory.resources, toStorageModuleId);
    const identity = identityOfSnapshot(sourceResource);
    const duplicatePool = toState === "saved"
      ? savedResourcesFromInventory(inventory.modules, inventory.resources).filter((item) => item.ref.path !== sourceResource.ref.path)
      : targetResources;
    if (duplicatePool.some((item) => identityOfSnapshot(item) === identity)) fail(409, "DUPLICATE_RESOURCE", "That resource is already in this destination.");
    if (toState === "module" && entitlement.entitled) assertPerModuleLimit(targetResources.length, entitlement.limits, entitlement.planName);
    const now = Date.now();
    const targetId = targetResources.some((item) => item.id === resourceId) ? makeId("pr") : resourceId;
    const targetParentRef = moduleCollection(db, uid).doc(toStorageModuleId);
    const targetRef = targetParentRef.collection("resources").doc(targetId);
    const data = {
      ...old,
      ownerUid: uid,
      source: "personal",
      personalModuleId: toState === "module" ? toStorageModuleId : null,
      storageModuleId: toStorageModuleId,
      state: toState,
      productId: toState === "module" ? text(destinationParent?.data()?.productId || old.productId) : contextProductId,
      sortOrder: nextSortOrder(toState === "saved" ? savedResourcesFromInventory(inventory.modules, inventory.resources) : targetResources),
      updatedAt: now,
      identityKey: identity,
    };
    const sourceCount = Math.max(0, resourcesInStorageModule(inventory.resources, fromStorageModuleId).length - 1);
    tx.update(sourceModule.ref, { resourceCount: sourceCount, updatedAt: now });
    if (toState === "saved") {
      tx.set(targetParentRef, { ...systemBucketData(uid, contextProductId, contextProductTitle, now, destinationParent?.data()), resourceCount: targetResources.length + 1 }, { merge: true });
    } else {
      tx.update(targetParentRef, { resourceCount: targetResources.length + 1, updatedAt: now });
    }
    tx.create(targetRef, data);
    tx.delete(sourceResource.ref);
    const fake = { id: targetId, data: () => data, ref: targetRef } as unknown as DocSnapshot;
    result = {
      resource: resourcePayload(uid, fake, toState === "saved" ? { system: true, kind: "saved" } : destinationParent?.data() || null),
      moved: true,
      fromStorageModuleId,
      usage: inventory.usage,
    };
  });
  return result!;
}

async function markResourceOpened(db: Db, uid: string, body: Body) {
  const storageModuleId = safeId(body.storageModuleId || body.moduleId, "Module id");
  const resourceId = safeId(body.resourceId, "Resource id");
  const ref = moduleCollection(db, uid).doc(storageModuleId).collection("resources").doc(resourceId);
  const lastOpenedAt = Date.now();
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists || text(snapshot.data()?.ownerUid) !== uid) fail(404, "RESOURCE_NOT_FOUND", "That resource no longer exists.");
    tx.update(ref, { lastOpenedAt });
  });
  return { resourceId, storageModuleId, lastOpenedAt };
}

export async function handlePersonalCourse(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return json(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Use POST." });
  }

  let action = "";
  try {
    const uid = await authenticate(req);
    const body: Body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Body : {};
    action = text(body.action);
    const db = adminDb();
    let data: unknown;

    switch (action) {
      case "personalCourse.status": data = await handleStatus(db, uid); break;
      case "personalCourse.list": data = await listLibrary(db, uid); break;
      case "personalCourse.library": data = await handleLibrary(db, uid); break;
      case "personalCourse.module.create": data = await createModule(db, uid, body); break;
      case "personalCourse.module.update": data = await updateModule(db, uid, body); break;
      case "personalCourse.module.delete": data = await deleteModule(db, uid, body); break;
      case "personalCourse.module.reorder": data = await reorderModule(db, uid, body); break;
      case "personalCourse.resource.create": data = await createManualResource(db, uid, body); break;
      case "personalCourse.resource.update": data = await updateResource(db, uid, body); break;
      case "personalCourse.resource.delete": data = await deleteResource(db, uid, body); break;
      case "personalCourse.resource.reorder": data = await reorderResource(db, uid, body); break;
      case "personalCourse.resource.move": data = await moveResource(db, uid, body); break;
      case "personalCourse.resource.open": data = await markResourceOpened(db, uid, body); break;
      case "personalCourse.official.add": data = await addOfficialResource(db, uid, body); break;
      default: fail(400, "UNKNOWN_ACTION", "Unknown My Study Library action.");
    }
    return json(res, 200, { ok: true, data });
  } catch (error) {
    if (error instanceof ApiError) return json(res, error.status, { ok: false, code: error.code, message: error.message, details: error.details });
    const status = error && typeof error === "object" && "statusCode" in error
      ? number((error as { statusCode?: unknown }).statusCode, 500)
      : 500;
    console.error("[personal-course] unexpected error", error);
    // A failed READ must never be described as a failed UPDATE. The library
    // screen and the course-player AI both reach this branch while merely
    // loading, and "couldn't be updated" sent learners hunting for a write that
    // never happened.
    const reading = LIBRARY_READ_ACTIONS.has(action);
    return json(res, status, {
      ok: false,
      code: status === 503 ? "SERVER_CONFIGURATION" : "SERVER_ERROR",
      message: status === 503
        ? "My Study Library is temporarily unavailable. Please try again shortly."
        : reading
          ? "Your library couldn't be loaded. Nothing was changed — please try again."
          : "My Study Library couldn't be updated. Please try again.",
    });
  }
}
