import Dexie, { type Table } from "dexie";
import {
  createReadUploadId, isPdfHeader, readUploadFileIssue, READ_UPLOAD_HEADER_BYTES,
  READ_UPLOAD_MAX_BYTES, READ_UPLOAD_PAGE_MAX, READ_UPLOAD_ANNOTATION_MAX,
  sanitizeReadUploadName, sanitizeReadUploadModule, sanitizeReadUploadSubmodule,
  type ReadUpload,
} from "../../utils/readUploads.js";
import { localReadReference, parseLocalReadReference } from "../../utils/localReadReference.js";

type LocalPdf = ReadUpload & { blob: Blob; storageKind: "local" };
class LocalReadDb extends Dexie {
  pdfs!: Table<LocalPdf, [string, string]>;
  constructor() {
    super("eduvora-read-pdfs");
    this.version(1).stores({ pdfs: "[uid+id], uid" });
  }
}
export const localReadDb = new LocalReadDb();
export const localReadAvailable = () => typeof indexedDB !== "undefined";
const metadata = ({ blob: _blob, ...row }: LocalPdf): ReadUpload => row;
const integer = (value: number, max: number, min = 0) => Math.min(max, Math.max(min, Math.trunc(Number(value) || min)));

export async function listLocalReadUploads(uid: string): Promise<ReadUpload[]> {
  if (!localReadAvailable()) return [];
  return (await localReadDb.pdfs.where("uid").equals(uid).toArray()).map(metadata);
}

export async function storeLocalReadPdf(uid: string, file: File, module?: string, submodule?: string): Promise<ReadUpload> {
  const issue = readUploadFileIssue(file);
  if (issue) throw new Error(issue);
  if (!isPdfHeader(await file.slice(0, READ_UPLOAD_HEADER_BYTES).arrayBuffer())) {
    throw new Error("That file does not contain a PDF header. Choose a real PDF.");
  }
  const id = createReadUploadId(`local-${file.name}`);
  const now = Date.now();
  const row: LocalPdf = {
    id, uid, storageKind: "local", url: localReadReference(uid, id), storagePath: "",
    name: sanitizeReadUploadName(file.name), module: sanitizeReadUploadModule(module),
    submodule: sanitizeReadUploadSubmodule(submodule), sizeBytes: file.size,
    pageCount: 0, lastPage: 1, hasAnnotations: false, annotationCount: 0,
    createdAt: now, updatedAt: now, lastOpenedAt: 0, annotatedAt: 0,
    blob: file.slice(0, file.size, "application/pdf"),
  };
  // One atomic record holds bytes AND metadata; a quota failure saves neither.
  await localReadDb.pdfs.add(row);
  return metadata(row);
}

export async function patchLocalReadPdf(uid: string, id: string, patch: Partial<Pick<ReadUpload, "name" | "module" | "lastPage" | "pageCount" | "lastOpenedAt">>): Promise<void> {
  await localReadDb.transaction("rw", localReadDb.pdfs, async () => {
    const row = await localReadDb.pdfs.get([uid, id]);
    if (!row) throw new Error("This local PDF is missing. Import it again on this device.");
    const clean = { ...patch };
    if (clean.name !== undefined) clean.name = sanitizeReadUploadName(clean.name);
    if (clean.module !== undefined) clean.module = sanitizeReadUploadModule(clean.module);
    if (clean.pageCount !== undefined) clean.pageCount = integer(clean.pageCount, READ_UPLOAD_PAGE_MAX);
    if (clean.lastPage !== undefined) clean.lastPage = integer(clean.lastPage, clean.pageCount || row.pageCount || READ_UPLOAD_PAGE_MAX, 1);
    await localReadDb.pdfs.put({ ...row, ...clean, updatedAt: Date.now() });
  });
}

export async function saveLocalReadAnnotations(uid: string, id: string, bytes: Uint8Array, meta?: { pageCount?: number; annotationCount?: number }): Promise<void> {
  if (!bytes.byteLength || bytes.byteLength > READ_UPLOAD_MAX_BYTES || !isPdfHeader(bytes)) {
    throw new Error("The annotated PDF is invalid or exceeds the 100 MB limit. Download a copy instead.");
  }
  await localReadDb.transaction("rw", localReadDb.pdfs, async () => {
    const row = await localReadDb.pdfs.get([uid, id]);
    if (!row) throw new Error("This local PDF is missing. Import it again on this device.");
    const now = Date.now();
    await localReadDb.pdfs.put({
      ...row, blob: new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
      sizeBytes: bytes.byteLength, hasAnnotations: true, annotatedAt: now, updatedAt: now,
      ...(meta?.pageCount ? { pageCount: integer(meta.pageCount, READ_UPLOAD_PAGE_MAX) } : {}),
      ...(meta?.annotationCount !== undefined ? { annotationCount: integer(meta.annotationCount, READ_UPLOAD_ANNOTATION_MAX) } : {}),
    });
  });
}

export async function removeLocalReadPdf(uid: string, id: string): Promise<void> {
  await localReadDb.pdfs.delete([uid, id]);
}

/** Resolve only for the signed-in owner; caller revokes this temporary URL. */
export async function openLocalReadPdf(reference: string, uid: string | null): Promise<string> {
  const target = parseLocalReadReference(reference);
  if (!target || !uid || target.uid !== uid) throw new Error("Sign in to the account that imported this local PDF.");
  const row = await localReadDb.pdfs.get([uid, target.id]);
  if (!row?.blob) throw new Error("This PDF is stored on the device where it was imported. Import it here again; clearing browser data also removes local PDFs.");
  return URL.createObjectURL(row.blob);
}

export function localReadError(thrown: unknown): string {
  const name = thrown instanceof Error ? thrown.name : "";
  if (name === "QuotaExceededError") return "Device storage is full. Free space or delete a local PDF, then retry. No partial PDF was saved.";
  if (["SecurityError", "InvalidStateError", "MissingAPIError"].includes(name)) return "Local PDF storage is unavailable in this browser. Allow site storage, use a regular browser window, or choose Cloud upload.";
  return thrown instanceof Error ? thrown.message : "Could not save this local PDF. Check device storage and retry.";
}
