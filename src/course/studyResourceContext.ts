import type { CourseModule } from "../types/course";
import type { PersonalCourseModule } from "../types/personalCourse";

export interface StudyResourceContext {
  /** Real ancestor titles, from the course tree (never stored as a duplicate). */
  modulePath: string[];
  /** Lesson/resource name, when the resource id still resolves in the tree. */
  resourceName?: string;
}

const cleanTitle = (value: unknown): string => String(value || "").trim();

const resourceNameInModule = (module: CourseModule, resourceId: string): string | undefined => {
  if (module.embedContentUrl && resourceId === `${module.id}__embedded-page`) {
    return cleanTitle(module.embedContentTypeLabel)
      || (module.embedContentTypeId === "github_page" ? "Interactive GitHub Page" : "Embedded resource");
  }
  const file = (module.files || []).find((entry) => String(entry.id) === resourceId);
  return file ? cleanTitle(file.name) || undefined : undefined;
};

/** Resolve a note's real position in the existing nested course tree. */
export function resolveCourseResourceContext(
  modules: CourseModule[],
  moduleId?: string | null,
  resourceId?: string | null,
): StudyResourceContext {
  const wantedModule = String(moduleId || "");
  const wantedResource = String(resourceId || "");
  let modulePath: string[] = [];
  let resourceContext: StudyResourceContext | null = null;

  const visit = (nodes: CourseModule[], parents: string[]): void => {
    for (const module of nodes || []) {
      const title = cleanTitle(module.title);
      const path = title ? [...parents, title] : parents;
      if (wantedModule && String(module.id) === wantedModule) modulePath = path;
      if (wantedResource) {
        const resourceName = resourceNameInModule(module, wantedResource);
        if (resourceName) resourceContext = { modulePath: path, resourceName };
      }
      visit(module.modules || [], path);
    }
  };

  visit(modules || [], []);
  return resourceContext || { modulePath };
}

/**
 * Personal Modules are a separate, already-existing owner tree. Notes store
 * its ids (`personalModuleId` / `personalResourceId`), so resolve labels from
 * that tree when it has been loaded rather than copying names into note docs.
 */
export function resolvePersonalResourceContext(
  modules: PersonalCourseModule[],
  moduleId?: string | null,
  resourceId?: string | null,
): StudyResourceContext {
  const wantedModule = String(moduleId || "");
  const wantedResource = String(resourceId || "");
  const module = (modules || []).find((entry) => String(entry.id) === wantedModule);
  if (!module) return { modulePath: [] };
  const resource = (module.resources || []).find((entry) => String(entry.id) === wantedResource);
  return {
    modulePath: [cleanTitle(module.title)].filter(Boolean),
    resourceName: resource ? cleanTitle(resource.name) || undefined : undefined,
  };
}

/** A compact, locale-aware timestamp for a resource card; null means unknown. */
export function formatStudyTimestamp(timestamp?: number | null): { short: string; full: string } | null {
  const value = Number(timestamp || 0);
  if (!Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const short = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  const full = new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return { short, full };
}
