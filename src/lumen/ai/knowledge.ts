import type { MistakeKind, QuizQuestion } from "../lib/types";

/* ─────────────────────────────────────────────────────────────
   TUTORING KNOWLEDGE LAYER
   Concepts, prerequisite map, difficulty-tiered questions with
   per-option misconception diagnoses, recall prompts, simple/analogy
   variants, exam angles, and Socratic solve scripts.
   Everything the tutor reasons over lives here as structured data.
   ───────────────────────────────────────────────────────────── */

/* ── concept graph & prerequisites ─────────────────────────── */

export interface ConceptDef {
  id: string;
  label: string;
  topicId: string;
  prereqs?: string[]; // concept ids that must hold first
}

export const CONCEPTS: Record<string, ConceptDef> = {
  arrayIndexing: { id: "arrayIndexing", label: "array indexing & bounds", topicId: "binary" },
  logGrowth: { id: "logGrowth", label: "logarithmic growth", topicId: "binary" },
  loopInvariant: { id: "loopInvariant", label: "the search loop condition", topicId: "binary", prereqs: ["arrayIndexing"] },
  pointerMovement: { id: "pointerMovement", label: "pointer updates", topicId: "binary", prereqs: ["arrayIndexing"] },
  thylakoidVsStroma: { id: "thylakoidVsStroma", label: "thylakoid vs. stroma", topicId: "photo" },
  carriers: { id: "carriers", label: "ATP & NADPH as energy carriers", topicId: "photo" },
  oxygenOrigin: { id: "oxygenOrigin", label: "origin of O₂ (water, not CO₂)", topicId: "photo" },
  calvinDependence: { id: "calvinDependence", label: "Calvin cycle's dependence on light reactions", topicId: "photo", prereqs: ["carriers"] },
  powerRule: { id: "powerRule", label: "the power rule", topicId: "chain" },
  composition: { id: "composition", label: "function composition", topicId: "chain" },
  layers: { id: "layers", label: "identifying layers in a composite", topicId: "chain", prereqs: ["composition"] },
  linkMultiplication: { id: "linkMultiplication", label: "multiplying derivative links", topicId: "chain", prereqs: ["powerRule", "layers"] },
  regimeSequence: { id: "regimeSequence", label: "the five regimes in order", topicId: "revo" },
  turningPoints: { id: "turningPoints", label: "1789 → 1799 turning points", topicId: "revo", prereqs: ["regimeSequence"] },
  thermidorVsBrumaire: { id: "thermidorVsBrumaire", label: "Thermidor vs. Brumaire", topicId: "revo", prereqs: ["regimeSequence"] },
};

export function topicConcepts(topicId: string): ConceptDef[] {
  return Object.values(CONCEPTS).filter((c) => c.topicId === topicId);
}

/* ── question banks: difficulty + concept + option diagnoses ─ */

