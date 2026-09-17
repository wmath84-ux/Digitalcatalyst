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
export declare const practiceQuestionsReady: (value: unknown) => boolean;
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
