export const REVIEW_STABLE_MODE =
  String(import.meta.env.VITE_REVIEW_STABLE_MODE || '').toLowerCase() === 'true';

export const REVIEW_SAFE_MIN_DETAIL_WORDS = 500;
export const REVIEW_SAFE_MIN_LIST_CARDS = 6;

export const normalizePlainText = (...values: Array<string | null | undefined>) => {
  return values
    .filter(Boolean)
    .join(' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`>[\]{}|\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const countVisibleWords = (...values: Array<string | null | undefined>) => {
  const text = normalizePlainText(...values);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
};

const unsafePublicContentPatterns = [
  /placeholder/i,
  /demo content/i,
  /dummy content/i,
  /sample content/i,
  /coming soon/i,
  /under construction/i,
  /full content for/i,
  /would go here/i,
  /lorem ipsum/i,
  /run ai fetch/i,
  /admin panel/i,
];

export const hasUnsafePublicPlaceholder = (...values: Array<string | null | undefined>) => {
  const text = normalizePlainText(...values);
  if (!text) return true;
  return unsafePublicContentPatterns.some((pattern) => pattern.test(text));
};
