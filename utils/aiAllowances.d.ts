export type AiCycleAllowance = {
  /** Maximum successful school-AI tests per local calendar day (0 = unlimited). */
  dailyGenerationLimit: number;
  /** School-AI model cost available for the purchased billing term, in micro-USD (-1 = unlimited). */
  costBudgetMicros: number;
};

export type PlanAiAllowances = {
  monthly: AiCycleAllowance;
  yearly: AiCycleAllowance;
};

export const AI_COST_UNLIMITED: -1;
export const DEFAULT_AI_DAILY_GENERATIONS: 20;
export const normalizePlanAiAllowances: (raw: unknown) => PlanAiAllowances;
export const aiAllowanceForCycle: (
  plan: { aiAllowances?: unknown } | null | undefined,
  cycle: "monthly" | "yearly" | string,
) => AiCycleAllowance;
export const usdToMicros: (value: unknown, fallback?: number) => number;
export const microsToUsd: (micros: unknown) => number | null;
