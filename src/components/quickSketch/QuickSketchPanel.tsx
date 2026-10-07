// src/components/quickSketch/QuickSketchPanel.tsx
//
// The Quick Sketch OPTIONS PANEL — the perfect-freehand editor's own panel
// (perfectfreehand.com), ported row for row: Size, Thinning, Streamline,
// Smoothing, Easing, then each end of the stroke (Taper / Cap / Easing), then
// Fill and its colour, then Stroke width and its colour, and finally the three
// buttons the editor ends on — Reset Options, Copy Options, Copy to SVG.
//
// Two behaviours are the editor's and are therefore kept exactly:
//   · double-clicking a row's label restores that ONE option's default;
//   · a slider reports the start and the end of its drag separately, so a whole
//     drag is a single undo step (the parent owns that history).
//
// The panel is a view: it never touches strokes, storage or history itself.

import { Fragment } from "react";
import {
  QUICK_SKETCH_COLOURS,
  QUICK_SKETCH_EASING_NAMES,
  QUICK_SKETCH_SLIDERS,
  QUICK_SKETCH_STROKE_ENDS,
  taperFromSlider,
  taperShowsCap,
  taperShowsEasing,
  taperSliderValue,
  type QuickSketchStyle,
} from "../../utils/quickSketchStyle";
import {
  QuickSketchCheckbox,
  QuickSketchColors,
  QuickSketchSelect,
  QuickSketchSlider,
} from "./QuickSketchControls";

export interface QuickSketchPanelProps {
  style: QuickSketchStyle;
  open: boolean;
  /** Live style change while a control is moving (no history entry yet). */
  onPreview: (patch: Partial<QuickSketchStyle>) => void;
  /** A drag / a typed value began — the parent snapshots for undo here. */
  onBegin: () => void;
  /** The change is finished — the parent closes the undo step here. */
  onCommit: () => void;
  /** One control changed in a single step (a select, a checkbox, a colour). */
  onApply: (patch: Partial<QuickSketchStyle>) => void;
  /** Double-click a label: that one option back to its default. */
  onResetProp: (prop: keyof QuickSketchStyle) => void;
  onResetAll: () => void;
  onCopyOptions: () => void;
  onCopySvg: () => void;
  /** A short note ("Copied to clipboard", "Canvas is full") — may be empty. */
  notice?: string;
}

export default function QuickSketchPanel({
  style,
  open,
  onPreview,
  onBegin,
  onCommit,
  onApply,
  onResetProp,
  onResetAll,
  onCopyOptions,
  onCopySvg,
  notice,
}: QuickSketchPanelProps) {
  /**
   * A slider's own onChange is the preview; the number field commits on blur.
   * Both the slider and its number field edit the same option, so they share
   * one handler pair.
   */
  const numericSlider = (key: "size" | "thinning" | "streamline" | "smoothing") => {
    const row = QUICK_SKETCH_SLIDERS.find((slider) => slider.key === key)!;
    return (
      <QuickSketchSlider
        key={row.key}
        name={row.label}
        attr={row.key}
        value={style[key]}
        min={row.min}
        max={row.max}
        step={row.step}
        onPreview={(value) => onPreview({ [key]: value } as Partial<QuickSketchStyle>)}
        onBegin={onBegin}
        onCommit={onCommit}
        onReset={() => onResetProp(key)}
      />
    );
  };

  return (
    <div className="dc-qsk-panel" data-quick-sketch-panel="" data-open={open ? "true" : "false"}>
      <div className="dc-qsk-panel-body">
        {(["size", "thinning", "streamline", "smoothing"] as const).map(numericSlider)}

        <QuickSketchSelect
          name="Easing"
          attr="easing"
          value={style.easing}
          options={QUICK_SKETCH_EASING_NAMES}
          onSelect={(value) => onApply({ easing: value as QuickSketchStyle["easing"] })}
          onReset={() => onResetProp("easing")}
        />

        {QUICK_SKETCH_STROKE_ENDS.map((end) => {
          const taper = style[end.taper];
          const slider = (
            <QuickSketchSlider
              key={end.taper}
              name={end.taperLabel}
              attr={end.taper}
              value={taperSliderValue(taper)}
              min={0}
              max={100}
              step={1}
              textValue={typeof taper === "boolean" ? String(taper) : undefined}
              onPreview={(value) => onPreview({ [end.taper]: taperFromSlider(value) } as Partial<QuickSketchStyle>)}
              onBegin={onBegin}
              onCommit={onCommit}
              onReset={() => onResetProp(end.taper)}
            />
          );
          return (
            <Fragment key={end.end}>
              <hr className="dc-qsk-hr" />
              {slider}
              {taperShowsCap(taper) ? (
                <QuickSketchCheckbox
                  name={end.capLabel}
                  attr={end.cap}
                  checked={taper === 0 && style[end.cap]}
                  disabled={typeof taper === "number" && taper > 0}
                  onChange={(checked) => onApply({ [end.cap]: checked } as Partial<QuickSketchStyle>)}
                />
              ) : null}
              {taperShowsEasing(taper) ? (
                <QuickSketchSelect
                  name={end.easingLabel}
                  attr={end.easing}
                  value={style[end.easing]}
                  options={QUICK_SKETCH_EASING_NAMES}
                  onSelect={(value) => onApply({ [end.easing]: value } as Partial<QuickSketchStyle>)}
                  onReset={() => onResetProp(end.easing)}
                />
              ) : null}
            </Fragment>
          );
        })}

        <hr className="dc-qsk-hr" />
        <QuickSketchCheckbox
          name="Fill"
          attr="isFilled"
          checked={style.isFilled}
          onChange={(checked) => onApply({ isFilled: checked })}
        />
        {style.isFilled ? (
          <QuickSketchColors
            name="Fill colour"
            attr="fill"
            colours={QUICK_SKETCH_COLOURS}
            colour={style.fill}
            onPick={(colour) => onApply({ fill: colour })}
          />
        ) : null}

        <QuickSketchSlider
          name="Stroke"
          attr="strokeWidth"
          value={style.strokeWidth}
          min={0}
          max={100}
          step={1}
          onPreview={(value) => onPreview({ strokeWidth: value })}
          onBegin={onBegin}
          onCommit={onCommit}
          onReset={() => onResetProp("strokeWidth")}
        />
        {style.strokeWidth > 0 ? (
          <QuickSketchColors
            name="Stroke colour"
            attr="stroke"
            colours={QUICK_SKETCH_COLOURS}
            colour={style.stroke}
            onPick={(colour) => onApply({ stroke: colour })}
          />
        ) : null}
      </div>

      <hr className="dc-qsk-hr" />
      <div className="dc-qsk-row-buttons">
        <button type="button" className="dc-qsk-row-button" data-quick-sketch-reset-options="" onClick={onResetAll}>
          Reset Options
        </button>
        <button type="button" className="dc-qsk-row-button" data-quick-sketch-copy-options="" onClick={onCopyOptions}>
          Copy Options
        </button>
      </div>
      <hr className="dc-qsk-hr" />
      <div className="dc-qsk-row-buttons">
        <button type="button" className="dc-qsk-row-button" data-quick-sketch-copy-svg="" onClick={onCopySvg}>
          Copy to SVG
        </button>
      </div>

      {notice ? (
        <p className="dc-qsk-hint" data-quick-sketch-notice="" style={{ marginTop: 8 }} role="status" aria-live="polite">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
