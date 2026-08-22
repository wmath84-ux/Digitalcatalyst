// Shared AI allowance normalisation used by the subscription catalog,
// checkout snapshot writer and server-authoritative Revision generation API.
// Monetary values are stored as integer micro-US-dollars so token deductions
// are deterministic and never depend on floating-point currency arithmetic.

export const AI_COST_UNLIMITED = -1;
export const DEFAULT_AI_DAILY_GENERATIONS = 20;

const finiteInteger = (value, fallback, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
};

const normalizeCycle = (raw) => {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    // 0 means unlimited, matching the legacy Revision daily-limit contract.
    dailyGenerationLimit: finiteInteger(
      source.dailyGenerationLimit,
      DEFAULT_AI_DAILY_GENERATIONS,
      0,
      10000,
    ),
    // -1 means no monetary cap. A plan can be configured before global cost
    // enforcement is enabled without unexpectedly blocking its learners.
    costBudgetMicros: finiteInteger(source.costBudgetMicros, AI_COST_UNLIMITED, -1, 1_000_000_000_000),
  };
};

export const normalizePlanAiAllowances = (raw) => {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    monthly: normalizeCycle(source.monthly),
    yearly: normalizeCycle(source.yearly),
  };
};

export const aiAllowanceForCycle = (plan, cycle) => {
  const normalized = normalizePlanAiAllowances(plan?.aiAllowances);
  return cycle === "yearly" ? normalized.yearly : normalized.monthly;
};

export const usdToMicros = (value, fallback = AI_COST_UNLIMITED) => {
  if (value === null || value === undefined || value === "") return fallback;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return fallback;
  return Math.min(1_000_000_000_000, Math.round(amount * 1_000_000));
};

export const microsToUsd = (micros) => {
  const amount = Number(micros);
  return Number.isFinite(amount) && amount >= 0 ? amount / 1_000_000 : null;
};
