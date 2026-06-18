export const isMobileViewport = (): boolean => {
  try {
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches;
  } catch {
    return false;
  }
};
