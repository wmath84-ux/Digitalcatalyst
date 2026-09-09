// utils/personalCourse.js
//
// Personal Course Modules ("My Modules") — pure, shared logic for the
// student-owned content space inside the Course Player.
//
// This file deliberately contains NO Firestore / fetch / DOM code so the Node
// test runner can import it directly. It is the ONE source of truth for:
//
//   · the 12 resource types (values match `CourseFileType` in
//     src/types/course.ts — that union remains the source of truth for the
//     type VALUES; this file carries the feature's registry: labels,
//     URL schemas and per-type renderer metadata);
//   · per-plan / per-billing-duration entitlement configuration + defaults
//     (the "Personal Course Modules" plan settings);
//   · entitlement resolution from a subscription record + plan doc;
//   · the central URL normalization / validation layer used by the resource
//     forms AND by the server API (a user can never bypass it by crafting a
//     request body);
//   · structure validation (lengths, payload caps, allowed keys);
//   · honest AI-context availability for personal resources.
//
// The renderer remains the EXISTING one: a validated personal resource is
// shaped into the same fields (`type`, `url`, `embedUrl`, `youtubeUrl`,
// `youtubeVideoId`, `provider`, `contentType`) the official CourseFile model
// uses, and opens through ResourceViewer's existing `getCourseEmbed` path —
// no second resource viewer, no duplicated type rendering.

export const PERSONAL_COURSE_FEATURE_ID = "personal-modules";

// ---------------------------------------------------------------------------
// The 12 types — canonical order mirrors the requirement + CourseFileType.
// ---------------------------------------------------------------------------

/** Registry entries: `value` MUST stay a valid CourseFileType. */
export const PERSONAL_COURSE_TYPE_ORDER = Object.freeze([
  "youtube",
  "video",
  "audio",
  "pdf",
  "doc",
  "sheet",
  "slides",
  "ebook",
  "image",
  "google_form",
  "embed",
  "mindmap",
]);

export const PERSONAL_COURSE_TYPE_LABELS = Object.freeze({
  youtube: "YouTube",
  video: "Video / MP4",
  audio: "Audio",
  pdf: "PDF",
  doc: "Google Docs",
  sheet: "Google Sheets",
  slides: "Google Slides",
  ebook: "E-book",
  image: "Image",
  google_form: "Google Form",
  embed: "Embed / Website",
  mindmap: "Mindmap",
});

export const ALL_PERSONAL_COURSE_TYPES = Object.freeze([...PERSONAL_COURSE_TYPE_ORDER]);

export const isPersonalCourseType = (value) =>
  PERSONAL_COURSE_TYPE_ORDER.includes(String(value || ""));

export const personalCourseTypeLabel = (value) =>
  PERSONAL_COURSE_TYPE_LABELS[String(value || "")] || String(value || "");

/**
 * The resource types whose URL must be an embeddable Google-family link. The
 * key is the CourseFileType; the value is the Google path segment the type
 * maps to (`/document/`, `/spreadsheets/`, `/presentation/`).
 */
export const GOOGLE_FAMILY_BY_TYPE = Object.freeze({
  doc: "document",
  sheet: "spreadsheets",
  slides: "presentation",
});

/** User-friendly name for each Google family (error messages / hints). */
export const GOOGLE_FAMILY_LABELS = Object.freeze({
  document: "Google Docs",
  spreadsheets: "Google Sheets",
  presentation: "Google Slides",
});

// ---------------------------------------------------------------------------
// Payload / structure limits (centralized so client + server never disagree).
// ---------------------------------------------------------------------------

export const PERSONAL_MODULE_TITLE_MAX = 120;
export const PERSONAL_MODULE_DESC_MAX = 600;
export const PERSONAL_RESOURCE_NAME_MAX = 120;
export const PERSONAL_RESOURCE_DESC_MAX = 600;
export const PERSONAL_URL_MAX = 2048;
export const PERSONAL_ID_MAX = 128;
export const PERSONAL_MODULE_LIMIT_MAX = 1000;
export const PERSONAL_RESOURCE_LIMIT_MAX = 10000;
export const PERSONAL_PER_MODULE_LIMIT_MAX = 1000;
/** Cap for a single resource document's optional metadata (characters). */
export const PERSONAL_METADATA_CHARS_MAX = 2000;
export const PERSONAL_METADATA_KEYS_MAX = 10;

// ---------------------------------------------------------------------------
// Plan-level configuration defaults (per billing duration).
//
// Paid plans (any plan with a non-zero price, or an id that is not a free /
// trial plan): Personal Modules are enabled by default with 5 modules,
// 50 total resources, 20 resources per module, all 12 types and custom embeds
// enabled. Free plans (zero-priced, or ids containing free/trial): disabled
// by default. Admins can override everything per plan + per duration.
// ---------------------------------------------------------------------------

export const PERSONAL_MODULE_DEFAULT_LIMITS = Object.freeze({
  moduleLimit: 5,
  resourceLimit: 50,
  perModuleResourceLimit: 20,
});

