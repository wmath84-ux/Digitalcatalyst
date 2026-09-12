import type { MouseEventHandler } from "react";
import { ExternalLink } from "lucide-react";
import "./download-button.css";

/**
 * CourseDownloadButton — the Course Player's download-action treatment,
 * a faithful port of dovatgabriel's "slippery-owl-85" Uiverse button
 * (https://uiverse.io/dovatgabriel/slippery-owl-85), see
 * download-button.css.
 *
 * UI layer ONLY: the caller keeps full control of the download
 * behaviour (href, `download` filename, external target, click handler,
 * data-attributes for the contract tests). No download logic lives here.
 *
 * `icon="external"` swaps the CSS-drawn download arrow for a lucide
 * ExternalLink glyph in the same left slot (used by the "Open original"
 * variant, which is an external link, not a file download).
 */
export interface CourseDownloadButtonProps {
  /** Visible label (e.g. "Download DOCX", "Open original"). */
  label: string;
  /** "download" = the reference's CSS download glyph (default). */
  icon?: "download" | "external";
  /** External links render a real anchor (opens in a new tab). */
  href?: string;
  /** Suggested download filename (the reference `download` attribute). */
  downloadableFileName?: string;
  /** Button-only behaviour (no href). */
  onClick?: MouseEventHandler<HTMLElement>;
  disabled?: boolean;
  className?: string;
  dataAttrs?: Record<string, string | undefined>;
  ariaLabel?: string;
}

export default function CourseDownloadButton({
  label,
  icon = "download",
  href,
  downloadableFileName,
  onClick,
  disabled = false,
  className,
  dataAttrs = {},
  ariaLabel,
}: CourseDownloadButtonProps) {
  const classes = [
    "dc-dl-btn",
    icon === "external" ? "dc-dl-btn--open" : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const glyph =
    icon === "external" ? (
      <span className="dc-dl-btn__open" aria-hidden="true">
        <ExternalLink size={13} strokeWidth={2.6} />
      </span>
    ) : null;

  const attrs: Record<string, unknown> = {
    className: classes,
    "aria-label": ariaLabel ?? label,
    ...dataAttrs,
  };
  for (const [key, value] of Object.entries(dataAttrs)) {
    if (value === undefined) delete attrs[key];
  }

  if (href) {
    return (
      <a
        {...attrs}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        download={downloadableFileName}
        onClick={onClick}
        aria-disabled={disabled || undefined}
      >
        {glyph}
        {label}
      </a>
    );
  }

  return (
    <button
      {...attrs}
      type="button"
      onClick={onClick}
      disabled={disabled}
    >
      {glyph}
      {label}
    </button>
  );
}
