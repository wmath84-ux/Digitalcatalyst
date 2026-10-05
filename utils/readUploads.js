// utils/readUploads.js
//
// Course Player → READ LIBRARY — the learner's OWN PDFs: the pure half.
//
// The Read tab has always shown the PDFs an instructor attached to a course's
// modules (`utils/readResources.js`). This module is the second half of that
// library: the files the LEARNER brings. It owns, dependency-free, exactly
// three things — where a learner upload lives, what its Firestore document may
// contain, and how the library surface labels it:
//
//   users/{uid}/readUploads/{uploadId}
//   userReadUploads/{uid}/{uploadId}-{safe-name}.pdf      (Storage)
//
// Both halves are re-derivable, so `firestore.rules` / `storage.rules` can
// verify a write without trusting a single payload field: ownership comes from
// the PATH (`uid`), and the document's `storagePath` must point at exactly the
// folder the rules already scoped to that uid.
//
// Like `utils/sketchScene.js` and `utils/mindMapTree.js`, everything here is
// plain ESM with no Firebase / React / browser imports, so the Node test
// runner exercises every clamp and every refusal directly
// (tests/readUploads.test.mjs) and the React hook imports the types through
// `utils/readUploads.d.ts`.

/** Firestore subcollection under `users/{uid}` — one doc per uploaded PDF. */
export const READ_UPLOAD_COLLECTION = "readUploads";

/** Storage root. The learner's uid is always the first folder segment. */
export const READ_UPLOAD_STORAGE_ROOT = "userReadUploads";

/**
 * The same ceiling the instructor-side Read uploads use
 * (READ_PDF_MAX_BYTES in utils/readResources.js) — one number for "a PDF the
 * in-app PDF.js viewer will open", wherever the file came from.
 */
export const READ_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

/** Display name (the file name the learner chose) — trimmed to fit a doc. */
export const READ_UPLOAD_NAME_MAX = 160;

/** A learner-made module name ("Physics notes"), or "" for the default group. */
export const READ_UPLOAD_MODULE_MAX = 60;

/** Download URLs are long but bounded. */
export const READ_UPLOAD_URL_MAX = 2048;

/** Storage object path cap — mirrors the rules' own regex, not the raw name. */
export const READ_UPLOAD_PATH_MAX = 400;

/** Pages per document; also the cap a synced `lastPage` must respect. */
export const READ_UPLOAD_PAGE_MAX = 20000;

/** How many annotations a synced document may claim (telemetry-style count). */
export const READ_UPLOAD_ANNOTATION_MAX = 100000;

const UPLOAD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{5,119}$/;
const STORAGE_FILE_PATTERN = /^[A-Za-z0-9._-]+[.]pdf$/;
const PDF_TYPE = "application/pdf";

const text = (value) => String(value == null ? "" : value).trim();

