// utils/productMapping.js
//
// Round-trip mapping layer for the Admin Product Editor.
//
// Three layers, all kept in sync via these pure functions:
//
//   1. EDITOR form (src/lib/admin/types.ts — ProductModule, ProductResource, PaidUpdate)
//      Flat: every module sits in one array and refers to its parent via
//      `parentModuleId`. Resources live on `module.resources`.
//
//   2. FIRESTORE doc (siteProducts/{id} — `courseContent` + `paidUpdates`)
//      Nested: `courseContent` is a tree of root modules, each with a `modules`
//      array of children. `files` is the field name for resources. Every
//      commerce/access field is preserved alongside the legacy fields the
//      existing Course Player reads.
//
//   3. CATALOG shape (src/types/commerce.ts — CanonicalCourseModule, CanonicalPaidUpdate)
//      Nested canonical tree, every required commerce field present, with
//      `parentModuleId` carried through for admin reload. The legacy bridge
//      function `canonicalToLegacyCourseModule` translates this into the
//      CoursePlayerApp's `CourseModule` shape so the existing Player keeps
//      working without edits.
//
// URL-only sanitisation rule (mirrors the existing `courseContent.ts` policy):
//   * Strip Firebase Storage URLs.
//   * Strip non-HTTPS URLs.
//   * Strip data URLs / base64.
//   * Strip unrecognised record types.
//   * Keep commerce/access fields even if URL was stripped (so admin reload
//     still shows the resource with a missing URL).
//   * Remove only the resource itself when the URL is gone (so admin can fix
//     the URL); but **never** remove a module — modules are commerce records
//     even without valid resources.

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isString = (v) => typeof v === "string";

/**
 * Firestore hard rule: `undefined` is NOT a supported field value. Any object
 * handed to `setDoc()`/`updateDoc()` that carries an `undefined` anywhere in
 * its tree fails the whole write with:
 *
 *   FirebaseError: Function setDoc() called with invalid data.
 *     Unsupported field value: undefined (found in document siteProducts/<id>)
 *
 * The editor → Firestore mappers below intentionally emit `undefined` for
 * "not set" optional fields (embedUrl, youtubeVideoId, paidUpdateId, the
 * embedContent* legacy slots, …), which made every admin product save fail.
 * `stripUndefinedDeep` removes those keys entirely instead of writing them:
 * an absent key is exactly the same thing as "no value" to Firestore, and it
 * keeps the field out of the document rather than storing a bogus null that
 * downstream `?? fallback` reads would treat as a real value.
 *
 * Arrays drop `undefined` entries (Firestore rejects them inside arrays too).
 * Dates, Timestamps, FieldValue sentinels and other class instances are passed
 * through untouched so `serverTimestamp()` etc. keep working.
 */
export const stripUndefinedDeep = (value) => {
  if (Array.isArray(value)) {
    return value.filter((item) => item !== undefined).map((item) => stripUndefinedDeep(item));
  }
  if (!isObject(value)) return value;
  // Never rewrite non-plain objects (Date, Timestamp, FieldValue sentinels,
  // GeoPoint, DocumentReference…) — they must reach Firestore as-is.
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    out[key] = stripUndefinedDeep(item);
  }
  return out;
};
const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(typeof v === "string" ? v.replace(/[^0-9.-]/g, "") : v);
  return Number.isFinite(n) ? n : null;
};
const num = (v) => {
  const n = numOrNull(v);
  return n === null ? 0 : n;
};
const str = (v, fallback = "") => (v === null || v === undefined ? fallback : String(v));
const bool = (v, fallback = false) => (v === null || v === undefined ? fallback : Boolean(v));
const arr = (v) => (Array.isArray(v) ? v.filter((x) => x !== null && x !== undefined) : []);
const normAccessLevel = (v) => {
  const s = String(v || "").trim();
  if (s === "included" || s === "purchasable" || s === "paid_update" || s === "hidden") return s;
  // Legacy aliases.
  if (s === "paidUpdate") return "paid_update";
  if (s === "purchased") return "purchasable";
  return "included";
};
const normVisibility = (v) => (String(v || "").trim() === "hidden" ? "hidden" : "visible");
const normResourceType = (v) => {
  const s = String(v || "").trim();
  if (
    s === "youtube" || s === "video_url" || s === "video" ||
    s === "audio_url" || s === "audio" ||
    s === "image_url" || s === "image" ||
    s === "gdrive" || s === "pdf" || s === "gdoc" || s === "gsheet" ||
    s === "gslides" || s === "slides" ||
    s === "gform" || s === "google_form" ||
    s === "ebook" ||
    s === "github_pages" || s === "whimsical" || s === "iframe" ||
    s === "doc" || s === "sheet" || s === "embed" || s === "mindmap"
  ) return s;
  return "embed";
};

// ---------------------------------------------------------------------------
// Resource type helpers
// ---------------------------------------------------------------------------

// Map the editor resource types to the canonical player types.
const RESOURCE_TYPE_ALIASES = {
  video_url: "video",
  audio_url: "audio",
  image_url: "image",
  gdrive: "embed",
  gdoc: "doc",
  gsheet: "sheet",
  gslides: "slides",
  gform: "google_form",
  github_pages: "embed",
  whimsical: "mindmap",
  iframe: "embed",
  link: "embed",
};
const toCanonicalResourceType = (raw) => RESOURCE_TYPE_ALIASES[normResourceType(raw)] || normResourceType(raw);

const toPlayerResourceType = (raw) => toCanonicalResourceType(raw);

