// src/nature3d/boards/SanctuaryModuleMenu.tsx
//
// The tray's Module button dropdown. Create a URL / file module of any type
// the Study Library accepts, list the ones already built, play them in the
// dedicated Course Player, or open them on the reading board.

import { useMemo, useRef, useState } from "react";
import {
  BookOpen, Layers3, Link2, LoaderCircle, Lock, Play, Plus, Upload, X,
} from "lucide-react";
import type { MyCourse } from "../../types/myCourse";
import {
  createSanctuaryModule,
  inferSanctuaryModuleType,
  SANCTUARY_MODULE_TYPES,
  sanctuaryModuleType,
  type SanctuaryModuleType,
} from "./sanctuaryModules";
import MyCourseBrainEditor from "../../personal-library/MyCourseBrainEditor";
import { createMyQuestion } from "../../lib/myCourseClient";
import type { MyCourseQuestion } from "../../types/myCourse";

interface SanctuaryModuleMenuProps {
  uid: string | null;
  courses: MyCourse[];
  loading?: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  /** Fly to the reading board and select this course's library card. */
  onOpenOnBoard: (course: MyCourse) => void;
  /** Open the dedicated Course Player for this module. */
  onPlay: (course: MyCourse) => void;
  onCreated: (course: MyCourse) => void;
  /** When true, hide the trigger button — used when the trigger lives inside GlassDock */
  hideTrigger?: boolean;
}

