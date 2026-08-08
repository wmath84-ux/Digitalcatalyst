// Firestore product document size management.
//
// Products are stored as ONE document per product at siteProducts/{productId}.
// Firestore refuses any document write larger than 1 MiB (1,048,576 bytes) with
// an invalid-argument error. The product editor inlines some media as base64
// "data:" URLs (small images/files, legacy localStorage-era content), and a few
// of those together silently push the document over the hard limit — which is
// exactly how product updates fail with
//   [invalid-argument] Document ... cannot be written because its size
//   (1,234,076 bytes) exceeds the maximum allowed size of 1,048,576 bytes.
//
// This module guarantees a product can always be saved:
//   1. buildDataUrlOffloadPlan estimates the final document size and chooses
//      embedded "data:" payloads to move out of the document.
//   2. offloadProductEmbeddedData uploads those payloads to Firebase Storage
//      (adminProductImages / adminProductContent paths, which the Storage
//      rules already allow for admins and expose as public-read) and rewrites
//      the fields to the resulting https download URLs.
//   3. describeOversizeProductDocument is the last-resort guard: if a product
//      still exceeds the limit after every off-loadable payload is gone (i.e.
//      the size is genuinely text), it names the largest fields so the admin
//      knows exactly what to split.
//
// Small inline SVG placeholders stay inline (they are only a few hundred
// bytes); only payloads large enough to matter are offloaded, and the list
// grows automatically until the document fits the budget.
//
// Import-safe in Node: Firebase is loaded lazily inside the async offload
// function, matching utils/adminFirestoreGuard.js.

export const FIRESTORE_DOCUMENT_SIZE_LIMIT_BYTES = 1_048_576;
export const PRODUCT_DOC_SAVE_BUDGET_BYTES = 900 * 1024;
export const EMBEDDED_DATA_URL_OFFLOAD_MIN_BYTES = 40 * 1024;

const DATA_URL_PATTERN = /^data:([^;,]*?)(;base64)?,(.*)$/s;

export const isDataUrl = (value) => typeof value === 'string' && DATA_URL_PATTERN.test(value.trim());

const utf8Length = (value) => {
  const text = String(value);
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
  return Buffer.byteLength(text, 'utf8');
};

export const parseDataUrl = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(DATA_URL_PATTERN);
  if (!match) return null;
  const mime = (match[1] || 'application/octet-stream').toLowerCase();
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  let bytes;
  if (isBase64) {
    const compact = payload.replace(/\s/g, '');
    const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
    bytes = Math.max(0, Math.floor((compact.length * 3) / 4) - padding);
  } else {
    try {
      bytes = utf8Length(decodeURIComponent(payload));
    } catch {
      bytes = utf8Length(payload);
    }
  }
  return { mime, isBase64, bytes, value: value.trim() };
};

export const collectEmbeddedDataUrls = (value, minBytes = 0) => {
  const entries = [];
  const seen = new Set();

  const walk = (node, path) => {
    if (typeof node === 'string') {
      const parsed = parseDataUrl(node);
      if (parsed && parsed.bytes >= minBytes) entries.push({ path, ...parsed });
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...path, `[${index}]`]));
      return;
    }
    Object.entries(node).forEach(([key, entry]) => walk(entry, [...path, `.${key}`]));
  };

  walk(value, []);
  return entries;
};

/**
 * Estimate the Firestore storage size of a document value.
 * Counts field names plus the per-type overhead Firestore uses, then applies a
 * 20% safety factor so borderline documents never slip through.
 */
export const estimateFirestoreDocumentBytes = (value) => {
  const seen = new Set();

  const walk = (node) => {
    if (node === null || node === undefined) return 1;
    if (typeof node === 'boolean') return 1;
    if (typeof node === 'number') return 8;
    if (typeof node === 'string') return utf8Length(node) + 1;
    if (node instanceof Date) return 8;
    if (typeof node !== 'object') return utf8Length(String(node)) + 1;
    if (seen.has(node)) return 1;
    seen.add(node);
    if (Array.isArray(node)) {
      return node.reduce((sum, item) => sum + walk(item) + 1, 1);
    }
    return Object.entries(node).reduce((sum, [key, entry]) => sum + utf8Length(key) + 1 + walk(entry), 1);
  };

  return Math.ceil(walk(value) * 1.2) + 32; // 32 bytes for the document name
};

