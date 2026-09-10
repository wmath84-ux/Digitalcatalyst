// Typed client for the existing authenticated Personal Course API.
// The verified server token is the only owner source; payload owner fields are
// never accepted. All methods resolve only after the authoritative write.

import { auth } from "../../firebase";
import { apiFetch } from "../utils/apiBase";
import type { CourseFile, CourseFileType } from "../types/course";
import type { PersonalModulesCycleLimits } from "../../utils/personalCourse";
import type {
  PersonalCourseLibrarySnapshot,
  PersonalCourseModule,
  PersonalCourseOfficialReference,
  PersonalCourseResource,
  PersonalCourseUsage,
} from "../types/personalCourse";

export type {
  PersonalCourseLibrarySnapshot,
  PersonalCourseModule,
  PersonalCourseOfficialReference,
  PersonalCourseResource,
  PersonalCourseUsage,
} from "../types/personalCourse";

export type PersonalCourseAccessState = "entitled" | "not-entitled" | "disabled";

export interface PersonalCourseAccess {
  state: PersonalCourseAccessState;
  entitled: boolean;
  disabled: boolean;
  planId: string | null;
  planName: string | null;
  cycle: "monthly" | "yearly" | null;
  featureId: "personal-modules";
  reason: string;
  moduleCount: number;
  resourceCount: number;
  limits: PersonalModulesCycleLimits | null;
  allowedTypes: CourseFileType[];
  typeLimit: number;
}

export type PersonalCourseMutation =
  | { ok: true; message?: string; alreadyExists?: boolean; data?: PersonalCourseMutationData }
  | { ok: false; code?: string; message?: string; error?: string };

export interface PersonalCourseMutationData {
  module?: PersonalCourseModule;
  resource?: PersonalCourseResource;
  usage?: PersonalCourseUsage;
  moduleId?: string;
  resourceId?: string;
  storageModuleId?: string;
  fromStorageModuleId?: string;
  removedResourceCount?: number;
  orderedIds?: string[];
  alreadyExists?: boolean;
  existingState?: "module" | "saved";
  existingModuleId?: string | null;
  movedFromSaved?: boolean;
  moved?: boolean;
  lastOpenedAt?: number;
}

export interface PersonalCoursePayload {
  action: string;
  requestId?: string;
  productId?: string;
  productDocumentId?: string;
  moduleId?: string;
  sourceModuleId?: string;
  resourceId?: string;
  sourceResourceId?: string;
  storageModuleId?: string;
  fromStorageModuleId?: string;
  toModuleId?: string;
  scopeProductId?: string;
  destination?: "module" | "saved";
  newModuleTitle?: string;
  newModuleDescription?: string;
  title?: string;
  description?: string;
  name?: string;
  type?: string;
  url?: string;
  toIndex?: number;
}

type Envelope<T> = {
  ok?: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  details?: unknown;
};

export class PersonalCourseApiError extends Error {
  code: string;
  status: number;
  details?: unknown;
  /** Safe to fire again straight away: reads change nothing. */
  retryable: boolean;
  /** A write whose outcome the server could not confirm — retrying blindly may repeat it. */
  unconfirmed: boolean;

  constructor(
    message: string,
    code = "PERSONAL_COURSE_ERROR",
    status = 400,
    details?: unknown,
    options: { retryable?: boolean; unconfirmed?: boolean } = {},
  ) {
    super(message);
    this.name = "PersonalCourseApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryable = options.retryable ?? false;
    this.unconfirmed = options.unconfirmed ?? false;
  }
}

/**
 * Actions that only read state. They are idempotent, so a failure must be
 * reported as "could not load — try again" and never as an unconfirmed write.
 * The wording used to be shared by both, which told learners to avoid retrying
 * a request that had only ever READ their library, and it sent an ordinary
 * load failure to the dead-end "couldn't be confirmed" screen.
 */
const READ_ACTIONS = new Set(["personalCourse.library", "personalCourse.status", "personalCourse.list"]);

