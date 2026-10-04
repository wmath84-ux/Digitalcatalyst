import { useEffect, useRef, useState } from "react";
import { READ_PDFJS_VERSION } from "../../utils/readResources.js";

interface PdfViewerEventBus {
  on: (eventName: string, listener: (event: unknown) => void) => void;
  off: (eventName: string, listener: (event: unknown) => void) => void;
}

interface PdfViewerApp {
  eventBus?: PdfViewerEventBus;
}

interface PdfjsElement extends HTMLElement {
  initPromise?: Promise<{ viewerApp?: PdfViewerApp }>;
  iframe?: HTMLIFrameElement;
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
 * Locally bundled PDF.js Generic Viewer. The npm component is intentionally
 * imported only when this component mounts (a learner opens an actual PDF).
 */
export default function PdfJsGenericViewer({
  src,
  title,
  productId,
  resourceId,
  initialPage = 1,
  onPageChange,
}: {
  src: string;
  title: string;
  productId: string;
  resourceId: string;
  initialPage?: number;
  onPageChange: (page: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const initialPageRef = useRef(initialPage);
  const [error, setError] = useState("");
  const storageKey = `digitalcatalyst:read-page:${encodeURIComponent(productId)}:${encodeURIComponent(resourceId)}`;

  useEffect(() => {
    let cancelled = false;
    let element: PdfjsElement | null = null;
    let eventBus: PdfViewerEventBus | undefined;
    let pageHandler: ((event: unknown) => void) | undefined;
    let resizeObserver: ResizeObserver | null = null;

    const mount = async () => {
      try {
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
        eventBus = initialized?.viewerApp?.eventBus;
        if (eventBus) {
          pageHandler = (event) => {
            if (!event || typeof event !== "object" || !("pageNumber" in event)) return;
            const page = Number((event as { pageNumber?: unknown }).pageNumber);
            if (Number.isInteger(page) && page > 0) onPageChange(page);
          };
          eventBus.on("pagechanging", pageHandler);
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
    void mount();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      if (eventBus && pageHandler) eventBus.off("pagechanging", pageHandler);
      element?.remove();
    };
  }, [src, title, storageKey, onPageChange]);

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-slate-950" data-read-pdfjs-viewer>
      <div ref={hostRef} className="h-full min-h-0 w-full" />
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
