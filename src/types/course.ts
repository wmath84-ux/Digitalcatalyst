export type LessonType = "video" | "quiz" | "reading";

export interface Lesson {
  id: string;
  title: string;
  duration: string;
  durationSec: number;
  type: LessonType;
  completed: boolean;
  locked: boolean;
}

export interface Module {
  id: string;
  title: string;
  lessons: Lesson[];
}

export interface Resource {
  id: string;
  name: string;
  type: "pdf" | "drive" | "zip" | "link";
  size: string;
  lessonId: string;
}

export interface Note {
  id: string;
  lessonId: string;
  text: string;
  timestamp: string;
  createdAt: number;
}

export interface Reply {
  id: string;
  author: string;
  avatarColor: string;
  text: string;
  timeAgo: string;
}

export interface Question {
  id: string;
  lessonId: string;
  author: string;
  avatarColor: string;
  text: string;
  timeAgo: string;
  likes: number;
  liked: boolean;
  replies: Reply[];
}
