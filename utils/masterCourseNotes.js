// Project admin-authored Block Note product resources into the Course Player
// MASTER library. This pure module has no Firestore or learner-note imports.

const positiveTimestamp = (value) => {
  const timestamp = Number(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
};

const moduleFiles = (module) => {
  const files = Array.isArray(module?.files) ? module.files : [];
  return files
    .map((file, index) => ({ file, index }))
    .sort((a, b) => {
      const aOrder = Number(a.file?.sortOrder);
      const bOrder = Number(b.file?.sortOrder);
      const aValid = Number.isFinite(aOrder);
      const bValid = Number.isFinite(bOrder);
      if (aValid && bValid && aOrder !== bOrder) return aOrder - bOrder;
      return a.index - b.index;
    })
    .map(({ file }) => file);
};

/**
 * Read-only projection from the existing published module tree. Module unlocks
 * and resource purchases are passed in from the canonical access resolver.
 * Learner-owned CoursePlayerNote records are deliberately never consulted.
 */
export const collectMasterCourseNotes = (modules, options = {}) => {
  if (options.enabled === false) return [];

  const courseId = String(options.courseId || "");
  const unlocked = options.unlockedModuleIds instanceof Set ? options.unlockedModuleIds : new Set();
  const ownedUpdates = options.ownedUpdateIds instanceof Set ? options.ownedUpdateIds : new Set();
  const accessibleResources = options.accessibleResourceIds instanceof Set
    ? options.accessibleResourceIds
    : new Set();
  if (!courseId) return [];

  const notes = [];
  const visit = (nodes, ancestors) => {
    for (const module of Array.isArray(nodes) ? nodes : []) {
      const moduleId = String(module?.id || "");
      if (!moduleId || module.accessLevel === "hidden" || !unlocked.has(moduleId)) continue;
      const modulePath = [...ancestors, String(module.title || "Module")];

      for (const file of moduleFiles(module)) {
        if (!file || file.type !== "note" || file.source === "personal" || file.noteSource !== "master") continue;
        if (file.accessLevel === "hidden") continue;
        const resourceId = String(file.id || "");
        if (!resourceId) continue;
        if (file.accessLevel === "paidUpdate") {
          const updateId = String(file.paidUpdateId || resourceId);
          if (!ownedUpdates.has(updateId)) continue;
        }
        if (file.accessLevel === "purchasable" && !accessibleResources.has(resourceId)) continue;

        const createdAt = positiveTimestamp(file.createdAt);
        const updatedAt = positiveTimestamp(file.updatedAt);
        notes.push({
          id: `master:${courseId}:${resourceId}`,
          resourceId,
          courseId,
          moduleId,
          title: String(file.name || "Untitled master note"),
          bodyHtml: String(file.noteHtml || ""),
          modulePath,
          sortOrder: Number.isFinite(Number(file.sortOrder)) ? Number(file.sortOrder) : notes.length,
          ...(createdAt ? { createdAt } : {}),
          ...(updatedAt ? { updatedAt } : {}),
          ...(file.createdBy ? { createdBy: String(file.createdBy) } : {}),
          source: "master",
        });
      }

      visit(module.modules || [], modulePath);
    }
  };

  visit(modules, []);
  return notes;
};
