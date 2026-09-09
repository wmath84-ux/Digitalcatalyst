// utils/studyPacks.js
// Pure Study Pack / Study Stack helpers — no Firestore.

import { isFreePlanDefault, isPersonalCourseType, personalAiAvailability } from "./personalCourse.js";

export const STUDY_PACK_TITLE_MAX = 120;
export const STUDY_PACK_DESC_MAX = 600;
export const STUDY_PACK_ID_RE = /^spk[a-zA-Z0-9]{16,48}$/;
export const STUDY_PACK_VISIBILITIES = Object.freeze(["private", "unlisted", "public"]);

export const defaultStudyPacksForPlan = (planId, monthlyPricePaise, yearlyPricePaise) => {
  const free = isFreePlanDefault(planId, monthlyPricePaise, yearlyPricePaise);
  const paid = {
    creationEnabled: true,
    maxPublishedPacks: 25,
    maxImportsPerMonth: 40,
    studyStackEnabled: true,
    maxStudyStacks: 20,
  };
  const limited = {
    creationEnabled: false,
    maxPublishedPacks: 1,
    maxImportsPerMonth: 8,
    studyStackEnabled: true,
    maxStudyStacks: 3,
  };
  const slice = free ? limited : paid;
  return { monthly: { ...slice }, yearly: { ...slice } };
};

const clampLimit = (value, fallback, max) => {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return fallback;
  if (number === -1) return -1;
  return Math.max(0, Math.min(max, number));
};

const normalizeSlice = (raw, fallback) => {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    creationEnabled: typeof source.creationEnabled === "boolean" ? source.creationEnabled : fallback.creationEnabled,
    maxPublishedPacks: clampLimit(source.maxPublishedPacks, fallback.maxPublishedPacks, 500),
    maxImportsPerMonth: clampLimit(source.maxImportsPerMonth, fallback.maxImportsPerMonth, 500),
    studyStackEnabled: typeof source.studyStackEnabled === "boolean" ? source.studyStackEnabled : fallback.studyStackEnabled,
    maxStudyStacks: clampLimit(source.maxStudyStacks, fallback.maxStudyStacks, 200),
  };
};

export const normalizePlanStudyPacks = (rawPlan, planId = "") => {
  const raw = rawPlan && typeof rawPlan === "object" && !Array.isArray(rawPlan) ? rawPlan : {};
  const block = raw.studyPacks && typeof raw.studyPacks === "object" ? raw.studyPacks : {};
  const toPaiseish = (value) => (value === null || value === undefined || value === "" ? Number.NaN : Number(value) * 100);
  const monthlyPricePaise = toPaiseish(raw.monthlyPrice ?? raw.monthlyPricePaise ?? raw.priceMonthly);
  const yearlyPricePaise = toPaiseish(raw.yearlyPrice ?? raw.yearlyPricePaise ?? raw.priceYearly);
  const defaults = defaultStudyPacksForPlan(planId, monthlyPricePaise, yearlyPricePaise);
  return {
    monthly: normalizeSlice(block.monthly, defaults.monthly),
    yearly: normalizeSlice(block.yearly, defaults.yearly),
  };
};

export const studyPacksCycle = (config, cycle) => {
  const safe = config && typeof config === "object" ? config : {};
  const slice = cycle === "yearly" ? safe.yearly : safe.monthly;
  return normalizeSlice(slice, defaultStudyPacksForPlan("paid", 100, 100).monthly);
};

export const isValidStudyPackId = (value) => STUDY_PACK_ID_RE.test(String(value || ""));

export const sanitizeStudyPackMeta = (raw) => {
  const source = raw && typeof raw === "object" ? raw : {};
  const title = String(source.title || "").trim();
  const description = String(source.description || "").trim();
  const errors = [];
  if (!title) errors.push({ field: "title", code: "REQUIRED", message: "Give the Study Pack a title." });
  if (title.length > STUDY_PACK_TITLE_MAX) errors.push({ field: "title", code: "TOO_LONG", message: `Title must be under ${STUDY_PACK_TITLE_MAX} characters.` });
  if (description.length > STUDY_PACK_DESC_MAX) errors.push({ field: "description", code: "TOO_LONG", message: `Description must be under ${STUDY_PACK_DESC_MAX} characters.` });
  const visibility = STUDY_PACK_VISIBILITIES.includes(String(source.visibility)) ? String(source.visibility) : "unlisted";
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { title, description, visibility } };
};

export const countResourceTypes = (resources) => {
  const counts = {};
  for (const item of Array.isArray(resources) ? resources : []) {
    const type = isPersonalCourseType(item?.type) ? String(item.type) : "embed";
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
};

export const packAvailabilitySummary = (resources) => {
  const rows = Array.isArray(resources) ? resources : [];
  return rows.map((item) => {
    const availability = personalAiAvailability(item?.type);
    return {
      id: String(item?.id || ""),
      name: String(item?.name || "Resource"),
      type: String(item?.type || "embed"),
      readable: Boolean(availability.readable),
      reason: availability.reason,
    };
  });
};

export const importMonthKey = (now = Date.now()) => {
  const date = new Date(now);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};
