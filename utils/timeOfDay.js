// utils/timeOfDay.js
//
// One time-of-day representation for My Day.
//
// Schedule events and reminders always stored 24h "HH:MM" and rendered
// a native picker. Tasks were the odd one out: a free-text box with an
// "e.g., 04:00 PM" placeholder, so `<input type="time">` never opened a
// clock and the stored value could be anything the user typed.
//
// Tasks now use the same native picker, which means existing task data
// ("4 pm", "04:00 PM", "16:00", "") has to be coerced into "HH:MM"
// before it reaches the input — an invalid value makes the control
// render blank and silently drop the user's saved time.

/** Canonical 24-hour "HH:MM", or "" when the value is unusable. */
export function to24h(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  // "4:05 PM", "04:05pm", "4 PM"
  const meridiem = raw.match(/^(\d{1,2})(?::(\d{1,2}))?\s*([ap])\.?m\.?$/i);
  if (meridiem) {
    let hour = Number(meridiem[1]);
    const minute = Number(meridiem[2] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) return "";
    if (meridiem[3].toLowerCase() === "p" && hour !== 12) hour += 12;
    if (meridiem[3].toLowerCase() === "a" && hour === 12) hour = 0;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  // "16:05", "9:5", "16:05:30"
  const h24 = raw.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (h24) {
    const hour = Number(h24[1]);
    const minute = Number(h24[2]);
    if (hour > 23 || minute > 59) return "";
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  // Bare hour: "16", "9"
  const bare = raw.match(/^(\d{1,2})$/);
  if (bare) {
    const hour = Number(bare[1]);
    if (hour > 23) return "";
    return `${String(hour).padStart(2, "0")}:00`;
  }

  return "";
}

/** Human-facing "4:05 PM". Falls back to the raw string when unparseable. */
export function formatTime12(value) {
  const normalised = to24h(value);
  if (!normalised) return String(value ?? "").trim();
  const [h, m] = normalised.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Minutes since midnight; -1 when the value is unusable (sorts first). */
export function toMinutes(value) {
  const normalised = to24h(value);
  if (!normalised) return -1;
  const [h, m] = normalised.split(":").map(Number);
  return h * 60 + m;
}

/** Current wall-clock time as "HH:MM", handy as a picker default. */
export function nowHHMM(now = new Date()) {
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}
