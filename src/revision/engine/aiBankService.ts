// Add AI-generated questions straight into the learner's local revision DB.
//
// Generated questions become first-class citizens of the revision bank:
// they are stored as normal question rows + revision items, so they appear in
// the Revision Bank, feed today's daily tests and can be revised in sessions.

import type { ParsedQuestion } from "./bulkParser";
import { loadDb, nextId, nowIso, saveDb, ServiceError, type Difficulty } from "./store";

export type AddAiQuestionsInput = {
  questions: ParsedQuestion[];
  /** Slug of an existing catalog subject (e.g. "physics"). */
  subjectSlug: string;
  /** Slug of an existing catalog topic (e.g. "thermodynamics"). */
  topicSlug: string;
  difficulty: Difficulty;
};

/** Insert AI questions into the user's bank and revision items. Returns the ids added. */
export function addAiQuestionsToBank(uid: string, input: AddAiQuestionsInput): number[] {
  if (input.questions.length === 0) {
    throw new ServiceError("NO_QUESTIONS", "No questions to add.");
  }
  const db = loadDb(uid);
  const topic = db.topics.find((t) => t.slug === input.topicSlug);
  if (!topic) {
    throw new ServiceError("NOT_FOUND", "Topic not found in your revision plan.");
  }
  const subject = db.subjects.find((s) => s.id === topic.subjectId);
  if (!subject) {
    throw new ServiceError("NOT_FOUND", "Subject not found in your revision plan.");
  }

  const ids: number[] = [];
  for (const q of input.questions) {
    const options = q.options.map((o) => String(o ?? "").trim()).filter((o) => o.length > 0);
    const prompt = String(q.prompt ?? "").trim();
    if (!prompt || options.length < 2) continue;
    const questionId = nextId(db, "questions");
    db.questions.push({
      id: questionId,
      topicId: topic.id,
      subjectId: subject.id,
      difficulty: input.difficulty,
      prompt: prompt.slice(0, 600),
      options: options.slice(0, 6),
      correctIndex: Math.max(0, Math.min(options.length - 1, q.correctIndex)),
      explanation: String(q.explanation ?? "").trim().slice(0, 600),
      isActive: true,
    });
    // Enter the revision bank as a fresh "learning" item so it can be revised.
    db.revisionItems.push({
      id: nextId(db, "revisionItems"),
      questionId,
      subjectId: subject.id,
      topicId: topic.id,
      status: "learning",
      successStreak: 0,
      timesSeen: 0,
      timesCorrect: 0,
      timesWrong: 0,
      lastResult: null,
      sourceAttemptId: null,
      addedAt: nowIso(),
      lastRevisedAt: null,
      masteredAt: null,
      updatedAt: nowIso(),
    });
    ids.push(questionId);
  }

  if (ids.length === 0) {
    throw new ServiceError("NO_QUESTIONS", "None of the generated questions could be added.");
  }
  saveDb(uid, db);
  return ids;
}