// URL validation (mirrors utils/courseContent.ts).
const VALID_URL_TYPES = new Set([
  "youtube", "video", "audio", "pdf", "doc", "sheet", "slides", "image",
  "google_form", "ebook", "embed", "mindmap", "iframe",
  "video_url", "audio_url", "image_url", "gdrive", "gdoc", "gsheet",
  "gslides", "gform", "github_pages", "whimsical",
]);

/**
 * Normalise a pasted resource link to a clean `https://` URL (or "" when it
 * can't be trusted). Links pasted without a scheme — `drive.google.com/file/…`,
 * `docs.google.com/document/…`, `www.example.com/x.pdf` — are treated as https,
 * because admins frequently copy links from a chat / SMS / mobile share sheet
 * where the scheme gets stripped. A bare id / word without a domain (e.g. a raw
 * Google file id) is still rejected here; YouTube bare ids are handled
 * separately by `extractYoutubeVideoId`.
 */
const normalizeHttpsUrl = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("data:")) return "";
  if (text.startsWith("javascript:")) return "";
  if (text.startsWith("<")) return "";
  if (text.startsWith("/")) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") return "";
    // A real remote host always carries a dot (youtu.be, drive.google.com…).
    // This rejects bare ids/words that would otherwise become a bogus https URL.
    if (!url.hostname.includes(".")) return "";
    // Block Firebase / GCS storage buckets, but do NOT block legitimate
    // public Google media hosts such as `commondatastorage.googleapis.com`
    // (the hostname boundary before "storage" must be a dot or the start).
    if (/(?:^|\.)(?:firebasestorage\.googleapis\.com|storage\.googleapis\.com)$/i.test(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
};

const isValidHttpsUrl = (value) => Boolean(normalizeHttpsUrl(value));

// Pick the best URL slot on a resource for the URL-only rule. Returns the
// normalised https URL (so a scheme-less link comes back with https://).
const pickValidUrl = (...candidates) => {
  for (const c of candidates) {
    const normalized = normalizeHttpsUrl(c);
    if (normalized) return normalized;
  }
  return "";
};

/**
 * Extract the 11-char YouTube video id from any supported URL form:
 *   - https://www.youtube.com/watch?v=<id>
 *   - https://youtu.be/<id>
 *   - https://www.youtube.com/shorts/<id>
 *   - https://www.youtube.com/embed/<id>
 *   - a bare 11-char id
 * Returns "" when the value is not a recognisable YouTube id.
 * Mirrors `extractYouTubeId` in `src/utils/courseEmbed.ts` so the two
 * layers never disagree on the id.
 */
const extractYoutubeVideoId = (value) => {
  const text = String(value || "").trim();
  if (!text) return "";
  // A bare 11-char id is accepted directly.
  if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;
  // URLs pasted without a scheme (youtu.be/ID, www.youtube.com/watch?v=ID)
  // are normalised so the id can still be recovered instead of dropping the
  // whole resource. This is the common case when an admin pastes a YouTube
  // link straight from a chat / SMS / the mobile share sheet.
  const candidate = /^(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\b/i.test(text)
    ? `https://${text}`
    : text;
  try {
    const url = new URL(candidate);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.split("/").filter(Boolean)[0] || "";
    }
    if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) {
      return url.pathname.split("/")[2] || "";
    }
    return url.searchParams.get("v") || "";
  } catch {
    return "";
  }
};

// ---------------------------------------------------------------------------
// Editor → Canonical
// ---------------------------------------------------------------------------

/**
 * Translate an editor resource (ProductResource) into the canonical shape,
 * preserving every commerce/access field. URL-only sanitisation is applied
 * here: invalid URLs become empty strings, never drop the resource.
 */
export const editorResourceToCanonical = (raw) => {
  if (!isObject(raw)) return null;
  const url = pickValidUrl(raw.url, raw.embedUrl, raw.youtubeUrl);
  const type = toCanonicalResourceType(raw.type);
  // YouTube resources are valid via their video id alone, so recover the id
  // from any pasted form (bare 11-char id, watch?v=, youtu.be, shorts, embed,
  // or a link missing its https:// scheme) instead of requiring a full https URL.
  const youtubeVideoId = type === "youtube"
    ? (str(raw.youtubeVideoId).trim() || extractYoutubeVideoId(raw.url || raw.youtubeUrl || raw.embedUrl))
    : str(raw.youtubeVideoId).trim();
  // Sanity rule: a YouTube resource may be valid via its videoId alone.
  const hasUsableLink = Boolean(url) || (type === "youtube" && Boolean(youtubeVideoId));
  if (!hasUsableLink) return null; // not a URL-acceptable record

  return {
    id: str(raw.id),
    parentModuleId: str(raw.parentModuleId),
    name: str(raw.name, "Untitled resource"),
    type,
    url: url || str(raw.url),
    provider: str(raw.provider, type === "mindmap" ? "whimsical_mindmap" : ""),
    sortOrder: num(raw.sortOrder),
    visibility: normVisibility(raw.visibility),
    accessLevel: normAccessLevel(raw.accessLevel),
    individuallyPurchasable: bool(raw.individuallyPurchasable),
    cashPrice: numOrNull(raw.cashPrice),
    salePrice: numOrNull(raw.salePrice),
    coinPrice: numOrNull(raw.coinPrice),
    entitlementId: str(raw.entitlementId, str(raw.id)),
    paidUpdateId: raw.paidUpdateId === null || raw.paidUpdateId === undefined || raw.paidUpdateId === ""
      ? null
      : str(raw.paidUpdateId),
    // Carry the bare id so URL-less YouTube records survive the round trip.
    youtubeVideoId: type === "youtube" ? youtubeVideoId || undefined : undefined,
  };
};

