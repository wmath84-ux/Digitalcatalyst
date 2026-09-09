import type { Attachment, GeneratedImage, InteractiveQuiz, QuizQuestion, ResponseFormat } from "./types";

export interface GenerationSpec {
  steps: { label: string; detail?: string }[];
  text: string;
  quiz?: InteractiveQuiz;
  format?: ResponseFormat;
  followUps?: string[];
  image?: Omit<GeneratedImage, "status">;
}

export const FORMAT_LABEL: Record<ResponseFormat, string> = {
  concise: "Quick answer",
  steps: "Step-by-step",
  comparison: "Comparison",
  "deep-dive": "Deep dive",
  code: "Code walkthrough",
  timeline: "Timeline",
  visual: "Visual",
  practice: "Practice set",
  feedback: "Feedback",
};

/* ─────────────────────────────────────────────────────────────
   Topic knowledge base
   One structured record per topic. Every response format below
   is rendered *from this data*, so the same topic can come back
   as a one-liner, a table, a walkthrough, or a diagram depending
   on what the student actually asked for.
   ───────────────────────────────────────────────────────────── */

export interface Topic {
  id: string;
  name: string;
  short: string;
  oneLiner: string;
  gist: string;
  keyPoints: string[];
  steps: { t: string; d: string }[];
  comparison: { intro: string; cols: string[]; rows: string[][]; takeaway: string };
  code?: { lang: string; source: string; walk: string[] };
  timeline?: { when: string; what: string }[];
  pitfall: string;
  image: { src: string; alt: string; caption: string; prompt: string; aspect: string };
}

const T_PHOTO: Topic = {
  id: "photo",
  name: "Photosynthesis",
  short: "photosynthesis",
  oneLiner: "Photosynthesis converts light energy into chemical energy in two linked stages — the light reactions charge the carriers, the Calvin cycle spends them.",
  gist: "Photosynthesis is best understood as **charging** and **spending**. The light-dependent reactions run in the thylakoid membrane: they capture photons, split water, release oxygen, and bank the energy as ATP and NADPH. The Calvin cycle then runs in the stroma, spending those carriers to fix CO₂ into G3P — the sugar building block everything else is made from.",
  keyPoints: [
    "Light reactions happen in the **thylakoid membrane**; the Calvin cycle happens in the **stroma**.",
    "The oxygen you breathe comes from **splitting water**, not from CO₂.",
    "ATP and NADPH are the only link between the two stages.",
    "The Calvin cycle needs no light directly — it stalls only once the carriers run dry.",
  ],
  steps: [
    { t: "Photons hit photosystem II", d: "Chlorophyll absorbs light and releases high-energy electrons into the transport chain." },
    { t: "Water is split (photolysis)", d: "H₂O donates electrons to replace those lost — releasing O₂ as a by-product." },
    { t: "The chain pumps protons", d: "Electrons cascade down the chain, building a proton gradient across the thylakoid membrane." },
    { t: "ATP synthase spins", d: "Protons flow back through the enzyme, producing ATP; photosystem I finishes the job by making NADPH." },
    { t: "The Calvin cycle fixes carbon", d: "In the stroma, Rubisco attaches CO₂ to RuBP; ATP and NADPH reduce it into G3P." },
  ],
  comparison: {
    intro: "The two stages are constantly confused because both are 'photosynthesis'. Side by side, they barely overlap:",
    cols: ["", "Light reactions", "Calvin cycle"],
    rows: [
      ["Location", "Thylakoid membrane", "Stroma"],
      ["Inputs", "Light, H₂O, ADP, NADP⁺", "CO₂, ATP, NADPH"],
      ["Outputs", "ATP, NADPH, O₂", "G3P (sugar), ADP, NADP⁺"],
      ["Needs light directly?", "Yes", "No — but depends on its products"],
      ["Key player", "Photosystems I & II", "Rubisco"],
    ],
    takeaway: "If you remember one line for the exam: **oxygen comes from water, carbon comes from CO₂.**",
  },
  timeline: [
    { when: "0 ns", what: "A photon strikes a chlorophyll molecule in photosystem II" },
    { when: "~ps", what: "Charge separation — an excited electron enters the transport chain" },
    { when: "~µs", what: "Water is split; O₂ is released into the air space" },
    { when: "~ms", what: "The proton gradient drives ATP synthase; NADPH is formed" },
    { when: "~s", what: "The Calvin cycle consumes ATP + NADPH and fixes CO₂ into G3P" },
  ],
  pitfall: "Writing that the Calvin cycle is the 'dark reaction' and therefore happens *at night*. It runs in daylight too — it simply doesn't need photons itself.",
  image: {
    src: "/images/gen-photosynthesis.png",
    alt: "Diagram of photosynthesis showing the light reactions in the thylakoid stack feeding ATP and NADPH into the Calvin cycle",
    caption: "The two stages of photosynthesis and the carriers that link them.",
    prompt: "photosynthesis in a chloroplast — light reactions feeding ATP and NADPH into the Calvin cycle",
    aspect: "3 / 2",
  },
};

