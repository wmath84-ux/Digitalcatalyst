// Plain-text question parser for the admin bulk importer.
//
// Accepts the "normal text" format the admin pastes and turns it into
// structured questions WITHOUT any manual step:
//
//   1. What is 2 + 2?
//   A. 3
//   B. 4 ✓            <- correct answer detected via markers
//   C. 5
//   D. 6
//   Explanation: 2 + 2 = 4
//
// Supported correct-answer hints: ✓ ✔ √ * ✅ (correct) [correct] **bold**,
// or a separate "Answer: B" / "Ans: 2" line. Options may be lettered
// (A. / a) / (a) / A:) or numbered (1. / 1) / (1)).

export type ParsedQuestion = {
  prompt: string;
  options: string[];
  correctIndex: number; // -1 when it could not be detected
  explanation: string;
  detected: boolean;
};

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// Matches "A. text", "A) text", "(a) text", "1. text", "1) text", "(1) text", "A - text"…
const OPTION_RE = /^\s*\(?\s*([A-Ha-h]|[1-9]\d?)\s*\)?\s*[.)\]:：\-–—]?\s+(.*)$/;

const ANSWER_RE = /^\s*(?:correct\s+)?ans(?:wer)?\s*[:：\-–—]?\s*(.+)$/i;
const EXPLANATION_RE = /^\s*(?:explanation|explain|why|reason|note|hint)\s*[:：\-–—]\s*(.+)$/i;

// Any of these markers on an option line means "this is the right answer".
const CORRECT_MARKERS = ["(correct answer)", "(correct)", "[correct]", "✅", "✓", "✔", "√", "(ans)", "[ans]"];

function stripPromptNumber(line: string): string {
  return line.replace(/^\s*(?:Q(?:uestion)?\.?\s*)?\d{1,3}\s*[.):\-–—]+\s*/i, "").trim();
}

function isQuestionStart(line: string): boolean {
  return /^\s*(?:Q(?:uestion)?\.?\s*)?\d{1,3}\s*[.):\-–—]+\s*\S/.test(line);
}

function detectMarker(text: string): { clean: string; marked: boolean } {
  let clean = text.trim();
  // **bold** wraps the correct option.
  const bold = clean.match(/^\*\*(.+)\*\*$/);
  if (bold) return { clean: bold[1].trim(), marked: true };
  for (const marker of CORRECT_MARKERS) {
    if (clean.endsWith(marker)) {
      return { clean: clean.slice(0, -marker.length).trim(), marked: true };
    }
    if (clean.startsWith(marker)) {
      return { clean: clean.slice(marker.length).trim(), marked: true };
    }
  }
  // Trailing asterisk(s)
  if (/\*+\s*$/.test(clean)) {
    return { clean: clean.replace(/\*+\s*$/, "").trim(), marked: true };
  }
  if (/^\s*\*+/.test(clean) && !/\*/.test(clean.replace(/^\s*\*+/, ""))) {
    return { clean: clean.replace(/^\s*\*+/, "").trim(), marked: true };
  }
  return { clean, marked: false };
}

function resolveAnswerValue(value: string, options: string[]): number {
  const v = value.trim().replace(/[).:\s]+$/, "");
  if (!v) return -1;
  const letterIndex = LETTERS.indexOf(v.toUpperCase());
  if (letterIndex >= 0 && letterIndex < options.length) return letterIndex;
  const numeric = Number(v);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= options.length) return numeric - 1;
  // Full-text match (case-insensitive, trimmed)
  const idx = options.findIndex((o) => o.trim().toLowerCase() === v.toLowerCase());
  return idx;
}

function parseBlock(lines: string[]): ParsedQuestion | null {
  if (lines.length === 0) return null;

  const prompt = stripPromptNumber(lines[0]);
  const options: { key: string; text: string; marked: boolean }[] = [];
  let explanation = "";
  let answerValue: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const answerMatch = line.match(ANSWER_RE);
    if (answerMatch) {
      answerValue = answerMatch[1].trim();
      continue;
    }

    const explanationMatch = line.match(EXPLANATION_RE);
    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
      continue;
    }

    const optMatch = line.match(OPTION_RE);
    if (optMatch) {
      const key = optMatch[1];
      const { clean, marked } = detectMarker(optMatch[2]);
      options.push({ key: key.toUpperCase(), text: clean, marked });
      continue;
    }

    // Anything else after the options is extra explanation text.
    if (explanation) explanation += " " + line;
    else explanation = line;
  }

  if (!prompt || options.length < 2) return null;

  const optionTexts = options.map((o) => o.text);
  let correctIndex = options.findIndex((o) => o.marked);
  let detected = correctIndex >= 0;

  if (!detected && answerValue) {
    correctIndex = resolveAnswerValue(answerValue, optionTexts);
    detected = correctIndex >= 0;
  }

  return {
    prompt,
    options: optionTexts,
    correctIndex: detected ? correctIndex : -1,
    explanation,
    detected,
  };
}

export function parseQuestionText(text: string): ParsedQuestion[] {
  const normalized = String(text ?? "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  const blocks: string[][] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) {
      blocks.push(current);
      current = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    if (current.length === 0) {
      current.push(line);
      continue;
    }
    // A new numbered line after we already have a prompt + options starts a
    // new question (handles pastes with no blank line between questions).
    if (isQuestionStart(line)) {
      const hasOptions = current.slice(1).some((l) => OPTION_RE.test(l));
      if (hasOptions) {
        flush();
        current.push(line);
        continue;
      }
    }
    current.push(line);
  }
  flush();

  return blocks
    .map(parseBlock)
    .filter((q): q is ParsedQuestion => Boolean(q));
}

/** Produce a copy-paste friendly "Answer: X" so undetected items are easy to fix. */
export function describeQuestion(q: ParsedQuestion, index: number): string {
  const correct = q.detected ? `${LETTERS[q.correctIndex]}. ${q.options[q.correctIndex]}` : "NOT DETECTED";
  return `Q${index + 1}. ${q.prompt}\n` + q.options.map((o, i) => `   ${LETTERS[i]}. ${o}`).join("\n") + `\n   Answer: ${correct}`;
}
