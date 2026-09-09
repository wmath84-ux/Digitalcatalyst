// src/ai/types.ts
//
// One import surface for the AI Study Engine's types. The artifact shapes come
// from the shared pure layer (`utils/personalAi`) — the same normalisers the
// server runs — so the browser and the API can never disagree about what a
// summary, question set, flashcard deck or study plan looks like.

export type {
  PersonalAiAnswer,
  PersonalAiChunk,
  PersonalAiCoverage,
  PersonalAiExplanation,
  PersonalAiFailure,
  PersonalAiFlashcard,
  PersonalAiFlashcardSet as PersonalAiFlashcards,
  PersonalAiOrientation,
  PersonalAiPlan,
  PersonalAiProvenance,
  PersonalAiQuestion,
  PersonalAiQuestionSet as PersonalAiQuestions,
  PersonalAiQuestionType,
  PersonalAiSource,
  PersonalAiState,
  PersonalAiSummary,
  PersonalAiUnit,
  PersonalAiWeakTopic,
} from "../../utils/personalAi";

export type {
  PersonalAiAllowance,
  PersonalAiAnswerResult,
  PersonalAiArtifactMeta,
  PersonalAiEvidenceEvent,
  PersonalAiEvidenceKind,
  PersonalAiGenerationKind,
  PersonalAiGenerationResult,
  PersonalAiNoteInput,
  PersonalAiResourceAvailability,
  PersonalAiStateSnapshot,
  PersonalAiThreadMessage,
} from "../types/personalAi";
