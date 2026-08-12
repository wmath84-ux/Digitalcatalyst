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
    return id ? { url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1&playsinline=1`, kind: "youtube" } : { url: "", kind: "none" };
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
  if ((file.type === "doc" || file.type === "sheet" || file.type === "ebook") && raw) return { url: `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(raw)}`, kind: file.type === "sheet" ? "sheet" : "doc" };
  if (file.type === "embed" && raw) return { url: raw, kind: "embed" };
  return raw ? { url: raw, kind: "direct" } : { url: "", kind: "none" };
};

export const getCourseDownload = (file: CourseFile): { url: string; label: string; downloadable: boolean } => {
  const raw = getCourseFileUrl(file);
  const google = googleParts(raw);
  if (google?.kind === "document") return { url: `https://docs.google.com/document/d/${google.id}/export?format=pdf`, label: "Download PDF", downloadable: true };
  if (google?.kind === "spreadsheets") return { url: `https://docs.google.com/spreadsheets/d/${google.id}/export?format=xlsx`, label: "Download XLSX", downloadable: true };
  if (google?.kind === "presentation") return { url: `https://docs.google.com/presentation/d/${google.id}/export/pdf`, label: "Download PDF", downloadable: true };
  if (google?.kind === "drive") return { url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(google.id)}`, label: "Download Drive file", downloadable: true };
  if (file.type === "google_form" || google?.kind === "forms") return { url: raw, label: "Open original form", downloadable: false };
  if (file.type === "mindmap" || file.type === "embed" || file.type === "youtube") return { url: raw, label: "Open original", downloadable: false };
  return { url: raw, label: "Download file", downloadable: true };
};

export const isPreviewableCourseFile = (file: CourseFile) => Boolean(getCourseEmbed(file).url);
