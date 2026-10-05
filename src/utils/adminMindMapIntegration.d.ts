// src/utils/adminMindMapIntegration.d.ts
//
// TypeScript declarations for Admin Mind Map Integration utilities.

import type { CourseFile, CourseModule } from "../types/course";
import type { MindMap } from "../../utils/mindMapTree";

/**
 * Admin Mind Map Resource with additional metadata for course player integration.
 */
export interface AdminMindMapResource {
  id: string;
  name: string;
  type: "mind_map";
  mindMapData: Record<string, unknown>;
  mindMapSourceMode: "code_import" | "scratch_builder";
  mindMapRootTopic: string;
  provider: string;
  sortOrder: number;
  visibility: "visible" | "hidden";
  accessLevel: "included" | "purchasable" | "paid_update" | "hidden";
  individuallyPurchasable?: boolean;
  paidUpdateId: string | null;
  cashPrice: number | null;
  salePrice?: number | null;
  coinPrice: number | null;
  entitlementId: string;
  parentModuleId: string | null;
  // Module context for display
  moduleId: string;
  moduleTitle?: string;
  courseId?: string;
  courseTitle?: string;
  chapterTitle?: string;
  submoduleTitle?: string;
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
  published: boolean;
}

/**
 * Extract mind map resources from product modules.
 */
export function extractMindMapResourcesFromModules(
  modules: CourseModule[],
  courseId?: string,
  courseTitle?: string
): AdminMindMapResource[];

/**
 * Convert an admin mind map resource to a canonical MindMap object.
 */
export function convertAdminResourceToMindMap(
  resource: AdminMindMapResource
): MindMap;

/**
 * Check if a course file is a mind map resource (either admin or legacy format).
 */
export function isCourseFileMindMap(file: CourseFile): boolean;

/**
 * Get the mind map data from a course file, handling both formats.
 */
export function getMindMapDataFromCourseFile(file: CourseFile): MindMap | null;