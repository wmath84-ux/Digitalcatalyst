import type { ConceptState, MistakeRecord, StudentModel, StyleChannel } from "./types";
import { CONCEPTS, topicConcepts } from "./knowledge";

/* ─────────────────────────────────────────────────────────────
   STUDENT LEARNING MEMORY
   Explicitly NOT a transcript dump: structured, confidence-gated
   estimates that only shift when evidence appears. Nothing is
   promoted to long-term memory from a single message.
   ───────────────────────────────────────────────────────────── */

const LS_KEY = "lumen.student.v2";

export function createStudentModel(): StudentModel {
  return {
    version: 2,
    concepts: {},
    prefs: {
      depthLean: 0,
      style: { examples: 0, intuition: 0, formulas: 0, steps: 0, visual: 0 },
      examPressure: 0,
    },
    updatedAt: Date.now(),
  };
}

export function loadStudentModel(): StudentModel {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return createStudentModel();
    const parsed = JSON.parse(raw) as StudentModel;
    if (parsed?.version !== 2 || typeof parsed.concepts !== "object") return createStudentModel();
    return parsed;
  } catch {
    return createStudentModel();
  }
}

export function saveStudentModel(m: StudentModel): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable — memory stays session-scoped */
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ensureConcept(model: StudentModel, id: string): ConceptState {
  if (!model.concepts[id]) {
    model.concepts[id] = {
      id,
      label: CONCEPTS[id]?.label ?? id,
      ability: 0,
      confidence: 0,
      exposures: 0,
      correct: 0,
      wrong: 0,
      streak: 0,
      mistakes: [],
      lastSeen: Date.now(),
      turnsSinceSeen: 0,
    };
  }
  return model.concepts[id];
}

/** Soft contact: studying a topic raises confidence a bit, ability barely. */
export function noteExposure(model: StudentModel, topicId: string): void {
  for (const def of topicConcepts(topicId)) {
    const c = ensureConcept(model, def.id);
    c.exposures += 1;
    c.confidence = clamp(c.confidence + 0.06, 0, 1);
    c.turnsSinceSeen = 0;
    c.lastSeen = Date.now();
  }
}

/** Every new topic conversation ages the spacing counters of the others. */
export function ageOtherTopics(model: StudentModel, currentTopicId: string): void {
  for (const def of Object.values(CONCEPTS)) {
    if (def.topicId !== currentTopicId && model.concepts[def.id]) {
      model.concepts[def.id].turnsSinceSeen += 1;
    }
  }
}

/**
 * Evaluation update — the core feedback-loop write.
 * Adaptive EMA: learning rate grows with evidence, so early answers move
 * estimates meaningful amounts but one surprise never overturns them.
 */
export function recordResult(model: StudentModel, conceptId: string, correct: boolean, mistake?: { kind: MistakeRecord["kind"]; note: string }): void {
  const c = ensureConcept(model, conceptId);
  const target = correct ? 1 : -0.5;
  const lr = clamp(0.16 + c.confidence * 0.3, 0.16, 0.42);
  c.ability = clamp(c.ability + lr * (target - c.ability), -1, 0.95);
  c.confidence = clamp(c.confidence + 0.14, 0, 1);
  c.exposures += 1;
  if (correct) {
    c.correct += 1;
    c.streak = Math.max(1, c.streak + 1);
  } else {
    c.wrong += 1;
    c.streak = Math.min(-1, c.streak - 1);
  }
  c.lastResult = correct ? "correct" : "wrong";
  c.lastSeen = Date.now();
  c.turnsSinceSeen = 0;
  if (!correct && mistake) {
    c.mistakes = [{ concept: conceptId, kind: mistake.kind, note: mistake.note, at: Date.now(), sinceReinforced: 0 }, ...c.mistakes].slice(0, 6);
  }
  model.updatedAt = Date.now();
}

export function recordConfusion(model: StudentModel, topicId: string): void {
  for (const def of topicConcepts(topicId).slice(0, 2)) {
    const c = ensureConcept(model, def.id);
    // Confusion is weak evidence of difficulty — nudge, don't convict.
    c.ability = clamp(c.ability - 0.06, -1, 0.95);
    c.confidence = clamp(c.confidence + 0.04, 0, 1);
  }
}

