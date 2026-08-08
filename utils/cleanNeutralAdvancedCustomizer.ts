export const CLEAN_NEUTRAL_REGION_REGISTRY = [
  { id: 'shell.page', label: 'Page canvas', group: 'Global shell' },
  { id: 'shell.header', label: 'Header', group: 'Global shell' },
  { id: 'shell.navigation', label: 'Navigation', group: 'Global shell' },
  { id: 'shell.main', label: 'Main content', group: 'Global shell' },
  { id: 'shell.sidebar', label: 'Sidebar', group: 'Global shell' },
  { id: 'shell.footer', label: 'Footer', group: 'Global shell' },
  { id: 'content.hero', label: 'Hero', group: 'Content' },
  { id: 'content.search', label: 'Search', group: 'Content' },
  { id: 'content.toolbar', label: 'Toolbar', group: 'Content' },
  { id: 'content.cardGrid', label: 'Card grid', group: 'Content' },
  { id: 'content.card', label: 'Cards', group: 'Content' },
  { id: 'content.media', label: 'Media', group: 'Content' },
  { id: 'content.actions', label: 'Actions', group: 'Content' },
  { id: 'content.form', label: 'Forms', group: 'Content' },
  { id: 'overlay.drawer', label: 'Drawers', group: 'Overlays' },
  { id: 'overlay.dialog', label: 'Dialogs', group: 'Overlays' },
  { id: 'overlay.notifications', label: 'Notification panels', group: 'Overlays' },
  { id: 'community.feed', label: 'Community feed', group: 'Workspaces' },
  { id: 'community.ai', label: 'Community AI Mentor', group: 'Workspaces' },
  { id: 'course.header', label: 'Course header', group: 'Workspaces' },
  { id: 'course.modules', label: 'Course module panel', group: 'Workspaces' },
  { id: 'course.content', label: 'Course content', group: 'Workspaces' },
  { id: 'reading.panel', label: 'Reading panel', group: 'Workspaces' },
  { id: 'admin.sidebar', label: 'Admin sidebar', group: 'Workspaces' },
  { id: 'admin.content', label: 'Admin content', group: 'Workspaces' },
  { id: 'navigation.mobileDock', label: 'Mobile bottom dock', group: 'Workspaces' },
] as const;

export type CleanNeutralRegionId = typeof CLEAN_NEUTRAL_REGION_REGISTRY[number]['id'];

export const PROFESSIONAL_ICON_LIBRARY = [
  'home', 'calendar', 'store', 'book-open', 'heart', 'shopping-cart',
  'megaphone', 'message-circle', 'file-text', 'gift', 'user', 'lock',
  'gem', 'search', 'settings', 'menu', 'close', 'brain', 'sparkle',
  'graduation-cap', 'star', 'tag', 'bell', 'arrow-left', 'arrow-right',
  'plus', 'minus', 'pin', 'grid', 'play', 'pause', 'document', 'image',
  'upload', 'download',
] as const;

export type ProfessionalIconName = typeof PROFESSIONAL_ICON_LIBRARY[number];

