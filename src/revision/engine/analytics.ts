/**
 * Revision analytics service.
 * ========================
 *
 * Migration brief §36: statistics must be computed from actual review logs,
 * never from UI counters, and must not be recalculated inside components. Every
 * function here is pure — it takes the unified snapshot (or just its review
 * logs) and returns numbers — so the same code powers the dashboard, the stats
 * screen, weak-topic recommendations and the tests.
 *
 * Nothing is stored: analytics state is derived, which keeps the persisted model
 * small and means a schema change can never invalidate a learner's history.
 */

import {
  isDue,
  isLeech,
  type UnifiedCard,
  type UnifiedDeck,
  type UnifiedId,
  type UnifiedRating,
  type UnifiedReviewLog,
  type UnifiedSnapshot,
} from "../domain/types";

/* ------------------------------------------------------------------ */
/* Date helpers (local-day aware, matching the legacy engine)          */
/* ------------------------------------------------------------------ */

export function localDayKey(input: string | number | Date): string {
  const date = input instanceof Date ? input : new Date(input);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

export function startOfLocalDay(input: Date): Date {
  const date = new Date(input);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function addDays(input: Date, days: number): Date {
  const date = new Date(input);
  date.setDate(date.getDate() + days);
  return date;
}

/* ------------------------------------------------------------------ */
/* Volume                                                             */
/* ------------------------------------------------------------------ */

export interface ReviewVolume {
  today: number;
  last7Days: number;
  last30Days: number;
  total: number;
  /** Per-local-day counts for the heatmap / calendar. */
  byDay: Map<string, number>;
}

export function getReviewVolume(logs: UnifiedReviewLog[], now = new Date()): ReviewVolume {
  const todayKey = localDayKey(now);
  const sevenDaysAgo = startOfLocalDay(addDays(now, -6)).getTime();
  const thirtyDaysAgo = startOfLocalDay(addDays(now, -29)).getTime();

  let today = 0;
  let last7Days = 0;
  let last30Days = 0;
  const byDay = new Map<string, number>();

  for (const log of logs) {
    const time = new Date(log.reviewedAt).getTime();
    const key = localDayKey(log.reviewedAt);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
    if (key === todayKey) today += 1;
    if (time >= sevenDaysAgo) last7Days += 1;
    if (time >= thirtyDaysAgo) last30Days += 1;
  }

  return { today, last7Days, last30Days, total: logs.length, byDay };
}

/* ------------------------------------------------------------------ */
/* Ratings, retention, accuracy                                        */
/* ------------------------------------------------------------------ */

export interface RatingDistribution {
  again: number;
  hard: number;
  good: number;
  easy: number;
  /** Retrievability proxy: good+easy over everything (§36 "retention"). */
  retention: number;
  /** Non-lapse accuracy: everything except "again". */
  accuracy: number;
}

export function getRatingDistribution(logs: UnifiedReviewLog[]): RatingDistribution {
  const counts: Record<UnifiedRating, number> = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const log of logs) counts[log.rating] += 1;
  const total = logs.length;
  return {
    ...counts,
    retention: total === 0 ? 0 : (counts.good + counts.easy) / total,
    accuracy: total === 0 ? 0 : (total - counts.again) / total,
  };
}

export interface ResponseTimeStats {
  averageMs: number;
  medianMs: number;
  /** Reviews faster than this are treated as guesses by the quality checks. */
  fastShare: number;
}

export function getResponseTimeStats(logs: UnifiedReviewLog[]): ResponseTimeStats {
  const samples = logs.map((log) => log.responseTime).filter((value) => value > 0);
  if (samples.length === 0) return { averageMs: 0, medianMs: 0, fastShare: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return {
    averageMs: samples.reduce((sum, value) => sum + value, 0) / samples.length,
    medianMs,
    fastShare: samples.filter((value) => value < 1500).length / samples.length,
  };
}

/* ------------------------------------------------------------------ */
/* Streak                                                             */
/* ------------------------------------------------------------------ */

export interface StreakInfo {
  current: number;
  longest: number;
  lastStudyDay: string | null;
}

export function getStreakInfo(logs: UnifiedReviewLog[], now = new Date()): StreakInfo {
  const days = new Set(logs.map((log) => localDayKey(log.reviewedAt)));
  if (days.size === 0) return { current: 0, longest: 0, lastStudyDay: null };

  const sortedDays = Array.from(days).sort();
  let longest = 1;
  let run = 1;
  for (let index = 1; index < sortedDays.length; index += 1) {
    const previous = new Date(`${sortedDays[index - 1]}T00:00:00`);
    const expected = localDayKey(addDays(previous, 1));
    if (sortedDays[index] === expected) run += 1;
    else run = 1;
    longest = Math.max(longest, run);
  }

  const today = localDayKey(now);
  const yesterday = localDayKey(addDays(now, -1));
  let current = 0;
  if (days.has(today) || days.has(yesterday)) {
    const cursor = days.has(today) ? now : addDays(now, -1);
    current = 0;
    for (let offset = 0; offset < 3650; offset += 1) {
      const key = localDayKey(addDays(cursor, -offset));
      if (!days.has(key)) break;
      current += 1;
    }
  }

  return { current, longest, lastStudyDay: sortedDays[sortedDays.length - 1] ?? null };
}

/* ------------------------------------------------------------------ */
/* Workload: due, overdue, forecast                                    */
/* ------------------------------------------------------------------ */

/**
 * Cards due right now — the number the dashboard, the deck rows and the daily
 * reminder all show. One function so they cannot disagree.
 */
export function countDueToday(cards: UnifiedCard[], now = new Date()): number {
  return cards.filter((card) => isDue(card, now)).length;
}

export interface WorkloadSummary {
  due: number;
  dueToday: number;
  overdue: number;
  newCards: number;
  learning: number;
  review: number;
  leeches: number;
  /** Estimated minutes to clear the queue (10 s/card, upstream Recall's rate). */
  estimatedMinutes: number;
  /** Per-day due counts for the next `days` days. */
  forecast: Array<{ day: string; count: number }>;
}

export function getWorkload(
  cards: UnifiedCard[],
  options: { now?: Date; leechThreshold?: number; forecastDays?: number } = {},
): WorkloadSummary {
  const now = options.now ?? new Date();
  const threshold = options.leechThreshold ?? 5;
  const forecastDays = options.forecastDays ?? 14;
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const live = cards.filter((card) => !card.deletedAt);
  const dueCards = live.filter((card) => isDue(card, now));

  const forecastMap = new Map<string, number>();
  for (const card of live) {
    const key = localDayKey(card.scheduling.due);
    forecastMap.set(key, (forecastMap.get(key) ?? 0) + 1);
  }
  const forecast: Array<{ day: string; count: number }> = [];
  for (let offset = 0; offset < forecastDays; offset += 1) {
    const day = localDayKey(addDays(now, offset));
    forecast.push({ day, count: forecastMap.get(day) ?? 0 });
  }

  return {
    due: dueCards.length,
    dueToday: live.filter((card) => new Date(card.scheduling.due).getTime() <= endOfToday.getTime()).length,
    overdue: dueCards.filter((card) => new Date(card.scheduling.due).getTime() < startOfLocalDay(now).getTime())
      .length,
    newCards: live.filter((card) => card.scheduling.state === "new").length,
    learning: live.filter(
      (card) => card.scheduling.state === "learning" || card.scheduling.state === "relearning",
    ).length,
    review: live.filter((card) => card.scheduling.state === "review").length,
    leeches: live.filter((card) => isLeech(card, threshold)).length,
    estimatedMinutes: Math.max(1, Math.round((dueCards.length * 10) / 60)),
    forecast,
  };
}

/* ------------------------------------------------------------------ */
/* Topic + subject performance, weakness intelligence                  */
/* ------------------------------------------------------------------ */

export interface TopicPerformance {
  topicId: number;
  topicName: string;
  subjectId: number;
  subjectName: string;
  /** Cards currently in the topic. */
  cardCount: number;
  reviews: number;
  /** Lifetime non-lapse accuracy. */
  accuracy: number;
  /** Accuracy over the trailing window — drives the "trend" arrow. */
  recentAccuracy: number;
  recentReviews: number;
  /** accuracy − recentAccuracy: positive means it is getting worse. */
  trend: number;
  lapses: number;
  due: number;
  overdue: number;
  leeches: number;
  /** Composite 0-100 "needs work" score used for ranking. */
  weakness: number;
}

export interface WeakTopicsOptions {
  now?: Date;
  /** Window for "recent". */
  recentDays?: number;
  leechThreshold?: number;
}

/**
 * Weakness intelligence (§18). One function, consumed by the dashboard
 * recommendation, the deck/topic browser badges, the study-queue prioritisation
 * and the stats screen — so all four agree on what "weak" means.
 *
 * Scoring blends (in order of weight): recent accuracy, lifetime accuracy,
 * lapse pressure, overdue pressure and leeches. Topics with too little evidence
 * are ranked below topics that have been tested enough to be trusted.
 */
export function getTopicPerformance(
  snapshot: UnifiedSnapshot,
  options: WeakTopicsOptions = {},
): TopicPerformance[] {
  const now = options.now ?? new Date();
  const recentDays = options.recentDays ?? 14;
  const leechThreshold = options.leechThreshold ?? 5;
  const recentCutoff = startOfLocalDay(addDays(now, -recentDays)).getTime();

  const cardById = new Map<UnifiedId, UnifiedCard>(snapshot.cards.map((card) => [card.id, card]));
  const subjectNames = new Map<number, string>();
  snapshot.decks.forEach((deck) => {
    if (deck.subjectId !== undefined) subjectNames.set(deck.subjectId, deck.name);
  });
  const topicNames = new Map<number, string>();
  snapshot.cards.forEach((card) => {
    if (card.topicId !== undefined && card.tags.length) {
      const topicTag = card.tags.find((tag) => tag.startsWith("Topic/"));
      if (topicTag) topicNames.set(card.topicId, topicTag.slice("Topic/".length));
    }
  });

  interface Accumulator {
    topicId: number;
    reviews: number;
    again: number;
    recentReviews: number;
    recentAgain: number;
  }
  const byTopic = new Map<number, Accumulator>();

  for (const log of snapshot.reviewLogs) {
    const card = cardById.get(log.cardId);
    if (!card || card.topicId === undefined) continue;
    const entry =
      byTopic.get(card.topicId) ??
      { topicId: card.topicId, reviews: 0, again: 0, recentReviews: 0, recentAgain: 0 };
    entry.reviews += 1;
    if (log.rating === "again") entry.again += 1;
    if (new Date(log.reviewedAt).getTime() >= recentCutoff) {
      entry.recentReviews += 1;
      if (log.rating === "again") entry.recentAgain += 1;
    }
    byTopic.set(card.topicId, entry);
  }

  const rows: TopicPerformance[] = [];
  const seenTopics = new Set<number>();

  for (const card of snapshot.cards) {
    if (card.deletedAt || card.topicId === undefined) continue;
    if (seenTopics.has(card.topicId)) continue;
    seenTopics.add(card.topicId);

    const cardsInTopic = snapshot.cards.filter(
      (candidate) => !candidate.deletedAt && candidate.topicId === card.topicId,
    );
    const stats = byTopic.get(card.topicId);
    const reviews = stats?.reviews ?? 0;
    const again = stats?.again ?? 0;
    const recentReviews = stats?.recentReviews ?? 0;
    const recentAgain = stats?.recentAgain ?? 0;

    const accuracy = reviews === 0 ? 0 : (reviews - again) / reviews;
    const recentAccuracy = recentReviews === 0 ? accuracy : (recentReviews - recentAgain) / recentReviews;
    const trend = accuracy - recentAccuracy;
    const lapses = cardsInTopic.reduce((sum, item) => sum + item.scheduling.lapses, 0);
    const due = cardsInTopic.filter((item) => isDue(item, now)).length;
    const overdue = cardsInTopic.filter(
      (item) => isDue(item, now) && new Date(item.scheduling.due).getTime() < startOfLocalDay(now).getTime(),
    ).length;
    const leeches = cardsInTopic.filter((item) => isLeech(item, leechThreshold)).length;

    // Evidence weighting: a topic reviewed 3 times is not "weak", it is unknown.
    const evidence = Math.min(1, recentReviews / 8);
    const weakness = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          45 * (1 - recentAccuracy) * evidence +
            25 * (1 - accuracy) * Math.min(1, reviews / 20) +
            12 * Math.min(1, lapses / Math.max(1, cardsInTopic.length)) +
            10 * Math.min(1, overdue / Math.max(1, cardsInTopic.length)) +
            8 * Math.min(1, leeches / Math.max(1, cardsInTopic.length)),
        ),
      ),
    );

    const subjectId = card.subjectId ?? 0;
    rows.push({
      topicId: card.topicId,
      topicName: topicNames.get(card.topicId) ?? `Topic ${card.topicId}`,
      subjectId,
      subjectName: subjectNames.get(subjectId) ?? (subjectId ? `Subject ${subjectId}` : "General"),
      cardCount: cardsInTopic.length,
      reviews,
      accuracy,
      recentAccuracy,
      recentReviews,
      trend,
      lapses,
      due,
      overdue,
      leeches,
      weakness,
    });
  }

  return rows.sort((a, b) => b.weakness - a.weakness || b.overdue - a.overdue || a.topicId - b.topicId);
}

