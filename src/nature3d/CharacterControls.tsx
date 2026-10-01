import {
  useCallback, useEffect, useRef, useState,
  type CSSProperties, type PointerEvent, type ReactNode, type RefObject,
} from "react";
import { ArrowUp, Camera, Footprints, Gauge, Globe2, Info, MousePointer2, RotateCcw, Shield, ChevronsDown } from "lucide-react";
import type { Sanctuary } from "./engine/scene";
import type { CharacterCameraMode } from "./engine/characterConfig";
import type { CharacterAssetStatus } from "./engine/characterManifest";
import { stageLocalDelta } from "./stagePointer";
import {
  HUD_CONTROL_LABELS, OPACITY_MIN, SCALE_MAX, SCALE_MIN, clearHudLayout, clampPlacement,
  defaultHudLayout, loadHudLayout, saveHudLayout,
  type HudControlId, type HudLayout, type HudPlacement,
} from "./characterLayout";
import "./characterControls.css";

interface Props {
  engineRef: RefObject<Sanctuary | null>;
  mode: CharacterCameraMode;
  status: CharacterAssetStatus;
  hidden: boolean;
  paused: boolean;
  onStart: () => void;
  onOverview: () => void;
  /** PUBG-style layout editor: every control becomes draggable and sizeable. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}

const itemStyle = (p: HudPlacement): CSSProperties => ({
  left: `${p.x}%`,
  top: `${p.y}%`,
  transform: `translate(-50%, -50%) scale(${p.scale})`,
  opacity: p.opacity,
});

/** Controls only; pointer moves write refs/Three input, never React state. */
export default function CharacterControls({
  engineRef, mode, status, hidden, paused, onStart, onOverview, editing, onEditingChange,
}: Props) {
  const [running, setRunning] = useState(false);
  const [crouching, setCrouching] = useState(false);
  const [hint, setHint] = useState("");
  const [layout, setLayout] = useState<HudLayout>(loadHudLayout);
  const [selected, setSelected] = useState<HudControlId | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: HudControlId; px: number; py: number; ox: number; oy: number } | null>(null);
  const walking = mode !== "orbit";

  const move = useCallback((x: number, y: number) => engineRef.current?.setCharacterMove(x, -y), [engineRef]);
  const look = useCallback((x: number, y: number) => engineRef.current?.setCharacterLook(x, y), [engineRef]);
  const syncFlags = useCallback(() => {
    const snapshot = engineRef.current?.getCharacterSnapshot();
    setRunning(snapshot?.runLatched ?? false); setCrouching(snapshot?.crouchLatched ?? false);
  }, [engineRef]);

  // The layout is stored, but not on every drag frame.
  useEffect(() => {
    const timer = setTimeout(() => saveHudLayout(layout), 200);
    return () => clearTimeout(timer);
  }, [layout]);

  const patch = useCallback((id: HudControlId, next: Partial<HudPlacement>) => {
    setLayout(previous => ({ ...previous, [id]: clampPlacement({ ...previous[id], ...next }) }));
  }, []);

  const finishEditing = useCallback(() => {
    saveHudLayout(layout);
    setSelected(null);
    onEditingChange(false);
  }, [layout, onEditingChange]);

