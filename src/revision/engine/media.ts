/**
 * Revision media store (image cards + image occlusion).
 * ====================================================
 *
 * Openlet's image-occlusion capability needs durable binary storage for the
 * source image. Upstream Recall stored images in the Tauri app-data directory
 * and rendered them through `convertFileSrc`; Digitalcatalyst is a web/PWA app,
 * so images live in IndexedDB as Blobs and are rendered through object URLs.
 *
 * One store, used by:
 *   • `recall/shims/tauri.ts`      — the ported image picker / occluder
 *   • `recall/components/image-occlusion-*`
 *   • unified `UnifiedMediaRef` entries on cards
 *   • `.recall` package import/export (base64 round trip)
 *
 * Object URLs are cached with an LRU so re-rendering a card list does not
 * allocate a new URL per card.
 */

import { revisionDb, hasIndexedDb, type MediaRow } from "./localDb";
import { makeId, ID_PREFIX, type UnifiedMediaRef } from "../domain/types";

const MAX_URL_CACHE = 120;
const urlCache = new Map<string, string>();

export function sanitizeMediaName(name: string): string {
  return name.replace(/[/\\]|\.\./g, "").replace(/[^a-zA-Z0-9_.-]/g, "_");
}

function bytesOf(blob: Blob): number {
  return blob.size;
}

/** Store a blob and return its media id. */
export async function putMediaFile(input: {
  name: string;
  blob: Blob;
  mimeType?: string;
}): Promise<UnifiedMediaRef> {
  const id = makeId(ID_PREFIX.media, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
  const name = sanitizeMediaName(input.name) || `image-${Date.now()}`;
  const mimeType = input.mimeType || input.blob.type || "image/png";
  const createdAt = new Date().toISOString();
  const ref: UnifiedMediaRef = {
    id,
    kind: "image",
    mimeType,
    name,
    bytes: bytesOf(input.blob),
    createdAt,
  };

  if (hasIndexedDb()) {
    const row: MediaRow = { id, name, mimeType, blob: input.blob, bytes: ref.bytes ?? 0, createdAt };
    await revisionDb().media.put(row);
  } else {
    // No IndexedDB (rare, e.g. private-mode WebView): fall back to a data URL
    // held in memory for the session. The card still renders; it just will not
    // survive a reload, and the UI tells the learner sync is pending.
    ref.url = await blobToDataUrl(input.blob);
  }
  return ref;
}

/** Store an image from a base64 payload (used by `.recall` / Anki imports). */
export async function putMediaBase64(input: {
  name: string;
  base64: string;
  mimeType?: string;
}): Promise<UnifiedMediaRef> {
  const binary = atob(input.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: input.mimeType || "image/png" });
  return putMediaFile({ name: input.name, blob, mimeType: input.mimeType });
}

export async function getMediaRow(id: string): Promise<MediaRow | null> {
  if (!hasIndexedDb()) return null;
  return (await revisionDb().media.get(id)) ?? null;
}

export async function listMedia(): Promise<UnifiedMediaRef[]> {
  if (!hasIndexedDb()) return [];
  const rows = await revisionDb().media.toArray();
  return rows.map((row) => ({
    id: row.id,
    kind: "image" as const,
    mimeType: row.mimeType,
    name: row.name,
    bytes: row.bytes,
    createdAt: row.createdAt,
  }));
}

export async function deleteMedia(id: string): Promise<void> {
  const cached = urlCache.get(id);
  if (cached) {
    URL.revokeObjectURL(cached);
    urlCache.delete(id);
  }
  if (!hasIndexedDb()) return;
  await revisionDb().media.delete(id);
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(blob);
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await blobToDataUrl(blob);
  const index = dataUrl.indexOf(",");
  return index < 0 ? "" : dataUrl.slice(index + 1);
}

/** Resolve a media id (or a bare filename) to a renderable URL. */
export async function getMediaUrl(idOrName: string): Promise<string> {
  const cached = urlCache.get(idOrName);
  if (cached) {
    urlCache.delete(idOrName);
    urlCache.set(idOrName, cached);
    return cached;
  }

  if (!hasIndexedDb()) return "";

  let row: MediaRow | undefined = await revisionDb().media.get(idOrName);
  if (!row) {
    // Accept a raw filename (upstream Recall stored names, not ids).
    const safe = sanitizeMediaName(idOrName);
    row = await revisionDb().media.where("name").equals(safe).first();
  }
  if (!row) return "";

  const url = URL.createObjectURL(row.blob);
  if (urlCache.size >= MAX_URL_CACHE) {
    const oldest = urlCache.keys().next().value;
    if (oldest) {
      URL.revokeObjectURL(urlCache.get(oldest)!);
      urlCache.delete(oldest);
    }
  }
  urlCache.set(idOrName, url);
  urlCache.set(row.id, url);
  return url;
}

/** Bytes for a media id — used by the export/import path. */
export async function getMediaBytes(idOrName: string): Promise<Uint8Array | null> {
  if (!hasIndexedDb()) return null;
  const row =
    (await revisionDb().media.get(idOrName)) ??
    (await revisionDb().media.where("name").equals(sanitizeMediaName(idOrName)).first());
  if (!row) return null;
  const buffer = await row.blob.arrayBuffer();
  return new Uint8Array(buffer);
}

/** Total bytes stored — surfaced in the Revision settings → data section. */
export async function mediaUsage(): Promise<{ count: number; bytes: number }> {
  if (!hasIndexedDb()) return { count: 0, bytes: 0 };
  const rows = await revisionDb().media.toArray();
  return {
    count: rows.length,
    bytes: rows.reduce((sum, row) => sum + row.bytes, 0),
  };
}