export const getLargestLeafFields = (value, count = 3) => {
  const leaves = [];
  const seen = new Set();

  const walk = (node, path) => {
    if (typeof node === 'string') {
      leaves.push({ path: path || '(root)', bytes: utf8Length(node) });
      return;
    }
    if (typeof node === 'number' || typeof node === 'boolean' || node === null || node === undefined) {
      return;
    }
    if (typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    Object.entries(node).forEach(([key, entry]) => walk(entry, path ? `${path}.${key}` : key));
  };

  walk(value, '');
  return leaves.sort((a, b) => b.bytes - a.bytes).slice(0, count);
};

/**
 * Choose which embedded data-URL payloads must leave the document so the final
 * Firestore document fits the save budget. Largest payloads first; it will
 * reach below EMBEDDED_DATA_URL_OFFLOAD_MIN_BYTES when needed.
 */
export const buildDataUrlOffloadPlan = (value, budgetBytes = PRODUCT_DOC_SAVE_BUDGET_BYTES) => {
  const currentEstimate = estimateFirestoreDocumentBytes(value);
  if (currentEstimate <= budgetBytes) {
    return { currentEstimate, planned: [], estimatedBytesAfter: currentEstimate };
  }

  const largeFirst = collectEmbeddedDataUrls(value, EMBEDDED_DATA_URL_OFFLOAD_MIN_BYTES);
  const everything = collectEmbeddedDataUrls(value, 0);
  const ordered = [...largeFirst, ...everything]
    .filter((entry, index, all) => all.findIndex((other) => other.path.join('') === entry.path.join('')) === index)
    .sort((a, b) => b.bytes - a.bytes);

  const planned = [];
  let remaining = currentEstimate;
  for (const entry of ordered) {
    if (remaining <= budgetBytes) break;
    // Replacing the data URL with an https download URL keeps only the URL string.
    remaining -= entry.bytes + entry.value.length + 1; // value cost in doc (url chars ~= decoded estimate by design margin)
    planned.push(entry);
  }

  return { currentEstimate, planned, estimatedBytesAfter: remaining };
};

/** Human-readable failure when even a fully offloaded product cannot fit. */
export const describeOversizeProductDocument = (value) => {
  const estimate = estimateFirestoreDocumentBytes(value);
  if (estimate <= FIRESTORE_DOCUMENT_SIZE_LIMIT_BYTES) return null;
  const offenders = getLargestLeafFields(value, 3)
    .map((leaf) => `${leaf.path} (~${Math.ceil(leaf.bytes / 1024)} KB)`)
    .join(', ');
  return (
    `PRODUCT_DOC_TOO_LARGE: This product document is about ${(estimate / 1024 / 1024).toFixed(2)} MB, above Firestore's 1 MiB per-document limit. ` +
    `Largest fields: ${offenders}. Split this content into separate documents or shorten these fields, then save again.`
  );
};

export const buildOffloadStoragePath = ({ mime, productId, index }) => {
  const safeProductId = String(productId ?? 'unknown');
  const mimeExt = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9+]/gi, '').toLowerCase() || 'bin';
  const fileName = `embedded-${Date.now()}-${index}.${mimeExt === 'jpeg' ? 'jpg' : mimeExt}`;
  if (mime.startsWith('image/')) return `adminProductImages/${safeProductId}/embedded/${fileName}`;
  if (mime.startsWith('audio/')) return `adminProductContent/audio/${safeProductId}/${fileName}`;
  if (mime.startsWith('video/')) return `adminProductContent/video/${safeProductId}/${fileName}`;
  if (mime === 'application/pdf') return `adminProductContent/pdf/${safeProductId}/${fileName}`;
  return `adminProductContent/ebook/${safeProductId}/${fileName}`;
};

const decodeDataUrlBytes = (parsed) => {
  if (!parsed.isBase64) {
    let text = parsed.value.slice(parsed.value.indexOf(',') + 1);
    try { text = decodeURIComponent(text); } catch { /* keep raw */ }
    return typeof TextEncoder === 'function' ? new TextEncoder().encode(text) : new Uint8Array(Buffer.from(text, 'utf8'));
  }
  const base64 = parsed.value.slice(parsed.value.indexOf(',') + 1).replace(/\s/g, '');
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
};

const setAtPath = (root, path, replacement) => {
  if (!path.length) return replacement;
  let node = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const token = path[index];
    node = token.startsWith('[') ? node[Number(token.slice(1, -1))] : node[token.slice(1)];
  }
  const last = path[path.length - 1];
  if (last.startsWith('[')) node[Number(last.slice(1, -1))] = replacement;
  else node[last.slice(1)] = replacement;
  return root;
};

const cloneForRewrite = (value) => {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(value));
};

/**
 * Move embedded data-URL payloads out of a product into Firebase Storage so the
 * resulting Firestore document fits the save budget. No-op when the document
 * already fits. Returns the product with https URLs in place of data URLs.
 */
export const offloadProductEmbeddedData = async (product, productId) => {
  const plan = buildDataUrlOffloadPlan(product);
  if (!plan.planned.length) {
    return { product, offloadedCount: 0, offloadedBytes: 0, estimatedBytes: plan.currentEstimate };
  }

  const [{ storage }, storageApi] = await Promise.all([
    import('../firebase.ts'),
    import('firebase/storage'),
  ]);
  const { ref, uploadBytes, getDownloadURL } = storageApi;

  const rewritten = cloneForRewrite(product);
  let offloadedBytes = 0;

  for (const [index, entry] of plan.planned.entries()) {
    const storagePath = buildOffloadStoragePath({ mime: entry.mime, productId, index });
    console.info('ADMIN_PRODUCT_OFFLOAD_STARTED', { productId, storagePath, mime: entry.mime, bytes: entry.bytes });
    const bytes = decodeDataUrlBytes(entry);
    await uploadBytes(ref(storage, storagePath), bytes, { contentType: entry.mime });
    const downloadUrl = await getDownloadURL(ref(storage, storagePath));
    setAtPath(rewritten, entry.path, downloadUrl);
    offloadedBytes += entry.bytes;
    console.info('ADMIN_PRODUCT_OFFLOAD_SUCCESS', { productId, storagePath, mime: entry.mime, bytes: entry.bytes, url: downloadUrl });
  }

  console.info('ADMIN_PRODUCT_OFFLOAD_COMPLETE', {
    productId,
    offloadedCount: plan.planned.length,
    offloadedBytes,
    estimatedBytesBefore: plan.currentEstimate,
    estimatedBudget: PRODUCT_DOC_SAVE_BUDGET_BYTES,
  });

  return {
    product: rewritten,
    offloadedCount: plan.planned.length,
    offloadedBytes,
    estimatedBytes: plan.currentEstimate,
  };
};
