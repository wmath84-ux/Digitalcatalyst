// Shared nested data shapes used inside jsonb columns.

export type ProductImage = {
  id: string;
  url: string;
  provider: "public" | "cloudinary";
  sortOrder: number;
  isPrimary: boolean;
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
    | "gform"
    | "ebook"
    | "github_pages"
    | "whimsical"
    | "iframe";
  url: string;
  provider: string;
  sortOrder: number;
  visibility: "visible" | "hidden";
  accessLevel: "included" | "purchasable" | "paid_update" | "hidden";
  paidUpdateId: string | null;
  cashPrice: number | null;
  coinPrice: number | null;
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
  kind: "product" | "module" | "update" | "subscription" | "feature" | "coins";
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
