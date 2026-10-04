// utils/excalidrawLibraryLink.d.ts — the typed face of utils/excalidrawLibraryLink.js.

export const EXCALIDRAW_LIBRARY_LINK_KEY: "eduvora.excalidrawLibraryLink.v1";
export const EXCALIDRAW_LIBRARY_ALLOWED_HOSTS: Array<{ host: string; path: string }>;

export interface ExcalidrawLibraryLink {
  libraryUrl: string;
  idToken: string | null;
  capturedAt: number;
}

export function isAllowedExcalidrawLibraryUrl(value: unknown): boolean;
export function parseExcalidrawLibraryLink(search: unknown, hash: unknown): { libraryUrl: string; idToken: string | null; capturedAt: number } | null;
export function storeExcalidrawLibraryLink(storage: Storage | null | undefined, link: { libraryUrl: unknown; idToken?: unknown } | null | undefined): boolean;
export function readStoredExcalidrawLibraryLink(storage: Storage | null | undefined): ExcalidrawLibraryLink | null;
export function clearStoredExcalidrawLibraryLink(storage: Storage | null | undefined): void;
export function lastRecordedRoute(storage: Storage | null | undefined, routeHistoryKey: string): string;
export function captureExcalidrawLibraryReturn(options?: {
  pathname?: string;
  search?: string;
  hash?: string;
  storage?: Storage | null;
  replace?: ((url: string) => void) | null;
  fallbackRoute?: string;
  routeHistoryKey?: string;
}): (ExcalidrawLibraryLink & { nextUrl: string }) | null;
