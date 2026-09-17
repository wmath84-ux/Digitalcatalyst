// src/course/ModuleFolderBurst.tsx
//
// The Uiverse.io "Card" by byllzz (https://uiverse.io/byllzz/great-wombat-13,
// MIT licence) installed on the Course Player's Module dock button.
//
// The owner's direction, exactly:
//   · the EXISTING dock button is NOT removed or restyled — it stays as-is;
//   · only on CLICK does the uiverse folder-card appear (in its closed,
//     icon form — the element's own default design) and animate exactly the
//     way it does on uiverse.io: hint fades, the 3D folder tilts open, the
//     front flap folds down, the five files fan out, the FILES·05 counter
//     pops, the search pill rises and the shine sweeps;
//   · once the Module pane has opened underneath, the animation runs its
//     FULL length (every transition the element defines, open + hold), then
//     closes back into the closed-folder icon form and unmounts.
//
// Mechanics: this layer listens (capture) for pointerup/click on any
// `[data-course-dock-tab][data-tab="modules"]` button — that one selector
// covers the study-pane footer dock AND the bottom-centre peek dock, both
// render their tabs through buildDockItems (src/course/CourseOverlay.tsx).
// The card is driven by the element's own checkbox (`folder-toggle:checked`
// = the open state), so every timing/curve is the stylesheet's, not JS.
// The whole overlay is pointer-events:none — it is pure decoration; the tap
// belongs to the dock button underneath, whose normal behaviour (tab switch
// → Module pane opens) is untouched.

import { useCallback, useEffect, useRef, useState } from "react";
import "./uiverse-folder-card.css";

/** The card's exact uiverse footprint (px). */
const CARD_W = 170;

/**
 * How long the OPEN state is held, ms. The element's longest open chain is
 * the shine (0.3s delay + 0.8s sweep = 1.1s); files/counter/search finish by
 * ~0.75s. Holding 2.6s lets the whole animation play out AND keeps the open
 * folder on screen (pulsing counter, floating search) for a beat after the
 * Module pane has opened underneath — then the close begins.
 */
const OPEN_HOLD_MS = 2600;

/**
 * The close (back to icon form) unmounts after its longest chain: files
 * (0.15s delay + 0.6s) = 0.75s, container 0.6s, front flap 0.5s → 1s clears
 * every reverse transition.
 */
const CLOSE_MS = 1000;

type Phase = "idle" | "mount" | "open" | "closing";

interface Anchor {
  left: number;
  bottom: number;
}

