// Global revision catalog bridge.
//
// The admin panel edits the single source of truth (a Firestore document in
// the public-read `settings` collection). Learners' revision engine stays
// local/offline, and `syncRevisionCatalog` pulls a newer published catalog
// version into the local DB whenever it sees one — same optimisation approach
// as the rest of the revision feature.

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { SEED_QUESTIONS, SEED_SUBJECTS, SEED_TOPICS } from "../data/seedData";
import {
  applyCatalog,
  buildDbFromCatalog,
  DEFAULT_CUSTOMIZATION_LIMITS,
  DEFAULT_SETTINGS,
  loadDb,
  type CatalogClass,
  type CatalogQuestion,
  type CatalogSubject,
  type CatalogTopic,
  type CustomizationLimits,
  type RevisionCatalogInput,
  type RevisionSettings,
} from "./store";
import {
  defaultCatalogAiSettings,
  normalizeCatalogAiSettings,
  type CatalogAiSettings,
} from "./aiConfig";
import { normalizePlanningCurriculum, type PlanningCurriculum } from "./curriculumCatalog";

export const REVISION_CATALOG_DOC_ID = "revisionCatalog";

export type RevisionCatalog = {
  version: number;
  settings: RevisionSettings;
  classes: CatalogClass[];
  customizationLimits: CustomizationLimits;
  subjects: CatalogSubject[];
  topics: CatalogTopic[];
  questions: CatalogQuestion[];
  /** AI provider + default model the admin publishes for every user. */
  aiSettings: CatalogAiSettings;
  /** Latest-year Class → Subject → Chapter → Concept tree for the planner. */
  planningCurriculum: PlanningCurriculum | null;
};

export function defaultCatalog(): RevisionCatalog {
  return {
    version: 0,
    settings: { ...DEFAULT_SETTINGS },
    classes: [],
    customizationLimits: { ...DEFAULT_CUSTOMIZATION_LIMITS },
    subjects: SEED_SUBJECTS.map((s) => ({ ...s })),
    topics: SEED_TOPICS.map((t) => ({ ...t })),
    questions: SEED_QUESTIONS.map((q) => ({ ...q, isActive: true })),
    aiSettings: defaultCatalogAiSettings(),
    planningCurriculum: null,
  };
}

function cleanStr(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Sanitize a Firestore document into a usable RevisionCatalog (or null). */
export function normalizeCatalog(data: unknown): RevisionCatalog | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = data as Record<string, unknown>;

  // AI settings must still parse even when the question bank arrays are
  // missing — otherwise School-provided AI stays disabled after a publish.
  const subjectRows = Array.isArray(raw.subjects) ? raw.subjects : [];
  const topicRows = Array.isArray(raw.topics) ? raw.topics : [];
  const questionRows = Array.isArray(raw.questions) ? raw.questions : [];

  const subjects: CatalogSubject[] = subjectRows.map((s) => {
    const item = (s ?? {}) as Record<string, unknown>;
    return {
      name: cleanStr(item.name, "Subject"),
      slug: cleanStr(item.slug, `subject-${Math.random().toString(36).slice(2, 8)}`),
      icon: cleanStr(item.icon, "📘"),
      color: cleanStr(item.color, "indigo"),
    };
  });

  const topics: CatalogTopic[] = topicRows.map((t) => {
    const item = (t ?? {}) as Record<string, unknown>;
    return {
      subjectSlug: cleanStr(item.subjectSlug),
      name: cleanStr(item.name, "Topic"),
      slug: cleanStr(item.slug, `topic-${Math.random().toString(36).slice(2, 8)}`),
    };
  });

  const questions: CatalogQuestion[] = questionRows
    .map((q) => {
      const item = (q ?? {}) as Record<string, unknown>;
      const options = Array.isArray(item.options)
        ? item.options.map((o) => cleanStr(o)).filter((o) => o.length > 0)
        : [];
      if (options.length < 2) return null;
      const correctIndex = Math.max(0, Math.min(options.length - 1, Math.round(Number(item.correctIndex ?? 0) || 0)));
      const difficulty = ["easy", "medium", "hard"].includes(String(item.difficulty))
        ? (String(item.difficulty) as CatalogQuestion["difficulty"])
        : "medium";
      return {
        topicSlug: cleanStr(item.topicSlug),
        difficulty,
        prompt: cleanStr(item.prompt).trim(),
        options,
        correctIndex,
        explanation: cleanStr(item.explanation),
        isActive: item.isActive !== false,
      };
    })
    .filter((q): q is CatalogQuestion => Boolean(q) && q!.prompt.length > 0 && q!.topicSlug.length > 0);

  const settings: RevisionSettings = {
    ...DEFAULT_SETTINGS,
    ...(typeof raw.settings === "object" && raw.settings ? (raw.settings as Partial<RevisionSettings>) : {}),
  };

  const classes: CatalogClass[] = Array.isArray(raw.classes)
    ? raw.classes.map((c) => {
        const item = (c ?? {}) as Record<string, unknown>;
        return {
          name: cleanStr(item.name, "Class"),
          slug: cleanStr(item.slug, `class-${Math.random().toString(36).slice(2, 8)}`),
          icon: cleanStr(item.icon, "🎓"),
          subjectSlugs: Array.isArray(item.subjectSlugs) ? item.subjectSlugs.map((s) => cleanStr(s)).filter(Boolean) : [],
        };
      })
    : [];

  const customizationLimits: CustomizationLimits = {
    ...DEFAULT_CUSTOMIZATION_LIMITS,
    ...(typeof raw.customizationLimits === "object" && raw.customizationLimits
      ? (raw.customizationLimits as Partial<CustomizationLimits>)
      : {}),
  };

  return {
    version: Math.max(0, Math.round(Number(raw.version ?? 0) || 0)),
    settings,
    classes,
    customizationLimits,
    subjects,
    topics,
    questions,
    aiSettings: normalizeCatalogAiSettings(raw.aiSettings),
    planningCurriculum: normalizePlanningCurriculum(raw.planningCurriculum),
  };
}

