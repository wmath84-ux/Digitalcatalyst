// Deterministic question-type guard for AI-generated revision tests.
//
// The test-planning page lets the learner choose a question TYPE — Theory only
// (memory/understanding, nothing to solve), Application only (problems that
// must be solved), or Mixed. Prompt wording alone proved unreliable: models
// drift toward numerical/application MCQs even when told "theory only", and
// learners kept receiving solve-type questions no matter what they selected.
//
// This module is the deterministic safety net shared by every generation path:
//   1. classifyQuestionKind — heuristic read of a question's real style from
//      its prompt and options (compute verbs, number+unit anchors, numeric
//      answer options vs recall openers, verbal options).
//   2. resolveQuestionKind — fuses the heuristic with the model's own
//      mandatory "type" tag. A confident deterministic read wins; otherwise
//      the model's label is trusted.
//   3. mixedModeSplit — exact theory/application quotas for Mixed mode.
//   4. planModeEnforcement — compares a batch against the selected mode and
//      returns exactly which questions can stay (keep) and what must be
//      regenerated (needs + rejects) so a wrong-type question never ships.
//
// Pure functions only — safe to import from the browser bundle and from the
// serverless generation API.

export const QUESTION_KINDS = ["theory", "application"];

/** Normalise the model's per-question style tag. "" when absent/unrecognised. */
export const normalizeModelTypeTag = (value) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return "";
  if (text.startsWith("theor") || text.startsWith("concept") || text === "recall") return "theory";
  if (
    text.startsWith("applic") ||
    text.startsWith("numer") ||
    text.startsWith("problem") ||
    text === "practical"
  ) {
    return "application";
  }
  return "";
};

/** Exact theory/application quota for Mixed mode (theory takes the odd seat). */
export const mixedModeSplit = (count) => {
  const safe = Math.max(1, Math.round(Number(count) || 1));
  const theory = Math.ceil(safe / 2);
  return { theory, application: safe - theory };
};

/* ------------------------- heuristic signals ------------------------- */

// Phrases that require a calculation or worked solution to answer.
const COMPUTE_VERB =
  /\b(calculate|calculates|calculation|compute|computes|evaluate|evaluates|simplify|simplifies|solve|solves|work out|works out|worked out|determine the|determines the|find(?:ing)? the (?:value|amount|number|result|total|sum|difference|product|quotient|remainder|area|volume|perimeter|circumference|speed|velocity|acceleration|force|energy|power|work done|current|voltage|potential difference|resistance|charge|mass|weight|density|pressure|temperature|heat|frequency|wavelength|momentum|distance|displacement|time period|time taken|height|depth|length|breadth|radius|diameter|side|angle|percentage|percent|fraction|ratio|average|mean|median|mode|range|probability|simple interest|compound interest|profit|loss|discount|cost price|selling price|marked price))\b/i;

// "How much / how long / how far…" is numerical only with quantitative anchors.
const HOW_MUCH_COMPUTE = /\bhow (?:much|long|far|fast|tall|deep)\b/i;

// A number glued to a measurement/money unit — the classic word-problem sign.
const UNIT_ANCHOR =
  /\d[\d.,]*\s?(?:kg|g|mg|km|cm|mm|metres?|meters?|ml|cl|litres?|liters?|sec(?:ond)?s?|mins?|minutes?|hours?|hrs?|days?|weeks?|years?|hz|khz|newtons?|joules?|kj|watts?|kw|pa|kpa|bar|atm|amps?|amperes?|ma\b|volts?|kv|mv\b|ohms?|ω|moles?|mol\b|°\s?[cfk]|rs\.?|rupees?|₹|\$|€|£|m\/s|km\/h(?:r|rs)?|ms(?:-|⁻)[12]|m\/s²|m\/s2|cm[²³]|mm[²³]|m[²³]|km²|g\/cm³|g\/ml|kg\/m³|kmol)/i;