const T_BINARY: Topic = {
  id: "binary",
  name: "Binary search",
  short: "binary search",
  oneLiner: "Binary search finds a value in a sorted array by repeatedly halving the search space, so a million elements take about twenty probes.",
  gist: "Binary search trades a linear scan for a **halving strategy**. You keep two pointers around the region that could still contain your target, probe the middle, and throw away the half that provably cannot hold it. Because the candidate set halves every probe, the cost is logarithmic rather than linear.",
  keyPoints: [
    "The array **must be sorted** — that is what makes discarding a half valid.",
    "`lo` and `hi` bound the region that could still contain the target.",
    "The loop runs while `lo <= hi`; the pointers **cross** when the search is exhausted.",
    "Cost is O(log n): a billion elements need only ~30 probes.",
  ],
  steps: [
    { t: "Set your bounds", d: "`lo = 0`, `hi = length - 1`. Everything between them is still a candidate." },
    { t: "Probe the middle", d: "`mid = lo + (hi - lo) / 2`, rounded down." },
    { t: "Compare against the target", d: "If `arr[mid] == target`, you're done — return `mid`." },
    { t: "Discard the impossible half", d: "If `arr[mid] < target`, set `lo = mid + 1`; otherwise set `hi = mid - 1`." },
    { t: "Stop when the pointers cross", d: "Once `lo > hi`, every position has been eliminated — the target is absent." },
  ],
  comparison: {
    intro: "Against a linear scan, the difference only shows up at scale — but then it is enormous:",
    cols: ["", "Linear search", "Binary search"],
    rows: [
      ["Requires sorted data", "No", "Yes"],
      ["Worst case", "O(n)", "O(log n)"],
      ["1,000,000 elements", "up to 1,000,000 probes", "~20 probes"],
      ["Best case", "O(1) — first element", "O(1) — first midpoint"],
      ["Extra memory", "O(1)", "O(1) iterative"],
    ],
    takeaway: "Sorting costs O(n log n) once — worth it the moment you search the same data more than a couple of times.",
  },
  code: {
    lang: "python",
    source: `def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1

    while lo <= hi:
        mid = lo + (hi - lo) // 2   # overflow-safe midpoint
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            lo = mid + 1            # search the right half
        else:
            hi = mid - 1            # search the left half

    return -1                       # not found`,
    walk: [
      "`lo, hi` bracket the live region — initially the whole array.",
      "`lo <= hi` keeps looping while at least one candidate remains. Using `<` here is the classic off-by-one bug.",
      "`lo + (hi - lo) // 2` is the same value as `(lo + hi) // 2` but cannot overflow in fixed-width integer languages.",
      "Each branch moves a pointer **past** `mid`, which guarantees the region shrinks and the loop terminates.",
    ],
  },
  pitfall: "Writing `while lo < hi`. When `lo == hi` there is still one unchecked candidate, so that version silently misses targets sitting at the final position.",
  image: {
    src: "/images/binary-search-slide.png",
    alt: "Diagram of a sorted array with lo, mid, and hi pointers marking the binary search bounds",
    caption: "One probe on eleven elements: the mid comparison discards half the array.",
    prompt: "sorted array with lo, mid and hi pointers illustrating one binary search probe",
    aspect: "3 / 2",
  },
};

const T_CHAIN: Topic = {
  id: "chain",
  name: "The chain rule",
  short: "the chain rule",
  oneLiner: "The chain rule differentiates nested functions by working outside-in and multiplying the derivative of every layer.",
  gist: "The chain rule handles **composite** functions — a function inside a function. You differentiate the outermost layer while leaving its inside untouched, then multiply by the derivative of the next layer in, and keep going until you reach the innermost variable. Every layer contributes exactly one factor.",
  keyPoints: [
    "Formally: if `y = f(g(x))` then `dy/dx = f'(g(x)) · g'(x)`.",
    "Work **outside-in**, and **multiply** — never add — the links.",
    "Count your layers before you start; the number of factors equals the number of layers.",
    "The inside of each layer stays untouched while you differentiate the outside of it.",
  ],
  steps: [
    { t: "Identify the layers", d: "For `e^(cos(x²))` the layers are exponential → cosine → square. That is three factors." },
    { t: "Differentiate the outer layer", d: "Leave the inside alone: `e^(cos(x²))`." },
    { t: "Multiply by the next derivative", d: "The derivative of `cos v` is `-sin v`, evaluated at the untouched inside: `-sin(x²)`." },
    { t: "Keep going to the core", d: "The derivative of `x²` is `2x`." },
    { t: "Multiply every link together", d: "`-2x · sin(x²) · e^(cos(x²))`." },
  ],
  comparison: {
    intro: "Students most often reach for the chain rule when they actually need the product or quotient rule. Here is the trigger for each:",
    cols: ["Rule", "Use it when", "Example"],
    rows: [
      ["Chain", "A function is **inside** another", "`sin(x²)`"],
      ["Product", "Two functions are **multiplied**", "`x² · sin x`"],
      ["Quotient", "Two functions are **divided**", "`sin x / x²`"],
      ["Power", "A plain variable is raised to a power", "`x⁵`"],
    ],
    takeaway: "Ask yourself: is the second function *inside the parentheses* of the first? That is the chain rule's signature.",
  },
  code: {
    lang: "text",
    source: `h(x) = e^(cos(x²))

layer 1  d/du  e^u        →  e^(cos(x²))
layer 2  d/dv  cos v      →  -sin(x²)
layer 3  d/dx  x²         →  2x

h'(x) = e^(cos(x²)) · (-sin(x²)) · 2x
      = -2x · sin(x²) · e^(cos(x²))`,
    walk: [
      "Each line differentiates exactly one layer, leaving the inside of that layer untouched.",
      "The final answer is the product of every line — three layers means three factors.",
      "Reordering into `-2x · sin(x²) · e^(...)` is cosmetic; graders accept either arrangement.",
    ],
  },
  pitfall: "Dropping a middle layer in a three-deep composite — the most common lost mark on this topic. Write each layer on its own line before multiplying.",
  image: {
    src: "/images/gen-chainrule.png",
    alt: "Diagram of nested function layers illustrating the chain rule worked from the outside in",
    caption: "Nested layers of `e^(cos(x²))` — one factor per layer, multiplied together.",
    prompt: "nested function layers showing the chain rule applied outside-in",
    aspect: "3 / 2",
  },
};

