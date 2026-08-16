// src/utils/googleDriveCopy.ts
//
// "Personal copy" plumbing — gives every student their OWN copy of a
// Google file (Doc / Sheet / Slides / Drive binary) in their OWN Drive.
//
// Flow (all client-side, no serverless function — the Vercel 12-function
// budget is untouched):
//
//   1. `requestDriveAccessToken(clientId)` — Google Identity Services
//      token flow. Pops the Google consent screen the first time, then
//      reuses the cached access token (~1 hour) silently. Only the
//      PUBLIC OAuth Client ID is needed; the client secret is never
//      used in the browser token flow.
//   2. `copyDriveFile(token, sourceFileId, name)` — Drive v3
//      `files.copy`. The copy lands in the STUDENT's My Drive, so the
//      student is the OWNER: editing always works for them, no matter
//      how the master is shared. The master itself only needs
//      "Anyone with the link → Viewer".
//   3. The caller stores `{ sourceFileId → copyFileId }` in
//      `users/{uid}/driveCopies/{sourceFileId}` so the same copy opens
//      instantly on every future visit.
//
// Scope note: `files.copy` must READ the master file, which the
// app-scoped `drive.file` permission cannot see — so the full
// `auth/drive` scope is required. On an unverified OAuth consent
// screen this works in Testing mode (up to 100 test users); verify the
// app in Google Cloud Console to lift that cap.

import { loadGoogleIdentityServices } from "../../utils/googleIdentity";

export const DRIVE_COPY_SCOPE = "https://www.googleapis.com/auth/drive";

const TOKEN_STORAGE_KEY = "dc.driveAccessToken.v1";
/** Refuse tokens with less than a minute left so a copy never dies mid-flight. */
const TOKEN_SAFETY_MS = 60_000;

export type DriveCopyErrorCode =
  | "gsi_unavailable"
  | "popup_blocked"
  | "consent_denied"
  | "token_failed"
  | "token_expired"
  /** A token was issued, but the learner unticked the Drive permission. */
  | "scope_missing"
  | "source_not_found"
  | "forbidden"
  | "copy_failed"
  /** The copy itself worked; only the Firestore mapping write was refused. */
  | "mapping_denied"
  | "network_error";

export class DriveCopyError extends Error {
  code: DriveCopyErrorCode;
  constructor(code: DriveCopyErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type TokenBundle = { token: string; expiresAt: number; scope?: string };

let memoryToken: TokenBundle | null = null;

/**
 * True when the token Google issued actually carries the Drive scope.
 *
 * Google's consent screen lets a user UNTICK an individual permission and
 * still finish: the callback then returns a perfectly valid access token
 * that `files.copy` rejects with `ACCESS_TOKEN_SCOPE_INSUFFICIENT`. The
 * response echoes the granted scopes, so a partial grant is caught before a
 * request is ever made — and, crucially, before it is cached.
 */
const grantsDriveScope = (scope: string | undefined): boolean => {
  // No `scope` field at all: older GIS builds omitted it. Trust the token
  // rather than block a flow that may be perfectly fine.
  if (typeof scope !== "string" || !scope.trim()) return true;
  return scope.split(/\s+/).includes(DRIVE_COPY_SCOPE);
};

const readStoredToken = (): TokenBundle | null => {
  const now = Date.now();
  if (memoryToken && memoryToken.expiresAt > now + TOKEN_SAFETY_MS && grantsDriveScope(memoryToken.scope)) {
    return memoryToken;
  }
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TokenBundle;
    if (
      parsed
      && typeof parsed.token === "string"
      && parsed.expiresAt > now + TOKEN_SAFETY_MS
      // A cached token from a partial grant would keep failing forever.
      && grantsDriveScope(parsed.scope)
    ) {
      memoryToken = parsed;
      return parsed;
    }
  } catch {
    /* storage unavailable — memory cache only */
  }
  return null;
};

const storeToken = (token: string, expiresInSeconds: number, scope?: string) => {
  const bundle: TokenBundle = {
    token,
    expiresAt: Date.now() + Math.max(0, expiresInSeconds) * 1000,
    scope,
  };
  memoryToken = bundle;
  try {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(bundle));
  } catch {
    /* private mode etc. — memory cache still works */
  }
};

export const clearStoredDriveToken = () => {
  memoryToken = null;
  try {
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* ignore */
  }
};

type TokenClientResponse = { access_token?: string; expires_in?: number; error?: string; scope?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };
type OAuth2Namespace = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    include_granted_scopes?: boolean;
    callback: (response: TokenClientResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }) => TokenClient;
  hasGrantedAllScopes?: (response: TokenClientResponse, ...scopes: string[]) => boolean;
};

const getOAuth2 = (): OAuth2Namespace | null => {
  const oauth2 = (window as unknown as { google?: { accounts?: { oauth2?: OAuth2Namespace } } })
    .google?.accounts?.oauth2;
  return oauth2 && typeof oauth2.initTokenClient === "function" ? oauth2 : null;
};

/**
 * Get a Drive access token for the signed-in Google account. First call
 * shows Google's account/consent popup; subsequent calls inside the
 * token's lifetime resolve silently from cache.
 */