// Motion / transaction / transformation story words that build a scenario.
const SCENARIO_VERB =
  /\b(travels?|travelling|covers?|covering|moving|moves|thrown|throws|tossed|dropped|drops|falls?|falling|accelerates?|accelerating|decelerates?|collides?|pushes?|pulled?|pulling|lifts?|lifting|carries?|carrying|flows?|flowing|dissolves?|dissolved|dissolving|heats?|heated|heating|cools?|cooled|cooling|melts?|melting|boils?|boiling|freezes|freezing|evaporates?|mixes?|mixed|mixing|pours?|poured|fills?|filled|empties|connected|connects|invests?|invested|borrows?|borrowed|lends?|lent|purchases?|purchased|buys|bought|sells?|sold|earns?|earned|spends?|spent|saves?|saved|grows?|growing|decays?|decaying|depreciates?)\b/i;

// Recall/understanding openers — memory questions, nothing to solve.
const RECALL_OPENER =
  /\b(defines?|definition of|what do you mean by|what is meant by|state the|states the|name the|names the|give the name of|list the|mention the|write the (?:name|formula|symbol|si unit|unit|term)|which term|which (?:law|principle|rule|scientist|statement|property|phenomenon|process|organ|part|layer|planet|element|compound|gas|metal|acid|base|salt|vitamin|disease|kingdom|phylum)|who (?:discovered|invented|proposed|gave|formulated)|is known as|is called|is referred to as|also known as|also called|refers to|stands for|si unit|symbol (?:of|for)|formula (?:of|for)|unit of [a-z -]+ is)\b/i;

const WHICH_FOLLOWING = /\bwhich of the following\b/i;
const HOW_MANY_FACT = /\bhow many\b/i;

