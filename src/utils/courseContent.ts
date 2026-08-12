// src/utils/courseContent.ts
//
// Legacy entry point kept for backward compatibility with the existing
// Course Player. The authoritative round-trip-safe mapping now lives in
// `utils/productMapping.js` (consumed by `src/lib/admin/client.ts` and
// `src/context/CatalogContext.tsx`). See `docs/commerce-course-audit.md`
// and `tests/productMapping.test.mjs` for the full round-trip contract.

import { canonicalTreeToLegacyTree, sanitizeCanonicalCourseContent } from "../../utils/productMapping";
import type { CanonicalCourseModule } from "../types/commerce";
import type { CourseModule } from "../types/course";

/**
 * Legacy sanitizer: project any course content tree into the legacy
 * `CourseModule` shape the existing Course Player reads. URL-only rule
 * is applied by the canonical mapping underneath.
 */
export const sanitizeUrlOnlyCourseContent = (modules: unknown): CourseModule[] => {
  const canonical: CanonicalCourseModule[] = sanitizeCanonicalCourseContent(modules);
  return canonicalTreeToLegacyTree(canonical) as unknown as CourseModule[];
};
