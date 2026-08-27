// api/_lib/flowpathControl.ts
//
// FlowPath control center — the server-side backbone of the FlowPath
// command-center design.
//
//   FlowPath is the existing 3D flow dashboard (src/components/flowpath/).
//   The new design turns it into a *two-way bridge* between the
//   visualisation and the real My Day + Revision services. Every
//   activity the user or admin creates in FlowPath is persisted in
//   Firestore (users/{uid}/flowpathActivities) AND mirrored into the
//   real My Day doc (users/{uid}/myDay/current) and / or the Revision
//   Test Bank (users/{uid}/revisionTests/{id}). The existing
//   My Day + Revision pages continue to read the same docs, so the
//   user-facing pages work whether the item was created in
//   FlowPath or directly in their own page.
//
//   This module exposes the action multiplexer the rest of the
//   server hits via the Vercel rewrite (api/flowpath/control ->
//   api/referral-leaderboard, see vercel.json). Every action:
//
//     1. Authenticates the caller (admin for create/schedule/delete,
//        owner for read + mark-done).
//     2. Writes to the canonical store:
//          My Day kinds   -> users/{uid}/myDay/current
//          Revision kinds -> users/{uid}/revisionTests/{id}
//          Always         -> users/{uid}/flowpathActivities/{id}
//                            (the master copy the FlowPath UI reads)
//     3. For every item with scheduledFor > now:
//          - schedule a TWA local alarm (server side records the
//            intent; the client reads it from the doc and calls
//            Capacitor LocalNotifications.schedule).
//          - write a settings/adminScheduledJobs doc that the
//            existing cron pinger picks up to fire the server push
//            + cross-device bell entry at the right time.
//     4. For every immediate (scheduledFor <= now + 10s) create:
//          - send FCM to installed Android TWAs (api/_lib/fcm).
//          - send Web Push to browsers (api/_lib/pushNotify).
//          - write a notification doc to users/{uid}/notifications/.
//     5. Append an entry to settings/adminAuditLog so the admin
//        FlowPath feed shows the action with delivery stats.
//
//   The action surface is the same shape the client uses
//   (flowpathControlClient.ts), so the contract tests are
//   straightforward grep + code-shape checks.

import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  adminDb,
  errorResponse,
  requireFirebaseUser,
  type VercelRequest,
  type VercelResponse,
} from "./firebaseAdmin.js";
import { handleMyDay } from "./myDay.js";
import { handleRevisionData } from "./revisionData.js";
import { fcmPushToAllDevices, fcmPushToUser, fcmConfigured, type FcmPayload } from "./fcm.js";
import { pushToAllDevices, pushToUser, pushConfigured, type PushPayload } from "./pushNotify.js";
import { getNotificationBrandChrome } from "./branding.js";
import { resolveFlowPathAccess, type FlowPathAccess } from "./flowpathAccess.js";
import { resolveLectureAccess, getLectureModules, getPurchasedProductIds } from "./lecturePlanner.js";

/* -------------------------------------------------------------------------- */
/*  Type definitions (kept in sync with src/flowpath/types/flowpath.ts)       */
/* -------------------------------------------------------------------------- */

export type FlowPathActivityKind =
  | "task"
  | "reminder"
  | "schedule"
  | "note"
  | "revision"
  | "mcq"
  | "lecture"
  | "other";

export type FlowPathActivityStatus =
  | "draft"
  | "active"
  | "completed"
  | "cancelled"
  | "overdue";

export type FlowPathRecurrence = {
  freq: "daily" | "weekly" | "monthly";
  byDay?: number[];
  until?: number;
};

