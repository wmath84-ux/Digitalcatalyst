// src/joplin/joplinDeepLinks.ts
//
// One route, one parser: `#/my-day`.
//
// Before the cutover the My Day deep link identified a SECTION of the old
// planner (`#/my-day?section=tasks&item=<legacyId>`). Notification documents in
// Firestore, Android alarms already armed on learners' phones and Web Push
// payloads in flight all still carry that form, so it cannot simply stop
// working (§28, §128).
//
// The translation is exact rather than lookup-based: the migration derives every
// Joplin id deterministically from the legacy id (`joplinIds.ts`), so an old
// deep link resolves to the migrated object even on a device that has never seen
// the migration map, and even before the migration finishes.
//
// New links carry canonical ids only:
//
//   #/my-day?note=<noteId>&notebook=<notebookId>
//   #/my-day?notebook=<notebookId>
//   #/my-day?tag=<tagId>
//   #/my-day?schedule=<scheduleId>&view=agenda
//
// The Web Clipper, the scheduler, the notification inbox and the host route all
// build their links through `buildMyDayDeepLink`, so there is exactly one link
// dialect (§61).

import { joplinId, joplinIdForLegacy, scheduleIdForSeries } from "./joplinIds.ts";
import type { LegacyKind } from "./joplinIds.ts";

export const MY_DAY_ROUTE = "#/my-day";

/** Legacy sections the old planner exposed. */
export type LegacySection = "tasks" | "schedule" | "reminders" | "notes";

const LEGACY_SECTION_KIND: Record<LegacySection, LegacyKind> = {
  tasks: "task",
  schedule: "schedule",
  reminders: "reminder",
  notes: "note",
};

/** The fixed notebook each legacy section migrates into. */
export const LEGACY_SECTION_NOTEBOOK: Record<LegacySection, string> = {
  tasks: "Tasks",
  notes: "Notes",
  reminders: "Reminders",
  schedule: "Schedule",
};

/**
 * Notebook id rule — declared ONCE here and imported by the migration.
 *
 * Nesting is part of the id (`parentId`), so moving a notebook later cannot
 * collide with a sibling of the same name in another branch.
 */
export function notebookIdForName(name: string, parentId = ""): string {
  const key = String(name ?? "").trim().toLowerCase();
  return joplinId(parentId ? `notebook:${parentId}:${key}` : `notebook:root:${key}`);
}

/** Root notebook created by the migration ("My Day"). */
export const WORKSPACE_ROOT_NOTEBOOK = "My Day";
export const workspaceRootNotebookId = (): string => notebookIdForName(WORKSPACE_ROOT_NOTEBOOK);

/** Notebook reserved for Web Clipper captures (§35). */
export const WEB_CLIPPINGS_NOTEBOOK = "Web Clippings";
export const webClippingsNotebookId = (): string => notebookIdForName(WEB_CLIPPINGS_NOTEBOOK, workspaceRootNotebookId());

export interface MyDayLinkParams {
  noteId?: string;
  notebookId?: string;
  tagId?: string;
  resourceId?: string;
  scheduleId?: string;
  view?: "agenda" | "search" | "tags" | "trash";
  /** Free-form workspace command, e.g. `new-note` after a clipper hand-off. */
  action?: string;
}

/** Build a canonical `#/my-day` link. Unknown keys are dropped. */
export function buildMyDayDeepLink(params: MyDayLinkParams): string {
  const query = new URLSearchParams();
  if (params.noteId) query.set("note", params.noteId);
  if (params.notebookId) query.set("notebook", params.notebookId);
  if (params.tagId) query.set("tag", params.tagId);
  if (params.resourceId) query.set("resource", params.resourceId);
  if (params.scheduleId) query.set("schedule", params.scheduleId);
  if (params.view) query.set("view", params.view);
  if (params.action) query.set("action", params.action);
  const suffix = query.toString();
  return suffix ? `${MY_DAY_ROUTE}?${suffix}` : MY_DAY_ROUTE;
}

