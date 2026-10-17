// src/course/footerScrollAway.ts
//
// "COURSE PLAYER KE ANDAR JAHAN BHI SCROLL HO — FOOTER NAVIGATION KHUD CHHUP
//  JAYE, AUR WAPAS AA JAYE" (owner, 2026-10-17).
//
// The Course Player's footer navigation is a strip of tools at the bottom of
// the stage. Whenever the learner scrolls INSIDE the player — the Resource
// Library's long list, a search results page, a note, the mind map's panel,
// the Paid library — the footer steps out of the way on the way down and
// comes straight back on the way up. The rule is the one the search results
// pages already use (`nextScrollAwayHidden` in ./searchExperience): down
// hides, up shows, and the top always shows.
//
// ── How it watches EVERY scroller ──────────────────────────────────────────
// A scroll event does not bubble, but it DOES travel down the capture phase,
// from the window to the element that moved. One capture-phase listener on
// the window therefore sees every scroll inside the player — whichever pane,
// whichever surface, whichever nested scroller — without touching a single
// panel.
//
// Each scrolling element keeps its own last position, so a list that is
// half-way down and a list that has just been opened never confuse each
// other.

import { useEffect } from "react";
import { setFooterScrolledAway } from "./coursePanelSession";

/** How far down the footer stays away (px) — the same slack the search pages use. */
export const FOOTER_SCROLL_AWAY_PX = 24;

/**
 * The rule, pure and therefore testable without a DOM:
 *
 *   · a scroller seen for the FIRST time (`previous` is null) → the direction
 *     is unknown, so the rule stands by its position: a list that is already
 *     scrolled keeps the footer away (it must never land on top of a long
 *     list), a list at the top keeps it there;
 *   · at (or within `threshold` of) the top → the footer is there;
 *   · travelling down → the footer steps away;
 *   · travelling up → the footer comes back;
 *   · no movement → the answer does not change.
 */
export function nextFooterScrollAway(
  current: boolean,
  top: number,
  previous: number | null,
  threshold = FOOTER_SCROLL_AWAY_PX,
): boolean {
  if (previous === null) return top > threshold;
  if (top <= threshold) return false;
  if (top > previous) return true;
  if (top < previous) return false;
  return current;
}

/** The scroll position of an element, defensively (not every target has one). */
const scrollTopOf = (target: EventTarget | null): number => {
  const element = target as (Element & { scrollTop?: number }) | null;
  const top = element?.scrollTop;
  return typeof top === "number" && Number.isFinite(top) ? top : 0;
};

/**
 * Watch every scroll inside the Course Player and publish the footer's
 * away/answer state.
 *
 * `enabled` is false while the player is not on screen (or on a page that
 * has no footer at all), so the listener never outlives the player.
 */
export function useCourseFooterScrollAway(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) {
      setFooterScrolledAway(false);
      return undefined;
    }
    const view = globalThis.window as (Window & typeof globalThis) | undefined;
    if (!view?.addEventListener) return undefined;

    // Each scroller remembers its own last position.
    const positions = new Map<EventTarget, number>();
    // The scroller that moved last is the one that decides.
    let lastMove: { target: EventTarget; previous: number | null; top: number } | null = null;
    let away = false;
    let queued = false;
    let cancelQueued: (() => void) | null = null;

    const settle = () => {
      queued = false;
      cancelQueued = null;
      const move = lastMove;
      lastMove = null;
      if (!move) return;
      const top = scrollTopOf(move.target);
      const next = nextFooterScrollAway(away, top, move.previous);
      if (next === away) return;
      away = next;
      setFooterScrolledAway(away);
    };

    const onScroll = (event: Event) => {
      const target = event.target;
      if (!target) return;
      const top = scrollTopOf(target);
      // A scroller we have never seen has no direction yet — the rule stands
      // by its position instead.
      const known = positions.get(target);
      const previous = known === undefined ? null : known;
      positions.set(target, top);
      lastMove = { target, previous, top };
      if (queued) return;
      queued = true;
      // One read per frame — `requestAnimationFrame` where it exists, a
      // plain timer where it does not, so the rule never depends on the host
      // having animation frames.
      if (typeof view.requestAnimationFrame === "function") {
        const id = view.requestAnimationFrame(settle);
        cancelQueued = () => view.cancelAnimationFrame(id);
      } else {
        const id = view.setTimeout(settle, 16);
        cancelQueued = () => view.clearTimeout(id);
      }
    };

    view.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      view.removeEventListener("scroll", onScroll, { capture: true });
      if (cancelQueued) cancelQueued();
      positions.clear();
      lastMove = null;
      away = false;
      setFooterScrolledAway(false);
    };
  }, [enabled]);
}
