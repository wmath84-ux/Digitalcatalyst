export const REVIEW_STABLE_MODE = String(import.meta.env.VITE_REVIEW_STABLE_MODE || '').toLowerCase() === 'true';

export const REVIEW_SAFE_MIN_DETAIL_WORDS = 500;
export const REVIEW_SAFE_MIN_LIST_CARDS = 6;

export const normalizePlainText = (value = '') => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/[#*_`>\-\[\](){}|~]/g, ' ')
  .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const countVisibleWords = (value = '') => {
  const