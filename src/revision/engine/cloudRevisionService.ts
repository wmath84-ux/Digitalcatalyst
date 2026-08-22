// Firebase cloud bridge for Revision tests and progress.
//
// The existing local engine remains the business-rule implementation, while
// Firestore is now the durable source of truth. Test creation/deletion goes
// through the authenticated server API so plan capacity cannot be bypassed;
// attempts, answers and Smart Revision progress are owner-scoped Firestore
// documents and are continuously mirrored after each local mutation.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { auth, db as firestore } from "../../../firebase";
import {
  loadDb,
  saveDb,
  type DailyTestRow,
  type QuestionRow,
  type RevisionDb,
  type RevisionItemRow,
  type RevisionSessionAnswerRow,
  type RevisionSessionRow,
  type SubjectRow,
  type TestAnswerRow,
  type TestAttemptRow,
  type TopicRow,
} from "./store";
import { deleteCustomTestLocal } from "./customTestService";

export type RevisionBankStatus = {
  used: number;
  limit: number;
  available?: number | null;
  full: boolean;
  planId: string;
  planName: string;
  cycle: "monthly" | "yearly";
};

export class RevisionCloudError extends Error {
  code: string;
  status: number;
  bank: RevisionBankStatus | null;
  constructor(message: string, code = "REVISION_CLOUD_ERROR", status = 400, bank: RevisionBankStatus | null = null) {
    super(message);
    this.code = code;
    this.status = status;
    this.bank = bank;
  }
}

const BLOCKING_BANK_CODES = new Set(["TEST_BANK_FULL", "TEST_DELETED", "PLAN_REQUIRED", "AUTH_REQUIRED"]);

/** Capacity / entitlement failures must roll back a new test. Everything else keeps the local copy. */
export function isBlockingBankError(error: unknown): error is RevisionCloudError {
  if (!(error instanceof RevisionCloudError)) return false;
  if (BLOCKING_BANK_CODES.has(error.code)) return true;
  return error.status === 401;
}

/** Network / 5xx / local-dev 501 / expired reservation — keep the local Test Bank row and retry migrate. */
export function isTransientRevisionCloudError(error: unknown): boolean {
  if (isBlockingBankError(error)) return false;
  if (!(error instanceof RevisionCloudError)) return true;
  if (error.status === 401 || error.status === 403) return false;
  return true;
}

/** Stable identity for a saved test so remigrating the same paper cannot create a second cloud row. */
export function testContentFingerprint(test: DailyTestRow, questions: Array<{ id: number; prompt: string; options: string[]; correctIndex: number }>): string {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const body = test.questionIds
    .map((id) => {
      const question = byId.get(id);
      if (!question) return "";
      const options = question.options.map((option) => String(option ?? "").trim().toLowerCase()).join("~");
      return `${String(question.prompt ?? "").trim().toLowerCase()}|${options}|${question.correctIndex}`;
    })
    .filter(Boolean)
    .sort()
    .join("\n");
  return `${String(test.title ?? "").trim().toLowerCase()}::${body}`;
}

export type TestSlotReservation = {
  reservationId: string;
  expiresAt: number;
  bank: RevisionBankStatus;
};

type TestBundle = {
  test: DailyTestRow;
  questions: QuestionRow[];
  subjects: SubjectRow[];
  topics: TopicRow[];
  createdAtMs: number;
};

type CloudAttempt = {
  uid: string;
  testId: number;
  testKey: string;
  attempt: TestAttemptRow;
  answers: TestAnswerRow[];
  updatedAtMs: number;
};

type CloudSession = {
  uid: string;
  testId: number;
  testKey: string;
  session: RevisionSessionRow;
  answers: RevisionSessionAnswerRow[];
  updatedAtMs: number;
};

const fingerprint = new Map<string, string>();
const durableCloudTests = new Map<string, Set<number>>();
const cloudTestIdsFor = (uid: string) => {
  const existing = durableCloudTests.get(uid);
  if (existing) return existing;
  const created = new Set<number>();
  durableCloudTests.set(uid, created);
  return created;
};
let persistenceTimer: ReturnType<typeof setTimeout> | null = null;
let persistenceRunning = false;
let persistenceAgain = false;
let hydrationDepth = 0;

