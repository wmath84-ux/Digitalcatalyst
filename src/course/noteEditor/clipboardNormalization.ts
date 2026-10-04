// src/course/noteEditor/clipboardNormalization.ts
//
// CLIPBOARD INPUT → canonical, safe note HTML.
//
// The editor never stores or renders clipboard HTML directly. This module:
//   1. extracts common KaTeX / MathJax / MathML / TeX clipboard structures;
//   2. parses Markdown only when the plain-text paste looks like Markdown;
//   3. finds delimited and high-confidence raw LaTeX with a small stateful
//      scanner (code spans/fences are deliberately skipped);
//   4. writes formulas as data-note-math markers containing editable TeX;
//   5. applies the note HTML allow-list before returning the normalized input.
//
// It deliberately does not render math. BlockNote imports the markers as native
// inline/block nodes, persistence stores those nodes as safe HTML, and KaTeX is
// used only by the editor's math node view and read-only preview renderer.

import { marked } from "marked";
import { plainToRichText, sanitizeRichText } from "../../utils/richText";
import { MAX_NOTE_MATH_SOURCE_LENGTH, mathSourceText } from "../../utils/noteMath";

// Standard KaTeX commands used to recognize undelimited source from copied
// educational explanations. Delimited math may use any command KaTeX supports;
// KaTeX performs the definitive validation at render time.
const RAW_COMMAND_ARITY: Readonly<Record<string, number>> = Object.fromEntries(
  [
    [1, String.raw`mathbb mathbf mathit mathrm mathsf mathtt mathcal mathfrak mathscr text textbf textit textrm textsf operatorname overline underline widehat widecheck hat tilde bar vec dot ddot dddot acute grave check breve ring cancel overrightarrow overleftarrow underbrace overbrace color boxed phantom vphantom hphantom sqrt`],
    [2, String.raw`frac dfrac tfrac binom dbinom tbinom overset underset stackrel atop`],
    [0, String.raw`pi Pi alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi omicron rho varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega dots ldots cdots vdots ddots prime infty partial nabla sum prod coprod int iint iiint oint ointclockwise pm mp times div cdot ast star bullet circ le leq ge geq neq ne approx sim simeq equiv cong propto to mapsto rightarrow leftarrow Rightarrow Leftarrow Leftrightarrow iff in notin ni subset supset subseteq supseteq cup cap setminus emptyset forall exists neg land lor wedge vee perp parallel angle degree sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh log ln exp lim limsup liminf max min sup inf det gcd mod bmod quad qquad enspace thinspace neg`],
  ].flatMap(([arity, commands]) => String(commands).split(/\s+/).map((command) => [command, Number(arity)])),
);

const RAW_OPERATOR_COMMANDS = new Set([
  "pm", "mp", "times", "div", "cdot", "ast", "star", "circ", "le", "leq", "ge", "geq", "neq", "ne",
  "approx", "sim", "simeq", "equiv", "cong", "propto", "to", "mapsto", "rightarrow", "leftarrow",
  "Rightarrow", "Leftarrow", "Leftrightarrow", "iff", "in", "notin", "ni", "subset", "supset", "subseteq",
  "supseteq", "cup", "cap", "setminus", "land", "lor", "wedge", "vee", "perp", "parallel",
]);

const UNICODE_OPERATORS: Readonly<Record<string, string>> = {
  "∑": String.raw`\sum`, "∏": String.raw`\prod`, "∫": String.raw`\int`, "∬": String.raw`\iint`,
  "∭": String.raw`\iiint`, "∮": String.raw`\oint`, "≤": String.raw`\leq`, "≥": String.raw`\geq`,
  "≠": String.raw`\neq`, "≈": String.raw`\approx`, "≡": String.raw`\equiv`, "∞": String.raw`\infty`,
  "×": String.raw`\times`, "÷": String.raw`\div`, "·": String.raw`\cdot`, "±": String.raw`\pm`,
  "∓": String.raw`\mp`, "→": String.raw`\to`, "←": String.raw`\leftarrow`, "⇒": String.raw`\Rightarrow`,
  "⇔": String.raw`\Leftrightarrow`, "∈": String.raw`\in`, "∉": String.raw`\notin`, "∂": String.raw`\partial`,
  "∇": String.raw`\nabla`, "∪": String.raw`\cup`, "∩": String.raw`\cap`, "∅": String.raw`\emptyset`,
};

interface TextSegment { kind: "text"; value: string }
interface MathSegment { kind: "math"; latex: string; mode: "inline" | "block" }
type Segment = TextSegment | MathSegment;

const isEscapedAt = (value: string, index: number): boolean => {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === "\\"; cursor -= 1) slashes += 1;
  return slashes % 2 === 1;
};

const isWord = (value: string | undefined): boolean => Boolean(value && /[\p{L}\p{N}]/u.test(value));

