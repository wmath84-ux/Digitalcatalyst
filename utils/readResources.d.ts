import type { ProductModule } from "../src/lib/admin/types";
import type { CourseFile, CourseModule } from "../src/types/course";

export type ReadSourceKind = "upload" | "gdrive" | "pdf_url" | "embed_url";
export const READ_PDF_MAX_BYTES: number;
export const READ_PDFJS_VERSION: string;

export function normalizeReadSourceKind(value?: unknown, storagePath?: unknown): ReadSourceKind;
export function buildReadStoragePath(productId: string, resourceId: string, uploadId?: string): string;
export function isOwnedReadUploadPath(value: unknown, productId?: string | null, resourceId?: string | null): boolean;
/** The learner's own Memory tree: `userReadUploads/{uid}/{uploadId}-{slug}.pdf`. */
export function isOwnedLearnerReadUploadPath(value: unknown): boolean;
/** PDF bytes URL for a Drive file — downloads/exports only (never the reader). */
export function googleDrivePdfUrl(value: unknown): string;
/** Drive's embeddable `/preview` viewer URL, used by the Read reader. */
export function googleDrivePreviewUrl(value: unknown): string;
export function normalizeReadResourceUrl(
  value: unknown,
  sourceKind?: ReadSourceKind | string | null,
  options?: { productId?: string | null; resourceId?: string | null; storagePath?: string | null; fileSize?: number | string | null },
): string;
export function readSourceLabel(sourceKind?: ReadSourceKind | string | null): string;
export type ReadResourcePresentation = {
  kind: "pdfjs" | "embed" | "drive";
  sourceKind: ReadSourceKind;
  sourceUrl: string;
  originalUrl: string;
  label: string;
};
export function getReadResourcePresentation(
  resource: (CourseFile & { readSourceKind?: ReadSourceKind; readStoragePath?: string; readFileName?: string; readFileSize?: number }) | Record<string, unknown> | null | undefined,
  options?: { productId?: string | null },
): ReadResourcePresentation | null;
export function collectReadUploadPaths(modules: ProductModule[], productId: string): Set<string>;
export function sanitizeReadUploadsForProduct(modules: ProductModule[], productId: string): ProductModule[];
export type AccessibleReadResource = {
  id: string;
  resource: CourseFile & { readSourceKind?: ReadSourceKind; readStoragePath?: string; readFileName?: string; readFileSize?: number };
  modulePath: string[];
  presentation: ReadResourcePresentation;
};
export function collectAccessibleReadResources(
  modules: CourseModule[],
  unlockedModuleIds: Set<string>,
  ownedUpdateIds: Set<string>,
  productId?: string | null,
): AccessibleReadResource[];
