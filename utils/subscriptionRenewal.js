const DAY_MS = 24 * 60 * 60 * 1000;

export const RENEWAL_REMINDER_STAGES = [
  { id: "d7", minDays: 6, maxDays: 8, title: "Subscription expires in 7 days" },
  { id: "d3", minDays: 2, maxDays: 4, title: "Subscription expires in 3 days" },
  { id: "d1", minDays: 1 / 1440, maxDays: 2, title: "Subscription expires tomorrow" },
  { id: "due", minDays: -1, maxDays: 1 / 1440, title: "Subscription renewal is due today" },
  { id: "expired", minDays: Number.NEGATIVE_INFINITY, maxDays: -1, title: "Your subscription has expired" },
];

export const toMillis = (value) => {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value._seconds === "number") return value._seconds * 1000;
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

export const getRenewalReminder = (subscription, now = Date.now()) => {
  if (!subscription || subscription.renewalReminderOptOut === true) return null;
  if (!["active", "expired"].includes(String(subscription.status || "active"))) return null;
  const expiresAt = toMillis(subscription.expiresAt);
  if (!expiresAt) return null;
  const days = (expiresAt - now) / DAY_MS;
  const stage = RENEWAL_REMINDER_STAGES.find((item) => days >= item.minDays && days < item.maxDays);
  if (!stage) return null;
  const planName = String(subscription.planName || subscription.planId || "subscription");
  const body = stage.id === "expired"
    ? `${planName} access ended. Renew to restore your selected features and products.`
    : `${planName} access ends on ${new Date(expiresAt).toLocaleDateString("en-IN")}. Review and confirm renewal securely.`;
  return {
    id: `subscription-renewal:${expiresAt}:${stage.id}`,
    stage: stage.id,
    title: stage.title,
    body,
    expiresAt,
    createdAt: now,
    target: { type: "subscription" },
  };
};

export const getRenewalBaseTime = (existingExpiresAt, now = Date.now()) => Math.max(now, toMillis(existingExpiresAt));