export const CLEAN_NEUTRAL_ICON_SLOT_REGISTRY = [
  { id: 'nav.mayDay', label: 'My Day', group: 'Navigation', defaultIcon: 'calendar' },
  { id: 'nav.home', label: 'Home', group: 'Navigation', defaultIcon: 'home' },
  { id: 'nav.store', label: 'Store', group: 'Navigation', defaultIcon: 'store' },
  { id: 'nav.purchased', label: 'Purchased', group: 'Navigation', defaultIcon: 'book-open' },
  { id: 'nav.wishlist', label: 'Wishlist', group: 'Navigation', defaultIcon: 'heart' },
  { id: 'nav.cart', label: 'Cart', group: 'Navigation', defaultIcon: 'shopping-cart' },
  { id: 'nav.news', label: 'News', group: 'Navigation', defaultIcon: 'megaphone' },
  { id: 'nav.community', label: 'Community', group: 'Navigation', defaultIcon: 'message-circle' },
  { id: 'nav.blog', label: 'Blog', group: 'Navigation', defaultIcon: 'file-text' },
  { id: 'nav.free', label: 'Free', group: 'Navigation', defaultIcon: 'gift' },
  { id: 'nav.profile', label: 'Profile', group: 'Navigation', defaultIcon: 'user' },
  { id: 'nav.login', label: 'Login', group: 'Navigation', defaultIcon: 'lock' },
  { id: 'nav.subscriptions', label: 'Subscriptions', group: 'Navigation', defaultIcon: 'gem' },
  { id: 'nav.menu', label: 'Navigation menu', group: 'Navigation controls', defaultIcon: 'menu' },
  { id: 'nav.pin', label: 'Pin navigation', group: 'Navigation controls', defaultIcon: 'pin' },
  { id: 'home.search', label: 'Home search', group: 'Home controls', defaultIcon: 'search' },
  { id: 'home.storeShortcut', label: 'Store shortcut', group: 'Home controls', defaultIcon: 'sparkle' },
  { id: 'home.topRated', label: 'Top Rated', group: 'Home controls', defaultIcon: 'star' },
  { id: 'home.coupons', label: 'Coupons', group: 'Home controls', defaultIcon: 'tag' },
  { id: 'ai.menu', label: 'AI history menu', group: 'AI controls', defaultIcon: 'menu' },
  { id: 'ai.settings', label: 'AI settings', group: 'AI controls', defaultIcon: 'settings' },
  { id: 'ai.close', label: 'Close AI panel', group: 'AI controls', defaultIcon: 'close' },
  { id: 'ai.send', label: 'Send AI message', group: 'AI controls', defaultIcon: 'arrow-right' },
  { id: 'course.menu', label: 'Course module menu', group: 'Course controls', defaultIcon: 'grid' },
  { id: 'course.mentor', label: 'AI Mentor', group: 'Course controls', defaultIcon: 'brain' },
  { id: 'course.back', label: 'Course back', group: 'Course controls', defaultIcon: 'arrow-left' },
  { id: 'course.minimize', label: 'Minimize course panel', group: 'Course controls', defaultIcon: 'minus' },
  { id: 'course.openDocs', label: 'Open Docs', group: 'Course controls', defaultIcon: 'document' },
] as const satisfies readonly {
  id: string;
  label: string;
  group: string;
  defaultIcon: ProfessionalIconName;
}[];

export type CleanNeutralIconSlotId = typeof CLEAN_NEUTRAL_ICON_SLOT_REGISTRY[number]['id'];

export type RegionFontFamily = 'inherit' | 'inter' | 'lato' | 'montserrat' | 'roboto' | 'merriweather' | 'oswald';
export type RegionFontWeight = 400 | 500 | 600 | 700 | 800 | 900;
export type RegionBorderStyle = 'none' | 'solid' | 'dashed';
export type RegionTextAlign = 'inherit' | 'left' | 'center' | 'right';
export type RegionOverflow = 'inherit' | 'visible' | 'hidden' | 'auto';
export type IconDisplayMode = 'icon-only' | 'icon-with-text';
export type IconPosition = 'top' | 'bottom' | 'left' | 'right';

export interface CleanNeutralRegionOverride {
  opacity?: number;
  maxWidth?: number;
  minHeight?: number;
  paddingX?: number;
  paddingY?: number;
  marginTop?: number;
  marginBottom?: number;
  gap?: number;
  fontFamily?: RegionFontFamily;
  fontSize?: number;
  fontWeight?: RegionFontWeight;
  lineHeight?: number;
  letterSpacing?: number;
  borderWidth?: number;
  borderStyle?: RegionBorderStyle;
  radius?: number;
  textAlign?: RegionTextAlign;
  overflow?: RegionOverflow;
}

export interface CleanNeutralIconOverride {
  name?: ProfessionalIconName;
  displayMode?: IconDisplayMode;
  label?: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
  position?: IconPosition;
  gap?: number;
}

