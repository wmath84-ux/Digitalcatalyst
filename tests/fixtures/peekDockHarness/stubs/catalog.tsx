// Stub for src/context/CatalogContext (no Firebase in the harness).
export function useCatalog() {
  return { products: [], purchasedIds: new Set<string>(), loading: false, error: null } as never;
}
export function CatalogProvider({ children }: { children: unknown }) {
  return children as never;
}