const currentFirebaseUser = (uid: string) => {
  const user = auth.currentUser;
  if (!user || user.uid !== uid) {
    throw new RevisionCloudError("Please sign in to save tests to your cloud Test Bank.", "AUTH_REQUIRED", 401);
  }
  return user;
};

async function callRevisionData<T>(uid: string, body: Record<string, unknown>): Promise<T> {
  const user = currentFirebaseUser(uid);
  const token = await user.getIdToken();
  const response = await fetch("/api/revision/data", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: Record<string, any> = {};
  try { payload = JSON.parse(raw) as Record<string, any>; } catch { /* handled below */ }
  if (!response.ok || payload.ok === false) {
    throw new RevisionCloudError(
      String(payload.error || (response.status === 501 ? "Cloud Test Bank is unavailable in this environment." : `Test Bank returned ${response.status}.`)),
      String(payload.code || "REVISION_CLOUD_ERROR"),
      response.status,
      payload.bank && typeof payload.bank === "object" ? payload.bank as RevisionBankStatus : null,
    );
  }
  return payload as T;
}

export async function fetchRevisionBankStatus(uid: string): Promise<RevisionBankStatus> {
  const result = await callRevisionData<{ ok: true; bank: RevisionBankStatus }>(uid, { action: "revision.data.status" });
  return result.bank;
}

export async function reserveRevisionTestSlot(uid: string): Promise<TestSlotReservation> {
  const result = await callRevisionData<{ ok: true; reservationId: string; expiresAt: number; bank: RevisionBankStatus }>(uid, {
    action: "revision.data.reserve",
  });
  return { reservationId: result.reservationId, expiresAt: result.expiresAt, bank: result.bank };
}

/**
 * Reserve a cloud slot when the Test Bank API is reachable. A transient outage
 * (including the local Vite 501 stub) must not block generating/importing — the
 * test is stored in the local fallback and migrated later without duplicates.
 */
export async function reserveRevisionTestSlotOrOffline(uid: string): Promise<{ reservationId: string; offline: boolean; bank?: RevisionBankStatus }> {
  try {
    const reservation = await reserveRevisionTestSlot(uid);
    return { reservationId: reservation.reservationId, offline: false, bank: reservation.bank };
  } catch (error) {
    if (!isTransientRevisionCloudError(error)) throw error;
    return { reservationId: "", offline: true };
  }
}

export async function releaseRevisionTestSlot(uid: string, reservationId: string): Promise<void> {
  if (!reservationId) return;
  try {
    await callRevisionData(uid, { action: "revision.data.release", reservationId });
  } catch {
    // Reservations expire automatically. A release failure must not replace the
    // actual provider/generation error the learner needs to see.
  }
}

export function buildCustomTestBundle(uid: string, testId: number): TestBundle {
  const local = loadDb(uid);
  const test = local.dailyTests.find((row) => row.id === testId && row.kind === "custom");
  if (!test) throw new RevisionCloudError("The generated test could not be prepared for cloud saving.", "TEST_NOT_FOUND", 404);
  const questionSet = new Set(test.questionIds);
  const questions = local.questions.filter((question) => questionSet.has(question.id));
  const subjectSet = new Set(questions.map((question) => question.subjectId));
  const topicSet = new Set(questions.map((question) => question.topicId));
  return {
    test: structuredClone(test),
    questions: structuredClone(questions),
    subjects: structuredClone(local.subjects.filter((subject) => subjectSet.has(subject.id))),
    topics: structuredClone(local.topics.filter((topic) => topicSet.has(topic.id))),
    createdAtMs: Date.now(),
  };
}

export type PersistCustomTestResult = {
  status: "cloud" | "local";
  bank?: RevisionBankStatus;
  message?: string;
};

/**
 * Durable save for an AI / imported test. The local Test Bank row is already
 * written; this commits it to the learner's cloud bank when possible and
 * otherwise leaves the offline copy in place for later idempotent migration.
 */
export async function persistCustomTestToBank(uid: string, testId: number, reservationId: string): Promise<PersistCustomTestResult> {
  if (reservationId) {
    try {
      const bank = await commitCustomTestToCloud(uid, testId, reservationId);
      return { status: "cloud", bank };
    } catch (error) {
      await releaseRevisionTestSlot(uid, reservationId);
      if (!isTransientRevisionCloudError(error)) throw error;
    }
  }
  const migrated = await migrateOneLocalTest(uid, testId);
  if (migrated) {
    try { return { status: "cloud", bank: await fetchRevisionBankStatus(uid) }; } catch {
      return { status: "cloud" };
    }
  }
  return {
    status: "local",
    message: "Saved to this device. It will sync to your cloud Test Bank when you are back online.",
  };
}

export async function commitCustomTestToCloud(uid: string, testId: number, reservationId: string): Promise<RevisionBankStatus> {
  const bundle = buildCustomTestBundle(uid, testId);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await callRevisionData<{ ok: true; bank: RevisionBankStatus }>(uid, {
        action: "revision.data.create",
        reservationId,
        bundle,
      });
      cloudTestIdsFor(uid).add(testId);
      await persistRevisionProgressNow(uid);
      return result.bank;
    } catch (error) {
      lastError = error;
      const retryable = !(error instanceof RevisionCloudError) || error.status >= 500;
      if (!retryable || attempt === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  // The transaction may have committed even if its HTTP response was lost.
  // Verify the authoritative document before allowing the caller to roll back
  // the only local copy. The create endpoint itself is also idempotent by id.
  const uncertain = !(lastError instanceof RevisionCloudError) || lastError.status >= 500;
  if (uncertain) {
    try {
      const saved = await getDoc(doc(firestore, "users", uid, "revisionTests", String(testId)));
      if (saved.exists()) {
        cloudTestIdsFor(uid).add(testId);
        await persistRevisionProgressNow(uid);
        try { return await fetchRevisionBankStatus(uid); } catch {
          return { used: 0, limit: -1, full: false, planId: "", planName: "Current", cycle: "monthly" };
        }
      }
    } catch {
      // Preserve and surface the original commit error below.
    }
  }
  throw lastError;
}

export async function deleteCustomTestFromCloud(uid: string, testId: number): Promise<RevisionBankStatus | null> {
  // Do not let a queued pre-delete snapshot race the server cleanup and
  // recreate stale progress documents immediately after deletion.
  if (persistenceTimer) {
    clearTimeout(persistenceTimer);
    persistenceTimer = null;
  }
  const durable = cloudTestIdsFor(uid);
  const wasDurable = durable.delete(testId);
  try {
    const result = await callRevisionData<{ ok: true; bank: RevisionBankStatus }>(uid, {
      action: "revision.data.delete",
      testId,
    });
    return result.bank;
  } catch (error) {
    const uncertain = !(error instanceof RevisionCloudError) || error.status >= 500;
    if (uncertain) {
      try {
        const tombstone = await getDoc(doc(firestore, "users", uid, "revisionDeletedTests", String(testId)));
        if (tombstone.exists()) {
          try { return await fetchRevisionBankStatus(uid); } catch { return null; }
        }
      } catch {
        // Keep and surface the original delete error below.
      }
    }
    if (wasDurable) durable.add(testId);
    throw error;
  }
}

function inferTestIdForQuestion(local: RevisionDb, questionId: number): number | null {
  return local.dailyTests.find((test) => test.kind === "custom" && test.questionIds.includes(questionId))?.id ?? null;
}

function safeJson(value: unknown) {
  return JSON.stringify(value);
}

type ProgressWrite = {
  path: [string, string, string, string];
  data: Record<string, unknown>;
  key: string;
  signature: string;
};

async function flushBatch(uid: string, writes: ProgressWrite[]) {
  // Group by parent test. If another device deleted one test, its tombstone may
  // reject those stale writes; isolating groups ensures progress for every
  // other valid test still reaches Firestore.
  const groups = new Map<string, ProgressWrite[]>();
  for (const write of writes) {
    const testKey = typeof write.data.testKey === "string" ? write.data.testKey : "__mixed__";
    groups.set(testKey, [...(groups.get(testKey) ?? []), write]);
  }

  for (const [testKey, group] of groups) {
    for (let start = 0; start < group.length; start += 400) {
      const chunk = group.slice(start, start + 400);
      const batch = writeBatch(firestore);
      for (const write of chunk) {
        batch.set(doc(firestore, ...write.path), { ...write.data, updatedAt: serverTimestamp() }, { merge: true });
      }
      try {
        await batch.commit();
        chunk.forEach((write) => fingerprint.set(write.key, write.signature));
      } catch (error) {
        if (testKey !== "__mixed__") {
          try {
            const parent = await getDoc(doc(firestore, "users", uid, "revisionTests", testKey));
            if (!parent.exists()) {
              cloudTestIdsFor(uid).delete(Number(testKey));
              continue;
            }
          } catch {
            // Surface the original persistence failure below.
          }
        }
        throw error;
      }
    }
  }
}

export async function persistRevisionProgressNow(uid: string): Promise<void> {
  if (hydrationDepth > 0 || uid === "guest") return;
  currentFirebaseUser(uid);
  if (persistenceRunning) { persistenceAgain = true; return; }
  persistenceRunning = true;
  try {
    const local = loadDb(uid);
    const durable = cloudTestIdsFor(uid);
    const writes: ProgressWrite[] = [];

    for (const attempt of local.testAttempts) {
      const test = local.dailyTests.find((row) => row.id === attempt.dailyTestId);
      if (!test || test.kind !== "custom" || !durable.has(test.id)) continue;
      const payload: CloudAttempt = {
        uid,
        testId: test.id,
        testKey: String(test.id),
        attempt: structuredClone(attempt),
        answers: structuredClone(local.testAnswers.filter((answer) => answer.attemptId === attempt.id)),
        updatedAtMs: Date.now(),
      };
      const stable = { ...payload, updatedAtMs: 0 };
      const signature = safeJson(stable);
      const key = `${uid}:attempt:${attempt.id}`;
      if (fingerprint.get(key) !== signature) writes.push({ path: ["users", uid, "revisionAttempts", String(attempt.id)], data: payload as unknown as Record<string, unknown>, key, signature });
    }

    for (const item of local.revisionItems) {
      const testId = inferTestIdForQuestion(local, item.questionId);
      if (!testId || !durable.has(testId)) continue;
      const payload = { uid, testId, testKey: String(testId), item: structuredClone(item), updatedAtMs: Date.now() };
      const signature = safeJson({ ...payload, updatedAtMs: 0 });
      const key = `${uid}:item:${item.questionId}`;
      if (fingerprint.get(key) !== signature) writes.push({ path: ["users", uid, "revisionItems", String(item.questionId)], data: payload, key, signature });
    }

    for (const session of local.revisionSessions) {
      const testIds = new Set(session.questionIds.map((questionId) => inferTestIdForQuestion(local, questionId)).filter((id): id is number => Boolean(id)));
      // A cloud session must have one authoritative parent test. Mixed Smart
      // Revision sessions remain safely in the local compatibility store;
      // persisting them under one parent would let a deleted test's progress
      // be resurrected through a different surviving parent.
      if (testIds.size !== 1 || Array.from(testIds).some((testId) => !durable.has(testId))) continue;
      const onlyTestId = Array.from(testIds)[0];
      const payload: CloudSession = {
        uid,
        testId: onlyTestId,
        testKey: String(onlyTestId),
        session: structuredClone(session),
        answers: structuredClone(local.revisionSessionAnswers.filter((answer) => answer.sessionId === session.id)),
        updatedAtMs: Date.now(),
      };
      const signature = safeJson({ ...payload, updatedAtMs: 0 });
      const key = `${uid}:session:${session.id}`;
      if (fingerprint.get(key) !== signature) writes.push({ path: ["users", uid, "revisionSessions", String(session.id)], data: payload as unknown as Record<string, unknown>, key, signature });
    }

    await flushBatch(uid, writes);
  } finally {
    persistenceRunning = false;
    if (persistenceAgain) {
      persistenceAgain = false;
      void persistRevisionProgressNow(uid).catch(() => undefined);
    }
  }
}

export function queueRevisionCloudPersistence(uid: string) {
  if (hydrationDepth > 0 || uid === "guest") return;
  if (persistenceTimer) clearTimeout(persistenceTimer);
  persistenceTimer = setTimeout(() => {
    persistenceTimer = null;
    void persistRevisionProgressNow(uid).catch(() => undefined);
  }, 220);
}

const dataOf = (snapshot: QueryDocumentSnapshot<DocumentData>) => snapshot.data() as Record<string, any>;

function upsertById<T extends { id: number }>(rows: T[], incoming: T[]): T[] {
  const map = new Map(rows.map((row) => [row.id, row]));
  incoming.forEach((row) => map.set(row.id, row));
  return Array.from(map.values());
}

function mergeCloudIntoLocal(
  uid: string,
  testDocs: QueryDocumentSnapshot<DocumentData>[],
  attemptDocs: QueryDocumentSnapshot<DocumentData>[],
  itemDocs: QueryDocumentSnapshot<DocumentData>[],
  sessionDocs: QueryDocumentSnapshot<DocumentData>[],
) {
  const local = loadDb(uid);
  const bundles = testDocs.map(dataOf).filter((data) => data?.test?.kind === "custom") as TestBundle[];
  const cloudTestIds = new Set(bundles.map((bundle) => Number(bundle.test.id)));
  const cloudFingerprints = new Set(bundles.map((bundle) => testContentFingerprint(bundle.test, bundle.questions ?? [])));
  const existingCustomTests = local.dailyTests.filter((test) => test.kind === "custom");
  const localOnlyTests = existingCustomTests.filter((test) => {
    if (cloudTestIds.has(test.id)) return false;
    // Drop a local-only row that is the same paper as a cloud test so remigrate
    // / multi-device sync cannot show the same exam twice in the Test Bank.
    return !cloudFingerprints.has(testContentFingerprint(test, local.questions));
  });

  const cloudQuestions = bundles.flatMap((bundle) => Array.isArray(bundle.questions) ? bundle.questions : []);
  const cloudSubjects = bundles.flatMap((bundle) => Array.isArray(bundle.subjects) ? bundle.subjects : []);
  const cloudTopics = bundles.flatMap((bundle) => Array.isArray(bundle.topics) ? bundle.topics : []);
  local.dailyTests = [
    ...local.dailyTests.filter((test) => test.kind !== "custom"),
    ...localOnlyTests,
    ...bundles.map((bundle) => bundle.test),
  ];
  // Replace only tests that now have a durable cloud copy. A local-only test
  // that could not migrate (for example because the bank is full) must remain
  // available instead of being destroyed.
  const replacedQuestionIds = new Set(
    existingCustomTests.filter((test) => cloudTestIds.has(test.id)).flatMap((test) => test.questionIds),
  );
  local.questions = upsertById(local.questions.filter((question) => !replacedQuestionIds.has(question.id)), cloudQuestions);
  local.subjects = upsertById(local.subjects, cloudSubjects);
  local.topics = upsertById(local.topics, cloudTopics);

  const attempts = attemptDocs.map(dataOf).map((data) => data.attempt).filter(Boolean) as TestAttemptRow[];
  const answers = attemptDocs.flatMap((snapshot) => {
    const data = dataOf(snapshot);
    return Array.isArray(data.answers) ? data.answers : [];
  }) as TestAnswerRow[];
  // Merge by immutable row id, but preserve a newer offline local attempt.
  // This is essential both for first-run migration (the parent arrives before
  // progress) and for recovery after the app was closed before Firestore's
  // in-memory queue reached the server.
  const cloudWinningAttemptIds = new Set<number>();
  const attemptMap = new Map(local.testAttempts.map((attempt) => [attempt.id, attempt]));
  for (const incoming of attempts) {
    const existing = attemptMap.get(incoming.id);
    const localUpdated = new Date(existing?.updatedAt ?? 0).getTime();
    const cloudUpdated = new Date(incoming.updatedAt ?? 0).getTime();
    const localAnswerCount = local.testAnswers.filter((answer) => answer.attemptId === incoming.id).length;
    const cloudAnswerCount = answers.filter((answer) => answer.attemptId === incoming.id).length;
    const localIsMoreComplete = Boolean(existing) && (
      (existing!.status === "completed" && incoming.status !== "completed")
      || (existing!.status === incoming.status && localAnswerCount > cloudAnswerCount)
    );
    if (!localIsMoreComplete && (!existing || !Number.isFinite(localUpdated) || cloudUpdated >= localUpdated)) {
      attemptMap.set(incoming.id, incoming);
      cloudWinningAttemptIds.add(incoming.id);
    }
  }
  local.testAttempts = Array.from(attemptMap.values());

  // In-progress answers are merged per question so simultaneous offline work
  // on different questions is not lost merely because one attempt document
  // has the later timestamp. Completed attempts remain immutable snapshots and
  // therefore take all answers from whichever completed metadata won above.
  const completedCloudWinners = new Set(
    Array.from(cloudWinningAttemptIds).filter((attemptId) => attemptMap.get(attemptId)?.status === "completed"),
  );
  const answerKey = (answer: TestAnswerRow) => `${answer.attemptId}:${answer.questionId}`;
  const answerMap = new Map(
    local.testAnswers
      .filter((answer) => !completedCloudWinners.has(answer.attemptId))
      .map((answer) => [answerKey(answer), answer]),
  );
  for (const incoming of answers) {
    const resultingAttempt = attemptMap.get(incoming.attemptId);
    const cloudOwnsCompleted = completedCloudWinners.has(incoming.attemptId);
    const localOwnsCompleted = resultingAttempt?.status === "completed" && !cloudOwnsCompleted;
    if (localOwnsCompleted) continue;
    const key = answerKey(incoming);
    const existing = answerMap.get(key);
    const incomingTime = new Date(incoming.answeredAt ?? 0).getTime();
    const existingTime = new Date(existing?.answeredAt ?? 0).getTime();
    if (!existing || cloudOwnsCompleted || incomingTime >= existingTime) answerMap.set(key, incoming);
  }
  local.testAnswers = Array.from(answerMap.values());

  const cloudItems = itemDocs.map(dataOf).map((data) => data.item).filter(Boolean) as RevisionItemRow[];
  // A revision item is logically unique by question, not by its locally
  // allocated row id. Two offline devices can create different row ids for
  // the same weak question; keying by questionId prevents duplicate mastery
  // rows and keeps the newest progress snapshot.
  const itemMap = new Map(local.revisionItems.map((item) => [item.questionId, item]));
  cloudItems.forEach((incoming) => {
    const existing = itemMap.get(incoming.questionId);
    if (!existing || new Date(incoming.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      itemMap.set(incoming.questionId, incoming);
    }
  });
  local.revisionItems = Array.from(itemMap.values());

  const sessions = sessionDocs.map(dataOf).map((data) => data.session).filter(Boolean) as RevisionSessionRow[];
  const sessionAnswers = sessionDocs.flatMap((snapshot) => {
    const data = dataOf(snapshot);
    return Array.isArray(data.answers) ? data.answers : [];
  }) as RevisionSessionAnswerRow[];
  const cloudWinningSessionIds = new Set<number>();
  const sessionMap = new Map(local.revisionSessions.map((session) => [session.id, session]));
  for (const incoming of sessions) {
    const existing = sessionMap.get(incoming.id);
    const localAnswerCount = local.revisionSessionAnswers.filter((answer) => answer.sessionId === incoming.id).length;
    const cloudAnswerCount = sessionAnswers.filter((answer) => answer.sessionId === incoming.id).length;
    const cloudIsAtLeastAsComplete = !existing
      || (incoming.status === "completed" && existing.status !== "completed")
      || (incoming.status === existing.status && cloudAnswerCount >= localAnswerCount && incoming.currentIndex >= existing.currentIndex);
    if (cloudIsAtLeastAsComplete) {
      sessionMap.set(incoming.id, incoming);
      cloudWinningSessionIds.add(incoming.id);
    }
  }
  local.revisionSessions = Array.from(sessionMap.values());
  local.revisionSessionAnswers = upsertById(
    local.revisionSessionAnswers.filter((answer) => !cloudWinningSessionIds.has(answer.sessionId)),
    sessionAnswers.filter((answer) => cloudWinningSessionIds.has(answer.sessionId)),
  );
  saveDb(uid, local);

  attemptDocs.forEach((snapshot) => {
    const data = dataOf(snapshot);
    if (data.attempt) fingerprint.set(`${uid}:attempt:${data.attempt.id}`, safeJson({
      uid: data.uid,
      testId: data.testId,
      testKey: data.testKey ?? String(data.testId),
      attempt: data.attempt,
      answers: Array.isArray(data.answers) ? data.answers : [],
      updatedAtMs: 0,
    }));
  });
  itemDocs.forEach((snapshot) => {
    const data = dataOf(snapshot);
    if (data.item) fingerprint.set(`${uid}:item:${data.item.questionId}`, safeJson({
      uid: data.uid,
      testId: data.testId,
      testKey: data.testKey ?? String(data.testId),
      item: data.item,
      updatedAtMs: 0,
    }));
  });
  sessionDocs.forEach((snapshot) => {
    const data = dataOf(snapshot);
    if (data.session) fingerprint.set(`${uid}:session:${data.session.id}`, safeJson({
      uid: data.uid,
      testId: data.testId ?? null,
      testKey: data.testKey ?? (data.testId == null ? null : String(data.testId)),
      session: data.session,
      answers: Array.isArray(data.answers) ? data.answers : [],
      updatedAtMs: 0,
    }));
  });
}

async function readCloud(uid: string) {
  const userRef = doc(firestore, "users", uid);
  const reads = Promise.all([
    getDocs(collection(userRef, "revisionTests")),
    getDocs(collection(userRef, "revisionAttempts")),
    getDocs(collection(userRef, "revisionItems")),
    getDocs(collection(userRef, "revisionSessions")),
  ]);
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    const [tests, attempts, items, sessions] = await Promise.race([
      reads,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new RevisionCloudError("Cloud sync timed out; using the safe local copy.", "SYNC_TIMEOUT", 503)),
          7_000,
        );
      }),
    ]);
    return { tests: tests.docs, attempts: attempts.docs, items: items.docs, sessions: sessions.docs };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function migrateOneLocalTest(uid: string, testId: number): Promise<boolean> {
  try {
    await callRevisionData(uid, { action: "revision.data.migrate", bundle: buildCustomTestBundle(uid, testId) });
    cloudTestIdsFor(uid).add(testId);
    await persistRevisionProgressNow(uid);
    return true;
  } catch (error) {
    if (error instanceof RevisionCloudError && error.code === "TEST_DELETED") {
      // A deletion tombstone is authoritative across devices. Removing the
      // stale local snapshot prevents an offline device from resurrecting a
      // permanently deleted test during migration.
      deleteCustomTestLocal(uid, testId);
    }
    return false;
  }
}