const T_REVO: Topic = {
  id: "revo",
  name: "The French Revolution",
  short: "the French Revolution",
  oneLiner: "The French Revolution was a decade-long argument over sovereignty in which France cycled through five regimes, each collapsing on the question of who speaks for the nation.",
  gist: "Between 1789 and 1799, France replaced an absolute monarchy with — in turn — a constitutional monarchy, a republic, a revolutionary dictatorship, and a directory, before Napoleon closed the decade with a coup. The through-line is not chaos for its own sake: each regime fell over the same unresolved question of **who legitimately speaks for the nation**.",
  keyPoints: [
    "Fiscal collapse, not ideology alone, forced the crisis of 1789.",
    "The Bastille turned an assembly dispute into a popular revolution.",
    "The Terror was governance by emergency committee, not mob rule.",
    "Brumaire (1799) ended the decade — don't confuse it with Thermidor (1794).",
  ],
  steps: [
    { t: "Diagnose the fiscal crisis", d: "Debt from foreign wars forces Louis XVI to summon the Estates-General in 1789." },
    { t: "Watch the Third Estate break away", d: "Denied equal voting, it declares itself the National Assembly and swears the Tennis Court Oath." },
    { t: "Track the popular turn", d: "The storming of the Bastille on 14 July makes the revolution irreversible." },
    { t: "Follow each regime's collapse", d: "Constitutional monarchy → republic → Committee of Public Safety → Directory, each undone by the legitimacy question." },
    { t: "Close with Brumaire", d: "Napoleon's 1799 coup ends the revolutionary decade and begins the Consulate." },
  ],
  comparison: {
    intro: "The clearest way to hold the decade in your head is regime by regime:",
    cols: ["Regime", "Years", "Why it fell"],
    rows: [
      ["Constitutional monarchy", "1789–92", "The Flight to Varennes destroyed trust in the king"],
      ["First Republic", "1792–93", "War and factional collapse (Girondins vs. Montagnards)"],
      ["Committee of Public Safety", "1793–94", "The Terror consumed its own leadership at Thermidor"],
      ["The Directory", "1795–99", "Corruption, inflation, and dependence on the army"],
      ["The Consulate", "1799–", "Napoleon converts military prestige into personal rule"],
    ],
    takeaway: "For essays, argue the *pattern* rather than listing events: each regime widened or narrowed the definition of the sovereign nation, and fell when that definition failed.",
  },
  timeline: [
    { when: "May 1789", what: "The Estates-General convenes at Versailles for the first time since 1614" },
    { when: "14 Jul 1789", what: "The storming of the Bastille — the revolution becomes popular and irreversible" },
    { when: "Jun 1791", what: "The Flight to Varennes fatally undermines the constitutional monarchy" },
    { when: "Sep 1792", what: "The monarchy is abolished; the First Republic is declared" },
    { when: "1793–94", what: "The Terror under the Committee of Public Safety; Louis XVI executed" },
    { when: "Jul 1794", what: "Thermidor — Robespierre falls and the Terror ends" },
    { when: "1795–99", what: "The Directory governs amid corruption and inflation" },
    { when: "Nov 1799", what: "Brumaire — Napoleon's coup ends the revolutionary decade" },
  ],
  pitfall: "Treating 'the Revolution' as one continuous government. Naming the specific regime in each sentence is the fastest way to raise an essay grade on this topic.",
  image: {
    src: "/images/gen-timeline.png",
    alt: "Timeline of the French Revolution marking the milestone years from 1789 to 1799",
    caption: "The revolutionary decade, 1789–1799, marked by its five regime changes.",
    prompt: "timeline of the French Revolution from 1789 to 1799 with milestone markers",
    aspect: "3 / 2",
  },
};

