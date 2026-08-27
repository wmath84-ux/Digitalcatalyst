import type { CourseModule, CourseFile } from '../src/types/course';
import type { Product } from '../src/data/products';

const STOP_WORDS = new Set(['a', 'an', 'the', 'for', 'and', 'or', 'of', 'to', 'in', 'on']);

export const normalizeSearchValue = (value: unknown): string => String(value ?? '')
  .toLowerCase()
  .replace(/[\-_]+/g, ' ')
  .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const splitSearchTokens = (value: unknown): string[] => {
  const normalized = normalizeSearchValue(value);
  if (!normalized) return [];
  return Array.from(new Set(normalized.split(' ').filter(token => token.length > 1 && !STOP_WORDS.has(token))));
};

export const parseKeywordList = (value: unknown): string[] => {
  const rawValues = Array.isArray(value) ? value : String(value ?? '').split(/[\n,]+/);
  const seen = new Set<string>();
  return rawValues
    .map(item => normalizeSearchValue(item))
    .filter(item => item && !seen.has(item) && seen.add(item));
};

const collectCourseText = (modules: CourseModule[] = []): string[] => modules.flatMap(module => [
  module.title,
  ...(module.files || []).flatMap((file: CourseFile) => [file.name, file.type, file.paidUpdateTitle]),
  ...collectCourseText(module.modules || []),
].filter(Boolean) as string[]);

// Optional product fields referenced by the search index. These are not on
// the canonical `Product` shape, so we type the input as a permissive union
// (Product + optional extras) rather than `Partial<Product>`.
type ProductSearchInput = Product & {
  description?: string;
  longDescription?: string;
  fileFormat?: string;
  dimensions?: string;
  sku?: string;
  isVisible?: boolean;
  keywords?: string[];
  status?: string;
  isDeleted?: boolean;
  productType?: string;
  class?: string;
  grade?: string;
  subject?: string;
  board?: string;
  exam?: string;
  language?: string;
  publisher?: string;
  edition?: string;
  format?: string;
  author?: string;
};

const compactLetters = (value: string): string => value.replace(/\s+/g, '');

const buildAcronym = (value: string): string => value
  .split(' ')
  .filter(Boolean)
  .map(word => word[0])
  .join('');

export const buildProductSearchIndex = (product: ProductSearchInput) => {
  const keywords = parseKeywordList(product.keywords || (product as Partial<Product> & { searchKeywords?: string[] }).searchKeywords || []);
  const searchableParts = [
    product.title,
    product.category,
    product.description,
    product.longDescription,
    product.fileFormat,
    product.dimensions,
    product.sku,
    product.productType,
    product.class,
    product.grade,
    product.subject,
    product.board,
    product.exam,
    product.language,
    product.publisher,
    product.edition,
    product.format,
    product.author,
    ...(product.tags || []),
    ...(product.features || []),
    ...keywords,
    ...collectCourseText(product.courseContent || []),
  ];
  const searchableText = normalizeSearchValue(searchableParts.join(' '));
  const compactText = compactLetters(searchableText);
  const acronymText = compactLetters(buildAcronym(searchableText));
  return {
    keywords,
    normalizedTitle: normalizeSearchValue(product.title),
    normalizedCategory: normalizeSearchValue(product.category),
    normalizedTags: (product.tags || []).map(normalizeSearchValue).filter(Boolean),
    normalizedKeywords: keywords,
    searchableText,
    normalizedSearchText: searchableText,
    compactText,
    acronymText,
    searchTokens: splitSearchTokens(searchableText),
  };
};

export const withProductSearchIndex = <T extends ProductSearchInput>(product: T): T => ({
  ...product,
  ...buildProductSearchIndex(product),
});

export const isProductSearchVisible = (product: ProductSearchInput): boolean => product.isVisible !== false && product.status !== 'draft' && product.status !== 'archived' && product.isDeleted !== true;

const boundedTokenDistance = (left: string, right: string, maxDistance: number): number => {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const distance = Math.min(previous[rightIndex] + 1, current[rightIndex - 1] + 1, previous[rightIndex - 1] + cost);
      current.push(distance);
      rowMinimum = Math.min(rowMinimum, distance);
    }
    if (rowMinimum > maxDistance) return maxDistance + 1;
    previous = current;
  }
  return previous[right.length];
};

const looseTokenMatch = (queryToken: string, fieldToken: string): boolean => {
  if (fieldToken.includes(queryToken) || fieldToken.startsWith(queryToken)) return true;
  if (queryToken.length >= 4 && fieldToken.startsWith(queryToken.slice(0, -1))) return true;
  const maxDistance = queryToken.length >= 7 ? 2 : queryToken.length >= 4 ? 1 : 0;
  return maxDistance > 0 && boundedTokenDistance(queryToken, fieldToken, maxDistance) <= maxDistance;
};

export const rankProductForQuery = (product: ProductSearchInput, query: string): number => {
  const normalizedQuery = normalizeSearchValue(query);
  const tokens = splitSearchTokens(normalizedQuery);
  if (!normalizedQuery) return 1;
  const index = buildProductSearchIndex(product);
  const title = index.normalizedTitle;
  const categories = [index.normalizedCategory, ...(product.tags || []).map(normalizeSearchValue)];
  const keywords = index.normalizedKeywords;
  const description = normalizeSearchValue([product.description, product.longDescription ?? ''].join(' '));
  const compactQuery = compactLetters(normalizedQuery);
  const lettersMatch = compactQuery.length >= 2 && (index.compactText.includes(compactQuery) || index.acronymText.includes(compactQuery));
  const allTokensMatch = tokens.every(token =>
    index.searchableText.includes(token)
    || index.compactText.includes(token)
    || index.acronymText.includes(token)
    || index.searchTokens.some(fieldToken => looseTokenMatch(token, fieldToken))
  );
  if (!allTokensMatch && !lettersMatch) return 0;

  let score = 10;
  if (title === normalizedQuery) score += 1000;
  else if (title.startsWith(normalizedQuery)) score += 800;
  else if (title.includes(normalizedQuery)) score += 650;
  if (lettersMatch) score += 60;
  score += tokens.reduce((sum, token) => {
    if (title.includes(token)) return sum + 120;
    if (categories.some(item => item.includes(token))) return sum + 90;
    if (keywords.some(item => item.includes(token))) return sum + 75;
    if (description.includes(token)) return sum + 35;
    if (index.searchTokens.some(fieldToken => looseTokenMatch(token, fieldToken))) return sum + 25;
    return sum + 15;
  }, 0);
  return score;
};
