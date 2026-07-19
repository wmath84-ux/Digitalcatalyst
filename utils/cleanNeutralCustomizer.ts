import {
  DEFAULT_CLEAN_NEUTRAL_ADVANCED_CUSTOMIZER,
  applyCleanNeutralAdvancedRuntime,
  normalizeCleanNeutralAdvancedCustomizer,
  type CleanNeutralAdvancedCustomizerSettings,
} from './cleanNeutralAdvancedCustomizer';

export const CLEAN_NEUTRAL_DEVICE_SCOPES = ['desktop', 'tablet', 'mobile'] as const;

export type CleanNeutralDeviceScope = typeof CLEAN_NEUTRAL_DEVICE_SCOPES[number];

export interface CleanNeutralPageDefinition {
  id: string;
  label: string;
  group: 'Main pages' | 'Learning' | 'Reading' | 'Home sections' | 'Administration';
}

export const CLEAN_NEUTRAL_PAGE_REGISTRY = [
  { id: 'home', label: 'Home', group: 'Main pages' },
  { id: 'mayDay', label: 'May Day', group: 'Main pages' },
  { id: 'allProducts', label: 'Store / All Products', group: 'Main pages' },
  { id: 'product', label: 'Product Details', group: 'Main pages' },
  { id: 'myPurchases', label: 'My Purchases', group: 'Main pages' },
  { id: 'wishlist', label: 'Wishlist', group: 'Main pages' },
  { id: 'freeProducts', label: 'Free Products', group: 'Main pages' },
  { id: 'subscription', label: 'Subscriptions', group: 'Main pages' },
  { id: 'congratulations', label: 'Congratulations', group: 'Main pages' },
  { id: 'profile', label: 'Profile', group: 'Main pages' },
  { id: 'community', label: 'Community', group: 'Main pages' },
  { id: 'auth', label: 'User Login / Signup', group: 'Main pages' },
  { id: 'policies', label: 'Policies', group: 'Main pages' },
  { id: 'coursePlayer', label: 'Course Player', group: 'Learning' },
  { id: 'course', label: 'Course Workspace', group: 'Learning' },
  { id: 'eduCoinGuide', label: 'EduCoin Guide', group: 'Learning' },
  { id: 'news', label: 'News List', group: 'Reading' },
  { id: 'article', label: 'Article Reader', group: 'Reading' },
  { id: 'announcement', label: 'Announcement Reader', group: 'Reading' },
  { id: 'reading', label: 'Reading Drawer', group: 'Reading' },
  { id: 'hero', label: 'Home — Hero', group: 'Home sections' },
  { id: 'purchased', label: 'Home — Purchased', group: 'Home sections' },
  { id: 'purchases', label: 'Home — Purchases', group: 'Home sections' },
  { id: 'topRated', label: 'Home — Top Rated', group: 'Home sections' },
  { id: 'services', label: 'Home — Services', group: 'Home sections' },
  { id: 'about', label: 'Home — About', group: 'Home sections' },
  { id: 'trust', label: 'Home — Trust', group: 'Home sections' },
  { id: 'upcoming', label: 'Home — Upcoming', group: 'Home sections' },
  { id: 'faq', label: 'Home — FAQ', group: 'Home sections' },
  { id: 'adminLogin', label: 'Admin Login', group: 'Administration' },
  { id: 'admin', label: 'Admin Panel', group: 'Administration' },
] as const satisfies readonly CleanNeutralPageDefinition[];

export type CleanNeutralPageId = typeof CLEAN_NEUTRAL_PAGE_REGISTRY[number]['id'];

export const CLEAN_NEUTRAL_RULE_IDS = [
  'pageBackground',
  'sectionBackground',
  'surfaceBackground',
  'headingColor',
  'bodyTextColor',
  'secondaryTextColor',
  'mutedTextColor',
  'iconColor',
  'primaryButtonBackground',
  'primaryButtonText',
  'secondaryButtonBackground',
  'secondaryButtonText',
  'activeStateBackground',
  'activeStateText',
  'inactiveStateText',
  'borderColor',
  'controlRadius',
  'cardRadius',
  'shadowIntensity',
  'motionIntensity',
] as const;

