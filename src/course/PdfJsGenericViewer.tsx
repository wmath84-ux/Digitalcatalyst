import { useEffect, useRef, useState } from "react";
import { READ_PDFJS_VERSION } from "../../utils/readResources.js";
import { checkPdfSource, type PdfSourceCheck } from "./pdfSourceCheck";

interface PdfViewerEventBus {
  on: (eventName: string, listener: (event: unknown) => void) => void;
  off: (eventName: string, listener: (event: unknown) => void) => void;
}

interface PdfAnnotationStorage {
  size?: number;
  onSetModified?: (() => void) | null;
  onResetModified?: (() => void) | null;
}

interface PdfDocumentProxyLike {
  annotationStorage?: PdfAnnotationStorage;
  saveDocument?: () => Promise<Uint8Array>;
}

interface PdfViewerApp {
  eventBus?: PdfViewerEventBus;
  pdfDocument?: PdfDocumentProxyLike | null;
  pageNumber?: number;
  pdfViewer?: { currentPageNumber?: number; pagesCount?: number };
}

interface PdfjsElement extends HTMLElement {
  initPromise?: Promise<{ viewerApp?: PdfViewerApp }>;
  iframe?: HTMLIFrameElement;
}

/**
 * The bridge the reader chrome uses to persist a learner's annotations.
 *
 * Every method is inert until the PDF.js viewer has actually loaded a
 * document; the reader attaches the bridge while the viewer is still
 * booting, so each call answers honestly instead of throwing.
 */
export interface PdfAnnotationApi {
  /** True while the viewer holds annotation edits that are not saved yet. */
  isDirty: () => boolean;
  /**
   * The document WITH the annotations — exactly the bytes the viewer's own
   * Save button produces (`pdfDocument.saveDocument()`), so what is stored
   * is a normal annotated PDF any reader can open.
   */
  saveAnnotatedBytes: () => Promise<Uint8Array>;
  /** 1-based page the learner is on. */
  currentPage: () => number;
  /** How many annotations the viewer currently holds. */
  annotationCount: () => number;
  /** Total pages, once the document knows. */
  pageCount: () => number;
}

const readPageFromStorage = (storageKey: string) => {
  try {
    const page = Number(window.localStorage.getItem(storageKey));
    return Number.isInteger(page) && page > 0 ? page : 1;
  } catch {
    return 1;
  }
};

/**
 * PDF.js 6.x builds its text-search patterns with `RegExp.escape` (ES2025),
 * which older browsers do not have — search then fails with a page error. The
 * viewer runs in its own same-origin realm, so the fallback is installed on the
 * frame's `RegExp` (never on the app's). Only added when missing; semantics
 * follow the spec: syntax characters are backslashed, `-` and other
 * punctuation get \x escapes so the result is valid with and without the `u` flag.
 */
