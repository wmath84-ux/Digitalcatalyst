import { adminDb, errorResponse, requireFirebaseUser, type VercelRequest, type VercelResponse } from "./firebaseAdmin.js";
import { getSubscriptionGateSettings } from "./subscriptionGate.js";

const MAX_ITEMS_PER_SECTION = 300;
const MAX_PAYLOAD_BYTES = 700_000;
const SECTIONS = ["tasks", "schedule", "notes", "reminders"] as const;
type Section = (typeof SECTIONS)[number];
type MyDayData = Record<Section, Array<Record<string, unknown>>>;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const readBody = (req: VercelRequest): Record<string, unknown> => {
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

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const time = (value: unknown) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || "")) ? String(value) : "00:00";

function cleanRows(value: unknown, section: Section): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  for (const raw of value) {
    const row = asRecord(raw);
    const id = text(row.id, 120);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (section === "tasks") {
      const title = text(row.title, 300);
      if (!title) continue;
      rows.push({
        id,
        title,
        subject: text(row.subject, 120),
        time: text(row.time, 80),
        priority: ["low", "medium", "high"].includes(String(row.priority)) ? String(row.priority) : "medium",
        status: ["pending", "in-progress", "completed"].includes(String(row.status)) ? String(row.status) : "pending",
      });
    } else if (section === "schedule") {
      const title = text(row.title, 300);
      if (!title) continue;
      rows.push({
        id,
        title,
        detail: text(row.detail, 500),
        startTime: time(row.startTime),
        endTime: time(row.endTime),
        type: ["class", "study", "break", "personal", "exam"].includes(String(row.type)) ? String(row.type) : "personal",
      });
    } else if (section === "notes") {
      const note = text(row.text, 4000);
      if (!note) continue;
      rows.push({
        id,
        text: note,
        createdAt: Math.max(0, Math.round(Number(row.createdAt) || Date.now())),
        color: ["amber", "sky", "rose", "emerald", "violet"].includes(String(row.color)) ? String(row.color) : "amber",
      });
    } else {
      const reminder = text(row.text, 500);
      if (!reminder) continue;
      rows.push({
        id,
        text: reminder,
        time: time(row.time),
        done: row.done === true,
        createdAt: Math.max(0, Math.round(Number(row.createdAt) || Date.now())),
      });
    }
    if (rows.length >= MAX_ITEMS_PER_SECTION) break;
  }
  return rows;
}

function normalizeStoredData(raw: unknown): MyDayData {
  const source = asRecord(raw);
  return {
    tasks: cleanRows(source.tasks, "tasks"),
    schedule: cleanRows(source.schedule, "schedule"),
    notes: cleanRows(source.notes, "notes"),
    reminders: cleanRows(source.reminders, "reminders"),
  };
}

function mergeRequestedData(stored: MyDayData, raw: unknown): MyDayData {
  const request = asRecord(raw);
  return {
    tasks: Array.isArray(request.tasks) ? cleanRows(request.tasks, "tasks") : stored.tasks,
    schedule: Array.isArray(request.schedule) ? cleanRows(request.schedule, "schedule") : stored.schedule,
    notes: Array.isArray(request.notes) ? cleanRows(request.notes, "notes") : stored.notes,
    reminders: Array.isArray(request.reminders) ? cleanRows(request.reminders, "reminders") : stored.reminders,
  };
}

function addedCount(previous: MyDayData, next: MyDayData): number {
  return SECTIONS.reduce((total, section) => {
    const oldIds = new Set(previous[section].map((row) => String(row.id)));
    return total + next[section].filter((row) => !oldIds.has(String(row.id))).length;
  }, 0);
}

function validTimeZone(value: unknown): string {
  const zone = text(value, 80) || "UTC";
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return "UTC";
  }
}

function dayKeyInZone(now: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(now));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function nextDayReset(now: number, timeZone: string): number {
  const current = dayKeyInZone(now, timeZone);
  let low = now;
  let high = now + 27 * 60 * 60_000;
  // Binary-search the first instant whose calendar date differs. Minute
  // precision is sufficient for a reset countdown and handles DST zones.
  for (let i = 0; i < 32; i += 1) {
    const mid = Math.floor((low + high) / 2);
    if (dayKeyInZone(mid, timeZone) === current) low = mid + 1;
    else high = mid;
  }
  return high;
}

