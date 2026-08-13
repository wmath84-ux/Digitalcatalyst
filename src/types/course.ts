export type CourseAccessLevel = "included" | "paidUpdate" | "hidden";
export type CourseFileType = "youtube" | "video" | "audio" | "pdf" | "doc" | "sheet" | "slides" | "ebook" | "image" | "google_form" | "embed" | "mindmap";

/**
 * Part 11 — single note shape. Stored on
 * `users/{uid}/courseProgress/{productId}.notes[]`. Multi-device
 * sync is automatic via the Firestore listener.
 */
export interface CoursePlayerNote {
  id: string;
  text: string;
  createdAt: number;
  /** Epoch ms; set whenever the user edits the note. */
  updatedAt?: number;
  /** Module the note was captured from (optional). */
  moduleId?: string;
  /** Resource the note was captured from (optional). */
  resourceId?: string;
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
