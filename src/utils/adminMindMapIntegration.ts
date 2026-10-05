// src/utils/adminMindMapIntegration.ts
//
// Integration utilities for Admin-created Mind Map resources.
//
// This module provides the bridge between admin-created mind map resources
// and the Course Player's mind map system.

import {
  createMindMap,
  parseMindMap,
  type MindMap,
  isMindMap,
} from "../../utils/mindMapTree";
import type { CourseFile, CourseModule } from "../types/course";
import type { ProductResource } from "../lib/admin/types";
import { mapAdminToCourseFileType, isMindMapResourceType } from "../../utils/mindMapResourceMapping";

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
): AdminMindMapResource[] {
  const mindMapResources: AdminMindMapResource[] = [];

  const processModule = (
    module: CourseModule,
    modulePath: string[] = [],
    parentModuleId: string | null = null
  ) => {
    // Check for mind map resources in this module's files
    for (const file of module.files || []) {
      if (isMindMapResourceType(file.type)) {
        const adminResource: AdminMindMapResource = {
          id: file.id,
          name: file.name || "Untitled Mind Map",
          type: "mind_map",
          mindMapData: file.mindMapData || {},
          mindMapSourceMode: file.mindMapSourceMode || "scratch_builder",
          mindMapRootTopic: file.mindMapRootTopic || file.name || "Central Idea",
          provider: file.provider || "Mind Map",
          sortOrder: file.sortOrder || 0,
          visibility: file.visibility || "visible",
          accessLevel: file.accessLevel || "included",
          individuallyPurchasable: file.individuallyPurchasable || false,
          paidUpdateId: file.paidUpdateId || null,
          cashPrice: file.cashPrice || null,
          salePrice: file.salePrice,
          coinPrice: file.coinPrice || null,
          entitlementId: file.entitlementId || file.id,
          parentModuleId: parentModuleId,
          moduleId: module.id,
          moduleTitle: module.title,
          courseId: courseId,
          courseTitle: courseTitle,
          chapterTitle: modulePath[0] || undefined,
          submoduleTitle: modulePath.length > 1 ? modulePath[modulePath.length - 1] : undefined,
          createdBy: file.createdBy,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
          published: file.visibility === "visible",
        };
        mindMapResources.push(adminResource);
      }
    }

    // Process submodules
    for (const submodule of module.modules || []) {
      processModule(
        submodule,
        [...modulePath, module.title],
        module.id
      );
    }
  };

  // Process all top-level modules
  for (const module of modules) {
    processModule(module, [], null);
  }

  return mindMapResources;
}

/**
 * Convert an admin mind map resource to a canonical MindMap object.
 * This ensures compatibility with the Course Player's mind map system.
 */
export function convertAdminResourceToMindMap(
  resource: AdminMindMapResource
): MindMap {
  if (!resource.mindMapData || typeof resource.mindMapData !== "object") {
    // Create a new mind map with the resource name as root topic
    return createMindMap(
      resource.mindMapRootTopic || resource.name || "Central Idea",
      resource.name || "Untitled Mind Map"
    );
  }

  // Parse the stored mind map data
  const parsed = parseMindMap(resource.mindMapData);
  
  // Ensure the mind map has the correct title
  if (resource.name && resource.name !== parsed.title) {
    return {
      ...parsed,
      title: resource.name,
    };
  }

  return parsed;
}

/**
 * Check if a course file is a mind map resource (either admin or legacy format).
 */
export function isCourseFileMindMap(file: CourseFile): boolean {
  return isMindMapResourceType(file.type) || file.type === "mindmap";
}

/**
 * Get the mind map data from a course file, handling both formats.
 */
export function getMindMapDataFromCourseFile(file: CourseFile): MindMap | null {
  if (!isCourseFileMindMap(file)) {
    return null;
  }

  // Handle both admin format (mindMapData) and legacy format
  if (file.mindMapData && typeof file.mindMapData === "object") {
    return convertAdminResourceToMindMap({
      ...file,
      type: "mind_map",
      mindMapData: file.mindMapData,
      mindMapSourceMode: file.mindMapSourceMode,
      mindMapRootTopic: file.mindMapRootTopic,
    } as AdminMindMapResource);
  }

  // Legacy format - would need different handling
  return null;
}

/**
 * Create a StudyResourceCard-compatible data structure from an admin mind map resource.
 * This allows admin-created mind maps to appear in the Course Player's Mind Map Library.
 */
export function createStudyResourceFromAdminMindMap(
  resource: AdminMindMapResource
): {
  kind: "mind-map";
  resourceId: string;
  title: string;
  contextPath: string[];
  topic: string;
  topicLabel: string;
  metadata: string[];
  sourceLabel: string;
  updatedAt?: number;
  createdAt?: number;
} {
  const contextPath = [];
  
  if (resource.courseTitle) {
    contextPath.push(resource.courseTitle);
  }
  if (resource.chapterTitle) {
    contextPath.push(resource.chapterTitle);
  }
  if (resource.moduleTitle) {
    contextPath.push(resource.moduleTitle);
  }
  if (resource.submoduleTitle) {
    contextPath.push(resource.submoduleTitle);
  }

  // Count nodes if we can parse the mind map data
  let nodeCount = 1; // Root node
  if (resource.mindMapData && typeof resource.mindMapData === "object") {
    const mindMap = parseMindMap(resource.mindMapData);
    nodeCount = mindMap.nodes.length + 1;
  }

  return {
    kind: "mind-map" as const,
    resourceId: resource.id,
    title: resource.name || "Untitled Mind Map",
    contextPath,
    topic: resource.mindMapRootTopic || resource.name || "Central Idea",
    topicLabel: "Root topic",
    metadata: [`${nodeCount} node${nodeCount !== 1 ? "s" : ""}`, resource.mindMapSourceMode || ""],
    sourceLabel: "Master",
    updatedAt: resource.updatedAt,
    createdAt: resource.createdAt,
  };
}