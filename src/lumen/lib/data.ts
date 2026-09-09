import type { AIModel, Attachment, Chat, Message, ResponseFormat } from "./types";

export const MODELS: AIModel[] = [
  { id: "default", name: "School AI", short: "School", desc: "The AI your institute publishes", badge: "Default" },
  { id: "own", name: "Your own key", short: "Own", desc: "Use the provider you connected in Revision → AI Configuration" },
];

const seedAttachment: Attachment = {
  id: "att-seed-1",
  kind: "upload",
  name: "lecture-4.2-slide.png",
  src: "/images/binary-search-slide.png",
  w: 1536,
  h: 1024,
  size: 612_000,
};

const binarySearchAnswer = `Binary search works by repeatedly **halving the search space**. Instead of checking every element one by one, you look at the middle element and discard the half that cannot contain your target.

### The pointer dance, step by step

1. Start with two pointers: \`lo\` at index \`0\` and \`hi\` at the last index.
2. Compute the middle index: \`mid = (lo + hi) / 2\`, rounded down.
3. Compare \`array[mid]\` with your target:
   - **Equal** → you're done, return \`mid\`.
   - **Target is larger** → discard everything left of mid: \`lo = mid + 1\`.
   - **Target is smaller** → discard everything right of mid: \`hi = mid - 1\`.
4. Repeat until \`lo > hi\` — then the target is not in the array.

On your slide, the first probe already cuts eleven candidates down to five. That is the whole magic.

### Reference implementation

\`\`\`python
def binary_search(arr, target):
    lo, hi = 0, len(arr) - 1

    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            lo = mid + 1      # search the right half
        else:
            hi = mid - 1      # search the left half

    return -1                 # not found
\`\`\`

### Why the pointers feel confusing

The trick is that the pointers never "meet in the middle" — they **cross**. When \`lo\` passes \`hi\`, every possible position has been eliminated, which is exactly why the loop condition is \`lo <= hi\`.

| Case | Comparisons | When it happens |
| --- | --- | --- |
| Best | O(1) | Target is the first midpoint |
| Average | O(log n) | Typical random target |
| Worst | O(log n) | Target absent or at an edge |

Want to try it yourself? The [practice set for Lesson 4.2](#) has three graduated problems, or ask me to generate a tracing exercise on an array of your choice.`;

const photosynthesisAnswer = `Think of the two stages as **charging** and **spending**.

- **Light-dependent reactions** happen in the thylakoid membranes. They capture sunlight and convert it into chemical energy — ATP and NADPH — while splitting water and releasing oxygen.
- **The Calvin cycle** happens in the stroma. It *spends* that ATP and NADPH to fix CO₂ into G3P, the raw sugar building block.

| | Light reactions | Calvin cycle |
| --- | --- | --- |
| Location | Thylakoid membrane | Stroma |
| Inputs | Light, H₂O, ADP, NADP⁺ | CO₂, ATP, NADPH |
| Outputs | ATP, NADPH, O₂ | G3P (sugar), ADP, NADP⁺ |
| Needs direct light? | Yes | No — but depends on its products |

The exam favorite: oxygen comes from **water**, not from CO₂. If you remember one line, make it that one.`;

const revolutionAnswer = `Here is the arc of the revolution in six beats:

1. **1789 — Estates-General & the Bastille.** Fiscal collapse forces the king to summon the Estates-General; the Third Estate breaks away, and Paris storms the Bastille on July 14.
2. **1791 — Constitutional monarchy.** The first constitution limits royal power; the failed Flight to Varennes destroys what trust remained.
3. **1792 — Republic declared.** The monarchy is abolished after the insurrection of August 10.
4. **1793–94 — The Terror.** Louis XVI is executed; the Committee of Public Safety governs through mass repression until Robespierre falls in Thermidor.
5. **1795–99 — The Directory.** A five-man executive struggles with corruption, inflation, and war.
6. **1799 — Brumaire.** Napoleon Bonaparte's coup ends the revolutionary decade.

For your essay, notice the through-line: every regime change was driven by the same question — *who gets to speak for the nation?* That is a stronger thesis than "it was a very important event."`;