export const isFreePlanDefault = (planId, monthlyPricePaise, yearlyPricePaise) => {
  const id = String(planId || "").trim().toLowerCase();
  const monthly = Number(monthlyPricePaise);
  const yearly = Number(yearlyPricePaise);
  const monthlyKnown = Number.isFinite(monthly);
  const yearlyKnown = Number.isFinite(yearly);
  // Both prices known AND zero-priced ⇒ free plan. When the plan doc carries
  // no price information at all the caller still has an active subscription,
  // so price cannot imply "free" — only an explicit free/trial id can.
  const zeroPriced = monthlyKnown && yearlyKnown && monthly <= 0 && yearly <= 0;
  return zeroPriced || /(^|[-_])(free|trial)([-_]|$)/.test(id) || id === "free" || id === "trial";
};

const clampLimit = (value, fallback, max) => {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  // -1 = unlimited (kept for parity with revision limits).
  if (number === -1) return -1;
  return Math.max(0, Math.min(max, number));
};

/** An "allowed types" value: array of the 12; empty/missing = ALL types. */
export const normalizeAllowedTypes = (raw) => {
  if (!Array.isArray(raw)) return null; // null = all types
  const seen = [];
  for (const value of raw) {
    const type = String(value || "").trim();
    if (isPersonalCourseType(type) && !seen.includes(type)) seen.push(type);
  }
  return seen.length > 0 ? seen : null;
};

const normalizeCycleConfig = (raw, fallback) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    // No structured slice for this duration — the flat/default fallback wins
    // wholesale (including its allowed-type list).
    return {
      moduleLimit: clampLimit(fallback.moduleLimit, PERSONAL_MODULE_DEFAULT_LIMITS.moduleLimit, PERSONAL_MODULE_LIMIT_MAX),
      resourceLimit: clampLimit(fallback.resourceLimit, PERSONAL_MODULE_DEFAULT_LIMITS.resourceLimit, PERSONAL_RESOURCE_LIMIT_MAX),
      perModuleResourceLimit: clampLimit(
        fallback.perModuleResourceLimit,
        PERSONAL_MODULE_DEFAULT_LIMITS.perModuleResourceLimit,
        PERSONAL_PER_MODULE_LIMIT_MAX,
      ),
      allowedTypes: normalizeAllowedTypes(fallback.allowedTypes) || null,
    };
  }
  const allowed = normalizeAllowedTypes(raw.allowedTypes);
  return {
    moduleLimit: clampLimit(raw.moduleLimit, fallback.moduleLimit, PERSONAL_MODULE_LIMIT_MAX),
    resourceLimit: clampLimit(raw.resourceLimit, fallback.resourceLimit, PERSONAL_RESOURCE_LIMIT_MAX),
    perModuleResourceLimit: clampLimit(
      raw.perModuleResourceLimit ?? raw.resourcesPerModule,
      fallback.perModuleResourceLimit,
      PERSONAL_PER_MODULE_LIMIT_MAX,
    ),
    allowedTypes: allowed !== null ? allowed : (normalizeAllowedTypes(fallback.allowedTypes) || null),
  };
};

/**
 * Default plan configuration for a plan that has not been configured yet.
 * Prices are the plan's OWN stored monthly/yearly prices (never derived from
 * each other); a zero-priced plan defaults to the feature being OFF.
 */
export const defaultPersonalModulesForPlan = (planId, monthlyPricePaise, yearlyPricePaise) => {
  const free = isFreePlanDefault(planId, monthlyPricePaise, yearlyPricePaise);
  const cycle = { ...PERSONAL_MODULE_DEFAULT_LIMITS, allowedTypes: null };
  return {
    enabled: !free,
    customEmbedEnabled: true,
    contentStorageEnabled: true,
    monthly: { ...cycle },
    yearly: { ...cycle },
  };
};

/**
 * Normalize the raw stored plan fields into the canonical per-plan config.
 * Accepts BOTH the structured shape (`personalModules.monthly.*`) and flat
 * legacy-friendly fields (`personalModulesEnabled`, `personalModuleLimit`,
 * `personalResourceLimit`, `personalMaxResourcesPerModule`,
 * `personalAllowedResourceTypes[]`, `personalCustomEmbedEnabled`,
 * `personalContentStorageEnabled`) so older plan docs migrate safely by
 * normalization — missing fields never require a manual migration and never
 * overwrite the plan's own prices (prices are not part of this config).
 */
