/**
 * Unified domain ↔ Recall UI projection.
 * =====================================
 *
 * The ported Recall components read exactly one shape: `RecallStateSnapshot`
 * (decks, cards, reviewLogs, studySessions, settings). The unified domain is the
 * feature's data model. This adapter is the only bridge between them, which is
 * what keeps the React layer from having to know about three upstream models
 * (migration brief §3).
 *
 * Direction rules
 *   project →  unified → Recall, for hydration (boot, cloud refresh, migration).
 *   merge   →  Recall → unified, after every Recall write, so anything the
 *              learner creates or reviews in the ported UI persists in the
 *              unified model too — and is then mirrored to the legacy engine.
 *
 * The projection is intentionally lossy for fields Recall has no concept of
 * (MCQ options, occlusion masks, provenance): the merge is a *patch*, so those
 * fields survive a round trip because they are never dropped from the unified
 * store in the first place.
 */

import type {
  Card as RecallCard,
  CardState as RecallCardState,
  CardType as RecallCardType,
  Deck as RecallDeck,
  RecallSettings,
  RecallStateSnapshot,
  ReviewLog as RecallReviewLog,
  ReviewRating,
  StudySession as RecallStudySession,
} from "../recall/types";
import {
  DEFAULT_STUDY_SETTINGS,
  type UnifiedCard,
  type UnifiedCardType,
  type UnifiedDeck,
  type UnifiedId,
  type UnifiedRating,
  type UnifiedReviewLog,
  type UnifiedSettings,
  type UnifiedSnapshot,
  reviewDedupeKey,
} from "../domain/types";
import { mergeUnifiedSnapshots } from "../domain/adapters/legacyProjection";

/* ------------------------------------------------------------------ */
/* Card type mapping                                                   */
/* ------------------------------------------------------------------ */

/** Recall only models three card types; everything else renders as a basic card. */
export function toRecallCardType(type: UnifiedCardType): RecallCardType {
  if (type === "cloze") return "cloze";
  if (type === "image-occlusion") return "image-occlusion";
  return "basic";
}

/**
 * Reverse mapping. `basic` is ambiguous (basic / mcq / formula / markdown /
 * latex / code all project onto it), so an existing unified card keeps its own
 * type and only a brand-new Recall card becomes `basic`.
 */
