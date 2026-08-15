// utils/renewalPresentation.d.ts

export type RenewalTone = "info" | "warning" | "critical";

export interface RenewalStagePresentation {
  urgency: number;
  tone: RenewalTone;
  icon: string;
  label: string;
  headline: string;
  cta: string;
  dismissible: boolean;
}

export interface RenewalView {
  stage: string;
  urgency: number;
  tone: RenewalTone;
  icon: string;
  label: string;
  headline: string;
  body: string;
  cta: string;
  dismissible: boolean;
  expired: boolean;
  expiresAt: number;
  daysRemaining: number;
  remainingLabel: string;
  expiryLabel: string;
  planName: string;
  target: { type: "subscription" };
}

export declare const RENEWAL_STAGE_PRESENTATION: Record<string, RenewalStagePresentation>;
export declare const TONE_ORDER: RenewalTone[];
export declare const toMillis: (value: unknown) => number;
export declare const daysUntil: (expiresAt: unknown, now?: number) => number;
export declare const formatRemaining: (expiresAt: unknown, now?: number) => string;
export declare const formatExpiryDate: (expiresAt: unknown) => string;
export declare const buildRenewalView: (
  reminder: unknown,
  options?: { now?: number; planName?: string },
) => RenewalView | null;
export declare const shouldShowRenewalBanner: (
  view: RenewalView | null,
  dismissedStages?: string[],
) => boolean;

declare const _default: typeof buildRenewalView;
export default _default;