/**
 * Editor module (flat, with `parentModuleId` + `resources[]`) → canonical
 * shape. Note: the editor form is flat so the canonical result here is also
 * flat; nesting happens in `editorModulesToCanonicalTree` once we have all
 * siblings.
 */
export const editorModuleToCanonical = (raw) => {
  if (!isObject(raw)) return null;
  const resources = arr(raw.resources)
    .map(editorResourceToCanonical)
    .filter(Boolean)
    .map((r, index) => ({ ...r, sortOrder: index }));
  return {
    id: str(raw.id),
    title: str(raw.title, "Untitled module"),
    description: str(raw.description),
    sortOrder: num(raw.sortOrder),
    visibility: normVisibility(raw.visibility),
    active: bool(raw.active, true),
    accessLevel: normAccessLevel(raw.accessLevel),
    individuallyPurchasable: bool(raw.individuallyPurchasable),
    cashPrice: numOrNull(raw.cashPrice),
    salePrice: numOrNull(raw.salePrice),
    coinPrice: numOrNull(raw.coinPrice),
    includeInBundle: bool(raw.includeInBundle, true),
    previewAvailable: bool(raw.previewAvailable),
    requiredPreviousModuleIds: arr(raw.requiredPreviousModuleIds).map(String),
    entitlementId: str(raw.entitlementId, str(raw.id)),
    badge: raw.badge === null || raw.badge === undefined || raw.badge === "" ? null : str(raw.badge),
    parentModuleId: raw.parentModuleId === null || raw.parentModuleId === undefined || raw.parentModuleId === ""
      ? null
      : str(raw.parentModuleId),
    resources,
    modules: [], // filled in by editorModulesToCanonicalTree
  };
};

/**
 * Convert the flat editor module list into a nested canonical tree.
 */
export const editorModulesToCanonicalTree = (flat) => {
  const list = arr(flat).map(editorModuleToCanonical).filter(Boolean);
  const byId = new Map(list.map((m) => [m.id, m]));
  const roots = [];
  list.forEach((m) => {
    if (m.parentModuleId && byId.has(m.parentModuleId)) {
      byId.get(m.parentModuleId).modules.push(m);
    } else {
      roots.push(m);
    }
  });
  const sortRecursive = (modules) => {
    modules.sort((a, b) => a.sortOrder - b.sortOrder);
    modules.forEach((m) => sortRecursive(m.modules));
    return modules;
  };
  return sortRecursive(roots);
};

// ---------------------------------------------------------------------------
// Editor → Firestore
// ---------------------------------------------------------------------------

/**
 * Editor resource → Firestore resource (preserves all commerce fields
 * + legacy paidUpdatePrice/CoinPrice bridge the existing Player reads).
 */
export const editorResourceToFirestore = (raw) => {
  if (!isObject(raw)) return null;
  const url = pickValidUrl(raw.url, raw.embedUrl, raw.youtubeUrl);
  const type = normResourceType(raw.type);
  const youtubeVideoId = type === "youtube"
    ? (str(raw.youtubeVideoId).trim() || extractYoutubeVideoId(raw.url || raw.youtubeUrl || raw.embedUrl))
    : str(raw.youtubeVideoId).trim();
  const hasUsableLink = Boolean(url) || (type === "youtube" && Boolean(youtubeVideoId));
  if (!hasUsableLink) return null;

  const out = {
    id: str(raw.id),
    name: str(raw.name, "Untitled resource"),
    type,
    url: url || str(raw.url),
    embedUrl: pickValidUrl(raw.embedUrl) || undefined,
    youtubeUrl: pickValidUrl(raw.youtubeUrl) || undefined,
    youtubeVideoId: youtubeVideoId || undefined,
    provider: str(raw.provider, type === "whimsical" ? "Whimsical" : ""),
    sortOrder: num(raw.sortOrder),
    visibility: normVisibility(raw.visibility),
    accessLevel: normAccessLevel(raw.accessLevel),
    individuallyPurchasable: bool(raw.individuallyPurchasable),
    cashPrice: numOrNull(raw.cashPrice),
    salePrice: numOrNull(raw.salePrice),
    coinPrice: numOrNull(raw.coinPrice),
    entitlementId: str(raw.entitlementId, str(raw.id)),
    parentModuleId: raw.parentModuleId === null || raw.parentModuleId === undefined || raw.parentModuleId === ""
      ? null
      : str(raw.parentModuleId),
    paidUpdateId: raw.paidUpdateId === null || raw.paidUpdateId === undefined || raw.paidUpdateId === ""
      ? null
      : str(raw.paidUpdateId),
    // Legacy Player bridge fields.
    paidUpdatePrice: numOrNull(raw.cashPrice) === null ? undefined : `₹${numOrNull(raw.cashPrice)}`,
    paidUpdateCoinPrice: numOrNull(raw.coinPrice) || 0,
  };
  // Firestore rejects `undefined` field values outright, so the optional
  // slots above (embedUrl / youtubeUrl / youtubeVideoId / paidUpdatePrice)
  // are dropped rather than written when they have no value.
  return stripUndefinedDeep(out);
};

/**
 * Editor module (flat) → Firestore module with nested `modules` tree.
 * All required commerce/access fields are preserved at the top level.
 */