const matchingDelimiter = (value: string, start: number, delimiter: string, stopAtNewline: boolean): number => {
  for (let cursor = start; cursor <= value.length - delimiter.length; cursor += 1) {
    if (stopAtNewline && value[cursor] === "\n") return -1;
    if (value.startsWith(delimiter, cursor) && !isEscapedAt(value, cursor)) return cursor;
  }
  return -1;
};

const formulaLooksUnambiguous = (source: string): boolean => {
  const value = source.trim();
  if (!value || value.length > MAX_NOTE_MATH_SOURCE_LENGTH) return false;
  if (/\\[A-Za-z]+/.test(value)) return true;
  if (/[=<>^_±∓≤≥≠≈∑∏∫∞×÷∈∉→←⇒⇔√]/u.test(value)) return true;
  // Tiny symbols and scalar values ($x$, $R$, $2$) are common and not prose.
  if (value.length <= 3 && /^[\p{L}\p{N}().,+-]+$/u.test(value)) return true;
  // A bare integer/decimal or a simple fraction is a useful math expression;
  // longer ordinary words between dollar signs are left as literal text.
  if (/^\d+(?:\.\d+)?$/.test(value) || /^\d+\s*\/\s*\d+$/.test(value)) return true;
  return false;
};

const readGroup = (value: string, start: number, open = "{", close = "}"): number => {
  if (value[start] !== open) return -1;
  let depth = 0;
  for (let cursor = start; cursor < value.length; cursor += 1) {
    if (isEscapedAt(value, cursor)) continue;
    if (value[cursor] === open) depth += 1;
    else if (value[cursor] === close) {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
  }
  return -1;
};

interface Atom { end: number; hasScript: boolean; numeric: boolean }

const SUPER_SCRIPT_CHARS = new Set(Array.from("⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁱⁿ"));
const SUB_SCRIPT_CHARS = new Set(Array.from("₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜ"));
const UNICODE_SCRIPT_CHARS = new Set([...SUPER_SCRIPT_CHARS, ...SUB_SCRIPT_CHARS]);

const readUnicodeScript = (value: string, start: number): number => {
  const first = String.fromCodePoint(value.codePointAt(start) || 0);
  if (!UNICODE_SCRIPT_CHARS.has(first)) return -1;
  let end = start;
  while (end < value.length) {
    const char = String.fromCodePoint(value.codePointAt(end) || 0);
    if (!SUPER_SCRIPT_CHARS.has(char) && !SUB_SCRIPT_CHARS.has(char)) break;
    end += char.length;
  }
  return end;
};

const readScript = (value: string, start: number): number => {
  if (value[start] !== "^" && value[start] !== "_") return -1;
  const next = start + 1;
  if (value[next] === "{") return readGroup(value, next);
  if (value[next] === "\\") {
    const command = readTexCommand(value, next);
    return command?.end ?? -1;
  }
  const char = String.fromCodePoint(value.codePointAt(next) || 0);
  if (SUPER_SCRIPT_CHARS.has(char) || SUB_SCRIPT_CHARS.has(char)) return readUnicodeScript(value, next);
  return isWord(char) ? next + char.length : -1;
};

const readTexCommand = (value: string, start: number): Atom | null => {
  if (value[start] !== "\\" || isEscapedAt(value, start)) return null;
  const match = value.slice(start + 1).match(/^([A-Za-z]+|[^A-Za-z\s])/);
  const name = match?.[1];
  if (!name || !(name in RAW_COMMAND_ARITY) && !["left", "right", "begin", "end", ",", ";", ":", "!", " ", "\\"].includes(name)) return null;
  let end = start + 1 + name.length;
  if (value[end] === "*") end += 1;

  if (name === "begin" || name === "end") {
    let groupStart = end;
    while (value[groupStart] === " ") groupStart += 1;
    const groupEnd = readGroup(value, groupStart);
    if (groupEnd < 0) return { end, hasScript: false, numeric: false };
    const environment = value.slice(groupStart + 1, groupEnd - 1).trim();
    if (name === "begin") {
      const close = String.raw`\end{${environment}}`;
      const closeIndex = matchingDelimiter(value, groupEnd, close, false);
      if (closeIndex >= 0) return { end: closeIndex + close.length, hasScript: false, numeric: false };
    }
    end = groupEnd;
  } else {
    if (name === "sqrt" && value[end] === "[") {
      const optionalEnd = readGroup(value, end, "[", "]");
      if (optionalEnd > 0) end = optionalEnd;
    }
    const arity = RAW_COMMAND_ARITY[name] ?? 0;
    for (let argument = 0; argument < arity; argument += 1) {
      let groupStart = end;
      while (value[groupStart] === " " || value[groupStart] === "\t") groupStart += 1;
      const groupEnd = readGroup(value, groupStart);
      if (groupEnd < 0) break;
      end = groupEnd;
    }
  }

  let hasScript = false;
  while (value[end] === "^" || value[end] === "_") {
    const scriptEnd = readScript(value, end);
    if (scriptEnd < 0) break;
    hasScript = true;
    end = scriptEnd;
  }
  return { end, hasScript, numeric: false };
};

const readParenthesizedGroup = (value: string, start: number): number => {
  if (value[start] !== "(") return -1;
  let depth = 0;
  for (let cursor = start; cursor < value.length; cursor += 1) {
    if (isEscapedAt(value, cursor)) continue;
    if (value[cursor] === "(") depth += 1;
    else if (value[cursor] === ")") {
      depth -= 1;
      if (depth === 0) return cursor + 1;
    }
  }
  return -1;
};

const readTexAtom = (value: string, start: number): Atom | null => {
  if (value[start] === "\\") return readTexCommand(value, start);
  if (value[start] === "{") {
    const end = readGroup(value, start);
    return end > 0 ? { end, hasScript: false, numeric: false } : null;
  }
  if (value[start] === "(") {
    const end = readParenthesizedGroup(value, start);
    return end > 0 ? { end, hasScript: false, numeric: false } : null;
  }
  const char = String.fromCodePoint(value.codePointAt(start) || 0);
  if (!isWord(char)) return null;
  let end = start + char.length;
  if (/\d/.test(char)) {
    while (/\d/.test(value[end] || "")) end += 1;
  } else {
    // In a bare equation, consume adjacent Unicode variables/symbols (πr²)
    // and letter runs immediately followed by a Unicode superscript (cm²),
    // without turning ordinary ASCII words such as "weather" into atoms.
    let runEnd = end;
    while (runEnd < value.length) {
      const next = String.fromCodePoint(value.codePointAt(runEnd) || 0);
      if (!isWord(next) || UNICODE_SCRIPT_CHARS.has(next)) break;
      runEnd += next.length;
    }
    if (runEnd > end) {
      let afterRun = runEnd;
      while (/[ \t]/.test(value[afterRun] || "")) afterRun += 1;
      const followedByOperator = readOperator(value, afterRun) > afterRun;
      if (/[^\u0000-\u007f]/.test(value.slice(start, runEnd)) || readUnicodeScript(value, runEnd) > runEnd || followedByOperator) end = runEnd;
    }
  }
  let hasScript = false;
  while (value[end] === "^" || value[end] === "_") {
    const scriptEnd = readScript(value, end);
    if (scriptEnd < 0) break;
    hasScript = true;
    end = scriptEnd;
  }
  const unicodeScriptEnd = readUnicodeScript(value, end);
  if (unicodeScriptEnd > end) { hasScript = true; end = unicodeScriptEnd; }
  // Chemical/compound notation may put the subscript between adjacent letters
  // (H₂O). Keep the trailing element symbol with its scripted atom.
  if (hasScript) {
    while (end < value.length) {
      const next = String.fromCodePoint(value.codePointAt(end) || 0);
      if (!isWord(next) || UNICODE_SCRIPT_CHARS.has(next)) break;
      end += next.length;
    }
  }
  return { end, hasScript, numeric: /^\d/.test(char) };
};

const readOperator = (value: string, start: number): number => {
  const char = String.fromCodePoint(value.codePointAt(start) || 0);
  if ("=+-*/<>≤≥≠≈±∓×÷·∪∩∈∉→←⇒⇔".includes(char)) return start + char.length;
  if (value[start] === "\\") {
    const command = value.slice(start + 1).match(/^([A-Za-z]+)/)?.[1];
    if (command && RAW_OPERATOR_COMMANDS.has(command)) return start + command.length + 1;
  }
  return -1;
};

const readRawLatex = (value: string, start: number): number => {
  const first = readTexAtom(value, start);
  if (!first) return -1;
  let end = first.end;
  let sawOperator = false;
  let sawEquality = false;
  let sawNumericFraction = false;
  let hasScript = first.hasScript;

  for (;;) {
    let operatorStart = end;
    while (/[ \t]/.test(value[operatorStart] || "")) operatorStart += 1;
    const operatorEnd = readOperator(value, operatorStart);
    if (operatorEnd < 0) break;
    let operandStart = operatorEnd;
    while (/[ \t]/.test(value[operandStart] || "")) operandStart += 1;
    const operand = readTexAtom(value, operandStart);
    if (!operand) break;
    sawOperator = true;
    sawEquality ||= value.slice(operatorStart, operatorEnd).includes("=") || /\\(?:leq?|geq?|neq|equiv|approx|to|rightarrow|Rightarrow)/.test(value.slice(operatorStart, operatorEnd));
    sawNumericFraction ||= value[operatorStart] === "/" && first.numeric && operand.numeric;
    hasScript ||= operand.hasScript;
    end = operand.end;
  }

  const before = value[start - 1];
  const after = value[end];
  if (isWord(before) || isWord(after)) return -1;
  if (!sawOperator) return end;
  return hasScript || sawEquality || sawNumericFraction || (sawOperator && value.slice(start, end).trim().split(/\s+/).length >= 3) ? end : -1;
};

const delimitedAt = (value: string, start: number): MathSegment | null => {
  if (isEscapedAt(value, start)) return null;
  let close = "";
  let mode: MathSegment["mode"] = "inline";
  let contentStart = start;
  let stopAtNewline = false;

  if (value.startsWith("$$", start)) {
    close = "$$";
    mode = "block";
    contentStart += 2;
  } else if (value[start] === "$") {
    if (value[start - 1] === "$" || value[start + 1] === "$" || /\s/.test(value[start + 1] || "")) return null;
    close = "$";
    mode = "inline";
    contentStart += 1;
    stopAtNewline = true;
  } else if (value.startsWith("\\(", start)) {
    close = String.raw`\)`;
    mode = "inline";
    contentStart += 2;
    stopAtNewline = true;
  } else if (value.startsWith("\\[", start)) {
    close = String.raw`\]`;
    mode = "block";
    contentStart += 2;
  } else {
    return null;
  }

  const closeAt = matchingDelimiter(value, contentStart, close, stopAtNewline);
  if (closeAt < 0 || closeAt === contentStart) return null;
  const source = value.slice(contentStart, closeAt).trim();
  if (!formulaLooksUnambiguous(source)) return null;
  return { kind: "math", latex: source.slice(0, MAX_NOTE_MATH_SOURCE_LENGTH), mode };
};

const readBareMath = (value: string, start: number): number => {
  const before = value[start - 1];
  if (isWord(before)) return -1;
  const first = readTexAtom(value, start);
  if (!first || value[start] === "\\") return -1;
  let end = first.end;
  let sawOperator = false;
  let sawEquality = false;
  let sawFraction = false;
  let hasScript = first.hasScript;
  let numericFraction = false;
  for (;;) {
    let operatorStart = end;
    while (/[ \t]/.test(value[operatorStart] || "")) operatorStart += 1;
    const operatorEnd = readOperator(value, operatorStart);
    if (operatorEnd < 0) break;
    let operandStart = operatorEnd;
    while (/[ \t]/.test(value[operandStart] || "")) operandStart += 1;
    const operand = readTexAtom(value, operandStart);
    if (!operand || value[operandStart] === "\\") break;
    sawOperator = true;
    sawEquality ||= value[operatorStart] === "=" || "≤≥≠".includes(value[operatorStart] || "");
    sawFraction ||= value[operatorStart] === "/";
    numericFraction ||= value[operatorStart] === "/" && first.numeric && operand.numeric;
    hasScript ||= operand.hasScript;
    end = operand.end;
  }
  const after = value[end];
  if (isWord(after)) return -1;
  if (first.hasScript && !sawOperator) return end;
  if (sawEquality || numericFraction || (hasScript && sawOperator) || (sawOperator && value.slice(start, end).trim().split(/\s+/).length >= 5)) return end;
  if (sawFraction && first.numeric) return end;
  return -1;
};

const readUnicodeRadical = (value: string, start: number): number => {
  if (value[start] !== "√") return -1;
  let operandStart = start + 1;
  while (/\s/.test(value[operandStart] || "")) operandStart += 1;
  if (operandStart > start + 1 && !/[\d({]/.test(value[operandStart] || "")) return -1;
  const operand = readTexAtom(value, operandStart);
  return operand ? operand.end : -1;
};

const backtickRunEnd = (value: string, start: number): number => {
  let runEnd = start;
  while (value[runEnd] === "`") runEnd += 1;
  return runEnd;
};

const matchingBacktickRun = (value: string, start: number, length: number): number => {
  for (let cursor = start; cursor < value.length; cursor += 1) {
    if (value[cursor] !== "`") continue;
    const end = backtickRunEnd(value, cursor);
    if (end - cursor === length) return end;
    cursor = end - 1;
  }
  return -1;
};

/** Stateful math scanner: delimiters are paired; code spans are passed through. */
const scanMathText = (value: string): Segment[] => {
  const segments: Segment[] = [];
  let plainStart = 0;
  let cursor = 0;
  const emitMath = (start: number, end: number, latex: string, mode: MathSegment["mode"]) => {
    if (start > plainStart) segments.push({ kind: "text", value: value.slice(plainStart, start) });
    segments.push({ kind: "math", latex: latex.slice(0, MAX_NOTE_MATH_SOURCE_LENGTH), mode });
    cursor = end;
    plainStart = end;
  };

  while (cursor < value.length) {
    if (value[cursor] === "`") {
      const runEnd = backtickRunEnd(value, cursor);
      const closeAt = matchingBacktickRun(value, runEnd, runEnd - cursor);
      if (closeAt >= 0) {
        cursor = closeAt;
        continue;
      }
    }

    const delimited = delimitedAt(value, cursor);
    if (delimited) {
      const openLength = value.startsWith("$$", cursor) || value.startsWith("\\(", cursor) || value.startsWith("\\[", cursor) ? 2 : 1;
      const closeLength = delimited.mode === "block" && value.startsWith("$$", cursor) ? 2 : value.startsWith("\\(", cursor) || value.startsWith("\\[", cursor) ? 2 : 1;
      const closing = matchingDelimiter(value, cursor + openLength, value.startsWith("$$", cursor) ? "$$" : value.startsWith("\\(", cursor) ? String.raw`\)` : value.startsWith("\\[", cursor) ? String.raw`\]` : "$", value.startsWith("$", cursor) && !value.startsWith("$$", cursor));
      if (closing >= 0) {
        emitMath(cursor, closing + closeLength, delimited.latex, delimited.mode);
        continue;
      }
    }

    const rawLatexEnd = value[cursor] === "\\" ? readRawLatex(value, cursor) : -1;
    if (rawLatexEnd > cursor) {
      emitMath(cursor, rawLatexEnd, value.slice(cursor, rawLatexEnd).trim(), "inline");
      continue;
    }
    const radicalEnd = value[cursor] === "√" ? readUnicodeRadical(value, cursor) : -1;
    if (radicalEnd > cursor) {
      emitMath(cursor, radicalEnd, value.slice(cursor, radicalEnd).trim(), "inline");
      continue;
    }
    const glyph = String.fromCodePoint(value.codePointAt(cursor) || 0);
    if (glyph === "∞" && !isWord(value[cursor - 1]) && !isWord(value[cursor + glyph.length])) {
      emitMath(cursor, cursor + glyph.length, glyph, "inline");
      continue;
    }
    const bareEnd = /[\p{L}\p{N}]/u.test(glyph) ? readBareMath(value, cursor) : -1;
    if (bareEnd > cursor) {
      emitMath(cursor, bareEnd, value.slice(cursor, bareEnd).trim(), "inline");
      continue;
    }
    cursor += glyph.length;
  }
  if (plainStart < value.length) segments.push({ kind: "text", value: value.slice(plainStart) });
  return segments.length ? segments : [{ kind: "text", value }];
};

const setMathMarker = (element: HTMLElement, segment: MathSegment): void => {
  element.setAttribute("data-note-math", segment.mode);
  element.setAttribute("data-latex", segment.latex.slice(0, MAX_NOTE_MATH_SOURCE_LENGTH));
  element.textContent = mathSourceText(segment.latex, segment.mode === "block");
};

const makeMarker = (document: Document, segment: MathSegment): HTMLElement => {
  const marker = document.createElement(segment.mode === "block" ? "div" : "span");
  setMathMarker(marker, segment);
  return marker;
};

const replaceTextNodeWithMath = (node: Text): void => {
  const value = node.nodeValue || "";
  const segments = scanMathText(value);
  if (!segments.some((segment) => segment.kind === "math") || !node.parentNode) return;
  const fragment = node.ownerDocument.createDocumentFragment();
  for (const segment of segments) {
    if (segment.kind === "math") fragment.appendChild(makeMarker(node.ownerDocument, segment));
    else if (segment.value) fragment.appendChild(node.ownerDocument.createTextNode(segment.value));
  }
  node.parentNode.replaceChild(fragment, node);
};

const escapeLatexText = (text: string): string => text.replace(/[\\{}%$#&_]/g, "\\$&");

const mathMlOperator = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed in UNICODE_OPERATORS) return UNICODE_OPERATORS[trimmed];
  if (trimmed === "−") return "-";
  if (trimmed === "⁡") return "";
  return text;
};

/** A focused MathML-to-TeX adapter for the structures most common in Docs. */
const mathMlToLatex = (element: Element): string => {
  const tag = element.tagName.toLowerCase();
  const children = Array.from(element.children);
  const child = (index: number) => children[index] ? mathMlToLatex(children[index]) : "";
  const all = () => children.map((entry) => mathMlToLatex(entry)).join("");
  const text = (element.textContent || "").trim();

  switch (tag) {
    case "annotation":
    case "annotation-xml":
      return "";
    case "mi": case "mn":
      return text;
    case "mo":
      return mathMlOperator(text);
    case "mtext":
      return String.raw`\text{${escapeLatexText(text)}}`;
    case "mfrac":
      return String.raw`\frac{${child(0)}}{${child(1)}}`;
    case "msqrt":
      return String.raw`\sqrt{${all()}}`;
    case "mroot":
      return String.raw`\sqrt[${child(1)}]{${child(0)}}`;
    case "msup":
      return `${child(0)}^{${child(1)}}`;
    case "msub":
      return `${child(0)}_{${child(1)}}`;
    case "msubsup":
      return `${child(0)}_{${child(1)}}^{${child(2)}}`;
    case "mover": {
      const accent = (children[1]?.textContent || "").trim();
      const command = accent === "¯" || accent === "‾" ? String.raw`\bar` : accent === "→" ? String.raw`\vec` : String.raw`\hat`;
      return `${command}{${child(0)}}`;
    }
    case "munder":
      return String.raw`\underset{${child(1)}}{${child(0)}}`;
    case "munderover":
      return String.raw`\overset{${child(2)}}{\underset{${child(1)}}{${child(0)}}}`;
    case "mfenced": {
      const open = element.getAttribute("open") ?? "(";
      const close = element.getAttribute("close") ?? ")";
      const separator = element.getAttribute("separators") ?? ",";
      const items = children.map((entry) => mathMlToLatex(entry));
      return String.raw`\left${open}${items.join(separator)}\right${close}`;
    }
    case "mtable": {
      const rows = children.map((row) => Array.from(row.children).map((cell) => mathMlToLatex(cell)).join(" & "));
      return String.raw`\begin{matrix}${rows.join(String.raw` \\ `)}\end{matrix}`;
    }
    case "mtr": case "mlabeledtr": case "mtd":
      return all();
    case "mspace":
      return String.raw`\,`;
    case "math": case "semantics": case "mrow": case "mstyle": case "mpadded": case "mphantom": case "menclose":
      return all() || escapeLatexText(text);
    default:
      return children.length ? all() : escapeLatexText(text);
  }
};

const annotationTex = (element: Element): string => {
  const candidates = Array.from(element.querySelectorAll("annotation[encoding], annotation[encoding]"));
  const annotation = candidates.find((item) => /tex/i.test(item.getAttribute("encoding") || ""));
  return annotation?.textContent?.trim() || "";
};

const mathModeOf = (element: Element): MathSegment["mode"] => {
  const display = (element.getAttribute("display") || element.getAttribute("data-display") || "").toLowerCase();
  if (display === "block" || display === "true" || display === "display") return "block";
  if (/mode\s*=\s*display/i.test(element.getAttribute("type") || "")) return "block";
  if (element.closest(".katex-display, .math-display, [data-display='block']")) return "block";
  if (element.tagName.toLowerCase() === "mjx-container" && element.getAttribute("display") === "true") return "block";
  return "inline";
};

const extractMathMarkupSource = (element: Element): { latex: string; mode: MathSegment["mode"] } | null => {
  const tag = element.tagName.toLowerCase();
  if (element.hasAttribute("data-note-math")) return null;
  const className = typeof element.className === "string" ? element.className : "";
  const isMathMl = tag === "math";
  const isMathScript = tag === "script" && /^math\/tex/i.test(element.getAttribute("type") || "");
  const isKatexOrMathJax = /(?:^|\s)(?:katex|MathJax|mathjax|math-inline|math-display|arithmatex)(?:\s|$)/i.test(className) || tag === "mjx-container";
  const hasTexData = element.hasAttribute("data-latex") || element.hasAttribute("data-tex");
  const isMathImage = tag === "img" && /math|formula|equation/i.test(`${className} ${element.getAttribute("data-math") || ""}`);
  if (!isMathMl && !isMathScript && !isKatexOrMathJax && !hasTexData && !isMathImage) return null;

  const annotation = annotationTex(element);
  const latex = element.getAttribute("data-latex") || element.getAttribute("data-tex") || annotation ||
    (isMathMl ? mathMlToLatex(element) : element.textContent || "") ||
    (isMathImage ? element.getAttribute("alt") || "" : "");
  const source = latex.trim();
  if (!source || source.length > MAX_NOTE_MATH_SOURCE_LENGTH) return null;
  return { latex: source, mode: mathModeOf(element) };
};

const normalizeMathMarkup = (root: HTMLElement): void => {
  // Query order is document order (parent before descendants), so a KaTeX or
  // MathJax wrapper is converted once and its MathML annotation is not visited
  // again. Detached descendants are skipped after that replacement.
  const candidates = Array.from(root.querySelectorAll("math, mjx-container, .katex, [data-latex], [data-tex], script[type^='math/tex'], img.math, img.formula, img.equation, .math-inline, .math-display, .arithmatex"));
  for (const candidate of candidates) {
    if (!candidate.isConnected && !root.contains(candidate)) continue;
    if (candidate.hasAttribute("data-note-math")) continue;
    const extracted = extractMathMarkupSource(candidate);
    if (!extracted) continue;
    const marker = makeMarker(candidate.ownerDocument, { kind: "math", ...extracted });
    candidate.replaceWith(marker);
  }
};

const skipTextNormalization = (node: Text): boolean => {
  const parent = node.parentElement;
  if (!parent) return false;
  return Boolean(parent.closest("code, pre, kbd, samp, script, style, textarea, [data-note-math]"));
};

const normalizeMathTextNodes = (root: HTMLElement): void => {
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    if (!skipTextNormalization(text)) textNodes.push(text);
    current = walker.nextNode();
  }
  textNodes.forEach(replaceTextNodeWithMath);
};

/**
 * Normalize rich clipboard HTML. Call this before any HTML sanitization that
 * strips MathML or source attributes; this function itself returns only the
 * existing allow-listed note markup plus the two validated math attributes.
 */
const normalizeChecklistMarkup = (root: HTMLElement): void => {
  for (const item of Array.from(root.querySelectorAll("li"))) {
    const checkbox = Array.from(item.querySelectorAll('input[type="checkbox"]')).find(
      (input) => input.closest("li") === item,
    );
    if (!checkbox) continue;
    item.setAttribute("data-checked", checkbox.hasAttribute("checked") || (checkbox as HTMLInputElement).checked ? "true" : "false");
    checkbox.remove();
  }
};

export function normalizeRichClipboardHtml(html: string): string {
  const source = String(html || "");
  if (!source.trim()) return "";
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") return sanitizeRichText(source);
  try {
    const parsed = new window.DOMParser().parseFromString(`<body>${source}</body>`, "text/html");
    normalizeMathMarkup(parsed.body);
    normalizeMathTextNodes(parsed.body);
    // Marked/GFM and many rich-text clipboards express task state with an
    // <input type=checkbox>. Inputs are intentionally not in the HTML allow-list;
    // convert the state to our inert semantic li attribute before sanitizing.
    normalizeChecklistMarkup(parsed.body);
    return sanitizeRichText(parsed.body.innerHTML);
  } catch {
    // The normalizer is a best-effort clipboard boundary; sanitizer fallback
    // still strips/escapes unsafe markup, while the editor importer has its own
    // readable-text recovery path.
    return sanitizeRichText(source);
  }
}

const fenceLine = (line: string): { char: string; length: number } | null => {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);
  return match ? { char: match[1][0], length: match[1].length } : null;
};

/**
 * Split a Markdown table row without treating escaped pipes or pipes inside
 * inline code as column boundaries. The returned cells are used only to infer
 * column count; Marked remains responsible for parsing each cell's content.
 */
const markdownTableCells = (line: string): string[] | null => {
  const source = line.trim();
  if (!source.includes("|")) return null;
  const cells: string[] = [];
  let cell = "";
  let codeTicks = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "\\" && source[index + 1] === "|") {
      cell += "\\|";
      index += 1;
      continue;
    }
    if (char === "`") {
      let end = index + 1;
      while (source[end] === "`") end += 1;
      const ticks = end - index;
      codeTicks = codeTicks === 0 ? ticks : codeTicks === ticks ? 0 : codeTicks;
      cell += source.slice(index, end);
      index = end - 1;
      continue;
    }
    if (char === "|" && codeTicks === 0) {
      cells.push(cell.trim());
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell.trim());
  if (source.startsWith("|") && cells[0] === "") cells.shift();
  if (source.endsWith("|") && cells[cells.length - 1] === "") cells.pop();
  return cells.length >= 2 ? cells : null;
};

