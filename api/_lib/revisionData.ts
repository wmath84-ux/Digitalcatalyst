// Server-authoritative cloud Test Bank persistence and capacity enforcement.
// This handler is multiplexed through api/referral-leaderboard.ts so the app
// remains within the Vercel Hobby serverless-function cap.

import { randomUUID } from "node:crypto";
import { Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import {
  adminDb,
  errorResponse,
  requireFirebaseUser,
  type VercelRequest,
  type VercelResponse,
} from "./firebaseAdmin.js";
import { normalisePlanDoc } from "../../utils/subscriptions.js";
import { revisionBankLimitForCycle } from "../../utils/revisionLimits.js";

const TESTS = "revisionTests";
const DELETED_TESTS = "revisionDeletedTests";
const USAGE = "revisionUsage";
const USAGE_DOC = "current";
const RESERVATION_MS = 10 * 60 * 1000;
const MAX_TEST_PAYLOAD_BYTES = 850_000;

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};

const readBody = (req: VercelRequest): Record<string, any> => {
  if (typeof req.body === "string") {
    try { return asRecord(JSON.parse(req.body)); } catch { return {}; }
  }
  return asRecord(req.body);
};

const millis = (value: unknown): number => {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

const cleanText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const cleanNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const cleanStringList = (value: unknown, max = 100) =>
  (Array.isArray(value) ? value : []).map((item) => cleanText(item, 120)).filter(Boolean).slice(0, max);

function sanitizeTestBundle(raw: unknown, uid: string) {
  const bundle = asRecord(raw);
  const testRaw = asRecord(bundle.test);
  const testId = Math.round(cleanNumber(testRaw.id));
  if (!Number.isSafeInteger(testId) || testId <= 0) {
    throw Object.assign(new Error("The test has an invalid identifier."), { statusCode: 400, code: "INVALID_TEST" });
  }
  const rawQuestions = Array.isArray(bundle.questions) ? bundle.questions : [];
  if (rawQuestions.length > 100) {
    throw Object.assign(new Error("A saved test can contain at most 100 questions."), { statusCode: 413, code: "TEST_TOO_LARGE" });
  }
  const questionRows = rawQuestions.map((row) => {
    const q = asRecord(row);
    const options = (Array.isArray(q.options) ? q.options : [])
      .map((option) => cleanText(option, 300))
      .filter(Boolean)
      .slice(0, 6);
    return {
      id: Math.round(cleanNumber(q.id)),
      topicId: Math.round(cleanNumber(q.topicId)),
      subjectId: Math.round(cleanNumber(q.subjectId)),
      difficulty: ["easy", "medium", "hard"].includes(String(q.difficulty)) ? String(q.difficulty) : "medium",
      prompt: cleanText(q.prompt, 600),
      options,
      correctIndex: Math.max(0, Math.min(Math.max(0, options.length - 1), Math.round(cleanNumber(q.correctIndex)))),
      explanation: cleanText(q.explanation, 600),
      isActive: q.isActive !== false,
    };
  }).filter((q) => Number.isSafeInteger(q.id) && q.id > 0 && q.prompt && q.options.length >= 2);

  if (questionRows.length === 0) {
    throw Object.assign(new Error("No usable questions were supplied for this test."), { statusCode: 400, code: "NO_QUESTIONS" });
  }
  const allowedQuestionIds = new Set(questionRows.map((q) => q.id));
  const questionIds = (Array.isArray(testRaw.questionIds) ? testRaw.questionIds : [])
    .map((id) => Math.round(cleanNumber(id)))
    .filter((id) => allowedQuestionIds.has(id));
  const finalQuestionIds = questionIds.length ? questionIds : questionRows.map((q) => q.id);

  const subjects = (Array.isArray(bundle.subjects) ? bundle.subjects : []).slice(0, 100).map((row) => {
    const subject = asRecord(row);
    return {
      id: Math.round(cleanNumber(subject.id)),
      name: cleanText(subject.name, 100) || "General",
      slug: cleanText(subject.slug, 120),
      icon: cleanText(subject.icon, 16) || "✨",
      color: cleanText(subject.color, 30) || "violet",
    };
  }).filter((row) => Number.isSafeInteger(row.id) && row.id > 0);
  const topics = (Array.isArray(bundle.topics) ? bundle.topics : []).slice(0, 200).map((row) => {
    const topic = asRecord(row);
    return {
      id: Math.round(cleanNumber(topic.id)),
      subjectId: Math.round(cleanNumber(topic.subjectId)),
      name: cleanText(topic.name, 100) || "General",
      slug: cleanText(topic.slug, 140),
    };
  }).filter((row) => Number.isSafeInteger(row.id) && row.id > 0);
  const planRaw = asRecord(testRaw.planDetails);
  const now = Date.now();
  const payload = {
    schemaVersion: 1,
    uid,
    test: {
      id: testId,
      testDate: cleanText(testRaw.testDate, 20),
      slot: Math.round(cleanNumber(testRaw.slot, 1000)),
      title: cleanText(testRaw.title, 160) || "Revision Test",
      questionIds: finalQuestionIds,
      totalQuestions: finalQuestionIds.length,
      estimatedMinutes: Math.max(1, Math.min(240, Math.round(cleanNumber(testRaw.estimatedMinutes, 5)))),
      kind: "custom",
      source: cleanText(testRaw.source, 30) || "ai",
      planDetails: {
        classNames: cleanStringList(planRaw.classNames),
        subjectNames: cleanStringList(planRaw.subjectNames),
        chapterNames: cleanStringList(planRaw.chapterNames),
        topicNames: cleanStringList(planRaw.topicNames),
        difficulty: ["easy", "medium", "hard", "mixed"].includes(String(planRaw.difficulty)) ? String(planRaw.difficulty) : "mixed",
        questionMode: ["mixed", "theory", "application"].includes(String(planRaw.questionMode)) ? String(planRaw.questionMode) : "mixed",
      },
    },
    questions: questionRows,
    subjects,
    topics,
    createdAtMs: Math.max(0, Math.round(cleanNumber(bundle.createdAtMs, now))),
    updatedAtMs: now,
    createdAt: Timestamp.fromMillis(now),
    updatedAt: Timestamp.fromMillis(now),
  };
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > MAX_TEST_PAYLOAD_BYTES) {
    throw Object.assign(new Error("This test is too large to save. Reduce the number or length of questions."), { statusCode: 413, code: "TEST_TOO_LARGE" });
  }
  return payload;
}

