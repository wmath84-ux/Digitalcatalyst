// Shared AI allowance normalisation used by the subscription catalog,
// checkout snapshot writer and server-authoritative Revision generation API.
// Monetary values are stored as integer micro-US-dollars so token deductions
// are deterministic and never depend on floating-point currency arithmetic.
//
// `dailyTokenBudget` is the third allowance kind and the one enabled by default:
// a per-learner cap on REAL model tokens per local calendar day, counted from
// the provider's own usage report (never from a client claim). It replaces the
// "N successful tests per day" counting model, which could not see that one
// 40-question test and one 2-question test cost wildly different amounts.

export const AI_COST_UNLIMITED = -1;
/** `dailyTokenBudget: -1` means "no token cap" (unlimited). */
export const AI_TOKENS_UNLIMITED = -1;
export const DEFAULT_AI_DAILY_GENERATIONS = 20;

/** A day is capped at 1B tokens: above that the plan is effectively unlimited
 *  and the admin almost certainly typed the wrong number of zeros. */
export const AI_DAILY_TOKEN_MAX = 1_000_000_000;

/**
 * Per-plan starting budgets for the new daily token limit. `basic` is the
 * operator's own number (2,000,000 tokens/day). Unknown plan ids fall back to
 * `basic`, so a freshly created plan is never accidentally unlimited.
 */
export const PLAN_AI_DAILY_TOKEN_DEFAULTS = Object.freeze({
  free: 200_000,
  basic: 2_000_000,
  premium: 5_000_000,
  pro: 10_000_000,
});

export const DEFAULT_AI_DAILY_TOKENS = PLAN_AI_DAILY_TOKEN_DEFAULTS.basic;

const finiteInteger = (value, fallback, min, max) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
};

/** The token default for a plan id, tolerant of `plan/basic-premium` suffixes. */
export const defaultAiDailyTokensForPlan = (planId) => {
  const key = String(planId || "").trim().toLowerCase();
  if (key in PLAN_AI_DAILY_TOKEN_DEFAULTS) return PLAN_AI_DAILY_TOKEN_DEFAULTS[key];
  for (const [name, value] of Object.entries(PLAN_AI_DAILY_TOKEN_DEFAULTS)) {
    if (key && key.includes(name)) return value;
  }
  return DEFAULT_AI_DAILY_TOKENS;
};

/**
 * A missing/blank value means "use this plan's default". An explicit `-1` (or
 * `0` for backward compatibility with the count-based field) means unlimited,
 * which is how an admin switches a single plan off without touching the global
 * policy.
 */
const normalizeDailyTokenBudget = (raw, planId) => {
  if (raw === null || raw === undefined || raw === "") return defaultAiDailyTokensForPlan(planId);
  const number = Number(raw);
  if (!Number.isFinite(number)) return defaultAiDailyTokensForPlan(planId);
  if (number < 0) return AI_TOKENS_UNLIMITED;
  if (number === 0) return AI_TOKENS_UNLIMITED;
  return Math.min(AI_DAILY_TOKEN_MAX, Math.round(number));
};

/**
 * Shared clamp for a standalone token-budget field (the catalog fallback, the
 * checkout snapshot, the admin input). Blank/NaN takes `fallback`; `<= 0` means
 * unlimited. Used everywhere a budget is read so "unlimited" can never be
 * re-interpreted as "zero left" by a different layer.
 */
export const normalizeAiTokenBudgetValue = (raw, fallback = DEFAULT_AI_DAILY_TOKENS) => {
  if (raw === null || raw === undefined || raw === "") return Math.min(AI_DAILY_TOKEN_MAX, Math.max(-1, Math.round(Number(fallback) || DEFAULT_AI_DAILY_TOKENS)));
  const number = Number(raw);
  if (!Number.isFinite(number)) return Math.min(AI_DAILY_TOKEN_MAX, Math.max(-1, Math.round(Number(fallback) || DEFAULT_AI_DAILY_TOKENS)));
  if (number <= 0) return AI_TOKENS_UNLIMITED;
  return Math.min(AI_DAILY_TOKEN_MAX, Math.round(number));
};

const normalizeCycle = (raw, planId = "") => {
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
    // Real model tokens available per local calendar day. -1 = unlimited.
    dailyTokenBudget: normalizeDailyTokenBudget(source.dailyTokenBudget, planId),
  };
};

export const normalizePlanAiAllowances = (raw, planId = "") => {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    monthly: normalizeCycle(source.monthly, planId),
    yearly: normalizeCycle(source.yearly, planId),
  };
};

export const aiAllowanceForCycle = (plan, cycle, planId = "") => {
  const normalized = normalizePlanAiAllowances(plan?.aiAllowances, planId || plan?.id || plan?.planId || "");
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

/** "2,000,000" / "2.0M" — used by the admin plan editor and the profile card. */
export const formatAiDailyTokens = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return "Unlimited";
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(number % 1_000_000 === 0 ? 0 : 1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(number % 1_000 === 0 ? 0 : 1)}K`;
  return String(number);
};

/**
 * The admin's allowance-kind switch, shared by the server policy and the admin
 * UI so the two can never disagree about what an unrecognised value means.
 * Anything unknown — a catalog written before this field existed, a hand-edited
 * doc, an empty value — resolves to `token-budget`, so the daily real-token
 * budget is the default active allowance everywhere. `generation-only` and
 * `hybrid` remain selectable so the old counting behaviour can be restored with
 * a single save.
 */
export const normalizeAiAllowancePolicy = (raw) => {
  const value = String(raw ?? "").trim();
  if (value === "hybrid") return "hybrid";
  if (value === "generation-only") return "generation-only";
  return "token-budget";
};

/** Percent of the daily token budget consumed (0-100, capped). */
export const aiTokenUsagePercent = (used, budget) => {
  const usedNumber = Math.max(0, Number(used) || 0);
  const budgetNumber = Number(budget);
  if (!Number.isFinite(budgetNumber) || budgetNumber <= 0) return 0;
  return Math.min(100, Math.round((usedNumber / budgetNumber) * 100));
};
