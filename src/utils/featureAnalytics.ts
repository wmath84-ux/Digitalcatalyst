// src/utils/featureAnalytics.ts
//
// Fire-and-forget product analytics for the Course Player's My Modules flow.
//
// The app's Firebase config carries a Google Analytics measurementId but no
// screen currently initialises the SDK, and there is no other analytics
// convention in the codebase — so this helper is deliberately tiny and safe:
//
//   · It lazily initialises `firebase/analytics` the FIRST time an event is
//     tracked (dynamic import + `isSupported()`), so Node tests and browsers
//     without the module never crash, never log, never block.
//   · Every call is voided: tracking can never fail a user action, delay it,
//     or surface an error UI.
//   · Event names follow the requested `personal_*` snake_case convention so
//     Study Library, module, save/move and Course Player actions group cleanly.
//
// The helper is imported by the My Modules UI only; official course content
// flows are untouched.

const ANALYTICS_EVENT_PREFIX = "personal";

type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

type AnalyticsLike = {
  logEvent: (analytics: unknown, eventName: string, params?: unknown) => void;
  getAnalytics: (app: unknown) => unknown;
  isSupported: () => Promise<boolean>;
};

let holder: { analytics: AnalyticsLike; app: unknown } | null = null;
let loading: Promise<{ analytics: AnalyticsLike; app: unknown } | null> | null = null;

const loadAnalytics = (): Promise<{ analytics: AnalyticsLike; app: unknown } | null> => {
  if (holder) return Promise.resolve(holder);
  if (!loading) {
    loading = Promise.all([
      import("firebase/analytics"),
      import("firebase/app"),
    ])
      .then(async ([analytics, appModule]) => {
        try {
          const supported = await analytics.isSupported();
          if (!supported) return null;
          const app = appModule.getApps()[0];
          if (!app) return null;
          holder = { analytics: analytics as AnalyticsLike, app };
          return holder;
        } catch {
          return null;
        }
      })
      .catch(() => null);
  }
  return loading;
};

/**
 * Track one lightweight product event (e.g. "module_created"). No-op until a
 * supported Analytics build is present; never throws.
 */
export const trackFeatureEvent = (eventName: string, params?: AnalyticsParams) => {
  if (!eventName) return;
  const fullName = `${ANALYTICS_EVENT_PREFIX}_${eventName.replace(/^personal_(?:course_)?/i, "")}`;
  void loadAnalytics().then((loaded) => {
    if (!loaded) return;
    try {
      loaded.analytics.logEvent(loaded.analytics.getAnalytics(loaded.app), fullName, params);
    } catch {
      // Tracking is best-effort — never surface.
    }
  });
};