export const QUESTION_BANKS: Record<string, QuizQuestion[]> = {
  photo: [
    {
      q: "Where do the light-dependent reactions take place?",
      difficulty: 1,
      concept: "thylakoidVsStroma",
      options: ["The stroma", "The thylakoid membrane", "The cytoplasm", "The outer chloroplast membrane"],
      correct: 1,
      explain:
        "The light reactions run across the **thylakoid membrane** because that is where photosystems I and II, the electron transport chain, and ATP synthase are physically embedded. The stroma hosts the Calvin cycle afterwards.",
      optionNotes: [
        { kind: "conceptual", note: "That swaps the two stages' locations — the stroma is where the Calvin cycle runs, not the light reactions." },
        null,
        { kind: "recall", note: "The cytoplasm is outside the chloroplast entirely — photosynthesis happens inside it." },
        { kind: "misinterpretation", note: "The outer membrane is just the envelope; nothing in the light reactions happens there." },
      ],
    },
    {
      q: "The oxygen released during photosynthesis comes from which molecule?",
      difficulty: 1,
      concept: "oxygenOrigin",
      options: ["Carbon dioxide (CO₂)", "Glucose", "Water (H₂O)", "ATP"],
      correct: 2,
      explain:
        "It comes from **water**. Photolysis splits H₂O to replace electrons lost by photosystem II — oxygen is the by-product. The carbon from CO₂ ends up in sugar.",
      optionNotes: [
        { kind: "conceptual", note: "The classic trap: CO₂ is the input you remember, but its carbon goes into sugar, not into O₂." },
        { kind: "logic", note: "Glucose is a *product* built later — oxygen is released long before any sugar exists." },
        null,
        { kind: "recall", note: "ATP carries energy, not oxygen atoms — it isn't split for oxygen." },
      ],
    },
    {
      q: "Which pair carries energy from the light reactions to the Calvin cycle?",
      difficulty: 2,
      concept: "carriers",
      options: ["ADP and NADP⁺", "FADH₂ and NADH", "CO₂ and O₂", "ATP and NADPH"],
      correct: 3,
      explain:
        "**ATP and NADPH**. ATP supplies energy, NADPH supplies reducing power; the light reactions regenerate them, which is why darkness stalls the cycle within minutes.",
      optionNotes: [
        { kind: "reading", note: "Close but inverted — ADP and NADP⁺ are the *empty* carriers returning to be recharged." },
        { kind: "conceptual", note: "FADH₂ and NADH belong to cellular respiration (mitochondria), not photosynthesis." },
        { kind: "logic", note: "CO₂ and O₂ are gases exchanged, not energy carriers between the two stages." },
        null,
      ],
    },
    {
      q: "A plant in total darkness is given plenty of ATP and NADPH. Can the Calvin cycle still run?",
      difficulty: 3,
      concept: "calvinDependence",
      options: ["No — it requires photons directly", "Yes — but only briefly", "Yes — indefinitely", "Only if temperature rises"],
      correct: 1,
      explain:
        "**Yes, but only briefly.** The Calvin cycle needs no light directly — but it burns through ATP and NADPH within minutes once the light reactions stop regenerating them.",
      optionNotes: [
        { kind: "conceptual", note: "The Calvin cycle doesn't use photons itself — that's exactly why the 'dark reaction' nickname misleads." },
        null,
        { kind: "incomplete", note: "It can start, but without regeneration the carriers run out — 'indefinitely' misses that dependency." },
        { kind: "logic", note: "Temperature affects rate, not whether the cycle has carriers to run on." },
      ],
    },
  ],
  binary: [
    {
      q: "A sorted array has 1,000,000 elements. What is the maximum number of probes binary search needs?",
      difficulty: 2,
      concept: "logGrowth",
      options: ["About 10", "About 20", "About 1,000", "About 500,000"],
      correct: 1,
      explain:
        "About **20**. Each probe halves the space, so the count is ⌈log₂(1,000,000)⌉ ≈ 19.93 → 20 probes. Linear search could take all million.",
      optionNotes: [
        { kind: "calculation", note: "That underestimates log₂(10⁶) — you need ⌈log₂ n⌉ ≈ 19.93, so 20 probes." },
        null,
        { kind: "misinterpretation", note: "1,000 is √n, not log₂ n — halving is far more powerful than square-rooting." },
        { kind: "conceptual", note: "That's linear search. Binary search discards half the array every probe." },
      ],
    },
    {
      q: "What is the correct loop condition for the standard binary search implementation?",
      difficulty: 2,
      concept: "loopInvariant",
      options: ["lo < hi", "lo != hi", "lo <= hi", "mid != target"],
      correct: 2,
      explain:
        "`lo <= hi`. When `lo == hi`, exactly one candidate remains unchecked. The search is only finished when the pointers **cross**.",
      optionNotes: [
        { kind: "logic", note: "With `<`, the final single-element window `lo == hi` is never checked — the classic off-by-one miss." },
        { kind: "incomplete", note: "`!=` behaves like `<` here and shares the same off-by-one miss at `lo == hi`." },
        null,
        { kind: "misinterpretation", note: "`mid` can't drive the loop — the target may be absent, so `mid` may never equal it." },
      ],
    },
    {
      q: "Why write `mid = lo + (hi - lo) / 2` instead of `mid = (lo + hi) / 2`?",
      difficulty: 3,
      concept: "pointerMovement",
      options: ["It avoids integer overflow", "It is faster", "It rounds more accurately", "It is required syntax"],
      correct: 0,
      explain:
        "In 32-bit integer languages, `lo + hi` can overflow on large arrays and go negative. Reordering is identical math with no overflow risk.",
      optionNotes: [
        null,
        { kind: "conceptual", note: "Both forms compute the same value at the same speed — the issue is overflow, not performance." },
        { kind: "calculation", note: "Integer division rounds identically in both forms." },
        { kind: "recall", note: "It's a defensive rewrite, not a language requirement." },
      ],
    },
    {
      q: "If `arr[mid] < target`, what is the correct next step?",
      difficulty: 1,
      concept: "pointerMovement",
      options: ["Set `hi = mid`", "Search the left half", "Set `lo = mid + 1`", "Declare the target absent"],
      correct: 2,
      explain:
        "Sorted order means everything at or left of `mid` is ≤ `arr[mid]`, so none of it can be the target. Discard that half with **`lo = mid + 1`**.",
      optionNotes: [
        { kind: "logic", note: "That discards the *right* half — but the target is larger than `arr[mid]`, so it must be right of mid." },
        { kind: "formula", note: "Direction swapped: a larger target lives in the right half in an ascending array." },
        null,
        { kind: "careless", note: "One probe never proves absence — absence is only confirmed when the pointers cross." },
      ],
    },
  ],
  chain: [
    {
      q: "What is the derivative of `(3x + 1)⁴`?",
      difficulty: 1,
      concept: "linkMultiplication",
      options: ["4(3x + 1)³", "12x(3x + 1)³", "12(3x + 1)³", "(3x + 1)³"],
      correct: 2,
      explain:
        "Outer power rule gives `4(3x + 1)³`; multiply by the inner derivative `3` → **`12(3x + 1)³`**. The x belongs to the original expression, not to the inner derivative.",
      optionNotes: [
        { kind: "incomplete", note: "You differentiated the outer layer but forgot to multiply by the inner derivative, 3." },
        { kind: "misinterpretation", note: "The inner derivative of `3x + 1` is 3 — not 3x. Constants inside drop away." },
        null,
        { kind: "incomplete", note: "This dropped both the outer exponent factor (4) and the inner derivative (3)." },
      ],
    },
    {
      q: "The chain rule differentiates composite functions by working…",
      difficulty: 1,
      concept: "layers",
      options: ["Inside-out, adding each link", "Outside-in, multiplying each link", "Top-down with the product rule", "Using the exponent rule repeatedly"],
      correct: 1,
      explain: "**Outside-in, multiplying.** Differentiate the outermost layer leaving the inside untouched, then multiply by the derivative of the next layer in.",
      optionNotes: [
        { kind: "formula", note: "Two reversals at once: direction is outside-in, and links are multiplied, never added." },
        null,
        { kind: "formula", note: "The product rule applies to multiplied functions, not nested (composite) ones." },
        { kind: "formula", note: "The power rule alone can't reach the inner function — that's what the chain adds." },
      ],
    },
    {
      q: "What is the derivative of `sin(x²)`?",
      difficulty: 2,
      concept: "linkMultiplication",
      options: ["cos(x²)", "2x · cos(x²)", "2cos(x)", "-2x · cos(x²)"],
      correct: 1,
      explain: "Derivative of sin is cos, evaluated at the untouched inside: `cos(x²)`. Multiply by the inner derivative `2x` → **`2x · cos(x²)`**.",
      optionNotes: [
        { kind: "incomplete", note: "You stopped after the outer layer — multiply by the inner derivative 2x." },
        null,
        { kind: "formula", note: "This confuses product and chain structure — sin isn't being multiplied by x², it's applied to it." },
        { kind: "sign", note: "You pulled in the derivative of cos by accident; the outer function here is sin, which differentiates to +cos." },
      ],
    },
    {
      q: "What is the most common chain rule mistake?",
      difficulty: 3,
      concept: "layers",
      options: ["Using the quotient rule", "Skipping a middle layer", "Forgetting +C", "Applying the wrong power rule"],
      correct: 1,
      explain: "**Skipping a middle layer.** With three or more nested layers it's easy to drop one. Count the layers first, write each link explicitly.",
      optionNotes: [
        { kind: "misinterpretation", note: "The quotient rule is a different tool — the real trap is layer-counting inside compositions." },
        null,
        { kind: "recall", note: "+C belongs to integration, not differentiation." },
        { kind: "misinterpretation", note: "A wrong power rule shows up less often than a missing layer — count the nesting first." },
      ],
    },
  ],
  revo: [
    {
      q: "Which July 1789 event marked the Revolution's popular turning point?",
      difficulty: 1,
      concept: "turningPoints",
      options: ["The Tennis Court Oath", "The storming of the Bastille", "The Declaration of the Rights of Man", "The execution of Louis XVI"],
      correct: 1,
      explain: "The **storming of the Bastille** (14 July). The Tennis Court Oath came first (June) but was an act of deputies; the Bastille put Paris on stage.",
      optionNotes: [
        { kind: "recall", note: "The Oath was June 1789 and came from deputies — important, but not the popular turn." },
        null,
        { kind: "recall", note: "That Declaration came in late August 1789, after the Bastille had already turned the tide." },
        { kind: "recall", note: "Louis XVI was executed in January 1793 — three and a half years later." },
      ],
    },
    {
      q: "The constitutional monarchy of 1791 collapsed largely because…",
      difficulty: 2,
      concept: "regimeSequence",
      options: ["The famine ended", "Britain invaded", "The church split completely", "The Flight to Varennes destroyed trust in the king"],
      correct: 3,
      explain: "The **Flight to Varennes** (June 1791). The king's attempted escape proved he rejected the constitution he had sworn to uphold.",
      optionNotes: [
        { kind: "logic", note: "Bread prices actually worsened trust — relief wouldn't have toppled the monarchy." },
        { kind: "recall", note: "War with Austria and Prussia came in 1792, after the monarchy was already collapsing." },
        { kind: "conceptual", note: "The Civil Constitution of the Clergy divided opinion, but it didn't directly kill the monarchy." },
        null,
      ],
    },
    {
      q: "Which body drove the Terror of 1793–94?",
      difficulty: 1,
      concept: "regimeSequence",
      options: ["The Directory", "The Committee of Public Safety", "The Estates-General", "The Legislative Assembly"],
      correct: 1,
      explain: "The **Committee of Public Safety**, dominated by Robespierre, governing through emergency powers until his fall in Thermidor (July 1794).",
      optionNotes: [
        { kind: "recall", note: "The Directory governed *after* the Terror (1795–99)." },
        null,
        { kind: "recall", note: "The Estates-General was dissolved back in 1789." },
        { kind: "recall", note: "The Legislative Assembly ended with the monarchy's fall in 1792." },
      ],
    },
    {
      q: "Napoleon's coup that ended the revolutionary decade is known as…",
      difficulty: 3,
      concept: "thermidorVsBrumaire",
      options: ["Thermidor", "Fructidor", "Brumaire", "Vendémiaire"],
      correct: 2,
      explain: "**Brumaire** (November 1799). Thermidor was the coup *against Robespierre* in 1794 — the two are the most-swapped pair in this unit.",
      optionNotes: [
        { kind: "recall", note: "The classic swap: Thermidor ended Robespierre (1794); Brumaire brought Napoleon (1799)." },
        { kind: "recall", note: "Fructidor (1797) was the Directory's purge of royalists, not Napoleon's coup." },
        null,
        { kind: "recall", note: "Vendémiaire (1795) was Napoleon *defending* the Convention, years before he seized power." },
      ],
    },
  ],
};

