/* macOS Web Simulator — vendored root component.
 *
 * Upstream: https://github.com/LikhithSP/MacOS-Web-Simulator `src/App.jsx`
 * (MIT, see ./LICENSE). Every screen, boot stage, app and behaviour is the
 * upstream one. The changes needed to run it as a MODE INSIDE the Digital
 * Catalyst app rather than as the whole page are marked `EMBED:` below and are
 * limited to:
 *
 *   · an `onExit` prop, so the host can close the simulator (the top bar gets
 *     an "Exit Mac mode" item and Esc works from the desktop stage);
 *   · `.dark` is toggled on the simulator's OWN wrapper instead of <html>, so
 *     Mac dark mode cannot repaint the store behind it;
 *   · the right-click suppressor is bound to the wrapper, not `document`, so
 *     the browser context menu still works everywhere else in the app;
 *   · `w-screen h-screen` becomes `fixed inset-0`, because the simulator is
 *     mounted in a portal over the app instead of being the document body;
 *   · localStorage keys are namespaced (`macsim:`) so the simulator's boot
 *     state can never collide with the host app's own keys.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import PowerScreen from "./layouts/PowerScreen";
import LockScreen from "./layouts/LockScreen";
import SetupScreen from "./layouts/SetupScreen";
import RegionScreen from "./layouts/RegionScreen";
import WrittenScreen from "./layouts/WrittenScreen";
import TimezoneScreen from "./layouts/TimezoneScreen";
import DataPrivacyScreen from "./layouts/DataPrivacyScreen";
import CreateAccountScreen from "./layouts/CreateAccountScreen";
import Desktop from "./layouts/DesktopWindow";
import { useAppStore } from "./store/Appstore";
// EMBED: the simulator's own stylesheet, scoped to `.macos-sim-root`. Imported
// from the lazy root so it ships in the Mac-mode chunk rather than the app's
// critical CSS.
import "./macos.css";
import { macStorage } from "./lib/macStorage";

const INACTIVITY_TIMEOUT = 60 * 1000; // 1 minute in milliseconds

export default function MacOSApp({ onExit }) {
  // EMBED: the simulator paints into this element, so `.dark` and the
  // context-menu suppressor are scoped to it.
  const rootRef = useRef(null);
  const [stage, setStage] = useState(null);
  const [skippedSetup, setSkippedSetup] = useState(false);
  const inactivityTimerRef = useRef(null);
  const isDarkMode = useAppStore((s) => s.isDarkMode);

  // EMBED: upstream toggles `.dark` on <html>. Inside the host app that would
  // hand the simulator's theme switch to the entire store, so the class goes
  // on the simulator's own wrapper — `.macos-sim-root.dark` in macos.css
  // resolves the tokens from there.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (isDarkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [isDarkMode, stage]);
  
  // Reset inactivity timer on any user activity
  const resetInactivityTimer = useCallback(() => {
    // Clear existing timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    
    // Only start timer when on desktop (not on power or lock screen)
    if (stage === "desktop") {
      inactivityTimerRef.current = setTimeout(() => {
        setStage("lock");
      }, INACTIVITY_TIMEOUT);
    }
  }, [stage]);
  
  // Set up activity listeners
  useEffect(() => {
    if (stage !== "desktop") {
      // Clear timer when not on desktop
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
      }
      return;
    }
    
    // Activity events to track
    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
      'touchstart',
      'click',
      'wheel'
    ];
    
    // Add listeners for all activity events
    activityEvents.forEach(event => {
      window.addEventListener(event, resetInactivityTimer, { passive: true });
    });
    
    // Start the initial timer
    resetInactivityTimer();
    
    return () => {
      // Clean up listeners
      activityEvents.forEach(event => {
        window.removeEventListener(event, resetInactivityTimer);
      });
      
      // Clear timer on unmount
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [stage, resetInactivityTimer]);
 
  useEffect(() => {
    const savedState = macStorage.getItem("os_state");
    const savedTime = macStorage.getItem("os_state_time");
    const setupCompleted = macStorage.getItem("setup_completed") === "true";

    if (setupCompleted) {
      if (savedState === "desktop") {
        setStage("desktop");
      } else {
        setStage("lock");
      }
      return;
    }

    if (!savedState || !savedTime) {
      setStage("power");
      return;
    }

    const lastVisit = Number(savedTime);
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;

    if (now - lastVisit < oneDay) {
      if (savedState === "power") {
        setStage("power");
      } else if (
        ["setup", "region", "written", "timezone", "dataprivacy", "createaccount"].includes(savedState)
      ) {
        setStage(savedState);
      } else {
        setStage("power");
      }
      return;
    }
    setStage("power");
  }, []);
  // EMBED: upstream suppresses the browser context menu document-wide (the
  // desktop has its own). Bound to the wrapper instead, so right-click still
  // behaves normally on the rest of the site once Mac mode is closed.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const disableRightClick = (e) => e.preventDefault();
    root.addEventListener("contextmenu", disableRightClick);

    return () => {
      root.removeEventListener("contextmenu", disableRightClick);
    };
  }, [stage]);

  // EMBED: Esc leaves Mac mode from the desktop stage. Kept off the boot and
  // setup stages so it cannot interrupt a flow the user is halfway through.
  useEffect(() => {
    if (!onExit) return;
    const handleEscape = (e) => {
      if (e.key === "Escape" && stage === "desktop") {
        e.preventDefault();
        onExit();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [stage, onExit]);
  useEffect(() => {
    const handleLockShortcut = (e) => {
      if (stage === "desktop" && e.ctrlKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setStage("lock");
      }
    };
    window.addEventListener("keydown", handleLockShortcut);
    return () => {
      window.removeEventListener("keydown", handleLockShortcut);
    };
  }, [stage]);
  useEffect(() => {
    if (!stage) return;
    macStorage.setItem("os_state", stage);
    macStorage.setItem("os_state_time", String(Date.now()));
  }, [stage]);

  if (!stage) return null;

  return (
      /* EMBED: `fixed inset-0` in place of `w-screen h-screen` — the
         simulator is portalled over the app, not laid out in its flow. */
      <div
        ref={rootRef}
        className="macos-sim-root fixed inset-0 overflow-hidden bg-black"
      >
        {stage === "power" && <PowerScreen goNext={() => {
          const setupCompleted = macStorage.getItem("setup_completed") === "true";
          if (setupCompleted) {
            setStage("lock");
          } else {
            setStage("setup");
          }
        }} />}
        {stage === "restart" && <PowerScreen autoBoot={true} goNext={() => {
          setStage("lock");
        }} />}
        {stage === "setup" && <SetupScreen 
          goNext={(lang) => {
            macStorage.setItem('setup_lang', lang || "English (UK)");
            setStage("region");
          }} 
          onSkip={() => {
            setSkippedSetup(true);
            setStage("createaccount");
          }}
        />}
        {stage === "region" && <RegionScreen goNext={(country) => {
          macStorage.setItem('setup_country', country || "United Kingdom");
          setStage("written");
        }} goBack={() => setStage("setup")} />}
        {stage === "written" && <WrittenScreen 
          selectedLanguage={macStorage.getItem('setup_lang') || "English (UK)"} 
          selectedCountry={macStorage.getItem('setup_country') || "United Kingdom"} 
          goNext={() => setStage("timezone")} 
          goBack={() => setStage("region")} 
        />}
        {stage === "timezone" && <TimezoneScreen 
          selectedCountry={macStorage.getItem('setup_country') || "United Kingdom"} 
            goNext={() => setStage("dataprivacy")}
            goBack={() => setStage("written")}
          />}
        {stage === "dataprivacy" && <DataPrivacyScreen
          goNext={() => setStage("createaccount")}
          goBack={() => setStage("timezone")}
        />}
        {stage === "createaccount" && <CreateAccountScreen
          goNext={() => setStage("lock")}
          goBack={() => {
            if (skippedSetup) {
              setSkippedSetup(false);
              setStage("setup");
            } else {
              setStage("dataprivacy");
            }
          }}
        />}
        
        {/* Desktop renders behind lock screen so it's visible during slide-up */}
      {(stage === "lock" || stage === "desktop") && (
        <div className="absolute inset-0">
          <Desktop setStage={setStage} isLocked={stage === "lock"} onExit={onExit} />
        </div>
      )}
      
      {/* Lock screen slides up to reveal desktop */}
      {(stage === "lock" || stage === "desktop") && (
        <div 
          className="absolute inset-0 z-50"
          style={{
            visibility: stage === "lock" ? "visible" : "hidden",
            pointerEvents: stage === "lock" ? "auto" : "none"
          }}
        >
          <LockScreen goNext={() => setStage("desktop")} isLocked={stage === "lock"} />
        </div>
      )}
    </div>
  );
}
