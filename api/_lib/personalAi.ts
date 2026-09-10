// api/_lib/personalAi.ts
//
// Server-authoritative AI Study Engine for the learner's OWN modules
// (Part 2 — "Ask this Module").
//
// Dispatched from the existing multiplexer (`api/referral-leaderboard.ts`) on
// the `personalAi.*` action prefix, so it stays inside the Hobby 12-function
// cap and shares the deployed `/api/revision/generate` + `/api/personal-course`
// entry point.
//
// SECURITY POSTURE (audited path by path):
//   · uid comes ONLY from the verified Firebase ID token. A client-supplied
//     `ownerUid`/`uid` is never read.
//   · Every content read happens under `users/{uid}/personalCourseModules/**`,
//     so a request can only ever reach the caller's own modules and resources —
//     cross-user retrieval is impossible by construction, not by filter.
//   · AI artifacts, extraction cache, weak-topic evidence and chat threads are
//     written under `users/{uid}/personalAi/**` with `ownerUid` stamped from
//     the token. Firestore rules deny all client writes there, so a browser can
//     never plant, read or re-own another learner's AI data.
//   · Official course documents are never read into a personal-module context:
//     the grounding corpus is built exclusively from the resolved personal
//     scope, so unrelated course content cannot leak into an answer.
//   · Model output is normalised through the shared pure layer (strict caps,
//     markup stripped, provenance ids whitelisted against the units actually
//     sent) before it is stored or returned.
//
// AI INTEGRATION (no second AI backend):
//   · Provider adapters, the entitlement/allowance ledger and the transactional
//     reserve → call → finalise cycle are imported from the existing
//     `revisionAiRuntime` (api/_lib/revisionGenerate.ts).
//   · Grounding, retrieval, prompts, provenance, availability honesty and
//     artifact normalisation live in the shared pure layer
//     `utils/personalAi.js`, which the browser also imports — one vocabulary on
//     both sides.
//   · Content extraction (the only real read pipeline in the app) lives in
//     `api/_lib/personalAiContent.ts` and is cached per owner + resource.

