// Type declarations for `utils/mindMapImport.js` (shared AI / JSON mind map
// validator used by the Admin Product Builder and the Course Player editor).
import type { MindMap } from "./mindMapTree";

export interface MindMapIssue {
  /** JSON-style location, e.g. `nodes[3].parentId` or `$` for the whole text. */
  path: string;
  message: string;
}

export interface MindMapValidation {
  valid: boolean;
  errors: MindMapIssue[];
  warnings: MindMapIssue[];
  /** Canonical map (via `parseMindMap`) when `valid` is true. */
  mindMap: MindMap | null;
  stats: { nodes: number; topLevel: number; depth: number } | null;
}

export const MIND_MAP_TITLE_MAX: number;
export const MIND_MAP_AI_PROMPT: string;
export declare function buildMindMapAiPrompt(): string;
export declare function validateMindMapObject(raw: unknown): MindMapValidation;
export declare function validateMindMapJson(text: string): MindMapValidation;
export declare function describeMindMapStats(stats: MindMapValidation["stats"]): string;
export declare function formatMindMapIssue(entry: MindMapIssue): string;