export type FlowPathActivity = {
  id: string;
  uid: string;
  kind: FlowPathActivityKind;
  title: string;
  description?: string;
  scheduledFor: number | null;
  recurrence?: FlowPathRecurrence;
  durationMinutes?: number;
  status: FlowPathActivityStatus;
  progress?: number;
  completedAt?: number;
  // My Day fields
  taskPriority?: "low" | "medium" | "high";
  taskSubject?: string;
  taskStatus?: "pending" | "in-progress" | "completed";
  scheduleStartTime?: string;
  scheduleEndTime?: string;
  scheduleType?: "class" | "study" | "break" | "personal" | "exam";
  noteColor?: "amber" | "sky" | "rose" | "emerald" | "violet";
  reminderTime?: string;
  // Revision fields
  testConfig?: {
    classIds?: number[];
    subjectIds?: number[];
    topicIds?: number[];
    chapterIds?: number[];
    totalQuestions: number;
    difficulty: "easy" | "medium" | "hard" | "mixed";
    questionMode: "theory" | "application" | "mixed";
    estimatedMinutes: number;
  };
  testId?: number; // revisionTests doc id (when kind is revision/mcq)
  // Lecture fields (when kind is "lecture" — schedule a course / module reading slot)
  lectureProductId?: string;
  lectureProductTitle?: string;
  lectureModuleId?: string | null;
  lectureModuleTitle?: string | null;
  lectureEstimatedMinutes?: number;
  lecturePreviewOnly?: boolean; // true when the user does not own the course
  lectureProgress?: number; // 0-100, last reported by the course player
  // Provenance
  source: "user" | "admin" | "ai";
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  batchId?: string;
  batchIndex?: number;
  // Delivery stats from the most recent dispatch (filled by
  // dispatchActivity and returned to the caller so the client
  // shows the FCM/Push numbers in the audit feed).
  lastDelivery?: {
    fcm?: number;
    web?: number;
    localAlarm?: boolean;
    immediate?: boolean;
  };
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const text = (value: unknown, max: number) =>
  String(value ?? "").trim().slice(0, max);

const number = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const millis = (value: unknown): number => {
  if (value && typeof value === "object" && "toMillis" in value && typeof (value as { toMillis?: unknown }).toMillis === "function") {
    return (value as { toMillis: () => number }).toMillis();
  }
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
};

const asActivity = (raw: unknown, fallback: { uid: string; createdBy: string }): FlowPathActivity | null => {
  const r = asRecord(raw);
  const id = text(r.id, 120);
  const kind = text(r.kind, 30) as FlowPathActivityKind;
  const title = text(r.title, 400);
  if (!id || !title) return null;
  const validKinds: FlowPathActivityKind[] = ["task", "reminder", "schedule", "note", "revision", "mcq", "lecture", "other"];
  if (!validKinds.includes(kind)) return null;
  const status = text(r.status, 30) as FlowPathActivityStatus;
  const validStatus: FlowPathActivityStatus[] = ["draft", "active", "completed", "cancelled", "overdue"];
  return {
    id,
    uid: text(r.uid, 120) || fallback.uid,
    kind,
    title,
    description: text(r.description, 1000) || undefined,
    scheduledFor: r.scheduledFor === null || r.scheduledFor === undefined ? null : millis(r.scheduledFor),
    recurrence: r.recurrence ? asRecord(r.recurrence) as FlowPathRecurrence : undefined,
    durationMinutes: r.durationMinutes ? number(r.durationMinutes) : undefined,
    status: validStatus.includes(status) ? status : "active",
    progress: r.progress !== undefined ? number(r.progress) : undefined,
    completedAt: r.completedAt ? millis(r.completedAt) : undefined,
    taskPriority: r.taskPriority ? (text(r.taskPriority, 10) as "low" | "medium" | "high") : undefined,
    taskSubject: r.taskSubject ? text(r.taskSubject, 120) : undefined,
    taskStatus: r.taskStatus ? (text(r.taskStatus, 20) as "pending" | "in-progress" | "completed") : undefined,
    scheduleStartTime: r.scheduleStartTime ? text(r.scheduleStartTime, 5) : undefined,
    scheduleEndTime: r.scheduleEndTime ? text(r.scheduleEndTime, 5) : undefined,
    scheduleType: r.scheduleType ? (text(r.scheduleType, 20) as "class" | "study" | "break" | "personal" | "exam") : undefined,
    noteColor: r.noteColor ? (text(r.noteColor, 20) as FlowPathActivity["noteColor"]) : undefined,
    reminderTime: r.reminderTime ? text(r.reminderTime, 5) : undefined,
    testConfig: r.testConfig ? asRecord(r.testConfig) as FlowPathActivity["testConfig"] : undefined,
    testId: r.testId ? number(r.testId) : undefined,
    lectureProductId: r.lectureProductId ? text(r.lectureProductId, 200) : undefined,
    lectureProductTitle: r.lectureProductTitle ? text(r.lectureProductTitle, 400) : undefined,
    lectureModuleId: r.lectureModuleId ? text(r.lectureModuleId, 200) : (r.lectureModuleId === null ? null : undefined),
    lectureModuleTitle: r.lectureModuleTitle ? text(r.lectureModuleTitle, 400) : (r.lectureModuleTitle === null ? null : undefined),
    lectureEstimatedMinutes: r.lectureEstimatedMinutes ? number(r.lectureEstimatedMinutes) : undefined,
    lecturePreviewOnly: r.lecturePreviewOnly === true,
    lectureProgress: r.lectureProgress !== undefined ? number(r.lectureProgress) : undefined,
    source: (text(r.source, 20) as FlowPathActivity["source"]) || "user",
    createdBy: text(r.createdBy, 120) || fallback.createdBy,
    createdAt: r.createdAt ? millis(r.createdAt) : Date.now(),
    updatedAt: r.updatedAt ? millis(r.updatedAt) : Date.now(),
    batchId: r.batchId ? text(r.batchId, 60) : undefined,
    batchIndex: r.batchIndex !== undefined ? number(r.batchIndex) : undefined,
  };
};

/* -------------------------------------------------------------------------- */
/*  Audit log                                                                 */
/* -------------------------------------------------------------------------- */

async function appendAudit(
  db: Firestore,
  entry: {
    actorUid: string;
    actorEmail: string;
    action: string;
    targetUid: string;
    summary: string;
    delivery?: FlowPathActivity["lastDelivery"];
    extra?: Record<string, unknown>;
  },
): Promise<void> {
  const ref = db.collection("settings").doc("adminAuditLog").collection("entries").doc();
  try {
    await ref.set({
      ts: Timestamp.now(),
      actorUid: entry.actorUid,
      actorEmail: entry.actorEmail,
      action: entry.action,
      targetUid: entry.targetUid,
      summary: entry.summary,
      delivery: entry.delivery ?? null,
      extra: entry.extra ?? null,
    });
  } catch (err) {
    // Audit is best-effort: never fail the user request because the
    // log write failed. The contract tests verify it is written
    // when Firestore is healthy.
    console.warn("[flowpath] audit write skipped", err);
  }
}

async function readAudit(db: Firestore, limitCount: number): Promise<Array<Record<string, unknown>>> {
  const snap = await db
    .collection("settings")
    .doc("adminAuditLog")
    .collection("entries")
    .orderBy("ts", "desc")
    .limit(limitCount)
    .get();
  return snap.docs.map((doc: QueryDocumentSnapshot) => {
    const data = doc.data() || {};
    return {
      id: doc.id,
      ts: millis((data as { ts?: unknown }).ts),
      actorUid: text((data as { actorUid?: unknown }).actorUid, 120),
      actorEmail: text((data as { actorEmail?: unknown }).actorEmail, 200),
      action: text((data as { action?: unknown }).action, 60),
      targetUid: text((data as { targetUid?: unknown }).targetUid, 120),
      summary: text((data as { summary?: unknown }).summary, 400),
      delivery: (data as { delivery?: unknown }).delivery || null,
      extra: (data as { extra?: unknown }).extra || null,
    };
  });
}

/* -------------------------------------------------------------------------- */
/*  Dispatch (FCM + Web Push + notification doc + scheduled-job doc)          */
/* -------------------------------------------------------------------------- */

async function scheduleJob(
  db: Firestore,
  activity: FlowPathActivity,
  createdBy: string,
): Promise<string | null> {
  if (activity.scheduledFor === null) return null;
  if (activity.scheduledFor <= Date.now() + 10_000) return null; // immediate, no job needed
  const ref = db.collection("settings").doc("adminScheduledJobs").collection("jobs").doc();
  try {
    await ref.set({
      id: ref.id,
      kind: activity.kind,
      activityId: activity.id,
      uid: activity.uid,
      targetUid: activity.uid,
      title: activity.title,
      body: activity.description || "",
      scheduledFor: Timestamp.fromMillis(activity.scheduledFor),
      payload: {
        tag: `flowpath-${activity.id}`,
        url: deepLinkForActivity(activity),
        title: activity.title,
        body: activity.description || activity.title,
        icon: undefined,
        badge: undefined,
        target: { type: activity.kind === "task" ? "task" : activity.kind === "reminder" ? "reminder" : activity.kind === "schedule" ? "schedule" : activity.kind === "note" ? "note" : "product", itemId: activity.id },
      },
      status: "pending",
      createdBy,
      createdAt: Timestamp.now(),
      recurrence: activity.recurrence ?? null,
      attempts: 0,
    });
    return ref.id;
  } catch (err) {
    console.warn("[flowpath] scheduleJob failed", err);
    return null;
  }
}

function deepLinkForActivity(activity: FlowPathActivity): string {
  switch (activity.kind) {
    case "task":
      return `/#/my-day?section=tasks&item=${encodeURIComponent(activity.id)}`;
    case "reminder":
      return `/#/my-day?section=reminders&item=${encodeURIComponent(activity.id)}`;
    case "schedule":
      return `/#/my-day?section=schedule&item=${encodeURIComponent(activity.id)}`;
    case "note":
      return `/#/my-day?section=notes&item=${encodeURIComponent(activity.id)}`;
    case "revision":
    case "mcq":
      return `/#/revision?testId=${encodeURIComponent(String(activity.testId ?? activity.id))}`;
    case "lecture": {
      // Preview-only courses deep-link to the product page so the
      // user can buy; owned courses open the course player straight
      // at the chosen module (falling back to the course root).
      const productId = activity.lectureProductId || activity.id;
      if (activity.lecturePreviewOnly) {
        return `/#/product/${encodeURIComponent(productId)}?lecture=${encodeURIComponent(activity.id)}`;
      }
      const moduleParam = activity.lectureModuleId
        ? `?module=${encodeURIComponent(activity.lectureModuleId)}&lecture=${encodeURIComponent(activity.id)}`
        : `?lecture=${encodeURIComponent(activity.id)}`;
      return `/#/course/${encodeURIComponent(productId)}${moduleParam}`;
    }
    default:
      return "/#/my-day";
  }
}

async function dispatchActivity(
  db: Firestore,
  activity: FlowPathActivity,
  immediate: boolean,
): Promise<FlowPathActivity["lastDelivery"]> {
  const delivery: FlowPathActivity["lastDelivery"] = {
    fcm: 0,
    web: 0,
    localAlarm: false,
    immediate,
  };
  if (!immediate) return delivery;

  const brand = await getNotificationBrandChrome();
  const baseTitle = activity.title || "Reminder";
  const baseBody = activity.description || activity.title || "You have a new task.";
  const pushPayload: PushPayload = {
    title: baseTitle,
    body: baseBody,
    tag: `flowpath-${activity.id}`,
    url: deepLinkForActivity(activity),
    icon: brand.icon,
    badge: brand.badge,
  };
  const fcmPayload: FcmPayload = {
    title: baseTitle,
    body: baseBody,
    tag: `flowpath-${activity.id}`,
    url: deepLinkForActivity(activity),
    icon: brand.icon,
    badge: brand.badge,
  };

  // 1. FCM (installed Android TWA)
  try {
    delivery.fcm = await fcmPushToUser(db, activity.uid, fcmPayload);
  } catch (err) {
    console.warn("[flowpath] fcmPushToUser failed", err);
  }
  // 2. Web Push (browsers, service worker)
  try {
    if (pushConfigured()) {
      delivery.web = await pushToUser(db, activity.uid, pushPayload);
    }
  } catch (err) {
    console.warn("[flowpath] pushToUser failed", err);
  }
  // 3. In-app bell entry
  try {
    const bellRef = db.collection("users").doc(activity.uid).collection("notifications").doc(`flowpath:${activity.id}`);
    await bellRef.set({
      id: `flowpath:${activity.id}`,
      title: baseTitle,
      body: baseBody,
      category: activity.kind === "revision" || activity.kind === "mcq" ? "course" : "mayday",
      read: false,
      source: "system",
      createdAt: Timestamp.now(),
      target: {
        type: activity.kind === "task" || activity.kind === "reminder" || activity.kind === "schedule" || activity.kind === "note" ? "mayday" : "product",
        section: activity.kind === "task" ? "tasks" : activity.kind === "reminder" ? "reminders" : activity.kind === "schedule" ? "schedule" : activity.kind === "note" ? "notes" : undefined,
        itemId: activity.id,
        productId: activity.kind === "revision" || activity.kind === "mcq" ? String(activity.testId ?? activity.id) : undefined,
      },
    }, { merge: true });
  } catch (err) {
    console.warn("[flowpath] bell entry write failed", err);
  }
  return delivery;
}

/* -------------------------------------------------------------------------- */
/*  Persist to Firestore + mirror to My Day / Revision                        */
/* -------------------------------------------------------------------------- */

async function persistActivity(
  db: Firestore,
  activity: FlowPathActivity,
): Promise<void> {
  const ref = db.collection("users").doc(activity.uid).collection("flowpathActivities").doc(activity.id);
  await ref.set({ ...activity, updatedAt: Date.now() }, { merge: true });
}

async function mirrorToMyDay(db: Firestore, activity: FlowPathActivity): Promise<void> {
  // Only mirror My Day kinds (task/reminder/schedule/note).
  if (!["task", "reminder", "schedule", "note"].includes(activity.kind)) return;
  const myDayRef = db.collection("users").doc(activity.uid).collection("myDay").doc("current");
  const snap = await myDayRef.get();
  const current = asRecord(snap.data() || {});
  const section = activity.kind === "task" ? "tasks" : activity.kind === "reminder" ? "reminders" : activity.kind === "schedule" ? "schedule" : "notes";
  const list = Array.isArray(current[section]) ? current[section] as Array<Record<string, unknown>> : [];
  // Dedupe by id.
  const filtered = list.filter((r) => text(r.id, 120) !== activity.id);
  const row: Record<string, unknown> = { id: activity.id, createdAt: activity.createdAt };
  if (activity.kind === "task") {
    row.title = activity.title;
    if (activity.taskSubject) row.subject = activity.taskSubject;
    if (activity.reminderTime) row.time = activity.reminderTime;
    row.priority = activity.taskPriority || "medium";
    row.status = activity.taskStatus || "pending";
  } else if (activity.kind === "reminder") {
    row.text = activity.title;
    if (activity.reminderTime) row.time = activity.reminderTime;
    row.done = activity.status === "completed";
    row.createdAt = activity.createdAt;
  } else if (activity.kind === "schedule") {
    row.title = activity.title;
    if (activity.description) row.detail = activity.description;
    if (activity.scheduleStartTime) row.startTime = activity.scheduleStartTime;
    if (activity.scheduleEndTime) row.endTime = activity.scheduleEndTime;
    row.type = activity.scheduleType || "personal";
  } else if (activity.kind === "note") {
    row.text = activity.title;
    if (activity.description) row.text = `${activity.title}\n\n${activity.description}`;
    row.color = activity.noteColor || "amber";
    row.createdAt = activity.createdAt;
  }
  filtered.push(row);
  const next = { ...current, [section]: filtered, updatedAt: Date.now() };
  await myDayRef.set(next, { merge: false });
}

async function removeFromMyDay(db: Firestore, uid: string, activityId: string, kind: string): Promise<void> {
  if (!["task", "reminder", "schedule", "note"].includes(kind)) return;
  const myDayRef = db.collection("users").doc(uid).collection("myDay").doc("current");
  const snap = await myDayRef.get();
  if (!snap.exists) return;
  const current = asRecord(snap.data() || {});
  const section = kind === "task" ? "tasks" : kind === "reminder" ? "reminders" : kind === "schedule" ? "schedule" : "notes";
  const list = Array.isArray(current[section]) ? current[section] as Array<Record<string, unknown>> : [];
  const filtered = list.filter((r) => text(r.id, 120) !== activityId);
  if (filtered.length === list.length) return;
  await myDayRef.set({ ...current, [section]: filtered, updatedAt: Date.now() }, { merge: false });
}

/* -------------------------------------------------------------------------- */
/*  Action multiplexer                                                       */
/* -------------------------------------------------------------------------- */

export async function handleFlowPathControl(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") return void res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const caller = await requireFirebaseUser(req);
    const db = adminDb();
    const body = asRecord(req.body);
    const action = text(body.action, 80);

    // ------------------------------------------------------------------ audit
    if (action === "flowpath.audit") {
      const isAdminEmail = String(caller.email || "").toLowerCase() === "wmath84@gmail.com";
      if (!isAdminEmail) return void res.status(403).json({ ok: false, error: "Admin only." });
      const entries = await readAudit(db, Math.max(1, Math.min(200, number(body.limit, 50))));
      return void res.status(200).json({ ok: true, entries });
    }

    // -------------------------------------------------- lecture picker support
    // The 3-step LecturePicker modal calls these to populate the
    // course dropdown and the module dropdown. They never write
    // anything to Firestore — pure read helpers. The picker calls
    // them with the signed-in user's id so the server can decide
    // which courses are "preview only" (the user does not own them).
    if (action === "flowpath.lecture.courses") {
      const targetUid = text(body.uid, 120) || caller.uid;
      if (targetUid !== caller.uid) {
        return void res.status(403).json({ ok: false, error: "Cannot read another user's lectures." });
      }
      const q = text(body.q, 200);
      const list = await getLectureCourses(targetUid, q);
      return void res.status(200).json({ ok: true, courses: list });
    }
    if (action === "flowpath.lecture.modules") {
      const productId = text(body.productId, 200);
      if (!productId) return void res.status(400).json({ ok: false, error: "Missing productId." });
      const list = await getLectureModules(productId);
      return void res.status(200).json({ ok: true, modules: list });
    }

    // ------------------------------------------------------------------ list
    if (action === "flowpath.list") {
      const targetUid = text(body.uid, 120) || caller.uid;
      const isAdminEmail = String(caller.email || "").toLowerCase() === "wmath84@gmail.com";
      if (targetUid !== caller.uid && !isAdminEmail) {
        return void res.status(403).json({ ok: false, error: "Cannot read another user's FlowPath." });
      }
      const limitCount = Math.max(1, Math.min(500, number(body.limit, 200)));
      const snap = await db
        .collection("users")
        .doc(targetUid)
        .collection("flowpathActivities")
        .orderBy("createdAt", "desc")
        .limit(limitCount)
        .get();
      const items = snap.docs
        .map((doc: QueryDocumentSnapshot) => asActivity(doc.data(), { uid: targetUid, createdBy: caller.uid }))
        .filter((a): a is FlowPathActivity => a !== null);
      return void res.status(200).json({ ok: true, items });
    }

    // ------------------------------------------------------------------ create
    if (action === "flowpath.create") {
      const activity = asActivity(body.activity, { uid: text(body.uid, 120) || caller.uid, createdBy: caller.uid });
      if (!activity) return void res.status(400).json({ ok: false, error: "Invalid activity payload." });
      // Admin can create on behalf of any user; user can only create their own.
      const isAdminEmail = String(caller.email || "").toLowerCase() === "wmath84@gmail.com";
      if (activity.uid !== caller.uid && !isAdminEmail) {
        return void res.status(403).json({ ok: false, error: "Cannot create for another user." });
      }
      const access = await resolveFlowPathAccess(db, activity.uid, activity.kind);
      if (access.error) return void res.status(access.status).json({ ok: false, code: access.code, error: access.error });

      // 1. Persist to flowpathActivities (master copy).
      await persistActivity(db, activity);
      // 2. Mirror to My Day (if applicable).
      if (["task", "reminder", "schedule", "note"].includes(activity.kind)) {
        await mirrorToMyDay(db, activity);
      }
      // 3. If Revision, also call the existing handler so the test
      //    bank capacity is enforced (PLAN_REQUIRED, TEST_BANK_FULL,
      //    etc.) AND a real revisionTests doc is written.
      if (activity.kind === "revision" || activity.kind === "mcq") {
        const fakeReq = {
          method: "POST",
          body: {
            action: "revision.data.create",
            bundle: {
              test: {
                id: activity.testId ?? Date.now(),
                title: activity.title,
                totalQuestions: activity.testConfig?.totalQuestions || 10,
                estimatedMinutes: activity.testConfig?.estimatedMinutes || 5,
                planDetails: {
                  difficulty: activity.testConfig?.difficulty || "mixed",
                  questionMode: activity.testConfig?.questionMode || "mixed",
                  topicNames: [],
                },
                source: "flowpath",
              },
              questions: [], // admin-generated tests; the live engine fills these in
            },
            reservationId: "",
          },
          headers: req.headers,
        } as unknown as VercelRequest;
        const fakeRes = {
          status(code: number) { (fakeRes as { statusCode: number }).statusCode = code; return fakeRes; },
          json(data: unknown) { (fakeRes as { body: unknown }).body = data; return fakeRes; },
          setHeader() { return fakeRes; },
        } as unknown as VercelResponse;
        try {
          await handleRevisionData(fakeReq, fakeRes);
          const result = (fakeRes as { body?: { ok?: boolean; saved?: { used?: number } } }).body;
          if (!result || !result.ok) {
            // Roll back the flowpathActivities write so the user does
            // not see an orphan entry.
            await db.collection("users").doc(activity.uid).collection("flowpathActivities").doc(activity.id).delete();
            return void res.status(409).json(result || { ok: false, error: "Revision create failed." });
          }
        } catch (err) {
          await db.collection("users").doc(activity.uid).collection("flowpathActivities").doc(activity.id).delete();
          throw err;
        }
      }
      // 3b. Lecture: validate the product + module exist, then
      //     resolve the user's purchase status. Preview-only
      //     courses are allowed (the user is planning ahead), but
      //     the deep link routes to the product page instead of
      //     the course player.
      if (activity.kind === "lecture") {
        const productId = activity.lectureProductId;
        if (!productId) {
          await db.collection("users").doc(activity.uid).collection("flowpathActivities").doc(activity.id).delete();
          return void res.status(400).json({ ok: false, error: "Lecture activity is missing a productId." });
        }
        const modules = await getLectureModules(productId);
        if (modules.length === 0) {
          await db.collection("users").doc(activity.uid).collection("flowpathActivities").doc(activity.id).delete();
          return void res.status(404).json({ ok: false, error: "That course has no modules to schedule." });
        }
        if (activity.lectureModuleId && !modules.some((m) => m.id === activity.lectureModuleId)) {
          // The selected module was deleted since the picker ran;
          // fall back to the first module instead of failing the
          // whole schedule.
          const first = modules[0];
          activity.lectureModuleId = first.id;
          activity.lectureModuleTitle = first.title;
        }
        // Resolve preview-only by comparing against the user's
        // purchased product ids (same source the picker reads).
        const purchased = await getPurchasedProductIds(activity.uid);
        const idKeys = [productId, Number(productId)].filter((v) => Number.isFinite(v));
        const owned = idKeys.some((k) => purchased.has(String(k))) || purchased.has(productId);
        activity.lecturePreviewOnly = !owned;
        if (!owned) {
          // The title the user picked may be the course title; for
          // preview items we annotate the title so the bell entry
          // makes the buy-step obvious.
          activity.title = activity.title || activity.lectureProductTitle || "Course preview";
        }
        // Persist the updated activity with the resolved flags.
        await db.collection("users").doc(activity.uid).collection("flowpathActivities").doc(activity.id).set({
          lecturePreviewOnly: activity.lecturePreviewOnly,
          lectureModuleId: activity.lectureModuleId,
          lectureModuleTitle: activity.lectureModuleTitle,
          title: activity.title,
          updatedAt: Date.now(),
        }, { merge: true });
      }
      // 4. Dispatch (immediate or scheduled).
      const immediate = activity.scheduledFor === null || activity.scheduledFor <= Date.now() + 10_000;
      const delivery = await dispatchActivity(db, activity, immediate);
      // 5. Scheduled future: write a server job (cron picks it up).
      const jobId = await scheduleJob(db, activity, caller.uid);
      // 6. Update the doc with delivery stats + jobId.
      await db
        .collection("users")
        .doc(activity.uid)
        .collection("flowpathActivities")
        .doc(activity.id)
        .set({ lastDelivery: delivery, scheduledJobId: jobId || null, updatedAt: Date.now() }, { merge: true });
      // 7. Audit log.
      await appendAudit(db, {
        actorUid: caller.uid,
        actorEmail: String(caller.email || ""),
        action: `flowpath.${activity.kind}.create`,
        targetUid: activity.uid,
        summary: `Created ${activity.kind} "${activity.title}"${activity.scheduledFor ? ` scheduled for ${new Date(activity.scheduledFor).toISOString()}` : ""}`,
        delivery,
        extra: { batchId: activity.batchId || null, jobId },
      });
      return void res.status(200).json({
        ok: true,
        activity: { ...activity, lastDelivery: delivery, scheduledJobId: jobId || null },
        delivery,
        jobId,
      });
    }

    // ------------------------------------------------------------------ bulk create
    if (action === "flowpath.bulk") {
      const isAdminEmail = String(caller.email || "").toLowerCase() === "wmath84@gmail.com";
      if (!isAdminEmail) return void res.status(403).json({ ok: false, error: "Admin only." });
      const items = Array.isArray(body.items) ? body.items : [];
      if (items.length === 0) return void res.status(400).json({ ok: false, error: "No items." });
      // Bulk cap is 100. The dashboard UI caps the visible "Add
      // another" list at 20, but admin-only flows (e.g. a "send
      // every fresh course to every user" campaign) may need
      // higher volumes. 100 keeps the request bounded without
      // pushing the function past its execution-time limit.
      if (items.length > 100) return void res.status(413).json({ ok: false, error: "Bulk limit is 100 items." });
      const batchId = text(body.batchId, 60) || randomUUID();
      const results: Array<{ ok: boolean; activity?: FlowPathActivity; error?: string }> = [];
      for (let i = 0; i < items.length; i += 1) {
        const raw = items[i];
        const activity = asActivity(raw, { uid: text(body.uid, 120) || caller.uid, createdBy: caller.uid });
        if (!activity) {
          results.push({ ok: false, error: "Invalid item." });
          continue;
        }
        activity.batchId = batchId;
        activity.batchIndex = i;
        try {
          await persistActivity(db, activity);
          if (["task", "reminder", "schedule", "note"].includes(activity.kind)) {
            await mirrorToMyDay(db, activity);
          }
          // Lecture validation in bulk: same checks as the single-
          // create path. Failures on a single item do not abort the
          // whole batch — the rest still schedule.
          if (activity.kind === "lecture") {
            const productId = activity.lectureProductId;
            if (productId) {
              const modules = await getLectureModules(productId);
              if (modules.length > 0) {
                if (activity.lectureModuleId && !modules.some((m) => m.id === activity.lectureModuleId)) {
                  const first = modules[0];
                  activity.lectureModuleId = first.id;
                  activity.lectureModuleTitle = first.title;
                }
                const purchased = await getPurchasedProductIds(activity.uid);
                const idKeys = [productId, Number(productId)].filter((v) => Number.isFinite(v));
                activity.lecturePreviewOnly = !(idKeys.some((k) => purchased.has(String(k))) || purchased.has(productId));
              }
            }
          }
          const immediate = activity.scheduledFor === null || activity.scheduledFor <= Date.now() + 10_000;
          const delivery = await dispatchActivity(db, activity, immediate);
          const jobId = await scheduleJob(db, activity, caller.uid);
          await db
            .collection("users")
            .doc(activity.uid)
            .collection("flowpathActivities")
            .doc(activity.id)
            .set({
              lecturePreviewOnly: activity.lecturePreviewOnly,
              lectureModuleId: activity.lectureModuleId,
              lectureModuleTitle: activity.lectureModuleTitle,
              lastDelivery: delivery,
              scheduledJobId: jobId || null,
              updatedAt: Date.now(),
            }, { merge: true });
          results.push({ ok: true, activity: { ...activity, lastDelivery: delivery, scheduledJobId: jobId || null } });
        } catch (err) {
          results.push({ ok: false, error: err instanceof Error ? err.message : "Failed." });
        }
      }
      await appendAudit(db, {
        actorUid: caller.uid,
        actorEmail: String(caller.email || ""),
        action: "flowpath.bulk",
        targetUid: text(body.uid, 120) || caller.uid,
        summary: `Bulk created ${results.filter((r) => r.ok).length}/${items.length} activities (batch ${batchId}).`,
        extra: { batchId, total: items.length, succeeded: results.filter((r) => r.ok).length },
      });
      return void res.status(200).json({ ok: true, batchId, results });
    }

    // ------------------------------------------------------------------ update
    if (action === "flowpath.update") {
      const id = text(body.id, 120);
      if (!id) return void res.status(400).json({ ok: false, error: "Missing id." });
      const targetUid = text(body.uid, 120) || caller.uid;
      const isAdminEmail = String(caller.email || "").toLowerCase() === "wmath84@gmail.com";
      if (targetUid !== caller.uid && !isAdminEmail) {
        return void res.status(403).json({ ok: false, error: "Cannot edit another user's activity." });
      }
      const ref = db.collection("users").doc(targetUid).collection("flowpathActivities").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return void res.status(404).json({ ok: false, error: "Activity not found." });
      const existing = asActivity(snap.data(), { uid: targetUid, createdBy: caller.uid });
      if (!existing) return void res.status(500).json({ ok: false, error: "Activity data corrupt." });
      const updated: FlowPathActivity = {
        ...existing,
        title: text(body.title, 400) || existing.title,
        description: body.description !== undefined ? text(body.description, 1000) : existing.description,
        status: (text(body.status, 30) as FlowPathActivityStatus) || existing.status,
        scheduledFor: body.scheduledFor === null ? null : (body.scheduledFor === undefined ? existing.scheduledFor : millis(body.scheduledFor)),
        completedAt: body.completedAt ? millis(body.completedAt) : existing.completedAt,
        updatedAt: Date.now(),
      };
      await ref.set(updated, { merge: true });
      // Re-mirror to My Day (cheap; a few doc writes).
      if (["task", "reminder", "schedule", "note"].includes(updated.kind)) {
        await removeFromMyDay(db, updated.uid, updated.id, updated.kind);
        await mirrorToMyDay(db, updated);
      }
      // Reschedule the alarm: cancel + re-schedule.
      if (existing.scheduledJobId) {
        try {
          await db.collection("settings").doc("adminScheduledJobs").collection("jobs").doc(existing.scheduledJobId).delete();
        } catch { /* ignore */ }
      }
      const jobId = await scheduleJob(db, updated, caller.uid);
      await ref.set({ scheduledJobId: jobId || null, updatedAt: Date.now() }, { merge: true });
      await appendAudit(db, {
        actorUid: caller.uid,
        actorEmail: String(caller.email || ""),
        action: `flowpath.${updated.kind}.update`,
        targetUid: updated.uid,
        summary: `Updated ${updated.kind} "${updated.title}".`,
        extra: { activityId: id, jobId },
      });
      return void res.status(200).json({ ok: true, activity: { ...updated, scheduledJobId: jobId || null } });
    }

    // ------------------------------------------------------------------ delete
    if (action === "flowpath.delete") {
      const id = text(body.id, 120);
      if (!id) return void res.status(400).json({ ok: false, error: "Missing id." });
      const targetUid = text(body.uid, 120) || caller.uid;
      const isAdminEmail = String(caller.email || "").toLowerCase() === "wmath84@gmail.com";
      if (targetUid !== caller.uid && !isAdminEmail) {
        return void res.status(403).json({ ok: false, error: "Cannot delete another user's activity." });
      }
      const ref = db.collection("users").doc(targetUid).collection("flowpathActivities").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return void res.status(404).json({ ok: false, error: "Activity not found." });
      const existing = asActivity(snap.data(), { uid: targetUid, createdBy: caller.uid });
      // Cancel server job.
      if (existing?.scheduledJobId) {
        try {
          await db.collection("settings").doc("adminScheduledJobs").collection("jobs").doc(existing.scheduledJobId).delete();
        } catch { /* ignore */ }
      }
      // Remove from My Day.
      if (existing) await removeFromMyDay(db, targetUid, id, existing.kind);
      await ref.delete();
      await appendAudit(db, {
        actorUid: caller.uid,
        actorEmail: String(caller.email || ""),
        action: existing ? `flowpath.${existing.kind}.delete` : "flowpath.delete",
        targetUid,
        summary: `Deleted activity "${existing?.title || id}".`,
        extra: { activityId: id },
      });
      return void res.status(200).json({ ok: true });
    }

    // ------------------------------------------------------------------ complete
    if (action === "flowpath.complete") {
      const id = text(body.id, 120);
      const targetUid = text(body.uid, 120) || caller.uid;
      const ref = db.collection("users").doc(targetUid).collection("flowpathActivities").doc(id);
      const snap = await ref.get();
      if (!snap.exists) return void res.status(404).json({ ok: false, error: "Activity not found." });
      const existing = asActivity(snap.data(), { uid: targetUid, createdBy: caller.uid });
      if (!existing) return void res.status(500).json({ ok: false, error: "Activity data corrupt." });
      const completedAt = Date.now();
      const updated: FlowPathActivity = { ...existing, status: "completed", completedAt, updatedAt: completedAt };
      await ref.set(updated, { merge: true });
      if (["task", "reminder", "schedule", "note"].includes(updated.kind)) {
        await removeFromMyDay(db, updated.uid, updated.id, updated.kind);
        await mirrorToMyDay(db, updated);
      }
      // Cancel pending server job.
      if (existing.scheduledJobId) {
        try {
          await db.collection("settings").doc("adminScheduledJobs").collection("jobs").doc(existing.scheduledJobId).delete();
        } catch { /* ignore */ }
      }
      await appendAudit(db, {
        actorUid: caller.uid,
        actorEmail: String(caller.email || ""),
        action: `flowpath.${updated.kind}.complete`,
        targetUid: updated.uid,
        summary: `Completed ${updated.kind} "${updated.title}".`,
        extra: { activityId: id },
      });
      return void res.status(200).json({ ok: true, activity: updated });
    }

    // ------------------------------------------------------------------ broadcast
    if (action === "flowpath.broadcast") {
      // Send an existing activity (or a one-off payload) to ALL
      // users. Admin only. Useful for "send this reminder to
      // every active user right now" — used by the FlowPath
      // admin panel for marketing-style pushes.
      const isAdminEmail = String(caller.email || "").toLowerCase() === "wmath84@gmail.com";
      if (!isAdminEmail) return void res.status(403).json({ ok: false, error: "Admin only." });
      const title = text(body.title, 200);
      const bodyText = text(body.body, 600);
      if (!title) return void res.status(400).json({ ok: false, error: "Missing title." });
      const brand = await getNotificationBrandChrome();
      const pushPayload: PushPayload = { title, body: bodyText, tag: "flowpath-broadcast", url: text(body.url, 500) || "/" };
      const fcmPayload: FcmPayload = { ...pushPayload, icon: brand.icon, badge: brand.badge };
      const [webResult, fcmResult] = await Promise.all([
        pushConfigured() ? pushToAllDevices(db, pushPayload) : Promise.resolve({ sent: 0, devices: 0 }),
        fcmConfigured() ? fcmPushToAllDevices(db, fcmPayload) : Promise.resolve({ sent: 0, devices: 0 }),
      ]);
      await appendAudit(db, {
        actorUid: caller.uid,
        actorEmail: String(caller.email || ""),
        action: "flowpath.broadcast",
        targetUid: "ALL",
        summary: `Broadcast: "${title}" — web ${webResult.sent}/${webResult.devices}, fcm ${fcmResult.sent}/${fcmResult.devices}`,
        delivery: { fcm: fcmResult.sent, web: webResult.sent, localAlarm: false, immediate: true },
      });
      return void res.status(200).json({ ok: true, web: webResult, fcm: fcmResult });
    }

    return void res.status(400).json({ ok: false, error: "Unknown FlowPath action." });
  } catch (error) {
    return errorResponse(res, error, "Could not complete FlowPath action.");
  }
}
