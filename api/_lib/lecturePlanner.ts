// api/_lib/lecturePlanner.ts
//
// Server-side lookup for the FlowPath lecture picker. The picker
// is a 3-step wizard:
//
//   1. Pick a course (search + category filter).
//   2. Pick a module within that course (only if the course has
//      modules — flat courses skip this step).
//   3. Confirm + schedule.
//
// The data source is the existing siteProducts collection
// (same source the admin Products page reads). The full module
// list is built from the same `courseContent` tree the AI
// revision engine and the course player read — so the picker
// never goes out of sync with the actual product.
//
// "Preview-only" handling:
//
//   A user can schedule a lecture for a course they do NOT own
//   yet. The activity is persisted with `lecturePreviewOnly:
//   true`, the deep link points to the product page (PDP), and
//   the bell entry's `target.productId` lets the notifications
//   page route the user to the buy flow. This matches the
//   "browse-only" mode already established in the My Day free
//   tier — admins and the user can plan a future course
//   purchase without blocking the schedule.

import { adminDb } from "./firebaseAdmin.js";

export type LectureCourseOption = {
  id: string;
  title: string;
  category: string | null;
  productType: string | null;
  image: string | null;
  moduleCount: number;
  previewOnly: boolean;
};

export type LectureModuleOption = {
  id: string;
  title: string;
  description: string | null;
  order: number;
};

const text = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

const flattenModules = (
  courseContent: unknown,
): Array<{ id: string; title: string; description: string; order: number }> => {
  const out: Array<{ id: string; title: string; description: string; order: number }> = [];
  if (!Array.isArray(courseContent)) return out;
  let counter = 0;
  const walk = (items: unknown) => {
    if (!Array.isArray(items)) return;
    for (const m of items) {
      if (!m || typeof m !== "object") continue;
      const node = m as Record<string, unknown>;
      const id = text(node.id, 200);
      const title = text(node.title, 200);
      if (!id || !title) continue;
      out.push({
        id,
        title,
        description: text(node.description, 500),
        order: counter++,
      });
      const children = node.modules ?? node.children;
      if (children) walk(children);
    }
  };
  walk(courseContent);
  return out;
};

export async function getLectureCourses(uid: string, q: string): Promise<LectureCourseOption[]> {
  const db = adminDb();
  const snap = await db.collection("siteProducts").limit(500).get();
  const purchased = await getPurchasedProductIds(uid);
  const needle = q.trim().toLowerCase();
  const out: LectureCourseOption[] = [];
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const title = text(data.title, 200);
    if (!title) continue;
    const category = text(data.category, 120) || null;
    const productType = text(data.productType, 30) || null;
    if (needle) {
      const haystack = `${title} ${category || ""} ${productType || ""} ${text(data.id, 200)}`.toLowerCase();
      if (!haystack.includes(needle)) continue;
    }
    const modules = flattenModules(data.courseContent);
    const idKeys = [doc.id, Number(doc.id)].filter((v) => Number.isFinite(v));
    const owned = idKeys.some((key) => purchased.has(String(key))) || purchased.has(doc.id);
    const firstImage = Array.isArray(data.images) && data.images[0] && typeof (data.images[0] as { url?: unknown }).url === "string"
      ? String((data.images[0] as { url: string }).url)
      : null;
    out.push({
      id: doc.id,
      title,
      category,
      productType,
      image: firstImage,
      moduleCount: modules.length,
      previewOnly: !owned,
    });
  }
  // Owned courses first, then preview-only. Within each group,
  // alphabetical so the picker is deterministic.
  out.sort((a, b) => {
    if (a.previewOnly !== b.previewOnly) return a.previewOnly ? 1 : -1;
    return a.title.localeCompare(b.title);
  });
  return out.slice(0, 100);
}

export async function getLectureModules(productId: string): Promise<LectureModuleOption[]> {
  const db = adminDb();
  const idKeys = [productId, Number(productId)].filter((v) => Number.isFinite(v));
  for (const key of idKeys) {
    const candidate = await db.collection("siteProducts").doc(String(key)).get();
    if (candidate.exists) {
      const data = candidate.data() || {};
      const modules = flattenModules(data.courseContent);
      return modules.map((m) => ({ id: m.id, title: m.title, description: m.description || null, order: m.order }));
    }
  }
  return [];
}

export async function getPurchasedProductIds(uid: string): Promise<Set<string>> {
  const db = adminDb();
  const ids = new Set<string>();
  try {
    const userSnap = await db.collection("users").doc(uid).get();
    if (userSnap.exists) {
      const data = userSnap.data() || {};
      const legacy = (data as { purchasedProductIds?: unknown }).purchasedProductIds;
      if (Array.isArray(legacy)) {
        for (const v of legacy) ids.add(String(v));
      }
    }
  } catch {
    /* user doc may not exist yet */
  }
  try {
    const ents = await db.collectionGroup("entitlements").get();
    for (const doc of ents.docs) {
      const d = doc.data() || {};
      const productId = (d as { productId?: unknown }).productId;
      if (productId !== undefined) ids.add(String(productId));
    }
  } catch {
    /* collection group may be unavailable; that's fine — the
       picker still works, it just labels the course as preview. */
  }
  return ids;
}

/** Same gate as My Day kinds — anyone can schedule. Preview-only
 *  is allowed (see module docs above). Kept as a stub so the
 *  control multiplexer can dispatch the right validator per
 *  kind without special-casing lecture in the caller. */
export async function resolveLectureAccess(): Promise<{ canCreate: boolean; reason?: string }> {
  return { canCreate: true };
}
