// First-class Read resources shared by the admin editor, course mapper and player.
// This module deliberately has no Firebase / browser dependency so its URL,
// ownership and access rules can be tested directly in Node.

export const READ_PDF_MAX_BYTES = 100 * 1024 * 1024;
export const READ_PDFJS_VERSION = "6.3.289";

const READ_SOURCE_KINDS = new Set(["upload", "gdrive", "pdf_url", "embed_url"]);
const STORAGE_HOST = "firebasestorage.googleapis.com";
const DRIVE_HOST = "drive.google.com";

export const normalizeReadSourceKind = (value, storagePath = "") => {
  const kind = String(value || "").trim().toLowerCase();
  if (READ_SOURCE_KINDS.has(kind)) return kind;
  // Older or hand-edited Read records can be inferred without changing their
  // public URL shape. A storage path is the only signal that means upload.
  return String(storagePath || "").trim() ? "upload" : "pdf_url";
};

const safeSegment = (value) => {
  const segment = String(value ?? "").trim();
  if (!segment || segment === "." || segment === "..") return "";
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(segment)) return "";
  return segment;
};

/** A product/resource-owned filename; each upload gets an immutable suffix. */
export const buildReadStoragePath = (productId, resourceId, uploadId = "") => {
  const owner = safeSegment(productId);
  const resource = safeSegment(resourceId);
  const suffix = safeSegment(uploadId || (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`));
  if (!owner || !resource || !suffix) return "";
  return `adminProductContent/read/${owner}/${resource}-${suffix}.pdf`;
};

/**
 * Read uploads are bound to exactly one product AND one resource. This check is
 * intentionally stricter than "path starts with the product folder": it also
 * rejects sibling-resource and legacy PDF uploads from another Storage tree.
 */
export const isOwnedReadUploadPath = (value, productId, resourceId) => {
  const storagePath = String(value || "").trim();
  const parts = storagePath.split("/");
  if (parts.length !== 4 || parts[0] !== "adminProductContent" || parts[1] !== "read") return false;
  if (!parts[2] || (productId != null && parts[2] !== String(productId))) return false;
  const fileName = parts[3];
  if (!/^[A-Za-z0-9._-]+\.pdf$/i.test(fileName)) return false;
  if (resourceId != null && !fileName.startsWith(`${String(resourceId)}-`)) return false;
  return true;
};

const storagePathFromDownloadUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== STORAGE_HOST || url.username || url.password) return "";
    if (url.port && url.port !== "443") return "";
    if (url.searchParams.get("alt") !== "media" || !url.searchParams.get("token")) return "";
    const match = url.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : "";
  } catch {
    return "";
  }
};

const INTERNAL_HOST_SUFFIXES = [
  "localhost",
  "local",
  "localdomain",
  "internal",
  "intranet",
  "lan",
  "home",
  "home.arpa",
  "corp",
  "private",
  "arpa",
  "test",
  "example",
  "invalid",
  "onion",
  // Public wildcard-DNS services that deliberately resolve names such as
  // 127.0.0.1.nip.io or 192.168.1.1.sslip.io to private address literals.
  "nip.io",
  "sslip.io",
  "xip.io",
  "localtest.me",
  "lvh.me",
  "vcap.me",
];

const isPrivateOrLiteralHost = (hostname) => {
  const host = String(hostname || "").toLowerCase().replace(/\.$/, "");
  if (!host || host.includes(":")) return true; // includes all IPv6 literals
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true; // do not embed any IP literal
  if (!host.includes(".")) return true;
  if (INTERNAL_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return true;
  return false;
};

const normalizePublicHttpsUrl = (value) => {
  let text = String(value || "").trim();
  if (!text || text.startsWith("//") || text.startsWith("<") || /[\u0000-\u001f]/.test(text)) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return "";
    if (url.port && url.port !== "443") return "";
    if (url.hostname.toLowerCase() === STORAGE_HOST || isPrivateOrLiteralHost(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
};

const googleDriveFileId = (value) => {
  const normalized = normalizePublicHttpsUrl(value);
  if (!normalized) return "";
  try {
    const url = new URL(normalized);
    if (url.hostname.toLowerCase() !== DRIVE_HOST) return "";
    let id = "";
    const fileMatch = url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/|$)/);
    if (fileMatch) id = fileMatch[1];
    else if (["/open", "/uc"].includes(url.pathname)) id = url.searchParams.get("id") || "";
    return /^[A-Za-z0-9_-]{10,200}$/.test(id) ? id : "";
  } catch {
    return "";
  }
};

/** Canonical PDF bytes URL for a public Google Drive file (no API token). */
export const googleDrivePdfUrl = (value) => {
  const id = googleDriveFileId(value);
  return id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}` : "";
};

/**
 * Normalize a Read source and, for uploads, prove that its Firebase download
 * URL points at the exact owned Storage object recorded beside it.
 */
export const normalizeReadResourceUrl = (value, sourceKind, options = {}) => {
  const kind = normalizeReadSourceKind(sourceKind, options.storagePath);
  if (kind === "upload") {
    const path = String(options.storagePath || "").trim();
    const resourceId = options.resourceId == null ? undefined : String(options.resourceId);
    if (!isOwnedReadUploadPath(path, options.productId, resourceId)) return "";
    const fromUrl = storagePathFromDownloadUrl(value);
    if (!fromUrl || fromUrl !== path) return "";
    if (options.fileSize == null) return "";
    const size = Number(options.fileSize);
    if (!Number.isFinite(size) || size <= 0 || size >= READ_PDF_MAX_BYTES) return "";
    return String(value).trim();
  }
  if (kind === "gdrive") {
    const id = googleDriveFileId(value);
    return id ? `https://drive.google.com/file/d/${id}/view` : "";
  }
  // Direct PDFs and generic embeds accept public HTTPS URLs only. The generic
  // embed editor takes a URL, never HTML or an iframe snippet.
  return normalizePublicHttpsUrl(value);
};

export const readSourceLabel = (sourceKind) => {
  switch (normalizeReadSourceKind(sourceKind)) {
    case "upload": return "Uploaded PDF";
    case "gdrive": return "Google Drive PDF";
    case "embed_url": return "Embedded webpage";
    default: return "PDF URL";
  }
};

/**
 * Resolve how a Read row is opened. Real PDFs always go through the local
 * PDF.js Generic Viewer; only the explicitly selected generic source is framed.
 */
export const getReadResourcePresentation = (resource, options = {}) => {
  if (!resource || resource.type !== "read") return null;
  const sourceKind = normalizeReadSourceKind(resource.readSourceKind, resource.readStoragePath);
  const sourceUrl = normalizeReadResourceUrl(resource.url, sourceKind, {
    productId: options.productId,
    resourceId: resource.id,
    storagePath: resource.readStoragePath,
    fileSize: resource.readFileSize,
  });
  if (!sourceUrl) return null;
  if (sourceKind === "embed_url") {
    return {
      kind: "embed",
      sourceKind,
      sourceUrl,
      originalUrl: sourceUrl,
      label: readSourceLabel(sourceKind),
    };
  }
  const pdfUrl = sourceKind === "gdrive" ? googleDrivePdfUrl(sourceUrl) : sourceUrl;
  if (!pdfUrl) return null;
  return {
    kind: "pdfjs",
    sourceKind,
    sourceUrl: pdfUrl,
    originalUrl: sourceUrl,
    label: readSourceLabel(sourceKind),
  };
};

/** Keep only upload objects this exact product currently owns. */
export const collectReadUploadPaths = (modules, productId) => {
  const paths = new Set();
  for (const module of Array.isArray(modules) ? modules : []) {
    for (const resource of Array.isArray(module?.resources) ? module.resources : []) {
      if (resource?.type !== "read") continue;
      const sourceKind = normalizeReadSourceKind(resource.readSourceKind, resource.readStoragePath);
      const storagePath = String(resource.readStoragePath || "").trim();
      if (sourceKind === "upload" && isOwnedReadUploadPath(storagePath, productId, resource.id)) paths.add(storagePath);
    }
  }
  return paths;
};

/**
 * Prevent duplicated products and malformed drafts from retaining an upload
 * owned by another product. The uploaded object remains untouched; only its
 * foreign reference is cleared so the new owner can upload its own copy.
 */
export const sanitizeReadUploadsForProduct = (modules, productId) =>
  (Array.isArray(modules) ? modules : []).map((module) => ({
    ...module,
    resources: (Array.isArray(module?.resources) ? module.resources : []).map((resource) => {
      if (!resource || resource.type !== "read") {
        if (!resource || (!resource.readStoragePath && !resource.readSourceKind && !resource.readFileName && !resource.readFileSize)) return resource;
        const { readSourceKind, readStoragePath, readFileName, readFileSize, ...clean } = resource;
        return clean;
      }
      const sourceKind = normalizeReadSourceKind(resource.readSourceKind, resource.readStoragePath);
      if (sourceKind !== "upload") {
        const { readStoragePath, readFileName, readFileSize, ...clean } = resource;
        return {
          ...clean,
          url: normalizeReadResourceUrl(resource.url, sourceKind),
          readSourceKind: sourceKind,
        };
      }
      const valid = normalizeReadResourceUrl(resource.url, sourceKind, {
        productId,
        resourceId: resource.id,
        storagePath: resource.readStoragePath,
        fileSize: resource.readFileSize,
      });
      if (valid) return { ...resource, url: valid, readSourceKind: "upload" };
      return {
        ...resource,
        url: "",
        readSourceKind: "upload",
        readStoragePath: undefined,
        readFileName: undefined,
        readFileSize: undefined,
      };
    }),
  }));

/**
 * Collect readable resources from modules the existing access resolver has
 * already marked unlocked. The second resource-level check mirrors the Paid
 * tab's update ownership rule; no new entitlement system is introduced.
 */
export const collectAccessibleReadResources = (modules, unlockedModuleIds, ownedUpdateIds, productId) => {
  const result = [];
  const unlocked = unlockedModuleIds instanceof Set ? unlockedModuleIds : new Set();
  const ownedUpdates = ownedUpdateIds instanceof Set ? ownedUpdateIds : new Set();
  const visit = (nodes, parents = []) => {
    for (const module of Array.isArray(nodes) ? nodes : []) {
      const moduleId = String(module?.id || "");
      if (!moduleId || module.accessLevel === "hidden" || !unlocked.has(moduleId)) continue;
      const trail = [...parents, String(module.title || "Module")];
      for (const resource of Array.isArray(module.files) ? module.files : []) {
        if (!resource || resource.type !== "read" || resource.accessLevel === "hidden") continue;
        const updateId = String(resource.paidUpdateId || resource.id || "");
        if (resource.accessLevel === "paidUpdate" && !ownedUpdates.has(updateId)) continue;
        const presentation = getReadResourcePresentation(resource, { productId });
        if (!presentation) continue;
        result.push({
          id: String(resource.id),
          resource,
          modulePath: trail,
          presentation,
        });
      }
      visit(module.modules || [], trail);
    }
  };
  visit(modules);
  return result;
};