const isMarkdownTableSeparator = (cells: string[] | null): boolean =>
  Boolean(cells?.length && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, ""))));

const tableLikeLines = (lines: string[]): boolean => {
  let fence: { char: string; length: number } | null = null;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index];
    const marker = fenceLine(line);
    if (!fence && marker) { fence = marker; continue; }
    if (fence) {
      const close = fenceLine(line);
      if (close && close.char === fence.char && close.length >= fence.length && !line.slice(line.indexOf(close.char) + close.length).trim()) fence = null;
      continue;
    }
    const cells = markdownTableCells(line);
    if (!cells) continue;
    const next = markdownTableCells(lines[index + 1]);
    if (isMarkdownTableSeparator(next) && next?.length === cells.length) return true;
    if (next && next.length === cells.length) return true;
  }
  return false;
};

/**
 * GFM requires a delimiter row, but educational copy/paste often produces a
 * plain pipe table with only a header followed by data (for example
 * "Revision| Time"). Infer the standard neutral alignment row only for a
 * contiguous, rectangular pipe-table run; leave prose and fenced code alone.
 */
const inferMarkdownTableSeparators = (input: string): string => {
  const lines = input.split("\n");
  let fence: { char: string; length: number } | null = null;
  for (let index = 0; index < lines.length - 1; index += 1) {
    const marker = fenceLine(lines[index]);
    if (!fence && marker) { fence = marker; continue; }
    if (fence) {
      const close = fenceLine(lines[index]);
      if (close && close.char === fence.char && close.length >= fence.length && !lines[index].slice(lines[index].indexOf(close.char) + close.length).trim()) fence = null;
      continue;
    }
    const header = markdownTableCells(lines[index]);
    if (!header) continue;
    const next = markdownTableCells(lines[index + 1]);
    if (isMarkdownTableSeparator(next) && next?.length === header.length) {
      index += 1;
      continue;
    }
    if (!next || next.length !== header.length) continue;
    // A header plus at least one consistently shaped row is sufficient. Stop
    // at the first blank/non-row line, so nearby prose cannot be swallowed.
    let end = index + 1;
    while (end < lines.length) {
      const row = markdownTableCells(lines[end]);
      if (!row || row.length !== header.length) break;
      end += 1;
    }
    if (end - index < 2) continue;
    lines.splice(index + 1, 0, header.map(() => "---").join(" | "));
    index += end - index;
  }
  return lines.join("\n");
};

