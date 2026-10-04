// src/joplin/joplinAuthBridge.ts
//
// The identity bridge between the Digitalcatalyst host and the Joplin workspace
// frame.
//
// Requirements (§12, §33, §112, §113):
//
//   · there is ONE login. The learner signs in through the existing Firebase
//     authentication; the workspace frame never grows a second sign-in form and
//     never sees a password;
//   · the frame never receives a Firebase REFRESH token and no token is ever
//     written into note content or extension storage. It asks the host for a
//     short-lived ID token when it needs to call the bridge API, and the host
//     answers from the live Firebase session;
//   · on sign-out the host tells the frame to stop, and the identity material it
//     holds in memory is dropped;
//   · switching accounts is a full teardown: the workspace frame is torn down and
//     re-created, so user B's first paint can never be user A's cached profile
//     (§113).
//
// The module is deliberately dependency-free: the host passes in a token
// provider, so this logic is testable and the frame's needs never reach into
// Firebase directly.

import { DC_MESSAGE_CHANNEL } from "./joplinRuntime";

export const DC_MESSAGE_VERSION = 1;

export type HostToWorkspaceMessage =
  | {
      channel: typeof DC_MESSAGE_CHANNEL;
      version: number;
      type: "host-hello";
      payload: { protocol: number; host: "digitalcatalyst" };
    }
  | {
      channel: typeof DC_MESSAGE_CHANNEL;
      version: number;
      type: "identity";
      payload: { uid: string; email: string | null; displayName: string | null; locale: string; timeZone: string; tokenTtlSeconds: number };
    }
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "token"; payload: { requestId: string; token: string | null; expiresInSeconds: number } }
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "open"; payload: { href: string } }
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "signout" };

export type WorkspaceToHostMessage =
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "app-ready"; payload: { protocol: number; app: string } }
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "token-request"; payload: { requestId: string } }
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "navigate"; payload: { href: string } }
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "schedule-create"; payload: unknown }
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "schedule-update"; payload: unknown }
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "schedule-delete"; payload: unknown }
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "notify"; payload: { title: string; body: string; target?: unknown } }
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "resource-upload"; payload: { requestId: string; name: string; mime: string; size: number; storagePathHint?: string } }
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "analytics"; payload: { event: string; props?: Record<string, unknown> } }
  | { channel: typeof DC_MESSAGE_CHANNEL; version: number; type: "open-external"; payload: { url: string } };

export type IdentitySnapshot = {
  uid: string;
  email: string | null;
  displayName: string | null;
  locale: string;
  timeZone: string;
};

export type TokenProvider = () => Promise<{ token: string; expiresInSeconds: number } | null>;

/** Firebase ID tokens live for an hour; the frame re-requests well before that. */
export const TOKEN_TTL_SECONDS = 55 * 60;

export const resolveTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

export function buildHostHello(protocol: number): HostToWorkspaceMessage {
  return {
    channel: DC_MESSAGE_CHANNEL,
    version: DC_MESSAGE_VERSION,
    type: "host-hello",
    payload: { protocol, host: "digitalcatalyst" },
  };
}

export function buildIdentityMessage(identity: IdentitySnapshot): HostToWorkspaceMessage {
  return {
    channel: DC_MESSAGE_CHANNEL,
    version: DC_MESSAGE_VERSION,
    type: "identity",
    payload: {
      uid: identity.uid,
      email: identity.email,
      displayName: identity.displayName,
      locale: identity.locale,
      timeZone: identity.timeZone,
      tokenTtlSeconds: TOKEN_TTL_SECONDS,
    },
  };
}

export function buildTokenMessage(requestId: string, token: string | null): HostToWorkspaceMessage {
  return {
    channel: DC_MESSAGE_CHANNEL,
    version: DC_MESSAGE_VERSION,
    type: "token",
    payload: { requestId, token, expiresInSeconds: token ? TOKEN_TTL_SECONDS : 0 },
  };
}

export const buildOpenMessage = (href: string): HostToWorkspaceMessage => ({
  channel: DC_MESSAGE_CHANNEL,
  version: DC_MESSAGE_VERSION,
  type: "open",
  payload: { href },
});

export const buildSignOutMessage = (): HostToWorkspaceMessage => ({
  channel: DC_MESSAGE_CHANNEL,
  version: DC_MESSAGE_VERSION,
  type: "signout",
});

/**
 * Answer a frame's token request.
 *
 * Returns `null` (never a stale token) when the session is gone, so a signed-out
 * frame cannot keep calling the API with a token the host still had in memory.
 */
export async function answerTokenRequest(provider: TokenProvider): Promise<string | null> {
  try {
    const result = await provider();
    if (!result?.token) return null;
    return result.token;
  } catch {
    return null;
  }
}

/**
 * The only URLs a workspace message may hand to the host to open.
 *
 * The frame is not allowed to turn a message into a navigation to an arbitrary
 * scheme (`javascript:`, `data:`) or to another origin (§65, §102).
 */
export function isSafeWorkspaceHref(href: string): boolean {
  const value = String(href ?? "").trim();
  if (!value) return false;
  if (value.startsWith("#/")) return true;
  return false;
}

export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(String(url ?? "").trim());
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * What the workspace frame is allowed to remember about the session.
 *
 * Only these keys survive a reload inside the frame; the id token never does.
 */
export const WORKSPACE_SESSION_STORAGE_KEYS = ["dc.uid", "dc.locale", "dc.timeZone", "dc.lastRoute"] as const;

export function clearWorkspaceSession(storage: Pick<Storage, "removeItem"> | null | undefined): void {
  if (!storage) return;
  for (const key of WORKSPACE_SESSION_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // Restricted storage: nothing to clear.
    }
  }
}