const chainRuleProblems = `Here are three, graduated in difficulty. Try each one before peeking at my hints.

1. **Warm-up.** Differentiate \`f(x) = (3x^2 + 1)^4\`.
   *Hint: outer function is a power.*
2. **Medium.** Differentiate \`g(x) = sin(5x^3 - 2x)\`.
   *Hint: one trig layer around one polynomial layer.*
3. **Stretch.** Differentiate \`h(x) = e^(cos(x^2))\`.
   *Hint: three nested layers — work from the outside in and multiply every link.*

Reply with your answers and I will check each step, or say **"answer key"** and I will walk through all three.`;

const essayErrorText = "";

export const SEED_CHATS: Chat[] = [
  {
    id: "chat-binary",
    title: "Binary search — walkthrough",
    course: "CS 101 · Algorithms",
    courseShort: "CS 101",
    pinned: true,
    modelId: "lumen-2-pro",
    messages: [
      {
        id: "m-b1",
        role: "user",
        content:
          "I'm stuck on the practice set — can you walk me through how binary search actually works? I keep mixing up the lo and hi pointers. I attached the slide from lecture 4.2.",
        attachments: [seedAttachment],
        createdAt: Date.now() - 1000 * 60 * 42,
        status: "complete",
      },
      {
        id: "m-b2",
        role: "assistant",
        content: binarySearchAnswer,
        createdAt: Date.now() - 1000 * 60 * 41,
        status: "complete",
        modelLabel: "Lumen 2 Pro",
        format: "steps",
        followUps: ["Draw binary search as a diagram", "Quiz me on this", "Show me the code"],
        thinkingOpen: false,
        thinkingMs: 8200,
        thinking: [
          { label: "Reading the question", status: "done" },
          { label: "Analyzing attached image", detail: "lecture-4.2-slide.png", status: "done" },
          { label: "Choosing a response structure", detail: "Step-by-step", status: "done" },
          { label: "Sequencing the walkthrough", detail: "5 steps", status: "done" },
          { label: "Composing response", status: "done" },
        ],
      },
    ],
  },
  {
    id: "chat-visual",
    title: "Visualize the Calvin cycle",
    course: "BIO 110 · Cell Biology",
    courseShort: "BIO 110",
    modelId: "lumen-2-pro",
    messages: [
      {
        id: "m-v1",
        role: "user",
        content: "Can you draw me a diagram showing how the light reactions connect to the Calvin cycle? I learn better visually.",
        createdAt: Date.now() - 1000 * 60 * 18,
        status: "complete",
      },
      {
        id: "m-v2",
        role: "assistant",
        content: `I've drawn photosynthesis as a diagram — it's below.

Photosynthesis converts light energy into chemical energy in two linked stages — the light reactions charge the carriers, the Calvin cycle spends them.

**What to look for in the image**

- Light reactions happen in the **thylakoid membrane**; the Calvin cycle happens in the **stroma**.
- The oxygen you breathe comes from **splitting water**, not from CO₂.
- ATP and NADPH are the only link between the two stages.`,
        createdAt: Date.now() - 1000 * 60 * 17,
        status: "complete",
        modelLabel: "Lumen 2 Pro",
        format: "visual",
        followUps: ["Explain this diagram step by step", "Quiz me on this", "Give me the short version"],
        image: {
          prompt: "diagram showing how the light reactions connect to the Calvin cycle",
          src: "/images/gen-photosynthesis.png",
          alt: "Diagram of photosynthesis showing the light reactions in the thylakoid stack feeding ATP and NADPH into the Calvin cycle",
          caption: "The two stages of photosynthesis and the carriers that link them.",
          aspect: "3 / 2",
          status: "done",
        },
        thinkingOpen: false,
        thinkingMs: 11400,
        thinking: [
          { label: "Reading your request", status: "done" },
          { label: "Choosing a response structure", detail: "Visual", status: "done" },
          { label: "Composing the visual brief", detail: "light reactions feeding the Calvin cycle", status: "done" },
          { label: "Rendering the illustration", detail: "1536 × 1024", status: "done" },
          { label: "Labelling and checking contrast", status: "done" },
        ],
      },
    ],
  },
  {
    id: "chat-photo",
    title: "Photosynthesis — Ch. 4 review",
    course: "BIO 110 · Cell Biology",
    courseShort: "BIO 110",
    modelId: "lumen-2",
    messages: [
      {
        id: "m-p1",
        role: "user",
        content: "What is the actual difference between the light-dependent reactions and the Calvin cycle? Our professor keeps using them interchangeably.",
        createdAt: Date.now() - 1000 * 60 * 60 * 3,
        status: "complete",
      },
      {
        id: "m-p2",
        role: "assistant",
        content: photosynthesisAnswer,
        createdAt: Date.now() - 1000 * 60 * 60 * 3 + 40000,
        status: "complete",
        modelLabel: "Lumen 2",
        format: "comparison",
        followUps: ["Draw photosynthesis as a diagram", "Quiz me on the differences", "Give me the short version"],
        thinkingOpen: false,
        thinkingMs: 5400,
        thinking: [
          { label: "Reading the question", status: "done" },
          { label: "Choosing a response structure", detail: "Comparison", status: "done" },
          { label: "Building the comparison table", detail: "5 rows", status: "done" },
          { label: "Composing response", status: "done" },
        ],
      },
    ],
  },
  {
    id: "chat-revo",
    title: "French Revolution timeline",
    course: "HIST 204 · Modern Europe",
    courseShort: "HIST 204",
    modelId: "lumen-2",
    messages: [
      {
        id: "m-r1",
        role: "user",
        content: "Can you summarize the main phases of the French Revolution? I need a timeline I can study from before Friday's exam.",
        createdAt: Date.now() - 1000 * 60 * 60 * 26,
        status: "complete",
      },
      {
        id: "m-r2",
        role: "assistant",
        content: revolutionAnswer,
        createdAt: Date.now() - 1000 * 60 * 60 * 26 + 30000,
        status: "complete",
        modelLabel: "Lumen 2",
        format: "timeline",
        followUps: ["Draw this as a timeline image", "Quiz me on these dates", "Which phase matters most for essays?"],
        thinkingOpen: false,
        thinkingMs: 6100,
        thinking: [
          { label: "Reading the question", status: "done" },
          { label: "Choosing a response structure", detail: "Timeline", status: "done" },
          { label: "Ordering events chronologically", detail: "8 entries", status: "done" },
          { label: "Composing response", status: "done" },
        ],
      },
    ],
  },
  {
    id: "chat-essay",
    title: "Midterm essay feedback",
    course: "HIST 204 · Modern Europe",
    courseShort: "HIST 204",
    modelId: "lumen-2",
    messages: [
      {
        id: "m-e1",
        role: "user",
        content:
          "Here is my opening paragraph: \"The French Revolution was a very important event in history that changed many things for many people.\" — can you give me feedback before I keep going?",
        createdAt: Date.now() - 1000 * 60 * 60 * 50,
        status: "complete",
      },
      {
        id: "m-e2",
        role: "assistant",
        content: essayErrorText,
        createdAt: Date.now() - 1000 * 60 * 60 * 50 + 12000,
        status: "error",
        modelLabel: "Lumen 2",
      },
    ],
  },
  {
    id: "chat-chain",
    title: "Chain rule practice",
    course: "MATH 121 · Calculus I",
    courseShort: "MATH 121",
    modelId: "lumen-1-mini",
    messages: [
      {
        id: "m-c1",
        role: "user",
        content: "Give me three chain rule practice problems with increasing difficulty, but no solutions yet.",
        createdAt: Date.now() - 1000 * 60 * 60 * 74,
        status: "complete",
      },
      {
        id: "m-c2",
        role: "assistant",
        content: chainRuleProblems,
        createdAt: Date.now() - 1000 * 60 * 60 * 74 + 24000,
        status: "complete",
        modelLabel: "Lumen 1 Mini",
        format: "steps",
        followUps: ["Show me the answer key", "Draw the chain rule as a diagram", "Quiz me on this"],
        thinkingOpen: false,
        thinkingMs: 4200,
        thinking: [
          { label: "Reading the request", status: "done" },
          { label: "Choosing a response structure", detail: "Step-by-step", status: "done" },
          { label: "Drafting problems at three difficulties", status: "done" },
          { label: "Composing response", status: "done" },
        ],
      },
    ],
  },
];

