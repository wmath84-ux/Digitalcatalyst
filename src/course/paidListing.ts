// src/course/paidListing.ts
//
// THE PAID PAGE'S LIST — what can be bought, each thing exactly ONCE.
//
// Owner brief (2026-10-16):
//
//   "Course player ke andar paid page per jo bhi dikhaye ja rahe hain paid
//    module — vah baar-baar dikhaye ja rahe hain, repeat ho rahe hain; ek hi
//    baar dikhna chahiye. Aur lock sabhi resources per nahin: agar folder hai
//    to keval folder per ek baar, aur alag-alag resources hai to sab per
//    individual lock."
//
// So this file answers one question — which paid things deserve a row, and
// where does the lock go — and the overlay only draws what it returns:
//
//   · an UPDATE is a folder: one row, its price, and its contents inside;
//   · a MODULE that some published update already covers is NOT a second row
//     (that was the repeat: the same paid module listed once inside its
//     update's contents and once as its own folder);
//   · a MODULE nobody covers, and that is not already inside a listed
//     ancestor's folder, gets its own row;
//   · the LOCK sits on the folder once. A paid thing with no contents at all
//     is not a folder — it is one resource, so it carries its own single lock.
//
// Everything here is pure: the same inputs always give the same rows, no React,
// no storage. `tests/paidListing.test.mjs` drives it directly.

import type { CourseModule, PaidCourseUpdate } from "../types/course";

/** One purchasable thing, exactly once. */
export interface PaidContentEntry {
  /** The update's id, the module's id, or the resource file's id. */
  id: string;
  kind: "update" | "module" | "resource";
  title: string;
  /**
   * The product detail page's own row key (`utils/pdpPaidContent` builds
   * `update:<id>` / `module:<id>`), so a click here can land on that exact
   * row over there.
   */
  paidKey: string;
  /** `₹1,299` — or null when no price is published for this thing. */
  priceLabel: string | null;
  /** The locked contents, deduped, in the order the course declares them. */
  contents: string[];
  /** How deep the module sits in the course tree (updates are 0). */
  depth: number;
  /** The update that covers this module, when one is published. */
  updateId: string | null;
  /** Where the lock goes: the folder's head, or this row itself. */
  lock: "folder" | "self";
}

const text = (value: unknown) => String(value ?? "").trim();

/** `₹1,299` — the price mark both this page and the PDP use. */
export const paidPriceLabel = (value: number | string | null | undefined): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return `₹${value.toLocaleString("en-IN")}`;
  const raw = text(value);
  return raw ? raw : null;
};

