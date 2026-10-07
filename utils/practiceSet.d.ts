export type PracticeQuestionDifficulty = "easy" | "medium" | "hard";

export type NormalizedPracticeQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: PracticeQuestionDifficulty;
  topic: string;
};

export declare const MAX_PRACTICE_QUESTIONS: number;
export declare const MIN_PRACTICE_OPTIONS: number;
export declare const MAX_PRACTICE_OPTIONS: number;
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
