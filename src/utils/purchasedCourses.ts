export interface PersistedPurchasedCourse {
  id: string;
  title: string;
  type: "Course" | "PDF" | "Ebook";
  emoji: string;
  progress: number;
  purchasedAt: number;
}

const PURCHASED_COURSES_KEY = "eduvora_purchased_courses";

export function loadPurchasedCourses(): PersistedPurchasedCourse[] {
  try {
    const value = localStorage.getItem(PURCHASED_COURSES_KEY);
    if (!value) return [];
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePurchasedCourse(course: PersistedPurchasedCourse) {
  const existing = loadPurchasedCourses();
  const next = [course, ...existing.filter((item) => item.id !== course.id)];
  localStorage.setItem(PURCHASED_COURSES_KEY, JSON.stringify(next));
}
