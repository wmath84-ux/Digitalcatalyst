import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  ArrowRight,
  Bell,
  BookOpen,
  BookOpenText,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Filter,
  FlaskConical,
  MoreVertical,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import type { Reminder } from "../../types";
import { cn } from "../../utils/cn";
import { formatTime12, toMinutes } from "../../../utils/timeOfDay";
import Modal from "../ui/Modal";
import { GlassButton } from "../ui/glass-button";
import { GlassSurface } from "../ui/glass";

export type ReminderCategory = "study" | "test" | "personal" | "class";

interface RemindersProps {
  reminders: Reminder[];
  onAdd: (reminder: Reminder) => void;
  onEdit: (reminder: Reminder) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  /** Id of the reminder a notification deep-linked to — scrolls to it + highlights it. */
  highlightId?: string | null;
  onRequireAccess?: () => boolean;
  /** True while the cloud snapshot is still loading and no device rows exist. */
  loading?: boolean;
  /** The header search query — filters this list exactly like tasks + notes. */
  globalSearch?: string;
}

const CATEGORIES: { id: ReminderCategory; label: string }[] = [
  { id: "study", label: "Study" },
  { id: "test", label: "Test" },
  { id: "personal", label: "Personal" },
  { id: "class", label: "Class" },
];

const CATEGORY_ICON: Record<ReminderCategory, LucideIcon> = {
  study: BookOpen,
  test: FlaskConical,
  personal: NotebookPen,
  class: Video,
};

const CATEGORY_HEX: Record<ReminderCategory, string> = {
  study: "#3b82f6",
  test: "#f43f5e",
  personal: "#f59e0b",
  class: "#0ea5e9",
};

const CATEGORY_LABEL: Record<ReminderCategory, string> = {
  study: "Study",
  test: "Test",
  personal: "Personal",
  class: "Class",
};

/* ── Presentation-only reminder metadata ──────────────────────────────────
   The stored Reminder shape ({id, text, time, done, createdAt}) is owned by
   the server normaliser, which drops every unknown field on a cloud round
   trip — so this redesign persists NOTHING new to the record itself. The
   category picker + note field in the sheet are a view-layer preference map
   (id → {category, note}) kept in localStorage, with a keyword guess as the
   fallback for rows that predate it. Deleting the map only resets pills and
   subtitles back to the guess; no user data is ever at stake. */
interface ReminderMeta {
  category?: ReminderCategory;
  note?: string;
}

const META_KEY = "myday_reminder_meta";

function loadMeta(): Record<string, ReminderMeta> {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ReminderMeta>;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, ReminderMeta> = {};
    for (const [id, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object") continue;
      const category = (entry as ReminderMeta).category;
      const note = (entry as ReminderMeta).note;
      const clean: ReminderMeta = {};
      if (category === "study" || category === "test" || category === "personal" || category === "class") {
        clean.category = category;
      }
      if (typeof note === "string" && note.trim()) clean.note = note.trim().slice(0, 160);
      if (clean.category || clean.note) out[id] = clean;
    }
    return out;
  } catch {
    return {};
  }
}

const TEST_RE = /\b(test|exam|quiz|mock|mcq|assessment|paper|viva|neet|jee|board|cet)\b/i;
const CLASS_RE = /\b(class|classes|lecture|live|session|coaching|tuition|school|college|course|webinar|seminar|lab|practical|lesson)\b/i;
const PERSONAL_RE = /\b(call|mom|dad|mother|father|mama|papa|family|friend|birthday|anniversary|wish|doctor|dentist|medicine|medical|water|drink|food|lunch|dinner|breakfast|walk|gym|exercise|yoga|sleep|wake|wakeup|pay|bill|recharge|shopping|market|haircut|travel|trip|visit|temple|prayer|pooja|fee|fees)\b/i;

function keywordCategory(text: string): ReminderCategory {
  if (TEST_RE.test(text)) return "test";
  if (CLASS_RE.test(text)) return "class";
  if (PERSONAL_RE.test(text)) return "personal";
  return "study";
}

/* "Drink water – stay hydrated!" renders as title + subtitle; a row without
   a separator keeps its full text as the title and falls back to a
   category-based subtitle. The stored text is never rewritten. */
