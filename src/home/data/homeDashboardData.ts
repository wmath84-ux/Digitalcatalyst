export interface HomeResourceLocation {
  moduleTitle: string;
  resource: {
    id: string;
    name: string;
  };
}

/** Calculate completion only from known catalog resources; stale IDs never inflate progress. */
export function calculateCourseProgress(completedFileIds: readonly string[], resourceIds: readonly string[]): number {
  const availableIds = new Set(resourceIds);
  if (availableIds.size === 0) return 0;
  const completedIds = new Set(completedFileIds.filter((id) => availableIds.has(id)));
  return Math.round((completedIds.size / availableIds.size) * 100);
}

/** Return the saved lesson location only when it still exists in the catalog tree. */
export function findCurrentLesson(resources: readonly HomeResourceLocation[], fileId?: string): string | undefined {
  if (!fileId) return undefined;
  const match = resources.find(({ resource }) => resource.id === fileId);
  if (!match) return undefined;
  return [match.moduleTitle.trim(), match.resource.name.trim()].filter(Boolean).join(" · ") || undefined;
}

/** Keep progress labels and bars valid for every possible stored value. */
export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(100, value)));
}

/** Wrap carousel navigation safely for empty, single-slide, and multi-slide rails. */
export function wrapCarouselIndex(index: number, total: number): number {
  if (!Number.isFinite(index) || !Number.isFinite(total) || total <= 0) return 0;
  const length = Math.floor(total);
  if (length <= 0) return 0;
  return ((Math.trunc(index) % length) + length) % length;
}
