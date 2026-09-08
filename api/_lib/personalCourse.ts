// api/_lib/personalCourse.ts
//
// Server-authoritative Personal Course Modules ("My Modules") API.
//
// Everything a learner can DO with their personal course content runs through
// this handler (dispatched from /api/personal-course, which shares the
// deployed 12-function-cap serverless slot — see api/referral-leaderboard.ts
// + vercel.json):
//
//   · the authenticated uid comes ONLY from the verified Firebase ID token —
//     a client-supplied ownerUid is never read, let alone trusted;
//   · entitlement (plan, cycle, status, expiry) + limits + allowed resource
//     types are re-derived from the LIVE subscription + plan documents on
//     every create, inside a Firestore transaction — editing localStorage,
//     React state or network payloads can never enable the feature;
//   · limits (module / total resource / per-module resource) are enforced
//     transactionally against server-maintained usage counters;
//   · every payload is validated + canonicalized by the shared pure layer
//     (utils/personalCourse.js) — the SAME code the UI forms use, so there is
//     exactly one normalization path and no client-side bypass;
//   · writes go ONLY to `users/{uid}/personalCourseModules/**` +
//     `users/{uid}/personalCourseUsage/{productId}` — official course
//     documents are never written through this flow.
//
// Firestore rules keep these paths owner-READABLE (so the Course Player can
// listen live) but client-write is denied; only the Admin SDK (this file)
// creates/updates/deletes them.

import { randomBytes } from "node:crypto";
import type { Transaction, DocumentReference, DocumentData } from "firebase-admin/firestore";
import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import {
  PERSONAL_MODULE_LIMIT_MAX,
  isPersonalCourseType,
  normalizePersonalResourceUrl,
  personalAllowedTypes,
  personalCourseTypeLabel,
  personalLimitMessage,
  resolvePersonalModulesEntitlement,
  sanitizePersonalModuleInput,
  sanitizePersonalResourceInput,
  usageAtModuleLimit,
  usageAtPerModuleLimit,
  usageAtResourceLimit,
  type PlanPersonalModulesConfig,
  type PersonalModulesEntitlement,
} from "../../utils/personalCourse.js";
import type { CourseFileType } from "../../src/types/course";

type Db = ReturnType<typeof adminDb>;
type DocRef = DocumentReference<DocumentData>;
type DocSnap = Awaited<ReturnType<DocRef["get"]>>;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);

/** Minimum ms between two server-side create/delete mutations on one user+course. */
const MIN_MUTATION_GAP_MS = 600;
/** Cap on per-transaction reorder writes (Firestore txn write limit is 500). */
const REORDER_WRITE_LIMIT = 200;
/** Batch size for resource deletes during module deletion. */
const DELETE_BATCH_SIZE = 300;

const collectionRef = (db: Db, uid: string) => db.collection("users").doc(uid).collection("personalCourseModules");
const moduleRef = (db: Db, uid: string, moduleId: string) => collectionRef(db, uid).doc(moduleId);
const resourcesRef = (db: Db, uid: string, moduleId: string) => moduleRef(db, uid, moduleId).collection("resources");
const resourceRef = (db: Db, uid: string, moduleId: string, resourceId: string) =>
  resourcesRef(db, uid, moduleId).doc(resourceId);