export function fromRecallCardType(type: RecallCardType, existing?: UnifiedCard): UnifiedCardType {
  if (type === "cloze") return "cloze";
  if (type === "image-occlusion") return "image-occlusion";
  return existing?.cardType ?? "basic";
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function unifiedSettingsToRecall(settings: UnifiedSettings): RecallSettings {
  const study = { ...DEFAULT_STUDY_SETTINGS, ...settings.study };
  return {
    theme: study.theme,
    accentColor: study.accentColor,
    dyslexiaFont: study.dyslexiaFont,
    seededAt: settings.migratedAt ?? new Date().toISOString(),
    dailyNewCardLimit: study.dailyNewCardLimit,
    leechThreshold: study.leechThreshold,
    onboardingComplete: true,
    xp: settings.study && "xp" in settings.study ? Number((settings.study as { xp?: number }).xp ?? 0) : 0,
    achievements: [],
    dailyGoal: study.dailyGoal,
    notificationsEnabled: study.notificationsEnabled,
    soundVolume: study.soundVolume,
    allowHtml: false,
    desiredRetention: study.desiredRetention,
    backupFolder: null,
    backupSchedule: "never",
    lastBackupAt: null,
    // Digitalcatalyst keeps cross-device sync in Firebase; the ported "sync
    // folder" and E2E relay settings have no meaning here and stay disabled so
    // the ported settings screen cannot claim a sync that is not running.
    syncFolder: null,
    syncEnabled: false,
    syncCode: null,
    syncRelayUrl: null,
    syncLastAt: null,
    syncAutoInterval: 0,
    ttsEnabled: study.ttsEnabled,
    ttsAutoRead: study.ttsAutoRead,
    ttsSpeed: study.ttsSpeed,
    fsrsWeights: study.fsrsWeights,
    voiceInputEnabled: study.voiceInputEnabled,
    swipeGestures: study.swipeGestures,
    colorBlindMode: study.colorBlindMode,
  };
}

export function recallSettingsToUnified(
  recall: RecallSettings,
  base: UnifiedSettings,
): UnifiedSettings {
  return {
    ...base,
    study: {
      ...DEFAULT_STUDY_SETTINGS,
      ...base.study,
      theme: recall.theme,
      accentColor: recall.accentColor,
      dyslexiaFont: recall.dyslexiaFont,
      dailyNewCardLimit: recall.dailyNewCardLimit,
      leechThreshold: recall.leechThreshold,
      dailyGoal: recall.dailyGoal,
      desiredRetention: recall.desiredRetention,
      notificationsEnabled: recall.notificationsEnabled,
      soundVolume: recall.soundVolume,
      ttsEnabled: recall.ttsEnabled,
      ttsAutoRead: recall.ttsAutoRead,
      ttsSpeed: recall.ttsSpeed,
      swipeGestures: recall.swipeGestures,
      voiceInputEnabled: recall.voiceInputEnabled,
      colorBlindMode: recall.colorBlindMode ?? false,
      fsrsWeights: recall.fsrsWeights,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Deck projection                                                     */
/* ------------------------------------------------------------------ */

export function toRecallDeck(deck: UnifiedDeck): RecallDeck {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    color: deck.color,
    examDeadline: deck.examDeadline,
    createdAt: deck.createdAt,
    updatedAt: deck.updatedAt,
  };
}

export function fromRecallDeck(deck: RecallDeck, base?: UnifiedDeck): UnifiedDeck {
  const now = new Date().toISOString();
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    color: deck.color,
    kind: base?.kind ?? "user",
    folderId: base?.folderId,
    subjectId: base?.subjectId,
    topicId: base?.topicId,
    classSlug: base?.classSlug,
    examDeadline: deck.examDeadline,
    createdAt: deck.createdAt || base?.createdAt || now,
    updatedAt: deck.updatedAt || now,
    shareRef: base?.shareRef ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* Card projection                                                     */
/* ------------------------------------------------------------------ */

export function toRecallCard(card: UnifiedCard): RecallCard {
  return {
    id: card.id,
    deckId: card.deckId,
    front: card.front,
    back: card.back,
    hint: card.hint,
    source: card.source,
    tags: card.tags,
    cardType: toRecallCardType(card.cardType),
    state: card.scheduling.state as RecallCardState,
    lastReviewDate: card.scheduling.lastReview,
    nextReviewDate: card.scheduling.due,
    stability: card.scheduling.stability,
    difficulty: card.scheduling.difficulty,
    elapsedDays: card.scheduling.elapsedDays,
    scheduledDays: card.scheduling.scheduledDays,
    reps: card.scheduling.reps,
    lapses: card.scheduling.lapses,
    learningSteps: card.scheduling.learningSteps,
    createdAt: card.createdAt,
    updatedAt: card.updatedAt,
  };
}

/**
 * The subset of fields compared to decide whether the learner edited a card
 * inside the ported UI. Both a `UnifiedCard` and a Recall `Card` satisfy it,
 * which is what lets the merge accept either as "the previous value".
 */
export interface RecallContentPatch {
  front: string;
  back: string;
  hint: string;
  tags: string[];
}

/**
 * Patch a Recall card back into `base`.
 *
 * Scheduling is authored by the FSRS engine and always wins. Content fields
 * (front/back/hint/tags) win only when the learner actually edited them, which
 * is why the caller passes the previous unified card: an unchanged front/back
 * means the projection round-tripped, not that the learner rewrote the card.
 */
export function fromRecallCard(
  card: RecallCard,
  base?: UnifiedCard,
  previous?: RecallContentPatch,
): UnifiedCard {
  const now = new Date().toISOString();
  const contentChanged =
    !previous ||
    previous.front !== card.front ||
    previous.back !== card.back ||
    previous.hint !== card.hint;

  const tagsChanged =
    !previous ||
    previous.tags.length !== card.tags.length ||
    previous.tags.some((tag, index) => card.tags[index] !== tag);

  const merged: UnifiedCard = {
    id: card.id,
    deckId: card.deckId,
    subjectId: base?.subjectId,
    topicId: base?.topicId,
    classSlug: base?.classSlug,
    folderId: base?.folderId,
    tags: tagsChanged ? card.tags : (base?.tags ?? card.tags),
    front: contentChanged ? card.front : (base?.front ?? card.front),
    back: contentChanged ? card.back : (base?.back ?? card.back),
    hint: contentChanged ? card.hint : (base?.hint ?? card.hint),
    explanation: base?.explanation,
    options: base?.options,
    correctIndex: base?.correctIndex,
    cardType: fromRecallCardType(card.cardType, base),
    reversible: base?.reversible,
    occlusion: base?.occlusion,
    media: base?.media ?? [],
    source: base?.source ?? "recall",
    difficulty: base?.difficulty ?? "medium",
    legacy: base?.legacy,
    createdAt: card.createdAt || base?.createdAt || now,
    updatedAt: card.updatedAt || now,
    deletedAt: base?.deletedAt ?? null,
    position: base?.position,
    scheduling: {
      due: card.nextReviewDate,
      lastReview: card.lastReviewDate,
      stability: card.stability,
      difficulty: card.difficulty,
      elapsedDays: card.elapsedDays,
      scheduledDays: card.scheduledDays,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      learningSteps: card.learningSteps,
      buriedUntil: base?.scheduling.buriedUntil ?? null,
      snoozedUntil: base?.scheduling.snoozedUntil ?? null,
    },
  };
  return merged;
}

/* ------------------------------------------------------------------ */
/* Review log projection                                               */
/* ------------------------------------------------------------------ */

export function toRecallReviewLog(log: UnifiedReviewLog): RecallReviewLog {
  return {
    id: log.id,
    cardId: log.cardId,
    rating: log.rating,
    reviewDate: log.reviewedAt,
    stability: log.stability,
    difficulty: log.difficulty,
    elapsedDays: log.elapsedDays,
    scheduledDays: log.scheduledDays,
  };
}

export function fromRecallReviewLog(log: RecallReviewLog, existing?: UnifiedReviewLog): UnifiedReviewLog {
  const reviewedAt = log.reviewDate;
  const rating = log.rating as UnifiedRating;
  const sessionId = existing?.sessionId ?? null;
  return {
    id: log.id,
    cardId: log.cardId,
    rating,
    reviewedAt,
    responseTime: existing?.responseTime ?? 0,
    source: existing?.source ?? "recall-study",
    sessionId,
    stability: log.stability,
    difficulty: log.difficulty,
    elapsedDays: log.elapsedDays,
    scheduledDays: log.scheduledDays,
    stateBefore: existing?.stateBefore ?? "new",
    stateAfter: existing?.stateAfter ?? "review",
    legacyAnswerId: existing?.legacyAnswerId,
    dedupeKey:
      existing?.dedupeKey ?? reviewDedupeKey({ cardId: log.cardId, rating, sessionId, reviewedAt }),
  };
}

/* ------------------------------------------------------------------ */
/* Snapshot projection                                                 */
/* ------------------------------------------------------------------ */

export interface ProjectOptions {
  /** Deck ids the learner may study (already filtered by entitlement). */
  deckIds?: Set<UnifiedId>;
  /** Include soft-deleted cards (export/undelete only). */
  includeDeleted?: boolean;
  /** Cap the review-log window for performance (undefined = all). */
  reviewLogsSince?: string;
  /** Freeze "now" for deterministic tests. */
  now?: Date;
}

export function projectUnifiedToRecall(
  snapshot: UnifiedSnapshot,
  options: ProjectOptions = {},
): RecallStateSnapshot {
  const cards = snapshot.cards.filter(
    (card) =>
      !card.deletedAt &&
      (!options.deckIds || options.deckIds.has(card.deckId)),
  );
  const deckIds = new Set(cards.map((card) => card.deckId));
  const decks = snapshot.decks.filter(
    (deck) => deckIds.has(deck.id) || (options.deckIds ? options.deckIds.has(deck.id) : false),
  );

  const reviewLogs = snapshot.reviewLogs
    .filter((log) => !options.reviewLogsSince || log.reviewedAt >= options.reviewLogsSince)
    .map(toRecallReviewLog);

  const studySessions: RecallStudySession[] = snapshot.sessions
    .filter((session) => session.completed)
    .map((session) => ({
      id: session.id,
      deckId: session.deckId,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? session.startedAt,
      cardsStudied: session.cardIds.length,
    }));

  return {
    decks: decks.map(toRecallDeck),
    cards: cards.map(toRecallCard),
    reviewLogs,
    studySessions,
    settings: unifiedSettingsToRecall(snapshot.settings),
  };
}

/**
 * Merge a Recall snapshot back into the unified snapshot.
 *
 * Guarantees (all pinned by tests):
 *   • a card that only changed its scheduling is patched, never duplicated;
 *   • review logs are de-duplicated on `dedupeKey`, so a StrictMode double
 *     invoke, a reconnect replay or an app reopen cannot inflate the history;
 *   • fields the unified model owns (options, occlusion, provenance, media) are
 *     preserved exactly as they were.
 */
export function mergeRecallIntoUnified(
  base: UnifiedSnapshot,
  recall: RecallStateSnapshot,
  previousRecall?: RecallStateSnapshot,
): UnifiedSnapshot {
  const cardById = new Map(base.cards.map((card) => [card.id, card]));
  const previousCardById = new Map<UnifiedId, RecallContentPatch>(
    (previousRecall?.cards ?? []).map((card) => [
      card.id,
      { front: card.front, back: card.back, hint: card.hint, tags: card.tags },
    ]),
  );

  const mergedCards = recall.cards.map((card) => {
    const existing = cardById.get(card.id);
    const previous = previousCardById.get(card.id) ?? existing;
    return fromRecallCard(card, existing, previous);
  });

  // Cards the learner deleted inside Recall are soft-deleted in the unified
  // store (never hard-deleted: §12 forbids silent data loss).
  const recallIds = new Set(recall.cards.map((card) => card.id));
  const archivedCards = base.cards
    .filter((card) => !recallIds.has(card.id) && !card.deletedAt)
    .map((card) => ({ ...card, deletedAt: new Date().toISOString() }));

  const deckById = new Map(base.decks.map((deck) => [deck.id, deck]));
  const mergedDecks = recall.decks.map((deck) => fromRecallDeck(deck, deckById.get(deck.id)));

  const reviewById = new Map(base.reviewLogs.map((log) => [log.id, log]));
  const reviewByDedupe = new Map(base.reviewLogs.map((log) => [log.dedupeKey, log]));
  const mergedLogs = [...base.reviewLogs];
  for (const log of recall.reviewLogs) {
    const existing = reviewById.get(log.id) ?? reviewByDedupe.get(
      reviewDedupeKey({
        cardId: log.cardId,
        rating: log.rating as UnifiedRating,
        sessionId: null,
        reviewedAt: log.reviewDate,
      }),
    );
    if (existing) continue;
    const converted = fromRecallReviewLog(log);
    if (reviewByDedupe.has(converted.dedupeKey)) continue;
    reviewByDedupe.set(converted.dedupeKey, converted);
    reviewById.set(converted.id, converted);
    mergedLogs.push(converted);
  }

  return mergeUnifiedSnapshots(
    {
      ...base,
      cards: [...mergedCards, ...archivedCards],
      decks: mergedDecks.length ? mergedDecks : base.decks,
      reviewLogs: mergedLogs,
      settings: recallSettingsToUnified(recall.settings, base.settings),
    },
    {
      ...base,
      // The merge helper only needs the incoming side for decks/cards/settings;
      // passing the pruned arrays keeps it from resurrecting archived cards.
      cards: [],
      decks: [],
      reviewLogs: mergedLogs,
      sessions: [],
      tests: [],
      attempts: [],
      savedSearches: base.savedSearches,
    },
  );
}

/** Ratings that count as a "review" for analytics + goal tracking. */
export const COUNTED_RATINGS: ReviewRating[] = ["again", "hard", "good", "easy"];
