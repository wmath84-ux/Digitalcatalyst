// src/joplin/JoplinWorkspace.tsx
//
// The My Day workspace host.
//
// It renders the compiled Joplin web sub-application in an isolated frame and
// owns everything the sub-application must not own itself: the Digitalcatalyst
// identity, the entitlement boundary, the deep-link contract, the schedule write
// path and the resource pre-flight.
//
// ── Why a frame ─────────────────────────────────────────────────────────────
// Joplin's web build ships its own CSS, its own fonts, its own editor, its own
// scroll containers and its own service worker. Mounting it inline would put two
// visual systems in one document and two scroll owners in one viewport — the two
// failure modes the brief calls out (§48, §79). A dedicated frame gives the
// sub-application its own document: its styles cannot reach the host, the host's
// styles cannot reach it, and the scroll owner is unambiguous.
//
// The frame is same-origin (it is our own build, served from our own path) and is
// NOT presented as a security sandbox: the security boundary is the API and the
// Firestore rules. It is a CSS/JS/scroll isolation boundary, and it is documented
// as such rather than over-claimed.
//
// ── What the learner sees ───────────────────────────────────────────────────
// My Day's chrome is Joplin's (§41/§42): no glass cards, no Digitalcatalyst
// toolbar on top, no recolouring. The host contributes exactly one thing — a
// neutral loading surface, and an honest diagnostic if the deployment has no
// compiled workspace (§110, §125).

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  DC_MESSAGE_CHANNEL,
  DC_BRIDGE_PROTOCOL,
  JOPLIN_WORKSPACE_BASE_PATH,
  detectJoplinRuntime,
  isTrustedWorkspaceMessage,
} from "./joplinRuntime";
import type { JoplinRuntimeState } from "./joplinRuntime";
import {
  answerTokenRequest,
  buildHostHello,
  buildIdentityMessage,
  buildOpenMessage,
  buildSignOutMessage,
  buildTokenMessage,
  isSafeExternalUrl,
  isSafeWorkspaceHref,
  resolveTimeZone,
} from "./joplinAuthBridge";
import type { IdentitySnapshot, WorkspaceToHostMessage } from "./joplinAuthBridge";
import { trackMyDayEvent } from "./joplinAnalytics";
import { validateResourceCandidate } from "./joplinStorageBridge";

export interface JoplinWorkspaceProps {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  /** Short-lived ID token provider — never a refresh token (§12). */
  getToken: () => Promise<string | null>;
  /** Host-side navigation for messages the frame sends up. */
  onNavigate: (hash: string) => void;
  /**
   * The canonical workspace target the frame must open (a migrated legacy
   * notification URL, a schedule deep link, a `?view=` request). It is tracked,
   * not read once: a notification tapped while the workspace is already open
   * changes this value and the host re-sends the open message.
   */
  deepLink?: string | null;
  /** Called when the frame reports a schedule mutation. */
  onScheduleMessage?: (message: WorkspaceToHostMessage) => void;
}

/** How long to wait for the bundle to announce its bridge before reporting it. */
const BRIDGE_HELLO_TIMEOUT_MS = 20_000;

type BridgeStatus = "waiting" | "ready" | "silent" | "signout";

