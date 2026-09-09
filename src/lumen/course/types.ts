/* ─────────────────────────────────────────────────────────────
   COURSE CONTEXT MODEL
   One normalized representation of "what the student is looking
   at", regardless of the underlying resource type. The Course
   Player stays authoritative for player state; the AI consumes a
   read-only projection of it.
   ───────────────────────────────────────────────────────────── */

export type ResourceType =
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
  | "mindmap";

/** Explicit, non-negotiable availability of a content source. */
export type Availability =
  | "available"        // known to exist, not requested yet
  | "processing"       // extraction in flight
  | "ready"            // fully extracted
  | "partial"          // some content extracted, some missing
  | "unavailable"      // nothing extractable
  | "permission_required" // needs provider authorization the course lacks
  | "unsupported";     // no safe extraction path exists at all

/** What an adapter can honestly offer for a resource. */
export interface Capabilities {
  text: boolean;
  metadata: boolean;
  position: boolean;
  pages: boolean;
  slides: boolean;
  transcript: boolean;
  searchableChunks: boolean;
  visual: boolean;
  original: boolean;
  serverAnalyzable: boolean;
  fallback: "screenshot" | "metadata" | "none";
}

/* ── retrievable content ──────────────────────────────────── */

export interface ChunkLocation {
  page?: number;
  slide?: number;
  chapter?: string;
  section?: string;
  sheet?: string;
  range?: string;
  timestampStart?: number;
  timestampEnd?: number;
  node?: string;
}

export interface ContentChunk {
  chunkId: string;
  resourceId: string;
  resourceType: ResourceType;
  courseId: string;
  moduleId: string;
  heading?: string;
  text: string;
  loc: ChunkLocation;
  language?: string;
  contentHash: string;
}

export interface TranscriptSegment {
  startTime: number;
  endTime: number;
  text: string;
}

export interface NormalizedTranscript {
  videoId?: string;
  resourceId: string;
  language: string;
  /** Where the text legitimately came from — never invented. */
  source: "course_owner" | "provider_captions" | "webvtt" | "asr_authorized";
  status: Availability;
  segments: TranscriptSegment[];
  generatedAt: number;
  contentHash: string;
}

/* ── the course tree ──────────────────────────────────────── */

export interface CourseResource {
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  resourceUrl: string;
  provider: string;
  /** Duration (media) or page/slide count — display + clamping only. */
  duration?: number;
  pageCount?: number;
  slideCount?: number;
  /** Server-side availability, resolved by the extraction service. */
  availability: Availability;
  /** Why content is limited — surfaced verbatim to the student. */
  availabilityNote?: string;
  accessState: "granted" | "denied" | "unauthenticated";
  completion?: number;
}

export interface CourseModule {
  moduleId: string;
  moduleTitle: string;
  lessonId: string;
  lessonTitle: string;
  resources: CourseResource[];
}

export interface Course {
  courseId: string;
  courseTitle: string;
  subject: string;
  modules: CourseModule[];
}

export interface ResourceNote {
  noteId: string;
  resourceId: string;
  text: string;
  loc?: ChunkLocation;
  createdAt: number;
}

/* ── live player state (owned by the Course Player) ───────── */

export interface PlaybackState {
  playing: boolean;
  currentTime?: number;
  duration?: number;
}

export interface LocationState {
  currentPage?: number;
  currentSlide?: number;
  currentSheet?: string;
  currentChapter?: string;
  scrollPercent?: number;
}

export interface ViewportState {
  playerMode: "split" | "full" | "hidden";
  viewportMode: "desktop" | "tablet" | "mobile" | "narrow-panel";
  splitRatio?: number;
  aiOpen: boolean;
}

/** The single object the AI layer consumes. Read-only projection. */
export interface CurrentResourceContext {
  course: { courseId: string; courseTitle: string; subject: string };
  module: { moduleId: string; moduleTitle: string };
  lesson: { lessonId: string; lessonTitle: string };
  resource: CourseResource;
  sourceType: ResourceType;
  provider: string;
  canonicalUrl: string;
  activeState: { active: boolean; loading: boolean; failed: boolean };
  playbackState: PlaybackState;
  locationState: LocationState;
  capabilities: Capabilities;
  availability: Availability;
  availabilityNote?: string;
  viewport: ViewportState;
  notes: ResourceNote[];
  lastInteraction: string;
  lastUpdated: number;
}

/* ── retrieval results carry provenance ───────────────────── */

export interface RetrievedChunk {
  chunk: ContentChunk;
  score: number;
  /** Human-facing provenance, e.g. "around 18:42" / "page 17". */
  citation: string;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  availability: Availability;
  note?: string;
  /** Strategy actually used — surfaced in the thinking trace. */
  strategy: string;
}
