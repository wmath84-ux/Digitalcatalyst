import type { CourseModule } from "../types/course";
import type { CanonicalCourseModule, CanonicalPaidUpdate } from "../types/commerce";

export type Product = {
  id: string;
  /** Firestore `siteProducts` document id when it differs from the public `id`. */
  documentId?: string;
  title: string;
  instructor: string;
  image: string;
  /** Ordered live gallery images configured in the product editor. */
  images?: string[];
  category: "Notes" | "Course" | "PDF" | "E-book" | "Live";
  classLevel: string;
  subject: string;
  tags: string[];
  /**
   * Ids of the admin-managed store filter chips this product is attached to
   * (see `src/data/storeFilters.ts`). Empty means the product only matches
   * chips through the legacy category/class/subject/tag fallback.
   */
  filterIds?: string[];
  searchKeywords?: string[];
  rating: number;
  reviews: number;
  originalPrice: number;
  price: number;
  isFree?: boolean;
  /** Curated "What's included" bullets configured in the product editor. */
  features?: string[];
  description?: string;
  paymentLink?: string;
  /** Drafts/archived products never enter CatalogContext; exposed for UI clarity. */
  status?: "draft" | "published" | "archived";
  /** Visible products may be informational/coming-soon without being purchasable. */
  availableForSale?: boolean;
  /**
   * Legacy module tree used by the existing Course Player. New consumers
   * should read `canonicalModules` (the round-trip-safe Part 1 shape) and
   * `paidUpdates` instead. This field is computed from the canonical tree
   * via a one-way adapter and is preserved so the player keeps working
   * without edits.
   */
  courseContent?: CourseModule[];
  /**
   * Canonical Part 1 shape: every commerce/access field is preserved
   * through the Admin → Firestore → Catalog → Admin round trip.
   */
  canonicalModules?: CanonicalCourseModule[];
  /**
   * Canonical Part 1 paid-update catalogue. The previous shape
   * (`PaidCourseUpdate[]` in `src/types/course.ts`) is reverse-engineered
   * from the module tree; this is the authoritative list.
   */
  paidUpdates?: CanonicalPaidUpdate[];
};
