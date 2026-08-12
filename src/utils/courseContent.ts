import type { CourseFile, CourseFileType, CourseModule } from "../types/course";

const URL_TYPES = new Set<CourseFileType>(["youtube", "video", "audio", "pdf", "doc", "sheet", "ebook", "image", "google_form", "embed", "mindmap"]);
const httpsUrl = (value: unknown) => {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" || /(?:firebasestorage\.googleapis\.com|storage\.googleapis\.com)$/i.test(url.hostname)) return "";
    return text;
  } catch { return ""; }
};

export const sanitizeUrlOnlyCourseContent = (modules: unknown): CourseModule[] => {
  if (!Array.isArray(modules)) return [];
  return modules.map((source): CourseModule | null => {
    if (!source || typeof source !== "object") return null;
    const module = source as Record<string, any>;
    const files = (Array.isArray(module.files) ? module.files : []).map((sourceFile: unknown): CourseFile | null => {
      if (!sourceFile || typeof sourceFile !== "object") return null;
      const file = sourceFile as Record<string, any>;
      const legacyType = String(file.type || "");
      const type = (legacyType === "link" ? "embed" : legacyType) as CourseFileType;
      if (!URL_TYPES.has(type)) return null;
      const url = httpsUrl(file.embedUrl || file.youtubeUrl || file.url);
      const youtubeVideoId = String(file.youtubeVideoId || "").trim();
      if (!url && !(type === "youtube" && youtubeVideoId)) return null;
      return {
        id: String(file.id || crypto.randomUUID()), name: String(file.name || "Embedded resource"), type,
        url: httpsUrl(file.url) || url, embedUrl: httpsUrl(file.embedUrl) || undefined,
        youtubeUrl: httpsUrl(file.youtubeUrl) || undefined, youtubeVideoId: youtubeVideoId || undefined,
        size: Number(file.size || 0) || undefined, contentType: String(file.contentType || "") || undefined,
        provider: type === "mindmap" ? "whimsical_mindmap" : String(file.provider || "") || undefined,
        accessLevel: file.accessLevel, paidUpdateId: file.paidUpdateId, paidUpdateTitle: file.paidUpdateTitle,
        paidUpdatePrice: file.paidUpdatePrice, paidUpdateCoinPrice: Number(file.paidUpdateCoinPrice || 0),
      };
    }).filter((file): file is CourseFile => Boolean(file));
    const embedContentUrl = httpsUrl(module.embedContentUrl);
    return {
      id: String(module.id || crypto.randomUUID()), title: String(module.title || "Course module"), files,
      modules: sanitizeUrlOnlyCourseContent(module.modules),
      embedContentTypeId: embedContentUrl ? String(module.embedContentTypeId || "github_page") : undefined,
      embedContentTypeLabel: embedContentUrl ? String(module.embedContentTypeLabel || "Embedded resource") : undefined,
      embedContentUrl: embedContentUrl || undefined,
      accessLevel: module.accessLevel, paidUpdateId: module.paidUpdateId, paidUpdateTitle: module.paidUpdateTitle,
      paidUpdatePrice: module.paidUpdatePrice, paidUpdateCoinPrice: Number(module.paidUpdateCoinPrice || 0),
    };
  }).filter((module): module is CourseModule => Boolean(module));
};
