export interface CurveConfig {
  /** Horizontal curve amplitude (px). */
  amplitude: number;
  /** Higher value = tighter curves along the vertical axis. */
  frequency: number;
  /** Distance between each row in pixels. */
  rowSpacing: number;
  /** Random-ish organic offset applied per row. */
  organic: number;
}

export const DEFAULT_CURVE: CurveConfig = {
  amplitude: 1,
  frequency: 0.78,
  rowSpacing: 1,
  organic: 0.5,
};

export interface CurveOverride {
  /** 0..1 multiplier applied to the responsive baseline amplitude. */
  amplitude: number;
  /** 0.3..2.0 frequency factor applied to the baseline frequency. */
  frequency: number;
  /** 0.6..1.6 multiplier applied to the baseline row spacing. */
  spacing: number;
}

export const DEFAULT_CURVE_OVERRIDE: CurveOverride = {
  amplitude: 1,
  frequency: 1,
  spacing: 1,
};