export interface CleanNeutralAdvancedCustomizerSettings {
  version: 1;
  regionTargets: Record<string, CleanNeutralRegionOverride>;
  iconTargets: Record<string, CleanNeutralIconOverride>;
}

export const DEFAULT_CLEAN_NEUTRAL_ADVANCED_CUSTOMIZER: CleanNeutralAdvancedCustomizerSettings = {
  version: 1,
  regionTargets: {},
  iconTargets: {},
};

const REGION_IDS = new Set<string>(CLEAN_NEUTRAL_REGION_REGISTRY.map(item => item.id));
const ICON_SLOT_IDS = new Set<string>(CLEAN_NEUTRAL_ICON_SLOT_REGISTRY.map(item => item.id));
const ICON_NAMES = new Set<string>(PROFESSIONAL_ICON_LIBRARY);
const COLOR_PATTERN = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i;
const TARGET_PATTERN = /^([^:]+):(desktop|tablet|mobile):(.+)$/;
const FONT_FAMILIES = new Set<RegionFontFamily>(['inherit', 'inter', 'lato', 'montserrat', 'roboto', 'merriweather', 'oswald']);
const FONT_WEIGHTS = new Set<number>([400, 500, 600, 700, 800, 900]);
const BORDER_STYLES = new Set<RegionBorderStyle>(['none', 'solid', 'dashed']);
const TEXT_ALIGNS = new Set<RegionTextAlign>(['inherit', 'left', 'center', 'right']);
const OVERFLOWS = new Set<RegionOverflow>(['inherit', 'visible', 'hidden', 'auto']);
const DISPLAY_MODES = new Set<IconDisplayMode>(['icon-only', 'icon-with-text']);
const ICON_POSITIONS = new Set<IconPosition>(['top', 'bottom', 'left', 'right']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const clamp = (value: unknown, minimum: number, maximum: number): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(minimum, Math.min(maximum, Math.round(numeric * 100) / 100))
    : undefined;
};

const cleanLabel = (value: unknown): string | undefined => {
  const label = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 60) : '';
  return label || undefined;
};

export const makeCleanNeutralRegionTargetKey = (
  pageId: string,
  device: string,
  regionId: CleanNeutralRegionId,
): string => `${pageId}:${device}:${regionId}`;

export const makeCleanNeutralIconTargetKey = (
  pageId: string,
  device: string,
  slotId: CleanNeutralIconSlotId,
): string => `${pageId}:${device}:${slotId}`;

const splitTarget = (
  key: string,
  acceptedIds: Set<string>,
): { pageId: string; device: 'desktop' | 'tablet' | 'mobile'; itemId: string } | null => {
  const match = key.match(TARGET_PATTERN);
  if (!match || !acceptedIds.has(match[3])) return null;
  return {
    pageId: match[1],
    device: match[2] as 'desktop' | 'tablet' | 'mobile',
    itemId: match[3],
  };
};

