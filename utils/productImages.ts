import { Product } from '../App';
import { buildProductImageFallback, resolveProductImage, resolveProductImageCandidates } from './mediaCompat';

export type ProductImageSlot = 'card' | 'detailMobile' | 'detailDesktop' | 'homeTopRated' | 'homeList' | 'purchaseSquare' | 'purchaseCard' | 'galleryThumb';

export const PRODUCT_IMAGE_SLOTS: Record<ProductImageSlot, { label: string; ratio: string; aspectClass: string; recommendedSize: string; ratioValue: number }> = {
  card: { label: 'Product Card / Product Page Grid', ratio: '4:3', aspectClass: 'aspect-[4/3]', recommendedSize: '1200x900', ratioValue: 4 / 3 },
  detailMobile: { label: 'Product Detail Mobile', ratio: '4:3', aspectClass: 'aspect-[4/3]', recommendedSize: '1200x900', ratioValue: 4 / 3 },
  detailDesktop: { label: 'Product Detail Desktop', ratio: '16:9', aspectClass: 'aspect-video', recommendedSize: '1600x900 or 1920x1080', ratioValue: 16 / 9 },
  homeTopRated: { label: 'Mobile Home Top Rated', ratio: '1:1', aspectClass: 'aspect-square', recommendedSize: '1024x1024', ratioValue: 1 },
  homeList: { label: 'Mobile Home All Products Row', ratio: '6:7', aspectClass: 'aspect-[6/7]', recommendedSize: '900x1050', ratioValue: 6 / 7 },
  purchaseSquare: { label: 'Mobile Purchase Preview', ratio: '1:1', aspectClass: 'aspect-square', recommendedSize: '1024x1024', ratioValue: 1 },
  purchaseCard: { label: 'Purchased Products Card', ratio: '4:3', aspectClass: 'aspect-[4/3]', recommendedSize: '1200x900', ratioValue: 4 / 3 },
  galleryThumb: { label: 'Gallery Thumbnail', ratio: '1:1', aspectClass: 'aspect-square', recommendedSize: '512x512', ratioValue: 1 },
};

export const getProductImageFallback = (product: Pick<Product, 'images' | 'imageSeed' | 'title' | 'category'>): string => buildProductImageFallback(product);

const PRODUCT_IMAGE_SLOT_FALLBACKS: Record<ProductImageSlot, ProductImageSlot[]> = {
  card: ['card', 'detailMobile', 'purchaseCard', 'galleryThumb', 'homeTopRated'],
  detailMobile: ['detailMobile', 'card', 'purchaseCard', 'detailDesktop'],
  detailDesktop: ['detailDesktop', 'detailMobile', 'card', 'purchaseCard'],
  homeTopRated: ['homeTopRated', 'purchaseSquare', 'galleryThumb', 'card'],
  homeList: ['homeList', 'card', 'detailMobile', 'purchaseCard'],
  purchaseSquare: ['purchaseSquare', 'purchaseCard', 'homeTopRated', 'galleryThumb', 'card', 'detailMobile'],
  purchaseCard: ['purchaseCard', 'purchaseSquare', 'card', 'detailMobile', 'detailDesktop', 'homeTopRated', 'galleryThumb'],
  galleryThumb: ['galleryThumb', 'homeTopRated', 'purchaseSquare', 'card'],
};

const isGeneratedProductImageFallback = (url: string): boolean => {
  const value = String(url || '').trim();
  return !value || value.startsWith('data:image/svg+xml');
};

export const getProductImageCandidates = (product: Product, slot: ProductImageSlot): string[] => {
  const fallbackSlots = PRODUCT_IMAGE_SLOT_FALLBACKS[slot] || [slot];
  const candidates = fallbackSlots.flatMap((candidateSlot) => resolveProductImageCandidates(product, candidateSlot));
  const uniqueCandidates = Array.from(new Set(candidates.filter((value) => !isGeneratedProductImageFallback(value))));
  return uniqueCandidates.length ? uniqueCandidates : [resolveProductImage(product, slot)];
};

export const getProductImage = (product: Product, slot: ProductImageSlot): string => {
  const candidates = getProductImageCandidates(product, slot);
  return candidates[0] || resolveProductImage(product, slot);
};