export type MyDayIntent =
  | { kind: "workspace" }
  | {
      kind: "target";
      source: "canonical";
      noteId?: string;
      notebookId?: string;
      tagId?: string;
      resourceId?: string;
      scheduleId?: string;
      view?: string;
      action?: string;
    }
  | {
      kind: "target";
      source: "legacy";
      legacyKind: LegacyKind;
      legacyId: string;
      noteId: string;
      notebookId: string;
      scheduleId: string;
      section: LegacySection;
    }
  | { kind: "unknown" };

const isLegacySection = (value: string | null): value is LegacySection =>
  value === "tasks" || value === "schedule" || value === "reminders" || value === "notes";

/** Canonical ids an old My Day deep link resolves to. */
export function resolveLegacySection(section: LegacySection, itemId: string) {
  const legacyKind = LEGACY_SECTION_KIND[section];
  const legacyId = String(itemId ?? "").trim();
  return {
    legacyKind,
    legacyId,
    noteId: joplinIdForLegacy(legacyKind, legacyId),
    notebookId: notebookIdForName(LEGACY_SECTION_NOTEBOOK[section], workspaceRootNotebookId()),
    scheduleId: scheduleIdForSeries(`legacy:${legacyKind}:${legacyId}`),
    section,
  } as const;
}

/**
 * Parse any `#/my-day…` hash.
 *
 * A bare route returns `{ kind: "workspace" }` — the workspace then shows its
 * canonical landing state (§75). A malformed link never throws.
 */
export function parseMyDayHash(hash: string): MyDayIntent {
  const raw = String(hash ?? "").trim();
  if (!raw) return { kind: "workspace" };
  const normalized = raw.startsWith("#") ? raw.slice(1) : raw;
  const [path, search = ""] = normalized.split("?");
  if (path !== "/my-day" && !path.startsWith("/my-day/")) return { kind: "unknown" };
  const params = new URLSearchParams(search);

  const noteId = params.get("note") ?? undefined;
  const notebookId = params.get("notebook") ?? undefined;
  const tagId = params.get("tag") ?? undefined;
  const resourceId = params.get("resource") ?? undefined;
  const scheduleId = params.get("schedule") ?? undefined;
  const view = params.get("view") ?? undefined;
  const action = params.get("action") ?? undefined;

  if (noteId || notebookId || tagId || resourceId || scheduleId || action || view) {
    return { kind: "target", source: "canonical", noteId, notebookId, tagId, resourceId, scheduleId, view, action };
  }

  const section = params.get("section");
  const item = params.get("item");
  if (isLegacySection(section) && item) {
    return { kind: "target", source: "legacy", ...resolveLegacySection(section, item) };
  }

  if (isLegacySection(section)) {
    // A section-only link has no item to open, so it selects the migrated
    // notebook instead of resurrecting the old page (§116).
    return {
      kind: "target",
      source: "canonical",
      notebookId: notebookIdForName(LEGACY_SECTION_NOTEBOOK[section], workspaceRootNotebookId()),
    };
  }

  return { kind: "workspace" };
}

/** True when the hash is a legacy form that must be translated (§128). */
export function isLegacyMyDayHash(hash: string): boolean {
  const intent = parseMyDayHash(hash);
  return intent.kind === "target" && intent.source === "legacy";
}

/** Human description of a target type, used by the missing-target state (§142). */
export function describeTargetType(targetType: string): string {
  switch (targetType) {
    case "note":
      return "note";
    case "todo":
      return "to-do";
    case "notebook":
      return "notebook";
    case "tag":
      return "tag";
    case "web-clip":
      return "web clipping";
    case "resource":
      return "attachment";
    case "custom":
    default:
      return "scheduled item";
  }
}

/**
 * Where a notification should send the learner when its target is gone.
 *
 * §142 asks for a graceful recovery: the workspace itself plus the schedule id,
 * so the agenda can offer "remove schedule" instead of a dead end.
 */
export function fallbackDeepLinkForMissingTarget(scheduleId?: string): string {
  return buildMyDayDeepLink({ scheduleId, view: "agenda" });
}
