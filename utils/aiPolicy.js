// Pure model-pricing helpers shared by browser previews and the authoritative
// Revision API. Prices are configured by Admin in USD per one million tokens;
// calculated spend is returned as integer micro-USD.

const PROVIDERS = new Set(["gemini", "openai", "openrouter", "anthropic", "groq", "custom"]);

const cleanPrice = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1_000_000, number)) : 0;
};

export const normalizeAiModelPricing = (raw) => {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const prices = [];
  for (const value of raw) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const provider = String(value.provider || "");
    if (!PROVIDERS.has(provider)) continue;
    const model = String(value.model || "").trim().slice(0, 200);
    if (!model) continue;
    const key = `${provider}:${model.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    prices.push({
      provider,
      model,
      inputUsdPerMillion: cleanPrice(value.inputUsdPerMillion),
      outputUsdPerMillion: cleanPrice(value.outputUsdPerMillion),
      updatedAt: String(value.updatedAt || "").slice(0, 80),
    });
    if (prices.length >= 500) break;
  }
  return prices;
};

export const findAiModelPrice = (prices, provider, model) => {
  const normalizedProvider = String(provider || "");
  const normalizedModel = String(model || "").trim().toLowerCase();
  return normalizeAiModelPricing(prices).find(
    (price) => price.provider === normalizedProvider && price.model.toLowerCase() === normalizedModel,
  ) || null;
};

export const calculateAiCostMicros = (price, inputTokens, outputTokens) => {
  if (!price) return 0;
  const input = Math.max(0, Math.round(Number(inputTokens) || 0));
  const output = Math.max(0, Math.round(Number(outputTokens) || 0));
  // USD / 1M tokens multiplied by token count equals micro-USD directly.
  return Math.max(0, Math.round(
    input * cleanPrice(price.inputUsdPerMillion) +
    output * cleanPrice(price.outputUsdPerMillion),
  ));
};

export const estimateTokensFromText = (text) => Math.max(1, Math.ceil(String(text || "").length / 4));