const TITLE_SPLIT_RE = /\s+(?:[–—•|]|-)\s+|:\s+/;

function splitTitleNote(text: string): { title: string; note: string } {
  const parts = text.split(TITLE_SPLIT_RE);
  if (parts.length < 2) return { title: text.trim(), note: "" };
  const title = parts[0].trim();
  return { title: title || text.trim(), note: parts.slice(1).join(" ").trim() };
}

function resolveCategory(rem: Reminder, meta: Record<string, ReminderMeta>): ReminderCategory {
  return meta[rem.id]?.category ?? keywordCategory(rem.text);
}

function resolveNote(rem: Reminder, meta: Record<string, ReminderMeta>, category: ReminderCategory): string {
  const stored = meta[rem.id]?.note?.trim();
  if (stored) return stored;
  const { note } = splitTitleNote(rem.text);
  if (note) return note;
  return `${CATEGORY_LABEL[category]} reminder`;
}

function getTimeStatus(time: string, done: boolean) {
  if (done) return "done" as const;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const remMin = toMinutes(time);
  if (remMin <= nowMin) return "overdue" as const;
  if (remMin - nowMin <= 30) return "soon" as const;
  return "upcoming" as const;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface CalCell {
  day: number;
  current: boolean;
  key: string;
}

function buildMonthCells(year: number, month: number): CalCell[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const cells: CalCell[] = [];
  for (let i = 0; i < firstWeekday; i += 1) {
    const day = daysInPrev - firstWeekday + 1 + i;
    const d = new Date(year, month - 1, day);
    cells.push({ day, current: false, key: dayKey(d) });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ day, current: true, key: dayKey(new Date(year, month, day)) });
  }
  let next = 1;
  while (cells.length % 7 !== 0 || cells.length < 35) {
    const d = new Date(year, month + 1, next);
    cells.push({ day: next, current: false, key: dayKey(d) });
    next += 1;
  }
  return cells;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface ReminderForm {
  id: string;
  text: string;
  time: string;
  category: ReminderCategory;
  note: string;
}

const emptyForm = (category: ReminderCategory = "study"): ReminderForm => ({
  id: crypto.randomUUID(),
  text: "",
  time: "12:00",
  category,
  note: "",
});

type SortMode = "upcoming" | "newest";
type FilterMode = "all" | ReminderCategory;