export default function JoplinWorkspace(props: JoplinWorkspaceProps) {
  const { uid, email, displayName, getToken, onNavigate, deepLink, onScheduleMessage } = props;
  const [runtime, setRuntime] = useState<JoplinRuntimeState>({ status: "checking" });
  const [bridge, setBridge] = useState<BridgeStatus>("waiting");
  const [attempt, setAttempt] = useState(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  /** The link the frame was last told to open (no duplicate opens, §28). */
  const openedRef = useRef<string | null>(null);
  const deepLinkRef = useRef<string | null>(deepLink ?? null);
  deepLinkRef.current = deepLink ?? null;

  const identity: IdentitySnapshot = useMemo(
    () => ({
      uid,
      email: email ?? null,
      displayName: displayName ?? null,
      locale: typeof navigator !== "undefined" ? navigator.language || "en-IN" : "en-IN",
      timeZone: resolveTimeZone(),
    }),
    [uid, email, displayName],
  );

  // ── runtime discovery ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setRuntime({ status: "checking" });
    setBridge("waiting");
    void detectJoplinRuntime().then((state) => {
      if (!cancelled) setRuntime(state);
    });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const post = useCallback((message: unknown) => {
    const frameWindow = frameRef.current?.contentWindow;
    if (!frameWindow) return;
    frameWindow.postMessage(message, window.location.origin);
  }, []);

  // ── bridge ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (runtime.status !== "ready") return undefined;

    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedWorkspaceMessage(event, frameRef.current?.contentWindow ?? null, window.location.origin)) return;
      const message = event.data as WorkspaceToHostMessage;
      switch (message.type) {
        case "app-ready": {
          if (message.payload?.protocol !== DC_BRIDGE_PROTOCOL) {
            // A bundle built by an older pipeline: refuse rather than talk past
            // each other, and say so in the diagnostic.
            setBridge("silent");
            return;
          }
          setBridge("ready");
          post(buildIdentityMessage(identity));
          const initial = deepLinkRef.current;
          if (initial) {
            openedRef.current = initial;
            post(buildOpenMessage(initial));
          }
          trackMyDayEvent("myday_workspace_open", { source: "bridge" });
          return;
        }
        case "token-request": {
          const requestId = String(message.payload?.requestId ?? "");
          void answerTokenRequest(async () => {
            const token = await getToken();
            return token ? { token, expiresInSeconds: 55 * 60 } : null;
          }).then((token) => post(buildTokenMessage(requestId, token)));
          return;
        }
        case "navigate": {
          const href = String(message.payload?.href ?? "");
          if (isSafeWorkspaceHref(href)) {
            onNavigate(href);
            return;
          }
          if (isSafeExternalUrl(href)) {
            window.open(href, "_blank", "noopener,noreferrer");
          }
          return;
        }
        case "open-external": {
          const url = String(message.payload?.url ?? "");
          if (isSafeExternalUrl(url)) window.open(url, "_blank", "noopener,noreferrer");
          return;
        }
        case "schedule-create":
        case "schedule-update":
        case "schedule-delete": {
          onScheduleMessage?.(message);
          return;
        }
        case "resource-upload": {
          const payload = message.payload as { requestId?: string; name?: string; mime?: string; size?: number };
          const validation = validateResourceCandidate({
            name: String(payload?.name ?? ""),
            mime: String(payload?.mime ?? ""),
            size: Number(payload?.size ?? 0),
          });
          // The frame uploads the bytes itself through /api/joplin/resources with
          // its short-lived token; the host only pre-validates, so a 20 MB file
          // never crosses the postMessage boundary.
          post({
            channel: DC_MESSAGE_CHANNEL,
            version: 1,
            type: "resource-preflight",
            payload: { requestId: payload?.requestId, ok: validation.ok, reason: validation.reason, safeName: validation.safeName },
          });
          return;
        }
        case "analytics": {
          const event = String(message.payload?.event ?? "");
          // Allow-list: the frame cannot invent analytics events (§87 keeps the
          // vocabulary product-owned and the payload content-free).
          if (MYDAY_ANALYTICS_EVENTS.has(event)) trackMyDayEvent(event, message.payload?.props ?? {});
          return;
        }
        default:
          return;
      }
    };

    window.addEventListener("message", handleMessage);

    // Handshake first; the frame replies `app-ready`.
    post(buildHostHello(DC_BRIDGE_PROTOCOL));
    const helloTimer = window.setTimeout(() => {
      setBridge((current) => (current === "ready" ? current : "silent"));
    }, BRIDGE_HELLO_TIMEOUT_MS);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(helloTimer);
    };
    // `deepLink` is deliberately absent: opening a NEW target must not re-run the
    // handshake (it is forwarded by the effect below instead).
  }, [getToken, identity, onNavigate, onScheduleMessage, post, runtime.status]);

  // ── later deep links ──────────────────────────────────────────────────────
  // A notification tapped while the workspace is already open changes the host
  // hash without remounting anything, so the open message has to be re-sent
  // (§28). The link is compared against the one the frame was opened with, and
  // only a real change is forwarded — the frame never re-opens its own target.
  useEffect(() => {
    if (bridge !== "ready") return;
    const next = deepLink ?? null;
    if (!next || next === openedRef.current) return;
    openedRef.current = next;
    post(buildOpenMessage(next));
    trackMyDayEvent("myday_workspace_open", { source: "deep_link" });
  }, [bridge, deepLink, post]);

  // ── sign-out teardown (§112) ──────────────────────────────────────────────
  useEffect(() => {
    if (bridge !== "ready") return undefined;
    return () => {
      // Unmounting the frame drops its memory, its storage handles and its
      // subscription state; the message tells a still-live frame to stop first.
      post(buildSignOutMessage());
    };
  }, [post, bridge]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  if (runtime.status === "checking") {
    return <WorkspaceLoading label="Opening your workspace…" />;
  }

  if (runtime.status === "missing" || runtime.status === "error") {
    return (
      <WorkspaceRuntimeDiagnostic
        reason={runtime.reason}
        buildCommand={runtime.buildCommand}
        docsPath={runtime.docsPath}
        onRetry={retry}
        onGoHome={() => onNavigate("#/home")}
      />
    );
  }

  return (
    <div
      // Single scroll owner (§48): the frame scrolls, the host does not. The
      // workspace fills the available My Day area exactly — no glass frame, no
      // max-w-md phone shell on desktop (§81).
      // No `bg-white` here on purpose: the iframe paints Joplin's own canvas, and
      // a host-side page plate is exactly the Digitalcatalyst treatment the
      // workspace must not put under Joplin's UI.
      className="relative h-[100dvh] w-full overflow-hidden supports-[height:100dvh]:h-[100dvh]"
      data-myday-workspace="joplin"
      data-joplin-source-commit={runtime.manifest.sourceCommit}
    >
      <iframe
        ref={frameRef}
        title="My Day workspace"
        src={runtime.entryUrl}
        // `allow-same-origin` is required: the workspace keeps its own local
        // Joplin profile (IndexedDB/OPFS) under our origin. This frame is an
        // isolation boundary for styles, scripts and scroll ownership — the
        // security boundary is the API plus Firestore rules.
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads allow-modals"
        allow="clipboard-read; clipboard-write; storage-access"
        className="h-full w-full border-0"
        data-myday-workspace-frame
      />
      {bridge !== "ready" && (
        // Sits above the frame until the workspace answers the handshake. Kept
        // deliberately plain (Joplin-like neutral) rather than a Digitalcatalyst
        // glass splash (§41, §110).
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-white/95 dark:bg-neutral-900/95">
          <div className="flex flex-col items-center gap-2 text-center">
            {bridge === "waiting" ? (
              <>
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" aria-hidden="true" />
                <p className="text-sm text-neutral-600 dark:text-neutral-300">Loading your workspace…</p>
                <p className="max-w-xs text-[11px] text-neutral-400">Notes, to-dos, notebooks and schedules are opening.</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">The workspace did not finish starting.</p>
                <p className="max-w-sm text-xs text-neutral-500">
                  The My Day workspace bundle loaded but its Digitalcatalyst bridge did not answer within{" "}
                  {Math.round(BRIDGE_HELLO_TIMEOUT_MS / 1000)} seconds. Nothing has been lost — your workspace on this device is untouched.
                </p>
                <div className="mt-1 flex gap-2">
                  <button
                    type="button"
                    onClick={retry}
                    className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                  >
                    Reload workspace
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate("#/home")}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                  >
                    Go home
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Analytics vocabulary the frame may emit (§87). */
const MYDAY_ANALYTICS_EVENTS = new Set([
  "joplin_note_create",
  "joplin_note_update",
  "joplin_todo_complete",
  "joplin_schedule_create",
  "joplin_schedule_fire",
  "joplin_clip_create",
]);

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <div className="grid h-[100dvh] w-full place-items-center bg-neutral-100 dark:bg-neutral-900" data-myday-workspace-loading>
      <div className="flex flex-col items-center gap-2">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" aria-hidden="true" />
        <p className="text-sm text-neutral-600 dark:text-neutral-300">{label}</p>
      </div>
    </div>
  );
}

/**
 * The state a deployment without a compiled workspace must show.
 *
 * This is not a stand-in for the workspace and does not pretend to be one: it
 * names the missing artefact, the pinned source and the exact command that
 * produces it (§110, §125, §151).
 */
function WorkspaceRuntimeDiagnostic({
  reason,
  buildCommand,
  docsPath,
  onRetry,
  onGoHome,
}: {
  reason: string;
  buildCommand: string;
  docsPath: string;
  onRetry: () => void;
  onGoHome: () => void;
}) {
  return (
    <div className="grid min-h-[100dvh] w-full place-items-center bg-neutral-100 px-4 dark:bg-neutral-900" data-myday-workspace-missing>
      <div className="w-full max-w-xl rounded-lg border border-neutral-200 bg-white p-5 text-left shadow-sm dark:border-neutral-700 dark:bg-neutral-800">
        <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">My Day workspace runtime not built</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
          My Day is the Joplin-powered personal workspace (notebooks, notes, to-dos, tags, search, attachments,
          schedules). Its user interface is compiled from the pinned Joplin web source — this deployment does not
          contain that build yet, so there is nothing to show here. No My Day data has been changed.
        </p>
        <dl className="mt-4 space-y-1.5 text-xs text-neutral-600 dark:text-neutral-300">
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 font-semibold text-neutral-500">Expected location</dt>
            <dd className="font-mono">{JOPLIN_WORKSPACE_BASE_PATH}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 font-semibold text-neutral-500">Diagnostic</dt>
            <dd className="font-mono">{reason}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 font-semibold text-neutral-500">Build command</dt>
            <dd className="font-mono">{buildCommand}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-36 shrink-0 font-semibold text-neutral-500">Architecture</dt>
            <dd className="font-mono">{docsPath}</dd>
          </div>
        </dl>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700"
          >
            Check again
          </button>
          <button
            type="button"
            onClick={onGoHome}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200"
          >
            Go home
          </button>
        </div>
      </div>
    </div>
  );
}

interface BoundaryProps {
  children: ReactNode;
  onGoHome: () => void;
}

/**
 * Dedicated error boundary (§109).
 *
 * A failure inside the workspace host must never take the Digitalcatalyst app
 * down with it, and the recovery path must not look like data loss: the panel
 * says the workspace did not open and offers retry / reload / home.
 */
export class JoplinWorkspaceBoundary extends Component<BoundaryProps, { error: Error | null }> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No note content is logged anywhere (§87) — only the failure itself.
    trackMyDayEvent("myday_workspace_error", { message: String(error?.message ?? "unknown").slice(0, 120) });
    void info;
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-[100dvh] w-full place-items-center bg-neutral-100 px-4 dark:bg-neutral-900">
        <div className="max-w-md rounded-lg border border-neutral-200 p-5 text-center dark:border-neutral-700">
          <h1 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">Your workspace did not open</h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
            Something went wrong while starting My Day. Your notes, to-dos and schedules are stored separately and were
            not touched.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="rounded-md bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-700"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={this.props.onGoHome}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-200"
            >
              Go home
            </button>
          </div>
        </div>
      </div>
    );
  }
}