const T_GENERIC: Topic = {
  id: "generic",
  name: "This topic",
  short: "this topic",
  oneLiner: "Here is the shortest useful version, and I can expand any part of it on request.",
  gist: "I can shape an answer around whatever you need — a one-line definition, a full walkthrough, a comparison table, a diagram, or a practice set. Tell me the topic and how you want it and I'll match the structure to the ask.",
  keyPoints: [
    "State what you already know — it surfaces the real sticking point fast.",
    "Decide whether you need the *concept*, the *mechanics*, or the *exam framing*.",
    "Work one concrete example before generalising.",
  ],
  steps: [
    { t: "Restate the problem", d: "In your own words, which usually exposes the actual gap." },
    { t: "Isolate the sticking point", d: "Concept, procedure, or notation — each needs different help." },
    { t: "Work one example end to end", d: "Concrete first, general second." },
    { t: "Test yourself", d: "Ask me for a practice set and answer it right here in the chat." },
  ],
  comparison: {
    intro: "Here is how I can shape an answer, depending on what you need:",
    cols: ["Ask for…", "You get", "Best for"],
    rows: [
      ["“briefly”", "A short answer plus key points", "Revision and recall"],
      ["“step by step”", "A numbered walkthrough", "Learning a procedure"],
      ["“compare X and Y”", "A comparison table", "Untangling confusables"],
      ["“draw / diagram”", "A generated illustration", "Spatial or visual concepts"],
      ["“quiz me”", "An interactive practice set", "Checking what stuck"],
    ],
    takeaway: "The structure of my answer follows the shape of your question — just ask in the form you want it back.",
  },
  pitfall: "Studying by re-reading. Retrieval beats review every time — ask me to quiz you instead.",
  image: {
    src: "/images/gen-concept.png",
    alt: "Abstract concept map illustration with a central node connected to five satellite nodes",
    caption: "A concept map of the idea and its connected parts.",
    prompt: "abstract concept map of a topic and its related ideas",
    aspect: "3 / 2",
  },
};

export const TOPIC_BY_ID: Record<string, Topic> = {
  photo: T_PHOTO,
  binary: T_BINARY,
  chain: T_CHAIN,
  revo: T_REVO,
  generic: T_GENERIC,
};

export function detectTopic(text: string, courseShort: string): Topic {
  const t = text.toLowerCase();
  const c = courseShort.toLowerCase();
  if (/photo|plant|leaf|calvin|chloroplast|thylakoid|stroma|rubisco/.test(t)) return T_PHOTO;
  if (/binary|search|pointer|sorted array|log ?n|algorithm/.test(t)) return T_BINARY;
  if (/chain rule|derivative|differentiat|calculus|composite function/.test(t)) return T_CHAIN;
  if (/revolution|france|french|bastille|robespierre|napoleon|terror/.test(t)) return T_REVO;
  // fall back to the course the student is currently studying
  if (/bio/.test(c)) return T_PHOTO;
  if (/cs/.test(c)) return T_BINARY;
  if (/math/.test(c)) return T_CHAIN;
  if (/hist/.test(c)) return T_REVO;
  return T_GENERIC;
}

/* ─────────────────────────────────────────────────────────────
   Format detection — the "dynamic output structure" decision
   ───────────────────────────────────────────────────────────── */

export function detectFormat(text: string, hasMedia: boolean): ResponseFormat {
  const t = text.toLowerCase();
  // Image generation needs an explicit *creation* verb — otherwise
  // "explain this diagram" would wrongly redraw instead of explaining.
  if (/\b(visuali[sz]e|illustrate)\b/.test(t)) return "visual";
  if (/\b(draw|sketch|render|generate|create|make|give me|show me)\b[^.?!]{0,30}\b(diagram|image|picture|illustration|infographic|visual|chart)\b/.test(t))
    return "visual";
  if (/\b(practice|quiz|test me|check-?up|drill|questions to answer|harder set|fresh set|another set|set of \d)\b/.test(t)) return "practice";
  if (/\b(essay|feedback|my draft|paragraph|critique|review my)\b/.test(t)) return "feedback";
  if (/\b(differen\w*|compare|comparison|versus|vs\.?|contrast|better than)\b/.test(t)) return "comparison";
  if (/\b(timeline|chronolog\w*|order of events|phases|sequence|what happened when)\b/.test(t)) return "timeline";
  if (/\b(code|implement|pseudocode|write (a|the) function|program|syntax|in python|snippet)\b/.test(t)) return "code";
  if (/\b(step by step|steps|how do|how does|how to|walk me through|process|procedure|derive)\b/.test(t)) return "steps";
  if (/\b(brief\w*|short|quick|tl;?dr|in one|one-?line|simply|simple|eli5|summar\w*|recap|key points)\b/.test(t)) return "concise";
  if (hasMedia) return "steps";
  return "deep-dive";
}

/* ─────────────────────────────────────────────────────────────
   Formatters — one structure per intent, all from Topic data
   ───────────────────────────────────────────────────────────── */

const bullets = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");

export function fmtConcise(topic: Topic): string {
  return `${topic.oneLiner}\n\n${bullets(topic.keyPoints.slice(0, 3))}\n\nThat's the compressed version — say the word if you want the full walkthrough.`;
}

export function fmtSteps(topic: Topic): string {
  const body = topic.steps.map((s, i) => `${i + 1}. **${s.t}** — ${s.d}`).join("\n");
  return `${topic.oneLiner}\n\n### The walkthrough\n\n${body}\n\n> **Watch out:** ${topic.pitfall}`;
}

function fmtComparison(topic: Topic): string {
  const { intro, cols, rows, takeaway } = topic.comparison;
  const head = `| ${cols.join(" | ")} |`;
  const sep = `| ${cols.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.join(" | ")} |`).join("\n");
  return `${intro}\n\n${head}\n${sep}\n${body}\n\n${takeaway}`;
}

function fmtTimeline(topic: Topic): string {
  if (!topic.timeline) return fmtSteps(topic);
  const body = topic.timeline.map((e) => `- **${e.when}** — ${e.what}`).join("\n");
  return `Here is ${topic.short} laid out in order:\n\n${body}\n\n> **Watch out:** ${topic.pitfall}`;
}

