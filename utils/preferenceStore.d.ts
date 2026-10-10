import type { PreferenceKey, Preferences } from "./userPreferences";
export type PreferenceCapabilities = { emailConfigured: boolean; webPushConfigured?: boolean; fcmConfigured?: boolean };
export type PreferenceResult = { preferences: Preferences; revision: number; capabilities?: PreferenceCapabilities };
export type PreferenceState = {
  preferences: Preferences;
  ready: boolean;
  loading: boolean;
  savingKeys: PreferenceKey[];
  error: string;
  syncError: string;
  failed: { key: PreferenceKey; value: boolean } | null;
  lastSavedKey: PreferenceKey | null;
  capabilities: PreferenceCapabilities | null;
};
export function createPreferenceStore(adapter: {
  subscribe: (listener: (result: PreferenceResult | null, error?: unknown) => void) => () => void;
  read: () => Promise<PreferenceResult>;
  write: (key: PreferenceKey, value: boolean) => Promise<PreferenceResult>;
  teardownMs?: number;
  onIdle?: () => void;
}): {
  getSnapshot: () => PreferenceState;
  subscribe: (listener: () => void) => () => void;
  setPreference: (key: PreferenceKey, value: boolean) => Promise<boolean>;
  reload: () => Promise<boolean>;
  retry: () => Promise<boolean>;
};