export const normalizePlanPersonalModules = (rawPlan, planId = "") => {
  const raw = rawPlan && typeof rawPlan === "object" && !Array.isArray(rawPlan)
    ? rawPlan
    : {};
  const block = raw.personalModules && typeof raw.personalModules === "object" && !Array.isArray(raw.personalModules)
    ? raw.personalModules
    : {};
  // Stored plan prices are RUPEES (admin editor) — normalizePlanDoc converts
  // them to paise; keep that convention here for the paid/free default.
  const toPaiseish = (value) => (value === null || value === undefined || value === "" ? Number.NaN : Number(value) * 100);
  const monthlyPricePaise = toPaiseish(raw.monthlyPrice ?? raw.monthlyPricePaise ?? raw.priceMonthly);
  const yearlyPricePaise = toPaiseish(raw.yearlyPrice ?? raw.yearlyPricePaise ?? raw.priceYearly);
  const defaults = defaultPersonalModulesForPlan(planId, monthlyPricePaise, yearlyPricePaise);

  // Structured fields win; flat legacy fields fill in anything the structured
  // shape leaves out (and act as the whole config when no structured block).
  const hasFlatEnabled = typeof raw.personalModulesEnabled === "boolean";
  const flatTypes = normalizeAllowedTypes(raw.personalAllowedResourceTypes);
  const flatEnabled = hasFlatEnabled ? raw.personalModulesEnabled : defaults.enabled;
  const flat = {
    enabled: flatEnabled,
    customEmbedEnabled: typeof raw.personalCustomEmbedEnabled === "boolean"
      ? raw.personalCustomEmbedEnabled
      : (typeof block.customEmbedEnabled === "boolean" ? block.customEmbedEnabled : defaults.customEmbedEnabled),
    contentStorageEnabled: typeof raw.personalContentStorageEnabled === "boolean"
      ? raw.personalContentStorageEnabled
      : (typeof block.contentStorageEnabled === "boolean" ? block.contentStorageEnabled : defaults.contentStorageEnabled),
    monthly: normalizeCycleConfig(
      block.monthly ?? block.monthlyConfig,
      {
        moduleLimit: clampLimit(raw.personalModuleLimit, defaults.monthly.moduleLimit, PERSONAL_MODULE_LIMIT_MAX),
        resourceLimit: clampLimit(raw.personalResourceLimit, defaults.monthly.resourceLimit, PERSONAL_RESOURCE_LIMIT_MAX),
        perModuleResourceLimit: clampLimit(
          raw.personalMaxResourcesPerModule,
          defaults.monthly.perModuleResourceLimit,
          PERSONAL_PER_MODULE_LIMIT_MAX,
        ),
        allowedTypes: flatTypes,
      },
    ),
    yearly: normalizeCycleConfig(
      block.yearly ?? block.yearlyConfig,
      {
        moduleLimit: clampLimit(raw.personalModuleLimit, defaults.yearly.moduleLimit, PERSONAL_MODULE_LIMIT_MAX),
        resourceLimit: clampLimit(raw.personalResourceLimit, defaults.yearly.resourceLimit, PERSONAL_RESOURCE_LIMIT_MAX),
        perModuleResourceLimit: clampLimit(
          raw.personalMaxResourcesPerModule,
          defaults.yearly.perModuleResourceLimit,
          PERSONAL_PER_MODULE_LIMIT_MAX,
        ),
        allowedTypes: flatTypes,
      },
    ),
  };
  // A structured `enabled` beats a flat one when both exist.
  if (typeof block.enabled === "boolean") flat.enabled = block.enabled;
  return flat;
};

/** The per-duration slice of a normalized personal-modules config. */
export const personalModulesCycle = (config, cycle) => {
  const safe = config && typeof config === "object" ? config : {};
  const slice = cycle === "yearly" ? safe.yearly : safe.monthly;
  const defaults = PERSONAL_MODULE_DEFAULT_LIMITS;
  const source = slice && typeof slice === "object" ? slice : {};
  return {
    moduleLimit: clampLimit(source.moduleLimit, defaults.moduleLimit, PERSONAL_MODULE_LIMIT_MAX),
    resourceLimit: clampLimit(source.resourceLimit, defaults.resourceLimit, PERSONAL_RESOURCE_LIMIT_MAX),
    perModuleResourceLimit: clampLimit(
      source.perModuleResourceLimit,
      defaults.perModuleResourceLimit,
      PERSONAL_PER_MODULE_LIMIT_MAX,
    ),
    allowedTypes: normalizeAllowedTypes(source.allowedTypes) || null,
  };
};

/** Effective allowed-type list (null = all 12). */
export const personalAllowedTypes = (config, cycle) => {
  const slice = personalModulesCycle(config, cycle);
  const allowed = slice.allowedTypes || ALL_PERSONAL_COURSE_TYPES;
  // The existing admin-level custom-embed switch is an authoritative ceiling
  // across both cycles. A cycle may independently exclude embed through its
  // allowedTypes list, but it can never re-enable embed while this switch is off.
  return config?.customEmbedEnabled === false
    ? allowed.filter((type) => type !== "embed")
    : allowed;
};

export const personalTypeLimit = (config, cycle) => personalAllowedTypes(config, cycle).length;

export const isPersonalTypeAllowed = (config, cycle, type) =>
  personalAllowedTypes(config, cycle).includes(String(type || ""));

// ---------------------------------------------------------------------------
// Entitlement — resolved from the ACTUAL subscription record (plan, cycle,
// status, expiry). Never inferred from prices or client state.
// ---------------------------------------------------------------------------

const timestampMillis = (value) => {
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") {
    return value.toMillis();
  }
  if (value && typeof value === "object" && "seconds" in value) {
    return Number(value.seconds) * 1000 + Math.floor(Number(value.nanoseconds || 0) / 1e6);
  }
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
};

/** Mirrors utils/subscriptions.js isActiveSubscriptionRecord semantics. */
export const isActiveSubscription = (record, now = Date.now()) => {
  if (!record || typeof record !== "object") return false;
  const status = String(record.status || "").toLowerCase();
  if (status !== "active") return false;
  const expiresAt = timestampMillis(record.expiresAt);
  if (expiresAt > 0 && expiresAt <= now) return false;
  return true;
};

export const personalCycleOf = (record) => (String(record?.cycle || "").toLowerCase() === "yearly" ? "yearly" : "monthly");

