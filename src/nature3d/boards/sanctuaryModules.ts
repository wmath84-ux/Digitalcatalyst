// src/nature3d/boards/sanctuaryModules.ts
//
// Sanctuary's own module-create function. Storage, types and the Course
// Player are the SAME system as My Study Library (`users/{uid}/myCourses`)
// — a module built here is a real `MyCourse` with one module and one
// resource, so it shows on the reading board AND opens the dedicated
// `#/my-course/<id>` player. The UI around it (the tray dropdown) is
// sanctuary-only; the document it writes is not.

import type { ComponentType } from "react";
import {
  BookOpen, Brain, FileText, Globe2, GraduationCap, Image as ImageIcon,
  Music2, Network, Play, Presentation, Sheet, Video,
} from "lucide-react";
import {
  createMyCourse,
  createMyModule,
  createMyQuestion,
  createMyResource,
  saveMyCourse,
  uploadMyCourseResourceFile,
} from "../../lib/myCourseClient";
import type { CourseFileType } from "../../types/course";
import {
  MY_COURSE_TITLE_MAX,
  MY_RESOURCE_NAME_MAX,
  type MyCourse,
  type MyCourseResourceType,
} from "../../types/myCourse";

export type SanctuaryModuleType = MyCourseResourceType;

export type SanctuaryModuleTypeOption = {
  id: SanctuaryModuleType;
  label: string;
  short: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  upload?: boolean;
  needsUrl?: boolean;
  hint: string;
  accept?: string;
};

/** Every file type the Study Library builder accepts — same vocabulary. */
export const SANCTUARY_MODULE_TYPES: SanctuaryModuleTypeOption[] = [
  { id: "youtube", label: "YouTube", short: "YT", icon: Play, needsUrl: true, hint: "Paste any YouTube link" },
  { id: "video", label: "Video", short: "Vid", icon: Video, upload: true, hint: "Upload or paste a video URL", accept: "video/*" },
  { id: "audio", label: "Audio", short: "Aud", icon: Music2, upload: true, hint: "Upload or paste an audio URL", accept: "audio/*" },
  { id: "pdf", label: "PDF", short: "PDF", icon: FileText, upload: true, hint: "Upload a PDF or paste its link", accept: "application/pdf,.pdf" },
  { id: "doc", label: "Google Doc", short: "Doc", icon: BookOpen, needsUrl: true, hint: "Google Docs link" },
  { id: "sheet", label: "Sheet", short: "Sheet", icon: Sheet, needsUrl: true, hint: "Google Sheets link" },
  { id: "slides", label: "Slides", short: "Slides", icon: Presentation, needsUrl: true, hint: "Google Slides link" },
  { id: "image", label: "Image", short: "Img", icon: ImageIcon, upload: true, hint: "Upload an image or paste its URL", accept: "image/*" },
  { id: "google_form", label: "Google Form", short: "Form", icon: FileText, needsUrl: true, hint: "Forms link" },
  { id: "embed", label: "Website", short: "Web", icon: Globe2, needsUrl: true, hint: "Any https page" },
  { id: "ebook", label: "E-book", short: "Book", icon: GraduationCap, upload: true, hint: "PDF / EPUB file or link", accept: ".pdf,.epub,application/pdf,application/epub+zip" },
  { id: "mindmap", label: "Mind map", short: "Map", icon: Network, needsUrl: true, hint: "Whimsical board link" },
  { id: "brain", label: "Brain MCQ", short: "Brain", icon: Brain, hint: "A practice set — opens in the Course Player" },
];

export const sanctuaryModuleType = (id: SanctuaryModuleType): SanctuaryModuleTypeOption =>
  SANCTUARY_MODULE_TYPES.find((option) => option.id === id) || SANCTUARY_MODULE_TYPES[0];

/** Same player route My Study Library uses — one system, two doors. */
export const sanctuaryModulePlayHash = (courseId: string): string =>
  `#/my-course/${encodeURIComponent(courseId)}`;

export const inferSanctuaryModuleType = (url: string, file?: File | null): SanctuaryModuleType => {
  if (file) {
    const mime = (file.type || "").toLowerCase();
    const name = (file.name || "").toLowerCase();
    if (mime.startsWith("video/") || /\.(mp4|webm|mov|mkv)$/.test(name)) return "video";
    if (mime.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|aac)$/.test(name)) return "audio";
    if (mime.startsWith("image/") || /\.(jpe?g|png|gif|webp|avif)$/.test(name)) return "image";
    if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
    if (name.endsWith(".epub")) return "ebook";
    return "embed";
  }
  const href = url.trim().toLowerCase();
  if (/youtu\.be\/|youtube\.com\//.test(href)) return "youtube";
  if (/docs\.google\.com\/document/.test(href)) return "doc";
  if (/docs\.google\.com\/spreadsheets/.test(href)) return "sheet";
  if (/docs\.google\.com\/presentation/.test(href)) return "slides";
  if (/docs\.google\.com\/forms|forms\.gle\//.test(href)) return "google_form";
  if (/whimsical\.com\//.test(href)) return "mindmap";
  if (/\.pdf(\?|$)/.test(href)) return "pdf";
  if (/\.(mp4|webm|mov)(\?|$)/.test(href)) return "video";
  if (/\.(mp3|wav|m4a)(\?|$)/.test(href)) return "audio";
  if (/\.(png|jpe?g|gif|webp)(\?|$)/.test(href)) return "image";
  return "embed";
};

const asHttpsUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export interface CreateSanctuaryModuleInput {
  uid: string;
  title: string;
  type: SanctuaryModuleType;
  url?: string;
  file?: File | null;
}

/**
 * Build and persist one sanctuary module as a My Study Library course.
 * One module, one resource — the Course Player and the reading board both
 * consume that tree unchanged.
 */
export async function createSanctuaryModule(input: CreateSanctuaryModuleInput): Promise<MyCourse> {
  const uid = String(input.uid || "").trim();
  if (!uid) throw new Error("Please sign in to create a module.");

  const title = String(input.title || "").trim().slice(0, MY_COURSE_TITLE_MAX);
  if (!title) throw new Error("Give the module a name.");

  const option = sanctuaryModuleType(input.type);
  const file = input.file || null;
  const url = asHttpsUrl(input.url || "");

  if (option.needsUrl && !file && !url) {
    throw new Error(option.hint || "Paste a link for this type.");
  }
  if (!option.upload && file) {
    throw new Error("This type takes a link, not a file.");
  }
  if (option.id !== "brain" && !url && !file) {
    throw new Error("Paste a URL or choose a file.");
  }

  const course = createMyCourse(uid, title);
  const module = createMyModule(title);
  const resource = createMyResource(option.id);
  resource.name = title.slice(0, MY_RESOURCE_NAME_MAX);

  if (file) {
    const uploaded = await uploadMyCourseResourceFile(uid, course.id, file);
    resource.url = uploaded.url;
    resource.fileName = uploaded.fileName;
    resource.size = uploaded.size;
    resource.source = "upload";
  } else if (url) {
    resource.url = url;
    resource.source = "link";
  }

  if (option.id === "brain") {
    const question = createMyQuestion();
    question.prompt = "Question 1";
    question.options = ["Option A", "Option B", "Option C", "Option D"];
    question.correctIndex = 0;
    resource.practiceTitle = title;
    resource.practiceQuestions = [question];
  }

  module.resources = [resource];
  course.modules = [module];
  course.description = "Created in the 3D Sanctuary";

  await saveMyCourse(uid, course);
  return course;
}