type Access = { limit: number; planId: string; planName: string; cycle: "monthly" | "yearly"; hasAccess: boolean };

async function resolveAccess(db: Firestore, uid: string): Promise<Access> {
  const [feature, subscription] = await Promise.all([
    db.collection("subscriptionFeatures").doc("revision").get(),
    db.collection("users").doc(uid).collection("subscription").doc("current").get(),
  ]);
  const featureConfigured = feature.exists && feature.data()?.active !== false;
  const sub = asRecord(subscription.data());
  const active = subscription.exists && sub.status === "active" && millis(sub.expiresAt) > Date.now();
  const features = Array.isArray(sub.features) ? sub.features.map(String) : [];
  const hasAccess = !featureConfigured || (active && features.includes("revision"));
  // Keep the last purchased plan/cycle visible after expiry so status and
  // capacity messaging remain truthful. Expiry blocks creation only; it must
  // never reinterpret, reduce, or delete the learner's existing Test Bank.
  const planId = cleanText(sub.planId, 100) || "basic";
  const cycle = sub.cycle === "yearly" ? "yearly" : "monthly";
  const planSnap = await db.collection("subscriptionPlans").doc(planId).get();
  const plan = planSnap.exists ? normalisePlanDoc(planSnap.data() || {}, planSnap.id) : null;
  const currentLimit = plan ? revisionBankLimitForCycle(plan, cycle) : revisionBankLimitForCycle({ id: planId }, cycle);
  const snapshotLimitRaw = Number(sub.revisionTestBankLimit);
  const snapshotLimit = Number.isFinite(snapshotLimitRaw) ? Math.max(-1, Math.round(snapshotLimitRaw)) : currentLimit;
  // Never silently reduce a benefit already purchased for this term. An admin
  // increase, however, becomes useful immediately.
  const limit = snapshotLimit < 0 || currentLimit < 0 ? -1 : Math.max(snapshotLimit, currentLimit);
  return {
    limit,
    planId,
    planName: cleanText(plan?.name, 100) || planId || "Basic",
    cycle,
    hasAccess,
  };
}