/**
 * Resolve the learner's effective personal-modules entitlement for one
 * course. `record` = subscription record (users/{uid}/subscription/current
 * or subscriptions/{uid}/current); `plan` = the normalized plan doc (or a
 * raw Firestore plan doc — normalized here).
 *
 * Returns a stable snapshot used by the UI AND recomputed by the server API
 * before every authoritative write (client result is never trusted for
 * writes).
 */
export const resolvePersonalModulesEntitlement = (input, now = Date.now()) => {
  const { record, plan } = input || {};
  if (!isActiveSubscription(record, now)) {
    return {
      status: "not-entitled",
      entitled: false,
      disabled: false,
      planId: String(record?.planId || plan?.id || "").trim() || null,
      planName: null,
      cycle: null,
      config: null,
      limits: null,
      reason: "no-subscription",
    };
  }
  const planId = String(plan?.id || record.planId || "").trim();
  const rawPlan = plan && typeof plan === "object" && !Array.isArray(plan) ? plan : {};
  // Normalizing the plan doc gives existing plans safe defaults even when the
  // plan document predates this feature (no manual migration required).
  const normalized = normalizePlanPersonalModules(rawPlan, planId || "unknown");
  const cycle = personalCycleOf(record);
  const limits = personalModulesCycle(normalized, cycle);
  const planName = String(rawPlan.name || planId || "Your plan").trim();
  if (normalized.enabled === false || normalized.contentStorageEnabled === false) {
    return {
      status: "disabled",
      entitled: false,
      disabled: true,
      planId: planId || null,
      planName,
      cycle,
      config: normalized,
      limits,
      reason: normalized.contentStorageEnabled === false ? "storage-disabled" : "feature-disabled",
    };
  }
  return {
    status: "entitled",
    entitled: true,
    disabled: false,
    planId: planId || null,
    planName,
    cycle,
    config: normalized,
    limits,
    reason: "active",
  };
};

// ---------------------------------------------------------------------------
// Limit-state helpers (UI messaging + server messages).
// ---------------------------------------------------------------------------

export const usageAtModuleLimit = (usage, limits) =>
  limits && Number(limits.moduleLimit) >= 0 && Number(usage?.moduleCount || 0) >= Number(limits.moduleLimit);

export const usageAtResourceLimit = (usage, limits) =>
  limits && Number(limits.resourceLimit) >= 0 && Number(usage?.resourceCount || 0) >= Number(limits.resourceLimit);

export const usageAtPerModuleLimit = (resourceCountInModule, limits) =>
  limits && Number(limits.perModuleResourceLimit) >= 0
  && Number(resourceCountInModule || 0) >= Number(limits.perModuleResourceLimit);

/** User-facing message when a hard limit is hit. */
export const personalLimitMessage = (kind, limits, planName) => {
  const name = planName ? ` on ${planName}` : " on this plan";
  if (kind === "module") {
    const limit = Number(limits?.moduleLimit);
    return limit === -1
      ? "You've reached your module limit."
      : `You've reached your ${limit}-module limit${name}.`;
  }
  if (kind === "resource") {
    const limit = Number(limits?.resourceLimit);
    return limit === -1
      ? "You've reached your resource limit."
      : `You've reached your ${limit}-resource limit${name}.`;
  }
  if (kind === "per-module") {
    const limit = Number(limits?.perModuleResourceLimit);
    return limit === -1
      ? "This module is at its resource limit."
      : `This module is at its ${limit}-resource limit${name}.`;
  }
  return "You've reached your current plan limit.";
};

// ---------------------------------------------------------------------------
// Central URL normalization / validation layer.
//
// One reusable layer for ALL 12 types: protocol whitelist, dangerous-form
// rejection, canonicalization of known providers, friendly messages. The
// canonical output is shaped into the same fields the existing CourseFile
// renderer consumes. `originalUrl` is preserved separately so the edit forms
// can show exactly what the user pasted.
// ---------------------------------------------------------------------------

const safeParse = (value) => {
  try {
    return new URL(String(value || "").trim());
  } catch {
    return null;
  }
};

const isPrivateHost = (hostname) => {
  const host = String(hostname || "").toLowerCase();
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0") return true;
  if (/^(\d{1,3}(\.\d{1,3}){3})$/.test(host)) {
    const parts = host.split(".").map((p) => Number(p));
    if (parts.some((p) => !Number.isFinite(p) || p < 0 || p > 255)) return true;
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }
  return false;
};

const fail = (code, message) => ({ ok: false, code, message });

const requireSafeHttpUrl = (value, typeLabel) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return fail("URL_REQUIRED", `Enter the ${typeLabel} link.`);
  }
  if (trimmed.length > PERSONAL_URL_MAX) {
    return fail("URL_TOO_LONG", `That link is too long — keep it under ${PERSONAL_URL_MAX} characters.`);
  }
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) {
    return fail("URL_INVALID", "That link contains characters that are not allowed.");
  }
  const url = safeParse(trimmed);
  if (!url) {
    return fail("URL_INVALID", "That doesn't look like a valid link. Paste the full https:// URL.");
  }
  if (url.protocol !== "https:") {
    if (url.protocol === "javascript:" || url.protocol === "data:" || url.protocol === "vbscript:" || url.protocol === "file:") {
      return fail("URL_PROTOCOL_BLOCKED", "This kind of link isn't allowed here.");
    }
    return fail("URL_PROTOCOL", "Only secure https:// links are allowed.");
  }
  if (url.username || url.password) {
    return fail("URL_CREDENTIALS", "Links with embedded usernames or passwords aren't allowed.");
  }
  return { ok: true, url, trimmed };
};

