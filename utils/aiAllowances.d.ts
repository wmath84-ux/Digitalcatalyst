export type AiCycleAllowance = {
  /** Maximum successful school-AI tests per local calendar day (0 = unlimited). */
  dailyGenerationLimit: number;
  /** School-AI model cost available for the purchased billing term, in micro-USD (-1 = unlimited). */
  costBudgetMicros: number;
  /**
   * Real model tokens usable per local calendar day, counted from the
   * provider's usage report server-side. Resets at the learner's local
   * midnight. -1 = unlimited. This is the default active allowance kind.
   */
  dailyTokenBudget: number;
};

export type PlanAiAllowances = {
  monthly: AiCycleAllowance;
  yearly: AiCycleAllowance;
};

export const AI_COST_UNLIMITED: -1;
export const AI_TOKENS_UNLIMITED: -1;
export const DEFAULT_AI_DAILY_GENERATIONS: 20;
export const AI_DAILY_TOKEN_MAX: 1_000_000_000;
export const DEFAULT_AI_DAILY_TOKENS: number;
export const PLAN_AI_DAILY_TOKEN_DEFAULTS: Readonly<
  Record<"free" | "basic" | "premium" | "pro", number>
>;

export type AiAllowancePolicy = "generation-only" | "hybrid" | "token-budget";

export const defaultAiDailyTokensForPlan: (planId: string | null | undefined) => number;
/** Blank/NaN → `fallback`; `<= 0` → unlimited (-1). Shared by every layer. */
export const normalizeAiTokenBudgetValue: (raw: unknown, fallback?: number) => number;
/** Unknown/unset resolves to `token-budget` — the default active kind. */
export const normalizeAiAllowancePolicy: (raw: unknown) => AiAllowancePolicy;
export const normalizePlanAiAllowances: (raw: unknown, planId?: string) => PlanAiAllowances;
export const aiAllowanceForCycle: (
  plan: { aiAllowances?: unknown; id?: string; planId?: string } | null | undefined,
  cycle: "monthly" | "yearly" | string,
  planId?: string,
) => AiCycleAllowance;
export const usdToMicros: (value: unknown, fallback?: number) => number;
export const microsToUsd: (micros: unknown) => number | null;
export const formatAiDailyTokens: (value: unknown) => string;
export const aiTokenUsagePercent: (used: unknown, budget: unknown) => number;