function activeReservations(raw: unknown, now = Date.now()): Record<string, number> {
  const source = asRecord(raw);
  const next: Record<string, number> = {};
  Object.entries(source).slice(0, 100).forEach(([key, value]) => {
    const expiresAt = Number(value);
    if (key && Number.isFinite(expiresAt) && expiresAt > now) next[key] = expiresAt;
  });
  return next;
}

async function actualTestCount(db: Firestore, uid: string): Promise<number> {
  const snap = await db.collection("users").doc(uid).collection(TESTS).get();
  return snap.size;
}

async function statusFor(db: Firestore, uid: string, access: Access) {
  const count = await actualTestCount(db, uid);
  const usageRef = db.collection("users").doc(uid).collection(USAGE).doc(USAGE_DOC);
  const usage = await usageRef.get();
  const reservations = activeReservations(usage.data()?.reservations);
  await usageRef.set({ uid, savedTestCount: count, reservations, updatedAt: Timestamp.now() }, { merge: true });
  return {
    used: count,
    limit: access.limit,
    available: access.limit < 0 ? null : Math.max(0, access.limit - count),
    full: access.limit >= 0 && count >= access.limit,
    planId: access.planId,
    planName: access.planName,
    cycle: access.cycle,
  };
}

async function ensureUsageCounter(db: Firestore, uid: string): Promise<DocumentReference> {
  const ref = db.collection("users").doc(uid).collection(USAGE).doc(USAGE_DOC);
  const snap = await ref.get();
  if (!snap.exists || !Number.isFinite(Number(snap.data()?.savedTestCount))) {
    const count = await actualTestCount(db, uid);
    await ref.set({ uid, savedTestCount: count, reservations: {}, updatedAt: Timestamp.now() }, { merge: true });
  }
  return ref;
}

function bankFullError(access: Access, used: number) {
  return {
    ok: false,
    code: "TEST_BANK_FULL",
    error: `Your ${access.planName} plan Test Bank is full. Delete an older test or explore a plan with more space.`,
    bank: { used, limit: access.limit, planId: access.planId, planName: access.planName, cycle: access.cycle, full: true },
  };
}

async function reserveSlot(db: Firestore, uid: string, access: Access) {
  const usageRef = await ensureUsageCounter(db, uid);
  const reservationId = randomUUID();
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    const data = asRecord(snap.data());
    const used = Math.max(0, Math.round(Number(data.savedTestCount) || 0));
    const reservations = activeReservations(data.reservations);
    if (access.limit >= 0 && used + Object.keys(reservations).length >= access.limit) {
      return { full: true, used } as const;
    }
    reservations[reservationId] = Date.now() + RESERVATION_MS;
    tx.set(usageRef, { uid, savedTestCount: used, reservations, updatedAt: Timestamp.now() }, { merge: true });
    return { full: false, used } as const;
  });
  return { ...result, reservationId, expiresAt: Date.now() + RESERVATION_MS };
}

async function releaseReservation(db: Firestore, uid: string, reservationId: string) {
  if (!reservationId) return;
  const usageRef = db.collection("users").doc(uid).collection(USAGE).doc(USAGE_DOC);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);
    if (!snap.exists) return;
    const data = asRecord(snap.data());
    const reservations = activeReservations(data.reservations);
    delete reservations[reservationId];
    tx.set(usageRef, { reservations, updatedAt: Timestamp.now() }, { merge: true });
  });
}