// Option that starts with a bare/computed number ("5", "5 N", "12.5%", "2/3"…).
const NUMERIC_OPTION =
  /^\s*[([]?\s*[-+±]?\s*(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:\s*[/:]\s*\d|\s|[a-zA-Zµ°Ω%/^²³·×-]|$)/;

const countNumericOptions = (options) =>
  options.reduce((total, option) => total + (NUMERIC_OPTION.test(String(option ?? "").trim()) ? 1 : 0), 0);

/**
 * Heuristic read of a question's true style.
 * Returns "application" only on clear solve-the-problem evidence and "theory"
 * on clear recall evidence; genuinely ambiguous questions return "unknown"
 * and are handed to the model's own "type" tag by resolveQuestionKind().
 */
export const classifyQuestionKind = (question) => {
  const row = question && typeof question === "object" ? question : {};
  const prompt = String(row.prompt ?? "");
  const options = Array.isArray(row.options) ? row.options : [];

  const hasDigit = /\d/.test(prompt);
  const compute = COMPUTE_VERB.test(prompt);
  const unitAnchor = UNIT_ANCHOR.test(prompt);
  const scenario = hasDigit && SCENARIO_VERB.test(prompt);
  const numericOptions = options.length >= 2 ? countNumericOptions(options) : 0;

  let application = 0;
  if (compute) application += 4;
  if (hasDigit) application += 2;
  if (unitAnchor) application += 2;
  if (scenario) application += 2;
  if (numericOptions >= 3) application += 2;
  else if (numericOptions === 2) application += 1;
  if (HOW_MUCH_COMPUTE.test(prompt) && (hasDigit || unitAnchor || numericOptions >= 2)) application += 3;

  let theory = 0;
  if (RECALL_OPENER.test(prompt)) theory += 4;
  if (WHICH_FOLLOWING.test(prompt) && !hasDigit) theory += 2;
  if (HOW_MANY_FACT.test(prompt) && !hasDigit) theory += 2; // fact counting ("How many bones…")
  if (!hasDigit && numericOptions === 0) theory += 1; // purely verbal question & answers

  if (application >= 4 && application - theory >= 2) return "application";
  if (theory >= 3 && application <= 2) return "theory";
  if (application === 0) return "theory"; // no solve-signal at all ⇒ plain conceptual MCQ
  if (application <= 1 && theory >= 2) return "theory";
  return "unknown";
};

/**
 * Final style verdict for one question. A confident heuristic read beats the
 * model's self-declared "type" tag; ambiguous questions fall back to the tag.
 */
export const resolveQuestionKind = (question) => {
  const row = question && typeof question === "object" ? question : {};
  const heuristic = classifyQuestionKind(row);
  if (heuristic !== "unknown") return heuristic;
  return normalizeModelTypeTag(row.type ?? row.kind) || "unknown";
};

/* ------------------------- enforcement planning ------------------------- */

const normalizeMode = (mode) => (mode === "theory" || mode === "application" ? mode : "mixed");

/**
 * Compare a generated batch against the learner's selected question type.
 *
 * Returns:
 *   ok      — true when `keep` already satisfies the mode exactly.
 *   keep    — compliant questions to retain (wrong-type ones never included).
 *   needs   — what a repair call must produce, e.g. [{kind:"theory",count:2}].
 *   rejects — detected wrong-type questions (repair context / rewrite list).
 *   summary — per-kind bookkeeping used by logs and tests.
 *
 * Strict modes (theory/application): confident opposite-type questions are
 * rejected; "unknown" questions get the benefit of the doubt (the output
 * schema forces a truthful type tag, so unknowns stay rare). Mixed mode
 * enforces the exact mixedModeSplit() quota, using unknowns as flexible fill
 * for whichever side is short.
 */
export const planModeEnforcement = (questions, mode, requestedCount) => {
  const count = Math.max(1, Math.round(Number(requestedCount) || 1));
  const list = Array.isArray(questions) ? questions : [];
  const entries = list.map((question) => ({ question, kind: resolveQuestionKind(question) }));
  const summary = {
    total: entries.length,
    theory: entries.filter((entry) => entry.kind === "theory").length,
    application: entries.filter((entry) => entry.kind === "application").length,
    unknown: entries.filter((entry) => entry.kind === "unknown").length,
    targetTheory: 0,
    targetApplication: 0,
  };

  const resolvedMode = normalizeMode(mode);

  if (resolvedMode !== "mixed") {
    const wanted = resolvedMode;
    const rejectedKind = wanted === "theory" ? "application" : "theory";
    summary.targetTheory = wanted === "theory" ? count : 0;
    summary.targetApplication = wanted === "application" ? count : 0;
    const keep = [];
    const allRejects = [];
    for (const entry of entries) {
      if (entry.kind !== rejectedKind) {
        if (keep.length < count) keep.push(entry.question);
      } else {
        allRejects.push(entry.question);
      }
    }
    const deficit = Math.max(0, count - keep.length);
    return {
      ok: deficit === 0,
      keep,
      needs: deficit > 0 ? [{ kind: wanted, count: deficit }] : [],
      rejects: allRejects.slice(0, Math.max(deficit, 0)),
      summary,
    };
  }

  // Mixed — exact quota split with flexible fill for unclassifiable items.
  const quota = mixedModeSplit(count);
  summary.targetTheory = quota.theory;
  summary.targetApplication = quota.application;
  const theoryPool = entries.filter((entry) => entry.kind === "theory").map((entry) => entry.question);
  const applicationPool = entries.filter((entry) => entry.kind === "application").map((entry) => entry.question);
  const flexPool = entries.filter((entry) => entry.kind === "unknown").map((entry) => entry.question);

  const takeTheory = theoryPool.slice(0, quota.theory);
  const takeApplication = applicationPool.slice(0, quota.application);
  const flex = [...flexPool];
  takeTheory.push(...flex.splice(0, Math.max(0, quota.theory - takeTheory.length)));
  takeApplication.push(...flex.splice(0, Math.max(0, quota.application - takeApplication.length)));

  const missingTheory = quota.theory - takeTheory.length;
  const missingApplication = quota.application - takeApplication.length;
  const needs = [];
  if (missingTheory > 0) needs.push({ kind: "theory", count: missingTheory });
  if (missingApplication > 0) needs.push({ kind: "application", count: missingApplication });

  // Over-represented opposites are the rewrite context for the repair call.
  const rejects = [];
  if (missingTheory > 0) {
    rejects.push(...applicationPool.slice(quota.application, quota.application + missingTheory));
  }
  if (missingApplication > 0) {
    rejects.push(...theoryPool.slice(quota.theory, quota.theory + missingApplication));
  }

  // Interleave styles so the delivered paper visibly alternates.
  const keep = [];
  const maxLen = Math.max(takeTheory.length, takeApplication.length);
  for (let index = 0; index < maxLen; index += 1) {
    if (index < takeTheory.length) keep.push(takeTheory[index]);
    if (index < takeApplication.length) keep.push(takeApplication[index]);
  }

  return { ok: needs.length === 0, keep: keep.slice(0, count), needs, rejects, summary };
};