export function installRegExpEscape(win: { RegExp: RegExpConstructor } | null | undefined): void {
  const ctor = win?.RegExp as (RegExpConstructor & { escape?: (value: string) => string }) | undefined;
  if (!ctor || typeof ctor.escape === "function") return;
  const SYNTAX = /[\\^$.*+?()[\]{}|/]/;
  const escapeChar = (ch: string) => {
    if (SYNTAX.test(ch)) return `\\${ch}`;
    const code = ch.charCodeAt(0);
    return code > 0xff ? `\\u${code.toString(16).padStart(4, "0")}` : `\\x${code.toString(16).padStart(2, "0")}`;
  };
  Object.defineProperty(ctor, "escape", {
    configurable: true,
    writable: true,
    value: (value: string) =>
      String(value).replace(/[\\^$.*+?()[\]{}|/]|[-,!"#%&'():;<=>@`~\s]|^[0-9a-zA-Z]/g, (ch) => escapeChar(ch)),
  });
}

/**
 * Locally bundled PDF.js Generic Viewer. The npm component is intentionally
 * imported only when this component mounts (a learner opens an actual PDF).
 *
 * `onAnnotationApi` exposes the annotation bridge described above; the parent
 * (ReadLibraryPanel) uses it to save a learner's own annotations back to
 * cloud storage. Instructor PDFs are read-only content, so the parent simply
 * never asks for bytes there.
 */
export default function PdfJsGenericViewer({
  src,
  title,
  productId,
  resourceId,
  initialPage = 1,
  onPageChange,
  onAnnotationApi,
  originalUrl,
}: {
  src: string;
  title: string;
  productId: string;
  resourceId: string;
  initialPage?: number;
  onPageChange: (page: number) => void;
  onAnnotationApi?: (api: PdfAnnotationApi | null) => void;
  /** The link the learner can open in a new tab when the viewer cannot read the file. */
  originalUrl?: string;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const initialPageRef = useRef(initialPage);
  const [error, setError] = useState("");
  // Why the source was refused before the viewer started (CORS, 404, not a PDF…).
  const [problem, setProblem] = useState<Extract<PdfSourceCheck, { ok: false }> | null>(null);
  // Bumped by Retry: re-runs the check and the viewer mount.
  const [attempt, setAttempt] = useState(0);
  // Kept in a ref so a parent that passes an inline callback can never remount
  // the viewer (the mount effect must depend on the document only).
  const annotationApiRef = useRef(onAnnotationApi);
  annotationApiRef.current = onAnnotationApi;
  // Same reasoning for the page callback: an inline arrow from the parent must
  // never remount the viewer (a remount would drop unsaved annotations).
  const pageChangeRef = useRef(onPageChange);
  pageChangeRef.current = onPageChange;
  const storageKey = `digitalcatalyst:read-page:${encodeURIComponent(productId)}:${encodeURIComponent(resourceId)}`;

  useEffect(() => {
    let cancelled = false;
    let element: PdfjsElement | null = null;
    let eventBus: PdfViewerEventBus | undefined;
    let pageHandler: ((event: unknown) => void) | undefined;
    let resizeObserver: ResizeObserver | null = null;
    let dirtyPoll: ReturnType<typeof setInterval> | null = null;

    const mount = async () => {
      try {
        // Refuse a source that is not a readable PDF BEFORE the viewer starts,
        // so the learner gets a specific reason and a way out — never a blank
        // or silently different viewer.
        const verdict = await checkPdfSource(src);
        if (cancelled) return;
        if (!verdict.ok) {
          setProblem(verdict);
          return;
        }
        // Load the package's own custom-element module from the same-origin,
        // versioned asset tree. A runtime URL deliberately bypasses Vite's
        // `new URL(import.meta.url)` asset rewriting, which would emit a second
        // copy of its ~2.5 MiB viewer/worker files alongside the static tree.
        const appRoot = new URL("/", window.location.href);
        const viewerBase = new URL(`pdfjs-viewer/${READ_PDFJS_VERSION}/`, appRoot).toString();
        const dataBase = new URL(`pdfjs-data/${READ_PDFJS_VERSION}/`, appRoot).toString();
        const localUrl = (path: string) => new URL(path, dataBase).toString();
        await import(/* @vite-ignore */ new URL("pdfjs-viewer-element.js", viewerBase).href);
        if (cancelled || !hostRef.current) return;

        element = document.createElement("pdfjs-viewer-element") as PdfjsElement;
        element.setAttribute("src", src);
        element.setAttribute("iframe-title", `${title} — PDF.js viewer`);
        element.setAttribute("assets-base", viewerBase);
        element.setAttribute("worker-src", new URL("pdf.worker.min.mjs", viewerBase).toString());
        element.setAttribute("c-map-url", localUrl("cmaps/"));
        element.setAttribute("icc-url", localUrl("iccs/"));
        element.setAttribute("image-resources-path", new URL("images/", viewerBase).toString());
        element.setAttribute("sandbox-bundle-src", localUrl("build/pdf.sandbox.min.mjs"));
        element.setAttribute("standard-font-data-url", localUrl("standard_fonts/"));
        element.setAttribute("wasm-url", localUrl("wasm/"));
        element.setAttribute("viewer-css-theme", "DARK");
        const savedPage = Number(initialPageRef.current);
        const initialPage = Number.isInteger(savedPage) && savedPage > 1 ? savedPage : readPageFromStorage(storageKey);
        if (initialPage > 1) element.setAttribute("page", String(initialPage));
        element.style.cssText = "display:block;width:100%;height:100%;min-height:0;background:#111827";
        hostRef.current.replaceChildren(element);

        const initialized = await element.initPromise;
        if (cancelled) return;
        // The viewer's own realm: `contentWindow` is typed as Window, which does not declare RegExp.
        installRegExpEscape((element.iframe?.contentWindow as unknown as { RegExp: RegExpConstructor } | null) ?? null);
        const viewerApp = initialized?.viewerApp;
        eventBus = viewerApp?.eventBus;
        if (eventBus) {
          pageHandler = (event) => {
            if (!event || typeof event !== "object" || !("pageNumber" in event)) return;
            const page = Number((event as { pageNumber?: unknown }).pageNumber);
            if (Number.isInteger(page) && page > 0) pageChangeRef.current(page);
          };
          eventBus.on("pagechanging", pageHandler);
        }

        // ── Annotation bridge ────────────────────────────────────────────
        // PDF.js keeps every edit in the document's annotation storage and
        // flips a private "modified" flag the first time it changes. The
        // viewer itself reads that flag for its own Save button; we observe
        // the same two callbacks (chaining, never replacing, what the viewer
        // installed) so the reader chrome can say "Unsaved annotations" and
        // write the exact same bytes Save would.
        if (viewerApp) {
          let dirty = false;
          // Size of the storage at the last moment we know the cloud has the
          // same bytes: the safety net below only ever *adds* dirtiness, it
          // never clears it (a save is what clears it).
          let savedSize = 0;
          const doc = () => viewerApp.pdfDocument || null;
          const annotationStorage = () => doc()?.annotationStorage || null;
          const attach = () => {
            const storage = annotationStorage();
            if (!storage) return;
            dirty = false;
            savedSize = Number(storage.size || 0);
            const previousSet = storage.onSetModified;
            storage.onSetModified = () => {
              try {
                previousSet?.();
              } catch {
                /* the viewer's own handler must never break the save path */
              }
              dirty = true;
            };
            const previousReset = storage.onResetModified;
            storage.onResetModified = () => {
              try {
                previousReset?.();
              } catch {
                /* see above */
              }
              dirty = false;
            };
          };
          // The document can arrive after `initPromise` (the element resolves
          // as soon as the viewer shell exists), so attach on every load
          // signal and mark the first one.
          eventBus?.on("documentloaded", attach);
          eventBus?.on("pagesinit", attach);
          attach();
          annotationApiRef.current?.({
            isDirty: () => dirty,
            saveAnnotatedBytes: async () => {
              const target = doc();
              if (!target?.saveDocument) throw new Error("The PDF is still loading — try saving again in a moment.");
              const bytes = await target.saveDocument();
              dirty = false;
              savedSize = Number(annotationStorage()?.size || 0);
              return bytes;
            },
            currentPage: () => {
              const page = Number(viewerApp.pageNumber || viewerApp.pdfViewer?.currentPageNumber || 1);
              return Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
            },
            annotationCount: () => {
              const size = Number(annotationStorage()?.size || 0);
              return Number.isFinite(size) && size > 0 ? Math.trunc(size) : 0;
            },
            pageCount: () => {
              const total = Number(viewerApp.pdfViewer?.pagesCount || 0);
              return Number.isFinite(total) && total > 0 ? Math.trunc(total) : 0;
            },
          });
          // Safety net: an edit the wrapped callbacks never saw (a document
          // replaced without a fresh "documentloaded", a viewer that reset its
          // own handlers) still shows up as storage growth past the last save.
          dirtyPoll = setInterval(() => {
            if (cancelled) return;
            const size = Number(annotationStorage()?.size || 0);
            if (size > savedSize) dirty = true;
          }, 2500);
        }

        // PDF.js's Generic Viewer handles resize/orientation changes itself.
        // This observer also nudges its same-origin viewer frame after a split
        // resize, which avoids a stale page-width measurement on WebViews.
        if (typeof ResizeObserver !== "undefined" && hostRef.current) {
          resizeObserver = new ResizeObserver(() => {
            try {
              element?.iframe?.contentWindow?.dispatchEvent(new Event("resize"));
            } catch {
              // PDF.js remains responsible for the normal resize path.
            }
          });
          resizeObserver.observe(hostRef.current);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "The local PDF.js viewer could not be loaded.");
      }
    };

    setError("");
    setProblem(null);
    void mount();
    return () => {
      cancelled = true;
      if (dirtyPoll) clearInterval(dirtyPoll);
      resizeObserver?.disconnect();
      if (eventBus && pageHandler) eventBus.off("pagechanging", pageHandler);
      annotationApiRef.current?.(null);
      element?.remove();
    };
  }, [src, title, storageKey, attempt]);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-slate-950" data-read-pdfjs-viewer>
      <div ref={hostRef} className="h-full min-h-0 w-full" />
      {problem ? (
        <div className="absolute inset-0 grid place-items-center bg-slate-950 p-6 text-center" role="alert" data-read-pdf-problem={problem.kind}>
          <div className="max-w-md space-y-3">
            <p className="text-sm font-bold text-white">This PDF could not be opened</p>
            <p className="text-xs leading-5 text-slate-300">{problem.message}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              {problem.retryable ? (
                <button
                  type="button"
                  onClick={() => setAttempt((count) => count + 1)}
                  className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
                  data-read-pdf-retry
                >
                  Retry
                </button>
              ) : null}
              {originalUrl ? (
                <a
                  href={originalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
                  data-read-pdf-open-original
                >
                  Open original link
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 grid place-items-center bg-slate-950 p-6 text-center" role="alert">
          <div className="max-w-md space-y-2">
            <p className="text-sm font-bold text-white">PDF.js viewer unavailable</p>
            <p className="text-xs leading-5 text-slate-300">{error}</p>
            <p className="text-[11px] leading-5 text-slate-400">Check your connection, PDF sharing permissions and the source host&apos;s CORS settings.</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
