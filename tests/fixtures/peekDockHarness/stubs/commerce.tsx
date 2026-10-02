// Stub for src/context/CommerceContext (no Firebase in the harness).
export function useCommerce() {
  return { cartIds: new Set<string>(), favoriteIds: new Set<string>(), ready: true } as never;
}
export function CommerceProvider({ children }: { children: unknown }) {
  return children as never;
}
