export type CompleteAiQuestion = {
  prompt: string;
  options: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
};

/** Keep only complete, distinct four-option MCQs returned by an AI provider. */
export const normalizeCompleteAiQuestions: (
  raw: unknown,
  requestedDifficulty?: string,
) => CompleteAiQuestion[];
