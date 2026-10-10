// Shared client/server policy. A missing flag is not the same as false.
export const PREFERENCE_KEYS = Object.freeze(["push", "email", "promotions", "profileVisible", "shareActivity"]);
export const DEFAULT_PREFERENCES = Object.freeze({
  push: true,
  email: true,
  promotions: false,
  profileVisible: true,
  // Previously this unused flag defaulted to true. Publishing private learning
  // aggregates now requires an explicit, versioned opt-in, not that old default.
  shareActivity: false,
});

export function normalizeUserPreferences(input, { requireActivityConsent = true } = {}) {
  const plain = input && typeof input === "object" && !Array.isArray(input) && (Object.getPrototypeOf(input) === Object.prototype || Object.getPrototypeOf(input) === null);
  const malformed = input !== null && input !== undefined && !plain;
  const raw = plain ? input : {};
  const preferences = Object.fromEntries(PREFERENCE_KEYS.map((key) => [key,
    typeof raw[key] === "boolean" ? raw[key]
      // Legacy missing fields keep their documented defaults. Explicitly
      // malformed values must never manufacture consent or public visibility.
      : malformed || Object.prototype.hasOwnProperty.call(raw, key) ? false : DEFAULT_PREFERENCES[key],
  ]));
  if (requireActivityConsent && raw.activityConsentVersion !== 1) preferences.shareActivity = false;
  return preferences;
}

export function validatePreferencePatch(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Choose a setting to change.");
  const keys = Object.keys(input);
  if (keys.length !== 1 || !PREFERENCE_KEYS.includes(keys[0]) || typeof input[keys[0]] !== "boolean") {
    throw new Error("Change one recognised setting using a true or false value.");
  }
  return { key: keys[0], value: input[keys[0]] };
}

/** New products / offers are optional marketing; purchased-course updates and
 * personal reminders are service notifications. Callers may explicitly mark
 * a campaign as marketing, but cannot disguise a product launch as a receipt. */
export function isPromotionalNotification(payload = {}) {
  return payload.marketing === true || payload.type === "product-created" || payload.type === "promotion"
    || payload.category === "promotion" || payload.category === "marketing"
    || /^(new-product|product-created|promotion|campaign)(?:[-:]|$)/i.test(String(payload.tag || ""))
    || (payload.category === "store" && payload.type !== "product-updated");
}

export function notificationPolicy(input, payload = {}) {
  const preferences = normalizeUserPreferences(input);
  const allowed = !isPromotionalNotification(payload) || preferences.promotions;
  return {
    inbox: allowed,
    push: allowed && preferences.push,
    email: allowed && preferences.email,
    publicProfile: preferences.profileVisible,
    publicActivity: preferences.profileVisible && preferences.shareActivity,
  };
}

/** No email, phone, referral code, purchases, course names, file ids or notes
 * ever enter this public projection. A private profile is omitted completely. */
export function publicProfileIdentity(uid, data = {}) {
  if (!normalizeUserPreferences(data.preferences).profileVisible) return null;
  const name = String(data.name || data.displayName || "Learner").trim().slice(0, 120) || "Learner";
  const photo = String(data.photoURL || data.photo || "");
  const photoURL = /^https:\/\//i.test(photo) ? photo : undefined;
  return { uid: String(uid), name, ...(photoURL ? { photoURL } : {}) };
}

/** Aggregate only genuine progress records. No module/resource titles leak. */
export function publicLearningSummary(records) {
  const rows = Array.isArray(records) ? records : [];
  let coursesStarted = 0;
  let completedItems = 0;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const completed = new Set(Array.isArray(row.completedFileIds)
      ? row.completedFileIds.filter((id) => typeof id === "string" && id.trim()) : []);
    const hasActivity = completed.size > 0 || Boolean(row.lastOpenedFileId) || Boolean(row.lastOpenedAt);
    if (!hasActivity) continue;
    coursesStarted += 1;
    completedItems += completed.size;
  }
  return { coursesStarted, completedItems };
}