const YOUTUBE_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

const youtubeIdOf = (value) => {
  const trimmed = String(value || "").trim();
  if (YOUTUBE_ID_RE.test(trimmed)) return trimmed;
  const url = safeParse(trimmed);
  if (!url) return "";
  let candidate = "";
  if (/(^|\.)youtu\.be$/i.test(url.hostname)) {
    candidate = url.pathname.split("/").filter(Boolean)[0] || "";
  } else if (/youtube\.com$/i.test(url.hostname) || /youtube-nocookie\.com$/i.test(url.hostname)) {
    const path = url.pathname;
    if (path.startsWith("/shorts/") || path.startsWith("/embed/") || path.startsWith("/live/") || path.startsWith("/v/")) {
      candidate = path.split("/")[2] || "";
    } else {
      candidate = url.searchParams.get("v") || "";
    }
  }
  // Standard YouTube video ids are exactly 11 chars — anything else is a
  // typo or a channel/playlist link, which the player can't embed.
  return YOUTUBE_ID_RE.test(candidate) ? candidate : "";
};

const watchUrlOf = (id) => `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

const VIDEO_EXTS = ["mp4", "webm", "m4v", "ogv", "mov", "mkv", "3gp"];
const AUDIO_EXTS = ["mp3", "m4a", "ogg", "oga", "opus", "wav", "aac", "flac", "weba"];
const IMAGE_EXTS = ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "ico"];
const EBOOK_EXTS = ["pdf", "epub", "mobi", "azw3", "txt", "md"];

const pathExtension = (url) => {
  try {
    const pathname = url.pathname;
    const match = pathname.match(/\.([a-z0-9]{1,8})$/i);
    return match ? match[1].toLowerCase() : "";
  } catch {
    return "";
  }
};

const isDriveFileUrl = (url) => {
  try {
    return /(^|\.)drive\.google\.com$/i.test(url.hostname) && /\/file\/d\//i.test(url.pathname);
  } catch {
    return false;
  }
};

const driveFileIdOf = (url) => {
  const match = String(url.pathname || "").match(/\/file\/d\/([^/?#]+)/i);
  return match ? match[1] : "";
};

const googleFamilyOf = (value) => {
  const parsed = safeParse(value);
  if (!parsed) return null;
  const host = String(parsed.hostname || "").toLowerCase();
  const isDocsGoogle = host === "docs.google.com" || host.endsWith(".docs.google.com");
  if (!isDocsGoogle) {
    // forms.gle short links redirect to docs.google.com/forms — treated as
    // forms (canonicalization handles the redirect target client-side like
    // the existing viewer does).
    if (host === "forms.gle" || host.endsWith(".forms.gle")) {
      return { kind: "forms", id: "", parsed };
    }
    return null;
  }
  const match = String(parsed.pathname || "").match(/^\/(document|spreadsheets|presentation)\/d\/([^/?#]+)/i);
  if (match) {
    return { kind: match[1].toLowerCase(), id: match[2], parsed };
  }
  const form = String(parsed.pathname || "").match(/^\/forms\/d\/(?:e\/)?([^/?#]+)/i);
  if (form) return { kind: "forms", id: form[1], parsed };
  if (/^\/forms\//i.test(parsed.pathname)) return { kind: "forms", id: "", parsed };
  return null;
};

const canonicalGoogleUrl = (kind, id) => {
  if (kind === "document") return `https://docs.google.com/document/d/${id}`;
  if (kind === "spreadsheets") return `https://docs.google.com/spreadsheets/d/${id}`;
  if (kind === "presentation") return `https://docs.google.com/presentation/d/${id}`;
  return "";
};

/**
 * The same canonicalization `getGoogleFormEmbedUrl` performs for the viewer:
 * any form URL is rewritten to the embeddable /viewform?embedded=true form so
 * the resource always stays inside the Course Player.
 */
export const canonicalGoogleFormUrl = (value) => {
  const parsed = safeParse(value);
  if (!parsed) return "";
  if (/(^|\.)forms\.gle$/i.test(parsed.hostname)) {
    parsed.searchParams.set("embedded", "true");
    return parsed.toString();
  }
  if (/docs\.google\.com$/i.test(parsed.hostname) === false && /(^|\.)google\.com$/i.test(parsed.hostname) === false) return "";
  parsed.pathname = parsed.pathname
    .replace(/\/(edit|formResponse|closedform|viewanalytics|viewscore)\/?$/i, "/viewform")
    .replace(/\/+$/, "");
  if (!/\/viewform$/i.test(parsed.pathname) && /\/forms\//i.test(parsed.pathname)) {
    parsed.pathname = `${parsed.pathname}/viewform`;
  }
  parsed.searchParams.set("embedded", "true");
  parsed.hash = "";
  return parsed.toString();
};

const whimsicalIdOf = (value) => {
  const parsed = safeParse(value);
  if (!parsed) return "";
  if (!/(^|\.)whimsical\.com$/i.test(parsed.hostname)) return "";
  const path = String(parsed.pathname || "");
  const embedMatch = path.match(/^\/embed\/([a-zA-Z0-9]{16,22})/);
  if (embedMatch) return embedMatch[1];
  const boardMatch = path.match(/^\/(?:[a-zA-Z0-9-]+-)?([a-zA-Z0-9]{16,22})(?:@[a-zA-Z0-9]+)?(?:\/|$)/);
  return boardMatch ? boardMatch[1] : "";
};