export const editorModuleToFirestore = (raw, allFlat) => {
  if (!isObject(raw)) return null;
  const files = arr(raw.resources)
    .map(editorResourceToFirestore)
    .filter(Boolean)
    .map((f, index) => ({ ...f, sortOrder: index }));
  const children = arr(allFlat)
    .filter((m) => m && m.parentModuleId === raw.id)
    .sort((a, b) => num(a.sortOrder) - num(b.sortOrder))
    .map((c) => editorModuleToFirestore(c, allFlat))
    .filter(Boolean);

  const out = {
    id: str(raw.id),
    title: str(raw.title, "Untitled module"),
    description: str(raw.description),
    sortOrder: num(raw.sortOrder),
    visibility: normVisibility(raw.visibility),
    active: bool(raw.active, true),
    accessLevel: normAccessLevel(raw.accessLevel),
    individuallyPurchasable: bool(raw.individuallyPurchasable),
    cashPrice: numOrNull(raw.cashPrice),
    salePrice: numOrNull(raw.salePrice),
    coinPrice: numOrNull(raw.coinPrice),
    includeInBundle: bool(raw.includeInBundle, true),
    previewAvailable: bool(raw.previewAvailable),
    requiredPreviousModuleIds: arr(raw.requiredPreviousModuleIds).map(String),
    entitlementId: str(raw.entitlementId, str(raw.id)),
    badge: raw.badge === null || raw.badge === undefined || raw.badge === "" ? null : str(raw.badge),
    parentModuleId: raw.parentModuleId === null || raw.parentModuleId === undefined || raw.parentModuleId === ""
      ? null
      : str(raw.parentModuleId),
    // Legacy Player bridge fields.
    paidUpdateId: normAccessLevel(raw.accessLevel) === "paid_update"
      ? (str(raw.entitlementId) || str(raw.id))
      : undefined,
    paidUpdatePrice: numOrNull(raw.cashPrice) === null ? undefined : `₹${numOrNull(raw.cashPrice)}`,
    paidUpdateCoinPrice: numOrNull(raw.coinPrice) || 0,
    files,
    modules: children,
  };
  // Same Firestore constraint as resources: `paidUpdateId` / `paidUpdatePrice`
  // are only present when the module actually is a paid update / priced, and
  // the legacy `embedContent*` slots are simply omitted when unset instead of
  // being written as unsupported `undefined` values.
  return stripUndefinedDeep(out);
};

/**
 * Editor flat module list → Firestore nested tree (root modules with
 * nested children sorted by sortOrder).
 */
export const editorModulesToFirestoreTree = (flat) => {
  const list = arr(flat);
  const roots = list
    .filter((m) => !m || !m.parentModuleId)
    .sort((a, b) => num(a.sortOrder) - num(b.sortOrder))
    .map((m) => editorModuleToFirestore(m, list))
    .filter(Boolean);
  return roots;
};

/**
 * Editor paid update → Firestore paid update. Splits the editor's
 * `includedIds` (mixed) into the canonical `includedModuleIds` and
 * `includedResourceIds` buckets using the supplied module list as a
 * partition.
 */
export const editorPaidUpdateToFirestore = (raw, allFlatModules) => {
  if (!isObject(raw)) return null;
  const moduleIds = new Set(arr(allFlatModules).map((m) => m && m.id).filter(Boolean));
  const allResourceIds = new Set();
  arr(allFlatModules).forEach((m) => {
    arr(m && m.resources).forEach((r) => {
      if (r && r.id) allResourceIds.add(r.id);
    });
  });
  const includedIds = arr(raw.includedIds).map(String);
  const includedModuleIds = [];
  const includedResourceIds = [];
  const cleanedIncludedIds = [];
  const seen = new Set();
  for (const id of includedIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    if (moduleIds.has(id)) {
      includedModuleIds.push(id);
      cleanedIncludedIds.push(id);
    } else if (allResourceIds.has(id)) {
      includedResourceIds.push(id);
      cleanedIncludedIds.push(id);
    }
    // Unknown ids are dropped silently (matches editor behaviour).
  }
  return stripUndefinedDeep({
    id: str(raw.id),
    title: str(raw.title, "Untitled update"),
    description: str(raw.description),
    // Cleaned joined form: only known ids, no duplicates, original order.
    includedIds: cleanedIncludedIds,
    // Canonical split form.
    includedModuleIds,
    includedResourceIds,
    cashPrice: num(raw.cashPrice),
    coinPrice: num(raw.coinPrice),
    active: bool(raw.active, true),
    visibility: normVisibility(raw.visibility),
    publishDate: raw.publishDate === null || raw.publishDate === undefined || raw.publishDate === ""
      ? null
      : str(raw.publishDate),
    sortOrder: num(raw.sortOrder),
  });
};

// ---------------------------------------------------------------------------
// Firestore → Editor
// ---------------------------------------------------------------------------

/**
 * Firestore resource (nested inside a module's `files`) → editor
 * ProductResource. Inverse of `editorResourceToFirestore`.
 */
