import type { Chat, InteractiveQuiz, MistakeKind } from "../lib/types";
import {
  FORMAT_LABEL, TOPIC_BY_ID, compose, detectFormat, detectTopic, fmtDeepDive, fmtConcise, followUpsFor, pickResponse,
  type GenerationSpec,
} from "../lib/engine";
import {
  MISTAKE_PHRASE, PRIMERS, QUESTION_BANKS, RECALL_QS, SIMPLE_VARIANTS, SOLVE_SCRIPTS, EXAM_ANGLES,
  conceptLabel, topicConcepts,
} from "./knowledge";
import {
  clearPendingClarify, getMemory, ingest, noteCorrection, resolveReference, setPendingClarify,
} from "./memory";
import {
  ageOtherTopics, decayPressure, difficultyFor, dueForRevision, levelFor, noteExamPressure,
  noteExposure, noteStyleSignal, recordConfusion, recordResult, topicAbility, weakConcepts,
} from "./studentModel";
import { detectIntent } from "./intent";
import { isAmbiguous, readAttachments, describeForSpeech, type ImageRead } from "./vision";
import { ground } from "./courseGrounding";
import { getActiveContext } from "../course/bridge";
import type { CourseCtx, GradingOutput, SessionState, StudentModel, TutorInput, TutorOutput } from "./types";

/* ─────────────────────────────────────────────────────────────
   TUTOR ORCHESTRATOR
   One pipeline per turn:

   input → intent → conversation memory → student memory →
   course context → vision → state/difficulty → strategy →
   generation → verification → learning-state update → memory
   ───────────────────────────────────────────────────────────── */

const sessions = new Map<string, SessionState>();

export function getSession(chatId: string): SessionState {
  let s = sessions.get(chatId);
  if (!s) {
    s = { chatId, turn: 0, confusion: 0 };
    sessions.set(chatId, s);
  }
  return s;
}

/** Fresh session when a chat is deliberately reset/new. */
export function resetSession(chatId: string): void {
  sessions.set(chatId, { chatId, turn: 0, confusion: 0 });
}

const cloneModel = (m: StudentModel): StudentModel => JSON.parse(JSON.stringify(m)) as StudentModel;

interface Step {
  label: string;
  detail?: string;
}

const capSteps = (steps: Step[]): Step[] => (steps.length <= 7 ? steps : [...steps.slice(0, 2), ...steps.slice(-4)]);

function matchTerms(text: string, expected: string[]): number {
  const t = text.toLowerCase();
  return expected.filter((e) => t.includes(e.toLowerCase())).length;
}

/* ── course context (what the product surface knows) ──────── */

const COURSE_MAP: Record<string, Omit<CourseCtx, "inPlayer">> = {
  "CS 101": { course: "CS 101 · Algorithms", short: "CS 101", lesson: "Lesson 4.2 · Binary search", chapter: "Pointer walkthrough — lo, mid, hi", position: "paused at 12:41 of 31:05", topicId: "binary" },
  "BIO 110": { course: "BIO 110 · Cell Biology", short: "BIO 110", lesson: "Chapter 4 · Photosynthesis", chapter: "Light reactions and the Calvin cycle", position: "reading section 4.3", topicId: "photo" },
  "MATH 121": { course: "MATH 121 · Calculus I", short: "MATH 121", lesson: "Unit 3 · Differentiation rules", chapter: "The chain rule", position: "practice set 3.4", topicId: "chain" },
  "HIST 204": { course: "HIST 204 · Modern Europe", short: "HIST 204", lesson: "Week 8 · The French Revolution", chapter: "From monarchy to republic", position: "essay draft due Friday", topicId: "revo" },
};

export function buildCourseContext(chat: Chat, inPlayer: boolean): CourseCtx {
  const base = COURSE_MAP[chat.courseShort];
  if (base) return { ...base, inPlayer };
  return { course: chat.course, short: chat.courseShort, lesson: chat.course, chapter: chat.title, position: "", topicId: "generic", inPlayer };
}

/* ── verification (real checks, fault-tolerant) ───────────── */

