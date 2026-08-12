export type CourseAccessLevel = "included" | "paidUpdate" | "hidden";
export type CourseFileType = "youtube" | "video" | "audio" | "pdf" | "doc" | "sheet" | "ebook" | "image" | "google_form" | "embed" | "mindmap";

export interface CourseAccessMeta {
  accessLevel?: CourseAccessLevel;
  paidUpdateId?: string;
  paidUpdateTitle?: string;
  paidUpdatePrice?: string;
  paidUpdateCoinPrice?: number;
}

export interface CourseFile extends CourseAccessMeta {
  id: string;
  name: string;
  type: CourseFileType;
  url?: string;
  embedUrl?: string;
  youtubeUrl?: string;
  youtubeVideoId?: string;
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