/* ── stress-lab conversation (built once, strings shared) ────
   Exercised by the pagination/virtualization architecture:
   1,000 messages without holding large unique payloads. */

const STRESS_BODIES = [
  `Here's the compact version of the idea.\n\n- The chain rule handles composites: outside-in, multiplying each link.\n- Count layers before differentiating — one factor per layer.\n\n> **Watch out:** the skipped middle layer is the classic lost mark.`,
  `Let's walk it step by step.\n\n1. **Identify the layers** — for \`e^(cos(x^2))\` that's exponential → cosine → square.\n2. **Differentiate the outer layer**, leaving the inside untouched.\n3. **Multiply the next link**, then the next, to the core.\n\n\`\`\`text\nh'(x) = e^(cos(x^2)) · (-sin(x^2)) · 2x\n\`\`\`\n\nEach line differentiates exactly one layer.`,
  `Quick comparison:\n\n| Rule | Use it when | Example |\n| --- | --- | --- |\n| Chain | A function is **inside** another | \`sin(x^2)\` |\n| Product | Two functions are **multiplied** | \`x^2 · sin x\` |\n| Quotient | Two functions are **divided** | \`sin x / x^2\` |\n\nAsk: is the second function *inside the parentheses* of the first?`,
  `The intuitive version: a composite is nested gift boxes — open the outermost first, take one piece from each box, multiply the pieces, done.`,
];