export const normalizeCleanNeutralAdvancedCustomizer = (
  input: unknown,
): CleanNeutralAdvancedCustomizerSettings => {
  const raw = isRecord(input) ? input : {};
  const rawRegions = isRecord(raw.regionTargets) ? raw.regionTargets : {};
  const rawIcons = isRecord(raw.iconTargets) ? raw.iconTargets : {};
  const regionTargets: Record<string, CleanNeutralRegionOverride> = {};
  const iconTargets: Record<string, CleanNeutralIconOverride> = {};

  Object.entries(rawRegions).slice(0, 3000).forEach(([key, value]) => {
    if (!splitTarget(key, REGION_IDS) || !isRecord(value)) return;

    const cleaned: CleanNeutralRegionOverride = {};
    const numberRules: Array<[keyof CleanNeutralRegionOverride, number, number]> = [
      ['opacity', 0, 100],
      ['maxWidth', 160, 2400],
      ['minHeight', 0, 1600],
      ['paddingX', 0, 96],
      ['paddingY', 0, 96],
      ['marginTop', -96, 240],
      ['marginBottom', -96, 240],
      ['gap', 0, 96],
      ['fontSize', 9, 96],
      ['lineHeight', 1, 2.5],
      ['letterSpacing', -2, 12],
      ['borderWidth', 0, 8],
      ['radius', 0, 64],
    ];

    numberRules.forEach(([field, minimum, maximum]) => {
      const normalized = clamp(value[field], minimum, maximum);
      if (normalized !== undefined) (cleaned as Record<string, unknown>)[field] = normalized;
    });

    const weight = Number(value.fontWeight);
    if (FONT_WEIGHTS.has(weight)) cleaned.fontWeight = weight as RegionFontWeight;
    if (FONT_FAMILIES.has(value.fontFamily as RegionFontFamily)) cleaned.fontFamily = value.fontFamily as RegionFontFamily;
    if (BORDER_STYLES.has(value.borderStyle as RegionBorderStyle)) cleaned.borderStyle = value.borderStyle as RegionBorderStyle;
    if (TEXT_ALIGNS.has(value.textAlign as RegionTextAlign)) cleaned.textAlign = value.textAlign as RegionTextAlign;
    if (OVERFLOWS.has(value.overflow as RegionOverflow)) cleaned.overflow = value.overflow as RegionOverflow;

    if (Object.keys(cleaned).length > 0) regionTargets[key] = cleaned;
  });

  Object.entries(rawIcons).slice(0, 3000).forEach(([key, value]) => {
    if (!splitTarget(key, ICON_SLOT_IDS) || !isRecord(value)) return;

    const cleaned: CleanNeutralIconOverride = {};
    if (ICON_NAMES.has(String(value.name))) cleaned.name = String(value.name) as ProfessionalIconName;
    if (DISPLAY_MODES.has(value.displayMode as IconDisplayMode)) cleaned.displayMode = value.displayMode as IconDisplayMode;
    if (ICON_POSITIONS.has(value.position as IconPosition)) cleaned.position = value.position as IconPosition;

    const label = cleanLabel(value.label);
    if (label) cleaned.label = label;

    const size = clamp(value.size, 12, 64);
    if (size !== undefined) cleaned.size = size;
    const strokeWidth = clamp(value.strokeWidth, 1, 3);
    if (strokeWidth !== undefined) cleaned.strokeWidth = strokeWidth;
    const gap = clamp(value.gap, 0, 32);
    if (gap !== undefined) cleaned.gap = gap;

    const color = typeof value.color === 'string' ? value.color.trim() : '';
    if (COLOR_PATTERN.test(color)) cleaned.color = color.toUpperCase();

    if (Object.keys(cleaned).length > 0) iconTargets[key] = cleaned;
  });

  return { version: 1, regionTargets, iconTargets };
};

const FONT_MAP: Record<RegionFontFamily, string> = {
  inherit: 'inherit',
  inter: 'Inter, ui-sans-serif, system-ui, sans-serif',
  lato: 'Lato, Inter, sans-serif',
  montserrat: 'Montserrat, Inter, sans-serif',
  roboto: 'Roboto, Inter, sans-serif',
  merriweather: 'Merriweather, Georgia, serif',
  oswald: 'Oswald, Inter, sans-serif',
};

