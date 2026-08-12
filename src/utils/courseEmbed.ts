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

export const getCourseEmbed = (file: CourseFile): { url: string; kind: "youtube" | "pdf" | "doc" | "sheet" | "slides" | "form" | "drive" | "direct" | "none" } => {
  const raw = getCourseFileUrl(file);
  if (file.type === "youtube" || file.youtubeVideoId || /youtu(?:\.be|be\.com)/i.test(raw)) {
    const id = file.youtubeVideoId || extractYouTubeId(raw);
    return id ? { url: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1&playsinline=1`, kind: "youtube" } : { url: "", kind: "none" };
  }
  const google = googleParts(raw);
  if (file.type === "google_form" || google?.kind === "forms") {
    if (!raw) return { url: "", kind: "none" };
    const separator = raw.includes("?") ? "&" : "?";
    return { url: raw.includes("embedded=true") ? raw : `${raw}${separator}embedded=true`, kind: "form" };
  }
  if (google?.kind === "document") return { url: `https://docs.google.com/document/d/${google.id}/preview`, kind: "doc" };
  if (google?.kind === "spreadsheets") return { url: `https://docs.google.com/spreadsheets/d/${google.id}/preview?widget=true&headers=false`, kind: "sheet" };
  if (google?.kind === "presentation") return { url: `https://docs.google.com/presentation/d/${google.id}/embed?start=false&loop=false&delayms=3000`, kind: "slides" };
  if (google?.kind === "drive") return { url: `https://drive.google.com/file/d/${google.id}/preview`, kind: file.type === "pdf" ? "pdf" : "drive" };
  if (file.type === "pdf" && raw) return { url: raw, kind: "pdf" };
  if ((file.type === "doc" || file.type === "sheet" || file.type === "ebook") && raw) return { url: `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(raw)}`, kind: file.type === "sheet" ? "sheet" : "doc" };
  return raw ? { url: raw, kind: "direct" } : { url: "", kind: "none" };
};

export const getCourseDownload = (file: CourseFile): { url: string; label: string; downloadable: boolean } => {
  const raw = getCourseFileUrl(file);
  const google = googleParts(raw);
  if (google?.kind === "document") return { url: `https://docs.google.com/document/d/${google.id}/export?format=pdf`, label: "Download PDF", downloadable: true };
  if (google?.kind === "spreadsheets") return { url: `https://docs.google.com/spreadsheets/d/${google.id}/export?format=xlsx`, label: "Download XLSX", downloadable: true };
  if (google?.kind === "presentation") return { url: `https://docs.google.com/presentation/d/${google.id}/export/pdf`, label: "Download PDF", downloadable: true };
  if (file.type === "google_form" || google?.kind === "forms") return { url: raw, label: "Open original form", downloadable: false };
  return { url: raw, label: file.type === "link" || file.type === "youtube" ? "Open original" : "Download file", downloadable: !["link", "youtube"].includes(file.type) };
};

export const isPreviewableCourseFile = (file: CourseFile) => {
  const embed = getCourseEmbed(file);
  return Boolean(file.content || file.docPages?.length || embed.url);
};
