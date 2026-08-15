// utils/timeOfDay.d.ts
//
// Type surface for the shared My Day time-of-day helpers.

/** Canonical 24-hour "HH:MM", or "" when the value is unusable. */
export declare function to24h(value: unknown): string;

/** Human-facing "4:05 PM". Falls back to the raw string when unparseable. */
export declare function formatTime12(value: unknown): string;

/** Minutes since midnight; -1 when the value is unusable (sorts first). */
export declare function toMinutes(value: unknown): number;

/** Current wall-clock time as "HH:MM", handy as a picker default. */
export declare function nowHHMM(now?: Date): string;