/* ── active-recall prompts (retrieval practice) ───────────── */

export interface RecallQ {
  prompt: string;
  expected: string[]; // key fragments that satisfy the recall
  reveal: string;
}

export const RECALL_QS: Record<string, RecallQ[]> = {
  binary: [
    {
      prompt: "From memory: what is the loop condition for binary search, and why that exact comparison?",
      expected: ["lo <= hi", "<="],
      reveal: "`lo <= hi` — because at `lo == hi` one candidate remains unchecked.",
    },
    {
      prompt: "Quick recall — roughly how many probes does binary search need for a million elements?",
      expected: ["20", "twenty"],
      reveal: "About 20: ⌈log₂(1,000,000)⌉ ≈ 19.93.",
    },
  ],
  photo: [
    {
      prompt: "Without looking: which cell structure runs the light reactions, and which runs the Calvin cycle?",
      expected: ["thylakoid", "stroma"],
      reveal: "Light reactions → thylakoid membrane; Calvin cycle → stroma.",
    },
  ],
  chain: [
    {
      prompt: "From memory: state the chain rule for `f(g(x))`.",
      expected: ["f'(g(x))", "g'(x)"],
      reveal: "`f'(g(x)) · g'(x)` — outer derivative at the untouched inside, times the inner derivative.",
    },
  ],
  revo: [
    {
      prompt: "Quick recall: which coup ended Robespierre, and which brought Napoleon?",
      expected: ["thermidor", "brumaire"],
      reveal: "Thermidor (1794) ended Robespierre; Brumaire (1799) brought Napoleon.",
    },
  ],
};

