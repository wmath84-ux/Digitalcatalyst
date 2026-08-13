// Pure helpers for the server-side push scheduler (api/cron/subscription-renewals).
// Kept dependency-free so they can be unit-tested with plain node:test and reused
// by the Vercel cron function without dragging firebase-admin into tests.

export const MYDAY_LOOKBACK_MS = 15 * 60 * 1000;

const pad2 = (n) => String(n).padStart(2, "0");

// Accepts "HH:MM" 24h (native time inputs) as well as "09:00 AM" style strings.
// Returns { hours, minutes } in 24h or null when unparseable.
export const parseClockTime = (value) => {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])?$/);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3] ? match[3].toLowerCase() : null;
  if (meridiem) {
    if (hours === 12) hours = 0;
    if (meridiem === "pm") hours += 12;
  }
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null;
  return { hours, minutes };
};

// The user's local calendar date for a Unix-ms instant, given the value of
// `new Date().getTimezoneOffset()` captured on the device (UTC − local, e.g.
// IST is -330). Stored on the myDay doc by the client on every save.
export const localDateKey = (nowMs, tzOffsetMinutes) =>
  new Date(nowMs - tzOffsetMinutes * 60000).toISOString().slice(0, 10);

export const dueEpochMs = (dateKey, clock, tzOffsetMinutes) =>
  Date.parse(`${dateKey}T${pad2(clock.hours)}:${pad2(clock.minutes)}:00.000Z`) + tzOffsetMinutes * 60000;

const sanitizeKeySegment = (value) => String(value || "").replace(/[.\\/[\]*]/g, "_").slice(0, 80);

// Collect every My Day item whose user-set time is due: tasks with a time,
// schedule events (at their start) and reminders — once per item per local day.
// `notificationLog` is the server's per-day dedupe map on the myDay document.
export const collectDueMyDayItems = (data, nowMs, tzOffsetMinutes, lookbackMs = MYDAY_LOOKBACK_MS) => {
  const due = [];
  if (!data || !Number.isFinite(tzOffsetMinutes)) return due;
  const dateKey = localDateKey(nowMs, tzOffsetMinutes);
  const log = data.notificationLog && typeof data.notificationLog === "object" ? data.notificationLog : {};
  const already = (key) => Object.prototype.hasOwnProperty.call(log, key);

  const pushItem = (kind, id, clock, title, body) => {
    if (!clock) return;
    const dueAt = dueEpochMs(dateKey, clock, tzOffsetMinutes);
    if (dueAt > nowMs || nowMs - dueAt > lookbackMs) return;
    const key = `${kind}:${sanitizeKeySegment(id)}:${dateKey}`;
    if (already(key)) return;
    due.push({ key, kind, title, body, dueAt });
  };

  (Array.isArray(data.reminders) ? data.reminders : []).forEach((reminder) => {
    if (!reminder || reminder.done) return;
    pushItem("reminder", reminder.id, parseClockTime(reminder.time),
      "⏰ Reminder", String(reminder.text || "Time for your reminder."));
  });

  (Array.isArray(data.tasks) ? data.tasks : []).forEach((task) => {
    if (!task || task.status === "completed") return;
    pushItem("task", task.id, parseClockTime(task.time),
      "📝 Task time", `${String(task.title || "Task")}${task.subject ? ` · ${task.subject}` : ""}`);
  });

  (Array.isArray(data.schedule) ? data.schedule : []).forEach((event) => {
    if (!event) return;
    const start = parseClockTime(event.startTime);
    if (!start) return;
    // Don't ping for an event that already ended today.
    const end = parseClockTime(event.endTime);
    if (end) {
      const endAt = dueEpochMs(dateKey, end, tzOffsetMinutes);
      if (endAt > dueEpochMs(dateKey, start, tzOffsetMinutes) && nowMs > endAt) return;
    }
    pushItem("schedule", event.id, start,
      `📅 ${String(event.title || "Scheduled event")}`,
      `Starts at ${event.startTime}${event.detail ? ` — ${event.detail}` : ""}`);
  });

  return due.sort((a, b) => a.dueAt - b.dueAt);
};

// ---------------------------------------------------------------- products
// Mirror of the client flattenCourseContent so server-side diffs match what the
// in-app bell computes: moduleIds are nested module ids, lessonIds are
// `${moduleId}:${fileId|name|index}` pairs.
export const flattenCourseInventory = (modules) => {
  const moduleIds = [];
  const lessonIds = [];
  const visit = (items, parent = "root") => {
    (Array.isArray(items) ? items : []).forEach((module, moduleIndex) => {
      const moduleId = String(module?.id ?? `${parent}-${moduleIndex}`);
      moduleIds.push(moduleId);
      (Array.isArray(module?.files) ? module.files : []).forEach((file, fileIndex) => {
        lessonIds.push(`${moduleId}:${String(file?.id ?? file?.name ?? fileIndex)}`);
      });
      visit(module?.modules, moduleId);
    });
  };
  visit(modules);
  return {
    moduleIds: Array.from(new Set(moduleIds)).sort(),
    lessonIds: Array.from(new Set(lessonIds)).sort(),
  };
};

// Product inventory entry: stable, small, and safe to persist in Firestore.
export const buildProductInventoryEntry = (product) => {
  const course = flattenCourseInventory(product?.courseContent);
  const rawPrice = product?.salePrice === undefined || product?.salePrice === null || product?.salePrice === "" ? product?.price : product?.salePrice;
  const amount = Number(String(rawPrice ?? "0").replace(/[^0-9.-]/g, ""));
  return {
    title: String(product?.title || "New learning product"),
    free: product?.isFree === true || (Number.isFinite(amount) ? amount : 1) <= 0,
    moduleIds: course.moduleIds,
    lessonIds: course.lessonIds,
  };
};

// Diff a stored baseline against the fresh inventory.
// Returns { isBaseline, newProducts, updatedProducts } — on the very first run
// (no baseline) everything is treated as already-announced so nobody gets a flood.
export const diffProductInventory = (previous, current) => {
  if (!previous || typeof previous !== "object" || !previous.products) {
    return { isBaseline: true, newProducts: [], updatedProducts: [] };
  }
  const prior = previous.products || {};
  const newProducts = [];
  const updatedProducts = [];
  Object.entries(current).forEach(([id, entry]) => {
    const before = prior[id];
    if (!before) {
      newProducts.push({ id, ...entry });
      return;
    }
    const beforeModules = new Set(before.moduleIds || []);
    const beforeLessons = new Set(before.lessonIds || []);
    const newModules = (entry.moduleIds || []).filter((m) => !beforeModules.has(m)).length;
    const newLessons = (entry.lessonIds || []).filter((l) => !beforeLessons.has(l)).length;
    if (newModules > 0 || newLessons > 0) {
      updatedProducts.push({ id, title: entry.title, newModules, newLessons });
    }
  });
  return { isBaseline: false, newProducts, updatedProducts };
};
