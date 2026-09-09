import { useEffect, type RefObject } from "react";
import { rafCoalesce } from "./perf";

/* ─────────────────────────────────────────────────────────────
   MOBILE KEYBOARD / VIEWPORT SYSTEM
   Distinguishes three things browsers conflate:

     · layout viewport  — what 100vh measures (wrong when keyboard opens)
     · visual viewport  — what the user can actually see right now
     · keyboard inset   — layout height minus visual height/offset

   Publishes them as CSS custom properties so LAYOUT IS DONE IN CSS.
   No React state, no re-render on keyboard open — the shell resizes
   through custom properties alone, which also keeps the course-player
   split panel and narrow AI panel cheap.
   ───────────────────────────────────────────────────────────── */

export function useViewportKeyboard(hostRef?: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const host =
      hostRef?.current
      ?? (document.querySelector(".lumen-root") as HTMLElement | null);
    if (!host) return;
    const vv = window.visualViewport;

    const apply = rafCoalesce(() => {
      // Visible height: prefer the visual viewport, fall back to layout.
      const layoutH = window.innerHeight;
      const visualH = vv?.height ?? layoutH;
      const offsetTop = vv?.offsetTop ?? 0;

      // Keyboard inset = the part of the layout viewport the keyboard
      // (or any browser chrome) is covering. Never hardcoded.
      const inset = Math.max(0, Math.round(layoutH - visualH - offsetTop));

      // Do NOT set --app-h to the visual viewport: the chat fills the
      // Course Player pane (`height: 100%`), not the browser window.
      host.style.setProperty("--kb-inset", `${inset}px`);
      host.style.setProperty("--vv-offset", `${Math.round(offsetTop)}px`);
      host.classList.toggle("kb-open", inset > 120);
    });

    apply();

    if (vv) {
      vv.addEventListener("resize", apply);
      vv.addEventListener("scroll", apply);
    }
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);

    return () => {
      if (vv) {
        vv.removeEventListener("resize", apply);
        vv.removeEventListener("scroll", apply);
      }
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      host.classList.remove("kb-open");
      host.style.removeProperty("--kb-inset");
      host.style.removeProperty("--vv-offset");
    };
  }, [hostRef]);
}

/**
 * Keeps the caret visible when the keyboard opens over the composer.
 * Scrolls the *chat container*, never the page — so there is no
 * scroll-to-top jump and no nested-scroll fight with the body.
 */
export function useKeepInputVisible(inputRef: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const vv = window.visualViewport;
    if (!vv) return;

    let raf = 0;
    const ensureVisible = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const bottomLimit = vv.height + vv.offsetTop;
        // Only nudge when actually occluded — avoids gratuitous scrolling.
        if (rect.bottom > bottomLimit - 8) {
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      });
    };

    const onFocus = () => window.setTimeout(ensureVisible, 60); // after the keyboard animates
    el.addEventListener("focus", onFocus);
    vv.addEventListener("resize", ensureVisible);

    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("focus", onFocus);
      vv.removeEventListener("resize", ensureVisible);
    };
  }, [inputRef]);
}
