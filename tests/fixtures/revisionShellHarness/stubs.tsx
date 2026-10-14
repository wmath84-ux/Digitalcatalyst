export function useRevisionAccess() { return { hasAccess: true, loading: false, hidden: false }; }
export function usePublishFeatureVisibility() {}
export function useFeatureVisibilityMap() { return {}; }
export function useFeatureVisibility() { return { hidden: false }; }
export async function bootstrapRevisionFeature() {}
export function disposeRevisionFeature() {}
export async function syncRevisionCatalog() { return false; }
export async function fetchRemoteCatalog() { return null; }
export default function PremiumGate() { return null; }