export type CleanNeutralRuleId = typeof CLEAN_NEUTRAL_RULE_IDS[number];
export type CleanNeutralShadowIntensity = 'none' | 'subtle' | 'medium' | 'strong';
export type CleanNeutralMotionIntensity = 'none' | 'reduced' | 'standard';

export interface CleanNeutralRuleValues {
  pageBackground: string;
  sectionBackground: string;
  surfaceBackground: string;
  headingColor: string;
  bodyTextColor: string;
  secondaryTextColor: string;
  mutedTextColor: string;
  iconColor: string;
  primaryButtonBackground: string;
  primaryButtonText: string;
  secondaryButtonBackground: string;
  secondaryButtonText: string;
  activeStateBackground: string;
  activeStateText: string;
  inactiveStateText: string;
  borderColor: string;
  controlRadius: number;
  cardRadius: number;
  shadowIntensity: CleanNeutralShadowIntensity;
  motionIntensity: CleanNeutralMotionIntensity;
}

export type CleanNeutralTargetOverride = Partial<CleanNeutralRuleValues>;

export interface CleanNeutralCustomizerSettings {
  version: 2;
  targets: Record<string, CleanNeutralTargetOverride>;
  advanced: CleanNeutralAdvancedCustomizerSettings;
}

export const DEFAULT_CLEAN_NEUTRAL_RULE_VALUES: CleanNeutralRuleValues = {
  pageBackground: '#F7F7F8',
  sectionBackground: '#F3F4F6',
  surfaceBackground: '#FFFFFF',
  headingColor: '#171717',
  bodyTextColor: '#262626',
  secondaryTextColor: '#525252',
  mutedTextColor: '#737373',
  iconColor: '#262626',
  primaryButtonBackground: '#171717',
  primaryButtonText: '#FFFFFF',
  secondaryButtonBackground: '#F1F1F1',
  secondaryButtonText: '#171717',
  activeStateBackground: '#EDEDED',
  activeStateText: '#171717',
  inactiveStateText: '#737373',
  borderColor: '#E5E5E5',
  controlRadius: 10,
  cardRadius: 14,
  shadowIntensity: 'subtle',
  motionIntensity: 'standard',
};

export const DEFAULT_CLEAN_NEUTRAL_CUSTOMIZER: CleanNeutralCustomizerSettings = {
  version: 2,
  targets: {},
  advanced: DEFAULT_CLEAN_NEUTRAL_ADVANCED_CUSTOMIZER,
};

const PAGE_IDS = new Set<string>(CLEAN_NEUTRAL_PAGE_REGISTRY.map(page => page.id));
const DEVICE_IDS = new Set<string>(CLEAN_NEUTRAL_DEVICE_SCOPES);
const COLOR_RULES = new Set<CleanNeutralRuleId>([
  'pageBackground',
  'sectionBackground',
  'surfaceBackground',
  'headingColor',
  'bodyTextColor',
  'secondaryTextColor',
  'mutedTextColor',
  'iconColor',
  'primaryButtonBackground',
  'primaryButtonText',
  'secondaryButtonBackground',
  'secondaryButtonText',
  'activeStateBackground',
  'activeStateText',
  'inactiveStateText',
  'borderColor',
]);
const COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const MAX_TARGETS = CLEAN_NEUTRAL_PAGE_REGISTRY.length * CLEAN_NEUTRAL_DEVICE_SCOPES.length;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const isCleanNeutralPageId = (value: unknown): value is CleanNeutralPageId =>
  typeof value === 'string' && PAGE_IDS.has(value);

export const isCleanNeutralDeviceScope = (value: unknown): value is CleanNeutralDeviceScope =>
  typeof value === 'string' && DEVICE_IDS.has(value);

