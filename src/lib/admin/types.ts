// Shared nested data shapes used inside jsonb columns.

export type ProductImage = {
  id: string;
  url: string;
  provider: "public" | "cloudinary";
  sortOrder: number;
  isPrimary: boolean;
};

import type { MyCourseQuestion } from "../../types/myCourse";

/**
 * One practice question inside a `brain` resource — ALL eight Brain question
 * types (MCQ, Fill in the Blank, Label the Diagram, Assertion and Reason,
 * One-Word, Match, Drag and Drop, Hotspot), not just MCQs. This is the same
 * record the learner-facing creator writes: `utils/practiceSet.js` is the
 * runtime normaliser/validator both sides read, and this alias keeps the
 * admin projection from ever drifting from the canonical shape
 * (`MyCourseQuestion` in src/types/myCourse.ts). Legacy records without a
 * `questionType` are MCQs and keep working untouched.
 */
export type ProductPracticeQuestion = MyCourseQuestion;

export type ProductResource = {
  id: string;
  name: string;
  type:
    | "youtube"
    | "video_url"
    | "audio_url"
    | "image_url"
    | "gdrive"
    | "pdf"
    | "gdoc"
    | "gsheet"
    | "gslides"
    | "gform"
    | "ebook"
    | "github_pages"
    | "whimsical"
    | "iframe"
    /**
     * Brain Practice Set — the ONE resource type without a URL. Its content
     * is `practiceQuestions` below (bulk-imported / hand-written in the
     * product editor) and it renders in the Course Player's Brain tab.
     */
    | "brain"
    /**
     * Read library item — upload a PDF, link a Drive/direct PDF, or embed a
     * safe public HTTPS webpage. It opens from the Course Player's Read tab,
     * not the ordinary lesson viewer.
     */
    | "read"
    /** Admin-authored rich BlockNote document shown in the player's MASTER library. */
    | "note"
    /**
     * Interactive 2D experiment — the admin-authored twin of the Study
     * Library's experiment: ONE self-contained HTML file (usually generated
     * by an AI from the builder's prompt), designed in the product editor
     * with the same prompt → paste/upload/template → live-preview flow and
     * played in the Course Player's sandboxed stage. Its content is
     * `interactiveHtml` below (a hosted https link in `url` is the fallback
     * for files too big to store).
     */
    | "interactive"
    /**
     * Mind Map resource — visual hierarchical knowledge representation.
     * Content is stored as structured mind map data (nodes, connections, etc.)
     * and renders in the Course Player's Mind Map viewer.
     */
    | "mind_map";
  url: string;
  provider: string;
  sortOrder: number;
  visibility: "visible" | "hidden";
  accessLevel: "included" | "purchasable" | "paid_update" | "hidden";
  individuallyPurchasable?: boolean;
  paidUpdateId: string | null;
  cashPrice: number | null;
  salePrice?: number | null;
  coinPrice: number | null;
  entitlementId?: string;
  parentModuleId?: string | null;
  /**
   * Brain practice-set payload (`type: "brain"` only). Normalised through
   * `utils/practiceSet.js` on every save and every load, so the admin panel,
   * the stored `siteProducts` document and the Course Player always agree.
   */
  practiceQuestions?: ProductPracticeQuestion[];
  /** Optional learner-facing name for the set (falls back to the resource name). */
  practiceTitle?: string;
  /**
   * Interactive 2D experiment source (`type: "interactive"` only): ONE
   * self-contained HTML document, stored inline in the product document so it
   * plays offline in a sandboxed iframe. See `src/utils/experimentSpec.ts`.
   */
  interactiveHtml?: string;
  /**
   * Mind Map content (`type: "mind_map"` only): structured mind map data
   * that follows the canonical mind map format from utils/mindMapTree.js.
   * This includes the root topic, nodes, and their hierarchical relationships.
   */
  mindMapData?: Record<string, unknown>;
  /**
   * Source mode for mind map: "code_import" or "scratch_builder".
   * Tracks how the mind map was created for analytics and UI purposes.
   */
  mindMapSourceMode?: "code_import" | "scratch_builder";
  /**
   * Root topic of the mind map, used for display and indexing.
   */
  mindMapRootTopic?: string;
  /** Read source metadata (`type: "read"` only). */
  readSourceKind?: "upload" | "gdrive" | "pdf_url" | "embed_url";
  readStoragePath?: string;
  readFileName?: string;
  readFileSize?: number;
  /** BlockNote's stable, sanitized HTML body (`type: "note"` only). */
  noteHtml?: string;
  /** Ownership/provenance for an admin-authored master note. */
  noteSource?: "master";
  ownerType?: "course";
  ownerId?: string;
  courseId?: string;
  moduleId?: string;
  createdBy?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type ProductModule = {
  id: string;
  title: string;
  description: string;
  sortOrder: number;
  visibility: "visible" | "hidden";
  active: boolean;
  accessLevel: "included" | "purchasable" | "paid_update" | "hidden";
  individuallyPurchasable: boolean;
  cashPrice: number | null;
  salePrice: number | null;
  coinPrice: number | null;
  includeInBundle: boolean;
  previewAvailable: boolean;
  requiredPreviousModuleIds: string[];
  entitlementId: string;
  badge: string | null;
  parentModuleId: string | null;
  resources: ProductResource[];
};

export type PaidUpdate = {
  id: string;
  title: string;
  description: string;
  includedIds: string[];
  cashPrice: number;
  coinPrice: number;
  active: boolean;
  publishDate: string | null;
  visibility: "visible" | "hidden";
  sortOrder: number;
};

export type OrderItem = {
  id: string;
  kind: "product" | "module" | "update" | "subscription" | "feature";
  refId: string;
  title: string;
  price: number;
};

export type AuditEntry = {
  adminId: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
};
