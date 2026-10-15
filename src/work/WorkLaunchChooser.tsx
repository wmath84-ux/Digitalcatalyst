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
//
// Owner report (2026-10-15): on the APK / installed PWA the card never went
// away — Home opened UNDERNEATH it and the card's own backdrop kept swallowing
// every tap on Home. Root cause and fix are documented on
// `answeredForThisBoot` and `dismissOpeningOverlay` below.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BriefcaseBusiness, Check, Home, LockKeyhole } from "lucide-react";
import { attachOpeningSplash, isOpeningVisible } from "@/utils/openingSplash";
import { setWorkLaunchChoice, useWorkLaunchChoice } from "./storage/workPrefs";
import "./work-launch.css";

const WORK_HASH = "#/work";
const HOME_HASH = "#/home";

export const isDefaultLaunchHash = (hash: string): boolean =>
  !hash || hash === "#" || hash === "#/" || hash.startsWith("#/landing") || hash === "#/home";

function launchTarget(choice: "home" | "work") {
  return choice === "work" ? WORK_HASH : HOME_HASH;
}

/**
 * The answer to this card is a hand-over: the learner has said which space to
 * open, so a launch opening that is on screen RIGHT NOW must finish. It is the
 * other half of the startup pair (the card paints UNDER it by design, and the
 * splash owns the whole viewport at the same stacking level), and it would
 * otherwise eat the taps that come after the card closes.
 *
 * The splash has exactly one owner — `src/utils/openingSplash.ts` — so we ASK
 * it to release (it fades out and marks itself done) instead of hiding its
 * element behind its back, the mistake `OfflineGate` already documents.
 * `isOpeningVisible()` keeps a boot that has already decided NOT to show the
 * clip (tap-only default, reduced-motion card, offline, `?opening=off`)
 * completely untouched: nothing is replayed, nothing is fetched, and the
 * "skipped" state that the offline rescue keys off never changes.
 */
function dismissOpeningOverlay(): void {
  const opening = attachOpeningSplash();
  if (opening && isOpeningVisible(opening.state)) opening.dismiss();
}

export default function WorkLaunchChooser() {
  const choice = useWorkLaunchChoice();
  const [hash, setHash] = useState(() => typeof window === "undefined" ? "" : window.location.hash);
  const [remember, setRemember] = useState(false);
  const homeChoiceRef = useRef<HTMLButtonElement | null>(null);
  // The ask-on-launch decision is once per loaded app instance, not once per
  // sessionStorage tab: a full reload/cold start mounts the module again and
  // asks again, while navigating Home ↔ Work in this app never interrupts.
  //
  // It has to be STATE, not a ref. An installed PWA and the APK boot on an
  // EMPTY hash and `RootPage` normalises that to `#/home` with
  // `history.replaceState`, which raises no `hashchange` — so the URL can read
  // `#/home` while this component's `hash` snapshot still says "". The ref
  // version therefore opened the app on the default route (Home) with the card
  // and its full-screen backdrop still mounted ON TOP of it, and answering the
  // card changed nothing that React could see: the backdrop swallowed every tap
  // on Home, and the card only disappeared on a later navigation that happened
  // to raise `hashchange`. As state, the answer re-renders the portal away —
  // the actual open/closed state, not a cosmetic hide.
  const [answeredForThisBoot, setAnsweredForThisBoot] = useState(false);

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const firstRoute = isDefaultLaunchHash(hash);
  /** The startup question is still live: on a first route, not yet answered. */
  const askPending = firstRoute && !answeredForThisBoot;
  /** …and this boot still has something to ask (`ask`; the Settings answers skip it). */
  const asking = askPending && choice === "ask";

  useEffect(() => {
    if (asking) homeChoiceRef.current?.focus();
  }, [asking]);

  // If the learner chose "always open" in Settings, there is no card to wait
  // for: route directly before the background Home/landing finishes painting.
  // The answer is recorded first, so the card never paints over the destination
  // this boot was told to use.
  useEffect(() => {
    if (choice === "ask" || !askPending) return;
    setAnsweredForThisBoot(true);
    dismissOpeningOverlay();
    const target = launchTarget(choice);
    if (window.location.hash !== target) window.location.hash = target;
  }, [choice, askPending]);

  const setDestination = (destination: "home" | "work") => {
    setAnsweredForThisBoot(true);
    dismissOpeningOverlay();
    if (remember) setWorkLaunchChoice(destination);
    // Home is frequently the route the app is ALREADY on (the APK's normalised
    // boot). Re-assigning the same hash raises no `hashchange` and would be a
    // no-op — the state above is what closes the card and unblocks Home, so a
    // tap on Home always lands on Home.
    const target = launchTarget(destination);
    if (window.location.hash !== target) window.location.hash = target;
  };

  // Nothing of this startup pair may outlive the answer: the backdrop and the
  // card are children of one portal, so unmounting it is what closes them.
  if (!asking) return null;

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
