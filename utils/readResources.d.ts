import type { ProductModule } from "../src/lib/admin/types";
import type { CourseFile, CourseModule } from "../src/types/course";

export type ReadSourceKind = "upload" | "gdrive" | "pdf_url" | "embed_url";
export const READ_PDF_MAX_BYTES: number;
export const READ_PDFJS_VERSION: string;

export function normalizeReadSourceKind(value?: unknown, storagePath?: unknown): ReadSourceKind;
export function buildReadStoragePath(productId: string, resourceId: string, uploadId?: string): string;
export function isOwnedReadUploadPath(value: unknown, productId?: string | null, resourceId?: string | null): boolean;
export function googleDrivePdfUrl(value: unknown): string;
export function normalizeReadResourceUrl(
  value: unknown,
  sourceKind?: ReadSourceKind | string | null,
  options?: { productId?: string | null; resourceId?: string | null; storagePath?: string | null; fileSize?: number | string | null },
): string;
export function readSourceLabel(sourceKind?: ReadSourceKind | string | null): string;
export type ReadResourcePresentation = {
  kind: "pdfjs" | "embed";
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
