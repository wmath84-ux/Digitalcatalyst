// utils/readUploads.d.ts — the typed face of utils/readUploads.js.

export const READ_UPLOAD_COLLECTION: "readUploads";
export const READ_UPLOAD_STORAGE_ROOT: "userReadUploads";
export const READ_UPLOAD_MAX_BYTES: number;
export const READ_UPLOAD_NAME_MAX: number;
export const READ_UPLOAD_MODULE_MAX: number;
export const READ_UPLOAD_URL_MAX: number;
export const READ_UPLOAD_PATH_MAX: number;
export const READ_UPLOAD_PAGE_MAX: number;
export const READ_UPLOAD_ANNOTATION_MAX: number;

/** One row of the learner's own Read library. */
export interface ReadUpload {
  id: string;
  uid: string;
  name: string;
  /** "" = the default group; otherwise the learner-made module name. */
  module: string;
  /** "" = no submodule; otherwise a folder under `module`. */
  submodule: string;
  storagePath: string;
  url: string;
  sizeBytes: number;
  pageCount: number;
  lastPage: number;
  hasAnnotations: boolean;
  annotationCount: number;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  annotatedAt: number;
}

export interface ReadUploadInput {
  uid?: unknown;
  uploadId?: unknown;
  name?: unknown;
  module?: unknown;
  submodule?: unknown;
  storagePath?: unknown;
  url?: unknown;
  sizeBytes?: unknown;
  pageCount?: unknown;
  lastPage?: unknown;
  hasAnnotations?: unknown;
  annotationCount?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastOpenedAt?: unknown;
  annotatedAt?: unknown;
}

export function readUploadFileNameSlug(value: unknown, fallback?: string): string;
export function createReadUploadId(seed?: unknown): string;
export function isReadUploadId(value: unknown): boolean;
export function sanitizeReadUploadName(value: unknown, fallback?: string): string;
export function sanitizeReadUploadModule(value: unknown): string;
export function sanitizeReadUploadSubmodule(value: unknown): string;
export function buildReadUploadStoragePath(uid: unknown, uploadId: unknown, fileName?: unknown): string;
export function isOwnedReadUploadPath(value: unknown, uid: unknown): boolean;
export function isReadUploadFile(file: { size?: number; type?: string; name?: string } | null | undefined): boolean;
export const READ_UPLOAD_HEADER_BYTES: number;
export function isPdfHeader(bytes: ArrayBuffer | ArrayBufferView | null | undefined): boolean;
export function readUploadFileIssue(file: { size?: number; type?: string; name?: string } | null | undefined): string;
export function toFirestoreReadUpload(input?: ReadUploadInput): Record<string, unknown>;
export function parseReadUploadDoc(raw: Record<string, unknown> | null | undefined, uidHint?: string): ReadUpload | null;
export function sortReadUploads(uploads: ReadUpload[]): ReadUpload[];
export function groupReadUploads(uploads: ReadUpload[]): Array<{
  module: string;
  items: ReadUpload[];
  submodules: Array<{ submodule: string; items: ReadUpload[] }>;
}>;
export function groupReadUploadSubmodules(uploads: ReadUpload[]): Array<{ submodule: string; items: ReadUpload[] }>;
export function readUploadModuleNames(uploads: ReadUpload[]): string[];
export function formatReadUploadSize(bytes: unknown): string;
export function readUploadMetaLabel(doc: Partial<ReadUpload> | null | undefined): string;
export function readUploadPageLabel(doc: Partial<ReadUpload> | null | undefined): string;
export function readUploadSyncLabel(state: string): string;
/** A learner upload as a My Study Library `read` resource draft ("" when unusable). */
export function readUploadModuleDraft(row: Partial<ReadUpload> | null | undefined): {
  name: string;
  type: "read";
  url: string;
  description: string;
  readSourceKind: "upload";
  readStoragePath: string;
  readFileName: string;
  readFileSize: number;
} | null;
