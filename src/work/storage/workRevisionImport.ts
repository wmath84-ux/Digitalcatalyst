import { parseMarkdownCards } from "../../revision/recall/lib/markdown-importer";
import type { WorkRevisionCardInput } from "./workRevisionDb";

export type WorkRevisionImportResult = {
  cards: WorkRevisionCardInput[];
  format: "csv" | "tsv" | "markdown" | "json";
  kind: "flashcards" | "brain";
  skipped: number;
};

function parseDelimited(text: string, delimiter: "," | "\t"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && char === delimiter) {
      row.push(cell.trim());
      cell = "";
    } else if (!quoted && (char === "\n" || char === "\r")) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

const headerKey = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const splitOptions = (value: string): string[] => value.split(/\s*(?:\||;|\n)\s*/).map((part) => part.trim()).filter(Boolean).slice(0, 6);

function answerIndex(options: string[], answer: string): number {
  const numeric = Number(answer);
  if (Number.isInteger(numeric) && answer.trim() !== "" && numeric >= 0 && numeric < options.length) return numeric;
  const letter = answer.trim().toUpperCase().match(/^([A-F])(?:[.)])?$/)?.[1];
  if (letter) return letter.charCodeAt(0) - 65;
  return options.findIndex((option) => option.toLowerCase() === answer.trim().toLowerCase());
}

function fromJson(text: string): WorkRevisionCardInput[] {
  const parsed = JSON.parse(text) as unknown;
  const list = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { cards?: unknown }).cards)
      ? (parsed as { cards: unknown[] }).cards
      : [];
  const cards: WorkRevisionCardInput[] = [];
  for (const value of list) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const front = String(row.front ?? row.question ?? row.prompt ?? "").trim();
    const back = String(row.back ?? row.answer ?? row.response ?? "").trim();
    const options = Array.isArray(row.options) ? row.options.map(String).map((part) => part.trim()).filter(Boolean).slice(0, 6) : [];
    const rawIndex = row.correctIndex ?? row.correct_index ?? row.answerIndex;
    const index = rawIndex === undefined ? -1 : Number(rawIndex);
    if (front && options.length >= 2 && Number.isInteger(index) && index >= 0 && index < options.length) {
      cards.push({
        front,
        back: back || options[index],
        explanation: String(row.explanation ?? ""),
        options,
        correctIndex: index,
        cardType: "mcq",
        source: "bulk-import",
      });
    } else if (front && back) {
      cards.push({
        front,
        back,
        hint: String(row.hint ?? ""),
        tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
        cardType: "basic",
        source: "bulk-import",
      });
    }
  }
  return cards;
}

function fromTable(text: string, delimiter: "," | "\t"): { cards: WorkRevisionCardInput[]; kind: "flashcards" | "brain"; skipped: number } {
  const rows = parseDelimited(text, delimiter);
  if (rows.length === 0) return { cards: [], kind: "flashcards", skipped: 0 };
  const first = rows[0].map(headerKey);
  const headerNames = new Set(["front", "back", "question", "prompt", "answer", "options", "choices", "correct", "correctanswer", "correctindex", "answerindex"]);
  const hasHeader = first.some((cell) => headerNames.has(cell));
  const data = hasHeader ? rows.slice(1) : rows;
  const indexOf = (...names: string[]) => first.findIndex((cell) => names.includes(cell));
  const frontColumn = hasHeader ? indexOf("front", "question", "prompt") : 0;
  const backColumn = hasHeader ? indexOf("back", "answer", "response") : 1;
  const optionsColumn = hasHeader ? indexOf("options", "choices") : -1;
  const correctColumn = hasHeader ? indexOf("correct", "correctanswer", "correctindex", "answerindex") : -1;
  const explanationColumn = hasHeader ? indexOf("explanation", "why") : -1;
  const hintColumn = hasHeader ? indexOf("hint") : -1;
  const tagsColumn = hasHeader ? indexOf("tags", "tag") : -1;
  const brain = optionsColumn >= 0;
  let skipped = 0;
  const cards: WorkRevisionCardInput[] = [];

  for (const row of data) {
    const front = String(row[frontColumn] ?? "").trim();
    const back = String(row[backColumn] ?? "").trim();
    if (!front) {
      skipped += 1;
      continue;
    }
    if (brain) {
      const options = splitOptions(String(row[optionsColumn] ?? ""));
      const answer = String(row[correctColumn >= 0 ? correctColumn : backColumn] ?? "").trim();
      let correctIndex = answerIndex(options, answer);
      if (correctIndex < 0 && answer && options.length < 6 && !options.some((option) => option.toLowerCase() === answer.toLowerCase())) {
        options.push(answer);
        correctIndex = options.length - 1;
      }
      if (options.length < 2 || correctIndex < 0) {
        skipped += 1;
        continue;
      }
      cards.push({
        front,
        back: options[correctIndex],
        options,
        correctIndex,
        explanation: String(row[explanationColumn] ?? "").trim(),
        cardType: "mcq",
        source: "bulk-import",
      });
    } else if (back) {
      cards.push({
        front,
        back,
        hint: String(row[hintColumn] ?? "").trim(),
        tags: String(row[tagsColumn] ?? "").split(/[;,]/).map((tag) => tag.trim()).filter(Boolean),
        cardType: "basic",
        source: "bulk-import",
      });
    } else {
      skipped += 1;
    }
  }
  return { cards, kind: brain ? "brain" : "flashcards", skipped };
}

export function parseWorkRevisionImport(text: string, fileName: string): WorkRevisionImportResult {
  const clean = String(text ?? "").replace(/^\uFEFF/, "");
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "json") {
    const cards = fromJson(clean);
    return { cards, format: "json", kind: cards.some((card) => card.cardType === "mcq") ? "brain" : "flashcards", skipped: 0 };
  }
  if (ext === "md" || ext === "markdown") {
    const cards = parseMarkdownCards(clean).map((card) => ({ ...card, cardType: "basic" as const, source: "bulk-import" as const }));
    return { cards, format: "markdown", kind: "flashcards", skipped: 0 };
  }
  const delimiter = ext === "tsv" || ext === "txt" ? "\t" : ",";
  const parsed = fromTable(clean, delimiter);
  return {
    ...parsed,
    format: delimiter === "\t" ? "tsv" : "csv",
  };
}
