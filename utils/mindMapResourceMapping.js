// utils/mindMapResourceMapping.js
//
// Mapping utilities for Mind Map resources between Admin Product Builder
// and Course Player formats.

/**
 * Map admin resource type to course player file type.
 * Admin uses "mind_map" but Course Player expects "mindmap".
 */
export const mapAdminToCourseFileType = (adminType) => {
  if (adminType === "mind_map") return "mindmap";
  return adminType;
};

/**
 * Map course player file type to admin resource type.
 */
export const mapCourseToAdminFileType = (courseType) => {
  if (courseType === "mindmap") return "mind_map";
  return courseType;
};

/**
 * Check if a resource type is a mind map (either format).
 */
export const isMindMapResourceType = (type) => {
  return type === "mind_map" || type === "mindmap";
};

/**
 * Convert admin mind map resource data to course player format.
 * This ensures compatibility between the two systems.
 */
export const convertAdminMindMapToCourseFormat = (resource) => {
  if (!resource || !isMindMapResourceType(resource.type)) {
    return resource;
  }

  return {
    ...resource,
    type: "mindmap", // Course player expects this format
    // Ensure mind map data fields are properly set
    mindMapData: resource.mindMapData || null,
    mindMapSourceMode: resource.mindMapSourceMode,
    mindMapRootTopic: resource.mindMapRootTopic,
  };
};

/**
 * Convert course player mind map resource to admin format.
 */
export const convertCourseMindMapToAdminFormat = (resource) => {
  if (!resource || !isMindMapResourceType(resource.type)) {
    return resource;
  }

  return {
    ...resource,
    type: "mind_map", // Admin uses this format
    // Ensure mind map data fields are properly set
    mindMapData: resource.mindMapData || null,
    mindMapSourceMode: resource.mindMapSourceMode,
    mindMapRootTopic: resource.mindMapRootTopic,
  };
};