const number = (value, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampInt = (value, min, max, fallback = 0) => {
  const parsed = Math.trunc(number(value, fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const clampNumber = (value, min, max, fallback = 0) => {
  const parsed = number(value, fallback);
  return Math.min(max, Math.max(min, parsed));
};

/** `Physics Notes.pdf` → `physics-notes` — the readable half of the path. */
export const readUploadFileNameSlug = (value, fallback = "pdf") => {
  const slug = text(value)
    .replace(/[.]pdf$/i, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 48);
  return slug || fallback;
};

/** A fresh, id-safe upload id. Not a hash — the doc id needs no derivation. */
export const createReadUploadId = (seed) => {
  const base = text(seed)
    .replace(/[^A-Za-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const random = Math.random().toString(36).slice(2, 10);
  const stamp = Date.now().toString(36);
  const id = `${base || "pdf"}-${stamp}${random ? `-${random}` : ""}`;
  return id.slice(0, 120);
};

export const isReadUploadId = (value) => UPLOAD_ID_PATTERN.test(text(value));

/** The learner's display name for the file, never blank and never oversized. */
export const sanitizeReadUploadName = (value, fallback = "My PDF") => {
  const name = text(value).replace(/\s+/g, " ").slice(0, READ_UPLOAD_NAME_MAX);
  return name || fallback;
};

/** A learner-made module name. `""` is the library's default group, on purpose. */
export const sanitizeReadUploadModule = (value) =>
  text(value).replace(/\s+/g, " ").slice(0, READ_UPLOAD_MODULE_MAX);

/** A learner-made submodule name. `""` = no submodule under the module. */
export const sanitizeReadUploadSubmodule = (value) => sanitizeReadUploadModule(value);

/**
 * Storage object path for one uploaded PDF. The uid is the folder (the rules
 * scope writes to it), the id keeps saves of the SAME document on the SAME
 * object — an annotation save overwrites, it never piles up copies.
 */
export const buildReadUploadStoragePath = (uid, uploadId, fileName) => {
  const owner = text(uid);
  const id = text(uploadId);
  if (!owner || !isReadUploadId(id)) return "";
  const objectName = `${id}-${readUploadFileNameSlug(fileName)}.pdf`;
  const path = `${READ_UPLOAD_STORAGE_ROOT}/${owner}/${objectName}`;
  return path.length <= READ_UPLOAD_PATH_MAX ? path : "";
};

/**
 * True when a storage path is inside exactly this learner's upload folder.
 * Used by the client before a delete/overwrite (the rules re-check it), and by
 * `parseReadUploadDoc` so a hostile document can never point the UI at another
 * learner's object.
 */
export const isOwnedReadUploadPath = (value, uid) => {
  const path = text(value);
  const owner = text(uid);
  if (!path || !owner || path.length > READ_UPLOAD_PATH_MAX) return false;
  const parts = path.split("/");
  if (parts.length !== 3) return false;
  if (parts[0] !== READ_UPLOAD_STORAGE_ROOT || parts[1] !== owner) return false;
  return STORAGE_FILE_PATTERN.test(parts[2]);
};

/** True when a picked file is a PDF this feature can store and render. */
export const isReadUploadFile = (file) => {
  if (!file || typeof file !== "object") return false;
  const size = number(file.size, -1);
  if (size < 0 || size > READ_UPLOAD_MAX_BYTES) return false;
  const type = text(file.type).toLowerCase();
  if (type && type !== PDF_TYPE) return false;
  return true;
};

/** Why a picked file was refused — the exact sentence the UI shows. */
export const readUploadFileIssue = (file) => {
  if (!file || typeof file !== "object") return "Choose a PDF file to upload.";
  const type = text(file.type).toLowerCase();
  const name = text(file.name);
  if (type && type !== PDF_TYPE && !/\.pdf$/i.test(name)) {
    return "Only PDF files can be added to your annotations.";
  }
  const size = number(file.size, 0);
  if (size <= 0) return "That file is empty — nothing was uploaded.";
  if (size > READ_UPLOAD_MAX_BYTES) {
    return `That PDF is ${Math.round(size / 1024 / 1024)} MB — the limit is ${Math.round(READ_UPLOAD_MAX_BYTES / 1024 / 1024)} MB.`;
  }
  return "";
};

/** How many leading bytes `isPdfHeader` inspects (the PDF spec allows the
 * `%PDF-` marker anywhere in the first 1024 bytes). */
export const READ_UPLOAD_HEADER_BYTES = 1024;

/**
 * True when the leading bytes of a file carry the `%PDF-` signature. Pickers
 * (Android content URIs especially) often report an empty or
 * `application/octet-stream` type, so the name/type check alone lets a
 * renamed image or HTML page through — it would upload fine and only fail
 * later, inside the viewer. Accepts an ArrayBuffer or any byte view.
 */
export const isPdfHeader = (bytes) => {
  let view = null;
  if (bytes instanceof ArrayBuffer) view = new Uint8Array(bytes);
  else if (bytes && ArrayBuffer.isView(bytes)) view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!view) return false;
  const limit = Math.min(view.length, READ_UPLOAD_HEADER_BYTES) - 5;
  for (let index = 0; index <= limit; index += 1) {
    if (
      view[index] === 0x25 && // %
      view[index + 1] === 0x50 && // P
      view[index + 2] === 0x44 && // D
      view[index + 3] === 0x46 && // F
      view[index + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
};

/**
 * The Firestore payload. Every field `firestore.rules` validates is produced
 * here, so a document built by this function can never be refused for shape.
 */
export const toFirestoreReadUpload = (input = {}) => {
  const now = Date.now();
  const uid = text(input.uid);
  const uploadId = text(input.uploadId);
  const storagePath = text(input.storagePath);
  const payload = {
    uid,
    uploadId,
    name: sanitizeReadUploadName(input.name),
    module: sanitizeReadUploadModule(input.module),
    submodule: sanitizeReadUploadSubmodule(input.submodule),
    storagePath,
    url: text(input.url).slice(0, READ_UPLOAD_URL_MAX),
    contentType: PDF_TYPE,
    sizeBytes: clampInt(input.sizeBytes, 0, READ_UPLOAD_MAX_BYTES, 0),
    pageCount: clampInt(input.pageCount, 0, READ_UPLOAD_PAGE_MAX, 0),
    lastPage: clampInt(input.lastPage, 1, READ_UPLOAD_PAGE_MAX, 1),
    hasAnnotations: input.hasAnnotations === true,
    annotationCount: clampInt(input.annotationCount, 0, READ_UPLOAD_ANNOTATION_MAX, 0),
    createdAt: clampNumber(input.createdAt, 0, Number.MAX_SAFE_INTEGER, now),
    updatedAt: clampNumber(input.updatedAt, 0, Number.MAX_SAFE_INTEGER, now),
    lastOpenedAt: clampNumber(input.lastOpenedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
  // Only stamped once the learner has actually saved an annotation pass.
  const annotatedAt = clampInt(input.annotatedAt, 0, Number.MAX_SAFE_INTEGER, 0);
  if (annotatedAt > 0) payload.annotatedAt = annotatedAt;
  return payload;
};

/**
 * Whatever came back from Firestore, as a usable row — or `null` when the
 * document is not one of ours (wrong owner folder, missing url, …). Never
 * throws: the library must survive a hand-edited or half-written document.
 */
export const parseReadUploadDoc = (raw, uidHint = "") => {
  if (!raw || typeof raw !== "object") return null;
  const id = text(raw.id ?? raw.uploadId);
  const uid = text(uidHint) || text(raw.uid);
  if (!isReadUploadId(id) || !uid) return null;
  const storagePath = text(raw.storagePath);
  if (!isOwnedReadUploadPath(storagePath, uid)) return null;
  const url = text(raw.url).slice(0, READ_UPLOAD_URL_MAX);
  if (!url) return null;
  const sizeBytes = clampInt(raw.sizeBytes, 0, READ_UPLOAD_MAX_BYTES, 0);
  const pageCount = clampInt(raw.pageCount, 0, READ_UPLOAD_PAGE_MAX, 0);
  const lastPage = clampInt(raw.lastPage, 1, READ_UPLOAD_PAGE_MAX, 1);
  return {
    id,
    uid,
    name: sanitizeReadUploadName(raw.name, "My PDF"),
    module: sanitizeReadUploadModule(raw.module),
    submodule: sanitizeReadUploadSubmodule(raw.submodule),
    storagePath,
    url,
    sizeBytes,
    pageCount,
    lastPage: pageCount > 0 ? Math.min(lastPage, pageCount) : lastPage,
    hasAnnotations: raw.hasAnnotations === true,
    annotationCount: clampInt(raw.annotationCount, 0, READ_UPLOAD_ANNOTATION_MAX, 0),
    createdAt: clampInt(raw.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
    updatedAt: clampInt(raw.updatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    lastOpenedAt: clampInt(raw.lastOpenedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    annotatedAt: clampInt(raw.annotatedAt, 0, Number.MAX_SAFE_INTEGER, 0),
  };
};

/** Newest activity first — the same order for every device. */
export const sortReadUploads = (uploads) =>
  [...(Array.isArray(uploads) ? uploads : [])].sort((a, b) => {
    const byUpdate = number(b?.updatedAt, 0) - number(a?.updatedAt, 0);
    if (byUpdate !== 0) return byUpdate;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });

/**
 * The library's "Your annotations" groups: the default (no module) bucket
 * first, then the learner's own module names A→Z. Grouping is presentation —
 * a module is a single label on the document, never a second collection.
 */
export const groupReadUploads = (uploads) => {
  const rows = sortReadUploads(uploads);
  const groups = new Map();
  for (const row of rows) {
    const key = sanitizeReadUploadModule(row?.module);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .map(([module, items]) => ({
      module,
      items,
      submodules: groupReadUploadSubmodules(items),
    }))
    .sort((a, b) => {
      if (a.module === b.module) return 0;
      if (!a.module) return -1;
      if (!b.module) return 1;
      return a.module.localeCompare(b.module);
    });
};

/** Submodule buckets inside one module group (blank first, then A→Z). */
export const groupReadUploadSubmodules = (uploads) => {
  const rows = Array.isArray(uploads) ? uploads : [];
  const groups = new Map();
  for (const row of rows) {
    const key = sanitizeReadUploadSubmodule(row?.submodule);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()]
    .map(([submodule, items]) => ({ submodule, items }))
    .sort((a, b) => {
      if (a.submodule === b.submodule) return 0;
      if (!a.submodule) return -1;
      if (!b.submodule) return 1;
      return a.submodule.localeCompare(b.submodule);
    });
};

/** Every module name the learner has used — the compose field's suggestions. */
export const readUploadModuleNames = (uploads) => {
  const names = new Set();
  for (const row of Array.isArray(uploads) ? uploads : []) {
    const name = sanitizeReadUploadModule(row?.module);
    if (name) names.add(name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
};

/**
 * A learner's uploaded PDF as a My Study Library resource draft — what the
 * player's "Add to my module" action sends into a course the learner built.
 *
 * `type: "read"` is the annotatable PDF type: the draft carries the owned
 * Storage path and the file size, which is what
 * `getReadResourcePresentation` (utils/readResources.js) needs to resolve the
 * resource and open it in the SAME annotated PDF.js viewer the course PDFs
 * use. `url` is the download URL the Read library already holds.
 */
export const readUploadModuleDraft = (row) => {
  const upload = row && typeof row === "object" ? row : {};
  const uid = text(upload.uid);
  const storagePath = text(upload.storagePath);
  const name = sanitizeReadUploadName(upload.name, "My PDF");
  if (!uid || !isOwnedReadUploadPath(storagePath, uid)) return null;
  const url = text(upload.url).slice(0, READ_UPLOAD_URL_MAX);
  if (!url) return null;
  return {
    name,
    type: "read",
    url,
    description: sanitizeReadUploadModule(upload.module),
    readSourceKind: "upload",
    readStoragePath: storagePath,
    readFileName: name,
    readFileSize: clampInt(upload.sizeBytes, 1, READ_UPLOAD_MAX_BYTES, 1),
  };
};

/** `3.4 MB` / `860 KB` — the size pill on a row. */
export const formatReadUploadSize = (bytes) => {
  const size = number(bytes, 0);
  if (size <= 0) return "PDF";
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
};

/** `12 pages · 3.4 MB` (+ the last page reached, when there is one). */
export const readUploadMetaLabel = (doc) => {
  const parts = [];
  const pages = clampInt(doc?.pageCount, 0, READ_UPLOAD_PAGE_MAX, 0);
  if (pages > 0) parts.push(`${pages} ${pages === 1 ? "page" : "pages"}`);
  parts.push(formatReadUploadSize(doc?.sizeBytes));
  return parts.join(" · ");
};

/** `Page 4 of 12` — the "continue where you left off" hint on a row. */
export const readUploadPageLabel = (doc) => {
  const pages = clampInt(doc?.pageCount, 0, READ_UPLOAD_PAGE_MAX, 0);
  const page = clampInt(doc?.lastPage, 1, READ_UPLOAD_PAGE_MAX, 1);
  if (page <= 1) return "";
  return pages > 0 ? `Page ${Math.min(page, pages)} of ${pages}` : `Page ${page}`;
};

/**
 * The annotation-save state one row/reader row shows. Kept here (not in the
 * component) so the exact strings are testable and identical everywhere.
 */
export const readUploadSyncLabel = (state) => {
  switch (state) {
    case "saving":
      return "Saving annotations…";
    case "saved":
      return "Annotations saved";
    case "dirty":
      return "Unsaved annotations";
    case "error":
      return "Could not save — your annotations stay on this device";
    default:
      return "";
  }
};