export interface SubjectPerformance {
  subjectId: number;
  subjectName: string;
  deckId: UnifiedId | null;
  cardCount: number;
  due: number;
  reviews: number;
  accuracy: number;
  recentAccuracy: number;
  mastered: number;
  /** 0-100 health score, higher is healthier. */
  health: number;
}

export function getSubjectPerformance(
  snapshot: UnifiedSnapshot,
  now = new Date(),
): SubjectPerformance[] {
  const topics = getTopicPerformance(snapshot, { now });
  const subjectNameById = new Map<number, string>();
  snapshot.decks.forEach((deck) => {
    if (deck.subjectId !== undefined && deck.kind === "subject") subjectNameById.set(deck.subjectId, deck.name);
  });

  const grouped = new Map<number, UnifiedCard[]>();
  for (const card of snapshot.cards) {
    if (card.deletedAt) continue;
    const subjectId = card.subjectId ?? 0;
    grouped.set(subjectId, [...(grouped.get(subjectId) ?? []), card]);
  }

  const topicRows = new Map<number, TopicPerformance[]>();
  topics.forEach((topic) => {
    const list = topicRows.get(topic.subjectId) ?? [];
    list.push(topic);
    topicRows.set(topic.subjectId, list);
  });

  return Array.from(grouped.entries())
    .map(([subjectId, cards]) => {
      const rows = topicRows.get(subjectId) ?? [];
      const reviews = rows.reduce((sum, row) => sum + row.reviews, 0);
      const recentReviews = rows.reduce((sum, row) => sum + row.recentReviews, 0);
      const weightedAccuracy =
        reviews === 0
          ? 0
          : rows.reduce((sum, row) => sum + row.accuracy * row.reviews, 0) / reviews;
      const weightedRecent =
        recentReviews === 0
          ? weightedAccuracy
          : rows.reduce((sum, row) => sum + row.recentAccuracy * row.recentReviews, 0) / recentReviews;
      const due = cards.filter((card) => isDue(card, now)).length;
      const mastered = cards.filter((card) => card.scheduling.state === "review").length;
      const deck = snapshot.decks.find((d) => d.subjectId === subjectId && d.kind === "subject");
      return {
        subjectId,
        subjectName: subjectNameById.get(subjectId) ?? deck?.name ?? (subjectId ? `Subject ${subjectId}` : "General"),
        deckId: deck?.id ?? null,
        cardCount: cards.length,
        due,
        reviews,
        accuracy: weightedAccuracy,
        recentAccuracy: weightedRecent,
        mastered,
        health: Math.round(100 * Math.max(0, Math.min(1, weightedRecent)) * (1 - due / Math.max(1, cards.length)) + 50 * (mastered / Math.max(1, cards.length))),
      };
    })
    .sort((a, b) => a.health - b.health);
}

