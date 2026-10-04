// Shared math-marker contract for the Course Player note pipeline.
// Kept separate from both clipboard normalization and KaTeX rendering so
// imports stay acyclic in the editor's lazy chunk.

export const MAX_NOTE_MATH_SOURCE_LENGTH = 4096;

/** Inline/block TeX sent to compatible editors and readable on render errors. */
export const mathSourceText = (latex: string, displayMode: boolean): string =>
  displayMode ? `$$\n${latex}\n$$` : `$${latex}$`;
