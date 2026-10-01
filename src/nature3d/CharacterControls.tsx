import { useCallback, useEffect, useRef, useState, type PointerEvent, type RefObject } from "react";
import { ArrowUp, Camera, Footprints, Gauge, Globe2, Info, MousePointer2, RotateCcw, Shield, ChevronsDown } from "lucide-react";
import type { Sanctuary } from "./engine/scene";
import type { CharacterCameraMode } from "./engine/characterConfig";
import type { CharacterAssetStatus } from "./engine/characterManifest";
import { stageLocalDelta } from "./stagePointer";
import "./characterControls.css";

interface Props {
  engineRef: RefObject<Sanctuary | null>;
  mode: CharacterCameraMode;
  status: CharacterAssetStatus;
  hidden: boolean;
  paused: boolean;
  onStart: () => void;
  onOverview: () => void;
}

/** Controls only; pointer moves write refs/Three input, never React state. */
export default function CharacterControls({ engineRef, mode, status, hidden, paused, onStart, onOverview }: Props) {
  const [running, setRunning] = useState(false);
  const [crouching, setCrouching] = useState(false);
  const [hint, setHint] = useState("");
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const walking = mode !== "orbit";
  const move = useCallback((x: number, y: number) => engineRef.current?.setCharacterMove(x, -y), [engineRef]);
  const look = useCallback((x: number, y: number) => engineRef.current?.setCharacterLook(x, y), [engineRef]);
  const syncFlags = useCallback(() => {
    const snapshot = engineRef.current?.getCharacterSnapshot();
    setRunning(snapshot?.runLatched ?? false); setCrouching(snapshot?.crouchLatched ?? false);
  }, [engineRef]);

  // Scene keyboard/blur handlers run first. Mirror their discrete resets,
  // not each animation frame, so a highlighted Run button never lies after R.
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.code === "KeyR" || e.code === "Escape") syncFlags(); };
    const hidden = () => { if (document.hidden) syncFlags(); };
    window.addEventListener("blur", syncFlags); window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", hidden); document.addEventListener("pointerlockchange", syncFlags);
    return () => {
      window.removeEventListener("blur", syncFlags); window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", hidden); document.removeEventListener("pointerlockchange", syncFlags);
    };
  }, [syncFlags]);

  useEffect(() => {
    if (!walking || paused || hidden) {
      engineRef.current?.setCharacterMove(0, 0);
      engineRef.current?.setCharacterLook(0, 0);
    }
    if (!walking || paused) { setRunning(false); setCrouching(false); }
  }, [walking, paused, hidden, engineRef]);
  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    engineRef.current?.setCharacterMove(0, 0);
    engineRef.current?.setCharacterLook(0, 0);
  }, [engineRef]);

  const action = (name: "run" | "crouch" | "cover" | "reset") => {
    const engine = engineRef.current;
    engine?.characterAction(name);
    const state = engine?.getCharacterSnapshot();
    setRunning(state?.runLatched ?? false);
    setCrouching(state?.crouchLatched ?? false);
    if (name === "cover") {
      setHint(state?.inCover ? "In cover · move along the wall · E to leave" : "Move close to a sofa, rock or wall, then press Cover / E");
      if (hintTimer.current) clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(""), 3000);
    }
  };
  if (hidden || paused) return null;

  return (
    <div data-character-controls className="sanctuary-character-controls" role="region" aria-label="Character controls">
      <div className="sanctuary-character-toolbar">
        {!walking ? (
          <button type="button" className="sanctuary-character-button sanctuary-character-start" onClick={onStart}>
            <Footprints size={17} aria-hidden="true" /> Explore on foot <span>6 ft</span>
          </button>
        ) : (
          <>
            <button type="button" className="sanctuary-character-button" onClick={onOverview} title="Return to world overview">
              <Globe2 size={16} aria-hidden="true" /><span>Overview</span>
            </button>
            <button type="button" className="sanctuary-character-button" onClick={() => engineRef.current?.toggleCharacterCamera()} title="V · Switch first/third-person camera" aria-label="Switch character camera">
              <Camera size={16} aria-hidden="true" /><span>{mode === "first-person" ? "FPP" : "TPP"}</span>
            </button>
            <button type="button" className="sanctuary-character-button" onClick={() => action("reset")} title="R · Return to safe spawn" aria-label="Respawn character">
              <RotateCcw size={16} aria-hidden="true" /><span>Reset</span>
            </button>
            <button type="button" className="sanctuary-character-button sanctuary-character-mouse" onClick={() => engineRef.current?.captureCharacterMouse()} title="Capture mouse · Esc releases it. Drag the world if capture is unavailable.">
              <MousePointer2 size={16} aria-hidden="true" /><span>Mouse</span>
            </button>
          </>
        )}
        <details data-character-help className="sanctuary-character-help">
          <summary className="sanctuary-character-button" aria-label="Character controls and asset information" title="Controls and character information"><Info size={17} aria-hidden="true" /></summary>
          <div className="sanctuary-character-help-panel">
            <strong>{status.label}</strong>
            <p>{status.detail}</p>
            <dl>
              <dt>Move / strafe</dt><dd>W A S D / arrows / left stick</dd>
              <dt>Run</dt><dd>Hold Shift / Run toggle</dd>
              <dt>Jump</dt><dd>Space / Jump</dd>
              <dt>Crouch</dt><dd>Hold Ctrl / Crouch toggle</dd>
              <dt>Cover</dt><dd>E / Cover, near an obstacle</dd>
              <dt>Camera</dt><dd>Drag / right stick / captured mouse</dd>
              <dt>View / shoulder</dt><dd>V / Q · wheel or pinch to zoom</dd>
              <dt>Reset / release mouse</dt><dd>R / Esc</dd>
            </dl>
            <p>Gamepad: left stick move, right stick look, A jump, B crouch, X cover, Y camera, left-stick click run.</p>
            <p>Choose a study board to leave character mode. The sofa stays empty.</p>
          </div>
        </details>
      </div>

      <p data-character-asset-status role="status" className="sanctuary-character-source" title={status.detail}>
        {status.kind === "imported" ? status.label : "Web guide · 6 ft — original UE export pending"}
      </p>
      {walking ? (
        <>
          <div className="sanctuary-character-left-stick"><Joystick label="Move character" onVector={move} /></div>
          <div className="sanctuary-character-right-stick"><Joystick label="Look around" onVector={look} /></div>
          <div className="sanctuary-character-actions">
            <button type="button" className="sanctuary-character-button" aria-label="Jump" title="Space · Jump"
              onPointerDown={e => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* touch cancellation / WebView */ } engineRef.current?.characterAction("jump"); }}
              onPointerUp={() => engineRef.current?.characterAction("jump-release")}
              onPointerCancel={() => engineRef.current?.characterAction("jump-release")}
              onLostPointerCapture={() => engineRef.current?.characterAction("jump-release")}
              onClick={e => { if (e.detail === 0) engineRef.current?.characterAction("jump"); }}>
              <ArrowUp size={17} aria-hidden="true" /><span>Jump</span>
            </button>
            <button type="button" className="sanctuary-character-button" aria-label="Run toggle" aria-pressed={running} onClick={() => action("run")} title="Shift · Run">
              <Gauge size={17} aria-hidden="true" /><span>Run</span>
            </button>
            <button type="button" className="sanctuary-character-button" aria-label="Crouch toggle" aria-pressed={crouching} onClick={() => action("crouch")} title="Ctrl · Crouch">
              <ChevronsDown size={17} aria-hidden="true" /><span>Crouch</span>
            </button>
            <button type="button" className="sanctuary-character-button" aria-label="Enter or exit cover" onClick={() => action("cover")} title="E · Enter/exit cover">
              <Shield size={17} aria-hidden="true" /><span>Cover</span>
            </button>
          </div>
          <p className="sanctuary-character-key-hint">WASD move · Shift run · Space jump · Ctrl crouch · E cover · V camera</p>
          {hint ? <p className="sanctuary-character-feedback" role="status">{hint}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function Joystick({ label, onVector }: { label: string; onVector: (x: number, y: number) => void }) {
  const knob = useRef<HTMLSpanElement>(null);
  const pointer = useRef<number | null>(null);
  const delta = useRef({ x: 0, y: 0 });
  const emit = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const local = stageLocalDelta(el, e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2, delta.current);
    const dx = local.x, dy = local.y;
    const radius = el.clientWidth * 0.32;
    const distance = Math.hypot(dx, dy);
    const capped = Math.min(1, distance / radius);
    const gain = capped < 0.12 ? 0 : (capped - 0.12) / 0.88;
    onVector(distance > 0 ? dx / distance * gain : 0, distance > 0 ? dy / distance * gain : 0);
    if (knob.current) knob.current.style.transform = `translate(${distance > 0 ? dx / distance * capped * radius : 0}px, ${distance > 0 ? dy / distance * capped * radius : 0}px)`;
  }, [onVector]);
  const reset = useCallback(() => {
    pointer.current = null;
    onVector(0, 0);
    if (knob.current) knob.current.style.transform = "translate(0px, 0px)";
  }, [onVector]);
  useEffect(() => {
    window.addEventListener("blur", reset);
    return () => { window.removeEventListener("blur", reset); onVector(0, 0); };
  }, [reset, onVector]);
  return (
    <div className="sanctuary-character-stick" data-character-stick={label === "Move character" ? "move" : "look"} role="group" aria-label={label}
      onPointerDown={e => { if (pointer.current !== null) return; e.preventDefault(); pointer.current = e.pointerId; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* cancelled or synthetic pointer */ } emit(e); }}
      onPointerMove={e => { if (pointer.current === e.pointerId) emit(e); }}
      onPointerUp={e => { if (pointer.current === e.pointerId) reset(); }}
      onPointerCancel={e => { if (pointer.current === e.pointerId) reset(); }}
      onLostPointerCapture={reset}>
      <span className="sanctuary-character-stick-knob" ref={knob} />
      <span className="sanctuary-character-stick-label">{label === "Move character" ? "Move" : "Look"}</span>
    </div>
  );
}
