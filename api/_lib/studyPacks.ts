// Study Packs + Study Stacks — shareable snapshots of personal modules.
// Dispatched from referral-leaderboard on studyPack.* / studyStack.*

import { createHash, randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { adminDb, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import {
  isPersonalTypeAllowed,
  isValidPersonalId,
  personalLimitMessage,
  resolvePersonalModulesEntitlement,
  sanitizePersonalModuleInput,
  sanitizePersonalResourceInput,
} from "../../utils/personalCourse.js";
import { personalResourceIdentityDescriptor } from "../../utils/personalLibrary.js";
import {
  countResourceTypes,
  importMonthKey,
  isValidStudyPackId,
  normalizePlanStudyPacks,
  packAvailabilitySummary,
  sanitizeStudyPackMeta,
  studyPacksCycle,
} from "../../utils/studyPacks.js";

type Body = Record<string, unknown>;
type Db = Firestore;

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
const json = (res: VercelResponse, status: number, body: unknown) => res.status(status).json(body);
const text = (value: unknown) => String(value == null ? "" : value).trim();
const number = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const GLOBAL_USAGE_ID = "__library__";
const SORT_STEP = 1024;
const USAGE_SCHEMA_VERSION = 2;
const GENERIC_CREATOR = "Shared by a Digitalcatalyst learner";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const identityKey = (raw: Record<string, unknown>) => `v1_${hash(personalResourceIdentityDescriptor(raw))}`;
const makePackId = () => `spk${randomUUID().replace(/-/g, "").slice(0, 22)}`;
const makeId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "")}`;

async function optionalUid(req: VercelRequest): Promise<string | null> {
  try {
    const decoded = await requireFirebaseUser(req);
    return text(decoded.uid) || null;
  } catch {
    return null;
  }
}

async function requireUid(req: VercelRequest): Promise<string> {
  const uid = await optionalUid(req);
  if (!uid) fail(401, "AUTH_REQUIRED", "Sign in to continue.");
  return uid;
}

const packCollection = (db: Db) => db.collection("studyPacks");
const moduleCollection = (db: Db, uid: string) => db.collection("users").doc(uid).collection("personalCourseModules");
const usageRef = (db: Db, uid: string) => db.collection("users").doc(uid).collection("personalCourseUsage").doc(GLOBAL_USAGE_ID);
const stackCollection = (db: Db, uid: string) => db.collection("users").doc(uid).collection("studyStacks");
const packUsageRef = (db: Db, uid: string) => db.collection("users").doc(uid).collection("studyPackUsage").doc("current");

async function readPlan(db: Db, uid: string) {
  const subscriptionSnapshot = await db.collection("users").doc(uid).collection("subscription").doc("current").get();
  const record = subscriptionSnapshot.exists ? subscriptionSnapshot.data() || {} : {};
  const planId = text(record.planId);
  const planSnapshot = planId ? await db.collection("subscriptionPlans").doc(planId).get() : null;
  const plan = planSnapshot?.exists ? { id: planSnapshot.id, ...(planSnapshot.data() || {}) } : (planId ? { id: planId } : {});
  const personal = resolvePersonalModulesEntitlement({ record, plan });
  const cycle = personal.cycle || "monthly";
  const packs = studyPacksCycle(normalizePlanStudyPacks(plan, planId), cycle);
  return { personal, packs, cycle, planId, planName: personal.planName };
}

const publicResource = (row: Body, includeUrls: boolean) => {
  const type = text(row.type || "embed");
  const availability = packAvailabilitySummary([{ id: text(row.id), name: text(row.name), type }])[0];
  return {
    id: text(row.id),
    name: text(row.name || "Resource"),
    description: text(row.description),
    type,
    sortOrder: number(row.sortOrder),
    availability,
    ...(includeUrls
      ? {
          sourceUrl: text(row.sourceUrl || row.url),
          url: text(row.url),
          embedUrl: text(row.embedUrl),
          youtubeUrl: text(row.youtubeUrl),
          youtubeVideoId: text(row.youtubeVideoId),
          provider: text(row.provider),
          contentType: text(row.contentType),
          originKind: text(row.originKind) === "official" ? "official" : "manual",
        }
      : {}),
  };
};

const publicPack = (id: string, data: Body, viewerUid: string | null) => {
  const visibility = text(data.visibility) || "unlisted";
  const isOwner = Boolean(viewerUid && viewerUid === text(data.ownerUid));
  const resources = Array.isArray(data.resources) ? data.resources as Body[] : [];
  const typeCounts = countResourceTypes(resources);
  return {
    id,
    title: text(data.title),
    description: text(data.description),
    visibility,
    version: number(data.version, 1),
    createdAt: number(data.createdAt),
    updatedAt: number(data.updatedAt),
    creatorDisplayName: text(data.creatorDisplayName) || GENERIC_CREATOR,
    resourceCount: resources.length,
    typeCounts,
    moduleTitle: text(data.sourceModuleTitle),
    resources: resources.map((row) => publicResource(row, isOwner)),
    isOwner,
    aiStudyAvailable: resources.some((row) => Boolean(text(row.description))),
  };
};

function canViewPack(data: Body, viewerUid: string | null) {
  const visibility = text(data.visibility) || "unlisted";
  const owner = text(data.ownerUid);
  if (visibility === "public" || visibility === "unlisted") return true;
  return Boolean(viewerUid && viewerUid === owner);
}

async function loadOwnedModule(db: Db, uid: string, moduleId: string) {
  if (!isValidPersonalId(moduleId)) fail(400, "INVALID_ID", "Module id is invalid.");
  const snapshot = await moduleCollection(db, uid).doc(moduleId).get();
  if (!snapshot.exists || text(snapshot.data()?.ownerUid) !== uid || snapshot.data()?.system || snapshot.data()?.deleting) {
    fail(404, "MODULE_NOT_FOUND", "That module isn't in your library.");
  }
  const resourcesSnap = await snapshot.ref.collection("resources").limit(400).get();
  const resources = resourcesSnap.docs
    .filter((item) => text(item.data()?.ownerUid) === uid)
    .map((item) => ({ id: item.id, ...(item.data() || {}) }));
  return { module: { id: snapshot.id, ...(snapshot.data() || {}) }, resources };
}

async function createPack(db: Db, uid: string, body: Body) {
  const meta = sanitizeStudyPackMeta(body);
  if (!meta.ok) fail(400, "VALIDATION", meta.errors[0]?.message || "Check the pack details.", meta.errors);
  const plan = await readPlan(db, uid);
  if (!plan.packs.creationEnabled) fail(403, "PACK_CREATION_DISABLED", "Study Pack creation isn't included on your current plan. Existing packs remain available.");
  const published = await packCollection(db).where("ownerUid", "==", uid).limit(Math.max(plan.packs.maxPublishedPacks, 0) + 20).get();
  if (plan.packs.maxPublishedPacks >= 0 && published.size >= plan.packs.maxPublishedPacks) {
    fail(409, "PACK_CREATION_LIMIT", `You've reached your ${plan.packs.maxPublishedPacks} Study Pack limit.`);
  }
  const moduleId = text(body.moduleId);
  const loaded = await loadOwnedModule(db, uid, moduleId);
  const selectedIds = Array.isArray(body.resourceIds) ? body.resourceIds.map((item) => text(item)).filter(Boolean) : [];
  const chosen = selectedIds.length
    ? loaded.resources.filter((item) => selectedIds.includes(text((item as Body).id)))
    : loaded.resources;
  if (!chosen.length) fail(400, "VALIDATION", "Choose at least one resource.");
  const snapshotResources = chosen.map((item, index) => {
    const row = item as Body;
    const cleaned = sanitizePersonalResourceInput({
      type: row.type,
      name: row.name,
      description: row.description,
      url: row.sourceUrl || row.url || row.youtubeVideoId,
    });
    if (!cleaned.ok) return null;
    return {
      id: text(row.id) || makeId("pr"),
      ...cleaned.value,
      originKind: text(row.originKind) === "official" ? "official" : "manual",
      sortOrder: number(row.sortOrder, index * SORT_STEP),
      identityKey: text(row.identityKey) || identityKey(cleaned.value as unknown as Record<string, unknown>),
    };
  }).filter(Boolean);
  if (!snapshotResources.length) fail(400, "VALIDATION", "None of the selected resources could be shared safely.");
  const now = Date.now();
  const id = makePackId();
  const userSnap = await db.collection("users").doc(uid).get();
  const user = userSnap.data() || {};
  const allowName = user.publicDisplayNameEnabled === true || user.shareDisplayName === true;
  const displayName = allowName ? (text(user.displayName || user.name) || GENERIC_CREATOR) : GENERIC_CREATOR;
  const doc = {
    ownerUid: uid,
    publicId: id,
    title: meta.value.title,
    description: meta.value.description,
    visibility: meta.value.visibility,
    version: 1,
    createdAt: now,
    updatedAt: now,
    creatorDisplayName: displayName,
    sourceModuleId: moduleId,
    sourceModuleTitle: text((loaded.module as Body).title),
    resources: snapshotResources,
  };
  await packCollection(db).doc(id).set(doc);
  return { pack: publicPack(id, doc, uid), sharePath: `#/pack/${id}` };
}