/* ── prerequisite primers (teach A briefly, then return to B) ─ */

export const PRIMERS: Record<string, { title: string; body: string }> = {
  arrayIndexing: {
    title: "Quick foundation — how indexing bounds a search",
    body: "An array of `n` items is indexed `0 … n−1`. Binary search never looks at values first — it tracks which *index range* could still hide the target. `lo` and `hi` are those bounds.",
  },
  powerRule: {
    title: "Quick foundation — the power rule",
    body: "Before chaining: `d/dx xⁿ = n·xⁿ⁻¹`. The power rule lowers the exponent by one and multiplies by the old exponent — it's the outer-layer move in almost every chain-rule problem.",
  },
  composition: {
    title: "Quick foundation — spotting a composite",
    body: "`sin(x²)` means *apply sin to the result of x²*. Whenever one function sits inside another's parentheses, you have a composite — and composites are chain-rule territory.",
  },
  carriers: {
    title: "Quick foundation — energy carriers",
    body: "Think of ATP and NADPH as rechargeable batteries: the light reactions charge them, the Calvin cycle drains them. Without that picture, the two stages feel like random chemistry.",
  },
};

/* ── intuitive variants (used when confusion is detected) ──── */

export const SIMPLE_VARIANTS: Record<string, string> = {
  binary: "Forget the code for a second. Imagine a guessing game from 1 to 100 where I only answer *higher* or *lower*. Guessing 50, then 25 or 75, and so on — **that game is binary search**.\n\nThe two pointers are just the edges of the range that's still possible. `lo` says \"the answer can't be left of here\"; `hi` says \"can't be right of here.\" Every guess throws away half the remaining hallway.\n\nThe only reason people get confused is that the pointers *cross* at the end — they don't meet, they pass each other, and at that moment nothing is left to check.",
  photo: "Picture a solar farm next to a factory.\n\nThe **solar farm** (thylakoid membrane) catches sunlight and charges batteries — ATP and NADPH — and while it runs, it splits water; the oxygen drifting away is just exhaust from that splitting.\n\nThe **factory** (the stroma) doesn't care about sunlight at all. It just takes the charged batteries and uses them to stamp CO₂ into sugar parts. When the batteries run dry, the factory line stops — even though the factory never needed sunshine itself.\n\nThat single image — farm charging, factory spending — is really all of photosynthesis.",
  chain: "Think of a composite function like a set of nested gift boxes.\n\n`e^(cos(x²))` is a box inside a box inside a box: square first, then cosine wraps it, then the exponential wraps that. To unwrap it you always start with the **outermost** box — and every box you open contributes one piece to the answer.\n\nThat's the whole rule: open the outside box (differentiate the outer layer, leaving the inside alone), then multiply by whatever you find opening the next box, and the next. Three boxes, three multiplied pieces. Most mistakes are just someone skipping a box.",
  revo: "Instead of a single \"revolution\", picture a family that keeps hiring and firing managers because no one agrees who's in charge.\n\n1789: the assembly takes charge. Then a constitutional king. Then a republic. Then an emergency committee. Then a five-man directory. Each manager gets fired over the same fight — *who actually speaks for the nation?*\n\nIf you hold that soap-opera frame, the dates stop being random: each regime is just the next chapter of the same argument, and Napoleon walks in at the end as the manager who stops asking permission.",
};

