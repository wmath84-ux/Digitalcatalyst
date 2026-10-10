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
  /**
   * The raw value of an “Answer: …” line that did not match any option (e.g.
   * “Answer: Z”). Set only when the answer could not be resolved, so the caller
   * can say exactly what was wrong instead of “no answer”.
   */
  answerHint?: string;
};

/** A block the parser could not turn into a question, with where it starts. */
export type ParseProblem = {
  /** 1-based line of the pasted text where the block starts. */
  line: number;
  message: string;
};

export type ParseDetailedResult = {
  questions: ParsedQuestion[];
  problems: ParseProblem[];
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

type BlockResult = { question: ParsedQuestion | null; problem: ParseProblem | null };

function parseBlock(lines: string[], startLine: number): BlockResult {
  if (lines.length === 0) return { question: null, problem: null };

  const numbered = isQuestionStart(lines[0]);
  let prompt = stripPromptNumber(lines[0]);
  const options: { key: string; text: string; marked: boolean }[] = [];
  let explanation = "";
  let answerValue: string | null = null;
  // Text between the numbered prompt and its first option is the rest of the
  // question (a prompt that wraps onto several lines), not the explanation.
  let promptOpen = true;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const answerMatch = line.match(ANSWER_RE);
    if (answerMatch) {
      answerValue = answerMatch[1].trim();
      promptOpen = false;
      continue;
    }

    const explanationMatch = line.match(EXPLANATION_RE);
    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
      promptOpen = false;
      continue;
    }

    const optMatch = line.match(OPTION_RE);
    if (optMatch) {
      const key = optMatch[1];
      const { clean, marked } = detectMarker(optMatch[2]);
      options.push({ key: key.toUpperCase(), text: clean, marked });
      promptOpen = false;
      continue;
    }

    // A numbered line that never got split off (no options yet) is left to the
    // explanation path, as before, rather than silently joined to the prompt.
    if (promptOpen && options.length === 0 && !isQuestionStart(line)) {
      prompt = prompt ? `${prompt} ${line}` : line;
      continue;
    }

    // Anything else after the options is extra explanation text.
    if (explanation) explanation += " " + line;
    else explanation = line;
  }

  const shown = prompt.length > 60 ? `${prompt.slice(0, 57)}…` : prompt;
  if (!prompt) {
    return { question: null, problem: { line: startLine, message: "question text is missing" } };
  }
  if (options.length < 2) {
    // Only a numbered block (or one that already has option lines) is a
    // question the author meant to write; other text is ignored as preamble.
    if (!numbered && options.length === 0) return { question: null, problem: null };
    return {
      question: null,
      problem: {
        line: startLine,
        message: `“${shown}” has ${options.length} option line${options.length === 1 ? "" : "s"} — at least 2 (A. B. …) are needed`,
      },
    };
  }

  const optionTexts = options.map((o) => o.text);
  let correctIndex = options.findIndex((o) => o.marked);
  let detected = correctIndex >= 0;

  if (!detected && answerValue) {
    correctIndex = resolveAnswerValue(answerValue, optionTexts);
    detected = correctIndex >= 0;
  }

  return {
    question: {
      prompt,
      options: optionTexts,
      correctIndex: detected ? correctIndex : -1,
      explanation,
      detected,
      ...(!detected && answerValue ? { answerHint: answerValue } : {}),
    },
    problem: null,
  };
}

/**
 * Parse pasted text and also report every block that could not become a
 * question (no question text, fewer than two options). `questions` is exactly
 * what `parseQuestionText` returns, so callers can show the reasons alongside
 * the preview.
 */
export function parseQuestionTextDetailed(text: string): ParseDetailedResult {
  const normalized = String(text ?? "").replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  const blocks: { lines: string[]; start: number }[] = [];
  let current: string[] = [];
  let currentStart = 0;

  const flush = () => {
    if (current.length > 0) {
      blocks.push({ lines: current, start: currentStart });
      current = [];
    }
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      flush();
      return;
    }
    if (current.length === 0) {
      current.push(line);
      currentStart = index + 1;
      return;
    }
    // A new numbered line starts a new question when the current block already
    // has options, or when it is plain text (a preamble such as “Here are your
    // questions:”). A numbered line after a numbered prompt with no options yet
    // stays with it, as before.
    if (isQuestionStart(line)) {
      const hasOptions = current.slice(1).some((l) => OPTION_RE.test(l));
      if (hasOptions || !isQuestionStart(current[0])) {
        flush();
        current.push(line);
        currentStart = index + 1;
        return;
      }
    }
    current.push(line);
  });
  flush();

  const questions: ParsedQuestion[] = [];
  const problems: ParseProblem[] = [];
  for (const block of blocks) {
    const { question, problem } = parseBlock(block.lines, block.start);
    if (question) questions.push(question);
    if (problem) problems.push(problem);
  }
  return { questions, problems };
}

/**
 * Blank the bare code-fence lines (```` ``` ```` or ```` ```text ````) that AI
 * chat tools wrap a reply in. They are not part of the question format, and
 * left in place they would be read as explanation text of the last question.
 * Each fence becomes an empty line rather than being removed, so “Line N”
 * numbers in parser problems still point at the text the user pasted.
 */
export function stripCodeFenceLines(text: string): string {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => (/^\s*```[\w-]*\s*$/.test(line) ? "" : line))
    .join("\n");
}

export function parseQuestionText(text: string): ParsedQuestion[] {
  return parseQuestionTextDetailed(text).questions;
}

/** Produce a copy-paste friendly "Answer: X" so undetected items are easy to fix. */
export function describeQuestion(q: ParsedQuestion, index: number): string {
  const correct = q.detected ? `${LETTERS[q.correctIndex]}. ${q.options[q.correctIndex]}` : "NOT DETECTED";
  return `Q${index + 1}. ${q.prompt}\n` + q.options.map((o, i) => `   ${LETTERS[i]}. ${o}`).join("\n") + `\n   Answer: ${correct}`;
}
