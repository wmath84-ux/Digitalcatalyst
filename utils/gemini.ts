export const getGeminiApiKey = (): string | null => {
  const key = process.env.API_KEY || process.env.GEMINI_API_KEY || '';
  return key.trim().length > 0 ? key : null;
};

export const isDemoMode = (): boolean => !getGeminiApiKey();

export const geminiSetupHint =
  'Demo mode is active: GEMINI_API_KEY is not set, so AI replies use safe local placeholder responses.';