type Access = {
  paid: boolean;
  paidExpiresAt: number;
  unlimited: boolean;
  featureConfigured: boolean;
  freeLimit: number;
  freeUsed: number;
  freeRemaining: number;
  canCreate: boolean;
  dayKey: string;
  resetAt: number;
  timeZone: string;
  // Phase-1: when the feature is in "hide" mode AND the user is not paid,
  // the client should remove the My Day entry from the rail/nav. The
  // paywall still appears on a direct deep-link, so the "no free access"
  // contract is preserved. Subscribers always see the feature regardless
  // of the visibility mode.
  hidden: boolean;
};

function accessSnapshot(
  feature: Record<string, unknown> | null,
  subscription: Record<string, unknown>,
  usage: Record<string, unknown>,
  requestedTimeZone: string,
  now = Date.now(),
  gateSettings: import("./subscriptionGate.js").SubscriptionGateSettings | null = null,
): Access {
  const featureConfigured = Boolean(feature) && feature?.active !== false;
  const active = subscription.status === "active" && millis(subscription.expiresAt) > now;
  const features = Array.isArray(subscription.features) ? subscription.features.map(String) : [];
  const paid = active && features.includes("my-day");
  const unlimited = !featureConfigured || paid;
  const freeLimit = Math.max(0, Math.min(100, Math.round(Number(feature?.freeItemsPerDay ?? 1) || 0)));
  // Persist the first validated timezone. A crafted client cannot repeatedly
  // hop across zones to manufacture multiple calendar-day resets.
  const timeZone = validTimeZone(usage.timeZone || requestedTimeZone);
  const today = dayKeyInZone(now, timeZone);
  const freeUsed = String(usage.dayKey || "") === today ? Math.max(0, Math.round(Number(usage.dayCount) || 0)) : 0;
  // Phase-1: hide mode only hides for non-subscribers. Subscribers
  // (paid === true) always see the feature regardless of mode. The
  // global kill switch + per-feature gate override stack on top of
  // the per-doc visibilityMode so the admin can flip the model on
  // without rewriting any feature doc.
  const perDocMode = (feature as any)?.visibilityMode === "hide" ? "hide" : "gate";
  const globalHideOn = gateSettings ? gateSettings.hideUntilPurchasedEnabled || Boolean(gateSettings.features?.["myday"]?.gated) : false;
  const visibilityMode = perDocMode === "hide" || globalHideOn ? "hide" : "gate";
  const hidden = visibilityMode === "hide" && !paid;
  return {
    paid,
    paidExpiresAt: paid ? millis(subscription.expiresAt) : 0,
    unlimited,
    featureConfigured,
    freeLimit,
    freeUsed,
    freeRemaining: unlimited ? freeLimit : Math.max(0, freeLimit - freeUsed),
    canCreate: unlimited || freeUsed < freeLimit,
    dayKey: today,
    resetAt: nextDayReset(now, timeZone),
    timeZone,
    hidden,
  };
}

async function loadStatus(uid: string, requestedTimeZone: string) {
  const db = adminDb();
  const dataRef = db.collection("users").doc(uid).collection("myDay").doc("current");
  const usageRef = db.collection("users").doc(uid).collection("myDayUsage").doc("current");
  const [featureSnap, subscriptionSnap, dataSnap, usageSnap] = await Promise.all([
    db.collection("subscriptionFeatures").doc("my-day").get(),
    db.collection("users").doc(uid).collection("subscription").doc("current").get(),
    dataRef.get(),
    usageRef.get(),
  ]);
  const feature = featureSnap.exists ? asRecord(featureSnap.data()) : null;
  const usage = asRecord(usageSnap.data());
  const gateSettings = await getSubscriptionGateSettings();
  const access = accessSnapshot(feature, asRecord(subscriptionSnap.data()), usage, requestedTimeZone, Date.now(), gateSettings);
  await usageRef.set({
    uid,
    dayKey: access.dayKey,
    dayCount: access.freeUsed,
    timeZone: access.timeZone,
    freeLimit: access.freeLimit,
    updatedAt: Date.now(),
  }, { merge: true });
  return { access, data: normalizeStoredData(dataSnap.data()) };
}

