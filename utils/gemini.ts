export const getGeminiApiKey = (): string | null => {
  const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
  return key && key.trim().length > 0 ? key : null;
};

export const geminiSetupHint =
  "Gemini API key is missing. Add GEMINI_API_KEY=<your_key> to .env.local and restart `npm run dev`.";
