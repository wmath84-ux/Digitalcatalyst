// Shared, dependency-free My Study Library helpers.
//
// These functions are intentionally usable by both the browser and Node tests.
// Firestore remains authoritative; this layer only gives the UI deterministic
// search/filter/reorder semantics and gives the API a stable duplicate key
// descriptor that it can hash before storing.

const text = (value) => String(value == null ? "" : value).trim();

/** Normalise human search text without changing the stored display value. */
export const normalizeLibrarySearchText = (value) => text(value)
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase()
  .replace(/\s+/g, " ");

const safeUrlIdentity = (value) => {
  const raw = text(value);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    parsed.hash = "";
    // Query ordering is not content identity. Sort it so semantically equal
    // URLs produce the same descriptor while preserving meaningful values.
    const params = [...parsed.searchParams.entries()].sort(([ak, av], [bk, bv]) =>
      ak.localeCompare(bk) || av.localeCompare(bv));
    parsed.search = "";
    params.forEach(([key, item]) => parsed.searchParams.append(key, item));
    return parsed.toString().replace(/\/$/, "").toLocaleLowerCase();
  } catch {
    return raw.toLocaleLowerCase();
  }
};

const youtubeIdentity = (raw) => {
  const explicit = text(raw?.youtubeVideoId || raw?.metadata?.youtubeVideoId);
  if (explicit) return explicit.toLocaleLowerCase();
  const candidate = text(raw?.youtubeUrl || raw?.embedUrl || raw?.url || raw?.sourceUrl);
  const match = candidate.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:embed\/|shorts\/|watch\?(?:[^#]*&)?v=))([\w-]{11})/i);
  return match?.[1]?.toLocaleLowerCase() || "";
};

const providerIdentity = (raw) => {
  const explicit = normalizeLibrarySearchText(raw?.provider || raw?.metadata?.provider);
  if (explicit) return explicit;
  const candidate = text(raw?.sourceUrl || raw?.url || raw?.embedUrl || raw?.youtubeUrl);
  try {
    return new URL(candidate).hostname.replace(/^www\./i, "").toLocaleLowerCase();
  } catch {
    return "unknown";
  }
};

/**
 * Build an unhashed, versioned content identity descriptor.
 *
 * Official snapshots are anchored to immutable product/module/resource ids,
 * not to an editable URL/type. Personal links use type + provider + canonical URL;
 * YouTube uses its video id so watch/youtu.be/embed links collide correctly.
 * The destination is deliberately NOT included: one resource is rejected
 * twice inside a destination but may be intentionally copied to another module.
 */
export const personalResourceIdentityDescriptor = (raw = {}) => {
  const type = normalizeLibrarySearchText(raw.type) || "embed";
  const origin = raw.origin && typeof raw.origin === "object" ? raw.origin : {};
  const originKind = normalizeLibrarySearchText(origin.kind || raw.originKind);
  const sourceProductId = text(origin.productId || raw.sourceProductId);
  const sourceModuleId = text(origin.moduleId || raw.sourceModuleId);
  const sourceResourceId = text(origin.resourceId || raw.sourceResourceId);

  if (originKind === "official" && sourceProductId && sourceResourceId) {
    return ["v1", "official", sourceProductId, sourceModuleId || "_", sourceResourceId]
      .map(normalizeLibrarySearchText)
      .join("|");
  }

  const provider = type === "youtube" ? "youtube" : providerIdentity(raw);
  const contentIdentity = type === "youtube"
    ? youtubeIdentity(raw)
    : safeUrlIdentity(raw.url || raw.embedUrl || raw.youtubeUrl || raw.sourceUrl);
  return ["v1", "personal", type, provider, contentIdentity].join("|");
};

/** Stable source reference passed from an official Course Player file. */
export const officialResourceReferenceKey = (reference = {}) => [
  text(reference.productId),
  text(reference.moduleId),
  text(reference.resourceId),
].map(normalizeLibrarySearchText).join("|");

export const libraryResourceSearchText = (resource, moduleTitle = "") => normalizeLibrarySearchText([
  resource?.name,
  resource?.description,
  resource?.type,
  resource?.provider,
  resource?.origin?.productTitle,
  resource?.origin?.moduleTitle,
  moduleTitle,
].filter(Boolean).join(" "));

/**
 * Search and filter a flattened library resource array. `moduleTitleById`
 * makes module-name search work without denormalising editable titles into
 * every resource document.
 */
export const filterPersonalLibraryResources = (resources, options = {}) => {
  const query = normalizeLibrarySearchText(options.query);
  const type = text(options.type);
  const moduleId = text(options.moduleId);
  const state = text(options.state);
  const moduleTitleById = options.moduleTitleById || {};
  const now = Number(options.now || Date.now());
  const recentWindowMs = Math.max(0, Number(options.recentWindowMs || 30 * 86400000));

  return (Array.isArray(resources) ? resources : []).filter((resource) => {
    if (type && type !== "all" && resource?.type !== type) return false;
    if (moduleId && moduleId !== "all" && resource?.personalModuleId !== moduleId) return false;
    if (state && state !== "all") {
      if (state === "saved" && resource?.state !== "saved") return false;
      if (state === "organized" && resource?.state === "saved") return false;
      if (state === "recent-added" && now - Number(resource?.createdAt || 0) > recentWindowMs) return false;
      if (state === "recent-opened" && (!resource?.lastOpenedAt || now - Number(resource.lastOpenedAt) > recentWindowMs)) return false;
    }
    if (!query) return true;
    const ownerModuleId = text(resource?.personalModuleId);
    return libraryResourceSearchText(resource, moduleTitleById[ownerModuleId] || "").includes(query);
  });
};

export const sortPersonalLibraryResources = (resources, mode = "recent") => {
  const list = [...(Array.isArray(resources) ? resources : [])];
  if (mode === "name") return list.sort((a, b) => text(a?.name).localeCompare(text(b?.name)));
  if (mode === "opened") return list.sort((a, b) => Number(b?.lastOpenedAt || 0) - Number(a?.lastOpenedAt || 0) || Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
  if (mode === "module") return list.sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0));
  return list.sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
};

/** Immutable accessible up/down move helper shared by the central UI/hook. */
export const movePersonalLibraryItem = (items, fromIndex, toIndex) => {
  const list = [...(Array.isArray(items) ? items : [])];
  const from = Number(fromIndex);
  const to = Math.max(0, Math.min(list.length - 1, Number(toIndex)));
  if (!Number.isInteger(from) || from < 0 || from >= list.length || !Number.isInteger(to) || from === to) return list;
  const [item] = list.splice(from, 1);
  list.splice(to, 0, item);
  return list;
};
