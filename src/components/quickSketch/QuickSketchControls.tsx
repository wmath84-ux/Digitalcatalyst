// src/components/quickSketch/QuickSketchControls.tsx
//
// The four controls the Quick Sketch panel is built from — the perfect-freehand
// editor's own row widgets (perfectfreehand.com), as plain React over plain
// inputs: a slider with its number field, a select, a checkbox and the colour
// row. Styling lives in `quickSketch.css` (`.dc-qsk-*`); the shapes of the
// props mirror the editor's components, including the details that make it
// feel right: the label is the reset affordance (double-click) and a slider
// reports the START and END of a drag separately, so one drag is one undo step.

import { useId } from "react";

/** A row's label. Double-clicking it restores that one option's default. */
function RowLabel({
  label,
  htmlFor,
  onReset,
}: {
  label: string;
  htmlFor: string;
  onReset?: () => void;
}) {
  return (
    <label className="dc-qsk-label" htmlFor={htmlFor} onDoubleClick={onReset} title={onReset ? `${label} — double-click to reset` : label}>
      {label}
    </label>
  );
}

export function QuickSketchSlider({
  name,
  attr,
  value,
  min,
  max,
  step,
  /** `true` for a taper: the value is the boolean's own text ("true"/"false"). */
  textValue,
  onPreview,
  onBegin,
  onCommit,
  onReset,
}: {
  name: string;
  attr: string;
  value: number;
  min: number;
  max: number;
  step: number;
  textValue?: string;
  onPreview: (value: number) => void;
  onBegin: () => void;
  onCommit: () => void;
  onReset: () => void;
}) {
  const id = useId();
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <>
      <RowLabel label={name} htmlFor={id} onReset={onReset} />
      <input
        id={id}
        className="dc-qsk-slider"
        data-quick-sketch-slider={attr}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ["--dc-qsk-fill" as string]: `${percent}%` }}
        onPointerDown={onBegin}
        onPointerUp={onCommit}
        onKeyDown={onBegin}
        onKeyUp={onCommit}
        onDoubleClick={onReset}
        onChange={(event) => onPreview(Number(event.currentTarget.value))}
        aria-label={name}
      />
      {textValue !== undefined ? (
        <span className="dc-qsk-number" style={{ textAlign: "right" }} data-quick-sketch-value={attr}>
          {textValue}
        </span>
      ) : (
        <input
          className="dc-qsk-number"
          data-quick-sketch-value={attr}
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          // Typing is a gesture too: the first keystroke opens the undo step
          // (the parent's begin is idempotent) and leaving the field closes it,
          // so a typed number and a dragged slider behave the same way.
          onFocus={onBegin}
          onPointerDown={onBegin}
          onChange={(event) => {
            const next = Number(event.currentTarget.value);
            if (!Number.isFinite(next)) return;
            onBegin();
            onPreview(next);
          }}
          onBlur={onCommit}
          onKeyDown={(event) => {
            if (event.key === "Enter") onCommit();
          }}
          aria-label={`${name} value`}
        />
      )}
    </>
  );
}

export function QuickSketchSelect({
  name,
  attr,
  value,
  options,
  onSelect,
  onReset,
}: {
  name: string;
  attr: string;
  value: string;
  options: readonly string[];
  onSelect: (value: string) => void;
  onReset: () => void;
}) {
  const id = useId();
  return (
    <>
      <RowLabel label={name} htmlFor={id} onReset={onReset} />
      <div className="dc-qsk-select">
        <select
          id={id}
          data-quick-sketch-select={attr}
          value={value}
          onChange={(event) => onSelect(event.currentTarget.value)}
          aria-label={name}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option[0].toUpperCase() + option.slice(1)}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

export function QuickSketchCheckbox({
  name,
  attr,
  checked,
  disabled = false,
  onChange,
}: {
  name: string;
  attr: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <>
      <RowLabel label={name} htmlFor={id} />
      <input
        id={id}
        className="dc-qsk-checkbox"
        data-quick-sketch-checkbox={attr}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        aria-label={name}
      />
    </>
  );
}

export function QuickSketchColors({
  name,
  attr,
  colours,
  colour,
  onPick,
}: {
  name: string;
  attr: string;
  colours: readonly string[];
  colour: string;
  onPick: (colour: string) => void;
}) {
  return (
    <>
      <span className="dc-qsk-label" />
      <div className="dc-qsk-colors" data-quick-sketch-colors={attr} aria-label={name}>
        {colours.map((swatch) => (
          <button
            key={swatch}
            type="button"
            className="dc-qsk-color"
            data-quick-sketch-color={swatch}
            data-selected={swatch === colour ? "true" : "false"}
            style={{ backgroundColor: swatch }}
            onClick={() => onPick(swatch)}
            aria-label={`${name} ${swatch}`}
          />
        ))}
      </div>
    </>
  );
}
