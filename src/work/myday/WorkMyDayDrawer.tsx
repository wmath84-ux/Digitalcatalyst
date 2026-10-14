import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, FileText, Folder, FolderPlus, Home, NotebookPen, Plus, X } from "lucide-react";
import type { WorkMyDayItem, WorkMyDayNotebook } from "../storage/workMyDay";
import type { WorkTheme } from "../storage/workPrefs";

export default function WorkMyDayDrawer({
  theme,
  open,
  items,
  notebooks,
  selectedNotebookId,
  onClose,
  onSelectNotebook,
  onOpenItem,
  onCreateNote,
  onCreateNotebook,
  onExit,
}: {
  theme: WorkTheme;
  open: boolean;
  items: WorkMyDayItem[];
  notebooks: WorkMyDayNotebook[];
  selectedNotebookId: string | null;
  onClose: () => void;
  onSelectNotebook: (id: string | null) => void;
  onOpenItem: (id: string) => void;
  onCreateNote: () => void;
  onCreateNotebook: (title: string) => void;
  onExit: () => void;
}) {
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, onClose]);

  const createFolder = () => {
    const title = folderName.trim();
    if (!title) return;
    onCreateNotebook(title);
    setFolderName("");
    setAddingFolder(false);
  };

  const drawer = (
    <div data-work-shell="" data-work-theme={theme} style={{ display: "contents" }}>
      <div className={`work-myday-drawer-layer${open ? " is-open" : ""}`} data-work-myday-drawer="" aria-hidden={!open}>
      <button className="work-myday-drawer-scrim" type="button" aria-label="Close My Day drawer" onClick={onClose} tabIndex={open ? 0 : -1} />
      <aside ref={dialogRef} className="work-myday-drawer" role="dialog" aria-modal="true" aria-label="My Day notebooks and notes" data-open={open ? "true" : "false"}>
        <header className="work-myday-drawer-header">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[var(--text-tertiary)]">Work library</p>
            <h2 className="truncate text-sm font-bold text-[var(--text-primary)]">My Day</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="work-myday-icon-button" aria-label="Close drawer" onClick={onClose}>
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="work-myday-drawer-count">{notebooks.length} {notebooks.length === 1 ? "notebook" : "notebooks"} · {items.length} {items.length === 1 ? "item" : "items"}</div>
        <div className="work-myday-drawer-list" data-no-swipe="">
          <button
            type="button"
            className={`work-myday-drawer-row${selectedNotebookId === null ? " is-active" : ""}`}
            onClick={() => { onSelectNotebook(null); onClose(); }}
          >
            <Folder size={17} aria-hidden="true" />
            <span>All items</span>
            <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">{items.length}</span>
          </button>
          {notebooks.map((notebook) => {
            const count = items.filter((item) => item.notebookId === notebook.id).length;
            return (
              <button
                type="button"
                key={notebook.id}
                className={`work-myday-drawer-row${selectedNotebookId === notebook.id ? " is-active" : ""}`}
                style={{ paddingLeft: notebook.parentId ? 30 : 16 }}
                onClick={() => { onSelectNotebook(notebook.id); onClose(); }}
              >
                <Folder size={17} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{notebook.title}</span>
                <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">{count}</span>
              </button>
            );
          })}
          {addingFolder ? (
            <form className="work-myday-folder-form" onSubmit={(event) => { event.preventDefault(); createFolder(); }}>
              <input
                autoFocus
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                aria-label="Notebook name"
                placeholder="Notebook name"
                maxLength={200}
              />
              <button type="submit" aria-label="Create notebook" disabled={!folderName.trim()}><Plus size={15} /></button>
            </form>
          ) : null}
          <div className="work-myday-drawer-subhead">Recent items</div>
          {items.slice(0, 100).map((item) => (
            <button type="button" key={item.id} className="work-myday-drawer-row work-myday-drawer-item" onClick={() => onOpenItem(item.id)}>
              <FileText size={16} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{item.title.trim() || "Untitled"}</span>
              <span className="text-[9px] capitalize text-[var(--text-tertiary)]">{item.kind}</span>
            </button>
          ))}
          {items.length === 0 ? <p className="px-4 py-5 text-xs text-[var(--text-tertiary)]">Your saved items will appear here.</p> : null}
        </div>
        <footer className="work-myday-drawer-footer">
          <button type="button" className="work-myday-drawer-primary" onClick={onCreateNote}>
            <NotebookPen size={15} aria-hidden="true" /> New note
          </button>
          <button type="button" className="work-myday-icon-button" aria-label="New notebook" title="New notebook" onClick={() => setAddingFolder(true)}>
            <FolderPlus size={17} aria-hidden="true" />
          </button>
          <button type="button" className="work-myday-icon-button" aria-label="Leave Work and open Home" title="Home" onClick={onExit}>
            <Home size={17} aria-hidden="true" />
          </button>
          <button type="button" className="work-myday-icon-button" aria-label="Back to My Day" title="Back" onClick={onClose}>
            <ArrowLeft size={17} aria-hidden="true" />
          </button>
        </footer>
      </aside>
      </div>
    </div>
  );
  return typeof document === "undefined" ? drawer : createPortal(drawer, document.body);
}
