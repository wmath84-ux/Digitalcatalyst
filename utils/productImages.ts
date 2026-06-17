import { Product } from '../App';

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

export const getProductImageFallback = (product: Pick<Product, 'images' | 'imageSeed'>): string => {
  const firstImage = Array.isArray(product.images) ? product.images.find(Boolean) : undefined;
  return firstImage || `https://picsum.photos/seed/${product.imageSeed || 'product'}/800/600`;
};

export const getProductImage = (product: Product, slot: ProductImageSlot): string => {
  const slotImage = product.productImages?.[slot];
  return slotImage || getProductImageFallback(product);
};
