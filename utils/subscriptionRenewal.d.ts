export interface RenewalReminder { id: string; stage: string; title: string; body: string; expiresAt: number; createdAt: number; target: { type: "subscription" } }
export declare const RENEWAL_REMINDER_STAGES: Array<{ id: string; minDays: number; maxDays: number; title: string }>;
export declare const toMillis: (value: unknown) => number;
export declare const getRenewalReminder: (subscription: Record<string, unknown> | null | undefined, now?: number) => RenewalReminder | null;
export declare const getRenewalBaseTime: (existingExpiresAt: unknown, now?: number) => number;