export function noteStyleSignal(model: StudentModel, channel: StyleChannel): void {
  model.prefs.style[channel] = clamp(model.prefs.style[channel] + 0.2, -1, 1);
}

export function noteDepthSignal(model: StudentModel, simpler: boolean): void {
  const d = model.prefs.depthLean;
  model.prefs.depthLean = clamp(d + (simpler ? -0.18 : 0.12) * (1 - Math.abs(d)), -1, 1);
}

export function noteExamPressure(model: StudentModel): void {
  model.prefs.examPressure = 0.8;
  model.prefs.examMentionAt = Date.now();
}

export function decayPressure(model: StudentModel): number {
  const m = model.prefs.examMentionAt;
  if (!m) return 0;
  const days = (Date.now() - m) / 86_400_000;
  model.prefs.examPressure = clamp(0.8 - days * 0.2, 0, 1);
  return model.prefs.examPressure;
}

/* ── estimation queries ───────────────────────────────────── */

export function topicAbility(model: StudentModel, topicId: string): { ability: number; confidence: number } {
  const defs = topicConcepts(topicId);
  const states = defs.map((d) => model.concepts[d.id]).filter((s): s is ConceptState => !!s && s.confidence > 0.05);
  if (!states.length) return { ability: 0, confidence: 0 };
  const w = states.reduce((s, c) => s + c.confidence, 0);
  const ability = states.reduce((s, c) => s + c.ability * c.confidence, 0) / Math.max(0.001, w);
  const confidence = Math.min(1, w / defs.length);
  return { ability, confidence };
}

export type TutorLevel = "intuitive" | "beginner" | "standard" | "exam" | "advanced";

export function levelFor(model: StudentModel, topicId: string, confusion: number, examMode: boolean): { level: TutorLevel; detail: string } {
  const { ability, confidence } = topicAbility(model, topicId);
  const lean = model.prefs.depthLean;
  if (confusion >= 2 || (ability < -0.3 && confidence > 0.25)) return { level: "intuitive", detail: "slowing down and switching approach" };
  if (ability < -0.05 && confidence > 0.2) return { level: "beginner", detail: "foundations first" };
  if (examMode) return { level: "exam", detail: "exam-focused framing" };
  if (ability > 0.55 && confidence > 0.4) return { level: "advanced", detail: "stretching deeper" };
  if (lean < -0.45) return { level: "beginner", detail: "keeping it compact" };
  return { level: "standard", detail: "your usual depth" };
}

export function difficultyFor(model: StudentModel, topicId: string): 1 | 2 | 3 {
  const { ability, confidence } = topicAbility(model, topicId);
  if (confidence < 0.25) return 2; // unknown student → start mid
  if (ability < -0.15) return 1;
  if (ability > 0.45) return 3;
  return 2;
}

export interface WeakSpot {
  id: string;
  label: string;
  ability: number;
  lastKind?: MistakeRecord["kind"];
}

export function weakConcepts(model: StudentModel, topicId?: string): WeakSpot[] {
  return Object.values(model.concepts)
    .filter((c) => c.confidence > 0.22 && c.ability < -0.12 && (topicId ? c.id === topicId || CONCEPTS[c.id]?.topicId === topicId : true))
    .filter((c) => (topicId ? CONCEPTS[c.id]?.topicId === topicId : true))
    .sort((a, b) => a.ability - b.ability)
    .map((c) => ({ id: c.id, label: c.label, ability: c.ability, lastKind: c.mistakes[0]?.kind }));
}

/** Concepts due for a spaced re-check: struggled before, quiet for a while. */
export function dueForRevision(model: StudentModel): ConceptState[] {
  return Object.values(model.concepts)
    .filter((c) => c.confidence > 0.3 && c.ability < 0.1 && c.turnsSinceSeen >= 4 && c.wrong > 0)
    .sort((a, b) => b.turnsSinceSeen - a.turnsSinceSeen);
}