async function save(uid: string, requested: unknown, requestedTimeZone: string, tzOffsetMinutes: number) {
  const db = adminDb();
  const featureRef = db.collection("subscriptionFeatures").doc("my-day");
  const subscriptionRef = db.collection("users").doc(uid).collection("subscription").doc("current");
  const dataRef = db.collection("users").doc(uid).collection("myDay").doc("current");
  const usageRef = db.collection("users").doc(uid).collection("myDayUsage").doc("current");
  return db.runTransaction(async (tx) => {
    const [featureSnap, subscriptionSnap, dataSnap, usageSnap] = await Promise.all([
      tx.get(featureRef),
      tx.get(subscriptionRef),
      tx.get(dataRef),
      tx.get(usageRef),
    ]);
    const previous = normalizeStoredData(dataSnap.data());
    const next = mergeRequestedData(previous, requested);
    if (Buffer.byteLength(JSON.stringify(next), "utf8") > MAX_PAYLOAD_BYTES) {
      throw Object.assign(new Error("My Day has too much data to save. Remove older items and try again."), { statusCode: 413, code: "MYDAY_TOO_LARGE" });
    }
    const usage = asRecord(usageSnap.data());
    const gateSettings = await getSubscriptionGateSettings();
    const access = accessSnapshot(
      featureSnap.exists ? asRecord(featureSnap.data()) : null,
      asRecord(subscriptionSnap.data()),
      usage,
      requestedTimeZone,
      Date.now(),
      gateSettings,
    );
    const creations = addedCount(previous, next);
    if (!access.unlimited && creations > access.freeRemaining) {
      throw Object.assign(new Error(
        access.freeLimit === 0
          ? "Your plan currently includes browse-only My Day access. Subscribe to create items."
          : `Today's ${access.freeLimit} free My Day creation${access.freeLimit === 1 ? "" : "s"} ${access.freeUsed >= access.freeLimit ? "has" : "would be"} used. Subscribe for unlimited creation or return after the daily reset.`,
      ), { statusCode: 403, code: "MYDAY_DAILY_FREE_USED", access });
    }
    const freeUsed = access.unlimited ? access.freeUsed : access.freeUsed + creations;
    const nextAccess = { ...access, freeUsed, freeRemaining: access.unlimited ? access.freeLimit : Math.max(0, access.freeLimit - freeUsed), canCreate: access.unlimited || freeUsed < access.freeLimit };
    const now = Date.now();
    tx.set(dataRef, { ...next, tz: access.timeZone, tzOffsetMinutes: Math.max(-840, Math.min(840, Math.round(Number(tzOffsetMinutes) || 0))), updatedAt: now }, { merge: false });
    tx.set(usageRef, {
      uid,
      dayKey: access.dayKey,
      dayCount: freeUsed,
      timeZone: access.timeZone,
      freeLimit: access.freeLimit,
      lastCreatedAt: creations > 0 ? now : (usage.lastCreatedAt || null),
      updatedAt: now,
    }, { merge: true });
    return { access: nextAccess, data: next, creations };
  });
}

export async function handleMyDay(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") return void res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const user = await requireFirebaseUser(req);
    const body = readBody(req);
    const action = String(body.action || "");
    const timeZone = validTimeZone(body.timeZone);
    if (action === "myday.status") {
      const result = await loadStatus(user.uid, timeZone);
      res.status(200).json({ ok: true, ...result });
      return;
    }
    if (action === "myday.save") {
      const result = await save(user.uid, body.data, timeZone, Number(body.tzOffsetMinutes));
      res.status(200).json({ ok: true, ...result });
      return;
    }
    res.status(400).json({ ok: false, error: "Unknown My Day action." });
  } catch (error) {
    errorResponse(res, error, "Could not update My Day.");
  }
}
