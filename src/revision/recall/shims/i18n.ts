/**
 * Recall i18n shim — Digitalcatalyst port.
 *
 * Recall boots `i18next` + `react-i18next` + a browser language detector. The
 * Revision chunk is lazy-loaded and must not pull a second i18n runtime into the
 * app, so this module implements the exact subset of the i18next /
 * react-i18next API that Recall actually uses:
 *
 *   useTranslation()                  -> { t, i18n }
 *   i18n.language                     -> current language tag
 *   i18n.changeLanguage(lng)          -> switch + persist + notify listeners
 *   i18n.on("languageChanged", cb)    -> subscribe
 *   i18n.t(key, options)              -> translate outside React
 *   initReactI18next                  -> no-op plugin object (upstream's
 *                                        `lib/i18n.ts` `.use(initReactI18next)`)
 *
 * Translation resources are Recall's own `locales/en.json` and
 * `locales/id.json`, ported unchanged (see THIRD_PARTY_NOTICES.md).
 *
 * Interpolation (`{{name}}`), i18next-style plurals (`key_one` / `key_other`
 * via `count`) and the "fallback string as the second argument" overload are all
 * supported, because the ported components rely on each of them.
 */

import { useEffect, useState } from "react";

import en from "../locales/en.json";
import id from "../locales/id.json";

type ResourceTree = { [key: string]: string | ResourceTree };

const RESOURCES: Record<string, ResourceTree> = {
  en: en as ResourceTree,
  id: id as ResourceTree,
};

const STORAGE_KEY = "recall.language";
const SUPPORTED = Object.keys(RESOURCES);

function detectLanguage(): string {
  if (typeof window === "undefined") return "en";
  try {
    const cached = window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem("i18nextLng");
    if (cached && SUPPORTED.includes(cached)) return cached;
  } catch {
    /* storage can be unavailable in a private window */
  }
  const navigatorLanguage = window.navigator?.language?.split("-")[0] ?? "en";
  return SUPPORTED.includes(navigatorLanguage) ? navigatorLanguage : "en";
}

function lookup(tree: ResourceTree | undefined, key: string): string | undefined {
  if (!tree) return undefined;
  let node: string | ResourceTree | undefined = tree;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string") return undefined;
    node = node[part];
  }
  return typeof node === "string" ? node : undefined;
}

export type TranslationOptions = Record<string, unknown> & { count?: number; defaultValue?: string };

/** i18next also accepts a fallback string as the whole second argument. */
export type TranslateArgs = TranslationOptions | string;

function asOptions(args?: TranslateArgs): TranslationOptions | undefined {
  if (args === undefined) return undefined;
  return typeof args === "string" ? { defaultValue: args } : args;
}

function interpolate(template: string, options?: TranslationOptions): string {
  if (!options) return template;
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, name: string) => {
    const value = options[name];
    return value === undefined || value === null ? "" : String(value);
  });
}

type LanguageChangedListener = (language: string) => void;

let language = detectLanguage();
const listeners = new Set<LanguageChangedListener>();

function translate(key: string, args?: TranslateArgs): string {
  const options = asOptions(args);
  const tree = RESOURCES[language] ?? RESOURCES.en;

  // i18next plurals: `count` selects `key_one` / `key_other`.
  if (options?.count !== undefined) {
    const suffix = options.count === 1 ? "_one" : "_other";
    const plural = lookup(tree, `${key}${suffix}`);
    if (plural !== undefined) return interpolate(plural, options);
  }

  const value = lookup(tree, key) ?? lookup(RESOURCES.en, key);
  if (value === undefined) {
    if (typeof options?.defaultValue === "string") return interpolate(options.defaultValue, options);
    // Never render a raw key at the learner: a missing string is a build-time
    // concern, and the human-readable fallback keeps the UI intact.
    return typeof args === "string" ? args : key;
  }
  return interpolate(value, options);
}

function applyDocumentLanguage(next: string): void {
  if (typeof document !== "undefined") document.documentElement.lang = next;
}

export interface RecallI18n {
  language: string;
  t: (key: string, args?: TranslateArgs) => string;
  changeLanguage: (next: string) => Promise<void>;
  on: (event: "languageChanged", listener: LanguageChangedListener) => void;
  off: (event: "languageChanged", listener: LanguageChangedListener) => void;
  use: (plugin: unknown) => RecallI18n;
  init: (options?: unknown) => Promise<void>;
  resolvedLanguage: string;
}

const i18n: RecallI18n = {
  get language() {
    return language;
  },
  get resolvedLanguage() {
    return language;
  },
  t: translate,
  async changeLanguage(next: string) {
    const target = SUPPORTED.includes(next) ? next : "en";
    if (target === language) return;
    language = target;
    try {
      window.localStorage.setItem(STORAGE_KEY, target);
      window.localStorage.setItem("i18nextLng", target);
    } catch {
      /* ignore */
    }
    applyDocumentLanguage(target);
    listeners.forEach((listener) => listener(target));
  },
  on(event, listener) {
    if (event === "languageChanged") listeners.add(listener);
  },
  off(event, listener) {
    if (event === "languageChanged") listeners.delete(listener);
  },
  use() {
    // Upstream chains `.use(LanguageDetector).use(initReactI18next)`; language
    // detection and the React binding are already built in.
    return i18n;
  },
  async init() {
    applyDocumentLanguage(language);
  },
};

applyDocumentLanguage(language);

/** react-i18next plugin object — a no-op because the binding is native here. */
export const initReactI18next = { type: "3rdParty", init: () => undefined };

export interface TranslationResult {
  t: (key: string, args?: TranslateArgs) => string;
  i18n: RecallI18n;
  ready: boolean;
}

export function useTranslation(): TranslationResult {
  const [current, setCurrent] = useState(language);

  useEffect(() => {
    const listener: LanguageChangedListener = (next) => setCurrent(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return {
    t: (key, args) => {
      // Reading `current` keeps the component subscribed to language changes.
      void current;
      return translate(key, args);
    },
    i18n,
    ready: true,
  };
}

export default i18n;
