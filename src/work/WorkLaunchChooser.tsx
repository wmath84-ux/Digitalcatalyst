// src/work/WorkLaunchChooser.tsx
//
// The cold-start Home / Work choice, shown as one simple card that follows the
// app's own palette.
//
// Owner brief (2026-10-14):
//
//   "Starting mein user se jaise hi app open ho … ek beautiful card ke andar
//    option do … clean simple design … ek button hoga home ka jis per click
//    karne per normal app open hota hai … aur dusra hoga work."
//   "User ke pass setting mein option bhi hona chahie ki vah app open hote hi
//    yah dekhna chahta hai ki nahin."
//
// The device-local preference lives in `storage/workPrefs.ts`, not the account
// preferences API (Work is explicitly device-only). The chooser is a sibling of
// the hash router, so every first destination — Web landing, installed PWA's
// immediate Home, or the APK's Home — can paint behind the same card. It never
// interrupts a deep link (`#/course/…`, `#/my-day`, a notification target, …).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BriefcaseBusiness, Check, Home, LockKeyhole } from "lucide-react";
import { setWorkLaunchChoice, useWorkLaunchChoice } from "./storage/workPrefs";
import "./work-launch.css";

const WORK_HASH = "#/work";
const HOME_HASH = "#/home";

export const isDefaultLaunchHash = (hash: string): boolean =>
  !hash || hash === "#" || hash === "#/" || hash.startsWith("#/landing") || hash === "#/home";

function launchTarget(choice: "home" | "work") {
  return choice === "work" ? WORK_HASH : HOME_HASH;
}

export default function WorkLaunchChooser() {
  const choice = useWorkLaunchChoice();
  const [hash, setHash] = useState(() => typeof window === "undefined" ? "" : window.location.hash);
  const [remember, setRemember] = useState(false);
  const homeChoiceRef = useRef<HTMLButtonElement | null>(null);
  // The ask-on-launch decision is once per loaded app instance, not once per
  // sessionStorage tab: a full reload/cold start creates a new module instance
  // and asks again, while navigating Home ↔ Work in this app never interrupts.
  const resolvedForThisBoot = useRef(false);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const firstRoute = isDefaultLaunchHash(hash);

  useEffect(() => {
    if (firstRoute && !resolvedForThisBoot.current && choice === "ask") homeChoiceRef.current?.focus();
  }, [choice, firstRoute]);

  // If the learner chose "always open" in Settings, there is no card to wait
  // for: route directly before the background Home/landing finishes painting.
  useEffect(() => {
    if (!firstRoute || resolvedForThisBoot.current || choice === "ask") return;
    resolvedForThisBoot.current = true;
    const target = launchTarget(choice);
    if (window.location.hash !== target) window.location.hash = target;
  }, [choice, firstRoute]);

  if (!firstRoute || resolvedForThisBoot.current || choice !== "ask") return null;

  const setDestination = (destination: "home" | "work") => {
    resolvedForThisBoot.current = true;
    if (remember) setWorkLaunchChoice(destination);
    window.location.hash = launchTarget(destination);
  };

  return createPortal(
    <div className="dc-work-launch-backdrop" data-work-launch-chooser="" role="presentation">
      <section
        className="dc-work-launch-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dc-work-launch-title"
        aria-describedby="dc-work-launch-description"
        data-work-launch-card
      >
        <span className="dc-work-launch-kicker"><span className="dc-work-launch-dot" /> YOUR SPACE, YOUR PACE</span>
        <h1 id="dc-work-launch-title">Where would you like to begin?</h1>
        <p id="dc-work-launch-description">Choose your learning space. You can switch any time.</p>

        <div className="dc-work-launch-choices">
          <button ref={homeChoiceRef} type="button" className="dc-work-launch-choice dc-work-launch-choice--home" onClick={() => setDestination("home")}>
            <span className="dc-work-launch-icon"><Home size={22} aria-hidden="true" /></span>
            <span className="dc-work-launch-copy"><strong>Home</strong><small>Courses, store &amp; your day</small></span>
            <ArrowRight className="dc-work-launch-arrow" size={17} aria-hidden="true" />
          </button>
          <button type="button" className="dc-work-launch-choice dc-work-launch-choice--work" onClick={() => setDestination("work")}>
            <span className="dc-work-launch-icon"><BriefcaseBusiness size={22} aria-hidden="true" /></span>
            <span className="dc-work-launch-copy"><strong>Work</strong><small>My Day, Notes, Mind map &amp; more</small></span>
            <ArrowRight className="dc-work-launch-arrow" size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="dc-work-launch-footer">
          <span className="dc-work-launch-private"><LockKeyhole size={13} aria-hidden="true" /> Work is saved only on this device</span>
          <label className="dc-work-launch-remember">
            <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.currentTarget.checked)} />
            <span className="dc-work-launch-checkbox" aria-hidden="true">{remember ? <Check size={11} /> : null}</span>
            Remember this device
          </label>
        </div>
      </section>
    </div>,
    document.body,
  );
}