export const firestoreResourceToEditor = (raw) => {
  if (!isObject(raw)) return null;
  // Prefer any usable HTTPS URL slot (url → embedUrl → youtubeUrl) so
  // resources stored with only a `youtubeUrl` / `embedUrl` still come back
  // into the editor with a working link. Falls back to the raw string so a
  // bad URL is preserved for the admin to fix rather than silently dropped.
  const url = pickValidUrl(raw.url, raw.embedUrl, raw.youtubeUrl) || str(raw.url);
  return {
    id: str(raw.id),
    name: str(raw.name, "Untitled resource"),
    // Editor only knows the 14-type enum; map back from the 11-type alias.
    type: fromPlayerResourceType(normResourceType(raw.type)),
    url,
    provider: str(raw.provider),
    sortOrder: num(raw.sortOrder),
    visibility: normVisibility(raw.visibility),
    accessLevel: normAccessLevel(raw.accessLevel),
    individuallyPurchasable: bool(raw.individuallyPurchasable),
    cashPrice: numOrNull(raw.cashPrice),
    salePrice: numOrNull(raw.salePrice),
    coinPrice: numOrNull(raw.coinPrice),
    paidUpdateId: raw.paidUpdateId === null || raw.paidUpdateId === undefined || raw.paidUpdateId === ""
      ? null
      : str(raw.paidUpdateId),
    // The editor doesn't yet have an `entitlementId` field on resources, but
    // we round-trip it through the form anyway via the parent module and the
    // resource id. The editor keeps resources keyed by their `id`, which is
    // the resource entitlement id.
    entitlementId: str(raw.entitlementId, str(raw.id)),
    parentModuleId: raw.parentModuleId === null || raw.parentModuleId === undefined || raw.parentModuleId === ""
      ? null
      : str(raw.parentModuleId),
  };
};

const fromPlayerResourceType = (type) => {
  // Editor types are: youtube, video_url, audio_url, image_url, gdrive, pdf,
  // gdoc, gsheet, gslides, gform, ebook, github_pages, whimsical, iframe.
  switch (type) {
    case "video": return "video_url";
    case "audio": return "audio_url";
    case "image": return "image_url";
    case "doc": return "gdoc";
    case "sheet": return "gsheet";
    case "slides": return "gslides";
    case "google_form": return "gform";
    case "mindmap": return "whimsical";
    case "embed": return "iframe";
    default: return type;
  }
};

const flattenFirestoreModules = (tree) => {
  const out = [];
  const visit = (m) => {
    if (!isObject(m)) return;
    out.push(m);
    arr(m.modules).forEach(visit);
  };
  arr(tree).forEach(visit);
  return out;
};

/**
 * Firestore nested module tree → editor flat module list.
 * Uses the canonical field names (parentModuleId + entitlementId + all the
 * commerce fields the spec requires) and reconstructs the resources array.
 */
export const firestoreModulesToEditorFlat = (tree) => {
  const flat = flattenFirestoreModules(tree);
  return flat.map((m) => {
    // Read resources from either `files` (editor-written) or `resources`
    // (legacy/demo) so every module's files survive the round trip.
    const resources = arr(m.files?.length ? m.files : m.resources)
      .map(firestoreResourceToEditor)
      .filter(Boolean)
      .map((r, index) => ({ ...r, sortOrder: index }));
    return {
      id: str(m.id),
      title: str(m.title, "Untitled module"),
      description: str(m.description),
      sortOrder: num(m.sortOrder),
      visibility: normVisibility(m.visibility),
      active: bool(m.active, true),
      accessLevel: normAccessLevel(m.accessLevel),
      individuallyPurchasable: bool(m.individuallyPurchasable),
      // Legacy/demo modules carry `paidUpdatePrice`/`paidUpdateCoinPrice`
      // instead of `cashPrice`/`coinPrice`; surface those so prices are not
      // silently dropped when the admin reloads such a course.
      cashPrice: numOrNull(m.cashPrice) ?? numOrNull(m.paidUpdatePrice),
      salePrice: numOrNull(m.salePrice),
      coinPrice: numOrNull(m.coinPrice) ?? numOrNull(m.paidUpdateCoinPrice),
      includeInBundle: bool(m.includeInBundle, true),
      previewAvailable: bool(m.previewAvailable),
      requiredPreviousModuleIds: arr(m.requiredPreviousModuleIds).map(String),
      entitlementId: str(m.entitlementId, str(m.id)),
      badge: m.badge === null || m.badge === undefined || m.badge === "" ? null : str(m.badge),
      parentModuleId: m.parentModuleId === null || m.parentModuleId === undefined || m.parentModuleId === ""
        ? null
        : str(m.parentModuleId),
      resources,
    };
  });
};

/**
 * Firestore paid update → editor PaidUpdate. Re-joins includedModuleIds
 * and includedResourceIds into the editor's single `includedIds` field
 * so the form textbox shows the same CSV the user typed.
 */
export const firestorePaidUpdateToEditor = (raw) => {
  if (!isObject(raw)) return null;
  const joined = [
    ...arr(raw.includedModuleIds).map(String),
    ...arr(raw.includedResourceIds).map(String),
    ...arr(raw.includedIds).map(String),
  ];
  // De-dupe while preserving order.
  const seen = new Set();
  const includedIds = [];
  for (const id of joined) {
    if (seen.has(id)) continue;
    seen.add(id);
    includedIds.push(id);
  }
  return {
    id: str(raw.id),
    title: str(raw.title, "Untitled update"),
    description: str(raw.description),
    includedIds,
    cashPrice: num(raw.cashPrice),
    coinPrice: num(raw.coinPrice),
    active: bool(raw.active, true),
    publishDate: raw.publishDate === null || raw.publishDate === undefined || raw.publishDate === ""
      ? null
      : str(raw.publishDate),
    visibility: normVisibility(raw.visibility),
    sortOrder: num(raw.sortOrder),
  };
};

// ---------------------------------------------------------------------------
// Firestore → Canonical
// ---------------------------------------------------------------------------

/**
 * Firestore resource → canonical resource (URL-only rule applied).
 * Returns null when the resource has no usable URL — the resource itself is
 * dropped but the parent module is preserved.
 */
