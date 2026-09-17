// Shared nested data shapes used inside jsonb columns.

export type ProductImage = {
  id: string;
  url: string;
  provider: "public" | "cloudinary";
  sortOrder: number;
  isPrimary: boolean;
};

/**
 * One practice question inside a `brain` resource. Kept in step with
 * `utils/practiceSet.js` (the runtime normaliser the admin panel and the
 * Course Player both use) — this is only its TypeScript projection.
 */
export type ProductPracticeQuestion = {
  id: string;
  prompt: string;
  options: string[];
  /** -1 = no answer marked yet (the panel lists these as not publish-ready). */
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
};

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
     * Brain · practice set — the ONE resource type without a URL. Its content
     * is `practiceQuestions` below (bulk-imported / hand-written in the
     * product editor) and it renders in the Course Player's Brain tab.
     */
    | "brain";
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