async function migrateMissingLocalTests(uid: string, testDocs: QueryDocumentSnapshot<DocumentData>[]) {
  const local = loadDb(uid);
  const bundles = testDocs.map(dataOf).filter((data) => data?.test?.kind === "custom") as TestBundle[];
  const cloudIds = new Set(bundles.map((bundle) => Number(bundle.test.id)).filter(Number.isFinite));
  const cloudFingerprints = new Set(bundles.map((bundle) => testContentFingerprint(bundle.test, bundle.questions ?? [])));
  const missing = local.dailyTests.filter((test) => test.kind === "custom" && !cloudIds.has(test.id));
  for (const test of missing) {
    // Same paper already lives in the cloud under another row id — do not
    // upload it again. The merge step drops this local-only duplicate.
    if (cloudFingerprints.has(testContentFingerprint(test, local.questions))) continue;
    // Never abort hydration: a single un-migratable legacy snapshot must not
    // hide every other valid cloud test from this device.
    await migrateOneLocalTest(uid, test.id);
  }
}

export async function hydrateRevisionFromCloud(uid: string): Promise<void> {
  if (uid === "guest") return;
  currentFirebaseUser(uid);
  hydrationDepth += 1;
  try {
    let cloud = await readCloud(uid);
    await migrateMissingLocalTests(uid, cloud.tests);
    cloud = await readCloud(uid);
    const durable = cloudTestIdsFor(uid);
    durable.clear();
    cloud.tests
      .map((snapshot) => Number(dataOf(snapshot)?.test?.id))
      .filter(Number.isFinite)
      .forEach((testId) => durable.add(testId));
    mergeCloudIntoLocal(uid, cloud.tests, cloud.attempts, cloud.items, cloud.sessions);
  } finally {
    hydrationDepth = Math.max(0, hydrationDepth - 1);
  }
  // Upload any local-only historical attempts that survived the merge (for
  // example the first run of legacy migration) without waiting for a future
  // learner interaction.
  await persistRevisionProgressNow(uid);
}
