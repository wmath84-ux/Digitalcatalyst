export const FLOWPATH_LOOKBACK_MS: number;
export const FLOWPATH_MAX_CATCHUP_MS: number;
export const FLOWPATH_UPCOMING_HORIZON_MS: number;

export interface DueFlowPathItem {
  key: string;
  kind: string;
  /** The FlowPath activity id that fired. */
  itemId: string;
  title: string;
  body: string;
  dueAt: number;
}

/** A FlowPath activity document (subset of fields the scheduler reads). */
export interface FlowPathSchedulableItem {
  id: string;
  kind?: string;
  title?: string;
  description?: string;
  /** epoch ms in UTC. null = "no scheduled time". */
  scheduledFor?: number | null;
  status?: string;
  taskSubject?: string;
  scheduleStartTime?: string;
  reminderTime?: string;
}

export function collectDueFlowPathItems(
  items: FlowPathSchedulableItem[],
  nowMs: number,
  tzOffsetMinutes: number,
  notificationLog?: Record<string, unknown>,
  lookbackMs?: number,
): DueFlowPathItem[];

export function collectUpcomingFlowPathItems(
  items: FlowPathSchedulableItem[],
  nowMs: number,
  tzOffsetMinutes: number,
  notificationLog?: Record<string, unknown>,
  horizonMs?: number,
): DueFlowPathItem[];
