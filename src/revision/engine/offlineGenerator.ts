// Offline question generator.
//
// This is the zero-configuration fallback for the admin "Generate with AI"
// action when no AI provider key is configured (or the AI endpoint fails).
// It produces genuinely correct maths/arithmetic questions from scratch and,
// for other subjects, a small set of clearly-labelled study-skill questions so
// the button always yields usable starting content. Real topic questions come
// from the AI endpoint or the bulk-paste importer.

import type { ParsedQuestion } from "./bulkParser";

type GenerateInput = {
  subjectName: string;
  topicName: string;
  count: number;
  difficulty: "easy" | "medium" | "hard";
  /** Selected AI question type — the offline engine honours it so a
   *  "Theory only" selection never silently falls back to arithmetic. */
  questionMode?: "mixed" | "theory" | "application";
};

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const shuffle = <T,>(arr: T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function optionsFor(correct: string, distractors: string[]): { options: string[]; correctIndex: number } {
  const opts = shuffle([correct, ...distractors.slice(0, 3)]);
  return { options: opts, correctIndex: opts.indexOf(correct) };
}

function isMathSubject(subject: string, topic: string): boolean {
  const hay = `${subject} ${topic}`.toLowerCase();
  return /math|algebra|arithmetic|geometry|number|calculation|quantitative/.test(hay);
}

function mathQuestions(count: number, difficulty: "easy" | "medium" | "hard"): ParsedQuestion[] {
  const out: ParsedQuestion[] = [];
  const range = difficulty === "easy" ? [2, 20] : difficulty === "medium" ? [10, 99] : [50, 500];
  const build = (prompt: string, correct: string, distractors: string[], explanation: string): ParsedQuestion => {
    const { options, correctIndex } = optionsFor(correct, distractors);
    return { prompt, options, correctIndex, explanation, detected: true };
  };
  while (out.length < count) {
    const kind = out.length % 6;
    if (kind === 0) {
      const a = rand(range[0], range[1]);
      const b = rand(range[0], range[1]);
      out.push(build(
        `What is ${a} + ${b}?`,
        String(a + b),
        [`${a + b + rand(1, 9)}`, `${Math.max(0, a + b - rand(1, 9))}`, `${a + b + 10}`],
        `${a} + ${b} = ${a + b}.`,
      ));
    } else if (kind === 1) {
      const a = rand(range[0], range[1]);
      const b = rand(range[0], Math.min(a, range[1]));
      out.push(build(
        `What is ${a} - ${b}?`,
        String(a - b),
        [`${a - b + rand(1, 9)}`, `${Math.max(0, a - b - rand(1, 9))}`, `${a + b}`],
        `${a} - ${b} = ${a - b}.`,
      ));
    } else if (kind === 2) {
      const a = rand(2, Math.max(2, Math.floor(range[1] / 10)));
      const b = rand(2, 12);
      out.push(build(
        `What is ${a} × ${b}?`,
        String(a * b),
        [`${a * b + b}`, `${Math.max(0, a * b - b)}`, `${a * (b + 1)}`],
        `${a} × ${b} = ${a * b}.`,
      ));
    } else if (kind === 3) {
      const b = rand(2, 12);
      const result = rand(2, 20);
      const a = b * result;
      out.push(build(
        `What is ${a} ÷ ${b}?`,
        String(result),
        [`${result + 1}`, `${Math.max(0, result - 1)}`, `${result * 2}`],
        `${a} ÷ ${b} = ${result}.`,
      ));
    } else if (kind === 4) {
      const pct = [10, 20, 25, 50, 75][rand(0, 4)];
      const base = rand(20, 500);
      const value = Math.round((base * pct) / 100);
      out.push(build(
        `What is ${pct}% of ${base}?`,
        String(value),
        [`${value + Math.round(base / 10)}`, `${Math.max(0, value - Math.round(base / 10))}`, `${value * 2}`],
        `${pct}% of ${base} = ${value}.`,
      ));
    } else {
      const a = rand(1, 20);
      const b = rand(1, 30);
      out.push(build(
        `If x + ${a} = ${a + b}, what is the value of x?`,
        String(b),
        [`${b + a}`, `${Math.max(0, b - a)}`, `${b + 1}`],
        `x = ${a + b} - ${a} = ${b}.`,
      ));
    }
  }
  return out;
}

const SUBJECT_POOL = ["Mathematics", "Science", "English", "Computer Science", "General Knowledge", "History", "Geography"];

function genericQuestions(subjectName: string, topicName: string, count: number): ParsedQuestion[] {
  const out: ParsedQuestion[] = [];
  const otherSubjects = SUBJECT_POOL.filter((s) => s.toLowerCase() !== subjectName.toLowerCase());
  const templates = [
    {
      prompt: `${topicName} is best studied under which subject?`,
      correct: subjectName,
      distractors: shuffle(otherSubjects).slice(0, 3),
      explanation: `${topicName} belongs to the ${subjectName} subject area.`,
    },
    {
      prompt: `Which study habit most improves your mastery of ${topicName}?`,
      correct: "A short daily practice test",
      distractors: ["Cramming the night before", "Reading notes once", "Skipping review sessions"],
      explanation: "Consistent daily retrieval practice strengthens long-term memory.",
    },
    {
      prompt: `When you get a ${topicName} question wrong, what should you do first?`,
      correct: "Read the explanation and retry",
      distractors: ["Move on and forget it", "Guess faster next time", "Skip the whole topic"],
      explanation: "Reviewing the explanation turns mistakes into learning.",
    },
    {
      prompt: `What is the best way to measure progress in ${topicName}?`,
      correct: "Track accuracy over many attempts",
      distractors: ["Count hours of reading", "Compare with a friend", "Memorise the question list"],
      explanation: "Accuracy trends show real improvement over time.",
    },
  ];
  for (let i = 0; i < count; i++) {
    const t = templates[i % templates.length];
    const built = optionsFor(t.correct, t.distractors);
    out.push({
      prompt: t.prompt,
      options: built.options,
      correctIndex: built.correctIndex,
      explanation: t.explanation,
      detected: true,
    });
  }
  return out;
}

export function generateOfflineQuestions(input: GenerateInput): ParsedQuestion[] {
  const count = Math.max(1, Math.min(20, Math.round(input.count || 5)));
  const mode = input.questionMode ?? "mixed";

  // Theory only: the offline engine never fabricates correct arithmetic, so
  // even for a maths subject it must fall back to conceptual/study questions
  // instead of solve-type arithmetic — otherwise a "Theory only" test would
  // still show computation questions.
  if (mode === "theory") {
    return genericQuestions(input.subjectName, input.topicName, count);
  }

  if (isMathSubject(input.subjectName, input.topicName)) {
    return mathQuestions(count, input.difficulty);
  }
  return genericQuestions(input.subjectName, input.topicName, count);
}
