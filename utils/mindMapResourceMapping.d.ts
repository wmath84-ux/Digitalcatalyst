// utils/mindMapResourceMapping.d.ts
//
// TypeScript declarations for Mind Map resource mapping utilities.

/**
 * Map admin resource type to course player file type.
 */
export function mapAdminToCourseFileType(adminType: string): string;

/**
 * Map course player file type to admin resource type.
 */
export function mapCourseToAdminFileType(courseType: string): string;

/**
 * Check if a resource type is a mind map (either format).
 */
export function isMindMapResourceType(type: string): boolean;

/**
 * Convert admin mind map resource data to course player format.
 */
export function convertAdminMindMapToCourseFormat(resource: unknown): unknown;

/**
 * Convert course player mind map resource to admin format.
 */
export function convertCourseMindMapToAdminFormat(resource: unknown): unknown;