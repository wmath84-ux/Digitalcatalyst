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

/**
 * Google Form → an URL that always stays INSIDE our iframe.
 *
 * Two things have to be true, otherwise submitting the form escapes the
 * Course Player and the learner lands on a bare Google page with no course
 * header and no mark-complete footer:
 *
 *   1. `/viewform` (never `/edit`, never `/formResponse`) — an edit link is
 *      not viewable by a learner and the response endpoint is a POST target.
 *   2. `embedded=true` — this is what switches Google Forms into its embedded
 *      renderer. Without it the page carries `<base target="_top">`, so the
 *      Submit button asks the BROWSER to replace the whole app (or, in an
 *      installed PWA, to open a chrome-less window). With it, the submit and
 *      the "Your response has been recorded" confirmation both render in the
 *      same frame, so our header and footer never disappear.
 *
 * Every existing query parameter is preserved (`usp=sf_link`, prefills, …).
 */
export const getGoogleFormEmbedUrl = (value: string) => {
  const safe = safeUrl(value);
  if (!safe) return "";
  let url: URL;
  try {
    url = new URL(safe);
  } catch {
    return "";
  }
  // Short links (forms.gle/abc) can't be rewritten client-side — Google
  // redirects them to the real /viewform, which already honours the flag we
  // append here.
  if (/(^|\.)forms\.gle$/i.test(url.hostname)) {
    url.searchParams.set("embedded", "true");
    return url.toString();
  }
  // /edit, /edit#responses, /formResponse, /closedform → the viewable form.
  url.pathname = url.pathname
    .replace(/\/(edit|formResponse|closedform|viewanalytics|viewscore)\/?$/i, "/viewform")
    .replace(/\/+$/, "");
  if (!/\/viewform$/i.test(url.pathname) && /\/forms\//i.test(url.pathname)) {
    url.pathname = `${url.pathname}/viewform`;
  }
  url.searchParams.set("embedded", "true");
  // A hash such as #responses belongs to the editor, not to the learner view.
  url.hash = "";
  return url.toString();
};