export const requestDriveAccessToken = async (clientId: string): Promise<string> => {
  const trimmedClientId = String(clientId || "").trim();
  if (!trimmedClientId) {
    throw new DriveCopyError("token_failed", "Google OAuth Client ID is not configured.");
  }
  const cached = readStoredToken();
  if (cached) return cached.token;

  await loadGoogleIdentityServices();
  const oauth2 = getOAuth2();
  if (!oauth2) {
    throw new DriveCopyError("gsi_unavailable", "Google sign-in script could not be loaded.");
  }

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    try {
      const client = oauth2.initTokenClient({
        client_id: trimmedClientId,
        scope: DRIVE_COPY_SCOPE,
        // Keep any permission the learner already granted this app instead
        // of silently replacing it with the Drive-only grant.
        include_granted_scopes: true,
        callback: (response) => {
          if (response && response.access_token) {
            const granted = typeof oauth2.hasGrantedAllScopes === "function"
              ? oauth2.hasGrantedAllScopes(response, DRIVE_COPY_SCOPE)
              : grantsDriveScope(response.scope);
            if (!granted) {
              // Do NOT cache a scope-deficient token — it would turn one
              // unticked checkbox into a permanent failure for the session.
              settle(() => reject(new DriveCopyError(
                "scope_missing",
                "Google Drive permission was not granted.",
              )));
              return;
            }
            storeToken(response.access_token, Number(response.expires_in || 3600), response.scope);
            settle(() => resolve(response.access_token as string));
            return;
          }
          const denied = response?.error === "access_denied" || response?.error === "interaction_required";
          settle(() => reject(new DriveCopyError(
            denied ? "consent_denied" : "token_failed",
            denied ? "Google access was declined." : "Google did not issue a Drive access token.",
          )));
        },
        error_callback: (error) => {
          const closed = error?.type === "popup_closed";
          settle(() => reject(new DriveCopyError(
            closed ? "consent_denied" : "popup_blocked",
            closed ? "The Google window was closed before finishing." : "The Google sign-in popup was blocked by the browser.",
          )));
        },
      });
      client.requestAccessToken();
    } catch {
      settle(() => reject(new DriveCopyError("token_failed", "Could not start the Google authorization flow.")));
    }
  });
};

export interface DriveCopyResult {
  id: string;
  name: string;
  mimeType: string;
}

/**
 * Create the student's personal copy via Drive v3 `files.copy`. The new
 * file is owned by the student (it is created in THEIR Drive with THEIR
 * token), so they can always edit it.
 */
export const copyDriveFile = async (
  token: string,
  sourceFileId: string,
  name: string,
  fetcher: typeof fetch = fetch,
): Promise<DriveCopyResult> => {
  const fileId = String(sourceFileId || "").trim();
  if (!fileId) throw new DriveCopyError("copy_failed", "Missing source file id.");
  let response: Response;
  try {
    response = await fetcher(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?fields=id,name,mimeType&supportsAllDrives=true`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: String(name || "My copy").slice(0, 380) }),
      },
    );
  } catch {
    throw new DriveCopyError("network_error", "Could not reach Google Drive. Check your connection and retry.");
  }
  if (response.status === 401) {
    clearStoredDriveToken();
    throw new DriveCopyError("token_expired", "Google authorization expired — tap My copy again to re-authorize.");
  }
  if (response.status === 404) {
    throw new DriveCopyError(
      "source_not_found",
      "Google Drive could not read the master file. It must be shared as “Anyone with the link → Viewer”.",
    );
  }
  if (response.status === 403) {
    // A 403 is ambiguous: it is either a project-level refusal (Drive API
    // off / quota) or a token that simply lacks the Drive scope because the
    // learner unticked the permission. Google says which in the body.
    const detail = await response.text().catch(() => "");
    if (/ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient.{0,20}scope|insufficientPermissions/i.test(detail)) {
      clearStoredDriveToken();
      throw new DriveCopyError(
        "scope_missing",
        "Google Drive permission is missing for this account.",
      );
    }
    throw new DriveCopyError(
      "forbidden",
      "Google Drive refused the copy. Make sure the Drive API is enabled for the OAuth project and the daily quota is not exhausted.",
    );
  }
  if (!response.ok) {
    throw new DriveCopyError("copy_failed", `Google Drive returned ${response.status} while copying.`);
  }
  const data = (await response.json().catch(() => ({}))) as Partial<DriveCopyResult>;
  if (!data.id) throw new DriveCopyError("copy_failed", "Google Drive did not return the copied file id.");
  return { id: String(data.id), name: String(data.name || name), mimeType: String(data.mimeType || "") };
};

/** Human-readable message for any failure in the personal-copy flow. */
export const friendlyDriveCopyError = (error: unknown): string => {
  if (error instanceof DriveCopyError) {
    switch (error.code) {
      case "consent_denied":
        return "Google access was cancelled. Tap My copy and allow Drive access to create your personal copy.";
      case "popup_blocked":
        return "Your browser blocked the Google window. Allow popups for this site and try again.";
      case "token_expired":
        return "Google authorization expired. Tap My copy again to re-authorize.";
      case "scope_missing":
        return "Google Drive access wasn't granted. Tap My copy again and keep the “See, edit, create and delete all of your Google Drive files” box ticked.";
      case "mapping_denied":
        return "Your copy was created in Google Drive and saved on this device. Syncing the link to your account failed, so it will open here but not on your other devices.";
      case "source_not_found":
        return "The master file isn't visible to your Google account. Ask the course owner to share it as “Anyone with the link → Viewer”.";
      case "forbidden":
        return "Google Drive refused the request — the Drive API may not be enabled for the configured OAuth project.";
      case "gsi_unavailable":
        return "Google sign-in could not load. Check your connection and try again.";
      case "network_error":
        return "Could not reach Google Drive. Check your connection and retry.";
      default:
        return error.message || "Could not create your personal copy.";
    }
  }
  return error instanceof Error ? error.message : "Could not create your personal copy.";
};