async function commitTest(db: Firestore, uid: string, access: Access, body: Record<string, any>) {
  const bundle = sanitizeTestBundle(body.bundle, uid);
  const testId = String(bundle.test.id);
  const reservationId = cleanText(body.reservationId, 100);
  const migration = body.migration === true;
  const userRef = db.collection("users").doc(uid);
  const usageRef = await ensureUsageCounter(db, uid);
  const testRef = userRef.collection(TESTS).doc(testId);
  const deletedRef = userRef.collection(DELETED_TESTS).doc(testId);

  return db.runTransaction(async (tx) => {
    const [usageSnap, testSnap, deletedSnap] = await Promise.all([tx.get(usageRef), tx.get(testRef), tx.get(deletedRef)]);
    if (deletedSnap.exists) {
      throw Object.assign(new Error("This test was permanently deleted on another device."), { statusCode: 409, code: "TEST_DELETED" });
    }
    if (testSnap.exists) {
      const usage = asRecord(usageSnap.data());
      const reservations = activeReservations(usage.reservations);
      if (reservationId) delete reservations[reservationId];
      tx.set(usageRef, { reservations, updatedAt: Timestamp.now() }, { merge: true });
      return { duplicate: true, used: Math.max(0, Number(usage.savedTestCount) || 0) };
    }
    const usage = asRecord(usageSnap.data());
    const reservations = activeReservations(usage.reservations);
    const used = Math.max(0, Math.round(Number(usage.savedTestCount) || 0));
    const hasReservation = Boolean(reservationId && reservations[reservationId]);
    if (!migration && !hasReservation) {
      throw Object.assign(new Error("Your save reservation expired. Please generate the test again."), { statusCode: 409, code: "RESERVATION_EXPIRED" });
    }
    const occupied = migration ? used + Object.keys(reservations).length : used;
    if (access.limit >= 0 && occupied >= access.limit) {
      throw Object.assign(new Error("TEST_BANK_FULL"), { statusCode: 409, code: "TEST_BANK_FULL", used });
    }
    if (reservationId) delete reservations[reservationId];
    tx.create(testRef, bundle);
    tx.set(usageRef, { uid, savedTestCount: used + 1, reservations, updatedAt: Timestamp.now() }, { merge: true });
    return { duplicate: false, used: used + 1 };
  });
}