const usageRef = (db: Db, uid: string, productId: string) =>
  db.collection("users").doc(uid).collection("personalCourseUsage").doc(productId);

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${randomBytes(6).toString("hex")}`;
const httpError = (code: string, message: string, statusCode = 400) => {
  const error = new Error(message) as Error & { statusCode?: number; code?: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};
const readBody = (req: VercelRequest): Record<string, unknown> => {
  if (typeof req.body === "string") {
    try {
      return asRecord(JSON.parse(req.body));
    } catch {
      return {};
    }
  }
  return asRecord(req.body);
};

/** The product must exist and carry course content. */
const productIsCourse = async (db: Db, productId: string): Promise<boolean> => {
  const snap = await db.collection("siteProducts").doc(productId).get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  return Boolean(
    Array.isArray(data.courseContent) || Array.isArray(data.canonicalModules) || Array.isArray(data.modules) || data.courseContent,
  );
};

type EntitlementContext = { record: Record<string, unknown> | null; planRaw: unknown; planId: string };

/**
 * Read the live subscription record + plan doc — the ONLY entitlement source.
 * Works inside a transaction (pass `tx`) or standalone. Reads the canonical
 * `users/{uid}/subscription/current` document — the same path every other
 * server + client surface reads (api/_lib/subscriptions.ts
 * `loadCurrentSubscription`, src/hooks/useCourseAccess.ts,
 * src/lib/sharedSnapshot.ts, utils/subscriptionOwnership.js).
 */
const loadEntitlementContext = async (db: Db, uid: string, tx?: Transaction): Promise<EntitlementContext> => {
  const recordRef = db.collection("users").doc(uid).collection("subscription").doc("current");
  let recordSnap: DocSnap | null = null;
  try {
    recordSnap = tx ? await tx.get(recordRef) : await recordRef.get();
  } catch {
    recordSnap = null;
  }
  const record = recordSnap?.exists ? recordSnap.data() || null : null;
  const planId = String(record?.planId || "").trim();
  let planRaw: unknown = null;
  if (planId) {
    try {
      const planSnap = tx
        ? await tx.get(db.collection("subscriptionPlans").doc(planId))
        : await db.collection("subscriptionPlans").doc(planId).get();
      planRaw = planSnap.exists ? planSnap.data() : null;
    } catch {
      planRaw = null;
    }
  }
  return { record, planRaw, planId };
};

const entitlementOf = (context: EntitlementContext) =>
  resolvePersonalModulesEntitlement({ record: context.record, plan: context.planRaw });

type UsageSnapshot = { moduleCount: number; resourceCount: number; lastWriteAt: number };

const readUsage = async (db: Db, uid: string, productId: string): Promise<UsageSnapshot> => {
  const snap = await usageRef(db, uid, productId).get();
  const data = snap.exists ? (snap.data() || {}) : {};
  return {
    moduleCount: Math.max(0, Math.round(Number(data.moduleCount) || 0)),
    resourceCount: Math.max(0, Math.round(Number(data.resourceCount) || 0)),
    lastWriteAt: Math.max(0, Number(data.lastWriteAt) || 0),
  };
};

const readUsageInTx = async (tx: Transaction, db: Db, uid: string, productId: string): Promise<UsageSnapshot> => {
  const snap = await tx.get(usageRef(db, uid, productId));
  return snap.exists ? {
    moduleCount: Math.max(0, Math.round(Number(snap.data()?.moduleCount) || 0)),
    resourceCount: Math.max(0, Math.round(Number(snap.data()?.resourceCount) || 0)),
    lastWriteAt: Math.max(0, Number(snap.data()?.lastWriteAt) || 0),
  } : { moduleCount: 0, resourceCount: 0, lastWriteAt: 0 };
};

const touchUsage = (tx: Transaction, usageRefTarget: DocRef, patch: Partial<UsageSnapshot>) => {
  const stamp = Date.now();
  tx.set(usageRefTarget, {
    ...patch,
    lastWriteAt: stamp,
    updatedAt: stamp,
  }, { merge: true });
};

const assertMutationGap = (usage: UsageSnapshot) => {
  if (Date.now() - usage.lastWriteAt < MIN_MUTATION_GAP_MS) {
    throw httpError("RATE_LIMITED", "That was a bit fast — wait a moment and try again.", 429);
  }
};

/** Shared create-gate: entitlement + module/resource limit checks in-tx. */
const assertCanCreateModuleOrResource = (
  entitlement: PersonalModulesEntitlement,
  usage: UsageSnapshot,
  kind: "module" | "resource",
  perModuleCount = 0,
) => {
  if (!entitlement.entitled) {
    throw httpError(
      entitlement.status === "disabled" ? "FEATURE_DISABLED" : "NOT_ENTITLED",
      entitlement.status === "disabled"
        ? "Personal Course Modules are disabled for your current plan."
        : "Personal Course Modules are available on eligible subscription plans.",
      403,
    );
  }
  if (kind === "module" && usageAtModuleLimit(usage, entitlement.limits)) {
    throw httpError("MODULE_LIMIT_REACHED", personalLimitMessage("module", entitlement.limits, entitlement.planName), 409);
  }
  if (kind === "resource" && usageAtResourceLimit(usage, entitlement.limits)) {
    throw httpError("RESOURCE_LIMIT_REACHED", personalLimitMessage("resource", entitlement.limits, entitlement.planName), 409);
  }
  if (kind === "resource" && usageAtPerModuleLimit(perModuleCount, entitlement.limits)) {
    throw httpError("PER_MODULE_LIMIT_REACHED", personalLimitMessage("per-module", entitlement.limits, entitlement.planName), 409);
  }
};

// ---------------------------------------------------------------------------
// Reads: status + list
// ---------------------------------------------------------------------------

const handleStatus = async (db: Db, uid: string, productId: string) => {
  const context = await loadEntitlementContext(db, uid);
  const entitlement = entitlementOf(context);
  // No course selected yet → no usage counters exist; never build a path
  // with an empty document id (Firestore rejects `doc("")`).
  const usage = productId
    ? await readUsage(db, uid, productId)
    : { moduleCount: 0, resourceCount: 0, lastWriteAt: 0 };
  const config = entitlement.config as PlanPersonalModulesConfig | null;
  const allowed = entitlement.entitled && config
    ? personalAllowedTypes({ ...config, enabled: true, contentStorageEnabled: true }, entitlement.cycle || "monthly")
        .filter((type) => type !== "embed" || config.customEmbedEnabled !== false)
    : [];
  return {
    ok: true,
    access: {
      state: entitlement.status,
      entitled: entitlement.entitled,
      disabled: entitlement.disabled,
      planId: entitlement.planId,
      planName: entitlement.planName,
      cycle: entitlement.cycle,
      featureId: "personal-modules",
      reason: entitlement.reason,
      moduleCount: usage.moduleCount,
      resourceCount: usage.resourceCount,
      limits: entitlement.limits,
      allowedTypes: allowed,
      typeLimit: allowed.length,
    },
    usage,
  };
};

const handleList = async (db: Db, uid: string, productId: string) => {
  const modules: Array<Record<string, unknown>> = [];
  const snap = await collectionRef(db, uid).orderBy("sortOrder", "asc").limit(PERSONAL_MODULE_LIMIT_MAX).get();
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (String(data.productId || "") !== productId) continue;
    if (String(data.ownerUid || "") !== uid) continue;
    const resources = await resourcesRef(db, uid, doc.id).orderBy("sortOrder", "asc").limit(PERSONAL_MODULE_LIMIT_MAX).get();
    modules.push({
      id: doc.id,
      ...data,
      resources: resources.docs.map((resource) => ({ id: resource.id, ...(resource.data() || {}) })),
    });
  }
  return { ok: true, modules };
};

// ---------------------------------------------------------------------------
// Module mutations
// ---------------------------------------------------------------------------

const handleModuleCreate = async (db: Db, uid: string, productId: string, body: Record<string, unknown>) => {
  if (!productId) throw httpError("INVALID_PRODUCT", "Course id is required.", 400);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(productId)) throw httpError("INVALID_PRODUCT", "This course id isn't valid.", 400);
  if (!(await productIsCourse(db, productId))) {
    throw httpError("PRODUCT_NOT_FOUND", "This course doesn't exist or has no course content.", 404);
  }
  const cleaned = sanitizePersonalModuleInput(body);
  if (!cleaned.ok) throw httpError("VALIDATION_FAILED", cleaned.errors.map((e) => e.message).join(" "), 400);
  const moduleId = newId("pm");
  const stamp = Date.now();
  await db.runTransaction(async (tx) => {
    const context = await loadEntitlementContext(db, uid, tx);
    const entitlement = entitlementOf(context);
    const usage = await readUsageInTx(tx, db, uid, productId);
    assertMutationGap(usage);
    assertCanCreateModuleOrResource(entitlement, usage, "module");
    const lastDoc = await tx.get(collectionRef(db, uid).orderBy("sortOrder", "desc").limit(1));
    const nextSort = lastDoc.docs.length > 0
      ? Math.max(0, Number(lastDoc.docs[0].data()?.sortOrder || 0)) + 1
      : 0;
    tx.set(moduleRef(db, uid, moduleId), {
      id: moduleId,
      ownerUid: uid,
      productId,
      title: cleaned.value.title,
      description: cleaned.value.description,
      sortOrder: nextSort,
      resourceCount: 0,
      createdAt: stamp,
      updatedAt: stamp,
    });
    touchUsage(tx, usageRef(db, uid, productId), { moduleCount: usage.moduleCount + 1 });
  });
  return { ok: true, moduleId, message: "Module created." };
};

const handleModuleUpdate = async (db: Db, uid: string, moduleId: string, body: Record<string, unknown>) => {
  if (!moduleId) throw httpError("INVALID_MODULE", "Module id is required.", 400);
  const cleaned = sanitizePersonalModuleInput(body);
  if (!cleaned.ok) throw httpError("VALIDATION_FAILED", cleaned.errors.map((e) => e.message).join(" "), 400);
  const ref = moduleRef(db, uid, moduleId);
  const snap = await ref.get();
  if (!snap.exists || String(snap.data()?.ownerUid || "") !== uid) throw httpError("MODULE_NOT_FOUND", "This module doesn't exist.", 404);
  await ref.update({ title: cleaned.value.title, description: cleaned.value.description, updatedAt: Date.now() });
  return { ok: true, moduleId, message: "Module updated." };
};

const handleModuleDelete = async (db: Db, uid: string, moduleId: string) => {
  if (!moduleId) throw httpError("INVALID_MODULE", "Module id is required.", 400);
  const ref = moduleRef(db, uid, moduleId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true, moduleId, deleted: false, message: "Module already gone." };
  if (String(snap.data()?.ownerUid || "") !== uid) throw httpError("MODULE_NOT_FOUND", "This module doesn't exist.", 404);
  const productId = String(snap.data()?.productId || "");
  const usageBefore = await usageRef(db, uid, productId).get().catch(() => null);
  const usageData = usageBefore?.exists ? (usageBefore.data() || {}) : {};
  const usageModuleCount = Math.max(0, Math.round(Number(usageData.moduleCount) || 0));
  const usageResourceCount = Math.max(0, Math.round(Number(usageData.resourceCount) || 0));
  // Delete the resources in bounded batches (module resource cap is bounded
  // by the per-module limit, but stay well under the 500-write txn limit).
  let deletedResources = 0;
  for (;;) {
    const batch = db.batch();
    const resourceSnap = await resourcesRef(db, uid, moduleId).limit(DELETE_BATCH_SIZE).get();
    if (resourceSnap.size === 0) break;
    for (const resource of resourceSnap.docs) batch.delete(resource.ref);
    await batch.commit();
    deletedResources += resourceSnap.size;
    if (resourceSnap.size < DELETE_BATCH_SIZE) break;
  }
  await ref.delete();
  // Absolute-count update keeps the usage doc deterministic even when the
  // module doc is already gone (double-tab delete) or usage was never seeded.
  await usageRef(db, uid, productId).set(
    {
      moduleCount: Math.max(0, usageModuleCount - 1),
      resourceCount: Math.max(0, usageResourceCount - deletedResources),
      lastWriteAt: Date.now(),
      updatedAt: Date.now(),
    },
    { merge: true },
  );
  return { ok: true, moduleId, deleted: true, message: "Module deleted." };
};

/** Transactional list reorder shared by module + resource moves. */
const reorderModule = async (db: Db, uid: string, moduleId: string, toIndex: number) => {
  if (!moduleId) throw httpError("INVALID_MODULE", "Module id is required.", 400);
  const snap = await moduleRef(db, uid, moduleId).get();
  if (!snap.exists || String(snap.data()?.ownerUid || "") !== uid) throw httpError("MODULE_NOT_FOUND", "This module doesn't exist.", 404);
  await db.runTransaction(async (tx) => {
    const query = collectionRef(db, uid);
    const owned = await tx.get(query.orderBy("sortOrder", "asc").limit(PERSONAL_MODULE_LIMIT_MAX));
    const docs = owned.docs.filter((doc) => String((doc.data() || {}).ownerUid || "") === uid);
    if (docs.length > REORDER_WRITE_LIMIT) throw httpError("ORDER_TOO_LARGE", "This list is too large to reorder in one step.", 409);
    const currentIndex = docs.findIndex((doc) => doc.id === moduleId);
    if (currentIndex === -1) throw httpError("MODULE_NOT_FOUND", "This module doesn't exist.", 404);
    const ordered = docs.map((doc) => doc.id);
    ordered.splice(currentIndex, 1);
    const clamped = Math.min(Math.max(toIndex, 0), ordered.length);
    ordered.splice(clamped, 0, moduleId);
    const stamp = Date.now();
    for (let index = 0; index < ordered.length; index += 1) {
      const doc = docs.find((item) => item.id === ordered[index]);
      if (!doc) continue;
      if (Number((doc.data() || {}).sortOrder || 0) !== index) {
        tx.update(doc.ref, { sortOrder: index, updatedAt: stamp });
      }
    }
  });
  return { ok: true, moduleId, message: "Module moved." };
};

const reorderResource = async (db: Db, uid: string, moduleId: string, resourceId: string, toIndex: number) => {
  if (!moduleId || !resourceId) throw httpError("INVALID_RESOURCE", "Resource id is required.", 400);
  const modSnap = await moduleRef(db, uid, moduleId).get();
  if (!modSnap.exists || String(modSnap.data()?.ownerUid || "") !== uid) throw httpError("MODULE_NOT_FOUND", "This module doesn't exist.", 404);
  const resourceSnap = await resourceRef(db, uid, moduleId, resourceId).get();
  if (!resourceSnap.exists || String(resourceSnap.data()?.ownerUid || "") !== uid) {
    throw httpError("RESOURCE_NOT_FOUND", "This resource doesn't exist.", 404);
  }
  await db.runTransaction(async (tx) => {
    const query = resourcesRef(db, uid, moduleId);
    const owned = await tx.get(query.orderBy("sortOrder", "asc").limit(PERSONAL_MODULE_LIMIT_MAX));
    const docs = owned.docs.filter((doc) => String((doc.data() || {}).ownerUid || "") === uid);
    if (docs.length > REORDER_WRITE_LIMIT) throw httpError("ORDER_TOO_LARGE", "This list is too large to reorder in one step.", 409);
    const currentIndex = docs.findIndex((doc) => doc.id === resourceId);
    if (currentIndex === -1) throw httpError("RESOURCE_NOT_FOUND", "This resource doesn't exist.", 404);
    const ordered = docs.map((doc) => doc.id);
    ordered.splice(currentIndex, 1);
    const clamped = Math.min(Math.max(toIndex, 0), ordered.length);
    ordered.splice(clamped, 0, resourceId);
    const stamp = Date.now();
    for (let index = 0; index < ordered.length; index += 1) {
      const doc = docs.find((item) => item.id === ordered[index]);
      if (!doc) continue;
      if (Number((doc.data() || {}).sortOrder || 0) !== index) {
        tx.update(doc.ref, { sortOrder: index, updatedAt: stamp });
      }
    }
  });
  return { ok: true, resourceId, moduleId, message: "Resource moved." };
};

// ---------------------------------------------------------------------------
// Resource mutations
// ---------------------------------------------------------------------------

/** Plan-gate a resource type (allowed list + custom-embed switch). */
const resourceTypeBlock = (entitlement: PersonalModulesEntitlement, type: string): string | null => {
  if (!entitlement.entitled || !entitlement.cycle) return "NOT_ENTITLED";
  const config = entitlement.config as PlanPersonalModulesConfig;
  if (type === "embed" && config.customEmbedEnabled === false) return "EMBED_DISABLED";
  return personalAllowedTypes(
    { ...config, enabled: true, customEmbedEnabled: true, contentStorageEnabled: true },
    entitlement.cycle,
  ).includes(type as CourseFileType)
    ? null
    : "TYPE_NOT_ALLOWED";
};

const typeBlockError = (type: string, blocked: string) => {
  if (blocked === "NOT_ENTITLED") {
    return httpError("NOT_ENTITLED", "Personal Course Modules are available on eligible subscription plans.", 403);
  }
  if (blocked === "EMBED_DISABLED") {
    return httpError("TYPE_NOT_ALLOWED", '"Embed / Website" resources are disabled on your plan.', 403);
  }
  return httpError("TYPE_NOT_ALLOWED", `"${personalCourseTypeLabel(type)}" isn't included in your plan's allowed resource types.`, 403);
};

const handleResourceCreate = async (db: Db, uid: string, moduleId: string, body: Record<string, unknown>) => {
  if (!moduleId) throw httpError("INVALID_MODULE", "Module id is required.", 400);
  const resourceId = newId("pr");
  const stamp = Date.now();
  await db.runTransaction(async (tx) => {
    const modSnap = await tx.get(moduleRef(db, uid, moduleId));
    if (!modSnap.exists || String(modSnap.data()?.ownerUid || "") !== uid) {
      throw httpError("MODULE_NOT_FOUND", "This module doesn't exist.", 404);
    }
    const mod = modSnap.data() || {};
    const productId = String(mod.productId || "");
    const context = await loadEntitlementContext(db, uid, tx);
    const entitlement = entitlementOf(context);
    const type = String(body.type || "");
    const blocked = resourceTypeBlock(entitlement, type);
    if (blocked) throw typeBlockError(type, blocked);
    const usage = await readUsageInTx(tx, db, uid, productId);
    assertMutationGap(usage);
    const perModuleCount = Math.max(0, Math.round(Number(mod.resourceCount) || 0));
    assertCanCreateModuleOrResource(entitlement, usage, "resource", perModuleCount);
    const cleaned = sanitizePersonalResourceInput(body, { allowedTypes: null });
    if (!cleaned.ok) throw httpError("VALIDATION_FAILED", cleaned.errors.map((e) => e.message).join(" "), 400);
    tx.set(resourceRef(db, uid, moduleId, resourceId), {
      id: resourceId,
      ownerUid: uid,
      productId,
      personalModuleId: moduleId,
      type: cleaned.value.type,
      name: cleaned.value.name,
      description: cleaned.value.description,
      url: cleaned.value.url,
      embedUrl: cleaned.value.embedUrl,
      youtubeUrl: cleaned.value.youtubeUrl,
      youtubeVideoId: cleaned.value.youtubeVideoId,
      provider: cleaned.value.provider,
      contentType: cleaned.value.contentType,
      sourceUrl: cleaned.value.sourceUrl,
      sortOrder: perModuleCount,
      metadata: cleaned.value.metadata,
      createdAt: stamp,
      updatedAt: stamp,
    });
    tx.update(moduleRef(db, uid, moduleId), { resourceCount: perModuleCount + 1, updatedAt: stamp });
    touchUsage(tx, usageRef(db, uid, productId), { resourceCount: usage.resourceCount + 1 });
  });
  return { ok: true, resourceId, moduleId, message: "Resource added." };
};

const handleResourceUpdate = async (db: Db, uid: string, moduleId: string, resourceId: string, body: Record<string, unknown>) => {
  if (!moduleId || !resourceId) throw httpError("INVALID_RESOURCE", "Resource id is required.", 400);
  const ref = resourceRef(db, uid, moduleId, resourceId);
  const snap = await ref.get();
  if (!snap.exists || String(snap.data()?.ownerUid || "") !== uid) throw httpError("RESOURCE_NOT_FOUND", "This resource doesn't exist.", 404);
  const existing = snap.data() || {};
  const nextType = typeof body.type === "string" && isPersonalCourseType(body.type)
    ? String(body.type)
    : String(existing.type || "");
  const urlProvided = typeof body.url === "string" && String(body.url).trim().length > 0;
  const url = urlProvided
    ? String(body.url).trim()
    : String(existing.url || "") || String(existing.embedUrl || "");

  // Editing is free; only switching to a type the plan forbids (or turning a
  // resource into a custom embed when embeds are off) is blocked.
  if (nextType !== String(existing.type || "")) {
    const context = await loadEntitlementContext(db, uid);
    const entitlement = entitlementOf(context);
    const blocked = resourceTypeBlock(entitlement, nextType);
    if (blocked) throw typeBlockError(nextType, blocked);
  }

  const normalized = normalizePersonalResourceUrl(nextType, url);
  if (!normalized.ok) throw httpError("VALIDATION_FAILED", normalized.message, 400);
  const cleaned = sanitizePersonalResourceInput({
    type: nextType,
    name: typeof body.name === "string" ? body.name : String(existing.name || ""),
    description: typeof body.description === "string" ? body.description : String(existing.description || ""),
    url: normalized.canonical.url || url,
  });
  if (!cleaned.ok) throw httpError("VALIDATION_FAILED", cleaned.errors.map((e) => e.message).join(" "), 400);
  const canonical = normalized.canonical;
  await ref.update({
    type: nextType,
    name: cleaned.value.name,
    description: cleaned.value.description,
    url: cleaned.value.url,
    embedUrl: canonical.embedUrl ?? cleaned.value.embedUrl,
    youtubeUrl: canonical.youtubeUrl ?? cleaned.value.youtubeUrl,
    youtubeVideoId: canonical.youtubeVideoId ?? cleaned.value.youtubeVideoId,
    provider: canonical.provider ?? cleaned.value.provider,
    contentType: canonical.contentType ?? cleaned.value.contentType,
    sourceUrl: urlProvided ? url.slice(0, 2048) : String(existing.sourceUrl || ""),
    updatedAt: Date.now(),
  });
  return { ok: true, resourceId, moduleId, message: "Resource updated." };
};

const handleResourceDelete = async (db: Db, uid: string, moduleId: string, resourceId: string) => {
  if (!moduleId || !resourceId) throw httpError("INVALID_RESOURCE", "Resource id is required.", 400);
  const ref = resourceRef(db, uid, moduleId, resourceId);
  const snap = await ref.get();
  if (!snap.exists) return { ok: true, resourceId, moduleId, deleted: false, message: "Resource already gone." };
  if (String(snap.data()?.ownerUid || "") !== uid) throw httpError("RESOURCE_NOT_FOUND", "This resource doesn't exist.", 404);
  const productId = String(snap.data()?.productId || "");
  await db.runTransaction(async (tx) => {
    tx.delete(ref);
    const modSnap = await tx.get(moduleRef(db, uid, moduleId));
    if (modSnap.exists) {
      const count = Math.max(0, Math.round(Number(modSnap.data()?.resourceCount) || 0) - 1);
      tx.update(modSnap.ref, { resourceCount: count, updatedAt: Date.now() });
    }
    const usage = await readUsageInTx(tx, db, uid, productId);
    touchUsage(tx, usageRef(db, uid, productId), { resourceCount: Math.max(0, usage.resourceCount - 1) });
  });
  return { ok: true, resourceId, moduleId, deleted: true, message: "Resource deleted." };
};

// ---------------------------------------------------------------------------
// Handler + dispatch
// ---------------------------------------------------------------------------

export async function handlePersonalCourse(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const user = await requireFirebaseUser(req);
    const uid = user.uid;
    const db = adminDb();
    const body = readBody(req);
    const action = String(body.action || "").trim();
    const productId = text(body.productId, 128);
    const moduleId = text(body.moduleId, 128);
    const resourceId = text(body.resourceId, 128);
    const toIndex = Math.round(Number(body.toIndex));
    const validIndex = Number.isFinite(toIndex) && toIndex >= 0;

    let payload: Record<string, unknown>;
    switch (action) {
      case "personalCourse.status":
        payload = await handleStatus(db, uid, productId);
        break;
      case "personalCourse.list":
        payload = await handleList(db, uid, productId);
        break;
      case "personalCourse.module.create":
        payload = await handleModuleCreate(db, uid, productId, body);
        break;
      case "personalCourse.module.update":
        payload = await handleModuleUpdate(db, uid, moduleId, body);
        break;
      case "personalCourse.module.delete":
        payload = await handleModuleDelete(db, uid, moduleId);
        break;
      case "personalCourse.module.move":
        if (!validIndex) throw httpError("INVALID_ORDER", "Choose a valid position for the module.", 400);
        payload = await reorderModule(db, uid, moduleId, toIndex);
        break;
      case "personalCourse.resource.create":
        payload = await handleResourceCreate(db, uid, moduleId, body);
        break;
      case "personalCourse.resource.update":
        payload = await handleResourceUpdate(db, uid, moduleId, resourceId, body);
        break;
      case "personalCourse.resource.delete":
        payload = await handleResourceDelete(db, uid, moduleId, resourceId);
        break;
      case "personalCourse.resource.move":
        if (!validIndex) throw httpError("INVALID_ORDER", "Choose a valid position for the resource.", 400);
        payload = await reorderResource(db, uid, moduleId, resourceId, toIndex);
        break;
      default:
        throw httpError("UNKNOWN_ACTION", "Unknown personal course action.", 400);
    }
    res.status(200).json(payload);
  } catch (error) {
    errorResponse(res, error, "Could not update your personal course content.");
  }
}
