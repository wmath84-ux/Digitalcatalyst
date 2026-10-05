/**
 * Browser / Capacitor replacements for the Tauri desktop APIs.
 * ============================================================
 *
 * Recall is a desktop (Tauri) app: it reads and writes real files, keeps its
 * SQLite database in the OS app-data directory, arms native notifications and
 * checks a Tauri updater. Digitalcatalyst Revision runs in the browser, in the
 * Android WebView (Capacitor) and as an installed PWA, so every one of those
 * capabilities needs a web equivalent.
 *
 * The vendored Recall code already branches on `isTauriRuntime()` and — where
 * upstream wrote a browser path — takes it. What is left are the desktop-only
 * branches: `vite.config.ts` and `tsconfig.json` alias the eight
 * `@tauri-apps/*` specifiers to this module, so instead of a `MODULE_NOT_FOUND`
 * at build time the ported code calls a working browser implementation.
 *
 * What each API maps to
 *   open/save/message (dialog)  → <input type=file>, browser download, DOM toast
 *   read/write/exists/mkdir/... → an in-memory virtual FS plus the picked File
 *                                 handles, so a round trip (pick → read) works
 *   appDataDir/join/basename    → a virtual `recall-appdata` root
 *   convertFileSrc              → object URL for a picked file
 *   invoke                      → only the commands with a real meaning here
 *   listen                      → no-op subscription (nothing emits desktop events)
 *   check (updater)             → null: the app updates through the store / SW
 *   Database (plugin-sql)       → throws: the feature persists through
 *                                 `integrations/dcxRepository.ts` (IndexedDB),
 *                                 never through SQLite, in a web runtime
 *
 * Design rule: NOTHING here may block a study session. Every unsupported
 * command fails with an explicit, actionable message so the caller's existing
 * `catch` shows the learner something truthful rather than a silent no-op.
 */

import { putMediaFile } from "../../engine/media";

/* ------------------------------------------------------------------ */
/* Virtual file system                                                 */
/* ------------------------------------------------------------------ */

/** Files the app wrote (or a directory the learner picked). */
const virtualFiles = new Map<string, string | Uint8Array>();
const virtualDirs = new Set<string>();

/** Files the learner selected, keyed by the pseudo path handed back by `open()`. */
const pickedFiles = new Map<string, File>();

let pickSequence = 0;

function pseudoPath(file: File): string {
  pickSequence += 1;
  return `picked/${pickSequence}-${file.name}`;
}

