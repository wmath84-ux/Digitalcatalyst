// Stub for src/context/BrandingContext (no Firebase in the harness).
export const DEFAULT_BRANDING = { appName: "Eduvora", logoUrl: "", loading: false };

export function useBranding() {
  return DEFAULT_BRANDING as never;
}

export function BrandingProvider({ children }: { children: unknown }) {
  return children as never;
}