export default function ModuleFolderBurst() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [anchor, setAnchor] = useState<Anchor>({ left: 0, bottom: 0 });
  // Guards against the pointerup+click double-fire of one tap, and against
  // re-triggering while a burst is already playing.
  const busyRef = useRef(false);
  const mountFrameRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    window.clearTimeout(mountFrameRef.current);
    for (const id of timersRef.current) window.clearTimeout(id);
    timersRef.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const fire = useCallback(
    (button: HTMLButtonElement) => {
      if (busyRef.current) return;
      const rect = button.getBoundingClientRect();
      // A collapsed (hidden) dock — e.g. behind the soft keyboard — has no
      // anchor; the burst would flash in a corner, so skip it.
      if (rect.width === 0 && rect.height === 0) return;

      // Anchor the card just above the tapped button, centred on it and
      // clamped so the card AND its FILES counter stay on screen.
      const vw = window.innerWidth;
      const maxLeft = Math.max(8, vw - CARD_W - 82);
      const left = Math.min(Math.max(rect.left + rect.width / 2 - CARD_W / 2, 8), maxLeft);
      const bottom = Math.max(10, window.innerHeight - rect.top + 10);

      busyRef.current = true;
      setAnchor({ left, bottom });
      setPhase("mount");

      // Double rAF: commit the closed (icon-form) card first, so flipping
      // `folder-toggle` to checked next frame starts the element's own open
      // transitions from it — the exact uiverse click sequence.
      mountFrameRef.current = window.requestAnimationFrame(() => {
        mountFrameRef.current = window.requestAnimationFrame(() => {
          setPhase("open");
          timersRef.current.push(
            window.setTimeout(() => setPhase("closing"), OPEN_HOLD_MS),
            window.setTimeout(() => {
              setPhase("idle");
              busyRef.current = false;
            }, OPEN_HOLD_MS + CLOSE_MS),
          );
        });
      });
    },
    [],
  );

  useEffect(() => {
    const onActivate = (event: Event) => {
      // Primary button only — a right-click release on the tab is not a
      // "open the module" click.
      if (event instanceof PointerEvent && event.button !== 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest<HTMLButtonElement>('[data-course-dock-tab][data-tab="modules"]');
      if (!button) return;
      fire(button);
    };
    // Capture: the docks stop some clicks (release-to-select swallows click
    // after pointerup), but nothing suppresses the events themselves before
    // they reach document in the capture phase. pointerup covers mouse AND
    // touch; the dedupe in fire() folds the follow-up click in; a keyboard
    // activation (Enter on the focused tab) arrives as a bare click.
    document.addEventListener("pointerup", onActivate, true);
    document.addEventListener("click", onActivate, true);
    return () => {
      document.removeEventListener("pointerup", onActivate, true);
      document.removeEventListener("click", onActivate, true);
    };
  }, [fire]);

  if (phase === "idle") return null;

  // The markup below is the uiverse element's HTML, verbatim
  // (https://uiverse.io/byllzz/great-wombat-13 — MIT). The checkbox's
  // checked state IS the folder's open state; React drives it through the
  // phase machine above, the stylesheet does every transition.
  return (
    <div
      className="uiverse-folder-burst"
      style={{ left: anchor.left, bottom: anchor.bottom }}
      data-module-folder-burst={phase}
      aria-hidden="true"
    >
      <label className="folder-card">
        <input type="checkbox" className="folder-toggle" checked={phase === "open"} readOnly tabIndex={-1} />

        <div className="hint-wrapper">
          <span className="hint-text">Click to open</span>
          <svg className="hint-arrow" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M 35 5 C 35 5, 15 5, 10 25 M 10 25 L 3 18 M 10 25 L 18 22"
              stroke="#60a5fa"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="folder-container">
          <svg className="folder-back" viewBox="0 0 50 40" fill="none">
            <path
              d="M0 4C0 1.79086 1.79086 0 4 0H16.524C17.721 0 18.8415 0.54051 19.574 1.4673L22.426 5.0654C23.1585 5.99219 24.279 6.5327 25.476 6.5327H46C48.2091 6.5327 50 8.32356 50 10.5327V36C50 38.2091 48.2091 40 46 40H4C1.79086 40 0 38.2091 0 36V4Z"
              fill="#0056b3"
            />
          </svg>

          <div className="folder-search">
            <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" placeholder="Search files..." className="search-input" tabIndex={-1} readOnly />
          </div>

          <div className="file file-5">
            <div className="shine" />
            <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <div className="file-text">Hero_BG.png</div>
            <div className="file-tag">PNG • 4.2 MB</div>
          </div>

          <div className="file file-4">
            <div className="shine" />
            <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="23 7 16 12 23 17 23 7" />
              <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
            </svg>
            <div className="file-text">Promo_Cut.mp4</div>
            <div className="file-tag">MP4 • 128 MB</div>
          </div>

          <div className="file file-3">
            <div className="shine" />
            <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <div className="file-text">app_config.json</div>
            <div className="file-tag">JSON • 12 KB</div>
          </div>

          <div className="file file-2">
            <div className="shine" />
            <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <div className="file-text">Q3_Report.pdf</div>
            <div className="file-tag">PDF • 1.1 MB</div>
          </div>

          <div className="file file-1">
            <div className="shine" />
            <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
            <div className="file-text">Pitch_Deck.pptx</div>
            <div className="file-tag">PPTX • 8.4 MB</div>
          </div>

          <div className="folder-front-wrapper">
            <svg className="folder-front" viewBox="0 0 50 34" fill="none">
              <path
                d="M0 4C0 1.79086 1.79086 0 4 0H46C48.2091 0 50 1.79086 50 4V30C50 32.2091 48.2091 34 46 34H4C1.79086 34 0 32.2091 0 30V4Z"
                fill="rgba(0, 123, 255, 0.65)"
              />
            </svg>
            <div className="folder-label" />
            <div className="counter">
              <div className="status-dot" />
              <span className="counter-label">FILES</span>
              <span className="counter-number">05</span>
            </div>
          </div>
        </div>
      </label>
    </div>
  );
}