/* ------------------------------------------------------------------ */
/* Time of day                                                         */
/* ------------------------------------------------------------------ */

export interface TimeOfDayBucket {
  label: string;
  reviews: number;
  accuracy: number;
}

/** Four-bucket performance split used by the stats screen (§36). */
export function getTimeOfDayPerformance(logs: UnifiedReviewLog[]): TimeOfDayBucket[] {
  const buckets: Array<{ label: string; from: number; to: number }> = [
    { label: "Night (0-6)", from: 0, to: 6 },
    { label: "Morning (6-12)", from: 6, to: 12 },
    { label: "Afternoon (12-18)", from: 12, to: 18 },
    { label: "Evening (18-24)", from: 18, to: 24 },
  ];
  return buckets.map((bucket) => {
    const inBucket = logs.filter((log) => {
      const hour = new Date(log.reviewedAt).getHours();
      return hour >= bucket.from && hour < bucket.to;
    });
    const again = inBucket.filter((log) => log.rating === "again").length;
    return {
      label: bucket.label,
      reviews: inBucket.length,
      accuracy: inBucket.length === 0 ? 0 : (inBucket.length - again) / inBucket.length,
    };
  });
}

/* ------------------------------------------------------------------ */
/* One call the dashboard/stats screens use                            */
/* ------------------------------------------------------------------ */

