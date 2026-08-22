export type RevisionTestBankLimits = { monthly: number; yearly: number };
export const DEFAULT_REVISION_TEST_BANK_LIMITS: Readonly<Record<"basic" | "premium" | "pro", Readonly<RevisionTestBankLimits>>>;
export const defaultRevisionBankLimitForPlan: (planId: string) => number;
export const normalizeRevisionTestBankLimits: (raw: unknown, planId?: string) => RevisionTestBankLimits;
export const revisionBankLimitForCycle: (
  plan: { id?: string; revisionTestBankLimits?: Partial<RevisionTestBankLimits> | null } | null | undefined,
  cycle: "monthly" | "yearly",
) => number;
export const formatRevisionBankLimit: (limit: number) => string;
