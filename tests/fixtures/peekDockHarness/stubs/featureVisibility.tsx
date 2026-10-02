// Stub for src/context/FeatureVisibilityContext (no Firebase in the harness).
export function useFeatureVisibilityMap(): Record<string, { hidden?: boolean }> {
  return {};
}
export function useFeatureVisibility() {
  return { hidden: false };
}
export function FeatureVisibilityProvider({ children }: { children: unknown }) {
  return children as never;
}
