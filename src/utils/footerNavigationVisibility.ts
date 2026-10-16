// src/utils/footerNavigationVisibility.ts
//
// THE SETTINGS CHOICE THAT DECIDES WHETHER THE FOOTER RULE APPLIES AT ALL.
//
// Owner brief (2026-10-16), Settings → Footer navigation:
//
//   "Do option add karo: 'Visible footer navigation always' aur 'Visible footer
//    navigation accordingly' — aur neeche ek chhota sa instruction line English
//    mein ki footer navigation kab kab nahin dikhega."
//
//   · "always"       — the footer navigation is shown on every page of the app,
//                      whatever the page is doing (editors, answer decks,
//                      players, search pages…). It still steps aside for the
//                      on-screen keyboard, which is a physical overlap rather
//                      than a page rule: the footer is measured against it and
//                      would otherwise sit under the learner's keys.
//   · "accordingly"  — the Course Player's own rule decides page by page (see
//                      `isFooterHiddenPage` in src/course/coursePanelSession.ts).
//
// The default is "accordingly", i.e. today's behaviour, so an existing learner
// sees no change until they ask for one. Stored on the device exactly like the
// footer STYLE (./footerNavigationStyle.ts): same event, same storage guard,
// same `useSyncExternalStore` hook — so every mounted footer reacts the moment
// the choice is made, with no reload and no prop drilling.

import { useSyncExternalStore } from "react";

export type FooterNavigationVisibility = "always" | "accordingly";

const STORAGE_KEY = "dc-footer-navigation-visibility";
const CHANGE_EVENT = "dc:footer-navigation-visibility-change";
const DEFAULT_VISIBILITY: FooterNavigationVisibility = "accordingly";

/**
 * The small English instructions the owner asked to sit UNDER the two options:
 * it names, in one line, exactly when the footer navigation is not shown. Kept
 * here (and exported) so the Settings page renders the same sentence the rule
 * implements — and so a test can hold the two together.
 */
export const FOOTER_NAVIGATION_VISIBILITY_NOTE =
  "With “accordingly”, the footer navigation is not shown: while a note, mind map or sketch is open in edit mode " +
  "(reading any of them keeps it); on a Brain answer deck; inside a live experiment; inside a PDF or annotations " +
  "reader; on the Music player or its YouTube player; and on the Resource Library or Music search page. On a search " +
  "results page it is shown, and slides away while you scroll down and returns at the top. It also steps aside for " +
  "the on-screen keyboard. Everything else keeps it visible.";

export function getFooterNavigationVisibility(): FooterNavigationVisibility {
  if (typeof window === "undefined") return DEFAULT_VISIBILITY;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "always" ? "always" : DEFAULT_VISIBILITY;
  } catch {
    return DEFAULT_VISIBILITY;
  }
}

export function setFooterNavigationVisibility(value: FooterNavigationVisibility): void {
  if (typeof window === "undefined") return;
  const next: FooterNavigationVisibility = value === "always" ? "always" : DEFAULT_VISIBILITY;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The in-memory event still updates mounted footers when storage is denied.
  }
  window.dispatchEvent(new window.Event(CHANGE_EVENT));
}

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onChange = () => onStoreChange();
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useFooterNavigationVisibility(): FooterNavigationVisibility {
  return useSyncExternalStore(subscribe, getFooterNavigationVisibility, () => DEFAULT_VISIBILITY);
}

/** The two footer homes read this one: "always" defeats every page rule. */
export function useFooterNavigationAlways(): boolean {
  return useFooterNavigationVisibility() === "always";
}

/*
 * The two footer homes read the pair themselves:
 *   const immersivePage = pageRuleHidesFooter && !useFooterNavigationAlways();
 * — so "always" wins over every page rule by construction, and the keyboard
 * rule stays each home's own layout concern.
 */
