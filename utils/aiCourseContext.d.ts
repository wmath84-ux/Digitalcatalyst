export interface CourseKnowledgeItem {
  fileId: string;
  fileName: string;
  fileType: string;
  kind: 'docs' | 'quiz';
  modulePath: string;
  text: string;
  hasText: boolean;
}

export interface CoursePromptContextOptions {
  scopeFileId?: string | null;
  maxTotalChars?: number;
  maxFileChars?: number;
}

export declare const AI_COURSE_DOC_TYPES: string[];
export declare const AI_COURSE_KNOWLEDGE_TYPES: string[];
export declare function stripHtmlToPlainText(html: string | null | undefined): string;
export declare function collectCourseKnowledgeItems(modules: unknown, parentPath?: string[]): CourseKnowledgeItem[];
export declare function buildCoursePromptContext(items: CourseKnowledgeItem[] | unknown, options?: CoursePromptContextOptions): string;
export declare function buildStarterPrompts(items: CourseKnowledgeItem[] | unknown, count?: number): string[];
