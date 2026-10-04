// src/joplin/joplinStorageBridge.ts
//
// Attachments (Joplin "resources") and the binary half of the data plane.
//
// Rules this module enforces on the client, mirrored by `firestore.rules` and
// `storage.rules` on the server (§36, §65, §104):
//
//   · metadata lives in `users/{uid}/joplinResources/{resourceId}`, the bytes
//     live in Storage at `myDayWorkspace/{uid}/resources/{resourceId}/{name}` —
//     no binary is ever pushed into a Firestore document;
//   · MIME type, size, extension and file name are validated HERE (fast feedback)
//     and again on the server (the boundary that actually matters);
//   · the storage path is built from the AUTHENTICATED uid, never from a value
//     the caller supplies, so one learner cannot write into another's workspace;
//   · a resource that is no longer referenced by any note can be removed, and a
//     resource that IS still referenced is never deleted (§105).

import { doc } from "firebase/firestore";
import { db } from "../../firebase";
import { buildResource } from "./joplinModel";
import type { JoplinResourceRow } from "./joplinModel";
import { apiFetch } from "../utils/apiBase";
import { joplinId } from "./joplinIds";
import { JOPLIN_COLLECTIONS } from "./joplinPersistence";

/** 25 MB, matching the existing audio/pdf caps in `storage.rules`. */
export const MAX_RESOURCE_BYTES = 25 * 1024 * 1024;

export const ALLOWED_RESOURCE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/zip",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/wav",
  "video/mp4",
  "video/webm",
] as const;

const ALLOWED_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "pdf",
  "txt",
  "md",
  "csv",
  "json",
  "zip",
  "mp3",
  "m4a",
  "webm",
  "wav",
  "mp4",
]);

export interface ResourceCandidate {
  name: string;
  mime: string;
  size: number;
}

export interface ResourceValidation {
  ok: boolean;
  reason?: "empty_file" | "too_large" | "mime_not_allowed" | "extension_not_allowed" | "unsafe_name";
  safeName: string;
  extension: string;
}

/**
 * Validate and sanitise a candidate upload.
 *
 * The file name is reduced to a safe slug: no path separators, no `..`, no
 * control characters — a name is user input, and Storage paths are not a place
 * for user input.
 */
const safeTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export function validateResourceCandidate(candidate: ResourceCandidate): ResourceValidation {
  const rawName = String(candidate.name ?? "").trim();
  const size = Number(candidate.size);
  const mime = String(candidate.mime ?? "").toLowerCase().split(";")[0].trim();
  const extension = rawName.includes(".") ? rawName.split(".").pop()!.toLowerCase() : "";

  const safeName = rawName
    .replace(/[\\/]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\w.\- ]/g, "")
    .trim()
    .slice(0, 120);

  if (!safeName || safeName === "." || safeName === ".." || rawName.startsWith(".") && !safeName.replace(/\./g, "")) {
    return { ok: false, reason: "unsafe_name", safeName: `resource-${Date.now()}`, extension };
  }
  if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: "empty_file", safeName, extension };
  if (size > MAX_RESOURCE_BYTES) return { ok: false, reason: "too_large", safeName, extension };
  if (!ALLOWED_RESOURCE_MIME.includes(mime as (typeof ALLOWED_RESOURCE_MIME)[number])) {
    return { ok: false, reason: "mime_not_allowed", safeName, extension };
  }
  if (extension && !ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, reason: "extension_not_allowed", safeName, extension };
  }
  return { ok: true, safeName, extension };
}

/** Storage path for a resource. The uid comes from the session, never a payload. */
export function resourceStoragePath(uid: string, resourceId: string, safeName: string): string {
  const owner = String(uid ?? "").trim();
  if (!owner) throw new Error("resourceStoragePath requires an authenticated uid");
  return `myDayWorkspace/${owner}/resources/${resourceId}/${safeName}`;
}

export interface UploadResourceInput {
  uid: string;
  file: File;
  noteId?: string;
  title?: string;
  now?: number;
}

export interface UploadResourceResult {
  ok: boolean;
  row?: JoplinResourceRow;
  reason?: string;
  /** Set when the bytes uploaded but the metadata write failed (retry-able). */
  metadataPending?: boolean;
}

