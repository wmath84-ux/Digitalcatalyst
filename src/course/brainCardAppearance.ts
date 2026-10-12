/** Stable question identity, not stack position: advancing never repaints a card.
 * Blue and indigo tints echo the website brand and purchase accents. */
const CARD_TINTS = [
  "var(--course-card-blue, #dbeafe)",
  "var(--course-card-indigo, #e0e7ff)",
  "var(--course-card-sky, #e0f2fe)",
  "var(--course-card-periwinkle, #ede9fe)",
] as const;
export function brainCardTint(questionIndex: number): string {
  const index = Number.isFinite(questionIndex) ? Math.abs(Math.trunc(questionIndex)) : 0;
  return CARD_TINTS[index % CARD_TINTS.length];
}
/** Scale text independently of the face: wide, shallow splits must not create
 * enormous text. Preserve readable text and scroll long content instead. */
export function brainCardTextScale(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;
  return Math.max(0.85, Math.min(1.25, width / 300, height / 420));
}