async function updatePack(db: Db, uid: string, body: Body) {
  const id = text(body.packId);
  if (!isValidStudyPackId(id)) fail(400, "INVALID_ID", "Unknown Study Pack.");
  const ref = packCollection(db).doc(id);
  const snap = await ref.get();
  if (!snap.exists || text(snap.data()?.ownerUid) !== uid) fail(404, "PACK_NOT_FOUND", "That Study Pack isn't available.");
  const existing = snap.data() || {};
  const meta = sanitizeStudyPackMeta({
    title: body.title ?? existing.title,
    description: body.description ?? existing.description,
    visibility: body.visibility ?? existing.visibility,
  });
  if (!meta.ok) fail(400, "VALIDATION", meta.errors[0]?.message || "Check the pack details.", meta.errors);
  let resources = Array.isArray(existing.resources) ? existing.resources : [];
  if (body.refresh === true && text(existing.sourceModuleId)) {
    const loaded = await loadOwnedModule(db, uid, text(existing.sourceModuleId));
    resources = loaded.resources.map((item, index) => {
      const row = item as Body;
      const cleaned = sanitizePersonalResourceInput({
        type: row.type,
        name: row.name,
        description: row.description,
        url: row.sourceUrl || row.url || row.youtubeVideoId,
      });
      if (!cleaned.ok) return null;
      return { id: text(row.id), ...cleaned.value, originKind: text(row.originKind) === "official" ? "official" : "manual", sortOrder: number(row.sortOrder, index * SORT_STEP) };
    }).filter(Boolean);
  }
  const now = Date.now();
  const next = {
    ...existing,
    title: meta.value.title,
    description: meta.value.description,
    visibility: meta.value.visibility,
    resources,
    version: number(existing.version, 1) + 1,
    updatedAt: now,
  };
  await ref.set(next, { merge: false });
  return { pack: publicPack(id, next, uid) };
}

