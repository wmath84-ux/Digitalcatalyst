import type { CourseModule, MasterCourseNote } from "../src/types/course";

export interface CollectMasterCourseNotesOptions {
  courseId: string | number;
  unlockedModuleIds: ReadonlySet<string>;
  ownedUpdateIds: ReadonlySet<string>;
  accessibleResourceIds?: ReadonlySet<string>;
  enabled?: boolean;
}

export const collectMasterCourseNotes: (
  modules: CourseModule[],
  options: CollectMasterCourseNotesOptions,
) => MasterCourseNote[];