export const firestoreResourceToCanonical = (raw) => {
  if (!isObject(raw)) return null;
  const url = pickValidUrl(raw.url, raw.embedUrl, raw.youtubeUrl);
  const type = toCanonicalResourceType(raw.type);
  const youtubeVideoId = type === "youtube"
    ? (str(raw.youtubeVideoId).trim() || extractYoutubeVideoId(raw.url || raw.youtubeUrl || raw.embedUrl))
    : str(raw.youtubeVideoId).trim();
  const hasUsableLink = Boolean(url) || (type === "youtube" && Boolean(youtubeVideoId));
  if (!hasUsableLink) return null;
  return {
    id: str(raw.id),
    parentModuleId: str(raw.parentModuleId),
    name: str(raw.name, "Untitled resource"),
    type,
    url: url || str(raw.url),
    provider: str(raw.provider, type === "mindmap" ? "whimsical_mindmap" : ""),
    sortOrder: num(raw.sortOrder),
    visibility: normVisibility(raw.visibility),
    accessLevel: normAccessLevel(raw.accessLevel),
    individuallyPurchasable: bool(raw.individuallyPurchasable),
    cashPrice: numOrNull(raw.cashPrice),
    salePrice: numOrNull(raw.salePrice),
    coinPrice: numOrNull(raw.coinPrice),
    entitlementId: str(raw.entitlementId, str(raw.id)),
    paidUpdateId: raw.paidUpdateId === null || raw.paidUpdateId === undefined || raw.paidUpdateId === ""
      ? null
      : str(raw.paidUpdateId),
    youtubeVideoId: type === "youtube" ? youtubeVideoId || undefined : undefined,
  };
};

/**
 * Firestore nested tree → canonical nested tree. Modules are preserved
 * even if all their resources get sanitised away (commerce records survive).
 */
export const firestoreTreeToCanonicalTree = (tree) => {
  const walk = (m) => {
    if (!isObject(m)) return null;
    const resources = arr(m.files?.length ? m.files : m.resources)
      .map(firestoreResourceToCanonical)
      .filter(Boolean)
      .map((r, index) => ({ ...r, sortOrder: index }));
    const modules = arr(m.modules).map(walk).filter(Boolean);
    return {
      id: str(m.id),
      title: str(m.title, "Untitled module"),
      description: str(m.description),
      sortOrder: num(m.sortOrder),
      visibility: normVisibility(m.visibility),
      active: bool(m.active, true),
      accessLevel: normAccessLevel(m.accessLevel),
      individuallyPurchasable: bool(m.individuallyPurchasable),
      cashPrice: numOrNull(m.cashPrice),
      salePrice: numOrNull(m.salePrice),
      coinPrice: numOrNull(m.coinPrice),
      includeInBundle: bool(m.includeInBundle, true),
      previewAvailable: bool(m.previewAvailable),
      requiredPreviousModuleIds: arr(m.requiredPreviousModuleIds).map(String),
      entitlementId: str(m.entitlementId, str(m.id)),
      badge: m.badge === null || m.badge === undefined || m.badge === "" ? null : str(m.badge),
      parentModuleId: m.parentModuleId === null || m.parentModuleId === undefined || m.parentModuleId === ""
        ? null
        : str(m.parentModuleId),
      resources,
      modules: modules.sort((a, b) => a.sortOrder - b.sortOrder),
    };
  };
  const roots = arr(tree).map(walk).filter(Boolean);
  return roots.sort((a, b) => a.sortOrder - b.sortOrder);
};

/**
 * Firestore paid update → canonical paid update.
 */
export const firestorePaidUpdateToCanonical = (raw) => {
  if (!isObject(raw)) return null;
  return {
    id: str(raw.id),
    title: str(raw.title, "Untitled update"),
    description: str(raw.description),
    includedModuleIds: arr(raw.includedModuleIds).map(String),
    includedResourceIds: arr(raw.includedResourceIds).map(String),
    cashPrice: num(raw.cashPrice),
    coinPrice: num(raw.coinPrice),
    active: bool(raw.active, true),
    visibility: normVisibility(raw.visibility),
    publishDate: raw.publishDate === null || raw.publishDate === undefined || raw.publishDate === ""
      ? null
      : str(raw.publishDate),
    sortOrder: num(raw.sortOrder),
  };
};

// ---------------------------------------------------------------------------
// Sanitizer: arbitrary input → canonical tree (URL-only rule, every
// commerce field preserved).
// ---------------------------------------------------------------------------

/**
 * Sanitise an unknown course content tree (Firestore read, JSON blob, or
 * anything else) into the canonical shape. Applies the URL-only rule and
 * preserves every commerce/access field.
 */
export const sanitizeCanonicalCourseContent = (raw) => {
  return firestoreTreeToCanonicalTree(raw);
};

// ---------------------------------------------------------------------------
// Legacy bridge: canonical → CourseModule (the existing Player shape).
// This is a one-way adapter so the existing CoursePlayerApp continues to
// work without edits. New code should read the canonical shape directly.
// ---------------------------------------------------------------------------