/* ── exam angles ───────────────────────────────────────────── */

export const EXAM_ANGLES: Record<string, string> = {
  binary: "### Exam angle\n\n- **Frequent trap:** `lo < hi` vs `lo <= hi` — examiners love the off-by-one. Drilling the \"pointers cross\" sentence earns that mark every time.\n- **Show complexity as:** probes = ⌈log₂ n⌉. Computing it once, correctly, beats stating O(log n) vaguely.\n- **If asked to trace:** write the `lo / mid / hi` triple after every probe — full marks usually require all three per line.",
  photo: "### Exam angle\n\n- **The one-liner that wins marks:** oxygen comes from **water**, not CO₂.\n- **Structure longer answers as:** location → inputs → outputs → dependency. Examiners award one mark per column of that mental table.\n- **Trap wording:** \"the Calvin cycle happens in the dark\" — it happens in *daylight too*; it just doesn't need photons itself.",
  chain: "### Exam angle\n\n- **Full-credit layout:** given → identify layers → differentiate each → multiply. Write the layers on separate lines; markers award method marks per link.\n- **Traps:** a 3-layer composite with a skipped middle layer — count layers out loud.\n- **Time saver:** check whether it's really a composite first; `x²·sin x` is product rule and students lose minutes chaining it.",
  revo: "### Exam angle\n\n- **Always name the regime**, not just \"the revolution\" — regime labels are where the marks live.\n- **Memorize the swap-proof pair:** Thermidor 1794 (ends Robespierre) vs Brumaire 1799 (brings Napoleon).\n- **Stronger thesis pattern:** \"each regime collapsed on the sovereignty question\" beats a date list every time.",
};

