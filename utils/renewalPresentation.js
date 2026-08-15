// utils/renewalPresentation.js
//
// Presentation layer for subscription expiry / renewal messaging.
//
// `utils/subscriptionRenewal.js` decides WHICH reminder stage a
// subscription is in (7d / 3d / 1d / due, then one `expired-<n>` stage per
// morning for the 10-day post-expiry window). This module decides HOW that
// stage is presented: urgency, tone tokens, headline, supporting copy, and
// the call-to-action. Keeping it pure and separate means the in-app banner,
// the notification row, the profile card and the sandbox preview all render
// the exact same words for a given state — there is a single source of truth
// for the copy.
//
// The renew button only becomes active once the subscription has expired
// (`canRenew`). Before that, the reminder is informational: it tells the
// member when access ends without inviting a premature renewal.
//
// No React, no Firestore: the Node test runner imports this directly.

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Visual + editorial treatment per reminder stage.
 *
 *   urgency    — 0 calm … 3 critical. Drives sort order and whether the
 *                banner is dismissible.
 *   tone       — semantic colour key the React components map to Tailwind.
 *   canRenew   — whether the renew call-to-action is active for this stage.
 *                Only true once the subscription has expired.
 */
export const RENEWAL_STAGE_PRESENTATION = {
  d7: {
    urgency: 1,
    tone: "info",
    icon: "calendar-clock",
    label: "Renewal coming up",
    headline: "Your subscription renews in a week",
    cta: "Review renewal",
    dismissible: true,
    canRenew: false,
  },
  d3: {
    urgency: 2,
    tone: "warning",
    icon: "clock",
    label: "Renewal due soon",
    headline: "Only a few days of access left",
    cta: "Renew now",
    dismissible: true,
    canRenew: false,
  },
  d1: {
    urgency: 3,
    tone: "warning",
    icon: "alert-triangle",
    label: "Expires tomorrow",
    headline: "Your subscription expires tomorrow",
    cta: "Renew now",
    dismissible: true,
    canRenew: false,
  },
  due: {
    urgency: 3,
    tone: "critical",
    icon: "alert-triangle",
    label: "Renewal due today",
    headline: "Today is the last day of your access",
    cta: "Renew today",
    dismissible: false,
    canRenew: false,
  },
  expired: {
    urgency: 3,
    tone: "critical",
    icon: "lock",
    label: "Subscription expired",
    headline: "Your subscription has expired",
    cta: "Reactivate access",
    dismissible: false,
    canRenew: true,
  },
};

export const TONE_ORDER = ["info", "warning", "critical"];

/** Coerce a Firestore/JS date-ish value to millis. Mirrors subscriptionRenewal. */
export const toMillis = (value) => {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value._seconds === "number") return value._seconds * 1000;
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

/**
 * Whole days remaining until expiry. Negative once expired. Rounded
 * away from zero so "23 hours left" reads as 1 day, not 0.
 */
export const daysUntil = (expiresAt, now = Date.now()) => {
  const diff = toMillis(expiresAt) - now;
  return diff >= 0 ? Math.ceil(diff / DAY_MS) : -Math.ceil(Math.abs(diff) / DAY_MS);
};

/** Human phrase for the remaining window. */
export const formatRemaining = (expiresAt, now = Date.now()) => {
  const diff = toMillis(expiresAt) - now;
  if (diff >= 0) {
    const days = daysUntil(expiresAt, now);
    if (days > 1) return `${days} days left`;
    if (days === 1) return "1 day left";
    return "Expires today";
  }
  // Expired: a sub-day expiry reads as "today", not "yesterday", so the
  // first morning-after notice is accurate.
  const hours = Math.abs(diff) / (60 * 60 * 1000);
  if (hours < 24) return "Expired today";
  const days = Math.floor(hours / 24);
  return days === 1 ? "Expired yesterday" : `Expired ${days} days ago`;
};

/** Locale date string used across every renewal surface. */
export const formatExpiryDate = (expiresAt) => {
  const ms = toMillis(expiresAt);
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

/**
 * Build the full view-model for a renewal reminder.
 *
 * `reminder` is the object returned by `getRenewalReminder(...)`.
 * Returns null when there is nothing to show, so callers can render
 * conditionally without extra guards.
 */
export const buildRenewalView = (reminder, options = {}) => {
  if (!reminder || typeof reminder !== "object") return null;
  const stage = String(reminder.stage || "");
  // Every post-expiry day shares the same "expired" treatment; the exact
  // `expired-<n>` stage is preserved on the view for dismissal keys and
  // data attributes.
  const stageKey = stage.startsWith("expired") ? "expired" : stage;
  const presentation = RENEWAL_STAGE_PRESENTATION[stageKey];
  if (!presentation) return null;

  const now = Number(options.now) || Date.now();
  const planName = String(options.planName || reminder.planName || "Subscription");
  const expiresAt = toMillis(reminder.expiresAt);
  const expired = reminder.expired === true || stageKey === "expired";
  const days = daysUntil(expiresAt, now);

  const body = expired
    ? `${planName} access ended on ${formatExpiryDate(expiresAt)}. Renew to restore your selected features and products.`
    : `${planName} access ends on ${formatExpiryDate(expiresAt)}. Renewal is manual — you are never charged without confirming.`;

  return {
    stage,
    urgency: presentation.urgency,
    tone: presentation.tone,
    icon: presentation.icon,
    label: presentation.label,
    headline: presentation.headline,
    body,
    cta: presentation.cta,
    canRenew: presentation.canRenew,
    dismissible: presentation.dismissible,
    expired,
    day: typeof reminder.day === "number" ? reminder.day : undefined,
    expiresAt,
    daysRemaining: days,
    remainingLabel: formatRemaining(expiresAt, now),
    expiryLabel: formatExpiryDate(expiresAt),
    planName,
    target: { type: "subscription" },
  };
};

/**
 * Should the sticky in-app banner appear for this view? Dismissals are
 * remembered per stage, so acknowledging the 7-day notice still lets
 * the 3-day notice through.
 */
export const shouldShowRenewalBanner = (view, dismissedStages = []) => {
  if (!view) return false;
  if (!view.dismissible) return true;
  const dismissed = Array.isArray(dismissedStages) ? dismissedStages.map(String) : [];
  return dismissed.indexOf(String(view.stage)) === -1;
};

export default buildRenewalView;
