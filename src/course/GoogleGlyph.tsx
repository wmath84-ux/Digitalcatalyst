// src/course/GoogleGlyph.tsx
//
// Google's own four-colour "G" — the one mark that says "search the web".
//
// lucide dropped every brand icon, so this is the official mark drawn by
// hand: four paths, the four brand colours, no font, no image request, and
// it inherits `currentColor` for the single-colour variant the dark chrome
// needs.

export type GoogleGlyphProps = {
  size?: number;
  /** Draw the four-colour mark (default) or a single-colour one. */
  mono?: boolean;
  className?: string;
  title?: string;
};

export default function GoogleGlyph({ size = 16, mono = false, className = "", title }: GoogleGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-google-glyph
    >
      {title ? <title>{title}</title> : null}
      {mono ? (
        <path
          fill="currentColor"
          d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6 8-11.3 8a12 12 0 1 1 7.9-21l5.7-5.7A20 20 0 1 0 24 44a19.9 19.9 0 0 0 19.6-23.5Z"
        />
      ) : (
        <>
          <path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
          />
          <path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z"
          />
          <path
            fill="#FBBC05"
            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19Z"
          />
          <path
            fill="#34A853"
            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
          />
        </>
      )}
    </svg>
  );
}