/**
 * Validate + canonicalize one user-supplied URL for one personal resource
 * type. Output fields match the official `CourseFile` vocabulary so the
 * existing renderer needs zero changes.
 */
export const normalizePersonalResourceUrl = (type, value) => {
  const label = personalCourseTypeLabel(type);
  if (!isPersonalCourseType(type)) return fail("TYPE_UNKNOWN", "This resource type isn't supported.");
  const trimmed = String(value || "").trim();
  // A bare 11-character YouTube video id is accepted for the YouTube type
  // only (it is the canonical identifier — the player resolves the rest).
  if (type === "youtube" && YOUTUBE_ID_RE.test(trimmed)) {
    const watch = watchUrlOf(trimmed);
    return {
      ok: true,
      canonical: {
        url: watch,
        embedUrl: "",
        youtubeUrl: watch,
        youtubeVideoId: trimmed,
        provider: "youtube",
        contentType: "video/youtube",
      },
    };
  }
  const base = requireSafeHttpUrl(value, label);
  if (!base.ok) return base;
  const { trimmed: safeTrimmed, url: parsed } = base;

  // YouTube — accept watch / youtu.be / shorts / embed / live URLs.
  if (type === "youtube") {
    const id = youtubeIdOf(safeTrimmed);
    if (!id) {
      return fail("YOUTUBE_URL_INVALID", "That doesn't look like a YouTube link. Use a watch, youtu.be, Shorts or embed URL.");
    }
    const watch = watchUrlOf(id);
    return {
      ok: true,
      canonical: {
        url: watch,
        embedUrl: "",
        youtubeUrl: watch,
        youtubeVideoId: id,
        provider: "youtube",
        contentType: "video/youtube",
      },
    };
  }

  // Google family types must match their own family — a Docs link cannot be
  // added as "Google Sheets".
  if (GOOGLE_FAMILY_BY_TYPE[type]) {
    const expectedKind = GOOGLE_FAMILY_BY_TYPE[type];
    const family = googleFamilyOf(trimmed);
    if (!family || family.kind !== expectedKind) {
      const actual = family && GOOGLE_FAMILY_LABELS[family.kind];
      return fail(
        "GOOGLE_KIND_MISMATCH",
        actual
          ? `That's a ${actual} link — choose ${GOOGLE_FAMILY_LABELS[expectedKind]} for it, or paste a ${GOOGLE_FAMILY_LABELS[expectedKind]} URL.`
          : `Paste a Google ${GOOGLE_FAMILY_LABELS[expectedKind]} link (docs.google.com/${expectedKind === "document" ? "document" : expectedKind}/d/…).`,
      );
    }
    const canonical = canonicalGoogleUrl(expectedKind, family.id);
    return {
      ok: true,
      canonical: {
        url: canonical,
        embedUrl: "",
        provider: "google",
        contentType: `google_${expectedKind}`,
      },
    };
  }

  // Google Forms — any docs.google.com/forms or forms.gle URL.
  if (type === "google_form") {
    const family = googleFamilyOf(trimmed);
    if (!family || family.kind !== "forms") {
      if (family && family.kind !== "forms") {
        return fail(
          "GOOGLE_KIND_MISMATCH",
          `That's a ${GOOGLE_FAMILY_LABELS[family.kind] || "Google"} link — paste a Google Forms link instead.`,
        );
      }
      return fail("FORM_URL_INVALID", "Paste a Google Forms link (docs.google.com/forms/… or forms.gle/…).");
    }
    const canonical = canonicalGoogleFormUrl(trimmed);
    if (!canonical) return fail("FORM_URL_INVALID", "Paste a Google Forms link (docs.google.com/forms/… or forms.gle/…).");
    return {
      ok: true,
      canonical: {
        url: canonical,
        embedUrl: canonical,
        provider: "google",
        contentType: "google_form",
      },
    };
  }

  // Direct media files — extension or Drive-hosted only (never a web page).
  if (type === "video" || type === "audio") {
    const ext = pathExtension(parsed);
    const accepted = type === "video" ? VIDEO_EXTS : AUDIO_EXTS;
    if (!isDriveFileUrl(parsed) && (!ext || !accepted.includes(ext))) {
      return fail(
        type === "video" ? "VIDEO_URL_INVALID" : "AUDIO_URL_INVALID",
        type === "video"
          ? "Paste a direct video file link (e.g. …/lesson.mp4 or .webm). Web pages can't play as videos."
          : "Paste a direct audio file link (e.g. …/podcast.mp3 or .m4a). Web pages can't play as audio.",
      );
    }
    const mimeMain = type === "video" ? "video" : "audio";
    const contentType = ext
      ? `${mimeMain}/${ext === "m4v" ? "mp4" : ext}`
      : (type === "video" ? "video/mp4" : "audio/mpeg");
    return {
      ok: true,
      canonical: {
        url: trimmed,
        embedUrl: trimmed,
        provider: isDriveFileUrl(parsed) ? "google-drive" : "direct",
        contentType,
      },
    };
  }

  // PDF — .pdf or a Drive file (what the existing PDF viewer supports).
  if (type === "pdf") {
    const ext = pathExtension(parsed);
    if (!isDriveFileUrl(parsed) && ext !== "pdf") {
      return fail(
        "PDF_URL_INVALID",
        "Paste a link to the PDF itself (ending in .pdf) or a Google Drive file link.",
      );
    }
    return {
      ok: true,
      canonical: {
        url: trimmed,
        embedUrl: trimmed,
        provider: isDriveFileUrl(parsed) ? "google-drive" : "direct",
        contentType: "application/pdf",
      },
    };
  }

  // E-books — keep the existing fallback behaviour: PDFs render natively,
  // other formats go through the Google Docs viewer, so any public file URL
  // is accepted here (extensions still get an accurate contentType).
  if (type === "ebook") {
    const ext = pathExtension(parsed) || "pdf";
    return {
      ok: true,
      canonical: {
        url: trimmed,
        embedUrl: trimmed,
        provider: isDriveFileUrl(parsed) ? "google-drive" : "direct",
        contentType: ext === "pdf" ? "application/pdf" : `application/${ext}`,
      },
    };
  }

  // Images — direct image files (or Drive).
  if (type === "image") {
    const ext = pathExtension(parsed);
    if (!isDriveFileUrl(parsed) && (!ext || !IMAGE_EXTS.includes(ext))) {
      return fail(
        "IMAGE_URL_INVALID",
        "Paste a direct image link (ending in .png, .jpg, .gif, .webp…) or a Google Drive file link.",
      );
    }
    return {
      ok: true,
      canonical: {
        url: trimmed,
        embedUrl: trimmed,
        provider: isDriveFileUrl(parsed) ? "google-drive" : "direct",
        contentType: ext ? `image/${ext === "jpg" ? "jpeg" : ext}` : "",
      },
    };
  }

  // Embed / Website — strong URL validation only; the iframe sandbox of the
  // existing viewer is the security boundary (never relaxed for personal
  // content). Private/local hosts are rejected because they can never render
  // for the learner anyway.
  if (type === "embed") {
    if (isPrivateHost(parsed.hostname)) {
      return fail(
        "EMBED_URL_INVALID",
        "This website can't be embedded (private or local address). Paste a public https:// website URL.",
      );
    }
    return {
      ok: true,
      canonical: {
        url: trimmed,
        embedUrl: trimmed,
        provider: "external",
        contentType: "",
      },
    };
  }

  // Mindmaps — Whimsical URLs (the only host the existing mindmap viewer
  // renders); canonicalized to the embed form.
  if (type === "mindmap") {
    const id = whimsicalIdOf(trimmed);
    if (!id) {
      return fail(
        "MINDMAP_URL_INVALID",
        "Paste a Whimsical mind-map link (whimsical.com/…). Other mind-map hosts can't open in the player yet.",
      );
    }
    const embed = `https://whimsical.com/embed/${encodeURIComponent(id)}`;
    return {
      ok: true,
      canonical: {
        url: embed,
        embedUrl: embed,
        provider: "whimsical_mindmap",
        contentType: "mindmap",
      },
    };
  }

  return fail("TYPE_UNKNOWN", "This resource type isn't supported.");
};