function normalise(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function join(...parts: string[]): Promise<string> {
  const joined = parts
    .filter((part) => part !== undefined && part !== null && part !== "")
    .map((part) => normalise(String(part)).replace(/^\/+|\/+$/g, ""))
    .join("/");
  return Promise.resolve(joined);
}

export function basename(path: string): Promise<string> {
  const clean = normalise(path);
  return Promise.resolve(clean.slice(clean.lastIndexOf("/") + 1));
}

export function dirname(path: string): Promise<string> {
  const clean = normalise(path);
  const index = clean.lastIndexOf("/");
  return Promise.resolve(index <= 0 ? "" : clean.slice(0, index));
}

export function appDataDir(): Promise<string> {
  return Promise.resolve("recall-appdata");
}

/* ------------------------------------------------------------------ */
/* Dialog plugin                                                       */
/* ------------------------------------------------------------------ */

export interface OpenDialogOptions {
  multiple?: boolean;
  directory?: boolean;
  defaultPath?: string;
  /** Dialog caption. Accepted for API parity; browsers use the file picker's. */
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

function acceptFor(filters: OpenDialogOptions["filters"]): string | undefined {
  if (!filters?.length) return undefined;
  return filters
    .flatMap((filter) => filter.extensions)
    .map((extension) => `.${extension.replace(/^\./, "")}`)
    .join(",");
}

/**
 * The browser's file picker.
 *
 * Resolves to a path-like string (or an array when `multiple` is set) — the
 * same shape Tauri returns — and remembers the underlying `File` so a later
 * `readTextFile` / `readFile` / `convertFileSrc` call works on it.
 *
 * A DIRECTORY picker (`directory: true`) is the folder-sync feature. Browsers
 * only expose that through the File System Access API, and only on a secure
 * origin: when it is missing we reject with an explanation instead of returning
 * a path that could never be read.
 */
export function open(options: OpenDialogOptions & { multiple: true }): Promise<string[] | null>;
export function open(options?: OpenDialogOptions & { multiple?: false }): Promise<string | null>;
export function open(options?: OpenDialogOptions): Promise<string | string[] | null>;
export async function open(options: OpenDialogOptions = {}): Promise<string | string[] | null> {
  if (typeof document === "undefined") return null;

  if (options.directory) {
    const picker = (window as unknown as {
      showDirectoryPicker?: (init?: { mode?: string }) => Promise<{ name: string }>;
    }).showDirectoryPicker;
    if (!picker) {
      throw new Error(
        "Folder pickers are not available in this browser. Digitalcatalyst keeps Revision data in Firebase and on the device, so folder sync is not needed.",
      );
    }
    const directory = await picker({ mode: "readwrite" });
    const path = `picked-dir/${directory.name}`;
    virtualDirs.add(path);
    return path;
  }

  const files = await pickFiles(options.filters, Boolean(options.multiple));
  if (files.length === 0) return null;
  const paths = files.map((file) => {
    const path = pseudoPath(file);
    pickedFiles.set(path, file);
    return path;
  });
  return options.multiple ? paths : paths[0];
}

function pickFiles(
  filters: OpenDialogOptions["filters"],
  multiple: boolean,
): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    const accept = acceptFor(filters);
    if (accept) input.accept = accept;
    input.style.display = "none";
    // Safari/iOS need the input in the document for the picker to open.
    document.body.appendChild(input);

    let settled = false;
    const finish = (files: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };

    input.addEventListener("change", () => finish(input.files ? Array.from(input.files) : []));
    // `cancel` is not universally supported; the window focus fallback below
    // resolves the promise when the learner dismisses the picker.
    window.addEventListener(
      "focus",
      () => {
        setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) finish([]);
        }, 600);
      },
      { once: true },
    );

    input.click();
  });
}

