export interface RenewalReminder {
  id: string;
  stage: string;
  title: string;
  body: string;
  expiresAt: number;
  createdAt: number;
  expired: boolean;
  day?: number;
  planName?: string;
  target: { type: "subscription" };
}

/** Consecutive mornings after expiry that we keep notifying (daily). */
export declare const POST_EXPIRY_REMINDER_DAYS: number;
export declare const RENEWAL_REMINDER_STAGES: Array<{ id: string; minDays: number; maxDays: number; title: string }>;
export declare const toMillis: (value: unknown) => number;
export declare const getExpiredDayNumber: (expiresAt: unknown, now?: number) => number;
export declare const getRenewalReminder: (subscription: Record<string, unknown> | null | undefined, now?: number) => RenewalReminder | null;
export declare const getRenewalNotification: (subscription: Record<string, unknown> | null | undefined, now?: number) => RenewalReminder | null;
export declare const getRenewalBaseTime: (existingExpiresAt: unknown, now?: number) => number;