export interface RevisionAnalytics {
  volume: ReviewVolume;
  ratings: RatingDistribution;
  responseTime: ResponseTimeStats;
  streak: StreakInfo;
  workload: WorkloadSummary;
  topics: TopicPerformance[];
  subjects: SubjectPerformance[];
  timeOfDay: TimeOfDayBucket[];
  /** Sessions started vs completed, from the unified session rows. */
  sessionCompletion: { started: number; completed: number; rate: number };
}

export function buildAnalytics(
  snapshot: UnifiedSnapshot,
  options: { now?: Date; leechThreshold?: number } = {},
): RevisionAnalytics {
  const now = options.now ?? new Date();
  const leechThreshold = options.leechThreshold ?? 5;
  const started = snapshot.sessions.length;
  const completed = snapshot.sessions.filter((session) => session.completed).length;
  return {
    volume: getReviewVolume(snapshot.reviewLogs, now),
    ratings: getRatingDistribution(snapshot.reviewLogs),
    responseTime: getResponseTimeStats(snapshot.reviewLogs),
    streak: getStreakInfo(snapshot.reviewLogs, now),
    workload: getWorkload(snapshot.cards, { now, leechThreshold }),
    topics: getTopicPerformance(snapshot, { now, leechThreshold }),
    subjects: getSubjectPerformance(snapshot, now),
    timeOfDay: getTimeOfDayPerformance(snapshot.reviewLogs),
    sessionCompletion: {
      started,
      completed,
      rate: started === 0 ? 0 : completed / started,
    },
  };
}

