// src/lib/personalCourseClient.ts
//
// Typed client for the Personal Course Modules ("My Modules") server API
// (`/api/personal-course`, dispatched to api/_lib/personalCourse.ts).
//
// Mirrors src/lib/myDayClient.ts: the Firebase auth token is attached by the
// client but the SERVER re-derives the uid from the verified token — a forged
// ownerUid in the payload is ignored. Entitlement + plan limits + allowed
// resource types are enforced server-side inside Firestore transactions, so
// everything this client sends is treated as a request, never as truth.

import { auth } from "../../firebase";
import { apiFetch } from "../utils/apiBase";
import type { CourseFile, CourseFileType } from "../types/course";
import type { PersonalModulesCycleLimits } from "../../utils/personalCourse";

export type PersonalCourseAccessState = "entitled" | "not-entitled" | "disabled";

/** The `access` half of personalCourse.status — server-derived. */
export interface PersonalCourseAccess {
  state: PersonalCourseAccessState;
  entitled: boolean;
  disabled: boolean;
  planId: string | null;
  planName: string | null;
  cycle: "monthly" | "yearly" | null;
  featureId: "personal-modules";
  reason: string;
  /** Live counts the server maintains (usage doc). */
  moduleCount: number;
  resourceCount: number;
  limits: PersonalModulesCycleLimits | null;
  allowedTypes: CourseFileType[];
  typeLimit: number;
}

export interface PersonalCourseUsage {
  moduleCount: number;
  resourceCount: number;
  lastWriteAt: number;
}

export interface PersonalCourseResource {
  id: string;
  ownerUid: string;
  productId: string;
  personalModuleId: string;
  type: CourseFileType;
  name: string;
  description: string;
  url: string;
  embedUrl?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  provider?: string;
  contentType?: string;
  sourceUrl?: string;
  sortOrder: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface PersonalCourseModule {
  id: string;
  ownerUid: string;
  productId: string;
  title: string;
  description: string;
  sortOrder: number;
  resourceCount: number;
  createdAt?: number;
  updatedAt?: number;
  /** Nested resources, ordered by sortOrder (personalCourse.list). */
  resources: PersonalCourseResource[];
}

export type PersonalCourseMutation =
  | { ok: true; message?: string }
  | { ok: false; code?: string; error?: string };

export interface PersonalCoursePayload {
  action: string;
  productId?: string;
  moduleId?: string;
  resourceId?: string;
  title?: string;
  description?: string;
  name?: string;
  type?: string;
  url?: string;
  toIndex?: number;
}

type PersonalCourseResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  access?: PersonalCourseAccess;
  usage?: PersonalCourseUsage;
  modules?: PersonalCourseModule[];
};

export class PersonalCourseApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code = "PERSONAL_COURSE_ERROR", status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

async function request(action: string, payload?: Partial<PersonalCoursePayload>): Promise<PersonalCourseResponse> {
  const user = auth.currentUser;
  if (!user) throw new PersonalCourseApiError("Please log in to use My Modules.", "AUTH_REQUIRED", 401);
  const token = await user.getIdToken();
  const response = await apiFetch("/api/personal-course", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = (await response.json().catch(() => ({}))) as PersonalCourseResponse;
  if (!response.ok || !body.ok) {
    throw new PersonalCourseApiError(body.error || "Could not update your personal modules.", body.code || "PERSONAL_COURSE_ERROR", response.status);
  }
  return body;
}

const id = (value: string | undefined, label: string) => {
  const clean = String(value || "").trim();
  if (!clean) throw new PersonalCourseApiError(`${label} is required.`, "INVALID_ID", 400);
  return clean;
};

export const fetchPersonalCourseStatus = (productId: string) =>
  request("personalCourse.status", { productId: id(productId, "Course id") });

export const fetchPersonalCourseModules = (productId: string) =>
  request("personalCourse.list", { productId: id(productId, "Course id") });

export const createPersonalModule = (productId: string, title: string, description: string) =>
  request("personalCourse.module.create", { productId: id(productId, "Course id"), title, description });

export const updatePersonalModule = (moduleId: string, title: string, description: string) =>
  request("personalCourse.module.update", { moduleId: id(moduleId, "Module id"), title, description });

export const deletePersonalModule = (moduleId: string) =>
  request("personalCourse.module.delete", { moduleId: id(moduleId, "Module id") });

export const movePersonalModule = (moduleId: string, toIndex: number) =>
  request("personalCourse.module.move", { moduleId: id(moduleId, "Module id"), toIndex });

export const createPersonalResource = (
  moduleId: string,
  fields: { type: CourseFileType; name: string; description: string; url: string },
) =>
  request("personalCourse.resource.create", {
    moduleId: id(moduleId, "Module id"),
    type: fields.type,
    name: fields.name,
    description: fields.description,
    url: fields.url,
  });

export const updatePersonalResource = (
  moduleId: string,
  resourceId: string,
  fields: { type: CourseFileType; name: string; description: string; url: string },
) =>
  request("personalCourse.resource.update", {
    moduleId: id(moduleId, "Module id"),
    resourceId: id(resourceId, "Resource id"),
    type: fields.type,
    name: fields.name,
    description: fields.description,
    url: fields.url,
  });

export const deletePersonalResource = (moduleId: string, resourceId: string) =>
  request("personalCourse.resource.delete", {
    moduleId: id(moduleId, "Module id"),
    resourceId: id(resourceId, "Resource id"),
  });

export const movePersonalResource = (moduleId: string, resourceId: string, toIndex: number) =>
  request("personalCourse.resource.move", {
    moduleId: id(moduleId, "Module id"),
    resourceId: id(resourceId, "Resource id"),
    toIndex,
  });

/**
 * A validated personal resource → the official `CourseFile` shape, so the
 * EXISTING ResourceViewer renders it through its one `getCourseEmbed` path —
 * no second viewer, no duplicated type handling. Provenance fields mark the
 * file as personal so progress / notes / resume / mind-map / download
 * surfaces can tell it apart from official content.
 */
export const personalResourceToCourseFile = (
  resource: PersonalCourseResource,
  moduleId: string,
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
  // ── Personal provenance (see src/types/course.ts) ──────────────────────
  source: "personal",
  ownerUid: resource.ownerUid,
  personalModuleId: moduleId,
  personalResourceId: resource.id,
});