const toCssDeclarations = (value: CleanNeutralRegionOverride): string[] => {
  const declarations: string[] = [];
  if (value.opacity !== undefined) declarations.push(`opacity:${value.opacity / 100}`);
  if (value.maxWidth !== undefined) declarations.push(`max-width:${value.maxWidth}px`);
  if (value.minHeight !== undefined) declarations.push(`min-height:${value.minHeight}px`);
  if (value.paddingX !== undefined) {
    declarations.push(`padding-left:${value.paddingX}px`);
    declarations.push(`padding-right:${value.paddingX}px`);
  }
  if (value.paddingY !== undefined) {
    declarations.push(`padding-top:${value.paddingY}px`);
    declarations.push(`padding-bottom:${value.paddingY}px`);
  }
  if (value.marginTop !== undefined) declarations.push(`margin-top:${value.marginTop}px`);
  if (value.marginBottom !== undefined) declarations.push(`margin-bottom:${value.marginBottom}px`);
  if (value.gap !== undefined) declarations.push(`gap:${value.gap}px`);
  if (value.fontFamily) declarations.push(`font-family:${FONT_MAP[value.fontFamily]}`);
  if (value.fontSize !== undefined) declarations.push(`font-size:${value.fontSize}px`);
  if (value.fontWeight !== undefined) declarations.push(`font-weight:${value.fontWeight}`);
  if (value.lineHeight !== undefined) declarations.push(`line-height:${value.lineHeight}`);
  if (value.letterSpacing !== undefined) declarations.push(`letter-spacing:${value.letterSpacing}px`);
  if (value.borderWidth !== undefined) declarations.push(`border-width:${value.borderWidth}px`);
  if (value.borderStyle) declarations.push(`border-style:${value.borderStyle}`);
  if (value.radius !== undefined) declarations.push(`border-radius:${value.radius}px`);
  if (value.textAlign && value.textAlign !== 'inherit') declarations.push(`text-align:${value.textAlign}`);
  if (value.overflow && value.overflow !== 'inherit') declarations.push(`overflow:${value.overflow}`);
  return declarations;
};

export interface ProfessionalIconRuntimeSnapshot {
  enabled: boolean;
  pageId: string;
  device: 'desktop' | 'tablet' | 'mobile';
  settings: CleanNeutralAdvancedCustomizerSettings;
  revision: number;
}

let runtimeSnapshot: ProfessionalIconRuntimeSnapshot = {
  enabled: false,
  pageId: 'home',
  device: 'desktop',
  settings: DEFAULT_CLEAN_NEUTRAL_ADVANCED_CUSTOMIZER,
  revision: 0,
};
const runtimeListeners = new Set<() => void>();

export const subscribeProfessionalIconRuntime = (listener: () => void): (() => void) => {
  runtimeListeners.add(listener);
  return () => runtimeListeners.delete(listener);
};

export const getProfessionalIconRuntimeSnapshot = (): ProfessionalIconRuntimeSnapshot => runtimeSnapshot;
export const getProfessionalIconServerSnapshot = (): ProfessionalIconRuntimeSnapshot => runtimeSnapshot;

export const resolveProfessionalIconOverride = (
  settings: CleanNeutralAdvancedCustomizerSettings,
  pageId: string,
  device: string,
  slotId: CleanNeutralIconSlotId,
): CleanNeutralIconOverride =>
  settings.iconTargets[makeCleanNeutralIconTargetKey(pageId, device, slotId)] || {};

export const applyCleanNeutralAdvancedRuntime = (
  settingsInput: unknown,
  pageId: string,
  device: 'desktop' | 'tablet' | 'mobile',
  enabled: boolean,
): void => {
  const settings = normalizeCleanNeutralAdvancedCustomizer(settingsInput);
  runtimeSnapshot = {
    enabled,
    pageId,
    device,
    settings,
    revision: runtimeSnapshot.revision + 1,
  };
  runtimeListeners.forEach(listener => listener());

  if (typeof document === 'undefined') return;
  const styleId = 'clean-neutral-advanced-runtime';
  let style = document.getElementById(styleId) as HTMLStyleElement | null;

  if (!enabled) {
    style?.remove();
    return;
  }

  if (!style) {
    style = document.createElement('style');
    style.id = styleId;
    document.head.appendChild(style);
  }

  const prefix = `${pageId}:${device}:`;
  const rules = Object.entries(settings.regionTargets)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, override]) => {
      const parsed = splitTarget(key, REGION_IDS);
      if (!parsed) return '';
      const declarations = toCssDeclarations(override);
      return declarations.length > 0
        ? `html[data-color-experience="clean-neutral"] [data-clean-neutral-region="${parsed.itemId}"]{${declarations.join(';')}!important}`
        : '';
    })
    .filter(Boolean);

  style.textContent = rules.join('\n');
};