/** Deck-level health rows for the deck browser badges. */
export function getDeckHealth(
  snapshot: UnifiedSnapshot,
  now = new Date(),
): Map<UnifiedId, { due: number; accuracy: number; total: number; newCards: number; leeches: number }> {
  const out = new Map<UnifiedId, { due: number; accuracy: number; total: number; newCards: number; leeches: number }>();
  const reviewCountByCard = new Map<UnifiedId, { total: number; again: number }>();
  for (const log of snapshot.reviewLogs) {
    const entry = reviewCountByCard.get(log.cardId) ?? { total: 0, again: 0 };
    entry.total += 1;
    if (log.rating === "again") entry.again += 1;
    reviewCountByCard.set(log.cardId, entry);
  }

  for (const deck of snapshot.decks as UnifiedDeck[]) {
    const cards = snapshot.cards.filter((card) => !card.deletedAt && card.deckId === deck.id);
    if (cards.length === 0) continue;
    let total = 0;
    let again = 0;
    cards.forEach((card) => {
      const entry = reviewCountByCard.get(card.id);
      if (entry) {
        total += entry.total;
        again += entry.again;
      }
    });
    out.set(deck.id, {
      due: cards.filter((card) => isDue(card, now)).length,
      accuracy: total === 0 ? 0 : (total - again) / total,
      total: cards.length,
      newCards: cards.filter((card) => card.scheduling.state === "new").length,
      leeches: cards.filter((card) => isLeech(card, 5)).length,
    });
  }
  return out;
}
