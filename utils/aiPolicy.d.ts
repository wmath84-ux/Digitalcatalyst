export type AiModelPrice = {
  provider: "gemini" | "openai" | "openrouter" | "anthropic" | "groq" | "custom";
  model: string;
  /** USD charged for one million input tokens. */
  inputUsdPerMillion: number;
  /** USD charged for one million output tokens. */
  outputUsdPerMillion: number;
  updatedAt: string;
};

export const normalizeAiModelPricing: (raw: unknown) => AiModelPrice[];
export const findAiModelPrice: (
  prices: unknown,
  provider: string,
  model: string,
) => AiModelPrice | null;
export const calculateAiCostMicros: (
  price: AiModelPrice | null | undefined,
  inputTokens: unknown,
  outputTokens: unknown,
) => number;
export const estimateTokensFromText: (text: unknown) => number;