/** Names, deduped by their trimmed lowercase form, empty ones dropped. */
const uniqueNames = (names: readonly unknown[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const label = text(name);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
};

/** Every module in the tree, with its depth and the ids of its ancestors. */
const walkModules = (modules: readonly CourseModule[]) => {
  const out: { module: CourseModule; depth: number; ancestors: string[] }[] = [];
  const visit = (list: readonly CourseModule[], depth: number, ancestors: string[]) => {
    for (const module of list || []) {
      const id = String(module.id);
      out.push({ module, depth, ancestors });
      visit(module.modules || [], depth + 1, [...ancestors, id]);
    }
  };
  visit(modules || [], 0, []);
  return out;
};

const visibleFiles = (module: CourseModule) =>
  (module.files || []).filter((file) => String(file?.type || "") !== "hidden");

export function buildPaidEntries({
  updates,
  modules,
  ownedUpdateIds,
}: {
  updates: readonly PaidCourseUpdate[];
  modules: readonly CourseModule[];
  /** Updates the learner already owns — those are off the Paid page. */
  ownedUpdateIds: ReadonlySet<string>;
}): PaidContentEntry[] {
  const entries: PaidContentEntry[] = [];
  const listedUpdateIds = new Set<string>();
  const listedModuleIds = new Set<string>();
  const seenUpdateIds = new Set<string>();

  // ── 1 · Every published update, once ───────────────────────────────────
  // The course may hand the same update over twice (a product edit can leave
  // two entries with one id); the learner must still see one row.
  for (const update of updates || []) {
    const id = text(update?.id);
    if (!id || seenUpdateIds.has(id) || ownedUpdateIds.has(id)) continue;
    seenUpdateIds.add(id);
    listedUpdateIds.add(id);
    const contents = uniqueNames(update.contentNames || []);
    entries.push({
      id,
      kind: "update",
      title: text(update.title) || "Paid update",
      paidKey: `update:${id}`,
      priceLabel: paidPriceLabel(update.price),
      contents,
      depth: 0,
      updateId: id,
      lock: contents.length ? "folder" : "self",
    });
  }

  // ── 2 · The paid modules and resources nobody covers, once each ─────────
  // A module whose update is already listed is that update's CONTENT: showing
  // it as its own folder is the repeat the owner reported. A module inside an
  // already-listed folder is skipped for the same reason. A locked resource
  // gets its own row ONLY when it stands alone — inside a listed folder it is
  // that folder's content, and its lock belongs to the folder.
  const listedResourceIds = new Set<string>();
  for (const { module, depth, ancestors } of walkModules(modules)) {
    // A hidden module is not part of the course at all — nothing in it can be
    // bought or even seen.
    if (module.accessLevel === "hidden") continue;
    const moduleId = text(module.id);
    const moduleUpdateId = module.paidUpdateId ? text(module.paidUpdateId) : "";
    const coveredByListedUpdate = moduleUpdateId
      ? listedUpdateIds.has(moduleUpdateId) || ownedUpdateIds.has(moduleUpdateId)
      : false;
    const insideListedFolder = ancestors.some((ancestor) => listedModuleIds.has(ancestor));
    const isPaidModule = module.accessLevel === "paidUpdate" && Boolean(moduleUpdateId);

    if (isPaidModule && !coveredByListedUpdate && !insideListedFolder && !listedModuleIds.has(moduleId)) {
      const contents = uniqueNames(visibleFiles(module).map((file) => file.name));
      listedModuleIds.add(moduleId);
      entries.push({
        id: moduleId,
        kind: "module",
        title: text(module.title) || "Paid module",
        paidKey: `module:${moduleId}`,
        priceLabel: paidPriceLabel(module.paidUpdatePrice) ?? null,
        contents,
        depth,
        updateId: moduleUpdateId || null,
        lock: contents.length ? "folder" : "self",
      });
      continue;
    }

    // A locked resource of its own: no listed folder holds it.
    if (insideListedFolder || listedModuleIds.has(moduleId)) continue;
    for (const file of visibleFiles(module)) {
      const fileId = text(file.id);
      if (!fileId || listedResourceIds.has(fileId)) continue;
      if (file.accessLevel !== "paidUpdate" || !file.paidUpdateId) continue;
      const fileUpdateId = text(file.paidUpdateId);
      if (listedUpdateIds.has(fileUpdateId) || ownedUpdateIds.has(fileUpdateId)) continue;
      listedResourceIds.add(fileId);
      entries.push({
        id: fileId,
        kind: "resource",
        title: text(file.name) || "Paid resource",
        paidKey: `resource:${fileId}`,
        priceLabel: paidPriceLabel(file.paidUpdatePrice) ?? null,
        contents: [],
        depth: depth + 1,
        updateId: fileUpdateId || null,
        // One resource, so the lock is its own — the owner's "alag-alag
        // resources hai to sab per individual lock".
        lock: "self",
      });
    }
  }

  return entries;
}

/**
 * The price mark for a module entry: its own published price, else the price of
 * the update that owns it, else its update's title as the last resort — the
 * three-step fallback the Paid page has always shown.
 */
export function modulePriceLabel(
  entry: PaidContentEntry,
  updates: readonly PaidCourseUpdate[],
): string | null {
  if (entry.kind !== "module") return entry.priceLabel;
  if (entry.priceLabel) return entry.priceLabel;
  const owner = (updates || []).find((update) => text(update.id) === entry.updateId);
  return owner ? paidPriceLabel(owner.price) : null;
}