export default function SanctuaryModuleMenu({
  uid, courses, loading, open, onToggle, onClose, onOpenOnBoard, onPlay, onCreated, hideTrigger = false,
}: SanctuaryModuleMenuProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<SanctuaryModuleType>("youtube");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const option = sanctuaryModuleType(type);

  const MAX_BYTES = 80 * 1024 * 1024;
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // Brain — full editor parity with My Study Library (MyCourseBrainEditor)
  const [brainTitle, setBrainTitle] = useState("");
  const [brainQuestions, setBrainQuestions] = useState<MyCourseQuestion[]>(() => [
    { ...createMyQuestion(), prompt: "Question 1", options: ["Option A", "Option B", "Option C", "Option D"], correctIndex: 0 },
  ]);

  const sorted = useMemo(
    () => [...courses].sort((a, b) => b.updatedAt - a.updatedAt),
    [courses],
  );

  const resetForm = () => {
    setTitle("");
    setUrl("");
    setFile(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
    setBrainTitle("");
    setBrainQuestions([
      { ...createMyQuestion(), prompt: "Question 1", options: ["Option A", "Option B", "Option C", "Option D"], correctIndex: 0 },
    ]);
  };

  const submit = async () => {
    if (!uid) {
      setError("Sign in to create a module.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const course = await createSanctuaryModule({
        uid,
        title: title.trim() || file?.name?.replace(/\.[^.]+$/, "") || brainTitle.trim() || "Untitled module",
        type,
        url,
        file,
        ...(type === "brain"
          ? { practiceTitle: brainTitle.trim() || title.trim() || "Practice set", practiceQuestions: brainQuestions }
          : {}),
      });
      resetForm();
      onCreated(course);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The module could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" data-sanctuary-module-menu>
      {!hideTrigger ? (
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? "Close modules" : "My modules"}
        title="My modules — create a URL or file, then play it"
        onClick={onToggle}
        className={`flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-xl border transition ${
          open
            ? "border-violet-300/70 bg-violet-500/30 text-white shadow-[0_0_24px_rgba(139,92,246,0.45)]"
            : "border-white/22 bg-slate-950/55 text-white/85 hover:bg-white/15"
        }`}
      >
        <Layers3 className="h-4 w-4" />
        <span className="text-[8px] font-bold leading-none tracking-wide">Module</span>
      </button>
      ) : null}

      {open ? (
        <>
          <div className="fixed inset-0 z-40 cursor-default" onClick={onClose} />
          <div
            data-sanctuary-module-panel
            className={`absolute bottom-full right-0 z-50 mb-2 overflow-hidden rounded-2xl border border-white/20 bg-slate-950/90 shadow-[0_24px_80px_-20px_rgba(0,0,0,0.85)] backdrop-blur-xl ${
              type === "brain" ? "w-[min(36rem,calc(100vw-1rem))]" : "w-[min(22.5rem,calc(100vw-1.5rem))]"
            }`}
          >
            <header className="flex items-center gap-3 border-b border-white/10 px-3.5 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-tr from-violet-500 via-indigo-500 to-emerald-400 text-white shadow-lg shadow-violet-500/30">
                <Layers3 className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-black tracking-tight text-white">My modules</p>
                <p className="truncate text-[11px] text-white/55">
                  URL, file or Brain MCQ · plays on the board (3D)
                </p>
              </div>
              <button
                type="button"
                aria-label="Close modules"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-lg text-white/55 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="max-h-[min(28rem,calc(100vh-10rem))] overflow-y-auto p-3">
              {!uid ? (
                <div className="grid place-items-center rounded-xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center">
                  <Lock className="h-6 w-6 text-white/35" />
                  <p className="mt-2 text-[12px] font-bold text-white/70">Sign in to create modules</p>
                </div>
              ) : (
                <form
                  data-sanctuary-module-create
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                  className="space-y-3"
                >
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
                      Module name
                    </span>
                    <input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder="e.g. Organic chemistry notes"
                      maxLength={120}
                      className="h-10 w-full rounded-xl border border-white/12 bg-black/30 px-3 text-[13px] font-semibold text-white outline-none placeholder:text-white/30 focus:border-violet-400/70"
                    />
                  </label>

                  <div>
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
                      File type
                    </span>
                    <div className="grid grid-cols-4 gap-1">
                      {SANCTUARY_MODULE_TYPES.map((entry) => {
                        const Icon = entry.icon;
                        const active = type === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            title={entry.hint}
                            onClick={() => {
                              setType(entry.id);
                              setFile(null);
                              if (fileRef.current) fileRef.current.value = "";
                            }}
                            className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[9px] font-bold transition ${
                              active
                                ? "bg-violet-500/30 text-white ring-1 ring-violet-300/60"
                                : "bg-white/[0.04] text-white/65 hover:bg-white/10 hover:text-white"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {entry.short}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1.5 text-[10px] font-medium text-white/40">{option.hint}</p>
                  </div>

                  {option.id !== "brain" ? (
                    <div className="space-y-1.5">
                      <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
                        {option.upload ? "Link or file" : "URL"}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/12 bg-black/30 text-white/45">
                          <Link2 className="h-4 w-4" />
                        </span>
                        <input
                          value={url}
                          onChange={(event) => {
                            const next = event.target.value;
                            setUrl(next);
                            if (next.trim()) {
                              setType(inferSanctuaryModuleType(next, file));
                            }
                          }}
                          placeholder={option.needsUrl ? "https://…" : "Optional link"}
                          inputMode="url"
                          className="h-10 min-w-0 flex-1 rounded-xl border border-white/12 bg-black/30 px-3 text-[12px] font-semibold text-white outline-none placeholder:text-white/30 focus:border-violet-400/70"
                        />
                      </div>
                      {option.upload ? (
                        <div className="space-y-2">
                          <input
                            ref={fileRef}
                            type="file"
                            accept={option.accept}
                            className="hidden"
                            onChange={(event) => {
                              const next = event.target.files?.[0] || null;
                              event.currentTarget.value = "";
                              if (!next) return;
                              if (next.size > MAX_BYTES) {
                                setError(`File too large — ${formatSize(next.size)}. Max ${formatSize(MAX_BYTES)}.`);
                                return;
                              }
                              setError(null);
                              setFile(next);
                              setType(inferSanctuaryModuleType(url, next));
                              if (!title.trim()) {
                                setTitle(next.name.replace(/\.[^.]+$/, "").slice(0, 120));
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 bg-white/[0.04] px-3 text-[11px] font-bold text-white/75 hover:border-violet-400/50 hover:bg-violet-500/10"
                          >
                            <Upload className="h-3.5 w-3.5" />
                            {file ? `Change file — ${file.name}` : `Upload a file${option.accept?.includes("pdf") ? " (PDF, up to 80MB)" : ""}`}
                          </button>
                          {file ? (
                            <div className="flex items-center gap-2 rounded-xl border border-violet-300/20 bg-violet-500/10 px-3 py-2">
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[11px] font-black text-white">{file.name}</p>
                                <p className="text-[10px] font-medium text-white/50">{formatSize(file.size)} · {file.type || "file"} · will be saved with name & size like My Study Library</p>
                              </div>
                              <button
                                type="button"
                                aria-label="Clear file"
                                onClick={() => {
                                  setFile(null);
                                  if (fileRef.current) fileRef.current.value = "";
                                }}
                                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-white/70 hover:bg-white/15"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-xl border border-violet-400/20 bg-violet-500/[0.06] p-2">
                      <p className="text-[10px] font-black uppercase tracking-wide text-violet-200">Brain · practice set — same as My Study Library</p>
                      <MyCourseBrainEditor
                        questions={brainQuestions}
                        title={brainTitle}
                        onChange={({ questions, title: nextTitle }) => {
                          setBrainQuestions(questions);
                          setBrainTitle(nextTitle);
                          if (!title.trim() && nextTitle.trim()) setTitle(nextTitle.trim());
                        }}
                      />
                    </div>
                  )}

                  {error ? (
                    <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-[11px] font-bold text-rose-200">{error}</p>
                  ) : null}

                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-500 text-[12px] font-black text-white shadow-[0_10px_24px_-10px_rgba(124,92,255,0.9)] transition hover:brightness-110 disabled:opacity-60"
                  >
                    {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {busy ? "Creating…" : "Create module"}
                  </button>
                </form>
              )}

              <section className="mt-4" data-sanctuary-module-library>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">
                    On the reading board
                  </p>
                  <span className="text-[10px] font-bold text-white/35">{sorted.length}</span>
                </div>
                {loading && sorted.length === 0 ? (
                  <p className="px-1 py-3 text-[11px] font-medium text-white/45">Loading your modules…</p>
                ) : sorted.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/12 px-3 py-5 text-center">
                    <BookOpen className="mx-auto h-5 w-5 text-white/30" />
                    <p className="mt-1.5 text-[11px] font-bold text-white/50">Nothing here yet</p>
                    <p className="mt-0.5 text-[10px] text-white/35">Create one above — it appears on the Read board.</p>
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {sorted.map((course) => {
                      const resource = course.modules[0]?.resources[0];
                      const kind = resource ? sanctuaryModuleType(resource.type).short : "Module";
                      return (
                        <li
                          key={course.id}
                          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2"
                        >
                          <button
                            type="button"
                            onClick={() => onOpenOnBoard(course)}
                            className="min-w-0 flex-1 text-left"
                            title="Open on the reading board"
                          >
                            <p className="truncate text-[12px] font-black text-white">{course.title || "Untitled"}</p>
                            <p className="truncate text-[10px] font-medium text-white/45">{kind}</p>
                          </button>
                          <button
                            type="button"
                            aria-label={`Play ${course.title || "module"} on board`}
                            title="Play on Board (3D)"
                            onClick={() => onPlay(course)}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-violet-500/25 text-violet-100 ring-1 ring-violet-300/40 hover:bg-violet-500/40"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