async function getPack(db: Db, packId: string, viewerUid: string | null) {
  if (!isValidStudyPackId(packId)) fail(400, "INVALID_ID", "Unknown Study Pack.");
  const snap = await packCollection(db).doc(packId).get();
  if (!snap.exists) fail(404, "PACK_NOT_FOUND", "This Study Pack isn't available.");
  const data = snap.data() || {};
  if (!canViewPack(data, viewerUid)) fail(404, "PACK_NOT_FOUND", "This Study Pack isn't available.");
  return { pack: publicPack(snap.id, data, viewerUid) };
}

async function listMine(db: Db, uid: string) {
  const snap = await packCollection(db).where("ownerUid", "==", uid).limit(80).get();
  return { packs: snap.docs.map((item) => publicPack(item.id, item.data() || {}, uid)) };
}

async function discoverPublic(db: Db) {
  const snap = await packCollection(db).where("visibility", "==", "public").limit(24).get();
  const packs = snap.docs
    .map((item) => publicPack(item.id, item.data() || {}, null))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return { packs };
}

async function importPack(db: Db, uid: string, body: Body) {
  const packId = text(body.packId);
  if (!isValidStudyPackId(packId)) fail(400, "INVALID_ID", "Unknown Study Pack.");
  const packSnap = await packCollection(db).doc(packId).get();
  if (!packSnap.exists) fail(404, "PACK_NOT_FOUND", "This Study Pack isn't available.");
  const pack = packSnap.data() || {};
  if (!canViewPack(pack, uid)) fail(404, "PACK_NOT_FOUND", "This Study Pack isn't available.");
  const plan = await readPlan(db, uid);
  if (!plan.personal.entitled) fail(403, "PLAN_REQUIRED", "An eligible plan is required to import into My Study Library.");
  const usageSnap = await packUsageRef(db, uid).get();
  const usage = usageSnap.data() || {};
  const month = importMonthKey();
  const importsThisMonth = text(usage.monthKey) === month ? number(usage.importsThisMonth) : 0;
  if (plan.packs.maxImportsPerMonth >= 0 && importsThisMonth >= plan.packs.maxImportsPerMonth) {
    fail(409, "IMPORT_LIMIT", `You've reached this month's import limit (${plan.packs.maxImportsPerMonth}).`);
  }
  const rawResources = Array.isArray(pack.resources) ? pack.resources as Body[] : [];
  const cleanedResources = rawResources.map((row) => {
    const cleaned = sanitizePersonalResourceInput({
      type: row.type,
      name: row.name,
      description: row.description,
      url: row.sourceUrl || row.url || row.youtubeVideoId,
    });
    if (!cleaned.ok) return null;
    if (!isPersonalTypeAllowed(plan.personal.config, plan.cycle, cleaned.value.type)) return null;
    return { cleaned, identity: identityKey({ ...cleaned.value, origin: { kind: "manual", createdAt: Date.now() } }) };
  }).filter(Boolean) as Array<{ cleaned: Extract<ReturnType<typeof sanitizePersonalResourceInput>, { ok: true }>; identity: string }>;
  if (!cleanedResources.length) fail(400, "VALIDATION", "Nothing in this pack can be imported on your plan.");

  const destination = text(body.destination) === "existing" ? "existing" : "new";
  const now = Date.now();
  let moduleId = destination === "existing" ? text(body.moduleId) : "";
  const moduleTitle = text(body.title) || text(pack.title) || "Imported Study Pack";
  const moduleDescription = text(body.description) || `Imported from Study Pack`;

  const result = await db.runTransaction(async (tx) => {
    const modulesSnap = await tx.get(moduleCollection(db, uid).limit(200));
    const usageDoc = await tx.get(usageRef(db, uid));
    const userModules = modulesSnap.docs.filter((item) => !item.data()?.system && !item.data()?.deleting);
    const allResources: Array<{ id: string; data: () => Body; ref: { path: string }; parentId: string }> = [];
    for (const mod of modulesSnap.docs) {
      const resSnap = await tx.get(mod.ref.collection("resources").limit(400));
      for (const row of resSnap.docs) {
        allResources.push({ id: row.id, data: () => row.data() || {}, ref: row.ref, parentId: mod.id });
      }
    }
    const limits = plan.personal.limits;
    const existingIdentities = new Set(allResources.map((item) => text(item.data()?.identityKey)));
    const toAdd = cleanedResources.filter((item) => !existingIdentities.has(item.identity));
    if (!toAdd.length) {
      return { imported: 0, skipped: cleanedResources.length, moduleId: moduleId || null, alreadyExists: true };
    }
    if (limits && limits.resourceLimit >= 0 && allResources.length + toAdd.length > limits.resourceLimit) {
      fail(409, "RESOURCE_LIMIT", personalLimitMessage("resource", limits, plan.planName));
    }
    let parentRef;
    let parentData: Body = {};
    if (destination === "existing") {
      if (!isValidPersonalId(moduleId)) fail(400, "INVALID_ID", "Choose a destination module.");
      const found = modulesSnap.docs.find((item) => item.id === moduleId);
      if (!found || found.data()?.system || found.data()?.deleting) fail(404, "MODULE_NOT_FOUND", "That destination module no longer exists.");
      parentRef = found.ref;
      parentData = found.data() || {};
      const currentCount = allResources.filter((item) => item.parentId === moduleId).length;
      if (limits && limits.perModuleResourceLimit >= 0 && currentCount + toAdd.length > limits.perModuleResourceLimit) {
        fail(409, "PER_MODULE_LIMIT", personalLimitMessage("per-module", limits, plan.planName));
      }
    } else {
      if (limits && limits.moduleLimit >= 0 && userModules.length >= limits.moduleLimit) {
        fail(409, "MODULE_LIMIT", personalLimitMessage("module", limits, plan.planName));
      }
      const cleaned = sanitizePersonalModuleInput({ title: moduleTitle, description: moduleDescription });
      if (!cleaned.ok) fail(400, "VALIDATION", cleaned.errors[0]?.message || "Check the module details.");
      moduleId = makeId("pm");
      parentRef = moduleCollection(db, uid).doc(moduleId);
      const maxOrder = userModules.reduce((max, item) => Math.max(max, number(item.data()?.sortOrder)), -SORT_STEP);
      parentData = {
        ownerUid: uid,
        source: "personal",
        kind: "module",
        system: false,
        productId: GLOBAL_USAGE_ID,
        productTitle: "My Study Library",
        title: cleaned.value.title,
        description: cleaned.value.description,
        sortOrder: maxOrder + SORT_STEP,
        resourceCount: 0,
        createdAt: now,
        updatedAt: now,
        importedFromPackId: packId,
        importedFromPackTitle: text(pack.title),
      };
      tx.create(parentRef, parentData);
    }
    const currentInModule = allResources.filter((item) => item.parentId === (destination === "existing" ? moduleId : "")).length;
    let sort = currentInModule * SORT_STEP;
    for (const item of toAdd) {
      const resourceId = makeId("pr");
      const data = {
        ownerUid: uid,
        source: "personal",
        personalModuleId: moduleId,
        storageModuleId: moduleId,
        state: "module",
        productId: GLOBAL_USAGE_ID,
        ...item.cleaned.value,
        metadata: { ...(item.cleaned.value.metadata || {}), importedFromStudyPack: packId },
        identityKey: item.identity,
        originKind: "manual",
        origin: { kind: "manual", createdAt: now, importedFromPackId: packId },
        sortOrder: sort,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: null,
      };
      sort += SORT_STEP;
      tx.create(parentRef.collection("resources").doc(resourceId), data);
    }
    tx.update(parentRef, { resourceCount: currentInModule + toAdd.length, updatedAt: now });
    const nextModules = userModules.length + (destination === "new" ? 1 : 0);
    const nextResources = allResources.length + toAdd.length;
    tx.set(usageRef(db, uid), {
      schemaVersion: USAGE_SCHEMA_VERSION,
      scope: "account",
      moduleCount: nextModules,
      resourceCount: nextResources,
      updatedAt: now,
    }, { merge: false });
    tx.set(packUsageRef(db, uid), { monthKey: month, importsThisMonth: importsThisMonth + 1, updatedAt: now }, { merge: true });
    return { imported: toAdd.length, skipped: cleanedResources.length - toAdd.length, moduleId, alreadyExists: false };
  });
  return result;
}