// ---------------------------------------------------------------------------
// Structure validation (server + client share these caps).
// ---------------------------------------------------------------------------

const cleanText = (value, max, { required = false, label = "Value" } = {}) => {
  const trimmed = String(value ?? "").trim();
  if (required && !trimmed) return { error: { field: label, code: "REQUIRED", message: `${label} is required.` } };
  if (trimmed.length > max) {
    return { error: { field: label, code: "TOO_LONG", message: `${label} must be under ${max} characters.` } };
  }
  return { value: trimmed };
};

/**
 * Validate a module create/edit payload. Never trusts ids or ownership from
 * the client — only display content + the (optional) sort target.
 */
export const sanitizePersonalModuleInput = (raw) => {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const title = cleanText(source.title, PERSONAL_MODULE_TITLE_MAX, { required: true, label: "Module title" });
  if (title.error) return { ok: false, errors: [title.error] };
  const description = cleanText(source.description, PERSONAL_MODULE_DESC_MAX, { label: "Description" });
  if (description.error) return { ok: false, errors: [description.error] };
  return {
    ok: true,
    value: {
      title: title.value,
      description: description.value || "",
    },
  };
};

const defaultResourceName = (type, canonical) => {
  const label = personalCourseTypeLabel(type);
  if (type === "youtube") return `YouTube — ${canonical.youtubeVideoId || label}`;
  try {
    const url = new URL(canonical.url || "");
    if (type === "video" || type === "audio" || type === "pdf" || type === "ebook" || type === "image") {
      const base = url.pathname.split("/").filter(Boolean).pop() || "";
      const name = base.replace(/\.[a-z0-9]{1,8}$/i, "").replace(/[-_]+/g, " ").trim();
      if (name && name.length <= PERSONAL_RESOURCE_NAME_MAX) return name;
    }
  } catch {
    /* fall through to the label */
  }
  return label;
};

/**
 * Validate a resource create/edit payload: type ∈ the 12, name within caps,
 * URL normalized through the central layer. Output is exactly the shape the
 * server stores (the renderer's CourseFile vocabulary).
 */
