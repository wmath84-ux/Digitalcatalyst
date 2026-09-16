import type { CSSProperties } from "react";

type IconProps = {
  className?: string;
  style?: CSSProperties;
  size?: number;
};

const base = "h-6 w-6";

/**
 * GlassDock (the revision footer) passes `size` + inline width/height and
 * overwrites `className` with `shrink-0`. Without those props the glyphs
 * drop their default `h-6 w-6` and paint as empty plates on phone/tablet.
 */
function svgProps({ className, style, size }: IconProps) {
  const dim = typeof size === "number" ? size : undefined;
  return {
    className: className ? `${base} ${className}` : base,
    width: dim,
    height: dim,
    style: dim ? { width: dim, height: dim, ...style } : style,
  };
}

export function HomeIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1V9.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.6" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.6" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.6" />
    </svg>
  );
}

export function BankIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <path d="M4 10 12 4l8 6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9" strokeLinecap="round" />
      <path d="M3.5 19h17" strokeLinecap="round" />
    </svg>
  );
}

export function TargetIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.75" fill="currentColor" />
    </svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M4.5 20c1.2-3.6 4.2-5.5 7.5-5.5s6.3 1.9 7.5 5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronLeftIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={2} stroke="currentColor">
      <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={2} stroke="currentColor">
      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={2.2} stroke="currentColor">
      <path d="M4.5 12.5l5 5 10-11" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function XIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={2.2} stroke="currentColor">
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <circle cx="12" cy="12" r="8.25" />
      <path d="M12 7.5V12l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FlameIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <path
        d="M12 3s4 3.5 4 8a4 4 0 0 1-8 0c0-1 .4-1.8 1-2.5 0 1.2.7 2 1.5 2 0-2 .5-3.5 2-5-.3 1-.1 2 .5 2.5-.3-2.5.5-4.2-1-5Z"
        strokeLinejoin="round"
      />
      <path d="M8.5 14.5A4 4 0 0 0 12 20a4.5 4.5 0 0 0 4.5-4.5c0-1.2-.3-2-1-3" strokeLinecap="round" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.5-4.5" strokeLinecap="round" />
    </svg>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <path d="M4 6h16M7 12h10M10.5 18h3" strokeLinecap="round" />
    </svg>
  );
}

export function SparklesIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.6} stroke="currentColor">
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3Z" strokeLinejoin="round" />
      <path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z" strokeLinejoin="round" />
    </svg>
  );
}

export function TrendUpIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <path d="M4 16l5.5-5.5 4 4L20 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 7H20v5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrendDownIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <path d="M4 8l5.5 5.5 4-4L20 17" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.5 17H20v-5.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MinusIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={2} stroke="currentColor">
      <path d="M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function BookOpenIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <path d="M12 6.5c-1.7-1.3-4-2-6.5-2v13c2.5 0 4.8.7 6.5 2 1.7-1.3 4-2 6.5-2v-13c-2.5 0-4.8.7-6.5 2Z" strokeLinejoin="round" />
      <path d="M12 6.5v13" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <path d="M12 3.5 21.5 20h-19L12 3.5Z" strokeLinejoin="round" />
      <path d="M12 9.5v4.25M12 16.75h.01" strokeLinecap="round" />
    </svg>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.7} stroke="currentColor">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" strokeLinejoin="round" />
      <path d="M7 5H4v1.5A3.5 3.5 0 0 0 7.5 10M17 5h3v1.5A3.5 3.5 0 0 1 16.5 10" strokeLinecap="round" />
      <path d="M10 15.5v2M12 17.5v-2M14 15.5v2M9 20.5h6M12 17.5v3" strokeLinecap="round" />
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" strokeLinecap="round" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SlidersIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...svgProps(props)} strokeWidth={1.8} stroke="currentColor">
      <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