export const makeCleanNeutralTargetKey = (
  pageId: CleanNeutralPageId,
  device: CleanNeutralDeviceScope,
): string => `${pageId}:${device}`;

export const splitCleanNeutralTargetKey = (
  value: string,
): { pageId: CleanNeutralPageId; device: CleanNeutralDeviceScope } | null => {
  const separator = value.lastIndexOf(':');
  if (separator <= 0) return null;
  const pageId = value.slice(0, separator);
  const device = value.slice(separator + 1);
  return isCleanNeutralPageId(pageId) && isCleanNeutralDeviceScope(device)
    ? { pageId, device }
    : null;
};

export const normalizeCleanNeutralPageId = (value: unknown): CleanNeutralPageId =>
  isCleanNeutralPageId(value) ? value : 'home';

export const resolveCleanNeutralDeviceScope = (
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440,
): CleanNeutralDeviceScope => {
  if (viewportWidth <= 768) return 'mobile';
  if (viewportWidth < 1024) return 'tablet';
  return 'desktop';
};

const normalizeRuleValue = (
  ruleId: CleanNeutralRuleId,
  value: unknown,
): unknown | undefined => {
  if (COLOR_RULES.has(ruleId)) {
    const color = typeof value === 'string' ? value.trim() : '';
    return COLOR_PATTERN.test(color) ? color.toUpperCase() : undefined;
  }

  if (ruleId === 'controlRadius' || ruleId === 'cardRadius') {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(48, Math.round(number))) : undefined;
  }

  if (ruleId === 'shadowIntensity') {
    return value === 'none' || value === 'subtle' || value === 'medium' || value === 'strong'
      ? value
      : undefined;
  }

  if (ruleId === 'motionIntensity') {
    return value === 'none' || value === 'reduced' || value === 'standard'
      ? value
      : undefined;
  }

  return undefined;
};

export const normalizeCleanNeutralCustomizer = (
  input: unknown,
): CleanNeutralCustomizerSettings => {
  const raw = isRecord(input) ? input : {};
  const rawTargets = isRecord(raw.targets) ? raw.targets : {};
  const targets: Record<string, CleanNeutralTargetOverride> = {};

  Object.entries(rawTargets)
    .slice(0, MAX_TARGETS)
    .forEach(([targetKey, rawOverride]) => {
      if (!splitCleanNeutralTargetKey(targetKey) || !isRecord(rawOverride)) return;
      const cleaned: CleanNeutralTargetOverride = {};

      CLEAN_NEUTRAL_RULE_IDS.forEach(ruleId => {
        const normalized = normalizeRuleValue(ruleId, rawOverride[ruleId]);
        if (normalized !== undefined) {
          (cleaned as Record<string, unknown>)[ruleId] = normalized;
        }
      });

      if (Object.keys(cleaned).length > 0) targets[targetKey] = cleaned;
    });

  return {
    version: 2,
    targets,
    advanced: normalizeCleanNeutralAdvancedCustomizer(raw.advanced),
  };
};

export const resolveCleanNeutralRuleValues = (
  settings: unknown,
  pageId: CleanNeutralPageId,
  device: CleanNeutralDeviceScope,
): CleanNeutralRuleValues => {
  const normalized = normalizeCleanNeutralCustomizer(settings);
  return {
    ...DEFAULT_CLEAN_NEUTRAL_RULE_VALUES,
    ...(normalized.targets[makeCleanNeutralTargetKey(pageId, device)] || {}),
  };
};

const SHADOW_VALUES: Record<
  CleanNeutralShadowIntensity,
  { card: string; floating: string }
> = {
  none: { card: 'none', floating: 'none' },
  subtle: {
    card: '0 1px 3px rgba(0, 0, 0, 0.04)',
    floating: '0 12px 32px rgba(0, 0, 0, 0.10)',
  },
  medium: {
    card: '0 4px 14px rgba(0, 0, 0, 0.08)',
    floating: '0 16px 38px rgba(0, 0, 0, 0.13)',
  },
  strong: {
    card: '0 8px 24px rgba(0, 0, 0, 0.12)',
    floating: '0 22px 54px rgba(0, 0, 0, 0.18)',
  },
};