const requestId = () => {
  try { return crypto.randomUUID(); } catch { return `web_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
};

async function request<T>(action: string, payload: Omit<Partial<PersonalCoursePayload>, "action"> = {}): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new PersonalCourseApiError("Please log in to use My Study Library.", "AUTH_REQUIRED", 401);
  const isRead = READ_ACTIONS.has(action);
  const retryable = isRead;
  let response: Response;
  try {
    const token = await user.getIdToken();
    response = await apiFetch("/api/personal-course", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, requestId: requestId(), ...payload }),
    });
  } catch (error) {
    const offline = typeof navigator !== "undefined" && navigator.onLine === false;
    throw new PersonalCourseApiError(
      isRead
        ? offline
          ? "You're offline, so your library couldn't be loaded. Reconnect and try again."
          : "Your library couldn't be loaded. Nothing was changed — try again."
        : offline
          ? "You're offline, so the result couldn't be confirmed. Reconnect and refresh your library before retrying."
          : "The server result couldn't be confirmed. Refresh your library before retrying so you don't repeat a completed action.",
      "NETWORK_ERROR",
      0,
      error,
      { retryable },
    );
  }
  const body = (await response.json().catch(() => ({}))) as Envelope<T>;
  if (!response.ok || !body.ok || body.data === undefined) {
    // A gateway/function 5xx can arrive after the transaction committed but
    // before its response reached the browser. Treat it as unconfirmed rather
    // than claiming the mutation failed and inviting an unsafe immediate retry.
    const unconfirmed = !isRead && (response.status >= 500 || (response.ok && (body.data === undefined || body.ok !== true)));
    // `ok: true` with no `data` is not a library answer at all: this API shares
    // one deployed function with several features, and an undispatched request
    // used to be answered by another one. Say so instead of blaming the user's
    // connection or their library.
    const foreign = !unconfirmed && body.ok === true && body.data === undefined;
    if (unconfirmed) {
      throw new PersonalCourseApiError(
        "The server result couldn't be confirmed. Refresh your library before retrying.",
        "UNCONFIRMED_RESULT",
        response.status,
        body.details,
        { unconfirmed: true },
      );
    }
    throw new PersonalCourseApiError(
      isRead
        ? foreign
          ? "My Study Library didn't answer this request — the shared API replied with a different service's result. Reload the page and try again."
          : body.message || body.error || "Your library couldn't be loaded. Try again."
        : body.message || body.error || "My Study Library couldn't be updated.",
      foreign && isRead ? "LIBRARY_ROUTE_UNAVAILABLE" : body.code || "PERSONAL_COURSE_ERROR",
      response.status,
      body.details,
      { retryable },
    );
  }
  return body.data;
}

const id = (value: string | undefined | null, label: string) => {
  const clean = String(value || "").trim();
  if (!clean) throw new PersonalCourseApiError(`${label} is required.`, "INVALID_ID", 400);
  return clean;
};

const normalizeAccess = (access: PersonalCourseLibrarySnapshot["access"]): PersonalCourseAccess => ({
  ...access,
  state: access.entitled ? "entitled" : access.disabled ? "disabled" : "not-entitled",
  featureId: "personal-modules",
  // A missing allowedTypes must never take the page down: the library renders
  // its "no types enabled on this plan" banner from this count.
  typeLimit: Array.isArray(access.allowedTypes) ? access.allowedTypes.length : 0,
  allowedTypes: Array.isArray(access.allowedTypes) ? access.allowedTypes : [],
});

export const fetchPersonalCourseLibrary = async (): Promise<{
  access: PersonalCourseAccess;
  usage: PersonalCourseUsage;
  modules: PersonalCourseModule[];
  savedResources: PersonalCourseResource[];
}> => {
  const result = await request<PersonalCourseLibrarySnapshot>("personalCourse.library");
  // Shape-check the snapshot before it reaches React state. Anything else used
  // to surface as a render-time TypeError several frames later, which unmounted
  // the whole route instead of showing a recoverable error card.
  if (!result || typeof result !== "object" || !result.access || !Array.isArray(result.modules) || !Array.isArray(result.savedResources)) {
    throw new PersonalCourseApiError(
      "My Study Library returned an incomplete snapshot. Try again to reload it.",
      "MALFORMED_SNAPSHOT",
      200,
      undefined,
      { retryable: true },
    );
  }
  return {
    modules: result.modules,
    savedResources: result.savedResources,
    usage: result.usage,
    access: normalizeAccess(result.access),
  };
};

/** Backward-compatible status/list calls used by source contracts and older consumers. */
export const fetchPersonalCourseStatus = async (_productId?: string) => {
  const result = await request<Pick<PersonalCourseLibrarySnapshot, "access" | "usage">>("personalCourse.status");
  return { ...result, access: normalizeAccess(result.access) };
};
export const fetchPersonalCourseModules = (_productId?: string) => request<{
  modules: PersonalCourseModule[];
  savedResources: PersonalCourseResource[];
}>("personalCourse.list");

export const createPersonalModule = (
  productId: string | null | undefined,
  title: string,
  description: string,
  productDocumentId?: string,
) => request<PersonalCourseMutationData>("personalCourse.module.create", {
  productId: productId || "__library__",
  productDocumentId,
  title,
  description,
});

export const updatePersonalModule = (moduleId: string, title: string, description: string) =>
  request<PersonalCourseMutationData>("personalCourse.module.update", { moduleId: id(moduleId, "Module id"), title, description });

export const deletePersonalModule = (moduleId: string) =>
  request<PersonalCourseMutationData>("personalCourse.module.delete", { moduleId: id(moduleId, "Module id") });

export const movePersonalModule = (moduleId: string, toIndex: number, scopeProductId?: string) =>
  request<PersonalCourseMutationData>("personalCourse.module.reorder", { moduleId: id(moduleId, "Module id"), toIndex, scopeProductId });

export interface PersonalResourceFields {
  type: CourseFileType;
  name: string;
  description: string;
  url: string;
}

export const createPersonalResource = (
  moduleId: string | null,
  fields: PersonalResourceFields,
  context?: { productId?: string; productDocumentId?: string },
) => request<PersonalCourseMutationData>("personalCourse.resource.create", {
  moduleId: moduleId || undefined,
  destination: moduleId ? "module" : "saved",
  productId: context?.productId,
  productDocumentId: context?.productDocumentId,
  ...fields,
});

export const updatePersonalResource = (
  storageModuleId: string,
  resourceId: string,
  fields: PersonalResourceFields,
) => request<PersonalCourseMutationData>("personalCourse.resource.update", {
  storageModuleId: id(storageModuleId, "Module id"),
  resourceId: id(resourceId, "Resource id"),
  ...fields,
});

export const deletePersonalResource = (storageModuleId: string, resourceId: string) =>
  request<PersonalCourseMutationData>("personalCourse.resource.delete", {
    storageModuleId: id(storageModuleId, "Module id"),
    resourceId: id(resourceId, "Resource id"),
  });

/** Accessible reorder inside the current module/Saved list. */
export const movePersonalResource = (storageModuleId: string, resourceId: string, toIndex: number) =>
  request<PersonalCourseMutationData>("personalCourse.resource.reorder", {
    storageModuleId: id(storageModuleId, "Module id"),
    resourceId: id(resourceId, "Resource id"),
    toIndex,
  });

/** Move between a real module and Saved for Later without changing total usage. */
export const movePersonalResourceToDestination = (
  resource: Pick<PersonalCourseResource, "id" | "storageModuleId">,
  toModuleId: string | null,
) => request<PersonalCourseMutationData>("personalCourse.resource.move", {
  fromStorageModuleId: id(resource.storageModuleId, "Source module id"),
  resourceId: id(resource.id, "Resource id"),
  destination: toModuleId ? "module" : "saved",
  toModuleId: toModuleId || undefined,
});

export const markPersonalResourceOpened = (resource: Pick<PersonalCourseResource, "id" | "storageModuleId">) =>
  request<PersonalCourseMutationData>("personalCourse.resource.open", {
    storageModuleId: id(resource.storageModuleId, "Module id"),
    resourceId: id(resource.id, "Resource id"),
  });

export interface AddOfficialResourceDestination {
  moduleId?: string;
  newModuleTitle?: string;
  newModuleDescription?: string;
  destination: "module" | "saved";
}

export const addOfficialResource = (
  official: PersonalCourseOfficialReference,
  destination: AddOfficialResourceDestination,
) => request<PersonalCourseMutationData>("personalCourse.official.add", {
  productId: id(official.productId, "Product id"),
  productDocumentId: official.productDocumentId,
  sourceModuleId: id(official.moduleId, "Official module id"),
  sourceResourceId: id(official.resourceId, "Official resource id"),
  destination: destination.destination,
  moduleId: destination.moduleId,
  newModuleTitle: destination.newModuleTitle,
  newModuleDescription: destination.newModuleDescription,
});

/**
 * Personal snapshot → the canonical CourseFile consumed by the ONE existing
 * ResourceViewer. `source` stays personal even when origin.kind is official,
 * which guarantees no official completion/progress mutation.
 */
export const personalResourceToCourseFile = (
  resource: PersonalCourseResource,
  moduleId: string | null = resource.personalModuleId,
): CourseFile => ({
  id: resource.id,
  name: resource.name,
  type: resource.type,
  url: resource.url || undefined,
  embedUrl: resource.embedUrl || undefined,
  youtubeUrl: resource.youtubeUrl || undefined,
  youtubeVideoId: resource.youtubeVideoId || undefined,
  provider: resource.provider || undefined,
  contentType: resource.contentType || undefined,
  description: resource.description || undefined,
  accessLevel: "included",
  source: "personal",
  ownerUid: resource.ownerUid,
  personalModuleId: moduleId || undefined,
  personalStorageModuleId: resource.storageModuleId,
  personalResourceId: resource.id,
  personalState: resource.state,
  personalOriginKind: resource.originKind,
  officialSourceProductId: resource.origin.kind === "official" ? resource.origin.productId : undefined,
  officialSourceModuleId: resource.origin.kind === "official" ? resource.origin.moduleId : undefined,
  officialSourceResourceId: resource.origin.kind === "official" ? resource.origin.resourceId : undefined,
});
