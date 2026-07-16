export interface ProductRoundnessSettings {
  storeCards: boolean;
  homeFeaturedCards: boolean;
  homePreviewCards: boolean;
  wishlistCards: boolean;
  productDetailPanels: boolean;
  myPurchasesCards: boolean;
  mediaInnerFrame: boolean;
  productBadges: boolean;
  productActionButtons: boolean;
}

export type ProductRoundnessKey = keyof ProductRoundnessSettings;

export const DEFAULT_PRODUCT_ROUNDNESS_SETTINGS: ProductRoundnessSettings = {
  storeCards: true,
  homeFeaturedCards: true,
  homePreviewCards: true,
  wishlistCards: true,
  productDetailPanels: true,
  myPurchasesCards: true,
  mediaInnerFrame: true,
  productBadges: true,
  productActionButtons: true,
};

export const resolveProductRoundnessSettings = (settings?: any): ProductRoundnessSettings => ({
  ...DEFAULT_PRODUCT_ROUNDNESS_SETTINGS,
  ...((settings?.content?.productRoundness || {}) as Partial<ProductRoundnessSettings>),
});

export const productRoundnessModeLabel = (enabled: boolean) => (enabled ? 'Round' : 'Default');

export const pillClassForProductRoundness = (enabled: boolean) => (enabled ? 'rounded-full' : 'rounded-lg');