interface PreparedPlainText { text: string; formulas: Map<string, MathSegment> }

/** Replace formulas with plain, collision-resistant tokens before Markdown. */
const tokenizePlainTextMath = (input: string): PreparedPlainText => {
  const lines = input.replace(/\r\n?/g, "\n").split(/(?<=\n)/);
  const formulas = new Map<string, MathSegment>();
  const output: string[] = [];
  let normal = "";
  let fence: { char: string; length: number } | null = null;
  let nextToken = 0;

  const tokenized = (value: string): string => scanMathText(value).map((segment) => {
    if (segment.kind === "text") return segment.value;
    const token = `\uE000DCNOTEMATH${(nextToken++).toString(36)}END\uE001`;
    formulas.set(token, segment);
    return token;
  }).join("");
  const flushNormal = () => {
    if (normal) output.push(tokenized(normal));
    normal = "";
  };

  for (const line of lines) {
    const marker = fenceLine(line);
    if (!fence && marker) {
      flushNormal();
      fence = marker;
      output.push(line);
      continue;
    }
    if (fence) {
      output.push(line);
      const closing = fenceLine(line);
      if (closing && closing.char === fence.char && closing.length >= fence.length && !line.slice(line.indexOf(closing.char) + closing.length).trim()) fence = null;
      continue;
    }
    normal += line;
  }
  flushNormal();
  return { text: output.join(""), formulas };
};

