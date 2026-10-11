// utils/joplinClipper.d.ts
//
// Declarations for the compiled utils/joplinClipper.js, matching the pattern
// of the other utils/*.js + utils/*.d.ts pairs (contentOwnership, commerce…).
// The api/ build (tsconfig.api.json) type-checks against these.

export declare const CLIPPER_PAIRING_TTL_MS: number;
export declare const CLIPPER_TOKEN_TTL_MS: number;
export declare const CLIPPER_SCOPES: string[];
export declare const MAX_CLIP_BYTES: number;
export declare const MAX_CLIP_TITLE: number;
export declare const MAX_CLIP_TAGS: number;
export declare const MAX_CLIP_TAG_CHARS: number;
export declare const PAIRING_ALPHABET: string;
export declare const PAIRING_LENGTH: number;
export declare const MAX_PAIRING_ATTEMPTS: number;
export declare const WEB_CLIPPINGS_NOTEBOOK: string;
export declare const WORKSPACE_ROOT_NOTEBOOK: string;

export declare function joplinId(source: unknown): string;
export declare function notebookIdForName(name: unknown, parentId?: string): string;
export declare const workspaceRootNotebookId: () => string;
export declare const webClippingsNotebookId: () => string;

export declare function normalizePairingCode(code: unknown): string;
export declare function isPairingCodeShape(code: unknown): boolean;
export declare function formatPairingCode(code: unknown): string;
export declare function generatePairingCode(random?: (size: number) => Uint8Array): string;
export declare const pairingCodeDocId: (code: unknown) => string;
export declare function buildPairingRecord(input: {
  uid: string;
  code: string;
  now?: number;
  label?: string;
}): Record<string, unknown> & { expiresAt: number };
export declare function pairingCodeStatus(record: unknown, now?: number): string;
export declare function pairingCodeMatches(record: unknown, code: unknown): boolean;

export declare function generateToken(random?: (size: number) => Uint8Array): string;
export declare const hashToken: (token: unknown) => string;
export declare const tokenDocId: (token: unknown) => string;
export declare function buildTokenRecord(input: {
  token: string;
  uid: string;
  now?: number;
  label?: string;
  scopes?: string[];
}): Record<string, unknown> & { scopes: string[]; expiresAt: number };
export declare function tokenStatus(record: unknown, now?: number): string;
export declare const tokenHasScope: (record: unknown, scope: string) => boolean;

export declare function canonicalUrl(url: unknown): string;
export declare function clipDayKey(now?: number): string;
export declare const clipNoteId: (uid: string, url: unknown, now?: number) => string;
export declare const clipDeepLink: (noteId: unknown) => string;

export interface ValidatedClip {
  url: string;
  title: string;
  html: string;
  selection: string;
  text: string;
  tags: string[];
  notebookId: string;
  clippedAt: number;
}

export declare function validateClipPayload(payload: unknown):
  | { ok: true; clip: ValidatedClip; bytes: number }
  | { ok: false; reason: string; bytes?: number };
