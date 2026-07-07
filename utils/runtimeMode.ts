export const isDemoMode = (): boolean => {
  const runtimeEnv = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {});
  const rawValue = runtimeEnv.VITE_DEMO_MODE || runtimeEnv.VITE_APP_DEMO_MODE || '';
  return String(rawValue).trim().toLowerCase() === 'true';
};