function verifyQuiz(qs: InteractiveQuiz): string[] {
  const checks: string[] = [];
  let ok = true;
  for (const q of qs.questions) {
    if (new Set(q.options).size !== q.options.length) ok = false;
    if (q.correct < 0 || q.correct >= q.options.length) ok = false;
    if (q.optionNotes && (q.optionNotes.length !== q.options.length || q.optionNotes[q.correct] !== null)) ok = false;
    checks.push(q.q.slice(0, 18));
  }
  // spot-check the famous calculation instead of trusting the text
  const probes = Math.ceil(Math.log2(1_000_000));
  const logQ = qs.questions.find((q) => /1,000,000/.test(q.q));
  if (logQ && !logQ.options[logQ.correct].includes(String(probes))) ok = false;
  return ok ? [`answer key · ${qs.questions.length} questions unique`] : [];
}

/* ── adaptive quiz construction ────────────────────────────── */

function buildAdaptiveQuiz(topicId: string, label: string, model: StudentModel, chatId: string): { quiz: InteractiveQuiz; notes: string[] } {
  const memory = getMemory(chatId);
  const bank = QUESTION_BANKS[topicId] ?? QUESTION_BANKS.photo;
  const start = difficultyFor(model, topicId);
  const weak = weakConcepts(model, topicId);
  const notes: string[] = [];
  const fresh = bank.filter((q) => !memory.servedQuestions.includes(q.q));
  const pool = fresh.length >= 4 ? fresh : bank;

  // retest one weak concept if we can
  let retest = null as (typeof bank)[number] | null;
  if (weak.length) {
    retest = bank.find((q) => q.concept === weak[0].id && memory.servedQuestions.includes(q.q)) ?? null;
    if (retest) notes.push(`re-testing ${weak[0].label}`);
  }

  const sorted = [...pool].sort((a, b) => a.difficulty - b.difficulty).filter((q) => q !== retest);
  const chosen = retest ? [retest, ...sorted] : sorted;
  const ramp = [...chosen].sort((a, b) => {
    // pull questions nearest the student's level first, then ramp
    const da = a === retest ? -1 : Math.abs(a.difficulty - start);
    const db = b === retest ? -1 : Math.abs(b.difficulty - start);
    return da - db || a.difficulty - b.difficulty;
  }).slice(0, 4);
  ramp.sort((a, b) => a.difficulty - b.difficulty);

  return {
    quiz: {
      topic: label,
      questions: ramp,
      answers: ramp.map(() => null),
      submitted: false,
      level: start,
    },
    notes,
  };
}

/* ── the pipeline ──────────────────────────────────────────── */

