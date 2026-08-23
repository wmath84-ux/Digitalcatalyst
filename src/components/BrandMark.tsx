import { useBranding } from "@/context/BrandingContext";
import { DEFAULT_LOGO_URL } from "@/utils/branding";

type BrandMarkProps = {
  className?: string;
  alt?: string;
  fallbackLetter?: boolean;
};

export default function BrandMark({ className = "h-9 w-9", alt, fallbackLetter = false }: BrandMarkProps) {
  const { logoUrl, appName } = useBranding();
  const custom = logoUrl && logoUrl !== DEFAULT_LOGO_URL;
  const label = alt || appName;
  if (!custom && fallbackLetter) {
    return (
      <span
        className={`grid place-items-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 text-lg font-black text-white shadow-lg shadow-fuchsia-500/30 ${className}`}
      >
        {appName.charAt(0).toUpperCase() || "E"}
      </span>
    );
  }
  return (
    <img
      src={logoUrl || DEFAULT_LOGO_URL}
      alt={label}
      className={`object-cover ${className}`}
      data-brand-mark
    />
  );
}