/* ── Socratic solve scripts (2–3 guided beats then full solve) ─ */

export interface SolveBeat {
  say: string;
  ask: string;
  expected?: string[]; // terms that count as a good attempt
  confirm: string; // said when the student's attempt was reasonable
  nudge: string; // said when it wasn't
}

export const SOLVE_SCRIPTS: Record<string, { intro: string; beats: SolveBeat[] }> = {
  binary: {
    intro: "Let's build the solution instead of me handing it over — it'll stick better. Sorted array, target inside (or not).",
    beats: [
      {
        say: "**Step 1 is always the same:** before looking at any value, we define the region that could still hold the target.",
        ask: "What two things do we need to store to describe that region?",
        expected: ["lo", "hi", "low", "high", "start", "end", "bound", "index", "pointer"],
        confirm: "Exactly — two bounds: `lo = 0`, `hi = n − 1`. Everything between them is still a candidate.",
        nudge: "Not quite — think of the guessing game: what's the smallest information that captures \"the answer is somewhere in here\"? It's two boundary indices: `lo = 0`, `hi = n − 1`.",
      },
      {
        say: "**Step 2:** we probe one position per round.",
        ask: "Which index do we probe, and how do we compute it?",
        expected: ["mid", "middle", "/ 2", "half", "//", "average", "(lo + hi)"],
        confirm: "Right — `mid = lo + (hi − lo) // 2`. One probe, and the comparison then deletes half the region.",
        nudge: "We probe the middle: `mid = lo + (hi − lo) // 2`. The magic of binary search is that one comparison then discards half the candidates.",
      },
      {
        say: "**Step 3:** after comparing `arr[mid]` to the target, the region must shrink.",
        ask: "If the target is *larger* than `arr[mid]`, which pointer moves, and to what?",
        expected: ["lo", "mid + 1", "left", "right half"],
        confirm: "Correct — `lo = mid + 1`. The left half can no longer hold anything larger.",
        nudge: "Since the array is sorted, a larger target must live to the right — so we move `lo = mid + 1` and discard everything left of mid.",
      },
    ],
  },
  chain: {
    intro: "Good one to work through together — I'll guide, you drive.",
    beats: [
      {
        say: "**Step 1:** look at the expression and hunt for nesting.",
        ask: "In `e^(cos(x²))`, how many layers are there, and what's the outermost one?",
        expected: ["3", "three", "e^", "exponential", "exp"],
        confirm: "Three layers, outermost is the exponential. Each layer will donate exactly one factor.",
        nudge: "Count the nesting: `e^( … )` wraps `cos( … )` wraps `x²` — so three layers, exponential outermost, and each will donate one factor.",
      },
      {
        say: "**Step 2:** we differentiate layer by layer, outside-in.",
        ask: "Differentiate just the *outer* layer, leaving the inside alone. What do you get?",
        expected: ["e^", "e^(cos", "same"],
        confirm: "`e^(cos(x²))`, untouched inside. Now multiply by the derivative of the next layer — that reflex *is* the chain rule.",
        nudge: "The derivative of `e^u` is itself, so the outer layer gives `e^(cos(x²))` with the inside left alone — then we multiply by the next layer's derivative.",
      },
      {
        say: "**Step 3:** finish the chain.",
        ask: "What are the remaining two factors?",
        expected: ["-sin", "2x", "sin(x²)"],
        confirm: "`-sin(x²)` and `2x`. Multiply all three links and the answer is done.",
        nudge: "The remaining links are `-sin(x²)` (from cosine) and `2x` (from the square). Multiply every link.",
      },
    ],
  },
};

