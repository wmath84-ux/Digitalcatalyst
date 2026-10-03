import { createContext, useContext, useMemo, type ReactNode } from "react";

type BackgroundMode = "clean";

type BackgroundPreferenceContextValue = {
  mode: BackgroundMode;
  cleanBackgroundEnabled: boolean;
  setCleanBackgroundEnabled: (enabled: boolean) => void;
};

const BackgroundPreferenceContext = createContext<BackgroundPreferenceContextValue>({
  mode: "clean",
  cleanBackgroundEnabled: true,
  setCleanBackgroundEnabled: () => {},
});

export function BackgroundPreferenceProvider({ children }: { children: ReactNode }) {
  const value = useMemo<BackgroundPreferenceContextValue>(() => ({
    mode: "clean",
    cleanBackgroundEnabled: true,
    setCleanBackgroundEnabled: () => {},
  }), []);

  return (
    <BackgroundPreferenceContext.Provider value={value}>
      {children}
    </BackgroundPreferenceContext.Provider>
  );
}

export function useBackgroundPreference(): BackgroundPreferenceContextValue {
  const context = useContext(BackgroundPreferenceContext);
  return context || {
    mode: "clean",
    cleanBackgroundEnabled: true,
    setCleanBackgroundEnabled: () => {},
  };
}