const replaceFormulaTokens = (root: HTMLElement, formulas: Map<string, MathSegment>): void => {
  if (!formulas.size) return;
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  const textNodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    textNodes.push(current as Text);
    current = walker.nextNode();
  }
  for (const node of textNodes) {
    const value = node.nodeValue || "";
    const matches = Array.from(formulas.entries()).filter(([token]) => value.includes(token));
    if (!matches.length || !node.parentNode) continue;
    const fragment = node.ownerDocument.createDocumentFragment();
    let cursor = 0;
    while (cursor < value.length) {
      let found: { token: string; at: number; segment: MathSegment } | null = null;
      for (const [token, segment] of matches) {
        const at = value.indexOf(token, cursor);
        if (at >= 0 && (!found || at < found.at)) found = { token, at, segment };
      }
      if (!found) {
        fragment.appendChild(node.ownerDocument.createTextNode(value.slice(cursor)));
        break;
      }
      if (found.at > cursor) fragment.appendChild(node.ownerDocument.createTextNode(value.slice(cursor, found.at)));
      fragment.appendChild(makeMarker(node.ownerDocument, found.segment));
      cursor = found.at + found.token.length;
    }
    node.parentNode.replaceChild(fragment, node);
  }
};

/** Heuristic gate: unmarked prose stays literal; recognizable Markdown is parsed. */
export function looksLikeMarkdown(text: string): boolean {
  const source = String(text || "").replace(/\r\n?/g, "\n");
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^ {0,3}(?:#{1,6}\s+\S|>|```|~~~|[-+*]\s+\S|\d+[.)]\s+\S)/.test(line)) return true;
    if (/^ {0,3}(?:\$\$|\\\[)\s*$/.test(line)) return true;
    if (index + 1 < lines.length && /^ {0,3}(?:=+|-{3,})\s*$/.test(lines[index + 1]) && line.trim()) return true;
    if (index + 1 < lines.length && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]) && line.includes("|")) return true;
  }
  if (tableLikeLines(lines)) return true;
  return /(?:\*\*|__)[^\n]+?(?:\*\*|__)|~~[^\n]+?~~|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`|\[[^\]]+\]\([^)]+\)|^\s*<(?:p|div|h[1-6]|ul|ol|li|blockquote|table|pre|hr)\b/im.test(source);
}

/**
 * Plain-text clipboard → Markdown when clearly marked, otherwise literal lines.
 * Delimiters/raw TeX are tokenized before Markdown parsing so code fences and
 * inline code stay code, while formula structure survives Marked's HTML pass.
 */
export function normalizePlainClipboardText(text: string): string {
  const source = String(text || "").replace(/\r\n?/g, "\n");
  if (!source.trim()) return "";
  try {
    const tableNormalized = inferMarkdownTableSeparators(source);
    const prepared = tokenizePlainTextMath(tableNormalized);
    const html = looksLikeMarkdown(prepared.text)
      ? String(marked.parse(prepared.text, { gfm: true, breaks: true }))
      : plainToRichText(prepared.text);
    if (typeof window === "undefined" || typeof window.DOMParser === "undefined") return normalizeRichClipboardHtml(html);
    const parsed = new window.DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
    replaceFormulaTokens(parsed.body, prepared.formulas);
    return normalizeRichClipboardHtml(parsed.body.innerHTML);
  } catch {
    // A malformed paste or parser edge case must never block typing. Escaped,
    // literal lines remain readable, then get one final safe normalization.
    return normalizeRichClipboardHtml(plainToRichText(source));
  }
}
