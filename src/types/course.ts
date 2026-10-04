export type CourseAccessLevel = "included" | "paidUpdate" | "hidden";
export type CourseFileType =
  | "youtube"
  | "video"
  | "audio"
  | "pdf"
  | "doc"
  | "sheet"
  | "slides"
  | "ebook"
  | "image"
  | "google_form"
  | "embed"
  | "mindmap"
  /**
   * The Brain practice set. Unlike every other type a `brain` resource has NO
   * url — its content IS `practiceQuestions` below, imported by the admin on
   * the Product / Course-content page (resource type "Brain · practice set").
   * It renders in the Course Player's Brain tab, not in the file viewer.
   */
  | "brain";

/**
 * "Interactive 2D experiment" — a learner-authored file type.
 *
 * ADDITIVE on purpose. The 13 members above are the OFFICIAL catalogue's
 * vocabulary, and three registries mirror it byte-for-byte
 * (`utils/aiFileReaders.js`, `src/lumen/course/types.ts`, the personal-course
 * registry pinned by tests). An experiment is authored by the learner in My
 * Study Library (or in a course they built there), so it is declared as its own
 * union and combined below — no official/admin surface has to grow a type it
 * does not offer, and every existing `CourseFileType` consumer keeps its
 * exhaustive list.
 *
 * The content is ONE self-contained HTML document — see
 * `src/utils/experimentSpec.ts` for the format, the sandbox and the
 * player ⇄ experiment message bridge.
 */
export const EXPERIMENT_FILE_TYPE = "interactive" as const;
export type CourseInteractiveFileType = typeof EXPERIMENT_FILE_TYPE;
/** Official lesson content plus the experiment; `CourseFile.type` adds Read separately. */
export type CourseContentFileType = CourseFileType | CourseInteractiveFileType;

/** Admin-authored Read library resource; intentionally separate from lessons. */
export const READ_RESOURCE_FILE_TYPE = "read" as const;
export type CourseReadResourceFileType = typeof READ_RESOURCE_FILE_TYPE;

/** True for the learner-authored interactive experiment. */
export const isExperimentFileType = (type?: string | null): type is CourseInteractiveFileType =>
  String(type || "") === EXPERIMENT_FILE_TYPE;

/**
 * The URL-less file types, and how each of them proves it has content:
 *
 *   · `brain`       — the admin's practice questions (`practiceQuestions`).
 *   · `interactive` — the learner's own HTML (`interactiveHtml`, stored inside
 *                     the course document) or a hosted https page.
 *
 * Every "is this file visible / playable?" test in the player asks about these
 * two instead of `Boolean(file.url)` — that single test used to hide both of
 * them from the lesson list (`CourseOverlay.isVisibleFile` for the Modules tab,
 * `CoursePlayerApp.playableFiles` for first-lesson/resume/progress).
 */

/**
 * One practice question imported by the admin into a `brain` resource.
 * The single source of truth for the shape is `utils/practiceSet.js`; this is
 * its TypeScript projection (the player reads resources straight off the
 * course tree, so both sides must agree byte-for-byte).
 */
export interface CoursePracticeQuestion {
  id: string;
  prompt: string;
  options: string[];
  /** -1 = no answer marked yet (only possible on a draft set). */
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
}

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
  /**
   * AI Study Engine provenance. Set ONLY when the note was created by the
   * module AI ("Save as note" on an answer/summary) — never on a note the
   * learner typed, and an AI note never overwrites a learner's own note.
   * `aiKind` says which output it came from so the badge can name it.
   */
  aiGenerated?: boolean;
  aiKind?: "answer" | "summary" | "explanation" | "question" | "flashcard" | "plan";
  /** Personal module the AI output belonged to (My Study Library / My Modules). */
  personalModuleId?: string;
  /** Personal resource the AI output was scoped to, when it was. */
  personalResourceId?: string;
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
  type: CourseContentFileType | CourseReadResourceFileType;
  url?: string;
  embedUrl?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  size?: number;
  contentType?: string;
  provider?: string;
  /** Read resource origin (`type: "read"` only). */
  readSourceKind?: "upload" | "gdrive" | "pdf_url" | "embed_url";
  /** Owned Firebase Storage object path for an uploaded Read PDF. */
  readStoragePath?: string;
  /** Original uploaded PDF filename and size, used in the Read library. */
  readFileName?: string;
  readFileSize?: number;
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
  /** Internal hidden-bucket/module parent used only for targeted personal API writes. */
  personalStorageModuleId?: string;
  personalResourceId?: string;
  personalState?: "module" | "saved";
  /** Provenance is separate from `source` so official snapshots remain progress-isolated. */
  personalOriginKind?: "official" | "manual";
  officialSourceProductId?: string;
  officialSourceModuleId?: string;
  officialSourceResourceId?: string;
  description?: string;
  /**
   * Brain practice-set payload (type: "brain" only). The admin's bulk-import
   * questions, exactly as stored — non-`brain` resources never carry these.
   */
  practiceQuestions?: CoursePracticeQuestion[];
  practiceTitle?: string;
  /**
   * Interactive 2D experiment source (type: "interactive" only). ONE
   * self-contained HTML document, stored inline in the course document so the
   * player renders it in a sandboxed iframe with no hosting and no network.
   * A `url` MAY accompany it (a hosted page) — inline wins when both exist.
   */
  interactiveHtml?: string;
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
