"use client";

// Admin · Curriculum Builder — mobile-first.
//
// The class → subject → chapter → concept tree is the only data the AI
// question generator reads. Editing it used to be a single page with
// four levels of nested accordions that scrolled endlessly. The
// redesign keeps the same business logic (add class / paste / JSON
// import / save) but exposes a single focused view at a time:
//
//   • The top of the page is a small "navigation rail" — one pill
//     per class. The active class is filled, the rest are outlined.
//   • Tapping a class pill opens ONLY that class's card. The other
//     classes stay out of the way (they're summarised in the rail).
//   • Inside a class card, the same pattern repeats for subjects.
//   • And again for chapters. Concepts are always inline — the
//     smallest unit, with no further nesting.
//
// This is the "drill in, drill out" pattern: every level shows a
// summary of the items above it, but the user only ever edits one
// item in focus. Less scrolling, less "where am I in the tree?",
// and each level's bulk-add + paste + delete controls are right
// under the focus card so they never get lost in the body of
// the page.
//
// The component is UI/UX only: the data model, persistence and API
// calls are 1:1 with the previous editor. We import the same
// CurriculumClass types and re-use the same `uniqueKey` /
// `guessIcon` helpers (kept in the same file to avoid touching any
// other module).

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Field,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  inputClass,
  textareaClass,
} from "@/components/admin/ui";
import { useToast, useRevisionCatalog } from "@/components/admin/AdminProviders";
import { adminFetch } from "@/lib/admin/client";
import type { RevisionCatalog } from "@/revision/engine/catalogService";
import type {
  CurriculumClass,
  CurriculumSubject,
  CurriculumChapter,
  CurriculumTopic,
} from "@/revision/data/curriculum";
import {
  curriculumStats,
  currentAcademicYear,
  type PlanningCurriculum,
} from "@/revision/engine/curriculumCatalog";
import RevisionCurriculumSection from "@/admin/pages/RevisionCurriculumSection";
import { loadAdminAiConfig, type UserAiConfig } from "@/revision/engine/aiConfig";

/* ------------------------------------------------------------------ */
/* Helpers (kept here to avoid touching shared modules)                */
/* ------------------------------------------------------------------ */

const slug = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `item-${Math.random().toString(36).slice(2, 8)}`;

const SUBJECT_ICONS: Record<string, string> = {
  mathematics: "📐",
  maths: "📐",
  science: "🔬",
  physics: "⚛️",
  chemistry: "🧪",
  biology: "🧬",
  english: "📖",
  "social science": "🌏",
  "social studies": "🌏",
  history: "🏛️",
  geography: "🌍",
  civics: "⚖️",
  economics: "💹",
  "computer science": "💻",
  "computer applications": "💻",
  hindi: "📝",
};

function guessIcon(name: string): string {
  return SUBJECT_ICONS[name.toLowerCase().trim()] || "📘";
}

function uniqueKey(base: string, used: Set<string>): string {
  let key = slug(base);
  let n = 2;
  while (used.has(key)) {
    key = `${slug(base)}-${n}`;
    n += 1;
  }
  used.add(key);
  return key;
}

const parseBulkLines = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const parseBulkConcepts = (text: string): string[] => {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const concepts: string[] = [];
  for (const line of lines) {
    concepts.push(...line.split(",").map((p) => p.trim()).filter(Boolean));
  }
  return concepts;
};

/* ------------------------------------------------------------------ */
/* Mobile-first pill dropdown                                          */
/* ------------------------------------------------------------------ */

// A small mobile-friendly picker: renders as a horizontally-scrolling
// row of pills, with the active pill filled in. Tapping a pill makes
// it the focused item; the focused item's card opens below. Tapping
// the active pill again collapses it back to the rail. The
// "Add…" pill at the end opens a bottom sheet for the user to type
// a new name (single-item add) OR paste a list (bulk add).
interface PillRailProps<T> {
  /** Display label for the rail ("Classes", "Subjects", "Chapters"). */
  label: string;
  /** All items in this level. */
  items: T[];
  /** Map each item to a stable id (used as the React key). */
  keyOf: (item: T) => string;
  /** Map each item to its display label. */
  labelOf: (item: T) => string;
  /** Optional icon string prefix (e.g. "📚 "). */
  iconOf?: (item: T) => string | undefined;
  /** Currently focused item id, or null. */
  activeKey: string | null;
  /** Focus change handler. Tapping the active key passes `null` to collapse. */
  onSelect: (key: string | null) => void;
  /** Open the "add single / paste bulk" sheet. */
  onAdd: () => void;
  /** Optional "paste bulk" shortcut. */
  onPaste?: () => void;
  /** Total count shown after the label ("3 items"). */
  totalLabel?: string;
}

