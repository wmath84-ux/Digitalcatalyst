import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface EconomyOverride {
  targetId: string;
  coinPrice?: number;
  maxDiscountPercentage?: number;
}

export interface EconomySettings {
  coinPerVideoMinute: number;
  coinPerArticleRead: number;
  articleReadTimeRequiredSec: number;
  articleReadScrollRequiredPercent: number;
  coinPerQuizCorrect: number;
  coinPerPurchase: number;
  coinToFiatRatio: number;
  maxDiscountPercentage: number;
  productOverrides: Record<string, EconomyOverride>;
  subscriptionOverrides: Record<string, EconomyOverride>;
  updatedAt?: string;
}

export const DEFAULT_ECONOMY_SETTINGS: EconomySettings = {
  coinPerVideoMinute: 1,
  coinPerArticleRead: 10,
  articleReadTimeRequiredSec: 120,
  articleReadScrollRequiredPercent: 75,
  coinPerQuizCorrect: 2,
  coinPerPurchase: 25,
  coinToFiatRatio: 10,
  maxDiscountPercentage: 50,
  productOverrides: {},
  subscriptionOverrides: {},
};

const sanitizeNumber = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
};

export const normalizeEconomySettings = (value?: Partial<EconomySettings> | null): EconomySettings => ({
  coinPerVideoMinute: sanitizeNumber(value?.coinPerVideoMinute, DEFAULT_ECONOMY_SETTINGS.coinPerVideoMinute),
  coinPerArticleRead: sanitizeNumber(value?.coinPerArticleRead, DEFAULT_ECONOMY_SETTINGS.coinPerArticleRead),
  articleReadTimeRequiredSec: sanitizeNumber(value?.articleReadTimeRequiredSec, DEFAULT_ECONOMY_SETTINGS.articleReadTimeRequiredSec),
  articleReadScrollRequiredPercent: Math.min(100, sanitizeNumber(value?.articleReadScrollRequiredPercent, DEFAULT_ECONOMY_SETTINGS.articleReadScrollRequiredPercent)),
  coinPerQuizCorrect: sanitizeNumber(value?.coinPerQuizCorrect, DEFAULT_ECONOMY_SETTINGS.coinPerQuizCorrect),
  coinPerPurchase: sanitizeNumber((value as EconomySettings | undefined)?.coinPerPurchase, DEFAULT_ECONOMY_SETTINGS.coinPerPurchase),
  coinToFiatRatio: Math.max(1, sanitizeNumber(value?.coinToFiatRatio, DEFAULT_ECONOMY_SETTINGS.coinToFiatRatio)),
  maxDiscountPercentage: Math.min(100, sanitizeNumber(value?.maxDiscountPercentage, DEFAULT_ECONOMY_SETTINGS.maxDiscountPercentage)),
  productOverrides: value?.productOverrides || {},
  subscriptionOverrides: value?.subscriptionOverrides || {},
  updatedAt: value?.updatedAt,
});

export const economySettingsRef = () => doc(db, 'settings', 'economy');

export const subscribeEconomySettings = (onChange: (settings: EconomySettings) => void, onError?: (error: Error) => void) => {
  try {
    return onSnapshot(economySettingsRef(), (snapshot) => {
      onChange(normalizeEconomySettings(snapshot.exists() ? snapshot.data() as Partial<EconomySettings> : null));
    }, (error) => {
      onError?.(error as Error);
      onChange(DEFAULT_ECONOMY_SETTINGS);
    });
  } catch (error) {
    onError?.(error as Error);
    onChange(DEFAULT_ECONOMY_SETTINGS);
    return () => undefined;
  }
};

export const saveEconomySettings = async (settings: EconomySettings) => {
  const normalized = normalizeEconomySettings({ ...settings, updatedAt: new Date().toISOString() });
  await setDoc(economySettingsRef(), normalized, { merge: true });
  return normalized;
};

export const getOverrideForTarget = (settings: EconomySettings, targetType: 'product' | 'subscription', targetId: string | number) => {
  const overrides = targetType === 'product' ? settings.productOverrides : settings.subscriptionOverrides;
  return overrides[String(targetId)] || null;
};

export const resolveCoinPrice = (fallbackCoinPrice: number | undefined, settings: EconomySettings, targetType: 'product' | 'subscription', targetId: string | number) => {
  const override = getOverrideForTarget(settings, targetType, targetId);
  return Number(override?.coinPrice ?? fallbackCoinPrice ?? 0);
};

export const resolveMaxDiscountPercentage = (settings: EconomySettings, targetType: 'product' | 'subscription', targetId: string | number) => {
  const override = getOverrideForTarget(settings, targetType, targetId);
  return Math.min(100, Math.max(0, Number(override?.maxDiscountPercentage ?? settings.maxDiscountPercentage)));
};
