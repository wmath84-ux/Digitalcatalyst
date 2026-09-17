// Type declarations for `utils/aiFileReaders.js` — the per-file-type reader
// registry. The runtime is a sibling `.js` file so `node --test` and the Vercel
// functions can import it without a build step (same convention as
// `utils/courseAccess.d.ts`).

export type AiFileType =
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
  | "brain";

export type AiReadKind = "google-export" | "pdf-bytes" | "caption-file" | "text-file" | "in-document" | "none";

export type AiReaderFallback = "screenshot" | "metadata" | "none";

export interface AiFileReader {
  type: string;
  label: string;
  via: AiReadKind;
  captions: boolean;
  payload: boolean;
  hasReadPath: boolean;
  visual: boolean;
  fallback: AiReaderFallback;
  reason: string;
}

export interface AiReadPlan {
  kind: AiReadKind;
  url: string;
  format: string;
  reason: string;
  via: AiReader["via"];
}

export interface AiCaptionParse {
  text: string;
  cues: number;
  durationSeconds: number;
}

export interface AiCapabilities {
  label: string;
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
  fallback: AiReaderFallback;
}

export const AI_FILE_TYPES: readonly AiFileType[];
export const AI_FILE_LABELS: Record<string, string>;
export const AI_READ_KINDS: readonly AiReadKind[];
export const AI_FALLBACKS: readonly AiReaderFallback[];
export const AI_FILE_READERS: Readonly<Record<AiFileType, AiFileReader>>;
/** Shown for a file type this registry has no row for, so no UI falls back to "no access". */
export const UNKNOWN_AI_FILE_REASON: string;
export const AI_TEXT_EXTENSIONS: RegExp;
export const AI_CAPTION_EXTENSIONS: RegExp;
export const AI_MEDIA_EXTENSIONS: RegExp;

export const aiReaderFor: (type: string | null | undefined) => AiFileReader;
export const aiReaderLabel: (type: string | null | undefined) => string;
export const aiReaderReason: (type: string | null | undefined) => string;
export const aiTypeHasReadPath: (type: string | null | undefined) => boolean;
export const googleFileIdFromUrl: (rawUrl: unknown) => string;
export const isGoogleFileUrl: (rawUrl: unknown) => boolean;
export const practiceSetToText: (questions: unknown) => string;
export const mindMapToText: (mind: unknown) => string;
export const aiPayloadText: (resource: unknown) => string;
export const aiCaptionUrl: (resource: unknown) => string;
export const aiReadPlan: (resource: unknown) => AiReadPlan;
export const parseCaptionText: (raw: unknown) => AiCaptionParse;
export const aiCapabilitiesFor: (type: string | null | undefined) => AiCapabilities;
