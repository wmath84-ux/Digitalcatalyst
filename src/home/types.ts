export type ProductType = "video" | "pdf" | "ebook" | "live";

export interface Product {
  id: string;
  title: string;
  type: ProductType;
  category: string;
  author: string;
  price: number;
  mrp: number;
  rating: number;
  ratingCount: number;
  image: string;
  searchKeywords?: string[];
  trending?: boolean;
}

export interface Category {
  id: string;
  label: string;
  icon: string;
}

/**
 * Where a hero banner opens when the learner taps it.
 *   "none"    — the card is not interactive (pure promotion).
 *   "product" — opens the linked product's page (PDP) from the
 *               products module.
 *   "module"  — opens the Course Player straight at a specific
 *               module of the linked product.
 */
export type BannerLinkType = "none" | "product" | "module";

export interface Banner {
  id: string;
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  cta: string;
  /**
  /** Tailwind gradient class string (e.g. "from-violet-600 via-fuchsia-500 to-pink-500").
 * Use one of the presets from `bannerGradients.ts` so the class is always
 * compiled into the stylesheet.
 */
  gradient: string;
  /** Admin-configured link target. Optional — missing fields behave as "none". */
  linkType?: BannerLinkType;
  /** Product id (products module) for linkType "product" | "module". */
  productId?: string;
  /** Module id (of the linked product) for linkType "module". */
  moduleId?: string;
}

export interface Review {
  id: string;
  name: string;
  avatarColor: string;
  initials: string;
  rating: number;
  date: string;
  comment: string;
  course: string;
}
