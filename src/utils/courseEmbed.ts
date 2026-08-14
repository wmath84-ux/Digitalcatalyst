import type { CourseFile } from "../types/course";

const safeUrl = (value?: string) => {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
};

export const getCourseFileUrl = (file: CourseFile) => safeUrl(file.embedUrl || file.youtubeUrl || file.url);

export const extractYouTubeId = (value = "") => {
  if (fileIdLike(value)) return value;
  try {
    const url = new URL(value);
    if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] || "";
    if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] || "";
    return url.searchParams.get("v") || "";
  } catch {
    return "";
  }
};

const fileIdLike = (value: string) => /^[a-zA-Z0-9_-]{11}$/.test(value.trim());

const googleParts = (value: string) => {
  const url = safeUrl(value);
  if (!url) return null;
  const match = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([^/?#]+)/i);
  if (match) return { kind: match[1].toLowerCase(), id: match[2], url };
  const form = url.match(/docs\.google\.com\/forms\/d\/(?:e\/)?([^/?#]+)/i);
  if (form) return { kind: "forms", id: form[1], url };
  const drive = url.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i) || url.match(/[?&]id=([^&#]+)/i);
  if (drive) return { kind: "drive", id: drive[1], url };
  return null;
};

const whimsicalEmbedUrl = (value: string) => {
  const url = safeUrl(value);
  if (!url) return "";
  const match = url.match(/whimsical\.com\/embed\/([a-km-zA-HJ-NP-Z1-9]{16,22})/i) || url.match(/whimsical\.com\/(?:[a-zA-Z0-9-]+-)?([a-km-zA-HJ-NP-Z1-9]{16,22})(?:@[a-km-zA-HJ-NP-Z1-9]+)?(?:[/?#]|$)/i);
  return match?.[1] ? `https://whimsical.com/embed/${match[1]}` : "";
};

export const getCourseEmbed = (file: CourseFile): { url: string; kind: "youtube" | "pdf" | "doc" | "sheet" | "slides" | "form" | "drive" | "mindmap" | "embed" | "direct" | "none" } => {
  const raw = getCourseFileUrl(file);
  if (file.type === "mindmap" || file.provider === "whimsical_mindmap" || /whimsical\.com/i.test(raw)) {
    const url = whimsicalEmbedUrl(raw);
    return url ? { url, kind: "mindmap" } : { url: "", kind: "none" };
  }
  if (file.type === "youtube" || file.youtubeVideoId || /youtu(?:\.be|be\.com)/i.test(raw)) {
    const id = file.youtubeVideoId || extractYouTubeId(raw);
    return id ? { url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1&playsinline=1&controls=1&fs=1`, kind: "youtube" } : { url: "", kind: "none" };
  }
  const google = googleParts(raw);
  if (file.type === "google_form" || google?.kind === "forms") {
    if (!raw) return { url: "", kind: "none" };
    const viewUrl = raw.replace(/\/edit(?:\?.*)?$/i, "/viewform");
    const separator = viewUrl.includes("?") ? "&" : "?";
    return { url: viewUrl.includes("embedded=true") ? viewUrl : `${viewUrl}${separator}embedded=true`, kind: "form" };
  }
  if (google?.kind === "document") return { url: `https://docs.google.com/document/d/${google.id}/preview`, kind: "doc" };
  if (google?.kind === "spreadsheets") return { url: `https://docs.google.com/spreadsheets/d/${google.id}/preview?widget=true&headers=false`, kind: "sheet" };
  if (google?.kind === "presentation") return { url: `https://docs.google.com/presentation/d/${google.id}/embed?start=false&loop=false&delayms=3000`, kind: "slides" };
  if (google?.kind === "drive") return { url: `https://drive.google.com/file/d/${google.id}/preview`, kind: file.type === "pdf" ? "pdf" : "drive" };
  if (file.type === "pdf" && raw) return { url: raw, kind: "pdf" };
  if (file.type === "ebook" && raw) {
    // PDF e-books render natively (Chrome's built-in PDF viewer);
    // EPUB / other formats fall back to the Google Docs viewer.
    return /\.pdf(?:[?#]|$)/i.test(raw)
      ? { url: raw, kind: "pdf" }
      : { url: `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(raw)}`, kind: "doc" };
  }
  if (file.type === "slides" && raw) {
    // A first-class "slides" file whose URL isn't a Google
    // presentation (handled above) renders directly in the frame.
    return { url: raw, kind: "slides" };
  }
  if ((file.type === "doc" || file.type === "sheet") && raw) return { url: `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(raw)}`, kind: file.type === "sheet" ? "sheet" : "doc" };
  if (file.type === "embed" && raw) return { url: raw, kind: "embed" };
  return raw ? { url: raw, kind: "direct" } : { url: "", kind: "none" };
};

/**
 * Extension carried by the URL itself, e.g. ".../notes.pdf?x=1" → "pdf".
 * Used so a direct file always downloads under its own real format.
 */
const urlExtension = (value: string) => {
  try {
    const pathname = new URL(value).pathname;
    const match = pathname.match(/\.([a-z0-9]{1,8})$/i);
    return match ? match[1].toLowerCase() : "";
  } catch {
    return "";
  }
};

/** Strip any existing extension so we never produce "report.pdf.pdf". */
const baseName = (name: string) => String(name || "file").replace(/\.[a-z0-9]{1,8}$/i, "").trim() || "file";

/** `name` + the correct extension for the format actually being downloaded. */
export const downloadFileName = (name: string, extension: string) =>
  extension ? `${baseName(name)}.${extension}` : baseName(name);

export interface CourseDownload {
  url: string;
  label: string;
  downloadable: boolean;
  /** Real format of the bytes behind `url` (file extension, no dot). */
  extension: string;
  /** Suggested filename including that extension. */
  fileName: string;
}

/**
 * Resolve the download for a course file in its EXACT / native format.
 *
 * Google files export to their own editable format rather than being
 * flattened to PDF, so what lands on disk matches what the learner saw:
 *
 *   - Google Doc    → .docx
 *   - Google Sheet  → .xlsx
 *   - Google Slides → .pptx
 *   - Drive file    → the stored bytes, untouched
 *   - Direct file   → the original URL, keeping its own extension
 *
 * The filename always carries the matching extension, which also fixes
 * downloads that previously landed as an extension-less blob.
 */
export const getCourseDownload = (file: CourseFile): CourseDownload => {
  const raw = getCourseFileUrl(file);
  const google = googleParts(raw);
  const build = (url: string, label: string, downloadable: boolean, extension: string): CourseDownload =>
    ({ url, label, downloadable, extension, fileName: downloadFileName(file.name, extension) });

  if (google?.kind === "document") return build(`https://docs.google.com/document/d/${google.id}/export?format=docx`, "Download DOCX", true, "docx");
  if (google?.kind === "spreadsheets") return build(`https://docs.google.com/spreadsheets/d/${google.id}/export?format=xlsx`, "Download XLSX", true, "xlsx");
  if (google?.kind === "presentation") return build(`https://docs.google.com/presentation/d/${google.id}/export/pptx`, "Download PPTX", true, "pptx");
  if (google?.kind === "drive") return build(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(google.id)}`, "Download file", true, urlExtension(raw));
  if (file.type === "google_form" || google?.kind === "forms") return build(raw, "Open original form", false, "");
  if (file.type === "mindmap" || file.type === "embed" || file.type === "youtube") return build(raw, "Open original", false, "");

  // Direct file — keep whatever format it already is.
  const extension = urlExtension(raw) || (file.type === "pdf" ? "pdf" : "");
  return build(raw, extension ? `Download ${extension.toUpperCase()}` : "Download file", true, extension);
};

export const isPreviewableCourseFile = (file: CourseFile) => Boolean(getCourseEmbed(file).url);
