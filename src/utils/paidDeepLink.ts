// src/utils/paidDeepLink.ts
//
// The Course Player's Paid page → the Product Detail Page's Paid section.
//
// Owner brief (2026-10-16):
//
//   "Jab user click kare us paid module ke type per to wah seedhe product
//    detail page ke paid section me chala jaye … aur usme jo bhi paid module
//    ya paid type usne click kiya hai woh highlight ya blink ho jaise use dikh
//    jaye, aur wahin se purchase kar sake."
//
// So one link does three things at once, and BOTH ends read this module so
// they can never disagree:
//
//   `#/product/<productId>?tab=Paid&paid=<rowKey>`
//
//   · `tab=Paid`  → the PDP opens on its Paid tab (instead of Description),
//   · `paid=<key>`→ that row is scrolled to and blinked,
//   · `<rowKey>`  → the PDP's own row keys (`update:<id>` / `module:<id>` /
//                   `resource:<id>`, the ones `buildPdpPaidContent` emits).
//
// The route id keeps working because `main.tsx` already strips the query
// before resolving a product (`hash.slice(PRODUCT_HASH.length).split("?")[0]`),
// the same way `?section=reviews` has always worked.
//
// The learner also gets a way BACK: opening the PDP from the player remembers
// the course hash for the tab (`sessionStorage`), and the PDP's back control
// uses it — "Course" instead of "Store" — so a purchase visit never loses the
// course he was studying.

/** The PDP's paid tab, spelled exactly as its tab strip spells it. */
export const PAID_TAB_QUERY = "Paid";

/** Keys live in the tab's sessionStorage; a different product overwrites. */
const RETURN_HASH_KEY = "dc.pdp.returnHash";

/** `#/product/<id>?tab=Paid&paid=<key>` — the one link the Paid page writes. */
export const buildPaidDeepLink = (productId: string, paidKey: string): string => {
  const id = encodeURIComponent(String(productId || "").trim());
  const key = encodeURIComponent(String(paidKey || "").trim());
  return `#/product/${id}?tab=${PAID_TAB_QUERY}${key ? `&paid=${key}` : ""}`;
};

export interface PaidDeepLink {
  /** True when the hash asks the PDP for its Paid tab. */
  paidTab: boolean;
  /** The PDP row key to highlight — empty when the link only opens the tab. */
  paidKey: string;
}

/** Read `?tab=Paid&paid=<key>` out of any hash (query part only). */
export const readPaidDeepLink = (hash: string): PaidDeepLink => {
  const query = String(hash || "").split("?").slice(1).join("?");
  const params = new URLSearchParams(query);
  const tab = (params.get("tab") || "").trim().toLowerCase();
  return {
    paidTab: tab === PAID_TAB_QUERY.toLowerCase(),
    paidKey: (params.get("paid") || "").trim(),
  };
};

const storage = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    // Private-mode / blocked storage: the link still works, only the way back
    // falls back to the PDP's own route.
    return null;
  }
};

/** Called by the Course Player right before it sends the learner to the PDP. */
export const rememberPdpReturn = (productId: string, hash: string): void => {
  const value = String(hash || "").trim();
  if (!value.startsWith("#/")) return;
  try {
    storage()?.setItem(RETURN_HASH_KEY, `${String(productId || "")}\n${value}`);
  } catch {
    /* ignore — see `storage()` */
  }
};

/**
 * The route the product page's back control should use — for THIS product.
 *
 * One entry only, and it is scoped: the learner opened THIS product from a
 * course, so the way back belongs to this product. Browsing to another product
 * afterwards finds nothing here and keeps its own route.
 */
export const readPdpReturn = (productId: string): string => {
  try {
    const raw = storage()?.getItem(RETURN_HASH_KEY) || "";
    if (!raw) return "";
    const [owner, hash] = raw.split("\n");
    if (owner !== String(productId || "")) return "";
    return hash && hash.startsWith("#/") ? hash : "";
  } catch {
    return "";
  }
};

/** Read AND clear — the product page consumes the return route once. */
export const takePdpReturn = (productId: string): string => {
  const value = readPdpReturn(productId);
  try {
    storage()?.removeItem(RETURN_HASH_KEY);
  } catch {
    /* ignore */
  }
  return value;
};
