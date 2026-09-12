import { useCallback, useEffect, useMemo, useState } from "react";
import { useStoreFilters } from "./useStoreFilters";
import {
  ALL_STORE_FILTER,
  derivedStoreFilters,
  productMatchesStoreFilter,
  type FilterableProduct,
  type StoreFilter,
} from "../data/storeFilters";

/**
 * The store's filtering system, ready to mount on any product list.
 *
 * Home and My Purchases both needed the Store page's filter — same admin chips
 * (`settings/storeFilters`), same matcher, same empty-filter recovery — without
 * either page re-implementing it. The model itself stays where it always was, in
 * `src/data/storeFilters.ts`; this hook is only the wiring the Store page holds
 * inline, lifted so every surface reads from one source:
 *
 *   · admin-managed chips win, and the row falls back to chips derived from the
 *     live catalog so a page is never filter-less;
 *   · a chip the admin deleted or hid stops filtering immediately;
 *   · `visible` is the already-matched list, so a page just renders it and its
 *     own empty state (`isFiltered` decides which copy the empty state shows).
 */
export type ProductFilterState<P> = {
  /** The chip list, "All" first. Feed it to `<FilterChips/>` / `ProductFilterBar`. */
  chips: StoreFilter[];
  /** The chip currently applied (`ALL_STORE_FILTER` when nothing is). */
  activeFilter: StoreFilter;
  activeFilterId: string;
  setActiveFilterId: (id: string) => void;
  /** `products`, narrowed by the active chip. */
  visible: P[];
  /** True while a chip other than "All" is applied. */
  isFiltered: boolean;
  /** Back to "All" — the empty state's one-tap way out. */
  clearFilters: () => void;
};

export function useProductFilters<P extends FilterableProduct>(products: P[]): ProductFilterState<P> {
  const { filters: adminFilters } = useStoreFilters();
  const [activeFilterId, setActiveFilterId] = useState(ALL_STORE_FILTER.id);

  const chips = useMemo<StoreFilter[]>(() => {
    const active = adminFilters.filter((filter) => filter.active);
    const list = active.length > 0 ? active : derivedStoreFilters(products);
    return [ALL_STORE_FILTER, ...list];
  }, [adminFilters, products]);

  const activeFilter = useMemo(
    () => chips.find((filter) => filter.id === activeFilterId) || ALL_STORE_FILTER,
    [chips, activeFilterId],
  );

  // A chip the admin deleted or hid must not keep filtering the list.
  useEffect(() => {
    if (activeFilterId !== ALL_STORE_FILTER.id && !chips.some((filter) => filter.id === activeFilterId)) {
      setActiveFilterId(ALL_STORE_FILTER.id);
    }
  }, [chips, activeFilterId]);

  const visible = useMemo(
    () => products.filter((product) => productMatchesStoreFilter(product, activeFilter)),
    [products, activeFilter],
  );

  const clearFilters = useCallback(() => setActiveFilterId(ALL_STORE_FILTER.id), []);

  return {
    chips,
    activeFilter,
    activeFilterId,
    setActiveFilterId,
    visible,
    isFiltered: activeFilter.id !== ALL_STORE_FILTER.id,
    clearFilters,
  };
}