const STRESS_PROMPTS = [
  "Can you recap the key move here?",
  "Why do we multiply the layers instead of adding them?",
  "Show me that again with a fresh example.",
  "Walk me through the steps once more.",
  "What mistake do students usually make at this step?",
];

function buildStressChat(): Chat {
  const base = Date.now() - 1000 * 60 * 60 * 24 * 30;
  const formats: ResponseFormat[] = ["concise", "steps", "comparison", "concise", "steps"];
  const messages: Message[] = [];
  for (let i = 0; i < 1000; i++) {
    const user = i % 2 === 0;
    if (user) {
      messages.push({
        id: `st-${i}`,
        role: "user",
        content: `${STRESS_PROMPTS[(i / 2) % STRESS_PROMPTS.length | 0]} (#${(i / 2 | 0) + 1})`,
        createdAt: base + i * 47_000,
        status: "complete",
      });
    } else {
      const n = (i - 1) / 2 + 1;
      messages.push({
        id: `st-${i}`,
        role: "assistant",
        content: `${STRESS_BODIES[(n - 1) % STRESS_BODIES.length]}\n\n*Study-log entry ${n}.*`,
        createdAt: base + i * 47_000,
        status: "complete",
        modelLabel: "Lumen 2",
        format: formats[(n - 1) % formats.length],
        ...(n % 5 === 0
          ? {
              thinkingOpen: false,
              thinkingMs: 4800,
              thinking: [
                { label: "Reading your message", status: "done" as const },
                { label: "Choosing a response structure", detail: FORMAT_SUFFIX(n), status: "done" as const },
                { label: "Composing response", status: "done" as const },
              ],
            }
          : {}),
      });
    }
  }
  return {
    id: "chat-perf",
    title: "Performance lab · 1,000 messages",
    course: "MATH 121 · Calculus I",
    courseShort: "MATH 121",
    modelId: "lumen-2",
    messages,
  };
}

function FORMAT_SUFFIX(n: number): string {
  return ["Quick answer", "Step-by-step", "Comparison", "Quick answer", "Step-by-step"][(n % 5 + 4) % 5];
}

// Production chat starts empty — the ZIP stress seed is a prototype lab
// conversation and must not ship into the Course Player. Keep the builder
// exported so the ZIP implementation stays intact for later inspection.
export const ZIP_STRESS_CHAT_BUILDER = buildStressChat;
