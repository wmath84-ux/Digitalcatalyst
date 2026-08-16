// Port of the reference `src/server/revision-service.ts`
// (daily-test-revision-system.zip) to the local engine. Preserves the exact
// spaced-mastery state machine:
//   correct  → learning → improving → mastered
//   wrong    → back to learning (mastered drops to improving)

import type { PlayerQuestion } from "./types";
import {
  loadDb,
  saveDb,
  nextId,
  nowIso,
  ServiceError,
  type RevisionDb,
  type RevisionSessionRow,
  type RevisionStatus,
} from "./store";

export { ServiceError };

export type BankFilters = {
  subjectId?: number;
  topicId?: number;
  difficulty?: "easy" | "medium" | "hard";
  status?: "learning" | "improving" | "mastered" | "all";
  search?: string;
  sort?: "recent" | "oldest" | "difficulty" | "most_wrong" | "alphabetical";
};

export function getRevisionBank(uid: string, filters: BankFilters = {}) {
  const db = loadDb(uid);
  let rows = db.revisionItems.filter((item) => {
    if (filters.status && filters.status !== "all") {
      if (item.status !== filters.status) return false;
    } else if (!filters.status) {
      // default: hide mastered from the primary queue view
      if (item.status === "mastered") return false;
    }
    if (filters.subjectId && item.subjectId !== filters.subjectId) return false;
    if (filters.topicId && item.topicId !== filters.topicId) return false;
    return true;
  });

  let joined = rows
    .map((item) => {
      const q = db.questions.find((row) => row.id === item.questionId);
      if (!q) return null;
      const topic = db.topics.find((t) => t.id === item.topicId)!;
      const subject = db.subjects.find((s) => s.id === item.subjectId)!;
      return {
        id: item.id,
        questionId: item.questionId,
        status: item.status,
        successStreak: item.successStreak,
        timesSeen: item.timesSeen,
        timesCorrect: item.timesCorrect,
        timesWrong: item.timesWrong,
        lastResult: item.lastResult,
        addedAt: item.addedAt,
        lastRevisedAt: item.lastRevisedAt,
        masteredAt: item.masteredAt,
        prompt: q.prompt,
        difficulty: q.difficulty,
        subjectId: subject.id,
        subjectName: subject.name,
        subjectIcon: subject.icon,
        topicId: topic.id,
        topicName: topic.name,
      };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  if (filters.difficulty) {
    joined = joined.filter((r) => r.difficulty === filters.difficulty);
  }
  if (filters.search && filters.search.trim().length > 0) {
    const q = filters.search.trim().toLowerCase();
    joined = joined.filter(
      (r) =>
        r.prompt.toLowerCase().includes(q) ||
        r.topicName.toLowerCase().includes(q) ||
        r.subjectName.toLowerCase().includes(q),
    );
  }

  const difficultyRank: Record<string, number> = { hard: 0, medium: 1, easy: 2 };
  const sort = filters.sort ?? "recent";
  joined = [...joined].sort((a, b) => {
    switch (sort) {
      case "oldest":
        return new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime();
      case "difficulty":
        return difficultyRank[a.difficulty] - difficultyRank[b.difficulty];
      case "most_wrong":
        return b.timesWrong - a.timesWrong;
      case "alphabetical":
        return a.topicName.localeCompare(b.topicName);
      case "recent":
      default:
        return new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime();
    }
  });

  return joined;
}

export function getRevisionSummary(uid: string) {
  const db = loadDb(uid);
  const rows = db.revisionItems;
  const learning = rows.filter((r) => r.status === "learning").length;
  const improving = rows.filter((r) => r.status === "improving").length;
  const mastered = rows.filter((r) => r.status === "mastered").length;
  const due = learning + improving;

  const bySubject = new Map<number, { subjectId: number; name: string; icon: string; count: number }>();
  for (const r of rows) {
    if (r.status === "mastered") continue;
    const subject = db.subjects.find((s) => s.id === r.subjectId);
    if (!subject) continue;
    const entry = bySubject.get(r.subjectId) ?? {
      subjectId: r.subjectId,
      name: subject.name,
      icon: subject.icon,
      count: 0,
    };
    entry.count += 1;
    bySubject.set(r.subjectId, entry);
  }

  return {
    total: rows.length,
    learning,
    improving,
    mastered,
    due,
    bySubject: Array.from(bySubject.values()).sort((a, b) => b.count - a.count),
  };
}

function loadSessionOrThrow(db: RevisionDb, sessionId: number): RevisionSessionRow {
  const session = db.revisionSessions.find((s) => s.id === sessionId);
  if (!session) {
    throw new ServiceError("NOT_FOUND", "Revision session not found.");
  }
  return session;
}

export function findActiveSession(uid: string) {
  const db = loadDb(uid);
  const rows = db.revisionSessions
    .filter((s) => s.status === "in_progress")
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  return rows[0] ?? null;
}

export function startRevisionSession(
  uid: string,
  filters: { subjectId?: number; topicId?: number; status?: string; limit?: number } = {},
) {
  const db = loadDb(uid);

  const existingActive = db.revisionSessions
    .filter((s) => s.status === "in_progress")
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0];
  if (existingActive) return existingActive;

  const eligible = db.revisionItems.filter((item) => {
    if (filters.status === "mastered") {
      if (item.status !== "mastered") return false;
    } else if (item.status === "mastered") {
      return false;
    }
    if (filters.subjectId && item.subjectId !== filters.subjectId) return false;
    if (filters.topicId && item.topicId !== filters.topicId) return false;
    return true;
  });

  if (eligible.length === 0) {
    throw new ServiceError("NO_ITEMS", "No revision questions available for this filter.");
  }

  const statusRank: Record<string, number> = { learning: 0, improving: 1, mastered: 2 };
  const sorted = [...eligible].sort((a, b) => {
    const rankDiff = statusRank[a.status] - statusRank[b.status];
    if (rankDiff !== 0) return rankDiff;
    const aTime = a.lastRevisedAt ? new Date(a.lastRevisedAt).getTime() : 0;
    const bTime = b.lastRevisedAt ? new Date(b.lastRevisedAt).getTime() : 0;
    return aTime - bTime;
  });

  const limit = filters.limit ?? 10;
  const chosen = sorted.slice(0, limit);
  const questionIds = chosen.map((c) => c.questionId);

  const session: RevisionSessionRow = {
    id: nextId(db, "revisionSessions"),
    status: "in_progress",
    filterSubjectId: filters.subjectId ?? null,
    filterTopicId: filters.topicId ?? null,
    filterStatus: filters.status ?? null,
    questionIds,
    totalQuestions: questionIds.length,
    correctCount: 0,
    currentIndex: 0,
    startedAt: nowIso(),
    completedAt: null,
  };
  db.revisionSessions.push(session);
  saveDb(uid, db);
  return session;
}

export function getRevisionSessionForPlayer(uid: string, sessionId: number) {
  const db = loadDb(uid);
  const session = loadSessionOrThrow(db, sessionId);
  if (session.status !== "in_progress") {
    throw new ServiceError("INVALID_STATE", "This revision session is not in progress.");
  }
  const ids = session.questionIds;
  const answerByQ = new Map(
    db.revisionSessionAnswers.filter((a) => a.sessionId === sessionId).map((a) => [a.questionId, a]),
  );

  const ordered: PlayerQuestion[] = ids
    .map((id) => db.questions.find((q) => q.id === id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q))
    .map((q) => {
      const topic = db.topics.find((t) => t.id === q.topicId)!;
      const subject = db.subjects.find((s) => s.id === q.subjectId)!;
      return {
        id: q.id,
        prompt: q.prompt,
        options: q.options,
        difficulty: q.difficulty,
        subjectId: subject.id,
        subjectName: subject.name,
        subjectIcon: subject.icon,
        topicId: topic.id,
        topicName: topic.name,
        selectedIndex: answerByQ.get(q.id)?.selectedIndex ?? null,
      };
    });

  return {
    session: {
      id: session.id,
      currentIndex: session.currentIndex,
      totalQuestions: session.totalQuestions,
      startedAt: session.startedAt,
    },
    questions: ordered,
  };
}

export function saveRevisionAnswer(
  uid: string,
  sessionId: number,
  questionId: number,
  selectedIndex: number | null,
) {
  const db = loadDb(uid);
  const session = loadSessionOrThrow(db, sessionId);
  if (session.status !== "in_progress") {
    throw new ServiceError("INVALID_STATE", "This revision session is not in progress.");
  }
  if (!session.questionIds.includes(questionId)) {
    throw new ServiceError("INVALID_QUESTION", "Question does not belong to this session.");
  }
  const question = db.questions.find((q) => q.id === questionId);
  if (!question) throw new ServiceError("NOT_FOUND", "Question not found.");
  if (selectedIndex !== null && (selectedIndex < 0 || selectedIndex >= question.options.length)) {
    throw new ServiceError("INVALID_OPTION", "Selected option is out of range.");
  }
  const item = db.revisionItems.find((row) => row.questionId === questionId);
  if (!item) throw new ServiceError("NOT_FOUND", "Revision item not found.");

  const isSkipped = selectedIndex === null;
  const isCorrect = isSkipped ? null : selectedIndex === question.correctIndex;

  const existing = db.revisionSessionAnswers.find(
    (a) => a.sessionId === sessionId && a.questionId === questionId,
  );
  if (existing) {
    existing.selectedIndex = selectedIndex;
    existing.isCorrect = isCorrect;
    existing.isSkipped = isSkipped;
    existing.answeredAt = nowIso();
  } else {
    db.revisionSessionAnswers.push({
      id: nextId(db, "revisionSessionAnswers"),
      sessionId,
      revisionItemId: item.id,
      questionId,
      selectedIndex,
      isCorrect,
      isSkipped,
      statusBefore: null,
      statusAfter: null,
      answeredAt: nowIso(),
    });
  }
  saveDb(uid, db);
  return { questionId, selectedIndex, isCorrect, isSkipped };
}

export function updateRevisionSessionIndex(uid: string, sessionId: number, index: number) {
  const db = loadDb(uid);
  const session = loadSessionOrThrow(db, sessionId);
  if (session.status !== "in_progress") {
    throw new ServiceError("INVALID_STATE", "This revision session is not in progress.");
  }
  session.currentIndex = index;
  saveDb(uid, db);
  return { currentIndex: index };
}

export function submitRevisionSession(uid: string, sessionId: number) {
  const db = loadDb(uid);
  const session = loadSessionOrThrow(db, sessionId);
  if (session.status === "completed") {
    return { alreadyCompleted: true, sessionId };
  }

  const ids = session.questionIds;
  const answerByQ = new Map(
    db.revisionSessionAnswers.filter((a) => a.sessionId === sessionId).map((a) => [a.questionId, a]),
  );
  const itemByQ = new Map(
    db.revisionItems.filter((it) => ids.includes(it.questionId)).map((it) => [it.questionId, it]),
  );

  let correctCount = 0;

  for (const qid of ids) {
    let answer = answerByQ.get(qid);
    if (!answer) {
      const item = itemByQ.get(qid);
      if (!item) continue;
      answer = {
        id: nextId(db, "revisionSessionAnswers"),
        sessionId,
        revisionItemId: item.id,
        questionId: qid,
        selectedIndex: null,
        isCorrect: null,
        isSkipped: true,
        statusBefore: null,
        statusAfter: null,
        answeredAt: null,
      };
      db.revisionSessionAnswers.push(answer);
    }
    const item = itemByQ.get(qid);
    if (!item || !answer) continue;

    const statusBefore: RevisionStatus = item.status;
    let statusAfter: RevisionStatus = statusBefore;
    let successStreak = item.successStreak;
    let timesCorrect = item.timesCorrect;
    let timesWrong = item.timesWrong;

    if (answer.isCorrect) {
      correctCount += 1;
      successStreak += 1;
      timesCorrect += 1;
      if (statusBefore === "learning") statusAfter = "improving";
      else if (statusBefore === "improving") statusAfter = "mastered";
      else statusAfter = "mastered";
    } else {
      successStreak = 0;
      if (!answer.isSkipped) timesWrong += 1;
      if (statusBefore === "mastered") statusAfter = "improving";
      else statusAfter = "learning";
    }

    item.status = statusAfter;
    item.successStreak = successStreak;
    item.timesSeen += 1;
    item.timesCorrect = timesCorrect;
    item.timesWrong = timesWrong;
    item.lastResult = answer.isSkipped ? "skipped" : answer.isCorrect ? "correct" : "wrong";
    item.lastRevisedAt = nowIso();
    if (statusAfter === "mastered" && statusBefore !== "mastered") item.masteredAt = nowIso();
    item.updatedAt = nowIso();

    answer.statusBefore = statusBefore;
    answer.statusAfter = statusAfter;
  }

  session.status = "completed";
  session.completedAt = nowIso();
  session.correctCount = correctCount;

  saveDb(uid, db);
  return { alreadyCompleted: false, sessionId };
}

export function getRevisionSessionResult(uid: string, sessionId: number) {
  const db = loadDb(uid);
  const session = loadSessionOrThrow(db, sessionId);
  if (session.status !== "completed") {
    throw new ServiceError("INVALID_STATE", "This revision session is not completed yet.");
  }

  const answers = db.revisionSessionAnswers.filter((a) => a.sessionId === sessionId);
  const answerByQ = new Map(answers.map((a) => [a.questionId, a]));

  const total = session.totalQuestions || 1;
  const skipped = answers.filter((a) => a.isSkipped).length;
  const wrong = answers.filter((a) => !a.isSkipped && a.isCorrect === false).length;

  const items = session.questionIds
    .map((id) => {
      const q = db.questions.find((row) => row.id === id);
      const a = answerByQ.get(id);
      if (!q) return null;
      const topic = db.topics.find((t) => t.id === q.topicId)!;
      const subject = db.subjects.find((s) => s.id === q.subjectId)!;
      return {
        id: q.id,
        prompt: q.prompt,
        options: q.options,
        correctIndex: q.correctIndex,
        explanation: q.explanation,
        difficulty: q.difficulty,
        subjectName: subject.name,
        subjectIcon: subject.icon,
        topicName: topic.name,
        selectedIndex: a?.selectedIndex ?? null,
        isCorrect: a?.isCorrect ?? null,
        isSkipped: a?.isSkipped ?? true,
        statusBefore: a?.statusBefore ?? null,
        statusAfter: a?.statusAfter ?? null,
      };
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  return {
    sessionId: session.id,
    totalQuestions: session.totalQuestions,
    correctCount: session.correctCount,
    wrongCount: wrong,
    skippedCount: skipped,
    accuracy: Math.round((session.correctCount / total) * 100),
    startedAt: session.startedAt,
    completedAt: session.completedAt,
    promoted: items.filter((i) => i.statusAfter && i.statusBefore && i.statusAfter !== i.statusBefore && i.statusAfter !== "learning").length,
    mastered: items.filter((i) => i.statusAfter === "mastered" && i.statusBefore !== "mastered").length,
    items,
  };
}

export function getTopicsForSubject(uid: string, subjectId?: number) {
  const db = loadDb(uid);
  if (subjectId) return db.topics.filter((t) => t.subjectId === subjectId);
  return db.topics;
}

export function getAllSubjects(uid: string) {
  const db = loadDb(uid);
  return db.subjects;
}
