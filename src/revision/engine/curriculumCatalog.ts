// Latest-year exam curriculum published by admin for the student planner.
//
// Shape matches the student generator's Class → Subject → Chapter → Concept
// tree. Built-in CURRICULUM is the fallback until admin replaces it.

import type { CurriculumChapter, CurriculumClass, CurriculumSubject, CurriculumTopic } from "../data/curriculum";

export type PlanningCurriculum = {
  yearLabel: string;
  board: string;
  prompt: string;
  updatedAt: string;
  classes: CurriculumClass[];
};

export const PLANNING_CLASSES = [
  { key: "class-6", name: "Class 6", icon: "🎒" },
  { key: "class-7", name: "Class 7", icon: "🎒" },
  { key: "class-8", name: "Class 8", icon: "🎒" },
  { key: "class-9", name: "Class 9", icon: "📚" },
  { key: "class-10", name: "Class 10", icon: "📚" },
  { key: "class-11", name: "Class 11", icon: "🎓" },
  { key: "class-12", name: "Class 12", icon: "🎓" },
] as const;

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

export function currentAcademicYear(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = month >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function defaultCurriculumPrompt(): string {
  return [
    "You are an expert Indian school-curriculum planner.",
    "Build the LATEST official exam syllabus for {{board}} academic year {{year}}, for {{className}} only.",
    "",
    "Include ONLY subjects, chapters and concepts that are included in the current-year board/NCERT exam curriculum.",
    "Omit dropped, deleted or 'for internal assessment only' topics.",
    "",
    "Return ONLY valid JSON in this exact shape:",
    '{',
    '  "name": "{{className}}",',
    '  "icon": "📚",',
    '  "subjects": [',
    '    {',
    '      "name": "Mathematics",',
    '      "icon": "📐",',
    '      "chapters": [',
    '        { "name": "Real Numbers", "topics": ["Euclid\'s division lemma", "Fundamental theorem of arithmetic"] }',
    "      ]",
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Use official NCERT / {{board}} names.",
    "- 4 to 8 subjects typical for this class.",
    "- Each subject: 4 to 10 chapters that are in the current year.",
    "- Each chapter: 3 to 8 included concepts/topics.",
    "- No markdown, no code fences, no commentary outside JSON.",
  ].join("\n");
}

export function fillCurriculumPrompt(template: string, vars: { board: string; year: string; className: string }): string {
  // split/join (not String.replaceAll) keeps this ES2020-lib safe and avoids
  // any regex / replacement-string special-character surprises from admin input.
  return template
    .split("{{board}}").join(vars.board)
    .split("{{year}}").join(vars.year)
    .split("{{className}}").join(vars.className);
}

const slug = (value: string) =>
  value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `item-${Math.random().toString(36).slice(2, 8)}`;

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const cleanName = (value: unknown, fallback: string) => {
  const text = String(value ?? "").trim().slice(0, 80);
  return text || fallback;
};

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

export function normalizeCurriculumClass(raw: unknown, fallbackName = "Class"): CurriculumClass | null {
  const row = asRecord(raw);
  const nested = asRecord(row.class);
  const src = row.subjects ? row : nested.subjects ? nested : row;
  const name = cleanName(src.name ?? row.name, fallbackName);
  const subjectsRaw = Array.isArray(src.subjects) ? src.subjects : Array.isArray(row.subjects) ? row.subjects : [];
  const subjectKeys = new Set<string>();
  const subjects: CurriculumSubject[] = [];
  for (const s of subjectsRaw.slice(0, 12)) {
    const item = asRecord(s);
    const sName = cleanName(item.name, "");
    if (!sName) continue;
    const chaptersRaw = Array.isArray(item.chapters) ? item.chapters : [];
    const chapterKeys = new Set<string>();
    const chapters: CurriculumChapter[] = [];
    for (const ch of chaptersRaw.slice(0, 16)) {
      const chItem = asRecord(ch);
      const chName = cleanName(chItem.name, "");
      if (!chName) continue;
      const topicsRaw = Array.isArray(chItem.topics)
        ? chItem.topics
        : Array.isArray(chItem.concepts)
          ? chItem.concepts
          : [];
      const topicKeys = new Set<string>();
      const topics: CurriculumTopic[] = [];
      for (const t of topicsRaw.slice(0, 12)) {
        const tName = typeof t === "string" ? cleanName(t, "") : cleanName(asRecord(t).name, "");
        if (!tName) continue;
        topics.push({ key: uniqueKey(tName, topicKeys), name: tName });
      }
      // Keep a named chapter even while it has no concepts yet. The previous
      // behaviour silently dropped chapters with zero topics and subjects with
      // zero chapters, so an admin who saved a partially-filled tree lost the
      // ENTIRE `planningCurriculum` (normalizePlanningCurriculum returned null)
      // and students kept seeing the built-in fallback syllabus. Preserving
      // named nodes makes the round-trip lossless: what the admin saves is what
      // students see, and the cascading picker simply shows an empty list under
      // an incomplete branch.
      chapters.push({ key: uniqueKey(chName, chapterKeys), name: chName, topics });
    }
    const icon = cleanName(item.icon, SUBJECT_ICONS[sName.toLowerCase()] || "📘");
    subjects.push({ key: uniqueKey(sName, subjectKeys), name: sName, icon: icon.slice(0, 4), chapters });
  }
  if (!subjects.length) return null;
  const icon = cleanName(src.icon ?? row.icon, PLANNING_CLASSES.find((c) => c.name === name)?.icon || "🎓");
  return { key: slug(name), name, icon: icon.slice(0, 4), subjects };
}

export function normalizePlanningCurriculum(raw: unknown): PlanningCurriculum | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const classesRaw = Array.isArray(row.classes) ? row.classes : [];
  const classes = classesRaw
    .map((c, i) => normalizeCurriculumClass(c, PLANNING_CLASSES[i]?.name || `Class ${i + 1}`))
    .filter((c): c is CurriculumClass => Boolean(c));
  if (!classes.length) return null;
  return {
    yearLabel: String(row.yearLabel || "").trim().slice(0, 20) || currentAcademicYear(),
    board: String(row.board || "").trim().slice(0, 40) || "CBSE",
    prompt: String(row.prompt || "").trim().slice(0, 8000),
    updatedAt: String(row.updatedAt || "").trim(),
    classes,
  };
}

export function curriculumStats(classes: CurriculumClass[]): { classes: number; subjects: number; chapters: number; topics: number } {
  let subjects = 0;
  let chapters = 0;
  let topics = 0;
  for (const cls of classes) {
    subjects += cls.subjects.length;
    for (const s of cls.subjects) {
      chapters += s.chapters.length;
      for (const ch of s.chapters) topics += ch.topics.length;
    }
  }
  return { classes: classes.length, subjects, chapters, topics };
}

export const CURRICULUM_SYSTEM_PROMPT = [
  "You output only JSON for one school class syllabus.",
  'Shape: {"name":"Class 10","icon":"📚","subjects":[{"name":"Mathematics","icon":"📐","chapters":[{"name":"Real Numbers","topics":["concept"]}]}]}',
  "Include only current-year included exam topics. No markdown, no commentary.",
].join(" ");
