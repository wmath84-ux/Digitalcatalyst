export type CourseAccessLevel = "included" | "paidUpdate" | "hidden";
export type CourseFileType = "youtube" | "video" | "audio" | "pdf" | "doc" | "sheet" | "slides" | "ebook" | "image" | "google_form" | "embed" | "mindmap";

/**
 * Part 11 — single note shape. Stored on
 * `users/{uid}/courseProgress/{productId}.notes[]`. Multi-device
 * sync is automatic via the Firestore listener.
 */
export interface CoursePlayerNote {
  id: string;
  /** Plain-text projection — used for the thin saved-note strip + search. */
  text: string;
  /**
   * Sanitised rich-text HTML. Keeps the exact formatting of anything pasted
   * into the editor (bold, lists, tables, links, code, colours, emoji).
   * Legacy notes saved before rich text was added only have `text`.
   */
  html?: string;
  createdAt: number;
  /** Epoch ms; set whenever the user edits the note. */
  updatedAt?: number;
  /** Module the note was captured from (optional). */
  moduleId?: string;
  /** Resource the note was captured from (optional). */
  resourceId?: string;
  /**
   * Ids of other notes this note is "linked" to (drawn as wires between
   * note cards). Persisted alongside the note text so a re-open restores
   * the user's link graph. Older notes never had this field — readers
   * treat a missing value as an empty array.
   */
  links?: string[];
}

export interface CourseAccessMeta {
  accessLevel?: CourseAccessLevel;
  paidUpdateId?: string;
  paidUpdateTitle?: string;
  paidUpdatePrice?: string;
  paidUpdateCoinPrice?: number;
}

export interface CourseFile extends CourseAccessMeta {
  id: string;
  name: string;
  type: CourseFileType;
  url?: string;
  embedUrl?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  size?: number;
  contentType?: string;
  provider?: string;
  /**
   * Personal Modules ("My Modules") provenance. Set ONLY when this file was
   * opened from the learner's OWN personal-content space — official course
   * files never carry these fields, so every existing consumer (progress,
   * resume, mind maps, notes, downloads) can tell personal content apart and
   * keep it out of official course metrics.
   *
   *   source           — "personal" when the file is learner-owned.
   *   ownerUid         — always the authenticated learner's uid (server-set).
   *   personalModuleId — doc id of the owning personal module
   *                      (`users/{uid}/personalCourseModules/{moduleId}`).
   *   personalResourceId — doc id of the owning personal resource
   *                      (`…/personalCourseModules/{moduleId}/resources/{id}`).
   *   description      — the personal resource's own description text.
   */
  source?: "official" | "personal";
  ownerUid?: string;
  personalModuleId?: string;
  personalResourceId?: string;
  description?: string;
}

export interface CourseModule extends CourseAccessMeta {
  id: string;
  title: string;
  files: CourseFile[];
  modules: CourseModule[];
  embedContentTypeId?: string;
  embedContentTypeLabel?: string;
  embedContentUrl?: string;
}

export interface PaidCourseUpdate {
  id: string;
  title: string;
  price: number;
  coinPrice: number;
  contentNames: string[];
}