import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { adminDb, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import { revisionAiRuntime, type RevisionAiConfig, type RevisionAiPolicy, type RevisionAiProviderUsage, type RevisionAiReservation } from "./revisionGenerate.js";
import { readResourceContent, type ContentExtraction } from "./personalAiContent.js";
import { isValidPersonalId } from "../../utils/personalCourse.js";
import { subscriptionUnlocksFeature } from "../../utils/subscriptions.js";
import {
  PERSONAL_AI_ARTIFACT_TTL_MS,
  PERSONAL_AI_FLASHCARD_DEFAULT,
  PERSONAL_AI_FLASHCARD_MAX,
  PERSONAL_AI_MAX_CHUNKS,
  PERSONAL_AI_MAX_CONTEXT_CHARS,
  PERSONAL_AI_MAX_HISTORY_MESSAGES,
  PERSONAL_AI_PLAN_DAY_DEFAULT,
  PERSONAL_AI_QUESTION_DEFAULT,
  PERSONAL_AI_QUESTION_MAX,
  PERSONAL_AI_QUESTION_CHARS_MAX,
  PERSONAL_AI_SYSTEM_PROMPT,
  PERSONAL_AI_WEAK_MAX_TOPICS,
  buildPersonalAiAskPrompt,
  buildPersonalAiExplainPrompt,
  buildPersonalAiFlashcardsPrompt,
  buildPersonalAiOrientationPrompt,
  buildPersonalAiPlanPrompt,
  buildPersonalAiQuestionsPrompt,
  buildPersonalAiSummaryPrompt,
  buildPersonalAiUnits,
  cleanAiText,
  isReusablePersonalAiArtifact,
  normalizePersonalAiAnswer,
  normalizePersonalAiExplanation,
  normalizePersonalAiFlashcards,
  normalizePersonalAiOrientation,
  normalizePersonalAiPlan,
  normalizePersonalAiQuestions,
  normalizePersonalAiSummary,
  personalAiContentHash,
  personalAiCoverage,
  personalAiFailure,
  personalAiHash,
  personalAiProvenance,
  personalAiReadPlan,
  personalAiSources,
  personalAiState,
  retrievePersonalAiChunks,
  stripAiMarkup,
  type PersonalAiChunk,
  type PersonalAiCoverage,
  type PersonalAiUnit,
} from "../../utils/personalAi.js";

const {
  asRecord,
  readBody,
  firstHeader,
  parseOwnConfig,
  loadSchoolConfig,
  loadAiSettings,
  resolveEffectiveAiPolicy,
  getUsageStatus,
  reserveUsage,
  releaseUsage,
  finalizeUsage,
  completeJsonText,
  findAiModelPrice,
  estimateTokensFromText,
  extractJson,
  isBudgetLow,
  enterHandler,
} = revisionAiRuntime;

type Body = Record<string, unknown>;
type Db = Firestore;

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

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

function fail(status: number, code: string, message: string, details?: unknown): never {
  throw new ApiError(status, code, message, details);
}

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

async function authenticate(req: VercelRequest): Promise<string> {
  try {
    const decoded = await requireFirebaseUser(req);
    const uid = text(decoded.uid);
    if (!uid) fail(401, "AUTH_REQUIRED", "Your sign-in session is invalid.");
    return uid;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const status = error && typeof error === "object" && "statusCode" in error
      ? number((error as { statusCode?: unknown }).statusCode, 401)
      : 401;
    fail(status === 401 || status === 403 ? 401 : status, "AUTH_REQUIRED", "Sign in again to use your module AI tutor.");
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* Scope resolution — owner-only, personal content only                */
/* ------------------------------------------------------------------ */

/** Resources read in ONE extraction pass; the rest report honest `processing`. */
const MAX_EXTRACT_PER_REQUEST = 8;
/** Wall-clock ceiling for the extraction phase, leaving room for the model. */
const EXTRACTION_BUDGET_MS = 14_000;
const MAX_RESOURCES_IN_SCOPE = 60;
const MAX_THREAD_MESSAGES = 40;

interface ScopeResource {
  id: string;
  storageModuleId: string;
  name: string;
  description: string;
  type: string;
  url: string;
  sourceUrl: string;
  originKind: "official" | "manual";
  provider: string;
  metadata: Record<string, string>;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface Scope {
  /** Public module id, or null for the Saved-for-Later bucket. */
  moduleId: string | null;
  /** Internal parent document id (always present). */
  storageModuleId: string;
  saved: boolean;
  module: { id: string; title: string; description: string; productId: string };
  resources: ScopeResource[];
  /** Set when the caller scoped the request to one resource. */
  resourceId: string | null;
}

const moduleCollection = (db: Db, uid: string) => db.collection("users").doc(uid).collection("personalCourseModules");

const toScopeResource = (uid: string, storageModuleId: string, snapshot: { id: string; data: () => Body | undefined }): ScopeResource | null => {
  const data = snapshot.data() || {};
  if (text(data.ownerUid) && text(data.ownerUid) !== uid) return null;
  const origin = asRecord(data.origin);
  const metadata = asRecord(data.metadata);
  return {
    id: snapshot.id,
    storageModuleId,
    name: text(data.name) || "Untitled resource",
    description: text(data.description),
    type: text(data.type) || "embed",
    url: text(data.url),
    sourceUrl: text(data.sourceUrl || data.url),
    originKind: text(data.originKind || origin.kind) === "official" ? "official" : "manual",
    provider: text(data.provider),
    metadata: Object.fromEntries(Object.entries(metadata).slice(0, 12).map(([key, value]) => [cleanAiText(key, 40), cleanAiText(value, 200)])),
    sortOrder: number(data.sortOrder),
    createdAt: timestampMs(data.createdAt),
    updatedAt: timestampMs(data.updatedAt) || timestampMs(data.createdAt),
  };
};

/** Stable, valid personal-id for an official Course Player conversation. */
function coursePlayerStorageId(productId: string): string {
  const cleaned = String(productId || "").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+/, "");
  const id = `cp_${cleaned || "course"}`.slice(0, 128);
  if (isValidPersonalId(id)) return id;
  return `cp_${personalAiHash(String(productId || "course"))}`.slice(0, 128);
}

/**
 * Course Player asks (official lessons) have no personal module. Build a
 * virtual owner-scoped shell so the existing ask path can run: empty
 * resources (honest — we never pretend to have extracted official files)
 * plus the published course/module/resource titles as the module brief.
 */
function virtualCoursePlayerScope(_uid: string, body: Body): Scope | null {
  const ctx = asRecord(body.courseContext);
  const productId = text(ctx.productId);
  if (!productId) return null;
  const storageModuleId = coursePlayerStorageId(productId);
  const courseTitle = text(ctx.courseTitle) || "Course";
  const moduleTitle = text(ctx.moduleTitle);
  const resourceName = text(ctx.resourceName);
  const resourceType = text(ctx.resourceType);
  const description = [moduleTitle, resourceName, resourceType].filter(Boolean).join(" · ");
  return {
    moduleId: null,
    storageModuleId,
    saved: false,
    module: {
      id: storageModuleId,
      title: courseTitle,
      description,
      productId,
    },
    resources: [],
    resourceId: null,
  };
}

/**
 * Ask from the Course Player: a valid personal module id uses the existing
 * personal-module path. Official lessons (no personal id, but a product
 * context) get a virtual owner-scoped shell so threads still persist under
 * `cp_*` without inventing official-file extraction.
 */
async function resolveAskScope(db: Db, uid: string, body: Body): Promise<Scope> {
  const requested = text(body.moduleId) || text(body.storageModuleId);
  if (requested && isValidPersonalId(requested)) {
    return resolveScope(db, uid, body);
  }
  const virtual = virtualCoursePlayerScope(uid, body);
  if (virtual) return virtual;
  return resolveScope(db, uid, body);
}

/**
 * Resolve the requested scope from the caller's OWN Firestore namespace.
 *
 * A module id / storage module id that does not exist under `users/{uid}` is a
 * 404 — which is also the answer for "someone else's module", so existence is
 * never leaked across accounts.
 */
async function resolveScope(db: Db, uid: string, body: Body): Promise<Scope> {
  const requestedModuleId = text(body.moduleId);
  const requestedStorageModuleId = text(body.storageModuleId);
  const requestedResourceId = text(body.resourceId);
  const storageModuleId = requestedModuleId || requestedStorageModuleId;
  if (!storageModuleId || !isValidPersonalId(storageModuleId)) {
    fail(400, "VALIDATION", "Choose a module first.");
  }
  const moduleRef = moduleCollection(db, uid).doc(storageModuleId);
  const moduleSnap = await moduleRef.get();
  if (!moduleSnap.exists) fail(404, "MODULE_NOT_FOUND", "That module isn't available to this account.");
  const moduleData = moduleSnap.data() || {};
  if (text(moduleData.ownerUid) && text(moduleData.ownerUid) !== uid) {
    fail(404, "MODULE_NOT_FOUND", "That module isn't available to this account.");
  }
  if (moduleData.deleting === true) fail(409, "MODULE_DELETING", "This module is being deleted.");
  const system = Boolean(moduleData.system) || text(moduleData.kind) === "saved";
  const resourcesSnap = await moduleRef.collection("resources").orderBy("sortOrder").limit(MAX_RESOURCES_IN_SCOPE + 10).get();
  const resources = resourcesSnap.docs
    .map((snapshot) => toScopeResource(uid, storageModuleId, snapshot))
    .filter((row): row is ScopeResource => Boolean(row))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.createdAt - b.createdAt);

  const resourceId = requestedResourceId && isValidPersonalId(requestedResourceId) ? requestedResourceId : null;
  if (resourceId && !resources.some((row) => row.id === resourceId)) {
    fail(404, "RESOURCE_NOT_FOUND", "That resource isn't in this module.");
  }
  const publicModuleId = system ? null : text(moduleData.id) || storageModuleId;
  return {
    moduleId: publicModuleId,
    storageModuleId,
    saved: system,
    module: {
      id: publicModuleId || storageModuleId,
      title: system ? "Saved for Later" : text(moduleData.title) || "Untitled module",
      description: system ? "" : text(moduleData.description),
      productId: text(moduleData.productId) || "__library__",
    },
    resources: resourceId ? resources.filter((row) => row.id === resourceId) : resources,
    resourceId,
  };
}

/* ------------------------------------------------------------------ */
/* Availability + grounding corpus                                     */
/* ------------------------------------------------------------------ */

interface ResourceAvailability {
  id: string;
  name: string;
  type: string;
  state: string;
  readable: boolean;
  reason: string;
  chars: number;
  planKind: string;
  originKind: "official" | "manual";
  provenance: string;
  fromCache: boolean;
}

const processingExtraction = (reason: string): ContentExtraction => ({
  status: "pending",
  text: "",
  chars: 0,
  reason,
  contentType: "",
  planKind: "none",
  fromCache: false,
  extractedAt: Date.now(),
});

/**
 * Read every resource in scope (bounded + cached) and turn the results into
 * honest availability rows plus the extracted-text map used for grounding.
 */
async function readScopeContent(
  db: Db,
  uid: string,
  scope: Scope,
  options: { refresh?: boolean } = {},
): Promise<{ availability: ResourceAvailability[]; extracted: Record<string, string>; readCount: number }> {
  const resources = scope.resources.slice(0, MAX_RESOURCES_IN_SCOPE);
  const attempts = resources.filter((row) => personalAiReadPlan(row).kind !== "none");
  const queued = attempts.slice(0, MAX_EXTRACT_PER_REQUEST);
  const deferred = attempts.slice(MAX_EXTRACT_PER_REQUEST);
  const startedAt = Date.now();

  const extractions = new Map<string, ContentExtraction>();
  const settled = await Promise.all(queued.map(async (resource) => {
    if (isBudgetLow(EXTRACTION_BUDGET_MS + 12_000) || Date.now() - startedAt > EXTRACTION_BUDGET_MS) {
      return [resource.id, processingExtraction("I ran out of time reading this file on this pass — open the module again and I'll continue.")] as const;
    }
    try {
      return [resource.id, await readResourceContent(db, uid, resource, { refresh: options.refresh })] as const;
    } catch {
      return [resource.id, processingExtraction("I couldn't read this file on this pass.")] as const;
    }
  }));
  for (const [resourceId, extraction] of settled) extractions.set(resourceId, extraction);
  for (const resource of deferred) {
    extractions.set(resource.id, processingExtraction(`This module has more files than one pass can read (I read the first ${MAX_EXTRACT_PER_REQUEST}). Open it again to continue.`));
  }

  const availability: ResourceAvailability[] = [];
  const extracted: Record<string, string> = {};
  for (const resource of resources) {
    const plan = personalAiReadPlan(resource);
    const extraction = extractions.get(resource.id)
      || (plan.kind === "none"
        ? { status: "unsupported", text: "", chars: 0, reason: plan.reason, contentType: "", planKind: plan.kind, fromCache: false, extractedAt: Date.now() } as ContentExtraction
        : processingExtraction("Not read on this pass."));
    const authored = Boolean(resource.description) || Boolean(Object.keys(resource.metadata).length);
    const state = personalAiState({ type: resource.type, plan, outcome: { status: extraction.status, chars: extraction.chars, reason: extraction.reason }, authored });
    availability.push({
      id: resource.id,
      name: resource.name,
      type: resource.type,
      state: state.state,
      readable: state.readable,
      reason: state.reason,
      chars: extraction.chars,
      planKind: plan.kind,
      originKind: resource.originKind,
      provenance: personalAiProvenance({
        scope: "resource",
        moduleTitle: scope.module.title,
        resourceName: resource.name,
        originKind: resource.originKind,
        saved: scope.saved,
      }).label,
      fromCache: extraction.fromCache,
    });
    if (extraction.status === "ok" && extraction.text) extracted[resource.id] = extraction.text;
  }
  return { availability, extracted, readCount: queued.length };
}

/** Notes the learner already wrote for this module (client-supplied, owner's own). */
const cleanClientNotes = (raw: unknown, scope: Scope): Record<string, { id: string; text: string }[]> => {
  const rows = Array.isArray(raw) ? raw : [];
  const grouped: Record<string, { id: string; text: string }[]> = {};
  for (const item of rows.slice(0, 60)) {
    const note = asRecord(item);
    const body = stripAiMarkup(note.text || note.html, 2000);
    if (!body) continue;
    const requestedResource = text(note.resourceId);
    const key = requestedResource && scope.resources.some((row) => row.id === requestedResource) ? requestedResource : "__module__";
    const list = grouped[key] || [];
    list.push({ id: cleanAiText(note.id, 64) || personalAiHash(body), text: body });
    grouped[key] = list.slice(0, 20);
  }
  return grouped;
};

interface Grounding {
  units: PersonalAiUnit[];
  coverage: PersonalAiCoverage;
  contentHash: string;
  availability: ResourceAvailability[];
  scopeLabel: string;
  readableResources: number;
}

/**
 * Build the grounding corpus for one request.
 *
 * A resource-scoped question gets ONLY that resource's units plus the module
 * brief — never the rest of the module, and never any official course content.
 */
function buildGrounding(scope: Scope, availability: ResourceAvailability[], extracted: Record<string, string>, notes: Record<string, unknown[]>): Grounding {
  const units = buildPersonalAiUnits({
    module: scope.module,
    saved: scope.saved,
    resources: scope.resources,
    availability: Object.fromEntries(availability.map((row) => [row.id, row])),
    extracted,
    notes,
  });
  const coverage = personalAiCoverage({ resources: availability });
  const scopeLabel = scope.resourceId
    ? `${personalAiProvenance({ scope: "resource", moduleTitle: scope.module.title, resourceName: scope.resources[0]?.name, originKind: scope.resources[0]?.originKind, saved: scope.saved }).label} (one resource)`
    : `${personalAiProvenance({ scope: "module", moduleTitle: scope.module.title, saved: scope.saved }).label} (whole module)`;
  return {
    units,
    coverage,
    contentHash: personalAiContentHash(units),
    availability,
    scopeLabel,
    readableResources: coverage.readable,
  };
}

/* ------------------------------------------------------------------ */
/* Artifacts (deterministic ids → reuse instead of regenerate)         */
/* ------------------------------------------------------------------ */

const artifactId = (scope: Scope, type: string) => {
  const scopeKey = `${scope.storageModuleId}${scope.resourceId ? `_${scope.resourceId}` : ""}`;
  return `${type}_${personalAiHash(scopeKey)}`;
};

const artifactCollection = (db: Db, uid: string) =>
  db.collection("users").doc(uid).collection("personalAi").doc("artifacts").collection("items");

const artifactRef = (db: Db, uid: string, id: string) => artifactCollection(db, uid).doc(id);

const threadRef = (db: Db, uid: string, storageModuleId: string) =>
  db.collection("users").doc(uid).collection("personalAi").doc("threads").collection("items").doc(storageModuleId);

/**
 * Weak-topic evidence lives in ONE bounded document per module — no queries, no
 * composite indexes, no unbounded collection growth.
 */
const evidenceRef = (db: Db, uid: string, storageModuleId: string) =>
  db.collection("users").doc(uid).collection("personalAi").doc("evidence").collection("items").doc(storageModuleId);

const normalizePayload = (type: string, raw: unknown, unitIds: string[]) => {
  switch (type) {
    case "module-summary":
    case "resource-summary":
      return normalizePersonalAiSummary(raw, unitIds);
    case "questions":
      return normalizePersonalAiQuestions(raw, unitIds);
    case "flashcards":
      return normalizePersonalAiFlashcards(raw, unitIds);
    case "study-plan":
      return normalizePersonalAiPlan(raw, unitIds);
    case "orientation":
      return normalizePersonalAiOrientation(raw, unitIds);
    case "explanation":
      return normalizePersonalAiExplanation(raw, unitIds);
    default:
      return normalizePersonalAiAnswer(raw, unitIds);
  }
};

/** True when a generated payload actually contains something worth storing. */
const payloadHasContent = (type: string, payload: Record<string, unknown>): boolean => {
  if (type === "module-summary" || type === "resource-summary") {
    const summary = payload as unknown as ReturnType<typeof normalizePersonalAiSummary>;
    return Boolean(summary.overview || summary.keyConcepts.length || summary.definitions.length || summary.takeaways.length);
  }
  if (type === "questions") return (payload as unknown as ReturnType<typeof normalizePersonalAiQuestions>).questions.length > 0;
  if (type === "flashcards") return (payload as unknown as ReturnType<typeof normalizePersonalAiFlashcards>).cards.length > 0;
  if (type === "study-plan") return (payload as unknown as ReturnType<typeof normalizePersonalAiPlan>).days.length > 0;
  if (type === "orientation") return Boolean((payload as unknown as ReturnType<typeof normalizePersonalAiOrientation>).orientation);
  if (type === "explanation") return Boolean((payload as unknown as ReturnType<typeof normalizePersonalAiExplanation>).explanation);
  return Boolean((payload as unknown as ReturnType<typeof normalizePersonalAiAnswer>).answer);
};

async function readArtifact(db: Db, uid: string, id: string) {
  try {
    const snapshot = await artifactRef(db, uid, id).get();
    if (!snapshot.exists) return null;
    const data = asRecord(snapshot.data());
    return {
      id: snapshot.id,
      ownerUid: uid,
      type: text(data.type),
      moduleId: text(data.moduleId),
      storageModuleId: text(data.storageModuleId),
      resourceId: text(data.resourceId) || null,
      payload: data.payload,
      contentHash: text(data.contentHash),
      coverage: asRecord(data.coverage),
      sources: Array.isArray(data.sources) ? data.sources : [],
      provider: text(data.provider),
      model: text(data.model),
      aiSource: text(data.aiSource),
      createdAt: timestampMs(data.createdAt),
      updatedAt: timestampMs(data.updatedAt),
      stale: data.stale === true,
    };
  } catch {
    return null;
  }
}

async function listArtifacts(db: Db, uid: string, storageModuleId: string) {
  try {
    const snapshot = await artifactCollection(db, uid)
      .where("storageModuleId", "==", storageModuleId)
      .limit(40)
      .get();
    const docs = snapshot.docs;
    return docs
      .filter((doc) => doc.exists)
      .map((doc) => {
        const data = asRecord(doc.data());
        return {
          id: doc.id,
          type: text(data.type),
          moduleId: text(data.moduleId),
          resourceId: text(data.resourceId) || null,
          contentHash: text(data.contentHash),
          createdAt: timestampMs(data.createdAt),
          updatedAt: timestampMs(data.updatedAt),
          summary: text(asRecord(data.coverage).sentence),
        };
      });
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Weak-topic evidence                                                 */
/* ------------------------------------------------------------------ */

const EVIDENCE_KINDS = ["question_incorrect", "question_repeated", "dont_understand", "flashcard_missed", "low_session_score"];
const MAX_EVIDENCE_EVENTS = 200;

interface EvidenceEvent {
  id: string;
  kind: string;
  topic: string;
  weight: number;
  at: number;
  moduleId: string | null;
  resourceId: string | null;
}

const toEvidenceEvent = (raw: unknown): EvidenceEvent | null => {
  const row = asRecord(raw);
  const kind = text(row.kind);
  const topic = cleanAiText(row.topic, 60);
  if (!EVIDENCE_KINDS.includes(kind) || topic.length < 2) return null;
  return {
    id: text(row.id) || personalAiHash(`${kind}${topic}${number(row.at)}`),
    kind,
    topic,
    weight: Math.max(0, Math.min(20, Math.round(number(row.weight)))),
    at: timestampMs(row.at) || Date.now(),
    moduleId: text(row.moduleId) || null,
    resourceId: text(row.resourceId) || null,
  };
};

async function loadEvidence(db: Db, uid: string, storageModuleId: string): Promise<EvidenceEvent[]> {
  try {
    const snapshot = await evidenceRef(db, uid, storageModuleId).get();
    if (!snapshot.exists) return [];
    const rows = asRecord(snapshot.data()).events;
    if (!Array.isArray(rows)) return [];
    return rows.map(toEvidenceEvent).filter((row): row is EvidenceEvent => Boolean(row)).slice(-MAX_EVIDENCE_EVENTS);
  } catch {
    return [];
  }
}

async function recordEvidence(db: Db, uid: string, body: Body, scope: Scope) {
  const kind = text(body.kind);
  if (!EVIDENCE_KINDS.includes(kind)) fail(400, "VALIDATION", "Unknown evidence kind.");
  const topic = cleanAiText(body.topic, 60);
  if (topic.length < 2) fail(400, "VALIDATION", "A topic is required to record weak-topic evidence.");
  const now = Date.now();
  const requestedResource = text(body.resourceId);
  const resourceId = requestedResource && scope.resources.some((row) => row.id === requestedResource)
    ? requestedResource
    : scope.resourceId || null;
  const event: EvidenceEvent = {
    id: `ev_${randomUUID().slice(0, 12)}`,
    kind,
    topic,
    // 0 lets the shared pure layer apply its canonical per-kind weight.
    weight: Math.max(0, Math.min(20, Math.round(number(body.weight)))),
    at: now,
    moduleId: scope.moduleId,
    resourceId,
  };
  const existing = await loadEvidence(db, uid, scope.storageModuleId);
  await evidenceRef(db, uid, scope.storageModuleId).set({
    ownerUid: uid,
    moduleId: scope.moduleId,
    storageModuleId: scope.storageModuleId,
    events: [...existing, event].slice(-MAX_EVIDENCE_EVENTS),
    updatedAt: now,
  }, { merge: true });
  return { id: event.id, recorded: true, event };
}

/* ------------------------------------------------------------------ */
/* Chat thread (owner-scoped, bounded)                                 */
/* ------------------------------------------------------------------ */

interface ThreadMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources: { unitId: string; label: string; provenance: string }[];
  grounded: boolean;
  resourceId: string | null;
  at: number;
}

async function loadThread(db: Db, uid: string, storageModuleId: string): Promise<ThreadMessage[]> {
  try {
    const snapshot = await threadRef(db, uid, storageModuleId).get();
    if (!snapshot.exists) return [];
    const rows = asRecord(snapshot.data()).messages;
    if (!Array.isArray(rows)) return [];
    return rows.slice(-MAX_THREAD_MESSAGES).map((row): ThreadMessage => {
      const message = asRecord(row);
      return {
        id: text(message.id) || personalAiHash(text(message.text)),
        role: message.role === "user" ? "user" as const : "assistant" as const,
        text: cleanAiText(message.text, 4000),
        sources: Array.isArray(message.sources)
          ? message.sources.slice(0, 6).map((item) => {
              const source = asRecord(item);
              return { unitId: text(source.unitId), label: text(source.label), provenance: text(source.provenance) };
            })
          : [],
        grounded: message.grounded !== false,
        resourceId: text(message.resourceId) || null,
        at: timestampMs(message.at),
      };
    }).filter((message) => message.text);
  } catch {
    return [];
  }
}

async function appendThread(db: Db, uid: string, scope: Scope, messages: ThreadMessage[]) {
  if (!messages.length) return;
  try {
    const ref = threadRef(db, uid, scope.storageModuleId);
    const existing = await loadThread(db, uid, scope.storageModuleId);
    await ref.set({
      ownerUid: uid,
      moduleId: scope.moduleId,
      storageModuleId: scope.storageModuleId,
      messages: [...existing, ...messages].slice(-MAX_THREAD_MESSAGES),
      updatedAt: Date.now(),
    }, { merge: true });
  } catch {
    // A failed history write must never lose an answer that already succeeded.
  }
}

/* ------------------------------------------------------------------ */
/* The metered model call                                              */
/* ------------------------------------------------------------------ */

interface ModelCall {
  payload: unknown;
  provider: string;
  model: string;
  aiSource: "own" | "default";
  usage: RevisionAiProviderUsage;
  allowance: unknown;
  chunks: PersonalAiChunk[];
  sources: ReturnType<typeof personalAiSources>;
  coverage: PersonalAiCoverage;
  contentHash: string;
}

/**
 * One grounded model call, metered through the EXISTING allowance ledger.
 *
 * Own-key requests are unmetered (exactly like the revision generator);
 * school-AI requests reserve quota transactionally, call the provider, then
 * finalise — and release the reservation on any failure so a learner is never
 * charged for an error.
 */
/**
 * The AI Mentor subscription feature (`subscriptionFeatures/ai-mentor`).
 *
 * Until now the mentor inherited its entitlement from the Revision feature
 * alone, and the "AI Mentor" row on the subscription page was pure marketing
 * copy: `aiMentorLocked` is normalised in utils/subscriptionAccess.ts and read
 * by nothing, so no plan actually gated it — any signed-in learner could use it
 * for free. This closes the loop without breaking anyone who already paid:
 *
 *   · no `ai-mentor` feature doc, or `active: false` → open. A fresh database
 *     behaves exactly as it does today, and a feature can never be paywalled by
 *     accident.
 *   · feature doc present and active → the caller's subscription must unlock
 *     `ai-mentor`. A plan that unlocks `revision` also qualifies, so no
 *     Revision Studio subscriber loses the mentor mid-term.
 *
 * Checked here, at the single choke point every model call passes through, so a
 * client cannot skip it by choosing a different action.
 */
const AI_MENTOR_FEATURE_ID = "ai-mentor";

async function assertAiMentorEntitlement(db: Db, uid: string): Promise<void> {
  const [featureSnap, subscriptionSnap] = await Promise.all([
    db.collection("subscriptionFeatures").doc(AI_MENTOR_FEATURE_ID).get(),
    db.collection("users").doc(uid).collection("subscription").doc("current").get(),
  ]);
  if (!featureSnap.exists || featureSnap.data()?.active === false) return;
  const record = asRecord(subscriptionSnap.data());
  const hasStoredFeatureList = Array.isArray(record.features) && record.features.length > 0;
  // The mentor is sold as its own feature (`ai-mentor`), so a membership that
  // carries a feature list is checked against exactly what its plan shipped —
  // that is where the admin's per-plan choice lives.
  const entitled = hasStoredFeatureList
    ? subscriptionUnlocksFeature(record, AI_MENTOR_FEATURE_ID)
    // A membership written before feature ids were stored has nothing to
    // respect, and the safe reading is the one My Day and Revision already use
    // for exactly this case: an active subscription is the entitlement. Those
    // learners keep the mentor instead of losing it because of a field format.
    : subscriptionUnlocksFeature(record, "revision")
      || subscriptionUnlocksFeature(record, AI_MENTOR_FEATURE_ID);
  if (entitled) return;
  const planName = String(record.planName || record.planId || "your current plan").trim() || "your current plan";
  fail(
    403,
    "AI_MENTOR_PLAN_REQUIRED",
    `AI Mentor isn't included in ${planName}. Upgrade your plan to unlock the AI study partner for your modules and course.`,
  );
}

async function groundedCompletion(input: {
  uid: string;
  req: VercelRequest;
  body: Body;
  prompt: string;
  grounding: Grounding;
  query: string;
  resourceId?: string | null;
  estimatedOutputTokens: number;
}): Promise<ModelCall> {
  const { uid, req, body, prompt, grounding } = input;
  const aiSettings = await loadAiSettings();
  const policy: RevisionAiPolicy = await resolveEffectiveAiPolicy(uid, aiSettings);
  if (!policy.hasAccess) {
    fail(403, "REVISION_SUBSCRIPTION_REQUIRED", "Your plan's AI allowance isn't active. Renew or upgrade to use the AI study engine on your modules.");
  }
  await assertAiMentorEntitlement(adminDb(), uid);
  const requestedSource = body.source === "own" ? "own" : "default";
  let config: RevisionAiConfig;
  if (requestedSource === "own") {
    const own = parseOwnConfig(body.config);
    if (!own) fail(400, "AI_NOT_CONFIGURED", "Connect your own AI provider (key + model) in Revision → AI Configuration first.");
    config = own;
  } else {
    try {
      config = await loadSchoolConfig();
    } catch (error) {
      fail(409, "AI_NOT_CONFIGURED", (error as Error)?.message || "No AI provider is published yet. Connect your own key in Revision → AI Configuration.");
    }
  }

  const origin = firstHeader(req.headers, "origin") || firstHeader(req.headers, "referer") || "";
  const tzOffsetMinutes = Math.max(-840, Math.min(840, Math.round(number(body.tzOffsetMinutes))));
  const chunks = retrievePersonalAiChunks({
    units: grounding.units,
    query: input.query,
    resourceId: input.resourceId || undefined,
    maxChunks: PERSONAL_AI_MAX_CHUNKS,
    maxChars: PERSONAL_AI_MAX_CONTEXT_CHARS,
  });
  // The prompt is built by the shared pure layer from these exact chunks, so
  // the caller passes the chunk-scoped prompt in; recompute the token estimate
  // from what we are actually sending.
  const estimatedInputTokens = estimateTokensFromText(`${PERSONAL_AI_SYSTEM_PROMPT}\n${prompt}`);
  const estimatedOutputTokens = Math.max(200, Math.min(6000, Math.round(input.estimatedOutputTokens)));
  const price = findAiModelPrice(policy.pricing, config.provider, config.model);

  let reservation: RevisionAiReservation | null = null;
  if (requestedSource !== "own") {
    if (isBudgetLow(15_000)) {
      fail(503, "AI_SERVER_BUSY", "The AI server is busy. Nothing was charged — please try again in a minute.");
    }
    reservation = await reserveUsage(uid, policy, price, estimatedInputTokens, estimatedOutputTokens, tzOffsetMinutes);
  }

  let rawText = "";
  try {
    rawText = await completeJsonText(config, PERSONAL_AI_SYSTEM_PROMPT, prompt, origin);
  } catch (error) {
    if (reservation) await releaseUsage(uid, reservation.id).catch(() => undefined);
    const statusCode = number((error as { statusCode?: unknown })?.statusCode, 502);
    const code = text((error as { code?: unknown })?.code);
    throw new ApiError(
      statusCode === 429 ? 429 : statusCode >= 500 ? 502 : statusCode,
      code || "PROVIDER_ERROR",
      (error as Error)?.message || "The AI provider didn't answer.",
    );
  }
  if (!rawText) {
    if (reservation) await releaseUsage(uid, reservation.id).catch(() => undefined);
    fail(502, "AI_EMPTY", "The AI returned an empty answer. Nothing was charged — please try again.");
  }

  let parsed: unknown;
  try {
    parsed = extractJson(rawText);
  } catch {
    if (reservation) await releaseUsage(uid, reservation.id).catch(() => undefined);
    fail(502, "AI_INVALID_JSON", "The AI returned something I couldn't read as an answer. Nothing was charged — please try again.");
  }

  const usage: RevisionAiProviderUsage = {
    inputTokens: estimatedInputTokens,
    outputTokens: estimateTokensFromText(rawText),
    totalTokens: estimatedInputTokens + estimateTokensFromText(rawText),
    source: "estimated",
  };

  let allowance: unknown = { unmetered: true, source: "own" as const, message: "Your own API key does not use the plan AI allowance." };
  if (reservation) {
    try {
      allowance = await finalizeUsage(uid, policy, reservation, usage, price, config, tzOffsetMinutes);
    } catch (error) {
      await releaseUsage(uid, reservation.id).catch(() => undefined);
      const statusCode = number((error as { statusCode?: unknown })?.statusCode, 500);
      throw new ApiError(statusCode, text((error as { code?: unknown })?.code) || "AI_USAGE_ERROR", (error as Error)?.message || "Could not record the AI usage.");
    }
  }

  return {
    payload: parsed,
    provider: config.provider,
    model: config.model,
    aiSource: requestedSource === "own" ? "own" : "default",
    usage,
    allowance,
    chunks,
    sources: personalAiSources(chunks),
    coverage: grounding.coverage,
    contentHash: grounding.contentHash,
  };
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

/**
 * `personalAi.context` — what the AI can actually read in this module.
 *
 * No model call, no allowance consumed. This is what the workspace renders
 * before the learner asks anything: per-resource availability, the honest
 * coverage sentence, stored artifacts, weak topics and the AI allowance state.
 */
async function handleContext(db: Db, uid: string, body: Body) {
  const scope = await resolveScope(db, uid, body);
  const refresh = body.refresh === true;
  const [content, thread, evidence, aiSettings] = await Promise.all([
    readScopeContent(db, uid, scope, { refresh }),
    loadThread(db, uid, scope.storageModuleId),
    loadEvidence(db, uid, scope.storageModuleId),
    loadAiSettings(),
  ]);
  const notes = cleanClientNotes(body.notes, scope);
  const grounding = buildGrounding(scope, content.availability, content.extracted, notes);
  const policy = await resolveEffectiveAiPolicy(uid, aiSettings);
  const tzOffsetMinutes = Math.max(-840, Math.min(840, Math.round(number(body.tzOffsetMinutes))));
  let usage: unknown = null;
  try {
    usage = await getUsageStatus(uid, policy, tzOffsetMinutes);
  } catch {
    usage = null;
  }
  const artifacts = await listArtifacts(db, uid, scope.storageModuleId);
  const source = body.source === "own" ? "own" : "default";
  const configured = source === "own" ? Boolean(parseOwnConfig(body.config)) : Boolean(text(asRecord(aiSettings).sharedApiKey)) && Boolean(text(asRecord(aiSettings).model));
  return {
    scope: {
      moduleId: scope.moduleId,
      storageModuleId: scope.storageModuleId,
      saved: scope.saved,
      title: scope.module.title,
      description: scope.module.description,
      resourceId: scope.resourceId,
      provenance: personalAiProvenance({ scope: scope.resourceId ? "resource" : "module", moduleTitle: scope.module.title, resourceName: scope.resourceId ? scope.resources[0]?.name : "", saved: scope.saved }).label,
    },
    resources: content.availability,
    coverage: grounding.coverage,
    contentHash: grounding.contentHash,
    unitCount: grounding.units.length,
    unitKinds: grounding.units.reduce<Record<string, number>>((acc, unit) => {
      acc[unit.kind] = (acc[unit.kind] || 0) + 1;
      return acc;
    }, {}),
    thread,
    evidence,
    artifacts,
    ai: {
      source,
      configured,
      hasAccess: policy.hasAccess,
      planId: policy.planId,
      planName: policy.planName,
      cycle: policy.cycle,
      dailyLimit: policy.dailyLimit,
      windowLimit: policy.windowLimit,
      allowed: configured && policy.hasAccess && (asRecord(usage).allowed !== false),
      blockedReason: !policy.hasAccess
        ? "Your plan's AI allowance isn't active. Renew or upgrade to use the AI study engine."
        : !configured
          ? "No AI provider is connected yet."
          : text(asRecord(usage).blockedReason) || null,
      usage,
    },
    unreadable: content.availability
      .filter((row) => !row.readable)
      .map((row) => ({ id: row.id, name: row.name, type: row.type, state: row.state, reason: row.reason })),
  };
}

/** `personalAi.ask` — one grounded chat answer scoped to a module or resource. */
async function handleAsk(db: Db, uid: string, body: Body, req: VercelRequest) {
  const scope = await resolveAskScope(db, uid, body);
  const question = cleanAiText(body.question, PERSONAL_AI_QUESTION_CHARS_MAX);
  if (!question) fail(400, "VALIDATION", "Type a question first.");
  const content = await readScopeContent(db, uid, scope);
  const notes = cleanClientNotes(body.notes, scope);
  const grounding = buildGrounding(scope, content.availability, content.extracted, notes);
  const history = (Array.isArray(body.history) ? body.history : [])
    .slice(-PERSONAL_AI_MAX_HISTORY_MESSAGES)
    .map((row) => {
      const message = asRecord(row);
      return { role: message.role === "assistant" ? "assistant" : "user", text: cleanAiText(message.text, 900) };
    })
    .filter((message) => message.text);

  const prompt = buildPersonalAiAskPrompt({
    chunks: retrievePersonalAiChunks({
      units: grounding.units,
      query: question,
      resourceId: scope.resourceId || undefined,
      maxChunks: PERSONAL_AI_MAX_CHUNKS,
      maxChars: PERSONAL_AI_MAX_CONTEXT_CHARS,
    }),
    coverage: grounding.coverage,
    scopeLabel: grounding.scopeLabel,
    question,
    history,
  });
  const call = await groundedCompletion({
    uid,
    req,
    body,
    prompt,
    grounding,
    query: question,
    resourceId: scope.resourceId,
    estimatedOutputTokens: 700,
  });
  const unitIds = call.chunks.map((chunk) => chunk.unitId);
  const answer = normalizePersonalAiAnswer(call.payload, unitIds);
  const sources = call.sources.filter((source) => answer.sources.includes(source.unitId));
  const at = Date.now();
  await appendThread(db, uid, scope, [
    { id: `m_${randomUUID().slice(0, 12)}`, role: "user", text: question, sources: [], grounded: true, resourceId: scope.resourceId, at },
    {
      id: `m_${randomUUID().slice(0, 12)}`,
      role: "assistant",
      text: answer.answer,
      sources: sources.map((source) => ({ unitId: source.unitId, label: source.label, provenance: source.provenance })),
      grounded: answer.grounded,
      resourceId: scope.resourceId,
      at: Date.now(),
    },
  ]);
  return {
    kind: "answer",
    question,
    ...answer,
    // Provenance is always resolved server-side from the units actually sent,
    // so a model can never invent a source label.
    sourceDetails: sources,
    coverage: grounding.coverage,
    unreadable: content.availability.filter((row) => !row.readable).map((row) => ({ id: row.id, name: row.name, type: row.type, state: row.state, reason: row.reason })),
    scopeLabel: grounding.scopeLabel,
    provider: call.provider,
    model: call.model,
    aiSource: call.aiSource,
    allowance: call.allowance,
    at,
  };
}

const GENERATION_KINDS: Record<string, string> = {
  summary: "module-summary",
  "resource-summary": "resource-summary",
  questions: "questions",
  flashcards: "flashcards",
  plan: "study-plan",
  orientation: "orientation",
  explain: "explanation",
};

const OUTPUT_TOKEN_ESTIMATE: Record<string, number> = {
  "module-summary": 1400,
  "resource-summary": 900,
  questions: 1800,
  flashcards: 1200,
  "study-plan": 900,
  orientation: 700,
  explanation: 700,
};

/** `personalAi.generate` — summaries, questions, flashcards, plans, explain-again. */
async function handleGenerate(db: Db, uid: string, body: Body, req: VercelRequest) {
  const requested = text(body.kind);
  const type = GENERATION_KINDS[requested];
  if (!type) fail(400, "VALIDATION", "Unknown generation request.");
  const scope = await resolveScope(db, uid, body);
  // A module summary of a single-resource scope is a resource summary.
  const effectiveType = type === "module-summary" && scope.resourceId ? "resource-summary" : type;
  const id = artifactId(scope, effectiveType);

  const content = await readScopeContent(db, uid, scope, { refresh: body.refresh === true });
  const notes = cleanClientNotes(body.notes, scope);
  const grounding = buildGrounding(scope, content.availability, content.extracted, notes);

  // Reuse a stored artifact while the grounding content is unchanged — never
  // pay the model (or the learner's allowance) twice for the same material.
  const existing = await readArtifact(db, uid, id);
  if (existing && isReusablePersonalAiArtifact({
    artifact: existing,
    type: effectiveType,
    moduleId: text(existing.moduleId),
    resourceId: existing.resourceId || "",
    contentHash: grounding.contentHash,
    force: body.force === true,
    maxAgeMs: PERSONAL_AI_ARTIFACT_TTL_MS,
  })) {
    return {
      kind: effectiveType,
      reused: true,
      artifactId: existing.id,
      payload: existing.payload,
      sources: existing.sources,
      coverage: existing.coverage,
      contentHash: grounding.contentHash,
      scopeLabel: grounding.scopeLabel,
      provider: existing.provider,
      model: existing.model,
      aiSource: existing.aiSource,
      createdAt: existing.createdAt,
      allowance: null,
      insufficientReadable: grounding.coverage.none && !grounding.units.some((unit) => unit.kind === "resource-text"),
    };
  }

  const query = effectiveType === "questions" || effectiveType === "flashcards"
    ? `${scope.module.title} ${scope.resources.map((row) => `${row.name} ${row.description}`).join(" ")}`.slice(0, PERSONAL_AI_QUESTION_CHARS_MAX)
    : scope.module.title;
  const chunks = retrievePersonalAiChunks({
    units: grounding.units,
    query,
    resourceId: scope.resourceId || undefined,
    maxChunks: PERSONAL_AI_MAX_CHUNKS,
    maxChars: PERSONAL_AI_MAX_CONTEXT_CHARS,
  });

  // Honest insufficiency WITHOUT spending allowance: nothing readable at all.
  const hasReadableText = chunks.some((chunk) => chunk.kind === "resource-text" || chunk.kind === "note");
  const authoredOnly = !hasReadableText && chunks.some((chunk) => chunk.kind === "resource-meta" || chunk.kind === "module-brief");
  if (!chunks.length) {
    fail(422, "NO_READABLE_CONTENT", "I couldn't read any content in this module yet, so there is nothing to ground this in. Add a description or notes, or open a readable file (PDF / shared Google Doc).");
  }

  const promptInput = {
    chunks,
    coverage: grounding.coverage,
    scopeLabel: grounding.scopeLabel,
  };
  let prompt = "";
  if (effectiveType === "module-summary" || effectiveType === "resource-summary") {
    prompt = buildPersonalAiSummaryPrompt(promptInput);
  } else if (effectiveType === "questions") {
    prompt = buildPersonalAiQuestionsPrompt({
      ...promptInput,
      count: Math.max(1, Math.min(PERSONAL_AI_QUESTION_MAX, Math.round(number(body.count, PERSONAL_AI_QUESTION_DEFAULT)))),
      types: Array.isArray(body.types) ? body.types : [],
      difficulty: text(body.difficulty) || "mixed",
    });
  } else if (effectiveType === "flashcards") {
    prompt = buildPersonalAiFlashcardsPrompt({
      ...promptInput,
      count: Math.max(1, Math.min(PERSONAL_AI_FLASHCARD_MAX, Math.round(number(body.count, PERSONAL_AI_FLASHCARD_DEFAULT)))),
    });
  } else if (effectiveType === "study-plan") {
    const evidence = await loadEvidence(db, uid, scope.storageModuleId);
    const weak = evidence.map((row) => row.topic).filter(Boolean);
    prompt = buildPersonalAiPlanPrompt({
      ...promptInput,
      days: Math.max(1, Math.min(14, Math.round(number(body.days, PERSONAL_AI_PLAN_DAY_DEFAULT)))),
      minutesPerDay: number(body.minutesPerDay, 0),
      weakTopics: Array.from(new Set(weak)).slice(0, PERSONAL_AI_WEAK_MAX_TOPICS),
    });
  } else if (effectiveType === "orientation") {
    prompt = buildPersonalAiOrientationPrompt(promptInput);
  } else {
    prompt = buildPersonalAiExplainPrompt({
      ...promptInput,
      mode: text(body.mode) || "simple",
      question: cleanAiText(body.question, 900),
      answer: cleanAiText(body.answer, 600),
      explanation: cleanAiText(body.explanation, 600),
      learnerAnswer: cleanAiText(body.learnerAnswer, 600),
    });
  }

  const call = await groundedCompletion({
    uid,
    req,
    body,
    prompt,
    grounding,
    query,
    resourceId: scope.resourceId,
    estimatedOutputTokens: OUTPUT_TOKEN_ESTIMATE[effectiveType] || 900,
  });
  const unitIds = call.chunks.map((chunk) => chunk.unitId);
  // Every normalizer returns a plain JSON object; the union is narrowed to a
  // record so provenance/inspection below can read it generically.
  const payload = normalizePayload(effectiveType, call.payload, unitIds) as unknown as Record<string, unknown>;
  // Questions and flashcards cite per item; everything else cites at the top.
  // Either way a source can only ever be one of the units actually sent, so
  // provenance can never point at material the model did not have.
  const citedIds = new Set<string>(
    Array.isArray(payload.sources)
      ? (payload.sources as unknown[]).map((id) => text(id))
      : [
          ...("questions" in payload ? (payload.questions as { sources?: string[] }[]) : []),
          ...("cards" in payload ? (payload.cards as { sources?: string[] }[]) : []),
        ].flatMap((item) => (Array.isArray(item?.sources) ? item.sources.map((id) => text(id)) : [])),
  );
  const sources = call.sources.filter((source) => citedIds.has(source.unitId));
  const finalSources = sources.length ? sources : call.sources.slice(0, 6);
  const now = Date.now();
  const stored = payloadHasContent(effectiveType, payload);
  if (stored) {
    try {
      await artifactRef(db, uid, id).set({
        ownerUid: uid,
        id,
        type: effectiveType,
        moduleId: scope.moduleId,
        storageModuleId: scope.storageModuleId,
        resourceId: scope.resourceId,
        moduleTitle: scope.module.title,
        resourceTitle: scope.resourceId ? scope.resources[0]?.name || "" : "",
        provenance: personalAiProvenance({
          scope: scope.resourceId ? "resource" : "module",
          moduleTitle: scope.module.title,
          resourceName: scope.resourceId ? scope.resources[0]?.name : "",
          saved: scope.saved,
        }).label,
        payload,
        sources: finalSources,
        contentHash: grounding.contentHash,
        coverage: grounding.coverage,
        unitCount: grounding.units.length,
        provider: call.provider,
        model: call.model,
        aiSource: call.aiSource,
        // Authored-only grounding is flagged so the UI can say "based on your
        // titles/descriptions" instead of implying the files were read.
        authoredOnly,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        stale: false,
      });
    } catch {
      // Persistence is an optimisation; the generated result is already valid.
    }
  }
  return {
    kind: effectiveType,
    reused: false,
    artifactId: stored ? id : null,
    payload,
    sources: finalSources,
    coverage: grounding.coverage,
    authoredOnly,
    contentHash: grounding.contentHash,
    scopeLabel: grounding.scopeLabel,
    provider: call.provider,
    model: call.model,
    aiSource: call.aiSource,
    allowance: call.allowance,
    createdAt: now,
  };
}

/** `personalAi.thread` — the stored conversation for one module. */
async function handleThread(db: Db, uid: string, body: Body) {
  const scope = await resolveScope(db, uid, body);
  const messages = await loadThread(db, uid, scope.storageModuleId);
  return { messages, storageModuleId: scope.storageModuleId, moduleId: scope.moduleId };
}

/** `personalAi.thread.clear` — deletes only the caller's own thread. */
async function handleThreadClear(db: Db, uid: string, body: Body) {
  const scope = await resolveScope(db, uid, body);
  try {
    await threadRef(db, uid, scope.storageModuleId).delete();
  } catch {
    // Idempotent: a missing thread is already cleared.
  }
  return { cleared: true };
}

/** `personalAi.evidence.record` — weak-topic evidence from the learner's answers. */
async function handleEvidence(db: Db, uid: string, body: Body) {
  const scope = await resolveScope(db, uid, body);
  const recorded = await recordEvidence(db, uid, body, scope);
  const evidence = await loadEvidence(db, uid, scope.storageModuleId);
  return { ...recorded, evidence };
}

/** `personalAi.artifact.delete` — owner-only artifact removal. */
async function handleArtifactDelete(db: Db, uid: string, body: Body) {
  const id = text(body.artifactId);
  if (!id || !/^[a-z-]+_[a-z0-9]+$/i.test(id)) fail(400, "VALIDATION", "Unknown artifact.");
  const existing = await readArtifact(db, uid, id);
  if (!existing) fail(404, "ARTIFACT_NOT_FOUND", "That AI result is no longer stored.");
  await artifactRef(db, uid, id).delete();
  return { deleted: true, id };
}

/** `personalAi.usage.status` — the same authoritative allowance snapshot. */
async function handleUsageStatus(uid: string, body: Body) {
  const aiSettings = await loadAiSettings();
  const policy = await resolveEffectiveAiPolicy(uid, aiSettings);
  const tzOffsetMinutes = Math.max(-840, Math.min(840, Math.round(number(body.tzOffsetMinutes))));
  const usage = await getUsageStatus(uid, policy, tzOffsetMinutes);
  return { usage, hasAccess: policy.hasAccess, planName: policy.planName, planId: policy.planId, cycle: policy.cycle };
}

/* ------------------------------------------------------------------ */
/* Dispatcher                                                          */
/* ------------------------------------------------------------------ */

export async function handlePersonalAi(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return json(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", message: "Use POST." });
  }
  // Reset the shared per-request AI time budget (cold starts / keep-warm reuse).
  enterHandler();
  try {
    const uid = await authenticate(req);
    const body: Body = readBody(req);
    const action = text(body.action);
    const db = adminDb();
    let data: unknown;
    switch (action) {
      case "personalAi.context": data = await handleContext(db, uid, body); break;
      case "personalAi.ask": data = await handleAsk(db, uid, body, req); break;
      case "personalAi.generate": data = await handleGenerate(db, uid, body, req); break;
      case "personalAi.thread": data = await handleThread(db, uid, body); break;
      case "personalAi.thread.clear": data = await handleThreadClear(db, uid, body); break;
      case "personalAi.evidence.record": data = await handleEvidence(db, uid, body); break;
      case "personalAi.artifact.delete": data = await handleArtifactDelete(db, uid, body); break;
      case "personalAi.usage.status": data = await handleUsageStatus(uid, body); break;
      default: fail(400, "UNKNOWN_ACTION", "Unknown AI study action.");
    }
    return json(res, 200, { ok: true, data });
  } catch (error) {
    if (error instanceof ApiError) {
      const mapped = personalAiFailure({ code: error.code, message: error.message, status: error.status });
      return json(res, error.status, { ok: false, ...mapped, code: error.code, message: error.message || mapped.message, details: error.details });
    }
    const status = error && typeof error === "object" && "statusCode" in error
      ? number((error as { statusCode?: unknown }).statusCode, 500)
      : 500;
    const code = error && typeof error === "object" && "code" in error ? text((error as { code?: unknown }).code) : "";
    const message = error instanceof Error ? error.message : "";
    console.error("[personal-ai] error", code || status, message);
    const mapped = personalAiFailure({ code, message, status });
    return json(res, status >= 400 && status <= 599 ? status : 500, { ok: false, ...mapped });
  }
}