const MOTION_VALUES: Record<
  CleanNeutralMotionIntensity,
  { fast: string; normal: string }
> = {
  none: { fast: '0ms', normal: '0ms' },
  reduced: { fast: '90ms', normal: '120ms' },
  standard: { fast: '160ms', normal: '180ms' },
};

const RUNTIME_PROPERTIES = [
  '--cn-page',
  '--cn-section',
  '--cn-surface',
  '--cn-heading',
  '--cn-text',
  '--cn-text-secondary',
  '--cn-muted',
  '--cn-icon',
  '--cn-primary',
  '--cn-primary-hover',
  '--cn-primary-foreground',
  '--cn-control',
  '--cn-control-hover',
  '--cn-secondary-foreground',
  '--cn-active',
  '--cn-active-foreground',
  '--cn-inactive-foreground',
  '--cn-disabled',
  '--cn-border-soft',
  '--cn-border',
  '--cn-border-strong',
  '--cn-radius-control',
  '--cn-radius-card',
  '--cn-shadow-card',
  '--cn-shadow-float',
  '--cn-motion-fast',
  '--cn-motion-normal',
] as const;

export const applyCleanNeutralRuntime = (
  root: HTMLElement,
  settings: unknown,
  currentPage: unknown,
  viewportWidth: number,
  enabled: boolean,
): void => {
  if (!enabled) {
    RUNTIME_PROPERTIES.forEach(property => root.style.removeProperty(property));
    delete root.dataset.cleanNeutralPage;
    delete root.dataset.cleanNeutralDevice;
    applyCleanNeutralAdvancedRuntime(undefined, 'home', 'desktop', false);
    return;
  }

  const pageId = normalizeCleanNeutralPageId(currentPage);
  const device = resolveCleanNeutralDeviceScope(viewportWidth);
  const values = resolveCleanNeutralRuleValues(settings, pageId, device);
  const shadow = SHADOW_VALUES[values.shadowIntensity];
  const motion = MOTION_VALUES[values.motionIntensity];

  root.dataset.cleanNeutralPage = pageId;
  root.dataset.cleanNeutralDevice = device;

  const properties: Record<string, string> = {
    '--cn-page': values.pageBackground,
    '--cn-section': values.sectionBackground,
    '--cn-surface': values.surfaceBackground,
    '--cn-heading': values.headingColor,
    '--cn-text': values.bodyTextColor,
    '--cn-text-secondary': values.secondaryTextColor,
    '--cn-muted': values.mutedTextColor,
    '--cn-icon': values.iconColor,
    '--cn-primary': values.primaryButtonBackground,
    '--cn-primary-hover': values.primaryButtonBackground,
    '--cn-primary-foreground': values.primaryButtonText,
    '--cn-control': values.secondaryButtonBackground,
    '--cn-control-hover': values.secondaryButtonBackground,
    '--cn-secondary-foreground': values.secondaryButtonText,
    '--cn-active': values.activeStateBackground,
    '--cn-active-foreground': values.activeStateText,
    '--cn-inactive-foreground': values.inactiveStateText,
    '--cn-disabled': values.inactiveStateText,
    '--cn-border-soft': values.borderColor,
    '--cn-border': values.borderColor,
    '--cn-border-strong': values.borderColor,
    '--cn-radius-control': `${values.controlRadius}px`,
    '--cn-radius-card': `${values.cardRadius}px`,
    '--cn-shadow-card': shadow.card,
    '--cn-shadow-float': shadow.floating,
    '--cn-motion-fast': motion.fast,
    '--cn-motion-normal': motion.normal,
  };

  Object.entries(properties).forEach(([property, value]) => {
    root.style.setProperty(property, value);
  });

  applyCleanNeutralAdvancedRuntime(
    normalizeCleanNeutralCustomizer(settings).advanced,
    pageId,
    device,
    true,
  );
};