  // Scene keyboard/blur handlers run first. Mirror their discrete resets,
  // not each animation frame, so a highlighted Run button never lies after R.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === "Escape" && editing) { e.stopPropagation(); finishEditing(); return; }
      if (e.code === "KeyR" || e.code === "Escape") syncFlags();
    };
    const hidden = () => { if (document.hidden) syncFlags(); };
    window.addEventListener("blur", syncFlags); window.addEventListener("keydown", key);
    document.addEventListener("visibilitychange", hidden); document.addEventListener("pointerlockchange", syncFlags);
    return () => {
      window.removeEventListener("blur", syncFlags); window.removeEventListener("keydown", key);
      document.removeEventListener("visibilitychange", hidden); document.removeEventListener("pointerlockchange", syncFlags);
    };
  }, [syncFlags, editing, finishEditing]);

  useEffect(() => {
    if (!walking || paused || hidden || editing) {
      engineRef.current?.setCharacterMove(0, 0);
      engineRef.current?.setCharacterLook(0, 0);
    }
    if (!walking || paused) { setRunning(false); setCrouching(false); }
  }, [walking, paused, hidden, editing, engineRef]);
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

  const beginDrag = (id: HudControlId) => (e: PointerEvent<HTMLDivElement>) => {
    if (!editing) return;
    e.preventDefault();
    setSelected(id);
    drag.current = { id, px: e.clientX, py: e.clientY, ox: layout[id].x, oy: layout[id].y };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* cancelled or synthetic pointer */ }
  };
  // Percentages, so the layout survives rotation and a resized window; the
  // delta is un-rotated first because the stage itself may be turned.
  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    const active = drag.current; const stage = stageRef.current;
    if (!active || !stage) return;
    const local = stageLocalDelta(stage, e.clientX - active.px, e.clientY - active.py, { x: 0, y: 0 });
    setLayout(previous => ({
      ...previous,
      [active.id]: clampPlacement({
        ...previous[active.id],
        x: active.ox + (local.x / Math.max(1, stage.clientWidth)) * 100,
        y: active.oy + (local.y / Math.max(1, stage.clientHeight)) * 100,
      }),
    }));
  };
  const endDrag = () => { drag.current = null; };

  const item = (id: HudControlId, content: ReactNode, extra?: string) => (
    <div
      key={id}
      data-hud-item={id}
      className={`sanctuary-character-item${editing ? " is-editing" : ""}${editing && selected === id ? " is-selected" : ""}${extra ? ` ${extra}` : ""}`}
      style={itemStyle(layout[id])}
      onPointerDown={beginDrag(id)}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
    >
      {content}
    </div>
  );

  if ((hidden || paused) && !editing) return null;
  // The editor shows every control at once, so nothing is hidden while the
  // player arranges them.
  const showStart = editing || !walking;
  const showWalking = editing || walking;

  const active = selected ? layout[selected] : null;

  return (
    <div data-character-controls className="sanctuary-character-controls" role="region" aria-label="Character controls" ref={stageRef}>
      {showStart ? item("start", (
        <button type="button" className="sanctuary-character-button sanctuary-character-start" onClick={onStart}
          title="Explore on foot · 18 ft" aria-label="Explore on foot, eighteen foot character">
          <Footprints size={20} aria-hidden="true" /><span>18 ft</span>
        </button>
      )) : null}

      {showWalking ? item("overview", (
        <button type="button" className="sanctuary-character-button" onClick={onOverview} title="Overview" aria-label="Return to world overview">
          <Globe2 size={17} aria-hidden="true" />
        </button>
      )) : null}

      {showWalking ? item("camera", (
        <button type="button" className="sanctuary-character-button" onClick={() => engineRef.current?.toggleCharacterCamera()}
          title={mode === "first-person" ? "Third-person camera · V" : "First-person camera · V"} aria-label="Switch character camera">
          <Camera size={17} aria-hidden="true" />
        </button>
      )) : null}

      {showWalking ? item("reset", (
        <button type="button" className="sanctuary-character-button" onClick={() => action("reset")} title="Reset · R" aria-label="Respawn character">
          <RotateCcw size={17} aria-hidden="true" />
        </button>
      )) : null}

      {showWalking ? item("mouse", (
        <button type="button" className="sanctuary-character-button" onClick={() => engineRef.current?.captureCharacterMouse()}
          title="Capture mouse · Esc releases it" aria-label="Capture mouse">
          <MousePointer2 size={17} aria-hidden="true" />
        </button>
      ), "sanctuary-character-mouse") : null}

      {item("help", (
        <details data-character-help className="sanctuary-character-help">
          <summary className="sanctuary-character-button" aria-label="Character controls and asset information" title="Controls and character information">
            <Info size={17} aria-hidden="true" />
          </summary>
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
      ))}

      <p data-character-asset-status role="status" className="sanctuary-character-source" title={status.detail}>
        {status.label}
      </p>

      {showWalking ? item("move", <Joystick label="Move character" onVector={move} />) : null}
      {showWalking ? item("look", <Joystick label="Look around" onVector={look} />) : null}

      {showWalking ? item("jump", (
        <button type="button" className="sanctuary-character-button" aria-label="Jump" title="Jump · Space"
          onPointerDown={e => { e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* touch cancellation / WebView */ } engineRef.current?.characterAction("jump"); }}
          onPointerUp={() => engineRef.current?.characterAction("jump-release")}
          onPointerCancel={() => engineRef.current?.characterAction("jump-release")}
          onLostPointerCapture={() => engineRef.current?.characterAction("jump-release")}
          onClick={e => { if (e.detail === 0) engineRef.current?.characterAction("jump"); }}>
          <ArrowUp size={17} aria-hidden="true" />
        </button>
      )) : null}

      {showWalking ? item("run", (
        <button type="button" className="sanctuary-character-button" aria-label="Run toggle" aria-pressed={running} onClick={() => action("run")} title="Run · Shift">
          <Gauge size={17} aria-hidden="true" />
        </button>
      )) : null}

      {showWalking ? item("crouch", (
        <button type="button" className="sanctuary-character-button" aria-label="Crouch toggle" aria-pressed={crouching} onClick={() => action("crouch")} title="Crouch · Ctrl">
          <ChevronsDown size={17} aria-hidden="true" />
        </button>
      )) : null}

      {showWalking ? item("cover", (
        <button type="button" className="sanctuary-character-button" aria-label="Enter or exit cover" onClick={() => action("cover")} title="Cover · E">
          <Shield size={17} aria-hidden="true" />
        </button>
      )) : null}

      {walking && !editing ? <p className="sanctuary-character-key-hint">WASD move · Shift run · Space jump · Ctrl crouch · E cover · V camera</p> : null}
      {hint && !editing ? <p className="sanctuary-character-feedback" role="status">{hint}</p> : null}

      {editing ? (
        <div data-layout-editor className="sanctuary-character-layout-editor" role="group" aria-label="Customise layout">
          <div className="sanctuary-character-layout-head">
            <strong>Customise layout</strong>
            <span>{selected ? HUD_CONTROL_LABELS[selected] : "Drag any button · tap to select it"}</span>
          </div>
          {selected && active ? (
            <div className="sanctuary-character-layout-sliders">
              <label>
                <span>Size</span>
                <input type="range" min={SCALE_MIN} max={SCALE_MAX} step={0.02} value={active.scale}
                  aria-label={`${HUD_CONTROL_LABELS[selected]} size`}
                  onChange={e => patch(selected, { scale: Number(e.currentTarget.value) })} />
                <b>{Math.round(active.scale * 100)}%</b>
              </label>
              <label>
                <span>Transparency</span>
                <input type="range" min={OPACITY_MIN} max={1} step={0.02} value={active.opacity}
                  aria-label={`${HUD_CONTROL_LABELS[selected]} transparency`}
                  onChange={e => patch(selected, { opacity: Number(e.currentTarget.value) })} />
                <b>{Math.round(active.opacity * 100)}%</b>
              </label>
              <button type="button" className="sanctuary-character-layout-mini" onClick={() => patch(selected, defaultHudLayout()[selected])}>
                Reset this button
              </button>
            </div>
          ) : null}
          <div className="sanctuary-character-layout-actions">
            <button type="button" className="sanctuary-character-layout-mini" onClick={() => { setLayout(clearHudLayout()); setSelected(null); }}>
              Defaults
            </button>
            <button type="button" className="sanctuary-character-layout-mini sanctuary-character-layout-save" onClick={finishEditing}>
              Save
            </button>
          </div>
        </div>
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