const whimsicalEmbedUrl = (value: string) => {
  const url = safeUrl(value);
  if (!url) return "";
  const match = url.match(/whimsical\.com\/embed\/([a-km-zA-HJ-NP-Z1-9]{16,22})/i) || url.match(/whimsical\.com\/(?:[a-zA-Z0-9-]+-)?([a-km-zA-HJ-NP-Z1-9]{16,22})(?:@[a-km-zA-HJ-NP-Z1-9]+)?(?:[/?#]|$)/i);
  return match?.[1] ? `https://whimsical.com/embed/${match[1]}` : "";
};

/**
 * Which rendering the remote host should serve.
 *
 *   · "desktop" — the host's full-width page (what a desktop browser gets).
 *   · "mobile"  — the host's own phone rendering, where text REFLOWS to the
 *                 frame width instead of being a shrunken desktop page.
 *
 * This matters because narrowing an iframe does nothing for Google Docs:
 * `/preview` is a fixed-width paginated renderer, so a narrow frame just
 * scales the same desktop page down and the text gets SMALLER, not bigger.
 * The readable rendering is a different Google endpoint entirely.
 */
export type CourseEmbedViewport = "desktop" | "mobile";

/**
 * Which experience the frame should load for a native Google file.
 *
 *   · "preview" — the read-only rendering (default; what learners see).
 *   · "edit"    — the FULL Google editor (`/edit`): complete toolbar,
 *                 menus, comments, revision history — everything Google
 *                 Docs / Sheets / Slides offers. This is the real editor
 *                 page loaded inside our frame, not a stripped preview.
 *
 * Edit mode has two hard external requirements that no client code can
 * bypass (they are Google's rules, not ours):
 *
 *   1. The document must be editable by the viewer: either shared as
 *      "Anyone with the link → Editor", or the learner is signed in to a
 *      Google account that has edit permission on the file.
 *   2. The browser must allow Google sign-in cookies inside iframes
 *      (blocking third-party cookies makes Google show a sign-in screen).
 */
export type CourseEmbedMode = "preview" | "edit";

export interface CourseEmbedOptions {
  viewport?: CourseEmbedViewport;
  mode?: CourseEmbedMode;
}

export type CourseEmbedKind = "youtube" | "pdf" | "doc" | "sheet" | "slides" | "form" | "drive" | "mindmap" | "embed" | "direct" | "none";

/** Kinds whose layout the desktop/mobile switch can actually change. */
export const VIEWPORT_AWARE_KINDS: CourseEmbedKind[] = ["doc", "sheet", "slides", "form", "drive", "pdf", "embed", "mindmap"];

/**
 * True when the host serves its OWN reflowing mobile rendering for this file,
 * so the frame should stay full width and simply load that endpoint.
 *
 * For everything else (Slides, Drive/PDF, arbitrary embeds) there is no mobile
 * endpoint, so the only lever left is to hand the host a narrow CSS viewport
 * and scale the result back up — see `MOBILE_VIEWPORT_WIDTH` in the viewer.
 */
export const hasNativeMobileRendering = (kind: CourseEmbedKind) => kind === "doc" || kind === "sheet" || kind === "form";

/**
 * True when this file can open in Google's own full editor inside the
 * player (native Google Docs / Sheets / Slides link). Forms and Drive
 * binaries have no in-place editor endpoint.
 */
export const isEditableGoogleFile = (file: CourseFile): boolean => {
  const google = googleParts(getCourseFileUrl(file));
  return google?.kind === "document" || google?.kind === "spreadsheets" || google?.kind === "presentation";
};

/**
 * The full Google editor URL for a native Google file — complete toolbar
 * and menus, exactly as on docs.google.com. `rm=embedded` asks Google for
 * its embed-friendly chrome (it keeps the whole toolbar; it only drops the
 * outer Drive navigation bar so the editor fits our stage).
 */
export const getGoogleEditorUrl = (file: CourseFile): string => {
  const google = googleParts(getCourseFileUrl(file));
  if (!google) return "";
  if (google.kind === "document") return `https://docs.google.com/document/d/${google.id}/edit?rm=embedded&widget=true`;
  if (google.kind === "spreadsheets") return `https://docs.google.com/spreadsheets/d/${google.id}/edit?rm=embedded&widget=true`;
  if (google.kind === "presentation") return `https://docs.google.com/presentation/d/${google.id}/edit?rm=embedded&widget=true`;
  return "";
};

export const getCourseEmbed = (file: CourseFile, options: CourseEmbedOptions = {}): { url: string; kind: CourseEmbedKind } => {
  const mobile = options.viewport === "mobile";
  const editMode = options.mode === "edit";
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
  if (file.type === "google_form" || google?.kind === "forms" || /(^|\/\/)forms\.gle\//i.test(raw)) {
    const url = getGoogleFormEmbedUrl(raw);
    return url ? { url, kind: "form" } : { url: "", kind: "none" };
  }
  // Edit mode — the FULL Google editor (toolbar, menus, comments, the
  // works) loaded in-frame via `/edit?rm=embedded`. The learner needs
  // edit permission on the file; the viewer surfaces a friendly fallback
  // when Google refuses (see ResourceViewer's edit-mode help panel).
  if (editMode && google?.kind === "document") return { url: `https://docs.google.com/document/d/${google.id}/edit?rm=embedded&widget=true`, kind: "doc" };
  if (editMode && google?.kind === "spreadsheets") return { url: `https://docs.google.com/spreadsheets/d/${google.id}/edit?rm=embedded&widget=true`, kind: "sheet" };
  if (editMode && google?.kind === "presentation") return { url: `https://docs.google.com/presentation/d/${google.id}/edit?rm=embedded&widget=true`, kind: "slides" };
  // `/preview` is a fixed-width paginated renderer — on a phone it is a
  // shrunken A4 page. `/mobilebasic` is Google's own reflowing mobile
  // rendering of the SAME document: real phone-sized text, no zooming.
  if (google?.kind === "document") return { url: `https://docs.google.com/document/d/${google.id}/${mobile ? "mobilebasic" : "preview"}`, kind: "doc" };
  if (google?.kind === "spreadsheets") return { url: mobile ? `https://docs.google.com/spreadsheets/d/${google.id}/htmlview` : `https://docs.google.com/spreadsheets/d/${google.id}/preview?widget=true&headers=false`, kind: "sheet" };
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