export function runTutor({ text, attachments, chat, model, course }: TutorInput): TutorOutput {
  const m = cloneModel(model);
  const session = getSession(chat.id);
  const memory = ingest(chat);
  session.turn += 1;
  decayPressure(m);
  const steps: Step[] = [];
  const push = (label: string, detail?: string) => steps.push({ label, detail });

  /* 1 ▸ intent */
  const intent = detectIntent(text, attachments, session, memory);
  push("Reading your message", intent.signals[0] !== "direct question" ? intent.signals[0] : undefined);

  /* 2 ▸ conversation memory + reference resolution */
  const ref = resolveReference(text, memory);
  if (ref) push("Placing that in context", `“${ref.word}” → ${ref.topicLabel}`);
  if (memory.gistTurns > 10) push("Carrying earlier context forward", `compact summary of ${memory.gistTurns} turns`);

  let topicId = ref && ref.topicId !== "generic" ? ref.topicId : detectTopic(text || ref?.sourceExcerpt || "", chat.courseShort).id;
  if (topicId === "generic" && session.topicId) topicId = session.topicId;
  if (topicId === "generic" && course.topicId !== "generic") topicId = course.topicId;
  session.topicId = topicId;
  if (topicId !== "generic") ageOtherTopics(m, topicId);

  const topicObj = TOPIC_BY_ID[topicId] ?? TOPIC_BY_ID.generic;
  const topicName = topicId === "generic" ? "this topic" : topicObj.name;

  /* 3 ▸ student memory */
  const ability = topicAbility(m, topicId);
  const weak = weakConcepts(m, topicId);
  if (weak.length && ability.confidence > 0.2) push("Checking your progress so far", `${weak[0].label} has been the sticky part`);

  /* 4 ▸ ACTIVE LEARNING CONTEXT — what the student is looking at now.
        Highest-priority source after the message and any attachment. */
  const alc = course.inPlayer ? getActiveContext() : null;
  let grounding: ReturnType<typeof ground> | null = null;
  if (alc) {
    push("Reading the course panel", `${alc.resource.resourceName}`);
    grounding = ground(text, attachments, alc);
    grounding.steps.forEach((s) => push(s.label, s.detail));
  } else {
    push("Checking course context", course.short);
  }



  /* 5 ▸ vision */
  let reads: ImageRead[] = [];
  if (attachments.length) {
    reads = readAttachments(attachments, course);
    push(reads[0].kind === "lesson-capture" ? "Reading the capture" : "Analyzing the image", reads[0].signal);

    // Honesty gate — never invent image content.
    if (isAmbiguous(reads) && !text.trim()) {
      setPendingClarify(chat.id, "image", "What does this image show?", "image-purpose");
      const spec: GenerationSpec = {
        format: "concise",
        steps: capSteps([...steps, { label: "Not enough signal to read this reliably" }, { label: "Asking instead of guessing" }]),
        text: "I can see you've shared an image, but I can't make out enough detail to describe it reliably — I'd rather ask than guess.\n\nWhat does it show? A quick word is enough, or a sharper capture of the same area works great.",
        followUps: ["It's a question from my textbook", "It's my attempted solution", "It's a lesson slide", "It's a diagram I need explained"],
      };
      return { spec, model: m };
    }
  }

  /* 6 ▸ state, emotions-as-evidence, difficulty */
  if (intent.intent === "confusion") session.confusion = Math.min(3, session.confusion + 1);
  else if (intent.intent === "thanks") session.confusion = Math.max(0, session.confusion - 1);
  if (intent.intent === "confusion") recordConfusion(m, topicId);
  const examMode = intent.intent === "exam" || m.prefs.examPressure > 0.35;
  if (intent.intent === "exam") noteExamPressure(m);
  const { level, detail } = levelFor(m, topicId, session.confusion, examMode);
  push("Sizing this to you", detail);

  const finish = (spec: Omit<GenerationSpec, "steps">): TutorOutput => {
    if (topicId !== "generic") noteExposure(m, topicId);
    spec.format ??= "concise";
    return { spec: { ...spec, steps: capSteps(steps) }, model: m };
  };

  /* ── CURRENT CONTENT OVERRIDE ──────────────────────────────
     When the question is about what's on screen, the lesson's own
     material outranks generic knowledge — and an unreadable source
     is declared rather than imagined. */
  if (grounding && alc && (grounding.block || grounding.blocked)) {
    const g = grounding;
    const scoped = g.route.scope === "current-position" || g.route.scope === "current-resource" || g.route.scope === "course-wide";
    if (scoped) {
      const note = alc.notes[0];
      const noteLine = note ? `\n\n**Your note on this:** “${note.text}”` : "";
      if (g.blocked) {
        return finish({
          text: g.block.replace(/^\n\n---\n\n/, "") + noteLine,
          format: "concise",
          followUps: ["Let me screenshot it", "Explain the concept generally", "Quiz me on this lesson"],
        });
      }
      const closing =
        g.route.scope === "current-position"
          ? `\n\nWant me to unpack that, or carry on from ${g.positionLabel}?`
          : `\n\nWant me to go deeper on any part of that?`;
      return finish({
        text: `${g.block}${noteLine}${closing}`,
        format: "steps",
        followUps: ["Explain that in simpler terms", "Quiz me on this section", "Draw it as a diagram"],
      });
    }
  }

  /* ── clarification replies (we asked something earlier) ── */
  if (intent.intent === "clarify-reply") {
    const pending = getMemory(chat.id).pendingClarify;
    clearPendingClarify(chat.id);
    const t = text.toLowerCase();
    const kind = pending?.about === "image"
      ? (/attempt|solution|my work/.test(t) ? "solution-attempt" : /question|problem|exercise/.test(t) ? "question" : /slide|lesson|video|course/.test(t) ? "lesson-capture" : /diagram|figure|graph/.test(t) ? "diagram" : "notes")
      : "notes";
    const angle =
      kind === "solution-attempt"
        ? `Got it — your own work. Walk me through where you stopped being sure, and tell me the final line you reached; I'll check each step against it rather than just handing you the answer.`
        : kind === "question"
          ? `Got it — a set question, on **${topicName}** by the look of it. Here's how to approach it.\n\n${compose("steps", topicObj)}\n\nIf you share the exact wording, I'll solve *your* numbers specifically.`
          : kind === "lesson-capture"
            ? `That's from **${course.lesson}** (${course.chapter}), covering ${topicName}.\n\n${compose("concise", topicObj)}`
            : `Here's the concept behind it — ${topicName}.\n\n${compose("concise", topicObj)}`;
    return finish({ text: angle, format: "steps", followUps: ["Explain this step by step", "Quiz me on this", "Draw it as a diagram"] });
  }

  /* ── recall evaluation (retrieval practice loop) ────────── */
  if (intent.intent === "recall-answer" && session.recall) {
    const rc = session.recall;
    session.recall = undefined;
    const hits = matchTerms(text, rc.expected);
    const good = hits >= rc.expected.length;
    const anchor = topicConcepts(topicId)[0]?.id ?? topicId;
    recordResult(m, anchor, good, good ? undefined : { kind: "recall", note: `recall check on ${topicName}` });
    push("Evaluating your recall", good ? "retrieved cleanly" : "partially retrieved");
    const textOut = good
      ? `Retrieved cleanly — **${rc.answer}**. That's exactly what sticks.\n\nQuick retrieval like this is what makes the longer problems feel easy later.`
      : hits > 0
        ? `Partially there — the canonical version is **${rc.answer}**. Close enough that one re-read will cement it; say it back once more without looking.`
        : `No stress — that's the point of a recall check. The answer is **${rc.answer}**.\n\nTry saying it back once, from memory. Retrieval after a miss is where the memory actually forms.`;
    return finish({
      text: textOut,
      format: "feedback",
      followUps: good ? ["Quiz me on this", "Give me a harder set"] : ["Ask me again in a bit", "Show the full explanation", "Quiz me on this"],
    });
  }

  /* ── multi-turn guided problem solving ──────────────────── */
  if (intent.intent === "continue-problem" && session.problem) {
    const script = SOLVE_SCRIPTS[session.problem.topicId];
    if (script) {
      const beat = script.beats[session.problem.step];
      const hits = beat.expected ? matchTerms(text, beat.expected) : 0;
      const good = hits > 0 || text.trim().length > 30;
      push("Reading your attempt", good ? "reasoning holds" : "needs a nudge");
      const last = session.problem.step >= script.beats.length - 1;
      if (last) session.problem = undefined;
      else session.problem = { ...session.problem, step: session.problem.step + 1, awaiting: script.beats[session.problem.step + 1].ask };
      const next = last ? null : script.beats[session.problem?.step ?? 0];
      const textOut = last
        ? `${good ? beat.confirm : beat.nudge}\n\n**And that completes it.** You just derived the whole thing — same structure any expert uses. Here's the full picture in one place:\n\n${compose("steps", topicObj)}`
        : `${good ? beat.confirm : beat.nudge}\n\n${next!.say}\n\n**Your move:** ${next!.ask}`;
      return finish({
        text: textOut,
        format: "steps",
        followUps: last ? ["Quiz me on this", "Give me another one", "Why does step 2 work?"] : [],
      });
    }
    session.problem = undefined;
  }

  /* ── greetings & acknowledgements ───────────────────────── */
  if (intent.intent === "greeting") {
    return finish({
      text: `Hey — good to see you. We're in **${course.lesson}** territory${course.inPlayer ? ` (${course.chapter})` : ""}, so I can explain what's on screen, drill you, or check your work.\n\nWhat are we working on?`,
      format: "concise",
      followUps: [`Explain ${topicObj.short} briefly`, "Quiz me on this lesson", "Draw the key diagram"],
    });
  }
  if (intent.intent === "thanks") {
    const revision = dueForRevision(m)[0];
    return finish({
      text: revision
        ? `Anytime. One thing worth a thirty-second re-test while it's warm: **${revision.label}** — it was the shakiest part last time.\n\nWant a single question on it?`
        : `Anytime. If you want to lock it in, a two-minute quiz right now beats re-reading later — your call.`,
      format: "concise",
      followUps: revision ? [`Quick question on ${revision.label}`, "Quiz me instead"] : ["Quiz me on this", "Draw it as a diagram", "Something harder"],
    });
  }

  /* ── practice — adaptive, performance-aware ─────────────── */
  if (intent.intent === "practice") {
    const label = topicId === "generic" ? (chat.courseShort === "BIO 110" ? "Chapter 4: Photosynthesis" : topicName) : topicName;
    const { quiz, notes } = buildAdaptiveQuiz(topicId, label, m, chat.id);
    push("Calibrating difficulty", `starting at level ${quiz.level}${notes.length ? ` · ${notes.join(", ")}` : ""}`);
    const checks = verifyQuiz(quiz);
    push("Verifying the answer key", checks[0] ?? "recovered: rebuilding safest set");
    const intro = ability.confidence > 0.25
      ? ability.ability > 0.4
        ? `You're solid here, so this set climbs faster.`
        : ability.ability < -0.1
          ? `This set starts gently and rebuilds the exact spot that's been slipping.`
          : `This set is calibrated to where you are and ramps as you go.`
      : `Here's a set to find your level — it adapts from your answers.`;
    const specQuiz: GenerationSpec = {
      format: "practice",
      steps: capSteps(steps),
      text: `${intro}\n\n**${quiz.questions.length} questions** on ${label}. Answer with a tap, hit **Check my answers**, and I'll grade every one with the *why*, not just the mark.`,
      quiz,
      followUps: [],
    };
    return { spec: specQuiz, model: m };
  }

  /* ── explicit answers / bail-outs ───────────────────────── */
  if (intent.intent === "answer-please") {
    session.problem = undefined;
    push("Going straight to the answer", "guidance declined");
    return finish({
      text: compose("concise", topicObj) + (topicId !== "generic" ? `\n\n**Bottom line:** ${topicObj.oneLiner.split("—")[0].trim()}.` : ""),
      format: "concise",
      followUps: ["Show the full steps", "Quiz me on this"],
    });
  }

  /* ── guided (Socratic) problem solving ──────────────────── */
  if (intent.intent === "solve" && SOLVE_SCRIPTS[topicId] && level !== "intuitive") {
    const script = SOLVE_SCRIPTS[topicId];
    session.problem = { topicId, step: 0, total: script.beats.length, awaiting: script.beats[0].ask };
    push("Choosing to guide, not give", "better for retention");
    return finish({
      text: `${script.intro}\n\n${script.beats[0].say}\n\n**Your move:** ${script.beats[0].ask}`,
      format: "steps",
      followUps: [],
    });
  }

  /* ── re-explain / confusion — change strategy, don't repeat ─ */
  if (intent.intent === "reexplain" || intent.intent === "confusion") {
    push("Switching explanation strategy", session.confusion >= 2 ? "smaller steps, new analogy" : "different angle");
    const simple = SIMPLE_VARIANTS[topicId] ?? SIMPLE_VARIANTS.binary;
    const bridge = intent.intent === "reexplain" ? "Let's take a different angle on it." : "Good — saying so is the move. New angle, smaller steps:";
    return finish({
      text: `${bridge}\n\n${simple}\n\n---\n\nWhere did *that* version land — better, or still foggy at a specific spot?`,
      format: "concise",
      followUps: ["Draw it as a diagram", "One tiny worked example", "Quiz me gently"],
    });
  }

  /* ── image generation intent ────────────────────────────── */
  if (intent.intent === "visual") {
    noteStyleSignal(m, "visual");
    push("Choosing a response structure", FORMAT_LABEL.visual);
    push("Rendering the illustration", "1536 × 1024");
    return finish({
      format: "visual",
      text: `I've drawn ${topicObj.short} as a diagram — it renders below.\n\n${topicObj.oneLiner}\n\n**What to look for**\n\n${topicObj.keyPoints.slice(0, 3).map((k) => `- ${k}`).join("\n")}`,
      followUps: ["Explain this diagram step by step", "Quiz me on this", "Give me the short version"],
      image: {
        prompt: text.trim() || topicObj.image.prompt,
        src: topicObj.image.src,
        alt: topicObj.image.alt,
        caption: topicObj.image.caption,
        aspect: topicObj.image.aspect,
      },
    });
  }

  /* ── essays & drafts ────────────────────────────────────── */
  if (intent.intent === "feedback") {
    const delegated = pickResponse(text, attachments, course.short);
    delegated.steps = capSteps([...steps, ...delegated.steps.slice(-3)]);
    return { spec: delegated, model: m };
  }

  /* ── exam preparation mode ──────────────────────────────── */
  if (intent.intent === "exam") {
    push("Switching to exam mode", "traps, mark-scoring, recall first");
    return finish({
      text: `Exam mode it is — here's what actually gets marked on **${topicName}**.\n\n### Highest-value points\n\n${topicObj.keyPoints.map((k) => `- ${k}`).join("\n")}\n\n${EXAM_ANGLES[topicId] ?? ""}\n\n> **Classic slip:** ${topicObj.pitfall}\n\nWant me to drill exactly these patterns?`,
      format: "deep-dive",
      followUps: ["Practice exam-style questions", "Quiz me", "Quick recall check"],
    });
  }

  /* ── image analysis — screenshots are the universal bridge ── */
  if (intent.intent === "image-analysis" && attachments.length) {
    const looksAttempt = reads[0].kind === "solution-attempt";
    // A screenshot taken while a resource is open is interpreted as
    // "from THIS resource, at THIS position" — never a loose image.
    if (alc && grounding) {
      const where = `**${alc.resource.resourceName}**, ${grounding.positionLabel}`;
      const lessonLine = grounding.block && !grounding.blocked ? `\n\n${grounding.block}` : "";
      const limitLine =
        grounding.blocked && grounding.route.needsContent
          ? `\n\n*(I can't read this resource's content directly, so I'm working from your capture — which is exactly the right move here.)*`
          : "";
      return finish({
        text: `Reading that capture as part of ${where}.${lessonLine}${limitLine}\n\n${
          looksAttempt
            ? "Tell me which step stopped feeling certain and I'll check your reasoning up to that line rather than just handing over the answer."
            : "Ask your question about it and I'll answer against this exact part of the lesson."
        }`,
        format: "steps",
        followUps: ["Explain what's in the capture", "Is this the important part?", "Quiz me on this bit"],
      });
    }
    return finish({
      text: looksAttempt
        ? `I've looked at ${describeForSpeech(reads)} — this is ${topicName} territory.\n\nI can check it line by line, but you'll learn more if you point first: **which step started feeling shaky?** Tell me the step number (or your final line) and I'll verify up to it, then hand the pen back.\n\nKey facts I'd keep in view while checking:\n\n${topicObj.keyPoints.slice(0, 3).map((k) => `- ${k}`).join("\n")}`
        : `I've looked at ${describeForSpeech(reads)} — it maps onto **${topicName}** from ${course.lesson}.\n\n${topicObj.oneLiner}\n\n**The essentials in view**\n\n${topicObj.keyPoints.slice(0, 3).map((k) => `- ${k}`).join("\n")}`,
      format: "steps",
      followUps: looksAttempt ? ["Check my whole solution", "It's wrong somewhere — find it", "Quiz me on this"] : [`Explain ${topicObj.short} step by step`, "Quiz me on this", "Draw it as a diagram"],
    });
  }

  /* ── default: teach — always level- and memory-adjusted ─── */
  const format = detectFormat(text, attachments.length > 0);
  let outText: string;
  const prereqWeak = topicConcepts(topicId)
    .flatMap((c) => c.prereqs ?? [])
    .find((p) => {
      const st = m.concepts[p];
      return st && st.confidence > 0.2 && st.ability < 0.05 && PRIMERS[p];
    });

  if (level === "intuitive") {
    outText = SIMPLE_VARIANTS[topicId] ?? fmtConcise(topicObj);
    push("Teaching the intuition first", "theory after");
  } else if (level === "beginner") {
    outText = fmtConcise(topicObj);
  } else {
    outText = format === "deep-dive" ? fmtDeepDive(topicObj) : compose(format, topicObj);
    if (examMode && EXAM_ANGLES[topicId]) outText += `\n\n${EXAM_ANGLES[topicId]}`;
  }
  if (prereqWeak && level !== "intuitive") {
    push("Patching a prerequisite first", PRIMERS[prereqWeak].title.replace("Quick foundation — ", "").toLowerCase());
    outText = `**${PRIMERS[prereqWeak].title}.** ${PRIMERS[prereqWeak].body}\n\nWith that in place —\n\n${outText}`;
  }

  // Active recall — a natural retrieval nudge on later passes, not every time.
  let recallTail = "";
  let recallFollow: string[] = [];
  const recallPool = RECALL_QS[topicId];
  if (recallPool && !session.recall && session.turn > 1 && (session.turn % 3 === 0 || ref)) {
    const rc = recallPool[session.turn % recallPool.length];
    session.recall = { topicId, expected: rc.expected, answer: rc.reveal, attempts: 0 };
    recallTail = `\n\n---\n\n**Quick recall check** — no scrolling back: *${rc.prompt}*\n\nType whatever you remember; even a rough version counts.`;
    recallFollow = ["I don't remember — reveal it"];
  }

  const followUps = recallFollow.length ? recallFollow : followUpsFor(format, topicObj);
  if (weak.length && ability.confidence > 0.3 && !recallFollow.length) {
    followUps[0] = `Strengthen ${weak[0].label}`;
  }
  return finish({ text: outText + recallTail, format, followUps });
}