async function deletePack(db: Db, uid: string, body: Body) {
  const id = text(body.packId);
  if (!isValidStudyPackId(id)) fail(400, "INVALID_ID", "Unknown Study Pack.");
  const ref = packCollection(db).doc(id);
  const snap = await ref.get();
  if (!snap.exists || text(snap.data()?.ownerUid) !== uid) fail(404, "PACK_NOT_FOUND", "That Study Pack isn't available.");
  await ref.delete();
  return { deleted: true, id };
}

async function createStack(db: Db, uid: string, body: Body) {
  const plan = await readPlan(db, uid);
  if (!plan.packs.studyStackEnabled) fail(403, "STACK_DISABLED", "Study Stacks aren't included on your current plan. Existing stacks remain available.");
  const existing = await stackCollection(db, uid).limit(Math.max(plan.packs.maxStudyStacks, 0) + 10).get();
  if (plan.packs.maxStudyStacks >= 0 && existing.size >= plan.packs.maxStudyStacks) {
    fail(409, "STACK_LIMIT", `You've reached your ${plan.packs.maxStudyStacks} Study Stack limit.`);
  }
  const title = text(body.title) || "Study Stack";
  const moduleId = text(body.moduleId);
  const loaded = await loadOwnedModule(db, uid, moduleId);
  const selectedIds = Array.isArray(body.resourceIds) ? body.resourceIds.map((item) => text(item)).filter(Boolean) : [];
  const steps = (selectedIds.length ? selectedIds : loaded.resources.map((item) => text((item as Body).id)))
    .map((id, index) => {
      const resource = loaded.resources.find((item) => text((item as Body).id) === id);
      if (!resource) return null;
      return {
        resourceId: id,
        storageModuleId: moduleId,
        name: text((resource as Body).name),
        type: text((resource as Body).type),
        kind: "resource",
        order: index,
      };
    })
    .filter(Boolean);
  if (body.includePractice === true) {
    steps.push({ resourceId: "", storageModuleId: moduleId, name: "Practice questions", type: "practice", kind: "practice", order: steps.length });
  }
  if (!steps.length) fail(400, "VALIDATION", "Choose at least one step.");
  const id = makeId("st");
  const now = Date.now();
  const doc = { ownerUid: uid, title: title.slice(0, 120), moduleId, steps, createdAt: now, updatedAt: now };
  await stackCollection(db, uid).doc(id).set(doc);
  return { stack: { id, ...doc } };
}