function fmtCode(topic: Topic): string {
  if (!topic.code) return fmtSteps(topic);
  const walk = topic.code.walk.map((w, i) => `${i + 1}. ${w}`).join("\n");
  return `Here is ${topic.short} in code, then a line-by-line read.\n\n\`\`\`${topic.code.lang}\n${topic.code.source}\n\`\`\`\n\n### Reading it line by line\n\n${walk}\n\n> **Watch out:** ${topic.pitfall}`;
}

export function fmtDeepDive(topic: Topic): string {
  const stepBody = topic.steps.map((s, i) => `${i + 1}. **${s.t}** — ${s.d}`).join("\n");
  const { cols, rows } = topic.comparison;
  const table = [`| ${cols.join(" | ")} |`, `| ${cols.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
  const code = topic.code ? `\n\n### In code\n\n\`\`\`${topic.code.lang}\n${topic.code.source}\n\`\`\`` : "";
  return `${topic.gist}\n\n### The key points\n\n${bullets(topic.keyPoints)}\n\n### How it actually runs\n\n${stepBody}\n\n### At a glance\n\n${table}${code}\n\n> **Where students slip:** ${topic.pitfall}`;
}

function fmtVisual(topic: Topic): string {
  return `I've drawn ${topic.short} as a diagram — it's rendering below.\n\n${topic.oneLiner}\n\n**What to look for in the image**\n\n${bullets(topic.keyPoints.slice(0, 3))}`;
}

/* contextual next steps, matched to what was just delivered */

export function followUpsFor(format: ResponseFormat, topic: Topic): string[] {
  const t = topic.short;
  switch (format) {
    case "concise":
      return [`Explain ${t} step by step`, `Draw ${t} as a diagram`, "Quiz me on this"];
    case "steps":
      return [`Draw ${t} as a diagram`, "Quiz me on this", "Where do students usually slip?"];
    case "comparison":
      return [`Draw ${t} as a diagram`, "Quiz me on the differences", "Give me the short version"];
    case "timeline":
      return ["Quiz me on these dates", `Draw ${t} as a diagram`, "Which phase matters most for essays?"];
    case "code":
      return ["Walk me through an example trace", "What is the time complexity?", "Quiz me on this"];
    case "visual":
      return ["Explain this diagram step by step", "Quiz me on this", "Give me the short version"];
    case "deep-dive":
      return ["Summarise that briefly", `Draw ${t} as a diagram`, "Quiz me on this"];
    case "feedback":
      return ["Help me outline the body sections", "Show a stronger example", "Quiz me on this topic"];
    default:
      return [];
  }
}

function stepsFor(format: ResponseFormat, topic: Topic, courseShort: string): { label: string; detail?: string }[] {
  const base = [{ label: "Reading your message" }, { label: "Checking course context", detail: courseShort }];
  const choose = { label: "Choosing a response structure", detail: FORMAT_LABEL[format] };
  switch (format) {
    case "visual":
      return [
        { label: "Reading your request" },
        choose,
        { label: "Composing the visual brief", detail: topic.image.prompt },
        { label: "Rendering the illustration", detail: "1536 × 1024" },
        { label: "Labelling and checking contrast" },
      ];
    case "comparison":
      return [...base, choose, { label: "Building the comparison table", detail: `${topic.comparison.rows.length} rows` }, { label: "Composing response" }];
    case "timeline":
      return [...base, choose, { label: "Ordering events chronologically", detail: `${topic.timeline?.length ?? topic.steps.length} entries` }, { label: "Composing response" }];
    case "code":
      return [...base, choose, { label: "Writing and checking the implementation" }, { label: "Annotating each line" }, { label: "Composing response" }];
    case "concise":
      return [{ label: "Reading your message" }, choose, { label: "Compressing to the essentials" }, { label: "Composing response" }];
    case "steps":
      return [...base, choose, { label: "Sequencing the walkthrough", detail: `${topic.steps.length} steps` }, { label: "Composing response" }];
    default:
      return [...base, choose, { label: "Reviewing lesson material", detail: "2 sources" }, { label: "Structuring the answer" }, { label: "Composing response" }];
  }
}

/* ─────────────────────────────────────────────────────────────
   Practice sets (interactive) — unchanged behaviour
   ───────────────────────────────────────────────────────────── */

const PHOTOSYNTHESIS: Omit<QuizQuestion, "difficulty" | "concept">[] = [
  {
    q: "Where do the light-dependent reactions take place?",
    options: ["The stroma", "The thylakoid membrane", "The cytoplasm", "The outer chloroplast membrane"],
    correct: 1,
    explain:
      "The light reactions run across the **thylakoid membrane** because that is where photosystems I and II, the electron transport chain, and ATP synthase are physically embedded. The stroma is where the Calvin cycle happens afterwards — keeping these two locations straight is the key to this chapter.",
  },
  {
    q: "The oxygen released during photosynthesis comes from which molecule?",
    options: ["Carbon dioxide (CO₂)", "Glucose", "Water (H₂O)", "ATP"],
    correct: 2,
    explain:
      "It comes from **water**. During photolysis, water molecules are split to replace electrons lost by photosystem II — oxygen is the by-product. The carbon from CO₂ ends up in sugar, not in the O₂ you breathe.",
  },
  {
    q: "Which pair carries energy from the light reactions to the Calvin cycle?",
    options: ["ADP and NADP⁺", "FADH₂ and NADH", "CO₂ and O₂", "ATP and NADPH"],
    correct: 3,
    explain:
      "**ATP and NADPH**. ATP supplies the energy and NADPH supplies the reducing power to fix CO₂ into sugar. They are spent by the Calvin cycle and regenerated by the light reactions — which is exactly why darkness stalls sugar production within minutes.",
  },
  {
    q: "A plant in total darkness is given plenty of ATP and NADPH. Can the Calvin cycle still run?",
    options: ["No — it requires photons directly", "Yes — but only briefly", "Yes — indefinitely", "Only if temperature rises"],
    correct: 1,
    explain:
      "**Yes, but only briefly.** The Calvin cycle needs no light directly — it runs on ATP and NADPH. It stops only when those carriers run out, which happens fast without the light reactions to regenerate them.",
  },
];

const BINARY_SEARCH: Omit<QuizQuestion, "difficulty" | "concept">[] = [
  {
    q: "A sorted array has 1,000,000 elements. What is the maximum number of probes binary search needs?",
    options: ["About 10", "About 20", "About 1,000", "About 500,000"],
    correct: 1,
    explain:
      "About **20**. Each probe halves the search space, so the count is log₂(1,000,000) ≈ 19.9, rounded up. Compare that with up to a million probes for linear search.",
  },
  {
    q: "What is the correct loop condition for the standard binary search implementation?",
    options: ["lo < hi", "lo != hi", "lo <= hi", "mid != target"],
    correct: 2,
    explain:
      "`lo <= hi`. When `lo == hi` there is still **one candidate left to check** — stopping early would miss targets sitting exactly at that position. The search is exhausted only when the pointers cross.",
  },
  {
    q: "Why write `mid = lo + (hi - lo) / 2` instead of `mid = (lo + hi) / 2`?",
    options: ["It avoids integer overflow", "It is faster", "It rounds more accurately", "It is required syntax"],
    correct: 0,
    explain:
      "In languages with 32-bit integers (Java, C++), `lo + hi` can overflow for large arrays and produce a negative index. Reordering to `lo + (hi - lo) / 2` is identical math with no overflow risk.",
  },
  {
    q: "If `arr[mid] < target`, what is the correct next step?",
    options: ["Set `hi = mid`", "Search the left half", "Set `lo = mid + 1`", "Declare the target absent"],
    correct: 2,
    explain:
      "Because the array is sorted, everything at or left of `mid` is ≤ `arr[mid]`, so none of it can be the target. You discard that entire half with **`lo = mid + 1`**.",
  },
];

const CHAIN_RULE: Omit<QuizQuestion, "difficulty" | "concept">[] = [
  {
    q: "What is the derivative of `(3x + 1)⁴`?",
    options: ["4(3x + 1)³", "12x(3x + 1)³", "12(3x + 1)³", "(3x + 1)³"],
    correct: 2,
    explain:
      "Apply the power rule to the outer layer: `4(3x + 1)³`. Then multiply by the inner derivative `3`. Result: **`12(3x + 1)³`**. (The x is not part of the derivative chain here.)",
  },
  {
    q: "The chain rule says to differentiate composite functions by working…",
    options: ["Inside-out, adding each link", "Outside-in, multiplying each link", "Top-down with the product rule", "Using the exponent rule repeatedly"],
    correct: 1,
    explain:
      "**Outside-in, multiplying.** You differentiate the outermost layer while leaving the inside untouched, then multiply by the derivative of the next layer in — link by link.",
  },
  {
    q: "What is the derivative of `sin(x²)`?",
    options: ["cos(x²)", "2x · cos(x²)", "2cos(x)", "-2x · cos(x²)"],
    correct: 1,
    explain:
      "The derivative of sin is cos, evaluated at the untouched inner function: `cos(x²)`. Then multiply by the inner derivative `2x` → **`2x · cos(x²)`**.",
  },
  {
    q: "What is the most common chain rule mistake?",
    options: ["Using the quotient rule", "Skipping a middle layer", "Forgetting +C", "Applying the wrong power rule"],
    correct: 1,
    explain:
      "**Skipping a middle layer.** With three or more nested layers it is easy to drop one. Count your layers before you start, and write each link explicitly — like in `e^(cos(x²))`, which has three.",
  },
];

const REVOLUTION: Omit<QuizQuestion, "difficulty" | "concept">[] = [
  {
    q: "Which July 1789 event marked the Revolution's popular turning point?",
    options: ["The Tennis Court Oath", "The storming of the Bastille", "The Declaration of the Rights of Man", "The execution of Louis XVI"],
    correct: 1,
    explain:
      "The **storming of the Bastille** (July 14). The Tennis Court Oath came first (June) but was an act of deputies; the Bastille brought Paris onto the stage and made the revolution irreversible.",
  },
  {
    q: "The constitutional monarchy of 1791 collapsed largely because…",
    options: ["The famine ended", "Britain invaded", "The church split completely", "The Flight to Varennes destroyed trust in the king"],
    correct: 3,
    explain:
      "The **Flight to Varennes** (June 1791). The king's attempted escape proved — in the public's eyes — that he rejected the constitution he had sworn to uphold.",
  },
  {
    q: "Which body drove the Terror of 1793–94?",
    options: ["The Directory", "The Committee of Public Safety", "The Estates-General", "The Legislative Assembly"],
    correct: 1,
    explain:
      "The **Committee of Public Safety**, dominated by Robespierre. It governed through emergency powers and mass repression until Robespierre's fall in Thermidor (July 1794).",
  },
  {
    q: "Napoleon's coup that ended the revolutionary decade is known as…",
    options: ["Thermidor", "Fructidor", "Brumaire", "Vendémiaire"],
    correct: 2,
    explain:
      "**Brumaire** (November 1799). Don't confuse it with Thermidor — that was the coup *against Robespierre* in 1794. Brumaire brought Napoleon to power.",
  },
];

/* Legacy bank enrichment: difficulty tier + concept ids per index. */
const QUIZ_META: Record<string, [1 | 2 | 3, string][]> = {
  photo: [[1, "thylakoidVsStroma"], [1, "oxygenOrigin"], [2, "carriers"], [3, "calvinDependence"]],
  binary: [[2, "logGrowth"], [2, "loopInvariant"], [3, "pointerMovement"], [1, "pointerMovement"]],
  chain: [[1, "linkMultiplication"], [1, "layers"], [2, "linkMultiplication"], [3, "layers"]],
  revo: [[1, "turningPoints"], [2, "regimeSequence"], [1, "regimeSequence"], [3, "thermidorVsBrumaire"]],
};

const QUIZ_BY_TOPIC: Record<string, QuizQuestion[]> = Object.fromEntries(
  Object.entries({ photo: PHOTOSYNTHESIS, binary: BINARY_SEARCH, chain: CHAIN_RULE, revo: REVOLUTION, generic: PHOTOSYNTHESIS }).map(
    ([key, qs]) => [
      key,
      (qs as Omit<QuizQuestion, "difficulty" | "concept">[]).map((q, i) => ({
        ...q,
        difficulty: QUIZ_META[key]?.[i]?.[0] ?? 2,
        concept: QUIZ_META[key]?.[i]?.[1] ?? key,
      })),
    ]
  )
);

export function buildQuizSpec(userText: string, courseShort: string): GenerationSpec {
  const topic = detectTopic(userText, courseShort);
  const questions = QUIZ_BY_TOPIC[topic.id] ?? PHOTOSYNTHESIS;
  const label = topic.id === "generic" ? "Chapter 4: Photosynthesis" : topic.name;
  const quiz: InteractiveQuiz = {
    topic: label,
    questions,
    answers: questions.map(() => null),
    submitted: false,
  };
  return {
    format: "practice",
    steps: [
      { label: "Identifying the topic", detail: label },
      { label: "Choosing a response structure", detail: FORMAT_LABEL.practice },
      { label: "Pulling questions from course notes", detail: courseShort },
      { label: "Writing distractors and the answer key" },
      { label: "Composing your practice set" },
    ],
    text: `Here are **${questions.length} quick questions** on ${label}. Pick an answer for each one, then hit **Check my answers** — I'll grade the set and walk you through every question step by step.`,
    quiz,
  };
}

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export function buildGradingSpec(quiz: InteractiveQuiz): GenerationSpec {
  const total = quiz.questions.length;
  let score = 0;
  quiz.questions.forEach((q, i) => {
    if (quiz.answers[i] === q.correct) score += 1;
  });
  const ratio = score / total;
  const headline =
    ratio === 1
      ? `**${score} / ${total} — flawless.** Excellent work. Here is the confirmation of your reasoning:`
      : ratio >= 0.75
        ? `**${score} / ${total} — solid.** One gap to close; here is the full breakdown:`
        : ratio >= 0.5
          ? `**${score} / ${total} — a decent start.** Let's sort out what slipped:`
          : `**${score} / ${total} — good that we checked.** Let's rebuild these step by step:`;

  const sections = quiz.questions
    .map((q, i) => {
      const picked = quiz.answers[i];
      const ok = picked === q.correct;
      const head = `### Q${i + 1} — ${ok ? "Correct" : "Not quite"}`;
      const pickLine =
        picked == null
          ? `You left this blank — the answer is **${LETTERS[q.correct]}) ${q.options[q.correct]}**.`
          : ok
            ? `You chose **${LETTERS[picked]}) ${q.options[picked]}**. Exactly right.`
            : `You chose **${LETTERS[picked]}) ${q.options[picked]}** — the answer is **${LETTERS[q.correct]}) ${q.options[q.correct]}**.`;
      return `${head}\n\n${pickLine}\n\n${q.explain}`;
    })
    .join("\n\n");

  const missed = quiz.questions.map((q, i) => (quiz.answers[i] === q.correct ? -1 : i + 1)).filter((n) => n > 0);
  const closer =
    ratio === 1
      ? `Want a **harder set** on the same topic, or shall we move to the next section?`
      : `Want to re-try just the ${missed.length === 1 ? "one" : "ones"} you missed (Q${missed.join(", Q")}), or a fresh **set of four** built around ${quiz.topic.toLowerCase()}?`;

  return {
    format: "feedback",
    steps: [
      { label: "Reading your answers" },
      { label: "Checking against the answer key" },
      { label: "Preparing step-by-step explanations" },
      { label: "Composing feedback" },
    ],
    text: `${headline}\n\n${sections}\n\n---\n\n${closer}`,
    followUps:
      ratio === 1
        ? ["Give me a harder set", "Draw this as a diagram", "Move to the next topic"]
        : [`Explain Q${missed[0]} again slowly`, "Give me a fresh set", "Draw this as a diagram"],
  };
}

export function formatAnswerSheet(quiz: InteractiveQuiz): string {
  const lines = quiz.questions.map((q, i) => {
    const a = quiz.answers[i];
    const label = a == null ? "— (skipped)" : `${LETTERS[a]} — ${q.options[a]}`;
    return `${i + 1}. ${label}`;
  });
  return [`My answers — ${quiz.topic}`, ...lines, "", "Grade these and explain each one step by step."].join("\n");
}

/* ─────────────────────────────────────────────────────────────
   Fixed-intent responses that aren't topic-shaped
   ───────────────────────────────────────────────────────────── */

const ESSAY_FEEDBACK = `Good instinct getting feedback early — openings set the bar for everything after them.

### What is not working yet

**"A very important event… that changed many things for many people"** tells the reader almost nothing. Every exam answer ever written could start this way, which means it argues nothing. Graders call this a *throat-clearing* opening.

### How to fix it

1. **Replace the claim of importance with a claim of interpretation.** What is your *argument*?
2. **Name your stakes concretely.** Not "many things" — say which: citizenship, property, the church, empire.
3. **Signal your structure.** One sentence previewing your body sections.

### A revised version to react to

> "The French Revolution was less a single event than a decade-long argument over sovereignty. Between 1789 and 1799, France cycled through five answers — assembly, monarchy, republic, committee, directory — and each collapsed on the same question: who speaks for the nation?"

That paragraph *commits*. It can be disagreed with — which is exactly what makes it defensible.`;

function imageAnalysis(shots: number, uploads: number, topic: Topic): string {
  const what = shots > 0 && uploads === 0 ? "screenshot" : shots > 0 ? "screenshot and image" : "image";
  return `I've looked at the ${what} you shared${uploads + shots > 1 ? "s" : ""}, and it maps onto **${topic.name}** from your course.

${topic.oneLiner}

**What stands out in the capture**

${bullets(topic.keyPoints.slice(0, 3))}

Tell me which direction you want — or ask a question and I'll anchor the answer to exactly what you captured.`;
}

/* ─────────────────────────────────────────────────────────────
   Entry point
   ───────────────────────────────────────────────────────────── */

/** Compose the standard content formats for a topic (shared with the tutor layer). */
export function compose(format: string, topic: Topic): string {
  const byFormat: Record<string, string> = {
    concise: fmtConcise(topic),
    steps: fmtSteps(topic),
    comparison: fmtComparison(topic),
    timeline: fmtTimeline(topic),
    code: fmtCode(topic),
    "deep-dive": fmtDeepDive(topic),
  };
  return byFormat[format] ?? fmtDeepDive(topic);
}

export function pickResponse(userText: string, attachments: Attachment[], courseShort: string): GenerationSpec {
  const t = userText.toLowerCase();
  const shots = attachments.filter((a) => a.kind === "screenshot").length;
  const uploads = attachments.filter((a) => a.kind === "upload").length;
  const hasMedia = attachments.length > 0;
  const topic = detectTopic(userText, courseShort);
  const format = detectFormat(t, hasMedia);

  if (format === "practice") return buildQuizSpec(userText, courseShort);

  if (format === "feedback") {
    return {
      format,
      steps: [
        { label: "Reading your draft closely" },
        { label: "Choosing a response structure", detail: FORMAT_LABEL.feedback },
        { label: "Reviewing rubric criteria", detail: "argument · evidence · structure" },
        { label: "Drafting targeted revision notes" },
      ],
      text: ESSAY_FEEDBACK,
      followUps: followUpsFor("feedback", topic),
    };
  }

  // Image generation
  if (format === "visual") {
    return {
      format,
      steps: stepsFor("visual", topic, courseShort),
      text: fmtVisual(topic),
      followUps: followUpsFor("visual", topic),
      image: {
        prompt: userText.trim() || topic.image.prompt,
        src: topic.image.src,
        alt: topic.image.alt,
        caption: topic.image.caption,
        aspect: topic.image.aspect,
      },
    };
  }

  // Attachments with no explicit structural ask → analyse the capture
  if (hasMedia && !t.trim()) {
    return {
      format: "concise",
      steps: [
        { label: "Reading your message" },
        { label: shots > 0 ? "Scanning captured screen region" : "Analyzing attached image", detail: attachments[0].name },
        { label: "Matching content to current lesson", detail: courseShort },
        { label: "Composing response" },
      ],
      text: imageAnalysis(shots, uploads, topic),
      followUps: [`Explain ${topic.short} step by step`, "Quiz me on this", "Draw this as a diagram"],
    };
  }

  let text = compose(format, topic);
  if (hasMedia) {
    text = `Looking at what you shared, this is **${topic.name}**.\n\n${text}`;
  }

  const steps = stepsFor(format, topic, courseShort);
  if (hasMedia) {
    steps.splice(1, 0, {
      label: shots > 0 ? "Scanning captured screen region" : "Analyzing attached image",
      detail: attachments[0].name,
    });
  }

  return { format, steps, text, followUps: followUpsFor(format, topic) };
}