export const canonicalResourceToLegacyFile = (r, paidUpdateIdByContentId) => {
  if (!isObject(r)) return null;
  const resolvedUpdateId = paidUpdateIdByContentId && paidUpdateIdByContentId.get(str(r.id));
  return {
    id: str(r.id),
    name: str(r.name, "Untitled resource"),
    type: toPlayerResourceType(r.type),
    url: r.url ? str(r.url) : undefined,
    embedUrl: r.url ? str(r.url) : undefined,
    youtubeUrl: r.type === "youtube" ? str(r.url) : undefined,
    youtubeVideoId: r.type === "youtube" ? (r.youtubeVideoId || extractYoutubeVideoId(r.url)) || undefined : undefined,
    provider: str(r.provider),
    accessLevel: r.accessLevel === "paid_update" ? "paidUpdate" : r.accessLevel === "hidden" ? "hidden" : "included",
    paidUpdateId: str(resolvedUpdateId || r.paidUpdateId || "") || undefined,
    paidUpdatePrice: r.cashPrice === null || r.cashPrice === undefined ? undefined : `₹${r.cashPrice}`,
    paidUpdateCoinPrice: numOrNull(r.coinPrice) || 0,
  };
};

export const canonicalModuleToLegacy = (m, paidUpdateIdByContentId) => {
  if (!isObject(m)) return null;
  const files = arr(m.resources).map((r) => canonicalResourceToLegacyFile(r, paidUpdateIdByContentId)).filter(Boolean);
  const modules = arr(m.modules).map((child) => canonicalModuleToLegacy(child, paidUpdateIdByContentId)).filter(Boolean);
  // The paid update that gates a `paid_update` module lives in the product's
  // `paidUpdates` catalogue (via `includedModuleIds`), NOT on the module
  // itself. Resolve the real update id from the catalogue map so the Course
  // Player's "Buy" flow passes the id the checkout server actually looks up.
  // Fall back to `entitlementId`/module id so older trees (and the unit tests
  // that call this bridge without a catalogue) still get a stable value.
  const resolvedUpdateId = paidUpdateIdByContentId && paidUpdateIdByContentId.get(str(m.id));
  return {
    id: str(m.id),
    title: str(m.title, "Untitled module"),
    files,
    modules,
    accessLevel: m.accessLevel === "paid_update" ? "paidUpdate" : m.accessLevel === "hidden" ? "hidden" : "included",
    paidUpdateId: m.accessLevel === "paid_update" ? str(resolvedUpdateId || m.entitlementId || m.id) : undefined,
    paidUpdateTitle: m.accessLevel === "paid_update" ? str(m.title) : undefined,
    paidUpdatePrice: m.accessLevel === "paid_update" && m.cashPrice !== null && m.cashPrice !== undefined ? `₹${m.cashPrice}` : undefined,
    paidUpdateCoinPrice: m.accessLevel === "paid_update" ? numOrNull(m.coinPrice) || 0 : undefined,
  };
};

export const canonicalTreeToLegacyTree = (tree, paidUpdateIdByContentId) => arr(tree).map((m) => canonicalModuleToLegacy(m, paidUpdateIdByContentId)).filter(Boolean);

// ---------------------------------------------------------------------------
// Full top-level round-trip: editor form ↔ Firestore doc
// ---------------------------------------------------------------------------

/**
 * Editor form → Firestore doc (the full siteProducts document body).
 * Returns the body that `setDoc(ref, body, { merge: true })` will accept.
 * The caller adds `id`, `title`, `description`, etc. and `updatedAt`.
 */
export const editorToFirestoreBody = (form) => {
  if (!isObject(form)) return null;
  const flat = arr(form.modules);
  const courseContent = editorModulesToFirestoreTree(flat);
  const paidUpdates = arr(form.paidUpdates)
    .map((u) => editorPaidUpdateToFirestore(u, flat))
    .filter(Boolean);
  // Convenience flat lists (root + nested) for components that want it.
  // Everything is stripped of `undefined` because this object is written
  // straight into `siteProducts/{id}` — a single `undefined` anywhere in the
  // tree makes Firestore reject the whole `setDoc()` call.
  return stripUndefinedDeep({
    courseContent,
    paidUpdates,
    // The form blob is preserved as-is so older code paths that read
    // `raw.adminProduct` continue to work.
    adminProduct: form,
  });
};

/**
 * Firestore doc → editor form (inverse of `editorToFirestoreBody`).
 * Returns the full form object, including legacy fields the editor uses
 * (title, shortDescription, etc.).
 */
