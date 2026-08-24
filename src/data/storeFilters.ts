/**
 * Store filters — the chips shown above the product grid on the Store page.
 *
 * The list is fully admin-managed: it lives in a single Firestore document
 * (`settings/storeFilters`, public read / admin write) and every product
 * stores the ids of the filters it belongs to (`filterIds`). The product
 * editor can both attach a product to existing filters AND create brand-new
 * filters on the spot, which then appear on the Store page for everyone.
 *
 * Nothing here imports Firebase so the model can be unit tested and reused by
 * the app, the admin panel and the mapping layer alike.
 */

export const STORE_FILTERS_DOC_ID = "storeFilters";

/** Chip shown on the Store page and configurable in the admin panel. */
export type StoreFilter = {
  id: string;
  label: string;
  /** Grouping used by the "Filters" sheet on the store and in the admin list. */
  group: string;
  description: string;
  sortOrder: number;
  active: boolean;
};

/** Groups offered in the admin dropdown (free text is still accepted). */
export const STORE_FILTER_GROUPS = ["Category", "Class", "Subject", "Format", "Collection", "Custom"] as const;

export const DEFAULT_STORE_FILTER_GROUP = "Custom";

/** The synthetic "show everything" chip. It is never stored in Firestore. */
export const ALL_STORE_FILTER: StoreFilter = {
  id: "all",
  label: "All",
  group: "All",
  description: "Every published product",
  sortOrder: -1,
  active: true,
};

const text = (value: unknown, fallback = ""): string =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

/** Stable, human-readable id derived from the label (e.g. "Class 10" → "class-10"). */
export function slugifyStoreFilterId(label: string): string {
  const slug = String(label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || `filter-${Math.random().toString(36).slice(2, 8)}`;
}

/** Make an id unique inside an existing list (`notes`, `notes-2`, `notes-3`, …). */
export function uniqueStoreFilterId(label: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken).map((value) => String(value)));
  const base = slugifyStoreFilterId(label);
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

/** Normalise one raw Firestore entry. Returns null when it cannot be rendered. */
export function normalizeStoreFilter(raw: unknown, fallbackIndex = 0): StoreFilter | null {
  if (!raw || typeof raw !== "object") return null;
  const source = raw as Record<string, unknown>;
  const label = text(source.label ?? source.name ?? source.title);
  if (!label) return null;
  const id = text(source.id, slugifyStoreFilterId(label));
  const sortOrder = Number(source.sortOrder);
  return {
    id,
    label,
    group: text(source.group ?? source.category, DEFAULT_STORE_FILTER_GROUP),
    description: text(source.description),
    sortOrder: Number.isFinite(sortOrder) ? sortOrder : fallbackIndex,
    active: source.active !== false,
  };
}

/** Normalise + de-duplicate + sort a raw list of filters. */
export function normalizeStoreFilters(raw: unknown): StoreFilter[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  return list
    .map((item, index) => normalizeStoreFilter(item, index))
    .filter((item): item is StoreFilter => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

/** Minimal product shape the matcher needs — keeps this file dependency free. */
export type FilterableProduct = {
  filterIds?: string[];
  category?: string;
  classLevel?: string;
  subject?: string;
  tags?: string[];
};

/**
 * Does a product belong to a chip?
 *
 * 1. Explicit admin wiring wins: `product.filterIds` contains the filter id.
 * 2. Legacy fallback: the filter label matches the product's category, class,
 *    subject or one of its tags — so existing products keep showing up under
 *    chips such as "Notes" or "Class 10" before anyone re-saves them.
 */
export function productMatchesStoreFilter(product: FilterableProduct, filter: Pick<StoreFilter, "id" | "label">): boolean {
  if (!filter || filter.id === ALL_STORE_FILTER.id) return true;
  const explicit = Array.isArray(product.filterIds) ? product.filterIds.map(String) : [];
  if (explicit.includes(filter.id)) return true;
  const label = String(filter.label || "").trim().toLowerCase();
  if (!label) return false;
  const fields = [product.category, product.classLevel, product.subject]
    .map((value) => String(value || "").trim().toLowerCase());
  if (fields.includes(label)) return true;
  return (product.tags || []).some((tag) => String(tag).trim().toLowerCase() === label);
}

/** Chips derived from live product data — used until the admin saves a list. */
export function derivedStoreFilters(products: FilterableProduct[]): StoreFilter[] {
  const seen = new Map<string, StoreFilter>();
  const push = (label: unknown, group: string) => {
    const value = text(label);
    if (!value) return;
    const id = slugifyStoreFilterId(value);
    if (seen.has(id)) return;
    seen.set(id, { id, label: value, group, description: "", sortOrder: seen.size, active: true });
  };
  products.forEach((product) => {
    push(product.category, "Category");
    push(product.classLevel, "Class");
    push(product.subject, "Subject");
  });
  return Array.from(seen.values());
}
