// Pure Revision Test Bank benefit helpers shared by the browser catalog,
// subscription engine and the server-authoritative Revision data API.

export const DEFAULT_REVISION_TEST_BANK_LIMITS = Object.freeze({
  basic: Object.freeze({ monthly: 20, yearly: 20 }),
  premium: Object.freeze({ monthly: 50, yearly: 50 }),
  pro: Object.freeze({ monthly: 100, yearly: 100 }),
});

const clampLimit = (value, fallback = 20) => {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  // -1 means unlimited. Zero is intentionally allowed so an admin can make a
  // plan browse-only without deleting the Revision feature itself.
  if (number === -1) return -1;
  return Math.max(0, Math.min(1000, number));
};

export const defaultRevisionBankLimitForPlan = (planId) => {
  const id = String(planId || "").trim().toLowerCase();
  if (id === "pro" || id.includes("pro")) return 100;
  if (id === "premium" || id.includes("premium")) return 50;
  return 20;
};

export const normalizeRevisionTestBankLimits = (raw, planId = "") => {
  const fallback = defaultRevisionBankLimitForPlan(planId);
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    monthly: clampLimit(source.monthly, fallback),
    yearly: clampLimit(source.yearly, fallback),
  };
};

export const revisionBankLimitForCycle = (plan, cycle) => {
  const limits = normalizeRevisionTestBankLimits(plan?.revisionTestBankLimits, plan?.id);
  return cycle === "yearly" ? limits.yearly : limits.monthly;
};

export const formatRevisionBankLimit = (limit) =>
  Number(limit) < 0 ? "Unlimited saved tests" : `Save up to ${Math.max(0, Number(limit) || 0)} revision tests`;
