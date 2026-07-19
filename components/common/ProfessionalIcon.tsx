import React, { useSyncExternalStore } from 'react';
import {
  getProfessionalIconRuntimeSnapshot,
  getProfessionalIconServerSnapshot,
  resolveProfessionalIconOverride,
  subscribeProfessionalIconRuntime,
  type CleanNeutralIconSlotId,
  type IconDisplayMode,
  type IconPosition,
  type ProfessionalIconName,
} from '../../utils/cleanNeutralAdvancedCustomizer';

const ICON_PATHS: Record<ProfessionalIconName, string[]> = {
  home: ['M3 11.5 12 4l9 7.5', 'M5.5 10.5V20h13v-9.5', 'M9.5 20v-6h5v6'],
  calendar: ['M5 3v3M19 3v3M4 8h16', 'M5 5h14a2 2 0 0 1 2 2v12H3V7a2 2 0 0 1 2-2Z', 'M7 12h3M14 12h3M7 16h3M14 16h3'],
  store: ['M4 10v10h16V10', 'M3 5h18l-1 5a3 3 0 0 1-5 1 3 3 0 0 1-6 0 3 3 0 0 1-5-1L3 5Z', 'M9 20v-5h6v5'],
  'book-open': ['M3 5.5A4.5 4.5 0 0 1 7.5 4H12v16H7.5A4.5 4.5 0 0 0 3 21V5.5Z', 'M21 5.5A4.5 4.5 0 0 0 16.5 4H12v16h4.5A4.5 4.5 0 0 1 21 21V5.5Z'],
  heart: ['M20.8 4.8a5.5 5.5 0 0 0-7.8 0L12 5.8l-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.4a5.5 5.5 0 0 0 0-7.8Z'],
  'shopping-cart': ['M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.5L21 7H6', 'M10 20h.01M18 20h.01'],
  megaphone: ['M3 11v2a2 2 0 0 0 2 2h2l3 5h3l-2.5-5H13l7 3V6l-7 3H5a2 2 0 0 0-2 2Z'],
  'message-circle': ['M21 11.5a8.5 8.5 0 0 1-9 8.5 9 9 0 0 1-4-.9L3 21l1.9-4A8.5 8.5 0 1 1 21 11.5Z'],
  'file-text': ['M6 2h8l4 4v16H6V2Z', 'M14 2v5h5', 'M9 12h6M9 16h6'],
  gift: ['M3 9h18v12H3V9ZM2 6h20v4H2V6Z', 'M12 6v15', 'M12 6H8.5A2.5 2.5 0 1 1 11 3.5L12 6Zm0 0h3.5A2.5 2.5 0 1 0 13 3.5L12 6Z'],
  user: ['M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M4 21a8 8 0 0 1 16 0'],
  lock: ['M6 10h12v11H6V10Z', 'M8 10V7a4 4 0 0 1 8 0v3', 'M12 14v3'],
  gem: ['M4 8 8 3h8l4 5-8 13L4 8Z', 'M4 8h16M8 3l4 5 4-5M12 8v13'],
  search: ['M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z', 'm21 21-4.3-4.3'],
  settings: ['M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-1.9.1l-.4.3a1.7 1.7 0 0 0-.7 1.7v.2h-4v-.2a1.7 1.7 0 0 0-.7-1.7l-.4-.3a1.7 1.7 0 0 0-1.9-.1l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 4.6 15l-.1-.5A1.7 1.7 0 0 0 3 13.2H3v-4h.1a1.7 1.7 0 0 0 1.5-1.3l.1-.5a1.7 1.7 0 0 0-.3-1.8l-.1-.1 2-3.4.2.1a1.7 1.7 0 0 0 1.9-.1l.4-.3A1.7 1.7 0 0 0 9.5.1V0h4v.2a1.7 1.7 0 0 0 .7 1.7l.4.3a1.7 1.7 0 0 0 1.9.1l.2-.1 2 3.4-.1.1a1.7 1.7 0 0 0-.3 1.8l.1.5A1.7 1.7 0 0 0 20 9.2h.1v4H20a1.7 1.7 0 0 0-1.5 1.3l-.1.5Z'],
  menu: ['M4 6h16M4 12h16M4 18h16'],
  close: ['M5 5l14 14M19 5 5 19'],
  brain: ['M9.5 4A3.5 3.5 0 0 0 6 7.5v.3A3.5 3.5 0 0 0 4 11a3.5 3.5 0 0 0 2 3.2v.3A3.5 3.5 0 0 0 9.5 18H12V6.5A2.5 2.5 0 0 0 9.5 4Z', 'M14.5 4A3.5 3.5 0 0 1 18 7.5v.3a3.5 3.5 0 0 1 2 3.2 3.5 3.5 0 0 1-2 3.2v.3a3.5 3.5 0 0 1-3.5 3.5H12V6.5A2.5 2.5 0 0 1 14.5 4Z', 'M8 9h4M12 13h4'],
  sparkle: ['m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z', 'm19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z'],
  'graduation-cap': ['M2 9 12 4l10 5-10 5L2 9Z', 'M6 11.5V16c3 2.5 9 2.5 12 0v-4.5M22 9v6'],
  star: ['m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1L12 2Z'],
  tag: ['M3 11V4h7l11 11-6 6L4 10Z', 'M7.5 7.5h.01'],
  bell: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z', 'M10 21h4'],
  'arrow-left': ['M19 12H5M11 18l-6-6 6-6'],
  'arrow-right': ['M5 12h14M13 6l6 6-6 6'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  pin: ['m8 3 8 8M7 8l9 9M10 5l6-2 5 5-2 6-3 3-9-9 3-3ZM5 19l4-4'],
  grid: ['M3 3h7v7H3V3ZM14 3h7v7h-7V3ZM3 14h7v7H3v-7ZM14 14h7v7h-7v-7Z'],
  play: ['M8 5v14l11-7L8 5Z'],
  pause: ['M8 5h3v14H8V5ZM14 5h3v14h-3V5Z'],
  document: ['M6 2h8l4 4v16H6V2Z', 'M14 2v5h5'],
  image: ['M4 4h16v16H4V4Z', 'M7 16l4-4 3 3 2-2 3 3M8 9h.01'],
  upload: ['M12 16V4M7 9l5-5 5 5', 'M5 20h14'],
  download: ['M12 4v12M7 11l5 5 5-5', 'M5 20h14'],
};

interface ProfessionalIconProps {
  slot: CleanNeutralIconSlotId;
  fallbackName: ProfessionalIconName;
  label: string;
  defaultDisplayMode?: IconDisplayMode;
  defaultPosition?: IconPosition;
  className?: string;
  iconClassName?: string;
  labelClassName?: string;
  iconStyle?: React.CSSProperties;
  labelStyle?: React.CSSProperties;
  color?: string;
  size?: number;
  strokeWidth?: number;
  ignoreRuntime?: boolean;
}

const ProfessionalIcon: React.FC<ProfessionalIconProps> = ({
  slot,
  fallbackName,
  label,
  defaultDisplayMode = 'icon-only',
  defaultPosition = 'left',
  className = '',
  iconClassName = '',
  labelClassName = '',
  iconStyle,
  labelStyle,
  color,
  size = 22,
  strokeWidth = 1.8,
  ignoreRuntime = false,
}) => {
  const runtime = useSyncExternalStore(
    subscribeProfessionalIconRuntime,
    getProfessionalIconRuntimeSnapshot,
    getProfessionalIconServerSnapshot,
  );
  const override = runtime.enabled && !ignoreRuntime
    ? resolveProfessionalIconOverride(runtime.settings, runtime.pageId, runtime.device, slot)
    : {};
  const iconName = override.name || fallbackName;
  const displayMode = override.displayMode || defaultDisplayMode;
  const position = override.position || defaultPosition;
  const resolvedLabel = override.label || label;
  const resolvedSize = override.size || size;
  const resolvedStroke = override.strokeWidth || strokeWidth;
  const resolvedColor = override.color || color || 'currentColor';
  const gap = override.gap ?? 6;
  const direction = position === 'top'
    ? 'column'
    : position === 'bottom'
      ? 'column-reverse'
      : position === 'right'
        ? 'row-reverse'
        : 'row';

  return (
    <span
      data-clean-neutral-icon-slot={slot}
      className={`inline-flex min-w-0 items-center justify-center ${className}`}
      style={{ flexDirection: direction, gap }}
      role={displayMode === 'icon-only' ? 'img' : undefined}
      aria-label={displayMode === 'icon-only' ? resolvedLabel : undefined}
    >
      <span className={`inline-flex shrink-0 items-center justify-center ${iconClassName}`} style={{ color: resolvedColor, ...iconStyle }}>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width={resolvedSize}
          height={resolvedSize}
          fill="none"
          stroke="currentColor"
          strokeWidth={resolvedStroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {(ICON_PATHS[iconName] || ICON_PATHS.sparkle).map((path, index) => <path key={`${iconName}-${index}`} d={path} />)}
        </svg>
      </span>
      {displayMode === 'icon-with-text' && (
        <span className={`min-w-0 truncate ${labelClassName}`} style={labelStyle}>{resolvedLabel}</span>
      )}
    </span>
  );
};

export default ProfessionalIcon;
