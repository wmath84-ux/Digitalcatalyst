export type PracticeQuestionDifficulty = "easy" | "medium" | "hard";

/** Every question type the Brain page can author, parse and play. */
export type PracticeQuestionType =
  | "mcq"
  | "fill_blank"
  | "label_diagram"
  | "assertion_reason"
  | "one_word"
  | "match"
  | "drag_drop"
  | "hotspot";

export type NormalizedPracticeQuestion = {
  id: string;
  /** Absent on records saved before types existed — those are MCQs. */
  questionType: PracticeQuestionType | (string & {});
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: PracticeQuestionDifficulty;
  topic: string;
  /** fill_blank: accepted answers per blank, aligned with the ___ markers. */
  blankAnswers?: string[][];
  /** one_word: the expected answer plus accepted variants. */
  acceptedAnswers?: string[];
  /** assertion_reason: the two statements (the key is `correctIndex`). */
  assertion?: string;
  reason?: string;
  /** match: the correct Column A → Column B pairs. */
  matchPairs?: Array<{ left: string; right: string }>;
  /** drag_drop: the item pool and the targets with their correct item. */
  dragItems?: string[];
  dragTargets?: Array<{ id: string; label: string; answer: string }>;
  /** label_diagram / hotspot: the image the coordinates belong to. */
  imageUrl?: string;
  /** label_diagram: targets in relative % coordinates with their label. */
  labelTargets?: Array<{ id: string; x: number; y: number; label: string }>;
  labelOptions?: string[];
  /** hotspot: candidate regions in relative % coordinates + the correct ids. */
  hotspots?: Array<{ id: string; x: number; y: number; r: number }>;
  correctHotspotIds?: string[];
};

export declare const MAX_PRACTICE_QUESTIONS: number;
export declare const MIN_PRACTICE_OPTIONS: number;
export declare const MAX_PRACTICE_OPTIONS: number;
export declare const PRACTICE_QUESTION_TYPES: PracticeQuestionType[];
export declare const ASSERTION_REASON_CHOICES: string[];
export declare const countPromptBlanks: (prompt: unknown) => number;
export declare const normalizeAnswerText: (value: unknown) => string;
export declare const normalizePracticeQuestion: (
  raw: unknown,
  index?: number,
) => NormalizedPracticeQuestion | null;
export declare const normalizePracticeQuestions: (value: unknown) => NormalizedPracticeQuestion[];
/** The runtime rule: the Course Player can play the set (a marked answer each). */
export declare const practiceQuestionsReady: (value: unknown) => boolean;
/**
 * The publish rule on top of the runtime one — every question also carries its
 * explanation. `explanation` is never optional in the admin editor.
 */
export declare const practiceQuestionsExplained: (value: unknown) => boolean;
/** Every rule ONE question must satisfy — `[]` means publish-ready. */
export declare const practiceQuestionIssues: (question: unknown) => string[];
/** Could the player score this question right now (its answer key complete)? */
export declare const practiceQuestionAnswerable: (question: unknown) => boolean;
/** Score one learner response: "correct" | "wrong" | "unanswered". */
export declare const evaluatePracticeAnswer: (
  question: unknown,
  response: unknown,
) => "correct" | "wrong" | "unanswered";
/** “Yours / Correct” lines for the review and answers screens, per type. */
export declare const practiceAnswerSummary: (
  question: unknown,
  response: unknown,
) => { yours: string; correct: string };
/** How many questions still need work before publishing (drafts included). */
export declare const countIncompletePracticeQuestions: (value: unknown) => number;
export declare const countUnmarkedPracticeQuestions: (value: unknown) => number;

/** One practice set the learner may open (a `brain` resource in the tree). */
export type BrainPracticeSet = {
  /** The resource id — also the file the Course Player marks complete on a pass. */
  id: string;
  moduleId: string;
  moduleTitle: string;
  title: string;
  questions: NormalizedPracticeQuestion[];
};

export declare const collectBrainPracticeSets: (
  modules: unknown,
  unlockedModuleIds: Set<string> | string[],
) => BrainPracticeSet[];
