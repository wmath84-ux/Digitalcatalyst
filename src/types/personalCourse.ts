import type { CourseFileType } from "./course";

/** The two destinations visible to a learner. Saved is backed by a hidden bucket. */
export type PersonalResourceState = "module" | "saved";

export interface PersonalResourceOfficialOrigin {
  kind: "official";
  productId: string;
  productDocumentId?: string;
  productTitle: string;
  moduleId: string;
  moduleTitle: string;
  resourceId: string;
  resourceName: string;
  copiedAt: number;
}

export interface PersonalResourceManualOrigin {
  kind: "manual";
  createdAt: number;
}

export type PersonalResourceOrigin = PersonalResourceOfficialOrigin | PersonalResourceManualOrigin;

/**
 * One immutable/renderable personal snapshot. Even an official-origin item is
 * `source: "personal"`: origin records provenance while source keeps official
 * course completion, ordering, authorship and progress isolated.
 */
export interface PersonalCourseResource {
  id: string;
  ownerUid: string;
  source: "personal";
  /** Public learner destination. Null means Saved for Later / Unsorted. */
  personalModuleId: string | null;
  /** Internal parent document id; clients need it for targeted Admin API writes. */
  storageModuleId: string;
  state: PersonalResourceState;
  productId: string;
  name: string;
  description: string;
  type: CourseFileType;
  sourceUrl: string;
  url: string;
  embedUrl: string;
  youtubeUrl: string;
  youtubeVideoId: string;
  provider: string;
  contentType: string;
  metadata: Record<string, string>;
  identityKey: string;
  originKind: "official" | "manual";
  origin: PersonalResourceOrigin;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number | null;
}

export interface PersonalCourseModule {
  id: string;
  ownerUid: string;
  source: "personal";
  kind: "module";
  system: false;
  /** Product context where the module was created; never an ownership scope. */
  productId: string;
  productTitle: string;
  title: string;
  description: string;
  sortOrder: number;
  resourceCount: number;
  createdAt: number;
  updatedAt: number;
  resources: PersonalCourseResource[];
}

export interface PersonalCourseUsage {
  schemaVersion: 2;
  scope: "account";
  moduleCount: number;
  resourceCount: number;
  updatedAt: number;
}

export interface PersonalCourseOfficialReference {
  productId: string;
  /** Firestore siteProducts document id, when different from productId. */
  productDocumentId?: string;
  moduleId: string;
  resourceId: string;
}

export interface PersonalCourseStatus {
  access: {
    entitled: boolean;
    disabled: boolean;
    reason: string;
    planId: string | null;
    planName: string | null;
    cycle: "monthly" | "yearly" | null;
    limits: {
      moduleLimit: number;
      resourceLimit: number;
      perModuleResourceLimit: number;
      allowedTypes: CourseFileType[] | null;
    } | null;
    allowedTypes: CourseFileType[];
    moduleCount: number;
    resourceCount: number;
  };
  usage: PersonalCourseUsage;
}

export interface PersonalCourseLibrarySnapshot extends PersonalCourseStatus {
  modules: PersonalCourseModule[];
  savedResources: PersonalCourseResource[];
}
