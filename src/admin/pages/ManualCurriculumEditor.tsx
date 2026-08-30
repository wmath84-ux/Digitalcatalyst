"use client";

import { useMemo, useState } from "react";
import {
  Field,
  PrimaryButton,
  SecondaryButton,
  SectionCard,
  inputClass,
  textareaClass,
} from "@/components/admin/ui";
import { useToast } from "@/components/admin/AdminProviders";
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

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
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

/* ------------------------------------------------------------------ */
/* Bulk paste parser — one item per line, supports tab/pipe nesting    */
/* ------------------------------------------------------------------ */

/**
 * Parse pasted text into a flat list of lines.
 * Supports formats:
 *   - One item per line
 *   - Tab-separated: "Subject\tChapter\tConcept"
 *   - Pipe-separated: "Subject | Chapter | Concept"
 *   - Comma-separated for simple lists: "Concept1, Concept2, Concept3"
 */
function parseBulkLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function parseBulkConcepts(text: string): string[] {
  // Support comma-separated on one line, or one per line
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const concepts: string[] = [];
  for (const line of lines) {
    // Split by comma if multiple items on one line
    const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
    concepts.push(...parts);
  }
  return concepts;
}

/* ------------------------------------------------------------------ */
/* Props                                                               */
/* ------------------------------------------------------------------ */

type Props = {
  catalog: RevisionCatalog;
  onCatalog: (catalog: RevisionCatalog) => void;
};

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
/* Topic (Concept) Row                                                 */
/* ------------------------------------------------------------------ */