async function listStacks(db: Db, uid: string) {
  const snap = await stackCollection(db, uid).limit(80).get();
  return { stacks: snap.docs.map((item) => ({ id: item.id, ...(item.data() || {}) })) };
}

async function getStack(db: Db, uid: string, body: Body) {
  const id = text(body.stackId);
  if (!isValidPersonalId(id)) fail(400, "INVALID_ID", "Unknown Study Stack.");
  const snap = await stackCollection(db, uid).doc(id).get();
  if (!snap.exists || text(snap.data()?.ownerUid) !== uid) fail(404, "STACK_NOT_FOUND", "That Study Stack isn't available.");
  return { stack: { id: snap.id, ...(snap.data() || {}) } };
}

export async function handleStudyPacks(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return json(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Use POST." });
  }
  try {
    const body: Body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Body : {};
    const action = text(body.action);
    const db = adminDb();
    let data: unknown;
    if (action === "studyPack.get") {
      data = await getPack(db, text(body.packId), await optionalUid(req));
    } else if (action === "studyPack.discover") {
      data = await discoverPublic(db);
    } else {
      const uid = await requireUid(req);
      switch (action) {
        case "studyPack.create": data = await createPack(db, uid, body); break;
        case "studyPack.update": data = await updatePack(db, uid, body); break;
        case "studyPack.delete": data = await deletePack(db, uid, body); break;
        case "studyPack.mine": data = await listMine(db, uid); break;
        case "studyPack.import": data = await importPack(db, uid, body); break;
        case "studyStack.create": data = await createStack(db, uid, body); break;
        case "studyStack.list": data = await listStacks(db, uid); break;
        case "studyStack.get": data = await getStack(db, uid, body); break;
        default: fail(400, "UNKNOWN_ACTION", "Unknown Study Pack action.");
      }
    }
    return json(res, 200, { ok: true, data });
  } catch (error) {
    if (error instanceof ApiError) return json(res, error.status, { ok: false, code: error.code, message: error.message, details: error.details });
    console.error("[study-pack] unexpected error", error);
    return json(res, 500, { ok: false, code: "SERVER_ERROR", message: "Study Packs couldn't be updated. Please try again." });
  }
}