/**
 * Upload a resource and create its metadata row.
 *
 * The metadata row is written FIRST (so a crash between the two steps leaves a
 * row pointing at absent bytes rather than orphaned bytes pointing at nothing,
 * which is the recoverable direction), then the object is uploaded and the row's
 * `size` is stamped.
 */
export async function uploadResource(input: UploadResourceInput): Promise<UploadResourceResult> {
  const uid = String(input.uid ?? "").trim();
  if (!uid) return { ok: false, reason: "missing_owner" };
  const validation = validateResourceCandidate({
    name: input.file.name,
    mime: input.file.type,
    size: input.file.size,
  });
  if (!validation.ok) return { ok: false, reason: validation.reason };

  const now = Math.round(input.now ?? Date.now());
  const resourceId = joplinId(`resource:${uid}:${validation.safeName}:${now}`);
  const storagePath = resourceStoragePath(uid, resourceId, validation.safeName);
  const row = buildResource({
    id: resourceId,
    ownerId: uid,
    title: input.title || input.file.name,
    mime: input.file.type || "application/octet-stream",
    size: input.file.size,
    fileExtension: validation.extension,
    storagePath,
    noteIds: input.noteId ? [input.noteId] : [],
    createdTime: now,
    now,
  });

  // Metadata goes through the server path — the same path every other Joplin
  // creation uses — so the entitlement check and the daily allowance are
  // applied to attachments too, and `firestore.rules` can keep client
  // `create` on `joplinResources` closed. The bytes follow below; the client
  // only ever merges `url` into the row this call created.
  try {
    const { auth } = await import("../../firebase");
    const token = await auth?.currentUser?.getIdToken().catch(() => null);
    if (!token) return { ok: false, reason: "no_session" };
    const response = await apiFetch("/api/joplin/resources", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ resource: row, clientTimeZone: safeTimeZone() }),
    });
    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; code?: string; error?: string };
    if (!response.ok || body.ok === false) {
      return { ok: false, reason: body.code || body.error || `http_${response.status}` };
    }
  } catch {
    return { ok: false, reason: "metadata_write_failed" };
  }

  try {
    const { getDownloadURL, getStorage, ref, uploadBytes } = await import("firebase/storage");
    // `firebase.ts` exports the initialised `db` and `auth`, not the app
    // instance; `getApp()` returns the default app it already configured.
    const { getApp } = await import("firebase/app");
    const storage = getStorage(getApp());
    const objectRef = ref(storage, storagePath);
    await uploadBytes(objectRef, input.file, { contentType: row.mime });
    const url = await getDownloadURL(objectRef);
    const { updateDoc } = await import("firebase/firestore");
    await updateDoc(doc(db, "users", uid, JOPLIN_COLLECTIONS.resources, resourceId), { url, updated_time: now });
    return { ok: true, row: { ...row, passthrough: { ...(row.passthrough ?? {}), url } } };
  } catch {
    // The metadata row exists, so the learner can retry the upload from the
    // workspace without losing the note attachment slot.
    return { ok: true, row, metadataPending: true };
  }
}

/**
 * Which resource ids are safe to delete when a note is removed (§105).
 *
 * Only resources whose `note_ids` become empty are candidates — an image that is
 * still referenced by another note must survive.
 */
export function resourcesReleasedByNote(
  resources: JoplinResourceRow[],
  deletedNoteId: string,
): JoplinResourceRow[] {
  return resources.filter((resource) => {
    if (!resource.note_ids.includes(deletedNoteId)) return false;
    const remaining = resource.note_ids.filter((id) => id !== deletedNoteId);
    return remaining.length === 0;
  });
}

/** Best-effort object deletion; failures leave the metadata row for a later sweep. */
export async function deleteResourceObject(storagePath: string): Promise<boolean> {
  if (!storagePath.startsWith("myDayWorkspace/")) return false;
  try {
    const { deleteObject, getStorage, ref } = await import("firebase/storage");
    const { getApp } = await import("firebase/app");
    await deleteObject(ref(getStorage(getApp()), storagePath));
    return true;
  } catch {
    return false;
  }
}
