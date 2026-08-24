export type CompleteAiQuestion = {
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  /**
   * Model-declared question style, preserved for the deterministic
   * question-type guard. Only present when the provider tagged the question.
   */
  type?: "theory" | "application";
};

/** Keep only complete, distinct four-option MCQs returned by an AI provider. */
export const normalizeCompleteAiQuestions: (
  raw: unknown,
  requestedDifficulty?: string,
) => CompleteAiQuestion[];
