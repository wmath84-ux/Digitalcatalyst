import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_THEME_MODE,
  getThemeMode,
  setThemeMode,
  subscribeThemeMode,
  type ThemeMode,
} from "../lib/theme";

/**
 * The user's theme preference, and a setter that persists it and updates every
 * mounted consumer (and <html>) immediately — no reload needed.
 */
export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const mode = useSyncExternalStore(subscribeThemeMode, getThemeMode, () => DEFAULT_THEME_MODE);
  const set = useCallback((next: ThemeMode) => setThemeMode(next), []);
  return [mode, set];
}

export default useThemeMode;