export interface SaveDialogOptions {
  defaultPath?: string;
  /** Dialog caption. Accepted for API parity. */
  title?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

/**
 * The "save as" dialog.
 *
 * A browser cannot choose a destination path without the File System Access
 * API, so the returned token is a marker meaning "download this when written".
 * `writeTextFile` / `writeFile` honour it by handing the browser a normal
 * download — the file the learner gets is the file they asked to save, it just
 * lands in the Downloads folder.
 */
export async function save(options: SaveDialogOptions = {}): Promise<string | null> {
  const name = options.defaultPath?.split(/[/\\]/).pop() || "download";
  return `download:${name}`;
}

/** Modal message. Rendered inside the Revision root rather than a browser dialog. */
export async function message(
  text: string,
  options: { title?: string; kind?: "info" | "warning" | "error" } = {},
): Promise<void> {
  showDomToast(options.title ?? "Revision", text, options.kind ?? "info");
}

function showDomToast(title: string, body: string, kind: "info" | "warning" | "error"): void {
  if (typeof document === "undefined") return;
  const root =
    document.querySelector<HTMLElement>("[data-recall-root]") ?? document.body;
  const node = document.createElement("div");
  node.setAttribute("role", "status");
  node.dataset.recallToast = kind;
  node.textContent = `${title}: ${body}`;
  node.style.cssText = [
    "position:fixed",
    "left:50%",
    "bottom:24px",
    "transform:translateX(-50%)",
    "max-width:min(90vw,26rem)",
    "padding:12px 16px",
    "border-radius:16px",
    "font:500 14px/1.5 system-ui,sans-serif",
    "z-index:2147483000",
    "box-shadow:0 18px 40px rgba(0,0,0,.35)",
    kind === "error" ? "background:#7f1d1d;color:#fee2e2" : "background:#18181b;color:#fafafa",
  ].join(";");
  root.appendChild(node);
  setTimeout(() => node.remove(), 6000);
}

/* ------------------------------------------------------------------ */
/* FS plugin                                                           */
/* ------------------------------------------------------------------ */

async function resolveReadable(path: string): Promise<string | Uint8Array> {
  const clean = normalise(path);
  const picked = pickedFiles.get(clean);
  if (picked) return new Uint8Array(await picked.arrayBuffer());
  const stored = virtualFiles.get(clean);
  if (stored !== undefined) return stored;
  // A path inside a picked directory we cannot enumerate.
  throw new Error(`Cannot read "${clean}" in the browser.`);
}

export interface FsReadOptions {
  /** Reserved for API parity with the Tauri plugin (unused in the browser). */
  baseDir?: unknown;
  signal?: unknown;
}

export interface FsWriteOptions {
  baseDir?: unknown;
  append?: boolean;
  create?: boolean;
  recursive?: boolean;
  signal?: unknown;
}

export async function readFile(path: string, _options?: FsReadOptions): Promise<Uint8Array> {
  const value = await resolveReadable(path);
  return typeof value === "string" ? new TextEncoder().encode(value) : value;
}

export async function readTextFile(path: string, _options?: FsReadOptions): Promise<string> {
  const value = await resolveReadable(path);
  return typeof value === "string" ? value : new TextDecoder().decode(value);
}

export async function exists(path: string): Promise<boolean> {
  const clean = normalise(path);
  return virtualFiles.has(clean) || virtualDirs.has(clean) || pickedFiles.has(clean);
}

export async function mkdir(path: string, _options?: FsWriteOptions): Promise<void> {
  virtualDirs.add(normalise(path));
}

export async function writeTextFile(
  path: string,
  contents: string,
  options?: FsWriteOptions,
): Promise<void> {
  await writeAny(path, contents, options);
}

export async function writeFile(
  path: string,
  contents: Uint8Array,
  options?: FsWriteOptions,
): Promise<void> {
  await writeAny(path, contents, options);
}

export async function copyFile(source: string, destination: string): Promise<void> {
  const value = await resolveReadable(source);
  virtualFiles.set(normalise(destination), value);
}

export async function remove(path: string): Promise<void> {
  const clean = normalise(path);
  virtualFiles.delete(clean);
  virtualDirs.delete(clean);
}

async function writeAny(
  path: string,
  contents: string | Uint8Array,
  options?: FsWriteOptions,
): Promise<void> {
  const clean = normalise(path);
  if (clean.startsWith("download:")) {
    triggerDownload(clean.slice("download:".length), contents);
    return;
  }
  if (options?.append) {
    const previous = virtualFiles.get(clean);
    const head = previous === undefined ? "" : typeof previous === "string" ? previous : new TextDecoder().decode(previous);
    const tail = typeof contents === "string" ? contents : new TextDecoder().decode(contents);
    virtualFiles.set(clean, head + tail);
    return;
  }
  virtualFiles.set(clean, contents);
}

/** Hand the bytes to the browser as a normal download. */
function triggerDownload(name: string, contents: string | Uint8Array): void {
  if (typeof document === "undefined") return;
  const safeName = name.split(/[/\\]/).pop() || "download";
  const isJson = safeName.toLowerCase().endsWith(".json");
  const blob = new Blob(
    [typeof contents === "string" ? contents : (contents.slice().buffer as ArrayBuffer)],
    { type: isJson ? "application/json" : "application/octet-stream" },
  );
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* ------------------------------------------------------------------ */
/* Core plugin                                                         */
/* ------------------------------------------------------------------ */

/** Recall is never running inside Tauri in this app. */
export function isTauri(): boolean {
  return false;
}

export function convertFileSrc(path: string): string {
  const picked = pickedFiles.get(normalise(path));
  if (picked) return URL.createObjectURL(picked);
  return path;
}

/**
 * Tauri commands.
 *
 * The SQLite/atomic commands are unreachable here — Revision persists through
 * `engine/localDb.ts` (IndexedDB) and `integrations/dcxRepository.ts`, and
 * `db/client.ts` only asks for an executor when `isTauriRuntime()` is true. The
 * one command with a real browser meaning is the image copy used by the card
 * editor, which is routed into the feature's media store.
 */
export async function invoke<T = unknown>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  switch (command) {
    case "copy_image_to_recall": {
      const sourcePath = String(args.sourcePath ?? "");
      const file = pickedFiles.get(normalise(sourcePath));
      if (!file) throw new Error("That image could not be read.");
      const stored = await putMediaFile({ name: file.name, blob: file, mimeType: file.type });
      return stored.name as T;
    }
    case "parse_anki_apkg":
      throw new Error(
        "Anki .apkg files need the desktop build's SQLite reader. In the browser, export the deck from Anki as \"Notes in Plain Text\" and import that file instead — the importer reads Anki text exports directly.",
      );
    default:
      throw new Error(
        `"${command}" is only available in the desktop build. Digitalcatalyst Revision stores its data in IndexedDB and Firebase.`,
      );
  }
}

/* ------------------------------------------------------------------ */
/* Event plugin                                                        */
/* ------------------------------------------------------------------ */

type UnlistenFn = () => void;

/** Desktop-only events (the tray shortcut). Nothing emits them on the web. */
export async function listen(_event: string, _handler: (event: unknown) => void): Promise<UnlistenFn> {
  return () => undefined;
}

/* ------------------------------------------------------------------ */
/* Notification plugin                                                 */
/* ------------------------------------------------------------------ */

/**
 * Present so the ported module compiles. Revision delivers alerts through
 * `integrations/notificationBridge.ts` → the app's existing notification stack
 * (Android exact alarms, the in-app inbox, Firestore), never through a second
 * one.
 */
export function isPermissionGranted(): Promise<boolean> {
  return Promise.resolve(false);
}

export function requestPermission(): Promise<"granted" | "denied" | "default"> {
  return Promise.resolve("default");
}

export function sendNotification(): void {
  /* handled by notificationBridge */
}

/* ------------------------------------------------------------------ */
/* Updater plugin                                                      */
/* ------------------------------------------------------------------ */

export interface DownloadEvent {
  event: "Started" | "Progress" | "Finished";
  data: { contentLength: number; chunkLength: number };
}

export interface Update {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
  downloadAndInstall: (onEvent?: (event: DownloadEvent) => void) => Promise<void>;
}

/**
 * There is no Tauri updater in a web runtime: updates arrive through the
 * service worker / the Play Store. Returning `null` is what the ported Updates
 * section renders as "you are on the latest version".
 */
export async function check(): Promise<Update | null> {
  return null;
}

/* ------------------------------------------------------------------ */
/* SQL plugin                                                          */
/* ------------------------------------------------------------------ */

/**
 * `@tauri-apps/plugin-sql` replacement. Digitalcatalyst never opens SQLite in a
 * web runtime (`integrations/dcxRepository.ts` is registered as the repository
 * before the store initialises), so `load` fails loudly instead of pretending
 * to have a database.
 */
class BrowserDatabase {
  static async load(_path: string): Promise<BrowserDatabase> {
    throw new Error(
      "SQLite is only available in the desktop build. Digitalcatalyst Revision stores its data in IndexedDB and syncs through Firebase.",
    );
  }

  async execute(_sql: string, _params?: unknown[]): Promise<unknown> {
    throw new Error("No SQL executor in a web runtime.");
  }

  async select<T>(_sql: string, _params?: unknown[]): Promise<T> {
    throw new Error("No SQL executor in a web runtime.");
  }

  async close(): Promise<void> {
    /* nothing to close */
  }
}

export default BrowserDatabase;
export type { BrowserDatabase as Database };
export type TauriSqlDatabase = BrowserDatabase;