export const sanitizePersonalResourceInput = (raw, { allowedTypes = null } = {}) => {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const type = String(source.type || "").trim();
  if (!isPersonalCourseType(type)) {
    return { ok: false, errors: [{ field: "type", code: "TYPE_UNKNOWN", message: "This resource type isn't supported." }] };
  }
  if (allowedTypes && Array.isArray(allowedTypes) && !allowedTypes.includes(type)) {
    return {
      ok: false,
      errors: [{
        field: "type",
        code: "TYPE_NOT_ALLOWED",
        message: `"${personalCourseTypeLabel(type)}" isn't included in your plan's allowed resource types.`,
      }],
    };
  }
  const name = cleanText(source.name, PERSONAL_RESOURCE_NAME_MAX, { label: "Resource name" });
  if (name.error) return { ok: false, errors: [name.error] };
  const description = cleanText(source.description, PERSONAL_RESOURCE_DESC_MAX, { label: "Description" });
  if (description.error) return { ok: false, errors: [description.error] };

  const normalized = normalizePersonalResourceUrl(type, source.url);
  if (!normalized.ok) {
    return { ok: false, errors: [{ field: "url", code: normalized.code, message: normalized.message }] };
  }
  const canonical = normalized.canonical || {};
  return {
    ok: true,
    value: {
      type,
      name: name.value || defaultResourceName(type, canonical),
      description: description.value || "",
      url: canonical.url || "",
      embedUrl: canonical.embedUrl || "",
      youtubeUrl: canonical.youtubeUrl || "",
      youtubeVideoId: canonical.youtubeVideoId || "",
      provider: canonical.provider || "",
      contentType: canonical.contentType || "",
      sourceUrl: String(source.url || "").trim().slice(0, PERSONAL_URL_MAX),
      metadata: source.metadata && typeof source.metadata === "object" && !Array.isArray(source.metadata)
        ? Object.fromEntries(
            Object.entries(source.metadata)
              .slice(0, PERSONAL_METADATA_KEYS_MAX)
              .map(([key, entry]) => [String(key).slice(0, 40), String(entry).slice(0, 200)]),
          )
        : {},
    },
  };
};

/** Validate a sanitized module/resource id reference. */
export const isValidPersonalId = (value) => {
  const id = String(value || "");
  return id.length > 0 && id.length <= PERSONAL_ID_MAX && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id);
};

// ---------------------------------------------------------------------------
// AI-context honesty + provenance.
//
// The Course Player's AI bridge must know when the active resource is
// personal AND must never pretend it can read content it cannot. This helper
// is the single honest answer for personal resources. Screenshot-based
// assistance can be layered on later where the architecture permits it.
// ---------------------------------------------------------------------------

/**
 * Which personal-resource content an AI/context layer can actually read
 * today through legitimate paths:
 *
 *   youtube      — no transcript pipeline exists yet → unavailable.
 *   pdf / ebook  — readable only when the URL is a direct file the app could
 *                  fetch server-side; today no such pipeline exists → honest
 *                  "unavailable", a screenshot path can help later.
 *   video/audio/image — media understanding not implemented → unavailable.
 *   google_form/embed/mindmap — cross-origin DOM is never scraped; private
 *                  forms are never claimed readable → unavailable.
 *
 * `screenshotSupported` is exposed for a future screenshot-based assist path
 * (the architecture's existing permission model decides then, not here).
 */
export const personalAiAvailability = (fileOrType) => {
  const type = typeof fileOrType === "string" ? fileOrType : String(fileOrType?.type || "");
  switch (type) {
    case "youtube":
      return {
        readable: false,
        reason: "Transcripts for personal YouTube videos aren't available in the app yet.",
        screenshotSupported: false,
      };
    case "pdf":
    case "ebook":
      return {
        readable: false,
        reason: "Reading text out of personal PDF/e-book files isn't supported yet.",
        screenshotSupported: false,
      };
    case "video":
      return {
        readable: false,
        reason: "Understanding video content isn't supported yet.",
        screenshotSupported: false,
      };
    case "audio":
      return {
        readable: false,
        reason: "Transcribing personal audio isn't supported yet.",
        screenshotSupported: false,
      };
    case "image":
      return {
        readable: false,
        reason: "Analysing personal images isn't supported yet.",
        screenshotSupported: false,
      };
    case "google_form":
      return {
        readable: false,
        reason: "Form responses are private to the form owner and can't be read here.",
        screenshotSupported: false,
      };
    case "embed":
      return {
        readable: false,
        reason: "Embedded websites are never scraped — their content can't be read.",
        screenshotSupported: false,
      };
    case "mindmap":
      return {
        readable: false,
        reason: "Mind-map contents can't be read from the embedded view.",
        screenshotSupported: false,
      };
    default:
      return {
        readable: false,
        reason: "Content isn't readable by the AI assistant yet.",
        screenshotSupported: false,
      };
  }
};

/** Human provenance label: "My Modules → {module} → {resource}". */
export const personalProvenanceLabel = (moduleTitle, resourceName) => {
  const modulePart = String(moduleTitle || "").trim();
  const namePart = String(resourceName || "").trim();
  if (modulePart && namePart) return `My Modules → ${modulePart} → ${namePart}`;
  if (modulePart) return `My Modules → ${modulePart}`;
  return namePart ? `My Modules → ${namePart}` : "My Modules";
};
