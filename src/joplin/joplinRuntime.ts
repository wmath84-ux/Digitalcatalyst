// src/joplin/joplinRuntime.ts
//
// Runtime discovery for the Joplin workspace sub-application.
//
// ── Why a sub-application and not an npm import ──────────────────────────────
// Joplin is a multi-package application. Its web-capable UI is
// `packages/app-mobile` compiled by its own Webpack config against
// react-native-web (`packages/app-mobile/web/webpack.config.ts`), with a second
// webpack target for its service worker, its own SQLite WASM database and its own
// asset pipeline. There is no `@joplin/joplin` package that can be mounted as a
// React component, and there is no published Joplin web UI on npm — so the
// integration point is the compiled bundle, served from a dedicated path and
// mounted in an isolated frame (see docs/joplin-myday-architecture.md).
//
// This module answers three questions at runtime:
//
//   1. is a compiled workspace present in this deployment? (`detectJoplinRuntime`)
//   2. which pinned upstream commit produced it?           (the manifest)
//   3. if it is missing, what exactly should be run?       (the build hint)
//
// The host must never pretend. When the bundle is absent, `#/my-day` renders an
// honest "workspace runtime not built" state with the exact command — not a
// lookalike UI, and not a blank screen (§110, §125).

/** Where the compiled sub-application is served from. */
export const JOPLIN_WORKSPACE_BASE_PATH = "/my-day-workspace/";

/** File written next to the bundle by `scripts/joplin/build-workspace.mjs`. */
export const JOPLIN_WORKSPACE_MANIFEST = "dc-workspace.json";

/** Bridge protocol version. The host and the bundle must agree exactly. */
export const DC_BRIDGE_PROTOCOL = 1;

export interface JoplinServiceWorkerInfo {
  /** Path of the sub-app's own worker, relative to the workspace base path. */
  path: string;
  /** Its registration scope — MUST stay inside the workspace path (§89). */
  scope: string;
}

export interface JoplinWorkspaceManifest {
  schema: 1;
  /** Exact upstream commit the bundle was built from (never a floating ref). */
  sourceCommit: string;
  sourceTag: string;
  builtAt: string;
  buildMode: "production" | "development";
  /** Entry document, relative to the base path. */
  entry: string;
  assets: string[];
  bridge: { protocol: number };
  serviceWorker: JoplinServiceWorkerInfo | null;
}

export type JoplinRuntimeState =
  | { status: "checking" }
  | { status: "ready"; manifest: JoplinWorkspaceManifest; entryUrl: string }
  | { status: "missing"; reason: "manifest_not_found"; buildCommand: string; docsPath: string }
  | { status: "error"; reason: string; buildCommand: string; docsPath: string };

export const JOPLIN_BUILD_COMMAND = "npm run joplin:build";
export const JOPLIN_ARCHITECTURE_DOC = "docs/joplin-myday-architecture.md";

const workspaceUrl = (relative: string): string => `${JOPLIN_WORKSPACE_BASE_PATH}${relative}`.replace(/\/{2,}/g, "/");

function isManifest(value: unknown): value is JoplinWorkspaceManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<JoplinWorkspaceManifest>;
  return (
    candidate.schema === 1 &&
    typeof candidate.sourceCommit === "string" &&
    candidate.sourceCommit.length >= 7 &&
    typeof candidate.entry === "string" &&
    Array.isArray(candidate.assets) &&
    typeof candidate.bridge?.protocol === "number"
  );
}

/**
 * Probe the deployment for a compiled workspace.
 *
 * `no-store` on purpose: a stale cached manifest would make the host mount a
 * bundle whose assets have already been replaced by a deploy.
 */
export async function detectJoplinRuntime(
  fetchImpl: typeof fetch | undefined = typeof fetch === "function" ? fetch : undefined,
): Promise<JoplinRuntimeState> {
  if (!fetchImpl) {
    return {
      status: "error",
      reason: "no_fetch_implementation",
      buildCommand: JOPLIN_BUILD_COMMAND,
      docsPath: JOPLIN_ARCHITECTURE_DOC,
    };
  }
  try {
    const response = await fetchImpl(workspaceUrl(JOPLIN_WORKSPACE_MANIFEST), {
      cache: "no-store",
      credentials: "same-origin",
    });
    if (response.status === 404) {
      return {
        status: "missing",
        reason: "manifest_not_found",
        buildCommand: JOPLIN_BUILD_COMMAND,
        docsPath: JOPLIN_ARCHITECTURE_DOC,
      };
    }
    if (!response.ok) {
      return {
        status: "error",
        reason: `manifest_http_${response.status}`,
        buildCommand: JOPLIN_BUILD_COMMAND,
        docsPath: JOPLIN_ARCHITECTURE_DOC,
      };
    }
    const payload = (await response.json()) as unknown;
    if (!isManifest(payload)) {
      return {
        status: "error",
        reason: "manifest_invalid",
        buildCommand: JOPLIN_BUILD_COMMAND,
        docsPath: JOPLIN_ARCHITECTURE_DOC,
      };
    }
    if (payload.bridge.protocol !== DC_BRIDGE_PROTOCOL) {
      // A protocol mismatch is a deploy skew (host updated, bundle not, or the
      // reverse). Failing loudly beats mounting a bundle that cannot talk back.
      return {
        status: "error",
        reason: `bridge_protocol_mismatch:${payload.bridge.protocol}`,
        buildCommand: JOPLIN_BUILD_COMMAND,
        docsPath: JOPLIN_ARCHITECTURE_DOC,
      };
    }
    return { status: "ready", manifest: payload, entryUrl: workspaceUrl(payload.entry) };
  } catch (error) {
    return {
      status: "error",
      reason: error instanceof Error ? error.message : "manifest_probe_failed",
      buildCommand: JOPLIN_BUILD_COMMAND,
      docsPath: JOPLIN_ARCHITECTURE_DOC,
    };
  }
}

/**
 * Origins/sources the host accepts bridge messages from.
 *
 * Only the workspace frame of THIS document is allowed: a message from another
 * window, an unexpected origin, or a message without the version tag is dropped
 * before it can touch identity or the data plane (§33, §102).
 */
export function isTrustedWorkspaceMessage(
  event: MessageEvent,
  iframeWindow: Window | null,
  expectedOrigin: string,
): boolean {
  if (!iframeWindow || event.source !== iframeWindow) return false;
  if (expectedOrigin && event.origin !== expectedOrigin) return false;
  const data = event.data as { channel?: unknown } | null;
  return Boolean(data && typeof data === "object" && data.channel === DC_MESSAGE_CHANNEL);
}

export const DC_MESSAGE_CHANNEL = "digitalcatalyst-myday";
