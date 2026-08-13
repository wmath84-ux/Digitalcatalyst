export const MYDAY_LOOKBACK_MS: number;

export interface ClockTime {
  hours: number;
  minutes: number;
}

export function parseClockTime(value: unknown): ClockTime | null;
export function localDateKey(nowMs: number, tzOffsetMinutes: number): string;
export function dueEpochMs(dateKey: string, clock: ClockTime, tzOffsetMinutes: number): number;

export interface DueMyDayItem {
  key: string;
  kind: "reminder" | "task" | "schedule";
  title: string;
  body: string;
  dueAt: number;
}

export interface MyDayDocData {
  tasks?: unknown[];
  schedule?: unknown[];
  reminders?: unknown[];
  notificationLog?: Record<string, unknown>;
}

export function collectDueMyDayItems(
  data: MyDayDocData,
  nowMs: number,
  tzOffsetMinutes: number,
  lookbackMs?: number,
): DueMyDayItem[];

export interface CourseInventory {
  moduleIds: string[];
  lessonIds: string[];
}

export function flattenCourseInventory(modules: unknown): CourseInventory;

export interface ProductInventoryEntry extends CourseInventory {
  title: string;
  free: boolean;
}

export function buildProductInventoryEntry(product: unknown): ProductInventoryEntry;

export interface DiffResult {
  isBaseline: boolean;
  newProducts: Array<{ id: string } & ProductInventoryEntry>;
  updatedProducts: Array<{ id: string; title: string; newModules: number; newLessons: number }>;
}

export function diffProductInventory(
  previous: { products?: Record<string, ProductInventoryEntry> } | null,
  current: Record<string, ProductInventoryEntry>,
): DiffResult;
