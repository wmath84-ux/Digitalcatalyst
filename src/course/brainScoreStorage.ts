export type BrainPracticeScore = {
  attempts: number;
  best: number;
  last: number;
  at: number;
};

export type BrainPracticeScores = Record<string, BrainPracticeScore>;

const COURSE_SCORE_PREFIX = "dc:courseBrain:";
const WORK_SCORE_PREFIX = "work:device:revision-brain-scores:v1:";

export function brainScoreStorageKey(productId: string, workMode = false): string {
  return `${workMode ? WORK_SCORE_PREFIX : COURSE_SCORE_PREFIX}${productId}`;
}

export function loadBrainScores(productId: string, workMode = false): BrainPracticeScores {
  try {
    const raw = localStorage.getItem(brainScoreStorageKey(productId, workMode));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BrainPracticeScores;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveBrainScores(productId: string, scores: BrainPracticeScores, workMode = false): void {
  try {
    localStorage.setItem(brainScoreStorageKey(productId, workMode), JSON.stringify(scores));
  } catch {
    /* private mode / quota — practice continues, but its score history is lost */
  }
}