/** Convert a catalog into the local row shape (for the admin preview). */
export function catalogToInput(catalog: RevisionCatalog): RevisionCatalogInput {
  return {
    settings: catalog.settings,
    classes: catalog.classes ?? [],
    customizationLimits: catalog.customizationLimits ?? {},
    subjects: catalog.subjects,
    topics: catalog.topics,
    questions: catalog.questions,
  };
}

export function buildLocalDbFromCatalog(catalog: RevisionCatalog) {
  return buildDbFromCatalog(catalogToInput(catalog));
}

/** Read the published catalog from Firestore (public read; null when absent). */
export async function fetchRemoteCatalog(): Promise<RevisionCatalog | null> {
  try {
    const snap = await getDoc(doc(db, "settings", REVISION_CATALOG_DOC_ID));
    if (!snap.exists()) return null;
    const data = snap.data();
    const catalog = normalizeCatalog(data);
    if (catalog) return catalog;
    const fallback = defaultCatalog();
    fallback.aiSettings = normalizeCatalogAiSettings((data as { aiSettings?: unknown } | undefined)?.aiSettings);
    fallback.planningCurriculum = normalizePlanningCurriculum((data as { planningCurriculum?: unknown } | undefined)?.planningCurriculum);
    fallback.version = Math.max(0, Math.round(Number((data as { version?: unknown } | undefined)?.version ?? 0) || 0));
    return fallback;
  } catch {
    return null;
  }
}

/** Admin-only write. Persists the whole catalog with an incremented version. */
export async function saveRemoteCatalog(catalog: RevisionCatalog): Promise<RevisionCatalog> {
  const nextVersion = (catalog.version || 0) + 1;
  const payload = {
    version: nextVersion,
    settings: { ...DEFAULT_SETTINGS, ...catalog.settings },
    classes: catalog.classes ?? [],
    customizationLimits: { ...DEFAULT_CUSTOMIZATION_LIMITS, ...catalog.customizationLimits },
    subjects: catalog.subjects,
    topics: catalog.topics,
    questions: catalog.questions,
    aiSettings: catalog.aiSettings ?? defaultCatalogAiSettings(),
    planningCurriculum: catalog.planningCurriculum ?? null,
    updatedAt: serverTimestamp(),
  };
  await setDoc(doc(db, "settings", REVISION_CATALOG_DOC_ID), payload, { merge: true });
  return { ...catalog, version: nextVersion };
}

/**
 * Pull a newer published catalog into the learner's local engine DB.
 * Returns true when the local DB was updated (so the UI can re-render).
 */
export async function syncRevisionCatalog(uid: string): Promise<boolean> {
  const remote = await fetchRemoteCatalog();
  if (!remote || remote.version <= 0) return false;
  const local = loadDb(uid);
  if (remote.version <= local.catalogVersion) return false;
  applyCatalog(
    uid,
    {
      settings: remote.settings,
      classes: remote.classes ?? [],
      customizationLimits: remote.customizationLimits ?? {},
      subjects: remote.subjects,
      topics: remote.topics,
      questions: remote.questions,
    },
    remote.version,
  );
  return true;
}
