const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many consecutive mornings after expiry we keep sending notifications.
 * Once a subscription expires we send one notification per day, at the start
 * of the day (the daily scheduler runs in the morning), and stop after this
 * many days. Each day is its own `expired-<n>` stage so every morning gets a
 * distinct, idempotent notification. The renew button, by contrast, stays
 * active for as long as the subscription remains expired.
 */
export const POST_EXPIRY_REMINDER_DAYS = 10;

/**
 * Pre-expiry lifecycle stages. Windows are expressed in days until expiry:
 * `d7` spans the sixth to eighth day out and `due` covers the final day.
 * Post-expiry is handled separately in `getRenewalReminder` — the renew
 * button and the daily notifications only start once the subscription has
 * actually ended.
 */
export const RENEWAL_REMINDER_STAGES = [
  { id: "d7", minDays: 6, maxDays: 8, title: "Subscription expires in 7 days" },
  { id: "d3", minDays: 2, maxDays: 4, title: "Subscription expires in 3 days" },
  { id: "d1", minDays: 1, maxDays: 2, title: "Subscription expires tomorrow" },
  { id: "due", minDays: 0, maxDays: 1, title: "Subscription renewal is due today" },
];

export const toMillis = (value) => {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value._seconds === "number") return value._seconds * 1000;
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

/**
 * 1-based number of whole days since expiry: 1 = the first 24 hours after
 * expiry, 2 = the following 24 hours, and so on. The daily scheduler runs in
 * the morning, so this maps cleanly onto "day N after expiry" for morning
 * delivery.
 */
export const getExpiredDayNumber = (expiresAt, now = Date.now()) =>
  Math.max(1, Math.floor((now - toMillis(expiresAt)) / DAY_MS) + 1);

/**
 * The lifecycle stage for a subscription — drives the in-app banner, the
 * status card and the profile messaging.
 *
 * Pre-expiry this is a one-shot heads-up (7d / 3d / 1d / due). Once the
 * subscription has ended it is a single, persistent "expired" stage so the
 * renew button stays active for as long as renewal is still required — even
 * after the 10-day notification window has closed. The `day` field records
 * how many whole days have passed since expiry.
 */
export const getRenewalReminder = (subscription, now = Date.now()) => {
  if (!subscription || subscription.renewalReminderOptOut === true) return null;
  if (!["active", "expired"].includes(String(subscription.status || "active"))) return null;
  const expiresAt = toMillis(subscription.expiresAt);
  if (!expiresAt) return null;

  const planName = String(subscription.planName || subscription.planId || "subscription");
  const expiryDate = new Date(expiresAt).toLocaleDateString("en-IN");
  const days = (expiresAt - now) / DAY_MS;

  // Pre-expiry: a calm heads-up at each lifecycle boundary. These are
  // informational only — the renew button stays inactive until expiry.
  if (days >= 0) {
    const stage = RENEWAL_REMINDER_STAGES.find((item) => days >= item.minDays && days < item.maxDays);
    if (!stage) return null;
    return {
      id: `subscription-renewal:${expiresAt}:${stage.id}`,
      stage: stage.id,
      title: stage.title,
      body: `${planName} access ends on ${expiryDate}. Renewal is manual and secure.`,
      expiresAt,
      createdAt: now,
      expired: false,
      planName,
      target: { type: "subscription" },
    };
  }

  // Post-expiry: a persistent "expired" stage (renew button active) with the
  // whole-day count attached. Notifications are derived separately — see
  // `getRenewalNotification` — so the button outlives the 10-day window.
  const dayNumber = getExpiredDayNumber(expiresAt, now);
  return {
    id: `subscription-renewal:${expiresAt}:expired`,
    stage: "expired",
    title: "Your subscription has expired",
    body: `${planName} access ended. Renew to restore your selected features and products.`,
    expiresAt,
    createdAt: now,
    expired: true,
    day: dayNumber,
    planName,
    target: { type: "subscription" },
  };
};

/**
 * The notification to deliver for a subscription, if any.
 *
 * Pre-expiry this is the same one-shot heads-up as `getRenewalReminder`.
 * Post-expiry it is one `expired-<n>` notification per morning for
 * POST_EXPIRY_REMINDER_DAYS days, then null — so notifications stop after ten
 * consecutive mornings while the renew button keeps working.
 */
export const getRenewalNotification = (subscription, now = Date.now()) => {
  const reminder = getRenewalReminder(subscription, now);
  if (!reminder) return null;
  if (!reminder.expired) return reminder;

  const dayNumber = Number(reminder.day) || 1;
  if (dayNumber > POST_EXPIRY_REMINDER_DAYS) return null;
  const planName = String(reminder.planName || "subscription");
  return {
    ...reminder,
    id: `subscription-renewal:${reminder.expiresAt}:expired-${dayNumber}`,
    stage: `expired-${dayNumber}`,
    title: dayNumber === 1 ? "Your subscription has expired" : `Renew your subscription (day ${dayNumber})`,
    body:
      dayNumber === 1
        ? `${planName} access ended. Renew now to restore your selected features and products.`
        : `${planName} access ended ${dayNumber} day${dayNumber === 1 ? "" : "s"} ago. Renew to restore your selected features and products.`,
  };
};

export const getRenewalBaseTime = (existingExpiresAt, now = Date.now()) => Math.max(now, toMillis(existingExpiresAt));