async function deleteInChunks(db: Firestore, refs: DocumentReference[]) {
  const uniqueRefs = Array.from(new Map(refs.map((ref) => [ref.path, ref])).values());
  for (let start = 0; start < uniqueRefs.length; start += 400) {
    const batch = db.batch();
    uniqueRefs.slice(start, start + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }
}

async function deleteTest(db: Firestore, uid: string, testId: string) {
  const userRef = db.collection("users").doc(uid);
  const testRef = userRef.collection(TESTS).doc(testId);
  const usageRef = await ensureUsageCounter(db, uid);
  const testSnap = await testRef.get();
  const testPayload = asRecord(asRecord(testSnap.data()).test);
  const questionIds = (Array.isArray(testPayload.questionIds) ? testPayload.questionIds : [])
    .map((value) => Math.round(Number(value)))
    .filter((value) => Number.isSafeInteger(value) && value > 0);

  // Answers/results are embedded in attempt/session documents. Delete every
  // child before the parent so a partial failure leaves the operation safely
  // retryable; the final transaction is the authoritative capacity release.
  const [attempts, allSessions, itemRows] = await Promise.all([
    userRef.collection("revisionAttempts").where("testId", "==", Number(testId)).get(),
    userRef.collection("revisionSessions").get(),
    userRef.collection("revisionItems").where("testId", "==", Number(testId)).get(),
  ]);
  const questionSet = new Set(questionIds);
  const sessions = allSessions.docs.filter((snapshot) => {
    const data = asRecord(snapshot.data());
    const session = asRecord(data.session);
    const sessionQuestionIds = Array.isArray(session.questionIds) ? session.questionIds.map(Number) : [];
    return Number(data.testId) === Number(testId) || sessionQuestionIds.some((questionId) => questionSet.has(questionId));
  });
  await deleteInChunks(db, [
    ...attempts.docs.map((doc) => doc.ref),
    ...sessions.map((doc) => doc.ref),
    ...itemRows.docs.map((doc) => doc.ref),
    ...questionIds.map((questionId) => userRef.collection("revisionItems").doc(String(questionId))),
  ]);

  const deletedRef = userRef.collection(DELETED_TESTS).doc(testId);
  return db.runTransaction(async (tx) => {
    const [freshTest, usageSnap] = await Promise.all([tx.get(testRef), tx.get(usageRef)]);
    const existed = freshTest.exists;
    const used = Math.max(0, Math.round(Number(usageSnap.data()?.savedTestCount) || 0));
    if (existed) tx.delete(testRef);
    tx.set(deletedRef, { uid, testId: Number(testId), deletedAt: Timestamp.now() }, { merge: true });
    tx.set(usageRef, { savedTestCount: existed ? Math.max(0, used - 1) : used, updatedAt: Timestamp.now() }, { merge: true });
    return existed;
  });
}

export async function handleRevisionData(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed." });
  try {
    const user = await requireFirebaseUser(req);
    const body = readBody(req);
    const action = String(body.action || "");
    const db = adminDb();
    const access = await resolveAccess(db, user.uid);
    const creationActions = new Set(["revision.data.reserve", "revision.data.create", "revision.data.migrate"]);
    if (creationActions.has(action) && !access.hasAccess) {
      return res.status(403).json({ ok: false, code: "PLAN_REQUIRED", error: "Creating a new Revision test requires an active Revision Studio subscription. Your saved tests and results remain available." });
    }

    if (action === "revision.data.status") {
      return res.status(200).json({ ok: true, bank: await statusFor(db, user.uid, access) });
    }
    if (action === "revision.data.reserve") {
      const result = await reserveSlot(db, user.uid, access);
      if (result.full) return res.status(409).json(bankFullError(access, result.used));
      return res.status(200).json({
        ok: true,
        reservationId: result.reservationId,
        expiresAt: result.expiresAt,
        bank: { used: result.used, limit: access.limit, planId: access.planId, planName: access.planName, cycle: access.cycle, full: false },
      });
    }
    if (action === "revision.data.release") {
      await releaseReservation(db, user.uid, cleanText(body.reservationId, 100));
      return res.status(200).json({ ok: true });
    }
    if (action === "revision.data.create" || action === "revision.data.migrate") {
      try {
        const saved = await commitTest(db, user.uid, access, { ...body, migration: action === "revision.data.migrate" });
        const bank = await statusFor(db, user.uid, access);
        return res.status(200).json({ ok: true, saved, bank });
      } catch (error) {
        if (error && typeof error === "object" && (error as { code?: unknown }).code === "TEST_BANK_FULL") {
          return res.status(409).json(bankFullError(access, Number((error as { used?: unknown }).used) || 0));
        }
        throw error;
      }
    }
    if (action === "revision.data.delete") {
      const testId = cleanText(body.testId, 40);
      if (!/^\d+$/.test(testId)) return res.status(400).json({ ok: false, code: "INVALID_TEST", error: "Invalid test id." });
      const deleted = await deleteTest(db, user.uid, testId);
      return res.status(200).json({ ok: true, deleted, bank: await statusFor(db, user.uid, access) });
    }
    return res.status(400).json({ ok: false, code: "UNKNOWN_ACTION", error: "Unknown Revision data action." });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const status = "statusCode" in error ? Number((error as { statusCode?: unknown }).statusCode) || 500 : 500;
      const code = cleanText((error as { code?: unknown }).code, 80) || "REVISION_DATA_ERROR";
      const message = error instanceof Error ? error.message : "Could not update your Test Bank.";
      return res.status(status).json({ ok: false, code, error: message });
    }
    return errorResponse(res, error, "Could not update your Test Bank.");
  }
}
