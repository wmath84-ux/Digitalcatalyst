import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, BookOpenText, ExternalLink, FileText, Search, X } from "lucide-react";
import type { AccessibleReadResource } from "../../utils/readResources.js";
import PdfJsGenericViewer from "./PdfJsGenericViewer";

const pageStorageKey = (productId: string, resourceId: string) =>
  `digitalcatalyst:read-page:${encodeURIComponent(productId)}:${encodeURIComponent(resourceId)}`;

const pageFromStorage = (productId: string, resourceId: string) => {
  try {
    const page = Number(window.localStorage.getItem(pageStorageKey(productId, resourceId)));
    return Number.isInteger(page) && page > 0 ? page : 1;
  } catch {
    return 1;
  }
};

export default function ReadLibraryPanel({
  entries,
  productId,
}: {
  entries: AccessibleReadResource[];
  productId: string;
}) {
  const [query, setQuery] = useState("");
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null);
  const [pagePositions, setPagePositions] = useState<Record<string, number>>({});
  const activeEntry = entries.find((entry) => entry.id === activeEntryId) || null;

  const filteredEntries = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => [
      entry.resource.name,
      entry.modulePath.join(" "),
      entry.presentation.label,
      entry.resource.readFileName,
    ].filter(Boolean).join(" ").toLocaleLowerCase().includes(needle));
  }, [entries, query]);

  const savePage = useCallback((resourceId: string, page: number) => {
    setPagePositions((current) => current[resourceId] === page ? current : { ...current, [resourceId]: page });
    try {
      window.localStorage.setItem(pageStorageKey(productId, resourceId), String(page));
    } catch {
      // Browsers in private storage mode can refuse localStorage; the live
      // Generic Viewer still retains its current page while it remains open.
    }
  }, [productId]);

  const reportActivePage = useCallback((page: number) => {
    if (activeEntry) savePage(activeEntry.id, page);
  }, [activeEntry, savePage]);
  const activePage = activeEntry
    ? pagePositions[activeEntry.id] || pageFromStorage(productId, activeEntry.id)
    : 1;

  return (
    <section className="relative h-full min-h-0 overflow-hidden bg-slate-950 text-white" aria-label="Read library" data-course-read-panel>
      {/* Keep the searchable library mounted behind the reader. Its query and
          scroll position survive opening a PDF and returning with Back. */}
      <div className={`flex h-full min-h-0 flex-col ${activeEntry ? "hidden" : ""}`} aria-hidden={Boolean(activeEntry)} data-course-read-library>
        <div className="shrink-0 border-b border-white/10 px-3 pb-3 pt-3 sm:px-4">
          <div className="mb-2 flex items-center gap-2">
            <BookOpenText size={17} className="shrink-0 text-violet-300" aria-hidden="true" />
            <h2 className="text-sm font-bold text-white">Read library</h2>
            <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-slate-300" aria-label={`${entries.length} resources`}>
              {entries.length}
            </span>
          </div>
          <label className="sr-only" htmlFor="course-read-search">Search Read resources</label>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="course-read-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles or modules…"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-9 pr-10 text-sm text-white outline-none placeholder:text-slate-500 focus:border-violet-400/70 focus:ring-2 focus:ring-violet-400/20"
              data-course-read-search
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:px-4" data-course-read-list>
          {filteredEntries.length === 0 ? (
            <div className="grid min-h-40 place-items-center px-5 text-center" role="status" data-course-read-empty>
              <div>
                <FileText size={25} className="mx-auto mb-2 text-slate-500" aria-hidden="true" />
                <p className="text-xs font-semibold text-slate-300">
                  {entries.length === 0 ? "No Read resources are available in your unlocked modules." : "No resources match this search."}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">Read resources are available here when your course access allows them.</p>
              </div>
            </div>
          ) : (
            <ul className="space-y-2" aria-label="Available Read resources">
              {filteredEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setActiveEntryId(entry.id)}
                    className="group flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3 text-left transition hover:border-violet-300/40 hover:bg-violet-400/[0.09] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    data-course-read-open={entry.id}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-200" aria-hidden="true">
                      {entry.presentation.kind === "pdfjs" ? <FileText size={19} /> : <ExternalLink size={18} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-bold text-white">{entry.resource.name || "Untitled reading"}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-400">{entry.modulePath.join(" / ")}</span>
                      <span className="mt-1 block truncate text-[10px] font-medium text-violet-200/90">
                        {entry.resource.readFileName || entry.presentation.label}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-slate-400 group-hover:text-violet-200">
                      {entry.presentation.kind === "pdfjs" ? "Read PDF" : "Open"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className={`absolute inset-0 flex min-h-0 flex-col bg-slate-950 ${activeEntry ? "" : "hidden"}`} aria-hidden={!activeEntry} data-course-read-reader>
        {activeEntry ? (
          <>
            <div className="z-10 flex shrink-0 items-center gap-2 border-b border-white/10 bg-slate-950/95 px-3 py-2 sm:px-4">
              <button
                type="button"
                onClick={() => setActiveEntryId(null)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-semibold text-white hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                aria-label="Back to Read library"
                data-course-read-back
              >
                <ArrowLeft size={15} aria-hidden="true" />
                <span>Library</span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-white">{activeEntry.resource.name || "Reading"}</p>
                <p className="truncate text-[10px] text-slate-400">{activeEntry.modulePath.join(" / ")}</p>
              </div>
              <span className="hidden shrink-0 rounded-full bg-white/[0.06] px-2 py-1 text-[9px] font-semibold text-slate-300 sm:inline-flex">
                {activeEntry.presentation.label}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden" data-course-read-document>
              {activeEntry.presentation.kind === "pdfjs" ? (
                <PdfJsGenericViewer
                  key={activeEntry.id}
                  src={activeEntry.presentation.sourceUrl}
                  title={activeEntry.resource.name || "Read PDF"}
                  productId={productId}
                  resourceId={activeEntry.id}
                  initialPage={activePage}
                  onPageChange={reportActivePage}
                />
              ) : (
                <iframe
                  title={`${activeEntry.resource.name || "Read resource"} — embedded webpage`}
                  src={activeEntry.presentation.sourceUrl}
                  className="h-full w-full border-0 bg-white"
                  sandbox="allow-scripts allow-forms allow-popups allow-downloads"
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  data-course-read-embed
                />
              )}
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