function TopicRow({
  topic,
  onUpdate,
  onDelete,
}: {
  topic: CurriculumTopic;
  onUpdate: (t: CurriculumTopic) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pl-8">
      <span className="text-[10px] text-slate-400">•</span>
      <div className="flex-1">
        <InlineEdit
          value={topic.name}
          onChange={(name) => onUpdate({ ...topic, name, key: slug(name) })}
          placeholder="Concept name"
        />
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 rounded px-1.5 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-50"
        title="Delete concept"
      >
        ✕
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chapter Card                                                        */
/* ------------------------------------------------------------------ */

function ChapterCard({
  chapter,
  onUpdate,
  onDelete,
}: {
  chapter: CurriculumChapter;
  onUpdate: (ch: CurriculumChapter) => void;
  onDelete: () => void;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const addTopic = () => {
    const used = new Set(chapter.topics.map((t) => t.key));
    const key = uniqueKey("new-concept", used);
    onUpdate({
      ...chapter,
      topics: [...chapter.topics, { key, name: "" }],
    });
  };

  const addBulkTopics = () => {
    const names = parseBulkConcepts(bulkText);
    if (!names.length) return;
    const used = new Set(chapter.topics.map((t) => t.key));
    const newTopics: CurriculumTopic[] = names.map((name) => ({
      key: uniqueKey(name, used),
      name,
    }));
    onUpdate({ ...chapter, topics: [...chapter.topics, ...newTopics] });
    setBulkText("");
    setBulkOpen(false);
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400">📖</span>
        <div className="flex-1">
          <InlineEdit
            value={chapter.name}
            onChange={(name) =>
              onUpdate({ ...chapter, name, key: slug(name) })
            }
            placeholder="Chapter name"
          />
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 rounded px-1.5 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-50"
          title="Delete chapter"
        >
          ✕
        </button>
      </div>

      {/* Topics list */}
      <div className="mt-2 space-y-1">
        {chapter.topics.map((topic, ti) => (
          <TopicRow
            key={topic.key || ti}
            topic={topic}
            onUpdate={(t) => {
              const next = [...chapter.topics];
              next[ti] = t;
              onUpdate({ ...chapter, topics: next });
            }}
            onDelete={() => {
              onUpdate({
                ...chapter,
                topics: chapter.topics.filter((_, i) => i !== ti),
              });
            }}
          />
        ))}
      </div>

      {/* Add concept buttons */}
      <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
        <button
          type="button"
          onClick={addTopic}
          className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-50"
        >
          + Concept
        </button>
        <button
          type="button"
          onClick={() => setBulkOpen(!bulkOpen)}
          className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-violet-600 ring-1 ring-violet-200 hover:bg-violet-50"
        >
          📋 Paste multiple
        </button>
      </div>

      {bulkOpen && (
        <div className="mt-2 rounded-md border border-violet-200 bg-white p-2">
          <p className="text-[10px] text-slate-500">
            Paste concepts — one per line, or comma-separated on one line
          </p>
          <textarea
            className={`${textareaClass} !min-h-[60px] !text-xs mt-1`}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"Newton's First Law\nNewton's Second Law\nNewton's Third Law"}
          />
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={addBulkTopics}
              className="rounded-md bg-violet-600 px-2.5 py-1 text-[10px] font-bold text-white"
            >
              Add {parseBulkConcepts(bulkText).length || ""} concepts
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkOpen(false);
                setBulkText("");
              }}
              className="rounded-md px-2.5 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Subject Card                                                        */
/* ------------------------------------------------------------------ */

function SubjectCard({
  subject,
  onUpdate,
  onDelete,
}: {
  subject: CurriculumSubject;
  onUpdate: (s: CurriculumSubject) => void;
  onDelete: () => void;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const addChapter = () => {
    const used = new Set(subject.chapters.map((c) => c.key));
    const key = uniqueKey("new-chapter", used);
    onUpdate({
      ...subject,
      chapters: [
        ...subject.chapters,
        { key, name: "", topics: [] },
      ],
    });
  };

  const addBulkChapters = () => {
    const lines = parseBulkLines(bulkText);
    if (!lines.length) return;
    const used = new Set(subject.chapters.map((c) => c.key));
    const newChapters: CurriculumChapter[] = lines.map((name) => ({
      key: uniqueKey(name, used),
      name,
      topics: [],
    }));
    onUpdate({
      ...subject,
      chapters: [...subject.chapters, ...newChapters],
    });
    setBulkText("");
    setBulkOpen(false);
  };

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3">
      <div className="flex items-center gap-2">
        <InlineEdit
          value={subject.icon}
          onChange={(icon) => onUpdate({ ...subject, icon: icon.slice(0, 4) })}
          placeholder="Icon"
          className="!w-14 text-center"
        />
        <div className="flex-1">
          <InlineEdit
            value={subject.name}
            onChange={(name) =>
              onUpdate({
                ...subject,
                name,
                key: slug(name),
                icon: subject.icon || guessIcon(name),
              })
            }
            placeholder="Subject name"
          />
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 rounded px-2 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-50"
          title="Delete subject"
        >
          ✕
        </button>
      </div>

      {/* Chapters */}
      <div className="mt-2.5 space-y-2">
        {subject.chapters.map((ch, ci) => (
          <ChapterCard
            key={ch.key || ci}
            chapter={ch}
            onUpdate={(updated) => {
              const next = [...subject.chapters];
              next[ci] = updated;
              onUpdate({ ...subject, chapters: next });
            }}
            onDelete={() => {
              onUpdate({
                ...subject,
                chapters: subject.chapters.filter((_, i) => i !== ci),
              });
            }}
          />
        ))}
      </div>

      {/* Add chapter buttons */}
      <div className="mt-2.5 flex flex-wrap gap-1.5 pl-2">
        <button
          type="button"
          onClick={addChapter}
          className="rounded-md bg-white px-2.5 py-1.5 text-[11px] font-semibold text-indigo-600 ring-1 ring-indigo-200 hover:bg-indigo-50"
        >
          + Chapter
        </button>
        <button
          type="button"
          onClick={() => setBulkOpen(!bulkOpen)}
          className="rounded-md bg-white px-2.5 py-1.5 text-[11px] font-semibold text-violet-600 ring-1 ring-violet-200 hover:bg-violet-50"
        >
          📋 Paste chapters
        </button>
      </div>

      {bulkOpen && (
        <div className="mt-2 rounded-md border border-violet-200 bg-white p-2.5">
          <p className="text-[10px] text-slate-500">
            Paste chapter names — one per line
          </p>
          <textarea
            className={`${textareaClass} !min-h-[60px] !text-xs mt-1`}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"Real Numbers\nPolynomials\nLinear Equations\nQuadratic Equations"}
          />
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={addBulkChapters}
              className="rounded-md bg-violet-600 px-2.5 py-1 text-[10px] font-bold text-white"
            >
              Add {parseBulkLines(bulkText).length || ""} chapters
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkOpen(false);
                setBulkText("");
              }}
              className="rounded-md px-2.5 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Class Card                                                          */
/* ------------------------------------------------------------------ */

function ClassCard({
  cls,
  onUpdate,
  onDelete,
}: {
  cls: CurriculumClass;
  onUpdate: (c: CurriculumClass) => void;
  onDelete: () => void;
}) {
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const addSubject = () => {
    const used = new Set(cls.subjects.map((s) => s.key));
    const key = uniqueKey("new-subject", used);
    onUpdate({
      ...cls,
      subjects: [
        ...cls.subjects,
        { key, name: "", icon: "📘", chapters: [] },
      ],
    });
  };

  const addBulkSubjects = () => {
    const lines = parseBulkLines(bulkText);
    if (!lines.length) return;
    const used = new Set(cls.subjects.map((s) => s.key));
    const newSubjects: CurriculumSubject[] = lines.map((name) => ({
      key: uniqueKey(name, used),
      name,
      icon: guessIcon(name),
      chapters: [],
    }));
    onUpdate({
      ...cls,
      subjects: [...cls.subjects, ...newSubjects],
    });
    setBulkText("");
    setBulkOpen(false);
  };

  const totalChapters = cls.subjects.reduce(
    (n, s) => n + s.chapters.length,
    0
  );
  const totalConcepts = cls.subjects.reduce(
    (n, s) => n + s.chapters.reduce((m, ch) => m + ch.topics.length, 0),
    0
  );

  return (
    <div className="rounded-2xl border-2 border-slate-300 bg-white p-4">
      <div className="flex items-center gap-3">
        <InlineEdit
          value={cls.icon}
          onChange={(icon) => onUpdate({ ...cls, icon: icon.slice(0, 4) })}
          placeholder="🎒"
          className="!w-14 text-center text-base"
        />
        <div className="flex-1">
          <InlineEdit
            value={cls.name}
            onChange={(name) =>
              onUpdate({ ...cls, name, key: slug(name) })
            }
            placeholder="Class name (e.g. Class 10)"
          />
        </div>
        <span className="text-[10px] text-slate-400">
          {cls.subjects.length} subj · {totalChapters} ch · {totalConcepts} concepts
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-100"
          title="Delete class"
        >
          Delete class
        </button>
      </div>

      {/* Subjects */}
      <div className="mt-3 space-y-3">
        {cls.subjects.map((subj, si) => (
          <SubjectCard
            key={subj.key || si}
            subject={subj}
            onUpdate={(updated) => {
              const next = [...cls.subjects];
              next[si] = updated;
              onUpdate({ ...cls, subjects: next });
            }}
            onDelete={() => {
              onUpdate({
                ...cls,
                subjects: cls.subjects.filter((_, i) => i !== si),
              });
            }}
          />
        ))}
      </div>

      {/* Add subject buttons */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addSubject}
          className="rounded-lg bg-indigo-100 px-3 py-1.5 text-[11px] font-bold text-indigo-700 hover:bg-indigo-200"
        >
          + Subject
        </button>
        <button
          type="button"
          onClick={() => setBulkOpen(!bulkOpen)}
          className="rounded-lg bg-violet-100 px-3 py-1.5 text-[11px] font-bold text-violet-700 hover:bg-violet-200"
        >
          📋 Paste subjects
        </button>
      </div>

      {bulkOpen && (
        <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
          <p className="text-[10px] text-slate-600">
            Paste subject names — one per line. Icons auto-detected for known
            subjects (Mathematics, Science, Physics, etc.)
          </p>
          <textarea
            className={`${textareaClass} !min-h-[70px] !text-xs mt-1`}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"Mathematics\nScience\nEnglish\nSocial Science\nComputer Science"}
          />
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={addBulkSubjects}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-[10px] font-bold text-white"
            >
              Add {parseBulkLines(bulkText).length || ""} subjects
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkOpen(false);
                setBulkText("");
              }}
              className="rounded-md px-3 py-1.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Component                                                      */
/* ------------------------------------------------------------------ */

export default function ManualCurriculumEditor({ catalog, onCatalog }: Props) {
  const { notify } = useToast();
  const published = catalog.planningCurriculum;

  // Working copy — start from published or empty
  const [classes, setClasses] = useState<CurriculumClass[]>(
    () => published?.classes ?? []
  );
  const [board, setBoard] = useState(published?.board || "CBSE");
  const [yearLabel, setYearLabel] = useState(
    published?.yearLabel || currentAcademicYear()
  );
  const [saving, setSaving] = useState(false);

  // Bulk add class
  const [bulkClassOpen, setBulkClassOpen] = useState(false);
  const [bulkClassText, setBulkClassText] = useState("");

  // Full JSON paste
  const [jsonPasteOpen, setJsonPasteOpen] = useState(false);
  const [jsonPasteText, setJsonPasteText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  const stats = useMemo(() => curriculumStats(classes), [classes]);

  const addClass = () => {
    const used = new Set(classes.map((c) => c.key));
    const key = uniqueKey("new-class", used);
    setClasses([
      ...classes,
      { key, name: "", icon: "🎒", subjects: [] },
    ]);
  };

  const addBulkClasses = () => {
    const lines = parseBulkLines(bulkClassText);
    if (!lines.length) return;
    const used = new Set(classes.map((c) => c.key));
    const newClasses: CurriculumClass[] = lines.map((name) => ({
      key: uniqueKey(name, used),
      name,
      icon: name.match(/11|12/i) ? "🎓" : name.match(/9|10/i) ? "📚" : "🎒",
      subjects: [],
    }));
    setClasses([...classes, ...newClasses]);
    setBulkClassText("");
    setBulkClassOpen(false);
  };

  const handleJsonPaste = () => {
    setJsonError(null);
    try {
      const parsed = JSON.parse(jsonPasteText);
      let arr: unknown[];
      if (Array.isArray(parsed)) {
        arr = parsed;
      } else if (parsed && typeof parsed === "object" && Array.isArray(parsed.classes)) {
        arr = parsed.classes;
      } else {
        throw new Error(
          "Expected a JSON array of classes, or { \"classes\": [...] }"
        );
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

            const topicsRaw = Array.isArray(c.topics)
              ? c.topics
              : Array.isArray(c.concepts)
                ? c.concepts
                : [];
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
            chapters.push({
              key: uniqueKey(cName, chapterKeys),
              name: cName,
              topics,
            });
          }

          if (!chapters.length) continue;
          subjects.push({
            key: uniqueKey(sName, subjectKeys),
            name: sName,
            icon: sIcon,
            chapters,
          });
        }

        if (!subjects.length) continue;
        imported.push({
          key: uniqueKey(name, used),
          name,
          icon,
          subjects,
        });
      }

      if (!imported.length) {
        throw new Error("No valid classes found in the pasted JSON.");
      }

      setClasses([...classes, ...imported]);
      setJsonPasteText("");
      setJsonPasteOpen(false);
      notify("success", `Imported ${imported.length} class(es) from JSON.`);
    } catch (err) {
      setJsonError(
        err instanceof Error ? err.message : "Invalid JSON format."
      );
    }
  };

  const saveLive = async () => {
    const validClasses = classes
      .filter((c) => c.name.trim())
      .map((c) => ({
        ...c,
        subjects: c.subjects
          .filter((s) => s.name.trim())
          .map((s) => ({
            ...s,
            chapters: s.chapters
              .filter((ch) => ch.name.trim())
              .map((ch) => ({
                ...ch,
                topics: ch.topics.filter((t) => t.name.trim()),
              })),
          })),
      }));
    if (!validClasses.length) {
      notify("error", "Add at least one class with a name.");
      return;
    }
    // Block an incomplete tree with a precise message instead of letting the
    // server normalizer silently drop the branch (which made the published
    // curriculum "disappear" on the student AI test page).
    for (const cls of validClasses) {
      if (!cls.subjects.length) {
        notify("error", `${cls.name} has no subjects. Add at least one subject.`);
        return;
      }
      for (const subject of cls.subjects) {
        if (!subject.chapters.length) {
          notify("error", `${cls.name} → ${subject.name} has no chapters. Add at least one chapter.`);
          return;
        }
        for (const chapter of subject.chapters) {
          if (!chapter.topics.length) {
            notify("error", `${cls.name} → ${subject.name} → ${chapter.name} has no concepts. Add at least one concept.`);
            return;
          }
        }
      }
    }

    const ok = window.confirm(
      "Replace the Class → Subject → Chapter → Concept lists students see on the revision planning page? Existing student tests are not deleted."
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
      const next = { ...catalog, planningCurriculum: payload };
      const res = await adminFetch<{ catalog: RevisionCatalog }>(
        "/api/admin/revision",
        {
          method: "POST",
          body: JSON.stringify(next),
        }
      );
      onCatalog(res.catalog);
      notify(
        "success",
        "Manual curriculum saved and published! Students now see this syllabus."
      );
    } catch (err) {
      notify(
        "error",
        err instanceof Error ? err.message : "Failed to save curriculum."
      );
    } finally {
      setSaving(false);
    }
  };

  const loadFromPublished = () => {
    if (published?.classes?.length) {
      setClasses(JSON.parse(JSON.stringify(published.classes)));
      setBoard(published.board || "CBSE");
      setYearLabel(published.yearLabel || currentAcademicYear());
      notify("success", "Loaded from currently published curriculum.");
    } else {
      notify("error", "No published curriculum to load from.");
    }
  };

  const clearAll = () => {
    if (!classes.length) return;
    const ok = window.confirm(
      "Clear all classes? This only clears the editor — the live published curriculum is unchanged until you save."
    );
    if (ok) setClasses([]);
  };

  return (
    <SectionCard
      title="✏️ Manual Curriculum Editor"
      description="Manually build and edit the full Class → Subject → Chapter → Concept tree. Add items one by one, or bulk paste from any source. Changes are saved to the live student-facing syllabus."
    >
      {/* Board & Year */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Board">
          <input
            className={inputClass}
            value={board}
            onChange={(e) => setBoard(e.target.value)}
            placeholder="CBSE"
          />
        </Field>
        <Field label="Academic year">
          <input
            className={inputClass}
            value={yearLabel}
            onChange={(e) => setYearLabel(e.target.value)}
            placeholder={currentAcademicYear()}
          />
        </Field>
      </div>

      {/* Stats bar */}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Editor stats
        </span>
        <span className="text-xs font-medium text-slate-700">
          {stats.classes} classes · {stats.subjects} subjects ·{" "}
          {stats.chapters} chapters · {stats.topics} concepts
        </span>
      </div>

      {/* Action bar */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={addClass}
          className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
        >
          + Add class
        </button>
        <button
          type="button"
          onClick={() => setBulkClassOpen(!bulkClassOpen)}
          className="rounded-lg bg-violet-100 px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-200"
        >
          📋 Paste classes
        </button>
        <button
          type="button"
          onClick={() => setJsonPasteOpen(!jsonPasteOpen)}
          className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-200"
        >
          {`{ }`} JSON import
        </button>
        <button
          type="button"
          onClick={loadFromPublished}
          className="rounded-lg bg-blue-100 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-200"
        >
          Load from published
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-lg bg-rose-100 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-200"
        >
          Clear all
        </button>
      </div>

      {/* Bulk add classes */}
      {bulkClassOpen && (
        <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
          <p className="text-[10px] text-slate-600">
            Paste class names — one per line. Icons auto-assigned (🎒 for 6-8, 📚
            for 9-10, 🎓 for 11-12)
          </p>
          <textarea
            className={`${textareaClass} !min-h-[70px] !text-xs mt-1`}
            value={bulkClassText}
            onChange={(e) => setBulkClassText(e.target.value)}
            placeholder={"Class 6\nClass 7\nClass 8\nClass 9\nClass 10\nClass 11\nClass 12"}
          />
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              onClick={addBulkClasses}
              className="rounded-md bg-violet-600 px-3 py-1.5 text-[10px] font-bold text-white"
            >
              Add {parseBulkLines(bulkClassText).length || ""} classes
            </button>
            <button
              type="button"
              onClick={() => {
                setBulkClassOpen(false);
                setBulkClassText("");
              }}
              className="rounded-md px-3 py-1.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* JSON paste */}
      {jsonPasteOpen && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-[10px] text-slate-600">
            Paste a JSON array of classes or{" "}
            <code className="font-mono">{"{ \"classes\": [...] }"}</code>.
            Shape:{" "}
            <code className="font-mono text-[9px]">
              {"[{ \"name\":\"Class 10\", \"icon\":\"📚\", \"subjects\":[{\"name\":\"Math\",\"chapters\":[{\"name\":\"Ch1\",\"topics\":[\"concept\"]}]}] }]"}
            </code>
          </p>
          <textarea
            className={`${textareaClass} !min-h-[120px] !text-[10px] font-mono mt-1`}
            value={jsonPasteText}
            onChange={(e) => {
              setJsonPasteText(e.target.value);
              setJsonError(null);
            }}
            placeholder={'[\n  {\n    "name": "Class 10",\n    "icon": "📚",\n    "subjects": [\n      {\n        "name": "Mathematics",\n        "icon": "📐",\n        "chapters": [\n          {\n            "name": "Real Numbers",\n            "topics": ["Euclid\'s Division Lemma", "Fundamental Theorem of Arithmetic"]\n          }\n        ]\n      }\n    ]\n  }\n]'}
          />
          {jsonError && (
            <p className="mt-1 text-[10px] font-medium text-red-600">
              {jsonError}
            </p>
          )}
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
              className="rounded-md px-3 py-1.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Classes tree */}
      <div className="mt-4 space-y-4">
        {classes.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-300 px-4 py-10 text-center">
            <p className="text-sm font-medium text-slate-500">
              No classes yet
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Click "+ Add class" or "📋 Paste classes" to start building your
              curriculum manually.
            </p>
          </div>
        ) : (
          classes.map((cls, ci) => (
            <ClassCard
              key={cls.key || ci}
              cls={cls}
              onUpdate={(updated) => {
                const next = [...classes];
                next[ci] = updated;
                setClasses(next);
              }}
              onDelete={() => {
                setClasses(classes.filter((_, i) => i !== ci));
              }}
            />
          ))
        )}
      </div>

      {/* Save button */}
      {classes.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <PrimaryButton
            loading={saving}
            onClick={() => void saveLive()}
          >
            💾 Save & publish to students
          </PrimaryButton>
          <SecondaryButton onClick={loadFromPublished}>
            Reload from published
          </SecondaryButton>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
        Changes stay in this editor until you click{" "}
        <span className="font-semibold">Save & publish</span>. The live
        student-facing syllabus is only updated when you explicitly save.
        Existing student tests are never deleted.
      </p>
    </SectionCard>
  );
}