export const firestoreToEditorForm = (raw, documentId) => {
  if (!isObject(raw)) return null;
  // If the doc has the adminProduct blob, prefer its modules/paidUpdates
  // over the courseContent tree — the blob is the editor's own submission
  // and round-trips losslessly.
  let modules = [];
  let paidUpdates = [];
  if (raw.adminProduct && isObject(raw.adminProduct)) {
    modules = arr(raw.adminProduct.modules);
    paidUpdates = arr(raw.adminProduct.paidUpdates);
  }
  if (!modules.length) modules = firestoreModulesToEditorFlat(raw.courseContent);
  if (!paidUpdates.length) paidUpdates = arr(raw.paidUpdates).map(firestorePaidUpdateToEditor).filter(Boolean);

  // Images: editor stores the rich `images[]` array; Firestore doc stores
  // a flat `images` string array + `productImages.card`. Reconstruct the
  // rich array when the rich form is not present.
  const richImages = (() => {
    if (isObject(raw.adminProduct) && Array.isArray(raw.adminProduct.images)) return raw.adminProduct.images;
    return arr(raw.images).map((url, index) => ({
      id: `img-${index}`,
      url: str(url),
      provider: str(url).includes("cloudinary") ? "cloudinary" : "public",
      sortOrder: index,
      isPrimary: index === 0,
    }));
  })();

  const isVisible = raw.isVisible !== false;
  const inStock = raw.inStock !== false;
  const regularPrice = str(raw.price).replace(/[^0-9.]/g, "") || "0";
  const salePrice = raw.salePrice ? str(raw.salePrice).replace(/[^0-9.]/g, "") || null : null;

  return {
    id: documentId,
    title: str(raw.title),
    shortDescription: str(raw.description),
    longDescription: str(raw.longDescription),
    instructor: str(raw.instructor, "Digital Catalyst"),
    category: str(raw.category),
    productType: isObject(raw.adminProduct) ? str(raw.adminProduct.productType, "course") : "course",
    classLevel: isObject(raw.adminProduct) ? str(raw.adminProduct.classLevel) : str(raw.dimensions),
    subject: str(raw.subject),
    sku: str(raw.sku),
    tags: arr(raw.tags).map(String),
    searchKeywords: arr(raw.keywords).map(String),
    features: arr(raw.features).map(String),
    estimatedDuration: isObject(raw.adminProduct) ? str(raw.adminProduct.estimatedDuration) : str(raw.dimensions),
    language: isObject(raw.adminProduct) ? str(raw.adminProduct.language, "English") : "English",
    manualRating: isObject(raw.adminProduct) ? raw.adminProduct.manualRating ?? null : raw.manualRating ?? null,
    visibility: isVisible ? "visible" : "hidden",
    availableForSale: inStock,
    images: richImages,
    regularPrice,
    salePrice,
    coinPrice: num(raw.coinPrice),
    coinPurchaseEnabled: isObject(raw.adminProduct)
      ? Boolean(raw.adminProduct.coinPurchaseEnabled)
      : Boolean(raw.coinPrice),
    isFree: isObject(raw.adminProduct) ? Boolean(raw.adminProduct.isFree) : Boolean(raw.isFree),
    eligibleCouponIds: isObject(raw.adminProduct) ? arr(raw.adminProduct.eligibleCouponIds).map(String) : [],
    minPayableAmount: isObject(raw.adminProduct) ? str(raw.adminProduct.minPayableAmount, "0") : "0",
    availabilityDate: isObject(raw.adminProduct) ? raw.adminProduct.availabilityDate ?? null : null,
    saleStart: isObject(raw.adminProduct) ? raw.adminProduct.saleStart ?? null : null,
    saleEnd: isObject(raw.adminProduct) ? raw.adminProduct.saleEnd ?? null : null,
    modules,
    paidUpdates,
    status: isVisible ? "published" : "draft",
  };
};

// ---------------------------------------------------------------------------
// Sanitized catalog projection (Firestore doc → product-shaped object for
// CatalogContext). Always preserves the canonical modules + paidUpdates.
// ---------------------------------------------------------------------------

/**
 * Produce the `Product` shape consumed by CatalogContext. Includes both
 * the new `canonicalModules` + `paidUpdates` and the legacy
 * `courseContent` (mapped through the legacy bridge so the existing
 * Course Player keeps working).
 */
export const firestoreToCatalogProduct = (raw, documentId) => {
  if (!isObject(raw)) return null;
  const salePrice = raw.salePrice === undefined || raw.salePrice === null || raw.salePrice === ""
    ? numericPriceFromString(raw.price)
    : numericPriceFromString(raw.salePrice);
  const regularPrice = numericPriceFromString(raw.price);
  void salePrice;
  void regularPrice;
  let canonical = firestoreTreeToCanonicalTree(raw.courseContent);
  // Older / partial docs keep the editor blob even when `courseContent`
  // was not written. Fall back so the live PDP still lists modules.
  if (!canonical.length && isObject(raw.adminProduct) && arr(raw.adminProduct.modules).length) {
    canonical = editorModulesToCanonicalTree(raw.adminProduct.modules);
  }
  let paidUpdates = arr(raw.paidUpdates).map(firestorePaidUpdateToCanonical).filter(Boolean);
  if (!paidUpdates.length && isObject(raw.adminProduct)) {
    paidUpdates = arr(raw.adminProduct.paidUpdates).map((update) => firestorePaidUpdateToCanonical({
      ...update,
      includedModuleIds: arr(update.includedModuleIds).length ? update.includedModuleIds : arr(update.includedIds),
    })).filter(Boolean);
  }
  // Build content-id → paid-update-id (modules + resources) so the legacy
  // bridge can stamp each `paid_update` module/resource with the id of the
  // update that actually includes it (instead of its own id, which made the
  // Course Player's buy flow send an id the checkout server could not find).
  const paidUpdateIdByContentId = new Map();
  for (const update of paidUpdates) {
    for (const moduleId of arr(update.includedModuleIds)) {
      if (moduleId) paidUpdateIdByContentId.set(String(moduleId), str(update.id));
    }
    for (const resourceId of arr(update.includedResourceIds)) {
      if (resourceId) paidUpdateIdByContentId.set(String(resourceId), str(update.id));
    }
  }
  return {
    documentId,
    canonicalModules: canonical,
    paidUpdates,
    courseContent: canonicalTreeToLegacyTree(canonical, paidUpdateIdByContentId), // legacy bridge for Course Player
  };
};

const numericPriceFromString = (value) => {
  const amount = Number(str(value, "0").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
};

// Re-exports for tests and other consumers.
export const __testHelpers = {
  isValidHttpsUrl,
  pickValidUrl,
  toCanonicalResourceType,
  toPlayerResourceType,
  fromPlayerResourceType,
  normAccessLevel,
  normVisibility,
  normResourceType,
  numOrNull,
  num,
  str,
  bool,
  arr,
};