/* ── grading: evaluation + mistake classification + updates ── */

export function gradeQuiz(quiz: InteractiveQuiz, chatId: string, model: StudentModel, course: CourseCtx): GradingOutput {
  const m = cloneModel(model);
  const steps: Step[] = [
    { label: "Reading your answers" },
    { label: "Checking against the answer key", detail: course.short },
    { label: "Classifying mistakes by type" },
    { label: "Updating your progress picture" },
    { label: "Composing feedback" },
  ];
  const total = quiz.questions.length;
  let score = 0;
  const wrongKinds: MistakeKind[] = [];
  const weakNow = new Map<string, number>();

  const sections = quiz.questions
    .map((q, i) => {
      const picked = quiz.answers[i];
      const ok = picked === q.correct;
      if (ok) score += 1;
      const diagnosis = picked != null && !ok ? q.optionNotes?.[picked] ?? null : null;
      if (!ok) {
        wrongKinds.push(diagnosis?.kind ?? "conceptual");
        weakNow.set(q.concept, (weakNow.get(q.concept) ?? 0) + 1);
        noteCorrection(chatId, q.concept);
      }
      recordResult(m, q.concept, ok, ok ? undefined : { kind: diagnosis?.kind ?? "conceptual", note: diagnosis?.note ?? q.q });
      const head = `### Q${i + 1} — ${ok ? "Correct" : "Not quite"}`;
      const L = ["A", "B", "C", "D", "E", "F"];
      const pickLine =
        picked == null
          ? `You left this blank — the answer is **${L[q.correct]}) ${q.options[q.correct]}**.`
          : ok
            ? `You chose **${L[picked]}) ${q.options[picked]}**. Exactly right.`
            : `You chose **${L[picked]}) ${q.options[picked]}** — the answer is **${L[q.correct]}) ${q.options[q.correct]}**.`;
      const why = diagnosis
        ? `\n\nThat looks like ${MISTAKE_PHRASE[diagnosis.kind].label}: ${diagnosis.note}`
        : "";
      return `${head}\n\n${pickLine}${why}\n\n${q.explain}`;
    })
    .join("\n\n");

  const ratio = score / total;
  const headline =
    ratio === 1
      ? `**${score} / ${total} — flawless.** Your reasoning held on every question.`
      : ratio >= 0.75
        ? `**${score} / ${total} — solid.** One gap to close:`
        : ratio >= 0.5
          ? `**${score} / ${total} — a decent start.** Here's what slipped:`
          : `**${score} / ${total} — good that we checked.** Rebuilding from here:`;

  // Pattern detection — name habits, kindly, only when there's evidence.
  const kindCounts = wrongKinds.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {});
  const dominant = Object.entries(kindCounts).sort((a, b) => b[1] - a[1])[0];
  const pattern =
    dominant && dominant[1] >= 2
      ? `\n\n---\n\n**One pattern, said kindly:** ${dominant[1]} of those were ${MISTAKE_PHRASE[dominant[0] as MistakeKind].label}s. ${MISTAKE_PHRASE[dominant[0] as MistakeKind].advice}`
      : "";

  const weakest = [...weakNow.entries()].sort((a, b) => b[1] - a[1])[0];
  const weakestLabel = weakest ? conceptLabel(weakest[0]) : null;
  const closer =
    ratio === 1
      ? `Want a **harder set**, or shall we move on?`
      : weakestLabel
        ? `The spotlight now goes to **${weakestLabel}** — want one targeted question on just that, or a fresh set that mixes it back in?`
        : `Want a fresh set?`;

  return {
    scoreSummary: `${score}/${total}`,
    model: m,
    spec: {
      format: "feedback",
      steps,
      text: `${headline}\n\n${sections}${pattern}\n\n---\n\n${closer}`,
      followUps:
        ratio === 1
          ? ["Give me a harder set", "Draw this as a diagram", "Move to the next topic"]
          : weakestLabel
            ? [`One more on ${weakestLabel}`, "Explain the wrong ones again slowly", "Fresh set please"]
            : ["Fresh set please", "Explain the wrong ones again slowly"],
    },
  };
}
