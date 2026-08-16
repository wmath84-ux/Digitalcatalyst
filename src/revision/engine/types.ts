export type PlayerQuestion = {
  id: number;
  prompt: string;
  options: string[];
  difficulty: "easy" | "medium" | "hard";
  subjectId: number;
  subjectName: string;
  subjectIcon: string;
  topicId: number;
  topicName: string;
  selectedIndex: number | null;
};

export type ReviewQuestion = {
  id: number;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  subjectName: string;
  subjectIcon: string;
  topicName: string;
  selectedIndex: number | null;
  isCorrect: boolean | null;
  isSkipped: boolean;
};