function PillRail<T>({
  label,
  items,
  keyOf,
  labelOf,
  iconOf,
  activeKey,
  onSelect,
  onAdd,
  onPaste,
  totalLabel,
}: PillRailProps<T>) {
  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white px-2 py-2"
      data-pill-rail
      data-pill-rail-label={label}
    >
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
            {label}
          </span>
          {totalLabel ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
              {totalLabel}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          {onPaste ? (
            <button
              type="button"
              onClick={onPaste}
              className="rounded-full bg-violet-100 px-2.5 py-1 text-[10px] font-bold text-violet-700 active:bg-violet-200"
              data-pill-action="paste"
            >
              📋 Paste
            </button>
          ) : null}
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white active:bg-indigo-700"
            data-pill-action="add"
          >
            + Add
          </button>
        </div>
      </div>
      <div
        className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1.5 pb-1 pt-0.5"
        data-pill-rail-scroll
      >
        {items.length === 0 ? (
          <span className="rounded-full bg-slate-50 px-3 py-1.5 text-[11px] text-slate-400">
            No {label.toLowerCase()} yet — use + Add to start.
          </span>
        ) : (
          items.map((item) => {
            const k = keyOf(item);
            const active = k === activeKey;
            const icon = iconOf?.(item) ?? "";
            return (
              <button
                key={k}
                type="button"
                onClick={() => onSelect(active ? null : k)}
                aria-pressed={active}
                data-pill-rail-pill
                data-pill-key={k}
                data-pill-active={active ? "true" : "false"}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${
                  active
                    ? "border-indigo-500 bg-indigo-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 active:bg-slate-100"
                }`}
              >
                {icon ? <span aria-hidden>{icon}</span> : null}
                <span className="max-w-[160px] truncate">{labelOf(item)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add / paste sheet                                                   */
/* ------------------------------------------------------------------ */

interface AddSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Placeholder for the bulk-paste textarea (single-line items). */
  bulkPlaceholder: string;
  /** Example text shown below the input. */
  hint: string;
  /** Single-item button label. */
  addLabel: string;
  /** Single-item handler. */
  onAddSingle: (rawName: string) => void;
  /** Bulk handler. */
  onAddBulk: (lines: string[]) => void;
  /** Optional autofill for the single-item field when the user lands on the sheet. */
  initialSingle?: string;
}

function AddSheet({
  open,
  onClose,
  title,
  bulkPlaceholder,
  hint,
  addLabel,
  onAddSingle,
  onAddBulk,
  initialSingle,
}: AddSheetProps) {
  const [single, setSingle] = useState("");
  const [bulk, setBulk] = useState("");
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setSingle(initialSingle ?? "");
    setBulk("");
    setMode("single");
    const id = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(id);
  }, [open, initialSingle]);

  if (!open) return null;

  const submitSingle = () => {
    const name = single.trim();
    if (!name) return;
    onAddSingle(name);
    onClose();
  };

  const submitBulk = () => {
    const lines = parseBulkLines(bulk);
    if (!lines.length) return;
    onAddBulk(lines);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      data-add-sheet
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-[480px] flex-col rounded-t-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="flex items-center gap-1 border-b border-slate-100 px-4 py-2">
          <button
            type="button"
            onClick={() => setMode("single")}
            data-sheet-mode="single"
            className={`h-9 flex-1 rounded-lg text-xs font-bold transition ${
              mode === "single"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 active:bg-slate-200"
            }`}
          >
            1 item
          </button>
          <button
            type="button"
            onClick={() => setMode("bulk")}
            data-sheet-mode="bulk"
            className={`h-9 flex-1 rounded-lg text-xs font-bold transition ${
              mode === "bulk"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 active:bg-slate-200"
            }`}
          >
            Paste list
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
          {mode === "single" ? (
            <div className="space-y-2">
              <Field label={addLabel} required>
                <input
                  ref={inputRef}
                  className={inputClass}
                  value={single}
                  onChange={(e) => setSingle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitSingle();
                    }
                  }}
                  placeholder="e.g. Class 10"
                />
              </Field>
              <p className="text-[11px] text-slate-500">{hint}</p>
              <PrimaryButton className="w-full" onClick={submitSingle} disabled={!single.trim()}>
                {addLabel}
              </PrimaryButton>
            </div>
          ) : (
            <div className="space-y-2">
              <Field label="Paste list — one item per line" hint={hint}>
                <textarea
                  className={`${textareaClass} min-h-[160px] font-mono text-xs`}
                  value={bulk}
                  onChange={(e) => setBulk(e.target.value)}
                  placeholder={bulkPlaceholder}
                />
              </Field>
              <p className="text-[11px] text-slate-500">
                Will add <span className="font-bold">{parseBulkLines(bulk).length || 0}</span>{" "}
                item(s).
              </p>
              <PrimaryButton className="w-full" onClick={submitBulk} disabled={!parseBulkLines(bulk).length}>
                Add {parseBulkLines(bulk).length || ""} item(s)
              </PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline editable row                                                 */
/* ------------------------------------------------------------------ */

function InlineEdit({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      className={`${inputClass} !h-9 !text-xs ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function CurriculumBuilderPage() {
  const { notify } = useToast();
  // The catalog is loaded once in the AdminProviders context, so
  // this page and the AI Configuration page always see the same
  // data. `setCatalog` is what `Save & publish` calls below to
  // mirror the new state for any other page that mounts after.
  const { catalog, error, loading, reload, setCatalog } = useRevisionCatalog();

  // The admin's own AI provider config (api key, model, etc.) —
  // re-read from localStorage on mount. This page used to live
  // inside `RevisionPage` which already kept this state; the split
  // means the curriculum builder has to read its own copy. The
  // engine helper `loadAdminAiConfig` is the same one
  // `RevisionPage` uses, so the value is always in sync.
  const [adminCfg] = useState<UserAiConfig>(() => loadAdminAiConfig());

  // Track which catalog the working copy was seeded from so the
  // `useEffect` below re-seeds the editor only when the published
  // curriculum actually changes (not on every catalog refresh).
  const lastSeededFrom = useRef<string | null>(null);

  const published = catalog?.planningCurriculum;

  // ── Working copy ────────────────────────────────────────────────
  // The editor is the source of truth while the admin is in this
  // page. The "Save & publish" call below writes it back to the
  // catalog. Identical behaviour to the previous editor — only the
  // UI has changed.
  const [classes, setClasses] = useState<CurriculumClass[]>(
    () => published?.classes ?? [],
  );
  const [board, setBoard] = useState(published?.board || "CBSE");
  const [yearLabel, setYearLabel] = useState(
    published?.yearLabel || currentAcademicYear(),
  );
  const [saving, setSaving] = useState(false);

  // ── Focus state ────────────────────────────────────────────────
  // The drill-down pattern: at any moment, at most one class is in
  // focus, at most one subject in that class is in focus, at most
  // one chapter in that subject is in focus. The focus IDs cascade:
  // when the class changes, the subject + chapter focus reset.
  const [activeClassKey, setActiveClassKey] = useState<string | null>(null);
  const [activeSubjectKey, setActiveSubjectKey] = useState<string | null>(null);
  const [activeChapterKey, setActiveChapterKey] = useState<string | null>(null);

  // ── Add / paste sheets ─────────────────────────────────────────
  const [sheet, setSheet] = useState<
    | { kind: "class" }
    | { kind: "subject"; classKey: string }
    | { kind: "chapter"; classKey: string; subjectKey: string }
    | null
  >(null);

  // ── JSON paste (one-shot, page-level) ──────────────────────────
  const [jsonPasteOpen, setJsonPasteOpen] = useState(false);
  const [jsonPasteText, setJsonPasteText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Seed the working copy from the published curriculum the first
  // time the catalog loads, and re-seed only when the
  // `updatedAt` stamp changes (i.e. the AI generator published a
  // draft, or the admin opened the page after another admin saved
  // something). The ref guard prevents the editor from being
  // clobbered by the in-memory `setCatalog` calls made by this
  // page itself.
  useEffect(() => {
    if (!catalog) return;
    const stamp = published?.updatedAt ?? null;
    if (lastSeededFrom.current === stamp) return;
    lastSeededFrom.current = stamp;
    setClasses(published?.classes ?? []);
    setBoard(published?.board || "CBSE");
    setYearLabel(published?.yearLabel || currentAcademicYear());
    if (published?.classes?.length) {
      setActiveClassKey(published.classes[0].key);
    }
    setActiveSubjectKey(null);
    setActiveChapterKey(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog?.planningCurriculum?.updatedAt]);

  // When the catalog's published curriculum changes (e.g. after the
  // AI generator publishes a draft), reset focus to the first
  // class so the admin lands on something concrete instead of a
  // collapsed tree.
  useEffect(() => {
    if (!activeClassKey && classes.length) {
      setActiveClassKey(classes[0].key);
    }
  }, [classes, activeClassKey]);

  // Cascade focus resets: picking a different class clears the
  // subject + chapter focus; picking a different subject clears the
  // chapter focus.
  useEffect(() => {
    setActiveSubjectKey(null);
    setActiveChapterKey(null);
  }, [activeClassKey]);
  useEffect(() => {
    setActiveChapterKey(null);
  }, [activeSubjectKey]);

  const stats = useMemo(() => curriculumStats(classes), [classes]);

  const activeClass = useMemo(
    () => classes.find((c) => c.key === activeClassKey) ?? null,
    [classes, activeClassKey],
  );
  const activeSubject = useMemo(
    () => activeClass?.subjects.find((s) => s.key === activeSubjectKey) ?? null,
    [activeClass, activeSubjectKey],
  );

  /* ---------------------------------------------------------------- */
  /* Mutations                                                        */
  /* ---------------------------------------------------------------- */

  const addClass = (name: string) => {
    const used = new Set(classes.map((c) => c.key));
    const key = uniqueKey(name, used);
    const icon = name.match(/11|12/i) ? "🎓" : name.match(/9|10/i) ? "📚" : "🎒";
    const newClass: CurriculumClass = { key, name, icon, subjects: [] };
    const next = [...classes, newClass];
    setClasses(next);
    setActiveClassKey(key);
  };

  const addBulkClasses = (lines: string[]) => {
    const used = new Set(classes.map((c) => c.key));
    const newClasses: CurriculumClass[] = lines.map((name) => ({
      key: uniqueKey(name, used),
      name,
      icon: name.match(/11|12/i) ? "🎓" : name.match(/9|10/i) ? "📚" : "🎒",
      subjects: [],
    }));
    setClasses([...classes, ...newClasses]);
    if (newClasses.length && !activeClassKey) setActiveClassKey(newClasses[0].key);
  };

  const updateClass = (next: CurriculumClass) => {
    setClasses((prev) => prev.map((c) => (c.key === next.key ? next : c)));
  };

  const deleteClass = (key: string) => {
    if (!window.confirm("Delete this class and all of its subjects, chapters and concepts?")) return;
    setClasses((prev) => prev.filter((c) => c.key !== key));
    if (activeClassKey === key) {
      setActiveClassKey(null);
      setActiveSubjectKey(null);
      setActiveChapterKey(null);
    }
  };

  const addSubject = (classKey: string, name: string) => {
    setClasses((prev) =>
      prev.map((c) => {
        if (c.key !== classKey) return c;
        const used = new Set(c.subjects.map((s) => s.key));
        const key = uniqueKey(name, used);
        const next: CurriculumSubject = { key, name, icon: guessIcon(name), chapters: [] };
        return { ...c, subjects: [...c.subjects, next] };
      }),
    );
    setActiveSubjectKey(uniqueKey(name, new Set()));
  };

  const addBulkSubjects = (classKey: string, lines: string[]) => {
    setClasses((prev) =>
      prev.map((c) => {
        if (c.key !== classKey) return c;
        const used = new Set(c.subjects.map((s) => s.key));
        const additions: CurriculumSubject[] = lines.map((name) => ({
          key: uniqueKey(name, used),
          name,
          icon: guessIcon(name),
          chapters: [],
        }));
        return { ...c, subjects: [...c.subjects, ...additions] };
      }),
    );
  };

  const updateSubject = (classKey: string, next: CurriculumSubject) => {
    setClasses((prev) =>
      prev.map((c) =>
        c.key !== classKey
          ? c
          : { ...c, subjects: c.subjects.map((s) => (s.key === next.key ? next : s)) },
      ),
    );
  };

  const deleteSubject = (classKey: string, key: string) => {
    if (!window.confirm("Delete this subject and all of its chapters + concepts?")) return;
    setClasses((prev) =>
      prev.map((c) =>
        c.key !== classKey
          ? c
          : { ...c, subjects: c.subjects.filter((s) => s.key !== key) },
      ),
    );
    if (activeSubjectKey === key) setActiveSubjectKey(null);
  };

  const addChapter = (classKey: string, subjectKey: string, name: string) => {
    setClasses((prev) =>
      prev.map((c) => {
        if (c.key !== classKey) return c;
        return {
          ...c,
          subjects: c.subjects.map((s) => {
            if (s.key !== subjectKey) return s;
            const used = new Set(s.chapters.map((ch) => ch.key));
            const key = uniqueKey(name, used);
            return {
              ...s,
              chapters: [...s.chapters, { key, name, topics: [] }],
            };
          }),
        };
      }),
    );
    setActiveChapterKey(uniqueKey(name, new Set()));
  };

  const addBulkChapters = (classKey: string, subjectKey: string, lines: string[]) => {
    setClasses((prev) =>
      prev.map((c) => {
        if (c.key !== classKey) return c;
        return {
          ...c,
          subjects: c.subjects.map((s) => {
            if (s.key !== subjectKey) return s;
            const used = new Set(s.chapters.map((ch) => ch.key));
            const additions: CurriculumChapter[] = lines.map((name) => ({
              key: uniqueKey(name, used),
              name,
              topics: [],
            }));
            return { ...s, chapters: [...s.chapters, ...additions] };
          }),
        };
      }),
    );
  };

  const updateChapter = (classKey: string, subjectKey: string, next: CurriculumChapter) => {
    setClasses((prev) =>
      prev.map((c) => {
        if (c.key !== classKey) return c;
        return {
          ...c,
          subjects: c.subjects.map((s) => {
            if (s.key !== subjectKey) return s;
            return {
              ...s,
              chapters: s.chapters.map((ch) => (ch.key === next.key ? next : ch)),
            };
          }),
        };
      }),
    );
  };

  const deleteChapter = (classKey: string, subjectKey: string, key: string) => {
    if (!window.confirm("Delete this chapter and all of its concepts?")) return;
    setClasses((prev) =>
      prev.map((c) => {
        if (c.key !== classKey) return c;
        return {
          ...c,
          subjects: c.subjects.map((s) => {
            if (s.key !== subjectKey) return s;
            return { ...s, chapters: s.chapters.filter((ch) => ch.key !== key) };
          }),
        };
      }),
    );
    if (activeChapterKey === key) setActiveChapterKey(null);
  };

  const addTopic = (classKey: string, subjectKey: string, chapterKey: string, name: string) => {
    setClasses((prev) =>
      prev.map((c) => {
        if (c.key !== classKey) return c;
        return {
          ...c,
          subjects: c.subjects.map((s) => {
            if (s.key !== subjectKey) return s;
            return {
              ...s,
              chapters: s.chapters.map((ch) => {
                if (ch.key !== chapterKey) return ch;
                const used = new Set(ch.topics.map((t) => t.key));
                const key = uniqueKey(name, used);
                return { ...ch, topics: [...ch.topics, { key, name }] };
              }),
            };
          }),
        };
      }),
    );
  };

  const addBulkTopics = (classKey: string, subjectKey: string, chapterKey: string, text: string) => {
    const names = parseBulkConcepts(text);
    if (!names.length) return;
    setClasses((prev) =>
      prev.map((c) => {
        if (c.key !== classKey) return c;
        return {
          ...c,
          subjects: c.subjects.map((s) => {
            if (s.key !== subjectKey) return s;
            return {
              ...s,
              chapters: s.chapters.map((ch) => {
                if (ch.key !== chapterKey) return ch;
                const used = new Set(ch.topics.map((t) => t.key));
                const additions: CurriculumTopic[] = names.map((name) => ({
                  key: uniqueKey(name, used),
                  name,
                }));
                return { ...ch, topics: [...ch.topics, ...additions] };
              }),
            };
          }),
        };
      }),
    );
  };

  const updateTopic = (classKey: string, subjectKey: string, chapterKey: string, next: CurriculumTopic, originalKey: string) => {
    setClasses((prev) =>
      prev.map((c) => {
        if (c.key !== classKey) return c;
        return {
          ...c,
          subjects: c.subjects.map((s) => {
            if (s.key !== subjectKey) return s;
            return {
              ...s,
              chapters: s.chapters.map((ch) => {
                if (ch.key !== chapterKey) return ch;
                return {
                  ...ch,
                  topics: ch.topics.map((t) => (t.key === originalKey ? next : t)),
                };
              }),
            };
          }),
        };
      }),
    );
  };

  const deleteTopic = (classKey: string, subjectKey: string, chapterKey: string, key: string) => {
    setClasses((prev) =>
      prev.map((c) => {
        if (c.key !== classKey) return c;
        return {
          ...c,
          subjects: c.subjects.map((s) => {
            if (s.key !== subjectKey) return s;
            return {
              ...s,
              chapters: s.chapters.map((ch) => {
                if (ch.key !== chapterKey) return ch;
                return { ...ch, topics: ch.topics.filter((t) => t.key !== key) };
              }),
            };
          }),
        };
      }),
    );
  };

  /* ---------------------------------------------------------------- */
  /* JSON paste                                                       */
  /* ---------------------------------------------------------------- */

  const handleJsonPaste = () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonPasteText);
      let arr: unknown[];
      if (Array.isArray(parsed)) {
        arr = parsed;
      } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { classes?: unknown[] }).classes)) {
        arr = (parsed as { classes: unknown[] }).classes;
      } else {
        throw new Error("Expected a JSON array of classes, or { \"classes\": [...] }");
      }

      const used = new Set(classes.map((c) => c.key));
      const imported: CurriculumClass[] = [];
      for (const raw of arr) {
        if (!raw || typeof raw !== "object") continue;
        const r = raw as Record<string, unknown>;
        const name = String(r.name ?? "").trim();
        if (!name) continue;
        const icon = String(r.icon ?? "🎒").slice(0, 4);

        const subjectsRaw = Array.isArray(r.subjects) ? r.subjects : [];
        const subjectKeys = new Set<string>();
        const subjects: CurriculumSubject[] = [];

        for (const sRaw of subjectsRaw) {
          if (!sRaw || typeof sRaw !== "object") continue;
          const s = sRaw as Record<string, unknown>;
          const sName = String(s.name ?? "").trim();
          if (!sName) continue;
          const sIcon = String(s.icon ?? guessIcon(sName)).slice(0, 4);

          const chaptersRaw = Array.isArray(s.chapters) ? s.chapters : [];
          const chapterKeys = new Set<string>();
          const chapters: CurriculumChapter[] = [];

          for (const cRaw of chaptersRaw) {
            if (!cRaw || typeof cRaw !== "object") continue;
            const c = cRaw as Record<string, unknown>;
            const cName = String(c.name ?? "").trim();
            if (!cName) continue;

            const topicsRaw = Array.isArray(c.topics) ? c.topics : Array.isArray(c.concepts) ? (c.concepts as unknown[]) : [];
            const topicKeys = new Set<string>();
            const topics: CurriculumTopic[] = [];

            for (const tRaw of topicsRaw) {
              const tName =
                typeof tRaw === "string"
                  ? tRaw.trim()
                  : String((tRaw as Record<string, unknown>)?.name ?? "").trim();
              if (!tName) continue;
              topics.push({ key: uniqueKey(tName, topicKeys), name: tName });
            }

            if (!topics.length) continue;
            chapters.push({ key: uniqueKey(cName, chapterKeys), name: cName, topics });
          }

          if (!chapters.length) continue;
          subjects.push({ key: uniqueKey(sName, subjectKeys), name: sName, icon: sIcon, chapters });
        }

        if (!subjects.length) continue;
        imported.push({ key: uniqueKey(name, used), name, icon, subjects });
      }

      if (!imported.length) throw new Error("No valid classes found in the pasted JSON.");

      setClasses([...classes, ...imported]);
      setJsonPasteText("");
      setJsonPasteOpen(false);
      if (!activeClassKey) setActiveClassKey(imported[0].key);
      notify("success", `Imported ${imported.length} class(es) from JSON.`);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON format.");
    }
  };

  /* ---------------------------------------------------------------- */
  /* Save & publish                                                   */
  /* ---------------------------------------------------------------- */

  const saveLive = async () => {
    const validClasses = classes.filter((c) => c.name.trim());
    if (!validClasses.length) {
      notify("error", "Add at least one class with a name.");
      return;
    }
    for (const cls of validClasses) {
      const validSubjects = cls.subjects.filter((s) => s.name.trim());
      if (!validSubjects.length) {
        notify("error", `${cls.name} has no subjects. Add at least one subject.`);
        return;
      }
    }
    const ok = window.confirm(
      "Replace the Class → Subject → Chapter → Concept lists students see on the revision planning page? Existing student tests are not deleted.",
    );
    if (!ok) return;

    const payload: PlanningCurriculum = {
      yearLabel: yearLabel.trim() || currentAcademicYear(),
      board: board.trim() || "CBSE",
      prompt: published?.prompt || "",
      updatedAt: new Date().toISOString(),
      classes: validClasses,
    };
    setSaving(true);
    try {
      if (!catalog) return;
      const next = { ...catalog, planningCurriculum: payload };
      const res = await adminFetch<{ catalog: RevisionCatalog }>("/api/admin/revision", {
        method: "POST",
        body: JSON.stringify(next),
      });
      setCatalog(res.catalog);
      notify("success", "Manual curriculum saved and published! Students now see this syllabus.");
    } catch (err) {
      notify("error", err instanceof Error ? err.message : "Failed to save curriculum.");
    } finally {
      setSaving(false);
    }
  };

  const loadFromPublished = () => {
    if (published?.classes?.length) {
      setClasses(JSON.parse(JSON.stringify(published.classes)));
      setBoard(published.board || "CBSE");
      setYearLabel(published.yearLabel || currentAcademicYear());
      setActiveClassKey(published.classes[0].key);
      setActiveSubjectKey(null);
      setActiveChapterKey(null);
      notify("success", "Loaded from currently published curriculum.");
    } else {
      notify("error", "No published curriculum to load from.");
    }
  };

  const clearAll = () => {
    if (!classes.length) return;
    const ok = window.confirm(
      "Clear all classes? This only clears the editor — the live published curriculum is unchanged until you save.",
    );
    if (ok) {
      setClasses([]);
      setActiveClassKey(null);
      setActiveSubjectKey(null);
      setActiveChapterKey(null);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  // The catalog is loaded once at the admin shell level. While it
  // is in flight we show a single loading chip; if it failed we
  // expose a retry button.
  if (loading && !catalog) {
    return (
      <div className="space-y-3 pb-6 lg:space-y-4">
        <LoadingState label="Loading curriculum…" />
      </div>
    );
  }
  if (error && !catalog) {
    return (
      <div className="space-y-3 pb-6 lg:space-y-4">
        <SectionCard title="Curriculum Builder">
          <p className="text-sm text-red-500">{error}</p>
          <PrimaryButton className="mt-3" onClick={reload}>Retry</PrimaryButton>
        </SectionCard>
      </div>
    );
  }
  if (!catalog) {
    return (
      <div className="space-y-3 pb-6 lg:space-y-4">
        <LoadingState label="Preparing editor…" />
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-6 lg:space-y-4">
      <SectionCard
        title="🧠 Curriculum Builder"
        description="Edit the Class → Subject → Chapter → Concept tree that drives the student AI question generator. Pick a class from the rail, drill into a subject, then a chapter — only the focused item is editable so nothing scrolls out of view."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Board">
            <input className={inputClass} value={board} onChange={(e) => setBoard(e.target.value)} placeholder="CBSE" />
          </Field>
          <Field label="Academic year">
            <input className={inputClass} value={yearLabel} onChange={(e) => setYearLabel(e.target.value)} placeholder={currentAcademicYear()} />
          </Field>
        </div>

        {/* Stats strip — always visible so the admin knows the shape of
            the live tree. */}
        <div
          data-curriculum-stats
          className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Editor</span>
          <span className="text-xs font-medium text-slate-700">
            {stats.classes} classes · {stats.subjects} subjects · {stats.chapters} chapters · {stats.topics} concepts
          </span>
        </div>

        {/* Top rail — classes */}
        <div className="mt-3">
          <PillRail
            label="Classes"
            items={classes}
            keyOf={(c) => c.key}
            labelOf={(c) => c.name}
            iconOf={(c) => c.icon}
            activeKey={activeClassKey}
            onSelect={(k) => setActiveClassKey(k)}
            onAdd={() => setSheet({ kind: "class" })}
            onPaste={() => setSheet({ kind: "class" })}
            totalLabel={classes.length ? String(classes.length) : undefined}
          />
        </div>

        {/* Top-level destructive actions — collapsed by default to
            keep the page quiet. A single "More" pill reveals them. */}
        <details className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500 [&[open]>summary]:pb-1.5">
          <summary className="cursor-pointer select-none text-[11px] font-bold uppercase tracking-wide text-slate-500">
            More
          </summary>
          <div className="flex flex-wrap gap-2 pb-1">
            <button
              type="button"
              onClick={() => setJsonPasteOpen((o) => !o)}
              className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-700 active:bg-amber-200"
            >
              {`{ }`} JSON import
            </button>
            <button
              type="button"
              onClick={loadFromPublished}
              className="rounded-lg bg-blue-100 px-3 py-2 text-xs font-bold text-blue-700 active:bg-blue-200"
            >
              Load from published
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-lg bg-rose-100 px-3 py-2 text-xs font-bold text-rose-600 active:bg-rose-200"
            >
              Clear all
            </button>
          </div>
        </details>

        {jsonPasteOpen ? (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-[10px] text-slate-600">
              Paste a JSON array of classes or{" "}
              <code className="font-mono">{"{ \"classes\": [...] }"}</code>. Shape:{" "}
              <code className="font-mono text-[9px]">
                {"[{\"name\":\"Class 10\",\"icon\":\"📚\",\"subjects\":[{\"name\":\"Math\",\"chapters\":[{\"name\":\"Ch1\",\"topics\":[\"concept\"]}]}]}]"}
              </code>
            </p>
            <textarea
              className={`${textareaClass} !min-h-[120px] !text-[10px] font-mono mt-1`}
              value={jsonPasteText}
              onChange={(e) => {
                setJsonPasteText(e.target.value);
                setJsonError(null);
              }}
              placeholder={'[\n  {\n    "name": "Class 10",\n    "icon": "📚",\n    "subjects": [\n      {\n        "name": "Mathematics",\n        "icon": "📐",\n        "chapters": [\n          { "name": "Real Numbers", "topics": ["Euclid Division Lemma"] }\n        ]\n      }\n    ]\n  }\n]'}
            />
            {jsonError ? <p className="mt-1 text-[10px] font-medium text-red-600">{jsonError}</p> : null}
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={handleJsonPaste}
                className="rounded-md bg-amber-600 px-3 py-1.5 text-[10px] font-bold text-white"
              >
                Import JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  setJsonPasteOpen(false);
                  setJsonPasteText("");
                  setJsonError(null);
                }}
                className="rounded-md px-3 py-1.5 text-[10px] font-medium text-slate-500 active:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </SectionCard>

      {/* ── Focused class card ──────────────────────────────────────
          Only the active class renders a full card. The other classes
          are visible in the rail at the top — tapping any pill in the
          rail re-focusses this view. */}
      {activeClass ? (
        <SectionCard
          title={`Class · ${activeClass.icon} ${activeClass.name}`}
          description="Tap a subject in the rail below to drill in. Subjects, chapters and concepts are edited inside the focused card."
        >
          {/* Class identity row — inline rename + delete. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-14">
              <InlineEdit
                value={activeClass.icon}
                onChange={(icon) => updateClass({ ...activeClass, icon: icon.slice(0, 4) })}
                placeholder="🎒"
                className="text-center"
              />
            </div>
            <div className="min-w-[140px] flex-1">
              <InlineEdit
                value={activeClass.name}
                onChange={(name) => updateClass({ ...activeClass, name, key: slug(name) })}
                placeholder="Class name (e.g. Class 10)"
              />
            </div>
            <button
              type="button"
              onClick={() => deleteClass(activeClass.key)}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-600 active:bg-rose-100"
              data-action="delete-class"
            >
              Delete class
            </button>
          </div>

          {/* Subject rail */}
          <div className="mt-3">
            <PillRail
              label="Subjects"
              items={activeClass.subjects}
              keyOf={(s) => s.key}
              labelOf={(s) => s.name}
              iconOf={(s) => s.icon}
              activeKey={activeSubjectKey}
              onSelect={(k) => setActiveSubjectKey(k)}
              onAdd={() => setSheet({ kind: "subject", classKey: activeClass.key })}
              onPaste={() => setSheet({ kind: "subject", classKey: activeClass.key })}
              totalLabel={activeClass.subjects.length ? String(activeClass.subjects.length) : undefined}
            />
          </div>

          {activeSubject ? (
            <div className="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-14">
                  <InlineEdit
                    value={activeSubject.icon}
                    onChange={(icon) =>
                      updateSubject(activeClass.key, { ...activeSubject, icon: icon.slice(0, 4) })
                    }
                    placeholder="📘"
                    className="text-center"
                  />
                </div>
                <div className="min-w-[140px] flex-1">
                  <InlineEdit
                    value={activeSubject.name}
                    onChange={(name) =>
                      updateSubject(activeClass.key, {
                        ...activeSubject,
                        name,
                        key: slug(name),
                        icon: activeSubject.icon || guessIcon(name),
                      })
                    }
                    placeholder="Subject name"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => deleteSubject(activeClass.key, activeSubject.key)}
                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-600 active:bg-rose-100"
                  data-action="delete-subject"
                >
                  Delete subject
                </button>
              </div>

              <div className="mt-3">
                <PillRail
                  label="Chapters"
                  items={activeSubject.chapters}
                  keyOf={(ch) => ch.key}
                  labelOf={(ch) => ch.name}
                  activeKey={activeChapterKey}
                  onSelect={(k) => setActiveChapterKey(k)}
                  onAdd={() =>
                    setSheet({ kind: "chapter", classKey: activeClass.key, subjectKey: activeSubject.key })
                  }
                  onPaste={() =>
                    setSheet({ kind: "chapter", classKey: activeClass.key, subjectKey: activeSubject.key })
                  }
                  totalLabel={activeSubject.chapters.length ? String(activeSubject.chapters.length) : undefined}
                />
              </div>

              {(() => {
                const chapter = activeSubject.chapters.find((c) => c.key === activeChapterKey);
                if (!chapter) {
                  return (
                    <p className="mt-3 rounded-xl border border-dashed border-indigo-200 bg-white/50 px-3 py-6 text-center text-[11px] text-slate-500">
                      Pick a chapter above to edit its concepts.
                    </p>
                  );
                }
                return (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-[140px] flex-1">
                        <InlineEdit
                          value={chapter.name}
                          onChange={(name) =>
                            updateChapter(activeClass.key, activeSubject.key, { ...chapter, name, key: slug(name) })
                          }
                          placeholder="Chapter name"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteChapter(activeClass.key, activeSubject.key, chapter.key)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-bold text-rose-600 active:bg-rose-100"
                        data-action="delete-chapter"
                      >
                        Delete chapter
                      </button>
                    </div>

                    {/* Concepts (smallest unit — always inline). */}
                    <div className="mt-3 space-y-1.5">
                      {chapter.topics.map((topic) => (
                        <div
                          key={topic.key}
                          className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-200"
                        >
                          <span className="pl-1 text-[10px] text-slate-400">•</span>
                          <div className="flex-1">
                            <InlineEdit
                              value={topic.name}
                              onChange={(name) =>
                                updateTopic(
                                  activeClass.key,
                                  activeSubject.key,
                                  chapter.key,
                                  { ...topic, name, key: slug(name) },
                                  topic.key,
                                )
                              }
                              placeholder="Concept name"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteTopic(activeClass.key, activeSubject.key, chapter.key, topic.key)}
                            className="shrink-0 rounded px-1.5 py-1 text-[10px] font-bold text-rose-500 active:bg-rose-50"
                            data-action="delete-concept"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1.5 pl-1">
                      <button
                        type="button"
                        onClick={() => {
                          const name = window.prompt("Concept name");
                          if (name && name.trim()) {
                            addTopic(activeClass.key, activeSubject.key, chapter.key, name.trim());
                          }
                        }}
                        className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-indigo-600 ring-1 ring-indigo-200 active:bg-indigo-50"
                      >
                        + Concept
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const text = window.prompt(
                            "Paste concepts — one per line, or comma-separated:",
                          );
                          if (text) addBulkTopics(activeClass.key, activeSubject.key, chapter.key, text);
                        }}
                        className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-violet-600 ring-1 ring-violet-200 active:bg-violet-50"
                      >
                        📋 Paste
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-8 text-center text-xs text-slate-500">
              Pick a subject above to drill into its chapters + concepts. Or add one to get started.
            </p>
          )}
        </SectionCard>
      ) : (
        <SectionCard title="No class selected">
          <p className="text-xs text-slate-500">
            Add a class with the <span className="font-bold">+ Add</span> button above, or import from JSON. The class pill rail at the top is the only navigation — pick any class to start editing.
          </p>
        </SectionCard>
      )}

      {/* AI generation panel — moved here from the old single page
          so the admin can flip between manual editing and AI
          generation on the same screen. Same component, same
          behaviour. The `adminConfig` comes from the same
          localStorage-backed `loadAdminAiConfig` that the AI
          Configuration page edits, so any key/model the admin
          sets there is automatically picked up here. */}
      {catalog ? (
        <RevisionCurriculumSection catalog={catalog} adminConfig={adminCfg.config} onCatalog={setCatalog} />
      ) : null}

      {/* Save bar — always visible at the bottom so the admin never
          scrolls to find the publish button. */}
      <div className="sticky bottom-0 z-10 -mx-3 mt-3 border-t border-slate-200 bg-white/95 px-3 py-2 shadow-[0_-8px_20px_-12px_rgba(15,23,42,0.18)] backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <PrimaryButton loading={saving} onClick={() => void saveLive()} className="!h-10 flex-1">
            💾 Save & publish
          </PrimaryButton>
          <SecondaryButton onClick={loadFromPublished} className="!h-10">
            Reload
          </SecondaryButton>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">
          Changes stay in this editor until you press Save. Live student syllabus is unchanged until then. Existing student tests are never deleted.
        </p>
      </div>

      <AddSheet
        open={sheet?.kind === "class"}
        onClose={() => setSheet(null)}
        title="Add a class"
        bulkPlaceholder={"Class 6\nClass 7\nClass 8\nClass 9\nClass 10\nClass 11\nClass 12"}
        hint="Icons are auto-assigned (🎒 for 6-8, 📚 for 9-10, 🎓 for 11-12)."
        addLabel="Add class"
        onAddSingle={(name) => addClass(name)}
        onAddBulk={(lines) => addBulkClasses(lines)}
      />
      <AddSheet
        open={sheet?.kind === "subject"}
        onClose={() => setSheet(null)}
        title={`Add a subject to ${activeClass?.name ?? ""}`}
        bulkPlaceholder={"Mathematics\nScience\nEnglish\nSocial Science\nComputer Science"}
        hint="Icons are auto-detected for known subjects (Mathematics, Science, Physics, etc.)."
        addLabel="Add subject"
        onAddSingle={(name) => activeClass && addSubject(activeClass.key, name)}
        onAddBulk={(lines) => activeClass && addBulkSubjects(activeClass.key, lines)}
      />
      <AddSheet
        open={sheet?.kind === "chapter"}
        onClose={() => setSheet(null)}
        title={`Add a chapter to ${activeSubject?.name ?? ""}`}
        bulkPlaceholder={"Real Numbers\nPolynomials\nLinear Equations\nQuadratic Equations"}
        hint="One chapter per line."
        addLabel="Add chapter"
        onAddSingle={(name) =>
          activeClass && activeSubject && addChapter(activeClass.key, activeSubject.key, name)
        }
        onAddBulk={(lines) =>
          activeClass && activeSubject && addBulkChapters(activeClass.key, activeSubject.key, lines)
        }
      />
    </div>
  );
}
