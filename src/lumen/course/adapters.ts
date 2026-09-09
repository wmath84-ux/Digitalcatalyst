import type { Capabilities, ChunkLocation, CourseResource, LocationState, PlaybackState, ResourceType } from "./types";

/* ─────────────────────────────────────────────────────────────
   RESOURCE CONTEXT ADAPTERS
   One adapter per resource type. Each declares — honestly — what
   its source can provide, how to describe the student's current
   position, and what to fall back to when content is closed.
   Adding a new resource type means adding one object here; the
   chat, retrieval and tutor layers never change.
   ───────────────────────────────────────────────────────────── */

export interface ResourceContextAdapter {
  type: ResourceType;
  label: string;
  capabilities(resource: CourseResource): Capabilities;
  /** Where the student is, as a retrieval filter. */
  locate(playback: PlaybackState, location: LocationState): ChunkLocation;
  /** Human phrasing of the current position, e.g. "at 18:42". */
  describePosition(playback: PlaybackState, location: LocationState, resource: CourseResource): string;
  /** Sentence the tutor uses when content is not readable. */
  fallbackMessage(resource: CourseResource): string;
}

export function fmtTime(s?: number): string {
  if (s == null || !isFinite(s)) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const CAPS = (over: Partial<Capabilities>): Capabilities => ({
  text: false, metadata: true, position: false, pages: false, slides: false,
  transcript: false, searchableChunks: false, visual: false, original: false,
  serverAnalyzable: false, fallback: "metadata", ...over,
});

const timeBased = (type: ResourceType, label: string, medium: string): ResourceContextAdapter => ({
  type,
  label,
  capabilities: (r) =>
    CAPS({
      text: r.availability === "ready",
      position: true,
      transcript: r.availability === "ready",
      searchableChunks: r.availability === "ready",
      visual: type !== "audio",
      serverAnalyzable: true,
      original: type !== "youtube",
      fallback: type === "audio" ? "metadata" : "screenshot",
    }),
  locate: (p) => ({ timestampStart: p.currentTime ?? 0 }),
  describePosition: (p) => `at ${fmtTime(p.currentTime)}${p.playing ? "" : " (paused)"}`,
  fallbackMessage: (r) =>
    r.availabilityNote ??
    `I don't have a transcript for this ${medium}, so I can't quote what was said. Tell me roughly what was covered, or capture the part you mean.`,
});

const YouTubeAdapter = timeBased("youtube", "YouTube lesson", "video");
const VideoAdapter = timeBased("video", "Video", "video");
const AudioAdapter = timeBased("audio", "Audio", "recording");

const PdfAdapter: ResourceContextAdapter = {
  type: "pdf",
  label: "PDF",
  capabilities: (r) =>
    CAPS({ text: r.availability === "ready", pages: true, position: true, searchableChunks: r.availability === "ready", visual: true, original: true, serverAnalyzable: true, fallback: "screenshot" }),
  locate: (_p, l) => ({ page: l.currentPage }),
  // Never guessed: the page comes from the viewer's own reported state.
  describePosition: (_p, l, r) => (l.currentPage ? `on page ${l.currentPage}${r.pageCount ? ` of ${r.pageCount}` : ""}` : "in the document"),
  fallbackMessage: (r) => r.availabilityNote ?? "I can't read this PDF's text. Screenshot the section you mean and I'll work from that.",
};

const DocAdapter: ResourceContextAdapter = {
  type: "doc",
  label: "Google Doc",
  capabilities: (r) => CAPS({ text: r.availability === "ready", searchableChunks: r.availability === "ready", position: false, serverAnalyzable: true, fallback: "screenshot" }),
  locate: () => ({}),
  describePosition: () => "in the document",
  fallbackMessage: (r) => r.availabilityNote ?? "The document content isn't available to me right now. You can screenshot the relevant section.",
};

const SheetAdapter: ResourceContextAdapter = {
  type: "sheet",
  label: "Google Sheet",
  capabilities: (r) => CAPS({ text: r.availability === "ready", searchableChunks: r.availability === "ready", position: true, serverAnalyzable: true, fallback: "screenshot" }),
  locate: (_p, l) => ({ sheet: l.currentSheet }),
  describePosition: (_p, l) => (l.currentSheet ? `on sheet “${l.currentSheet}”` : "in the spreadsheet"),
  fallbackMessage: (r) => r.availabilityNote ?? "I can't read this spreadsheet. A screenshot of the range you mean works.",
};

const SlidesAdapter: ResourceContextAdapter = {
  type: "slides",
  label: "Google Slides",
  capabilities: (r) => CAPS({ text: r.availability === "ready", slides: true, position: true, searchableChunks: r.availability === "ready", visual: true, serverAnalyzable: true, fallback: "screenshot" }),
  locate: (_p, l) => ({ slide: l.currentSlide }),
  describePosition: (_p, l, r) => (l.currentSlide ? `on slide ${l.currentSlide}${r.slideCount ? ` of ${r.slideCount}` : ""}` : "in the deck"),
  fallbackMessage: (r) => r.availabilityNote ?? "I can't read this deck. Screenshot the slide and I'll take it from there.",
};

const EbookAdapter: ResourceContextAdapter = {
  type: "ebook",
  label: "E-book",
  capabilities: (r) => CAPS({ text: r.availability === "ready", pages: true, position: true, searchableChunks: r.availability === "ready", original: true, serverAnalyzable: true, fallback: "screenshot" }),
  locate: (_p, l) => ({ chapter: l.currentChapter, page: l.currentPage }),
  describePosition: (_p, l) => (l.currentChapter ? `in ${l.currentChapter}` : "in the book"),
  fallbackMessage: (r) => r.availabilityNote ?? "I can't read this book's text. Screenshot the passage you mean.",
};

const ImageAdapter: ResourceContextAdapter = {
  type: "image",
  label: "Image",
  capabilities: () => CAPS({ visual: true, text: true, searchableChunks: true, original: true, serverAnalyzable: true, fallback: "screenshot" }),
  locate: () => ({}),
  describePosition: () => "viewing the figure",
  fallbackMessage: () => "I couldn't analyse this image. Try capturing the specific area you're asking about.",
};

const GoogleFormAdapter: ResourceContextAdapter = {
  type: "google_form",
  label: "Google Form",
  // Deliberately no text capability: questions are never invented.
  capabilities: (r) => CAPS({ text: false, searchableChunks: false, visual: false, serverAnalyzable: r.availability === "ready", fallback: "screenshot" }),
  locate: () => ({}),
  describePosition: () => "on the form",
  fallbackMessage: (r) =>
    r.availabilityNote ?? "I can't read this form's questions. Screenshot the question you're stuck on and I'll help with that exact one.",
};

const EmbedAdapter: ResourceContextAdapter = {
  type: "embed",
  label: "Embedded app",
  // Sandboxed third-party iframe: metadata + screenshot only, ever.
  capabilities: () => CAPS({ text: false, searchableChunks: false, visual: false, fallback: "screenshot" }),
  locate: () => ({}),
  describePosition: () => "in the embedded app",
  fallbackMessage: (r) =>
    r.availabilityNote ?? "This is a third-party embed, so I can only see its title — not what's inside it. A screenshot lets me help properly.",
};

const MindmapAdapter: ResourceContextAdapter = {
  type: "mindmap",
  label: "Mind map",
  capabilities: (r) =>
    CAPS({ text: r.availability === "ready" || r.availability === "partial", searchableChunks: r.availability !== "unsupported", visual: true, serverAnalyzable: true, fallback: "screenshot" }),
  locate: () => ({}),
  describePosition: () => "viewing the concept map",
  fallbackMessage: (r) => r.availabilityNote ?? "I can't read this map's structure. A screenshot of the branch you mean works.",
};

const REGISTRY: Record<ResourceType, ResourceContextAdapter> = {
  youtube: YouTubeAdapter,
  video: VideoAdapter,
  audio: AudioAdapter,
  pdf: PdfAdapter,
  doc: DocAdapter,
  sheet: SheetAdapter,
  slides: SlidesAdapter,
  ebook: EbookAdapter,
  image: ImageAdapter,
  google_form: GoogleFormAdapter,
  embed: EmbedAdapter,
  mindmap: MindmapAdapter,
};

export function getAdapter(type: ResourceType): ResourceContextAdapter {
  return REGISTRY[type] ?? EmbedAdapter; // safest default: metadata + screenshot
}

export function registerAdapter(adapter: ResourceContextAdapter): void {
  REGISTRY[adapter.type] = adapter;
}