export default function Reminders({
  reminders,
  onAdd,
  onEdit,
  onToggle,
  onDelete,
  highlightId = null,
  onRequireAccess,
  loading = false,
  globalSearch = "",
}: RemindersProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ReminderForm>(() => emptyForm());
  const [filter, setFilter] = useState<FilterMode>("all");
  const [sort, setSort] = useState<SortMode>("upcoming");
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [calOffset, setCalOffset] = useState(0);
  const [calOpen, setCalOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [meta, setMeta] = useState<Record<string, ReminderMeta>>(loadMeta);
  const listRef = useRef<HTMLDivElement>(null);
  const menuHostRef = useRef<HTMLDivElement>(null);

  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => dayKey(today), [today]);
  const view = useMemo(
    () => new Date(today.getFullYear(), today.getMonth() + calOffset, 1),
    [today, calOffset],
  );
  const monthLabel = view.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const cells = useMemo(() => buildMonthCells(view.getFullYear(), view.getMonth()), [view]);
  const groupLabel = useMemo(
    () => `Today • ${today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`,
    [today],
  );

  const persistMeta = (next: Record<string, ReminderMeta>) => {
    setMeta(next);
    try {
      localStorage.setItem(META_KEY, JSON.stringify(next));
    } catch {
      // The map is a nicety — the list itself never depends on it.
    }
  };

  // Drop preferences whose reminder no longer exists.
  useEffect(() => {
    setMeta((prev) => {
      const ids = new Set(reminders.map((r) => r.id));
      let changed = false;
      const next: Record<string, ReminderMeta> = {};
      for (const [id, entry] of Object.entries(prev)) {
        if (ids.has(id)) next[id] = entry;
        else changed = true;
      }
      if (changed) {
        try {
          localStorage.setItem(META_KEY, JSON.stringify(next));
        } catch {
          // Ignore — see persistMeta.
        }
        return next;
      }
      return prev;
    });
  }, [reminders]);

  const openAdd = (preset: ReminderCategory = "study") => {
    if (onRequireAccess && !onRequireAccess()) return;
    setEditingId(null);
    setForm(emptyForm(preset));
    setModalOpen(true);
  };

  const openEdit = (rem: Reminder) => {
    // No access check for editing existing reminders - users should always be able to edit their own items
    const stored = meta[rem.id];
    setEditingId(rem.id);
    setForm({
      id: rem.id,
      text: rem.text,
      time: rem.time,
      category: stored?.category ?? keywordCategory(rem.text),
      note: stored?.note ?? "",
    });
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const text = form.text.trim();
    if (!text) return;
    const existing = reminders.find((r) => r.id === form.id);
    const data: Reminder = {
      id: form.id,
      text,
      time: form.time || "12:00",
      done: existing?.done ?? false,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    // Remember an explicit pick only when it says something the keyword
    // guess would not — keeps the map (and the reasoning) tiny.
    const note = form.note.trim().slice(0, 160);
    const next = { ...meta };
    if (form.category === keywordCategory(text) && !note) {
      delete next[data.id];
    } else {
      next[data.id] = { category: form.category, ...(note ? { note } : {}) };
    }
    persistMeta(next);
    if (editingId) {
      onEdit(data);
    } else {
      onAdd(data);
    }
    setModalOpen(false);
  };

  const clearFilters = () => {
    setFilter("all");
    setQuery("");
    setSearchOpen(false);
    setSelectedDay(null);
    setOpenMenuId(null);
    setSortOpen(false);
  };

  const matchesQuery = (rem: Reminder, category: ReminderCategory, note: string, q: string) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return `${rem.text} ${note} ${CATEGORY_LABEL[category]}`.toLowerCase().includes(needle);
  };

  // Reminders are today-scoped rows (the scheduler re-arms them daily), so a
  // picked day only ever matches the live date — any other day renders the
  // honest "nothing here" card instead of pretending to filter.
  const viewingOtherDay = selectedDay !== null && selectedDay !== todayKey;

  const searchable = useMemo(
    () =>
      reminders.filter((rem) => {
        const category = resolveCategory(rem, meta);
        const note = resolveNote(rem, meta, category);
        return matchesQuery(rem, category, note, globalSearch) && matchesQuery(rem, category, note, query);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reminders, meta, globalSearch, query],
  );

  const counts = useMemo(() => {
    const base: Record<FilterMode, number> = { all: searchable.length, study: 0, test: 0, personal: 0, class: 0 };
    for (const rem of searchable) {
      base[resolveCategory(rem, meta)] += 1;
    }
    return base;
  }, [searchable, meta]);

  const visible = useMemo(() => {
    const rows = viewingOtherDay ? [] : searchable.filter((rem) => filter === "all" || resolveCategory(rem, meta) === filter);
    const sorted = [...rows];
    if (sort === "newest") {
      sorted.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      sorted.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
    }
    return sorted;
  }, [searchable, filter, sort, meta, viewingOtherDay]);

  const stats = useMemo(() => {
    const total = reminders.length;
    const completed = reminders.filter((r) => r.done).length;
    const pending = total - completed;
    const overdue = reminders.filter((r) => !r.done && getTimeStatus(r.time, false) === "overdue").length;
    return { total, completed, pending, overdue };
  }, [reminders]);

  const filtersActive = filter !== "all" || query.trim() !== "" || globalSearch.trim() !== "";
  const selectedDayLabel = selectedDay
    ? new Date(`${selectedDay}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "";

  useEffect(() => {
    if (!highlightId) return;
    const el = listRef.current?.querySelector(`[data-highlight="${CSS.escape(highlightId)}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightId, visible]);

  useEffect(() => {
    if (!openMenuId && !sortOpen) return;
    const close = () => {
      setOpenMenuId(null);
      setSortOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      if (menuHostRef.current && !menuHostRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuId, sortOpen]);

  if (loading) {
    return (
      <div className="myrem" role="status" aria-label="Loading reminders">
        <div className="myrem-layout" aria-hidden="true">
          <div className="myrem-panel">
            <div className="myrem-card" style={{ padding: "1.5rem 1.25rem 1.75rem" }}>
              <div className="myrem-skel-head">
                <div className="myrem-skel-row">
                  <div className="myrem-skel" style={{ width: "2.9rem", height: "2.9rem", borderRadius: "0.9rem" }} />
                  <div>
                    <div className="myrem-skel" style={{ width: "9rem", height: "1.1rem", borderRadius: "0.4rem" }} />
                    <div className="myrem-skel" style={{ width: "13rem", height: "0.7rem", borderRadius: "0.4rem", marginTop: "0.4rem" }} />
                  </div>
                </div>
                <div className="myrem-skel" style={{ width: "8.5rem", height: "2.6rem", borderRadius: "0.8rem" }} />
              </div>
              <div className="myrem-skel-chiprow">
                {[4.5, 5.5, 4.8, 5.8, 4.6, 7].map((w, i) => (
                  <div key={i} className="myrem-skel" style={{ width: `${w}rem`, height: "2.3rem", borderRadius: "999px" }} />
                ))}
              </div>
              {[0, 1].map((g) => (
                <div key={g} className="myrem-skel-group">
                  <div className="myrem-skel-head">
                    <div className="myrem-skel" style={{ width: "12rem", height: "0.95rem", borderRadius: "0.4rem" }} />
                    <div className="myrem-skel" style={{ width: "5rem", height: "0.7rem", borderRadius: "0.4rem" }} />
                  </div>
                  <div className="myrem-skel-list">
                    {[0, 1, 2].map((c) => (
                      <div key={c} className="myrem-skel-card">
                        <div className="myrem-skel" style={{ width: "1.3rem", height: "1.3rem", borderRadius: "0.42rem", flexShrink: 0 }} />
                        <div className="myrem-skel" style={{ width: "2.6rem", height: "2.6rem", borderRadius: "0.75rem", flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div className="myrem-skel" style={{ width: "45%", height: "0.85rem", borderRadius: "0.4rem" }} />
                          <div className="myrem-skel" style={{ width: "70%", height: "0.65rem", borderRadius: "0.4rem", marginTop: "0.35rem" }} />
                        </div>
                        <div className="myrem-skel" style={{ width: "4rem", height: "0.8rem", borderRadius: "0.4rem" }} />
                        <div className="myrem-skel" style={{ width: "4.2rem", height: "1.6rem", borderRadius: "0.55rem" }} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="myrem-rail-cal myrem-card">
            <div className="myrem-skel" style={{ width: "7rem", height: "0.95rem", borderRadius: "0.4rem" }} />
            <div className="myrem-skel" style={{ width: "100%", height: "1.9rem", borderRadius: "0.6rem", marginTop: "0.85rem" }} />
            <div className="myrem-skel-cal">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="myrem-skel" style={{ height: "1.7rem", borderRadius: "0.5rem" }} />
              ))}
            </div>
          </div>
          <div className="myrem-rail-stats myrem-card">
            <div className="myrem-skel" style={{ width: "8rem", height: "0.95rem", borderRadius: "0.4rem" }} />
            <div className="myrem-skel-stats">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="myrem-skel" style={{ height: "3.4rem", borderRadius: "0.85rem" }} />
              ))}
            </div>
          </div>
          <div className="myrem-rail-quick myrem-card">
            <div className="myrem-skel" style={{ width: "6rem", height: "0.95rem", borderRadius: "0.4rem" }} />
            <div className="myrem-skel-quick">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="myrem-skel" style={{ height: "4rem", borderRadius: "0.85rem" }} />
              ))}
            </div>
          </div>
          <div className="myrem-banner">
            <div className="myrem-skel" style={{ height: "6.2rem", borderRadius: "1.15rem" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="myrem">
        <div className="myrem-layout">
          <div className="myrem-panel">
            <GlassSurface radius={24} className="dc-scene-plate text-white" contentClassName="flex flex-col">
              <div className="myrem-main">
                <div className="myrem-head">
                  <div className="myrem-head-id">
                    <span className="myrem-head-icon" aria-hidden="true">
                      <Bell className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="myrem-title">My Reminders</h2>
                      <p className="myrem-sub">Set reminders for your study goals, classes, tests and more.</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => openAdd()} aria-label="Add Reminder" className="myrem-add">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span className="myrem-add-label-short">Add</span>
                    <span className="myrem-add-label-full">Add Reminder</span>
                  </button>
                </div>

                {/* Phone search row (the mobile mockup keeps search + the
                    calendar toggle inline, above the chips). */}
                <div className="myrem-msearch">
                  <label className="myrem-searchbox">
                    <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="sr-only">Search reminders</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search reminders…"
                    />
                  </label>
                  <button
                    type="button"
                    className="myrem-iconbtn"
                    data-on={calOpen}
                    aria-expanded={calOpen}
                    aria-controls="myrem-cal"
                    title={calOpen ? "Hide calendar" : "Show calendar"}
                    aria-label={calOpen ? "Hide calendar" : "Show calendar"}
                    onClick={() => setCalOpen((o) => !o)}
                  >
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                {/* Filter chips wrap onto further lines on narrow screens so
                    the rail never needs a sideways scroll of its own. */}
                <div ref={menuHostRef}>
                <div className="myrem-chips" role="group" aria-label="Filter reminders by category">
                  <button
                    type="button"
                    className="myrem-chip"
                    data-active={filter === "all"}
                    aria-pressed={filter === "all"}
                    onClick={() => setFilter("all")}
                  >
                    All
                    <span className="myrem-chip-n">{counts.all}</span>
                  </button>
                  {CATEGORIES.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="myrem-chip"
                      data-active={filter === c.id}
                      aria-pressed={filter === c.id}
                      onClick={() => setFilter(filter === c.id ? "all" : c.id)}
                    >
                      <span className="myrem-chip-dot" style={{ background: CATEGORY_HEX[c.id] }} aria-hidden="true" />
                      {c.label}
                      <span className="myrem-chip-n">{counts[c.id]}</span>
                    </button>
                  ))}
                  <span className="myrem-dsearch">
                    <button
                      type="button"
                      className="myrem-dsearch-btn"
                      aria-label="Search reminders"
                      aria-expanded={searchOpen || query.trim() !== ""}
                      onClick={() => {
                        if (query) {
                          setQuery("");
                          setSearchOpen(false);
                        } else {
                          setSearchOpen((o) => !o);
                        }
                      }}
                    >
                      <Search className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {(searchOpen || query.trim() !== "") && (
                      <label className="myrem-dsearch-field">
                        <span className="sr-only">Search reminders</span>
                        <input
                          autoFocus={searchOpen && query.trim() === ""}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              setQuery("");
                              setSearchOpen(false);
                            }
                          }}
                          placeholder="Search…"
                        />
                        {query.trim() !== "" && (
                          <button
                            type="button"
                            aria-label="Clear reminder search"
                            onClick={() => {
                              setQuery("");
                              setSearchOpen(false);
                            }}
                            className="grid shrink-0 place-items-center rounded-full p-0.5 hover:bg-white/10"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        )}
                      </label>
                    )}
                  </span>
                  <span className="myrem-sortwrap">
                    <button
                      type="button"
                      className="myrem-sortbtn"
                      aria-haspopup="listbox"
                      aria-expanded={sortOpen}
                      onClick={() => {
                        setOpenMenuId(null);
                        setSortOpen((o) => !o);
                      }}
                    >
                      {sort === "upcoming" ? "Upcoming" : "Newest first"}
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {sortOpen && (
                      <span role="listbox" aria-label="Sort reminders" className="myrem-sortmenu">
                        {([
                          ["upcoming", "Upcoming"],
                          ["newest", "Newest first"],
                        ] as [SortMode, string][]).map(([mode, label]) => (
                          <button
                            key={mode}
                            type="button"
                            role="option"
                            aria-selected={sort === mode}
                            data-on={sort === mode}
                            onClick={() => {
                              setSort(mode);
                              setSortOpen(false);
                            }}
                          >
                            {label}
                            {sort === mode && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                </div>

                  {viewingOtherDay ? (
                    <div className="myrem-empty">
                      <span className="myrem-empty-icon" aria-hidden="true">
                        <CalendarDays className="h-6 w-6" />
                      </span>
                      <p className="myrem-empty-title">No reminders on {selectedDayLabel}</p>
                      <p className="myrem-empty-sub">
                        Your reminders live on today&apos;s list — pick today on the calendar to see them.
                      </p>
                      <button type="button" className="myrem-empty-cta" onClick={() => setSelectedDay(null)}>
                        Back to today
                      </button>
                    </div>
                  ) : visible.length === 0 ? (
                    <div className="myrem-empty">
                      <span className="myrem-empty-icon" aria-hidden="true">
                        {filtersActive ? <Search className="h-6 w-6" /> : <AlarmClock className="h-6 w-6" />}
                      </span>
                      <p className="myrem-empty-title">{filtersActive ? "No matching reminders" : "No reminders set"}</p>
                      <p className="myrem-empty-sub">
                        {filtersActive
                          ? "Try a different search or category — or clear the filters to see everything."
                          : "Set a reminder and never miss what matters!"}
                      </p>
                      {filtersActive ? (
                        <button type="button" className="myrem-empty-cta" onClick={clearFilters}>
                          Clear all filters
                        </button>
                      ) : (
                        <button type="button" className="myrem-empty-cta" onClick={() => openAdd()}>
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          Set a reminder
                        </button>
                      )}
                    </div>
                  ) : (
                    <section className="myrem-group" aria-label={groupLabel}>
                      <div className="myrem-group-head">
                        <h3 className="myrem-group-title">{groupLabel}</h3>
                        <span className="myrem-group-count">
                          {visible.length} reminder{visible.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div ref={listRef} className="myrem-list">
                        {visible.map((rem, idx) => {
                          const category = resolveCategory(rem, meta);
                          const note = resolveNote(rem, meta, category);
                          const { title } = splitTitleNote(rem.text);
                          const status = getTimeStatus(rem.time, rem.done);
                          const Icon = CATEGORY_ICON[category];
                          const menuOpen = openMenuId === rem.id;
                          return (
                            <article
                              key={rem.id}
                              data-highlight={rem.id}
                              data-cat={category}
                              data-done={rem.done}
                              data-highlighted={rem.id === highlightId}
                              onClick={() => openEdit(rem)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.target !== e.currentTarget) return;
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  openEdit(rem);
                                }
                              }}
                              aria-label={`Edit reminder: ${rem.text}`}
                              className="myrem-card-item group"
                            >
                              <span className="flex shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  role="checkbox"
                                  aria-checked={rem.done}
                                  data-on={rem.done}
                                  aria-label={rem.done ? "Mark reminder as pending" : "Mark reminder as done"}
                                  className="myrem-check"
                                  onClick={() => onToggle(rem.id)}
                                >
                                  {rem.done && <Check className="h-3 w-3" aria-hidden="true" />}
                                </button>
                              </span>
                              <span className="myrem-tile" data-cat={category} aria-hidden="true">
                                <Icon className="h-5 w-5" />
                              </span>
                              <span className="myrem-text">
                                <p className="myrem-card-title">{title}</p>
                                <p className="myrem-card-note">{note}</p>
                              </span>
                              <span className="myrem-meta">
                                <span
                                  className="myrem-time"
                                  data-tone={rem.done ? "done" : status === "overdue" ? "overdue" : "upcoming"}
                                >
                                  {formatTime12(rem.time)}
                                  <Bell className="h-3.5 w-3.5" aria-hidden="true" />
                                </span>
                                <span className="myrem-pill" data-cat={category}>
                                  <i aria-hidden="true" />
                                  {CATEGORY_LABEL[category]}
                                </span>
                                {/* The kebab reveals on row hover for mouse
                                    pointers; touch devices have no hover, so
                                    the button stays on screen there. */}
                                <span
                                  className="myrem-kebab [@media(hover:hover)]:sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <button
                                    type="button"
                                    className="myrem-kebab-btn"
                                    aria-label="Reminder actions"
                                    aria-haspopup="menu"
                                    aria-expanded={menuOpen}
                                    onClick={() => setOpenMenuId(menuOpen ? null : rem.id)}
                                  >
                                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                  {menuOpen && (
                                    <div
                                      role="menu"
                                      aria-label="Reminder actions"
                                      className={cn("myrem-menu", idx >= visible.length - 2 && "myrem-menu--up")}
                                    >
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          setOpenMenuId(null);
                                          openEdit(rem);
                                        }}
                                      >
                                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                          setOpenMenuId(null);
                                          onToggle(rem.id);
                                        }}
                                      >
                                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                        {rem.done ? "Mark as pending" : "Mark as done"}
                                      </button>
                                      <button
                                        type="button"
                                        role="menuitem"
                                        data-danger="true"
                                        onClick={() => {
                                          setOpenMenuId(null);
                                          onDelete(rem.id);
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </span>
                              </span>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </GlassSurface>
          </div>

          <section className="myrem-rail-cal myrem-card" id="myrem-cal" data-open={calOpen} aria-label="Calendar view">
            <h3 className="myrem-card-title">Calendar View</h3>
            <div className="myrem-cal-body">
              <div className="myrem-cal-month">
                <span className="myrem-cal-label">
                  <button
                    type="button"
                    className="myrem-cal-nav"
                    aria-label="Previous month"
                    onClick={() => setCalOffset((o) => o - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  {monthLabel}
                  <button
                    type="button"
                    className="myrem-cal-nav"
                    aria-label="Next month"
                    onClick={() => setCalOffset((o) => o + 1)}
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </span>
                <button
                  type="button"
                  className="myrem-cal-filter"
                  data-on={calOffset !== 0 || selectedDay !== null}
                  title="Back to the current month"
                  onClick={() => {
                    setCalOffset(0);
                    setSelectedDay(null);
                  }}
                >
                  <Filter className="h-3 w-3" aria-hidden="true" />
                  Filter
                </button>
              </div>
              <div className="myrem-cal-grid" role="grid" aria-label={`${monthLabel} calendar`}>
                {WEEKDAYS.map((w) => (
                  <span key={w} className="myrem-cal-wd" aria-hidden="true">
                    {w}
                  </span>
                ))}
                {cells.map((cell) => (
                  <button
                    key={cell.key}
                    type="button"
                    className="myrem-cal-day"
                    data-edge={!cell.current}
                    data-today={cell.key === todayKey}
                    data-selected={selectedDay === cell.key}
                    data-dot={cell.key === todayKey && reminders.length > 0}
                    aria-pressed={selectedDay === cell.key}
                    aria-label={`${cell.key === todayKey ? "Today, " : ""}${cell.key}`}
                    onClick={() => setSelectedDay((d) => (d === cell.key ? null : cell.key))}
                  >
                    {cell.day}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="myrem-rail-stats myrem-card" aria-label="Reminder stats">
            <div className="myrem-card-head">
              <h3 className="myrem-card-title">Reminder Stats</h3>
              <button type="button" className="myrem-viewall" onClick={clearFilters}>
                View All
              </button>
            </div>
            <div className="myrem-stats">
              <div className="myrem-stat">
                <span className="myrem-stat-icon" style={{ background: "rgba(139,92,246,.18)", color: "#a78bfa" }} aria-hidden="true">
                  <Bell className="h-4 w-4" />
                </span>
                <span>
                  <span className="myrem-stat-num">{stats.total}</span>
                  <span className="myrem-stat-label">Total</span>
                </span>
              </div>
              <div className="myrem-stat">
                <span className="myrem-stat-icon" style={{ background: "rgba(52,211,153,.16)", color: "#34d399" }} aria-hidden="true">
                  <CircleCheck className="h-4 w-4" />
                </span>
                <span>
                  <span className="myrem-stat-num">{stats.completed}</span>
                  <span className="myrem-stat-label">Completed</span>
                </span>
              </div>
              <div className="myrem-stat">
                <span className="myrem-stat-icon" style={{ background: "rgba(245,158,11,.16)", color: "#fbbf24" }} aria-hidden="true">
                  <Clock className="h-4 w-4" />
                </span>
                <span>
                  <span className="myrem-stat-num">{stats.pending}</span>
                  <span className="myrem-stat-label">Pending</span>
                </span>
              </div>
              <div className="myrem-stat">
                <span className="myrem-stat-icon" style={{ background: "rgba(244,63,94,.16)", color: "#fb7185" }} aria-hidden="true">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <span>
                  <span className="myrem-stat-num">{stats.overdue}</span>
                  <span className="myrem-stat-label">Overdue</span>
                </span>
              </div>
            </div>
          </section>

          <section className="myrem-rail-quick myrem-card" aria-label="Quick add">
            <h3 className="myrem-card-title">Quick Add</h3>
            <div className="myrem-quick">
              {CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICON[c.id];
                return (
                  <button key={c.id} type="button" className="myrem-quick-btn" onClick={() => openAdd(c.id)}>
                    <span className="myrem-quick-tile" data-cat={c.id} aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                    {c.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="myrem-banner" aria-label="Stay consistent">
            <div className="myrem-banner-inner">
              <span className="myrem-banner-book" aria-hidden="true">
                <BookOpenText className="h-7 w-7" />
              </span>
              <div className="myrem-banner-text">
                <p className="myrem-banner-title">Small reminders. Big progress.</p>
                <p className="myrem-banner-sub">Stay consistent, keep learning!</p>
              </div>
              <button type="button" className="myrem-banner-cta" onClick={() => openAdd()}>
                Create Your First Reminder
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <div className="myrem-snow" aria-hidden="true">
                <span className="myrem-snow-bubble">Set reminders today, achieve your dreams! ✨</span>
                <span className="myrem-snow-body">⛄</span>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Sheet for Add / Edit — the shared overlay, unchanged plumbing. */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Reminder" : "Set a Reminder"}
      >
        <form onSubmit={handleSave} className="space-y-5">
          <div>
            <label className="myday-form-label" htmlFor="myrem-text">
              Reminder Text <span className="text-rose-400">*</span>
            </label>
            <input
              id="myrem-text"
              autoFocus
              value={form.text}
              onChange={(e) => setForm({ ...form, text: e.target.value })}
              placeholder="e.g., Submit assignment before 5 PM"
              className="dc-field w-full rounded-full border px-4 py-3 text-sm outline-none transition-all"
            />
          </div>
          <div>
            <span className="myday-form-label" id="myrem-cat-label">
              Category
            </span>
            <div className="myrem-catpick" role="radiogroup" aria-labelledby="myrem-cat-label">
              {CATEGORIES.map((c) => (
                <label key={c.id} className="myrem-catpick-item" data-on={form.category === c.id}>
                  <input
                    type="radio"
                    name="myrem-category"
                    className="sr-only"
                    checked={form.category === c.id}
                    onChange={() => setForm({ ...form, category: c.id })}
                  />
                  <i style={{ background: CATEGORY_HEX[c.id] }} aria-hidden="true" />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="myday-form-label" htmlFor="myrem-note">
              Note <span className="font-medium normal-case tracking-normal opacity-60">(optional)</span>
            </label>
            <input
              id="myrem-note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="e.g., Watch recorded lecture on Kinematics"
              maxLength={160}
              className="dc-field w-full rounded-full border px-4 py-3 text-sm outline-none transition-all"
            />
          </div>
          <div>
            <label className="myday-form-label" htmlFor="myrem-time">
              Time
            </label>
            <input
              id="myrem-time"
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              className="dc-field w-full rounded-full border px-4 py-3 text-sm outline-none transition-all"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <GlassButton
              variant="capsule"
              type="button"
              onClick={() => setModalOpen(false)}
              className="flex-1 [&>span>div]:h-11 [&>span>div]:w-full [&>span>div]:px-4 [&>span>div]:text-sm [&>span>div]:font-semibold"
            >
              Cancel
            </GlassButton>
            <button
              type="submit"
              disabled={!form.text.trim()}
              className="myday-cta flex-1 py-3 text-sm"
            >
              {editingId ? "Save Changes" : "Set Reminder"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
