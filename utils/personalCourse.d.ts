// Type declarations for `utils/personalCourse.js` — the pure shared layer of
// the Personal Course Modules ("My Modules") feature. The runtime lives in
// the sibling `.js` file so the Node test runner can import it directly, and
// both the web app and the serverless API import it from the same place.

import type { CourseFileType } from "../src/types/course";

/** Canonical ordered list of the 12 personal resource types. */
export const PERSONAL_COURSE_TYPE_ORDER: readonly CourseFileType[];
export const ALL_PERSONAL_COURSE_TYPES: readonly CourseFileType[];
export const PERSONAL_COURSE_TYPE_LABELS: Readonly<Record<CourseFileType, string>>;
export const PERSONAL_COURSE_FEATURE_ID: string;

export const isPersonalCourseType: (value: unknown) => boolean;
export const personalCourseTypeLabel: (value: unknown) => string;

/** One billing duration's limits + allowed-type list (null = all 12). */
export interface PersonalModulesCycleLimits {
  moduleLimit: number;
  resourceLimit: number;
  perModuleResourceLimit: number;
  allowedTypes: CourseFileType[] | null;
}

/** Per-plan Personal Modules configuration (subscriptionPlans/{planId}). */
export interface PlanPersonalModulesConfig {
  enabled: boolean;
  customEmbedEnabled: boolean;
  contentStorageEnabled: boolean;
  monthly: PersonalModulesCycleLimits;
  yearly: PersonalModulesCycleLimits;
}

export interface PersonalModulesUsage {
  moduleCount: number;
  resourceCount: number;
}

export type PersonalModulesEntitlementStatus = "entitled" | "not-entitled" | "disabled";

export interface PersonalModulesEntitlement {
  status: PersonalModulesEntitlementStatus;
  entitled: boolean;
  disabled: boolean;
  planId: string | null;
  planName: string | null;
  cycle: "monthly" | "yearly" | null;
  config: PlanPersonalModulesConfig | null;
  limits: PersonalModulesCycleLimits | null;
  reason: "active" | "no-subscription" | "feature-disabled" | "storage-disabled";
}

export const PERSONAL_MODULE_TITLE_MAX: number;
export const PERSONAL_MODULE_DESC_MAX: number;
export const PERSONAL_RESOURCE_NAME_MAX: number;
export const PERSONAL_RESOURCE_DESC_MAX: number;
export const PERSONAL_URL_MAX: number;
export const PERSONAL_ID_MAX: number;
export const PERSONAL_MODULE_LIMIT_MAX: number;
export const PERSONAL_RESOURCE_LIMIT_MAX: number;
export const PERSONAL_PER_MODULE_LIMIT_MAX: number;
export const PERSONAL_METADATA_CHARS_MAX: number;
export const PERSONAL_METADATA_KEYS_MAX: number;

export const GOOGLE_FAMILY_BY_TYPE: Readonly<Record<string, string>>;
export const GOOGLE_FAMILY_LABELS: Readonly<Record<string, string>>;
export const canonicalGoogleFormUrl: (value: string) => string;
export const PERSONAL_MODULE_DEFAULT_LIMITS: Readonly<{
  moduleLimit: number;
  resourceLimit: number;
  perModuleResourceLimit: number;
}>;

export const isFreePlanDefault: (planId: string, monthlyPricePaise?: number, yearlyPricePaise?: number) => boolean;
export const normalizeAllowedTypes: (raw: unknown) => CourseFileType[] | null;
export const defaultPersonalModulesForPlan: (
  planId: string,
  monthlyPricePaise?: number,
  yearlyPricePaise?: number,
) => PlanPersonalModulesConfig;
export const normalizePlanPersonalModules: (rawPlan: unknown, planId?: string) => PlanPersonalModulesConfig;
export const personalModulesCycle: (
  config: PlanPersonalModulesConfig | null | undefined,
  cycle: string,
) => PersonalModulesCycleLimits;
export const personalAllowedTypes: (
  config: PlanPersonalModulesConfig | null | undefined,
  cycle: string,
) => CourseFileType[];
export const personalTypeLimit: (config: PlanPersonalModulesConfig | null | undefined, cycle: string) => number;
export const isPersonalTypeAllowed: (
  config: PlanPersonalModulesConfig | null | undefined,
  cycle: string,
  type: unknown,
) => boolean;

export const isActiveSubscription: (record: unknown, now?: number) => boolean;
export const personalCycleOf: (record: unknown) => "monthly" | "yearly";
export const resolvePersonalModulesEntitlement: (
  input: { record: unknown; plan?: unknown },
  now?: number,
) => PersonalModulesEntitlement;

export const usageAtModuleLimit: (usage: PersonalModulesUsage | null | undefined, limits: PersonalModulesCycleLimits | null) => boolean;
export const usageAtResourceLimit: (usage: PersonalModulesUsage | null | undefined, limits: PersonalModulesCycleLimits | null) => boolean;
export const usageAtPerModuleLimit: (resourceCountInModule: number, limits: PersonalModulesCycleLimits | null) => boolean;
export const personalLimitMessage: (
  kind: "module" | "resource" | "per-module",
  limits: PersonalModulesCycleLimits | null,
  planName?: string | null,
) => string;

/** Canonical, renderer-ready URL fields for one personal resource. */
export interface PersonalResourceUrlFields {
  url: string;
  embedUrl?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  provider?: string;
  contentType?: string;
}

export const normalizePersonalResourceUrl: (
  type: unknown,
  value: string,
) => { ok: true; canonical: PersonalResourceUrlFields } | { ok: false; code: string; message: string };

export interface PersonalValidationError {
  field: string;
  code: string;
  message: string;
}

export const sanitizePersonalModuleInput: (raw: unknown) =>
  | { ok: true; value: { title: string; description: string } }
  | { ok: false; errors: PersonalValidationError[] };

export const sanitizePersonalResourceInput: (
  raw: unknown,
  options?: { allowedTypes?: string[] | null },
) =>
  | {
      ok: true;
      value: {
        type: CourseFileType;
        name: string;
        description: string;
        url: string;
        embedUrl: string;
        youtubeUrl: string;
        youtubeVideoId: string;
        provider: string;
        contentType: string;
        sourceUrl: string;
        metadata: Record<string, string>;
      };
    }
  | { ok: false; errors: PersonalValidationError[] };

export const isValidPersonalId: (value: unknown) => boolean;

export const personalAiAvailability: (fileOrType: unknown) => {
  readable: boolean;
  reason: string;
  screenshotSupported: boolean;
};

export const personalProvenanceLabel: (moduleTitle: string, resourceName: string) => string;
