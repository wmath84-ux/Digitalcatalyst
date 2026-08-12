export type CourseAccessLevel = "included" | "paidUpdate" | "hidden";
export type CourseFileType = "youtube" | "video" | "audio" | "pdf" | "doc" | "sheet" | "link" | "ebook" | "quiz" | "image" | "google_form";

export interface CourseAccessMeta {
  accessLevel?: CourseAccessLevel;
  paidUpdateId?: string;
  paidUpdateTitle?: string;
  paidUpdatePrice?: string;
  paidUpdateCoinPrice?: number;
}

export interface CourseDocPage {
  id: string;
  title: string;
  content: string;
}

export interface CourseFile extends CourseAccessMeta {
  id: string;
  name: string;
  type: CourseFileType;
  url?: string;
  embedUrl?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  content?: string;
  docPages?: CourseDocPage[];
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