/* ── mistake phrasing (never judgemental) ─────────────────── */

export const MISTAKE_PHRASE: Record<MistakeKind, { label: string; advice: string }> = {
  conceptual: { label: "a concept mix-up", advice: "This is about the underlying idea — worth a careful re-read of why, not just what." },
  formula: { label: "a formula mix-up", advice: "The structure is fine; the formula map got crossed. A quick side-by-side fixes this fast." },
  calculation: { label: "a calculation slip", advice: "The method was right — the arithmetic slipped. Slower substitution fixes most of these." },
  sign: { label: "a sign slip", advice: "Method is right; a +/− flipped. Track each sign on its own line." },
  reading: { label: "a close-reading slip", advice: "The question's exact wording mattered here — underline what's literally asked." },
  logic: { label: "a logic slip", advice: "The reasoning chain had a reversed step — slow the if→then down." },
  unit: { label: "a unit slip", advice: "Carry units through every line; they catch these automatically." },
  misinterpretation: { label: "a misread of what's true", advice: "This one comes from how the fact is framed — worth re-anchoring to the source." },
  recall: { label: "a memory slip", advice: "Pure recall — a spaced re-test in a little while is the best fix." },
  incomplete: { label: "an incomplete step", advice: "You had most of it — the last link or qualifier is what to watch for." },
  careless: { label: "a small oversight", advice: "You almost certainly know this — a two-second sanity check is the fix." },
};

/** Concepts that compose a topic's ability estimate, in rough dependency order. */
export function conceptLabel(id: string): string {
  return CONCEPTS[id]?.label ?? id;
}
