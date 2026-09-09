export const STUDY_PACK_TITLE_MAX: number;
export const STUDY_PACK_DESC_MAX: number;
export const STUDY_PACK_ID_RE: RegExp;
export const STUDY_PACK_VISIBILITIES: readonly string[];

export interface StudyPacksCycleLimits {
  creationEnabled: boolean;
  maxPublishedPacks: number;
  maxImportsPerMonth: number;
  studyStackEnabled: boolean;
  maxStudyStacks: number;
}

export interface PlanStudyPacksConfig {
  monthly: StudyPacksCycleLimits;
  yearly: StudyPacksCycleLimits;
}

export const defaultStudyPacksForPlan: (planId: string, monthlyPricePaise?: number, yearlyPricePaise?: number) => PlanStudyPacksConfig;
export const normalizePlanStudyPacks: (rawPlan: unknown, planId?: string) => PlanStudyPacksConfig;
export const studyPacksCycle: (config: PlanStudyPacksConfig | null | undefined, cycle: string) => StudyPacksCycleLimits;
export const isValidStudyPackId: (value: unknown) => boolean;
export const sanitizeStudyPackMeta: (raw: unknown) =>
  | { ok: true; value: { title: string; description: string; visibility: string } }
  | { ok: false; errors: Array<{ field: string; code: string; message: string }> };
export const countResourceTypes: (resources: unknown) => Record<string, number>;
export const packAvailabilitySummary: (resources: unknown) => Array<{ id: string; name: string; type: string; readable: boolean; reason: string }>;
export const importMonthKey: (now?: number) => string;
