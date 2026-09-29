// Minimal typings for the untyped `mammoth` package (docx → text).
// Only the surface the study engine uses is declared.
declare module "mammoth" {
  export interface MammothResult {
    value: string;
    messages: unknown[];
  }
  export function extractRawText(input: { buffer: Buffer } | { path: string }): Promise<MammothResult>;
  export function convertToHtml(input: { buffer: Buffer } | { path: string }): Promise<MammothResult>;
}
