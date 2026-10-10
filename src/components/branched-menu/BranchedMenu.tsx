// src/components/branched-menu/BranchedMenu.tsx
//
// The ONE listing system for every course hierarchy in the Course Player:
// module → submodule → resource (Modules tab), notes (Notes library) and
// mind maps (Mind Map library), each split MASTER / SELF where it applies.
//
// Visual reference: React Bits "Branched Menu" (reactbits.dev/c/micro/branched-menu,
// source: src/content/Micro/BranchedMenu). We keep its design language:
//   · section heads are quiet text that folds open/closed (grid-rows fold);
//   · children hang off a vertical trunk with rounded elbow branches;
//   · the branch to the ACTIVE child is drawn in the accent colour (stroke-dash
//     "draw" animation); the marker bar sits on the open top-level section;
//   · child text is indented, the active child is accent-coloured and weighted.
//
// Where the reference is a fixed two-level menu, this one nests arbitrarily:
// every expanded section carries its own trunk, offset one step to the right
// of its parent, so deeply nested modules keep their connections readable.
// Connectors are drawn PER ROW (an SVG elbow + a CSS trunk continuation), so
// variable-height expanded sections never need measuring and always line up.
//
// Icons: the reference uses @hugeicons; the leaf `icon` prop accepts any React
// node, so the project's existing lucide-react icons are used instead — no new
// dependency is required.
//
// Control: expansion is CONTROLLED (`openValues` + `onToggle`) so the tree keeps
// its state while the hierarchy rebuilds (live Firestore snapshots), and the
// active leaf is CONTROLLED (`activeValue`) so the selection follows the
// viewer. A section head only folds; it never selects or opens a child — the
// child rows are siblings of the head, not descendants of it.

import {
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import "./BranchedMenu.css";

/** One node of the tree. A node with `children` (even an empty array) is a section. */
export interface BranchedMenuItem {
  /** Unique within the whole tree — it is the open/active key. */
  value: string;
  label: string;
  /** Leaf icon. Any React node (lucide icons work directly). */
  icon?: ReactNode;
  /** Presence makes this node a section that folds. */
  children?: BranchedMenuItem[];
  /** Trailing marks on the row: counts, lock, preview badges. */
  meta?: ReactNode;
  /** Small uppercase provenance label, e.g. MASTER / SELF. */
  tag?: { label: string; color: string };
  /** Leaf colour (icon + accent). Defaults to the menu accent. */
  color?: string;
  /** Leaf only: visible but not selectable (locked content). */
  disabled?: boolean;
  /** Full text for the accessible name and tooltip. */
  description?: string;
  /** Leaf only: inline rename. Enables the pencil button and F2 / Shift+Enter. */
  onRename?: (nextLabel: string) => void;
  /** Leaf only: destructive secondary action (trash). */
  onDelete?: () => void;
  deleteLabel?: string;
  /** Extra data-* attributes on the leaf/section row button (tests + styling hooks). */
  dataAttrs?: Record<string, string | undefined>;
}

export interface BranchedMenuProps {
  items: BranchedMenuItem[];
  /** Values of the sections that are currently unfolded. */
  openValues: ReadonlySet<string>;
  onToggle: (value: string, open: boolean) => void;
  /** Value of the selected leaf. */
  activeValue?: string | null;
  onSelect?: (value: string, item: BranchedMenuItem) => void;
  /** Accessible name of the navigation landmark. */
  ariaLabel: string;
  /** Ink for text and the active accent; defaults follow the Course Player theme. */
  color?: string;
  accentColor?: string;
  lineColor?: string;
  /** Widest the menu may be (px). Ignored when `fullWidth` is set. */
  width?: number;
  /** Fill the container instead of shrinking to content. */
  fullWidth?: boolean;
  rowHeight?: number;
  indent?: number;
  trunk?: number;
  radius?: number;
  lineWidth?: number;
  fontSize?: number;
  drawDuration?: number;
  foldDuration?: number;
  className?: string;
  dataAttrs?: Record<string, string | number | undefined>;
}

const MARK = 16;
const NEST_STEP_PX = 14;

const isSection = (item: BranchedMenuItem) => Array.isArray(item.children);

/** True when `value` is this item or anywhere beneath it. */
export function branchContains(item: BranchedMenuItem, value: string | null | undefined): boolean {
  if (!value) return false;
  if (item.value === value) return true;
  return (item.children ?? []).some((child) => branchContains(child, value));
}

// ── Leaf row ───────────────────────────────────────────────────────────

function LeafRow({
  item,
  active,
  disabled,
  accent,
  connected,
  onSelect,
}: {
  item: BranchedMenuItem;
  active: boolean;
  disabled: boolean;
  accent: string;
  connected: boolean;
  onSelect: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(item.label);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const helpId = useId();
  const color = item.color || accent;

  useEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  const beginRename = () => {
    if (!item.onRename) return;
    setDraft(item.label);
    setRenaming(true);
  };
  const finishRename = () => {
    if (!renaming) return;
    const next = draft.trim();
    setRenaming(false);
    if (next && next !== item.label) item.onRename?.(next);
  };
  const cancelRename = () => {
    setRenaming(false);
    setDraft(item.label);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!item.onRename) return;
    if (event.key === "F2" || (event.key === "Enter" && event.shiftKey)) {
      event.preventDefault();
      beginRename();
    }
  };

  if (renaming) {
    return (
      <div
        className={`branched-menu__row${connected ? " branched-menu__row--connected" : ""}`}
        data-branched-rename=""
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          finishRename();
        }}
      >
        <div className="branched-menu__rename">
          <label className="sr-only" htmlFor={helpId}>Rename {item.label}</label>
          <input
            id={helpId}
            ref={inputRef}
            value={draft}
            maxLength={120}
            autoComplete="off"
            className="branched-menu__rename-input"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); finishRename(); }
              else if (event.key === "Escape") { event.preventDefault(); cancelRename(); }
            }}
            data-branched-rename-input=""
          />
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={cancelRename} aria-label="Cancel rename" className="branched-menu__action">
            <X size={14} aria-hidden="true" />
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={finishRename} aria-label="Save title" className="branched-menu__action branched-menu__action--save">
            <Check size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  const handleClick = () => {
    if (disabled) return;
    onSelect();
  };

  return (
    <div className={`branched-menu__row${connected ? " branched-menu__row--connected" : ""}`}>
      <button
        type="button"
        className="branched-menu__item"
        aria-current={active ? "true" : undefined}
        aria-disabled={disabled || undefined}
        data-active={active ? "" : undefined}
        data-disabled={disabled ? "" : undefined}
        data-branched-leaf=""
        title={item.description || item.label}
        aria-label={item.description || undefined}
        onClick={handleClick}
        onKeyDown={onKeyDown}
        style={{ "--bm-leaf": color } as CSSProperties}
        {...mapDataAttrs(item.dataAttrs)}
      >
        {item.icon ? (
          <span className="branched-menu__icon" aria-hidden="true">
            {isValidElement(item.icon) ? item.icon : null}
          </span>
        ) : null}
        <span className="branched-menu__label">{item.label}</span>
        {item.tag ? (
          <span className="branched-menu__tag" style={{ color: item.tag.color, borderColor: `${item.tag.color}66` }} data-branched-tag={item.tag.label.toLowerCase()}>
            {item.tag.label}
          </span>
        ) : null}
        {item.meta ? <span className="branched-menu__meta">{item.meta}</span> : null}
      </button>
      {item.onRename || item.onDelete ? (
        <span className="branched-menu__actions">
          {item.onRename ? (
            <button
              type="button"
              className="branched-menu__action"
              onClick={beginRename}
              aria-label={`Rename ${item.label}`}
              title="Rename (F2)"
              data-branched-rename-button=""
            >
              <Pencil size={13} aria-hidden="true" />
            </button>
          ) : null}
          {item.onDelete ? (
            <button
              type="button"
              className="branched-menu__action branched-menu__action--danger"
              onClick={(event) => { event.stopPropagation(); item.onDelete?.(); }}
              aria-label={item.deleteLabel || `Delete ${item.label}`}
              title={item.deleteLabel || "Delete"}
              data-branched-delete=""
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

const mapDataAttrs = (attrs?: Record<string, string | undefined>) => {
  const out: Record<string, string> = {};
  if (!attrs) return out;
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
};

// ── Menu ───────────────────────────────────────────────────────────────

export default function BranchedMenu({
  items,
  openValues,
  onToggle,
  activeValue = null,
  onSelect,
  ariaLabel,
  color,
  accentColor,
  lineColor,
  width = 240,
  fullWidth = false,
  rowHeight = 36,
  indent = 40,
  trunk = 14,
  radius = 10,
  lineWidth = 1.5,
  fontSize = 14,
  drawDuration = 400,
  foldDuration = 300,
  className = "",
  dataAttrs,
}: BranchedMenuProps) {
  const navRef = useRef<HTMLElement | null>(null);
  const markerRef = useRef<HTMLSpanElement | null>(null);
  const headRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Top-level section that holds the active leaf (drives the accent marker).
  const activeRoot = items.findIndex((item) => isSection(item) && branchContains(item, activeValue));
  const markerShown = activeRoot >= 0 && openValues.has(items[activeRoot].value);

  const placeMarker = useCallback((glide: boolean) => {
    const marker = markerRef.current;
    const nav = navRef.current;
    const head = activeRoot >= 0 ? headRefs.current[activeRoot] : null;
    if (!marker || !nav) return;
    const on = markerShown && head;
    if (!glide) marker.style.transition = "none";
    if (on) {
      const top = head.getBoundingClientRect().top - nav.getBoundingClientRect().top;
      marker.style.top = `${top + (head.offsetHeight - MARK) / 2}px`;
    }
    marker.toggleAttribute("data-on", Boolean(on));
    if (!glide) {
      void marker.offsetHeight;
      marker.style.transition = "";
    }
  }, [activeRoot, markerShown]);

  useLayoutEffect(() => {
    placeMarker(true);
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") return undefined;
    let first = true;
    const observer = new ResizeObserver(() => {
      if (first) { first = false; return; }
      placeMarker(false);
    });
    observer.observe(nav);
    return () => observer.disconnect();
  }, [placeMarker, items, openValues, fontSize, rowHeight]);

  const r = Math.min(radius, rowHeight / 2 - 2);
  const endX = indent - 8;
  const rowY = rowHeight / 2;
  const branchPath = `M ${trunk} 0 V ${rowY - r} A ${r} ${r} 0 0 0 ${trunk + r} ${rowY} H ${endX}`;
  const branchLength = (rowY - r) + (Math.PI * r) / 2 + (endX - trunk - r);

  const renderNode = (item: BranchedMenuItem, depth: number, index: number, count: number): ReactNode => {
    const section = isSection(item);
    const open = section && openValues.has(item.value);
    const connected = depth >= 1;
    const last = index === count - 1;
    const reach = section ? branchContains(item, activeValue) : activeValue === item.value;
    const kids = item.children ?? [];
    const leafDisabled = Boolean(item.disabled);
    const leafActive = !section && activeValue === item.value;

    const headAttrs = {
      "data-branched-section": section ? "" : undefined,
      "data-section-value": item.value,
      "data-open": open ? "" : undefined,
      "data-empty": section && kids.length === 0 ? "" : undefined,
      "data-depth": depth,
      ...mapDataAttrs(item.dataAttrs),
    };

    let row: ReactNode;
    if (section) {
      const headClass = connected ? "branched-menu__item branched-menu__item--section" : "branched-menu__head";
      row = (
        <div className={`branched-menu__row${connected ? " branched-menu__row--connected" : ""}`}>
          {connected ? (
            <svg className="branched-menu__lines" width={indent} height={rowHeight} aria-hidden="true">
              <path className="branched-menu__base" d={branchPath} />
              <path
                className="branched-menu__reach"
                d={branchPath}
                style={{ strokeDasharray: branchLength, strokeDashoffset: reach ? 0 : branchLength }}
              />
            </svg>
          ) : null}
          <button
            ref={(el) => { if (depth === 0) headRefs.current[index] = el; }}
            type="button"
            className={headClass}
            aria-expanded={kids.length > 0 ? open : undefined}
            aria-disabled={kids.length === 0 || undefined}
            data-active={reach && !open ? "" : undefined}
            onClick={() => { if (kids.length > 0) onToggle(item.value, !open); }}
            {...headAttrs}
          >
            <span className="branched-menu__head-label">{item.label}</span>
            {item.meta ? <span className="branched-menu__meta">{item.meta}</span> : null}
            {kids.length > 0 ? (
              <span className="branched-menu__caret" aria-hidden="true" data-open={open ? "" : undefined}>
                <svg viewBox="0 0 12 12" width="10" height="10"><path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            ) : null}
          </button>
        </div>
      );
    } else {
      const leafColor = item.color;
      row = (
        <div className={`branched-menu__leaf-wrap${connected ? "" : " branched-menu__leaf-wrap--root"}`}>
          {connected ? (
            <svg className="branched-menu__lines" width={indent} height={rowHeight} aria-hidden="true">
              <path className="branched-menu__base" d={branchPath} />
              <path
                className="branched-menu__reach"
                d={branchPath}
                style={{ strokeDasharray: branchLength, strokeDashoffset: leafActive ? 0 : branchLength, ...(leafColor ? { stroke: leafColor } : null) }}
              />
            </svg>
          ) : null}
          <LeafRow
            item={item}
            active={leafActive}
            disabled={leafDisabled}
            accent="var(--bm-accent)"
            connected={connected}
            onSelect={() => onSelect?.(item.value, item)}
          />
        </div>
      );
    }

    return (
      <div
        key={item.value}
        className="branched-menu__node"
        data-depth={depth}
        data-connected={connected ? "" : undefined}
        data-last={last ? "" : undefined}
        data-open={open ? "" : undefined}
        data-section={section ? "" : undefined}
        data-holds-active={reach ? "" : undefined}
      >
        {row}
        {section && kids.length > 0 ? (
          <div className="branched-menu__body" aria-hidden={open ? undefined : true}>
            <div className="branched-menu__fold">
              <div
                className="branched-menu__tree"
                role="group"
                aria-label={item.label}
                style={{ marginLeft: depth * NEST_STEP_PX }}
              >
                {kids.map((child, childIndex) => renderNode(child, depth + 1, childIndex, kids.length))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const style = {
    "--bm-w": `${width}px`,
    "--bm-font": `${fontSize}px`,
    "--bm-row": `${rowHeight}px`,
    "--bm-indent": `${indent}px`,
    "--bm-trunk": `${trunk}px`,
    "--bm-r": `${r}px`,
    "--bm-line-w": `${lineWidth}px`,
    "--bm-draw": `${drawDuration}ms`,
    "--bm-fold": `${foldDuration}ms`,
    ...(color ? { "--bm-ink": color } : null),
    ...(accentColor ? { "--bm-accent": accentColor } : null),
    ...(lineColor ? { "--bm-line": lineColor } : null),
  } as CSSProperties;

  return (
    <nav
      ref={navRef}
      aria-label={ariaLabel}
      className={`branched-menu${fullWidth ? " branched-menu--full" : ""}${className ? ` ${className}` : ""}`}
      style={style}
      {...mapDataAttrs(dataAttrs as Record<string, string | undefined>)}
    >
      <span ref={markerRef} className="branched-menu__marker" aria-hidden="true" />
      <div className="branched-menu__tree">
        {items.map((item, index) => renderNode(item, 0, index, items.length))}
      </div>
    </nav>
  );
}

/** Placeholder rows shown while a library is loading. Same rhythm as the menu. */
export function BranchedMenuSkeleton({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="branched-menu-skeleton" role="status" aria-label={label} data-branched-skeleton="">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="branched-menu-skeleton__row" style={{ width: `${86 - (index % 3) * 14}%`, marginLeft: index % 2 ? 40 : 14 }} />
      ))}
    </div>
  );
}

/**
 * Open/closed state for a BranchedMenu. Starts with the top-level sections
 * open once the tree first has content (so a fresh list is readable), then
 * keeps the learner's choices. `reveal` opens the chain that holds a selection.
 */
export function useBranchedOpen(items: BranchedMenuItem[]) {
  const [openValues, setOpenValues] = useState<Set<string>>(() => new Set());
  const seededRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || items.length === 0) return;
    seededRef.current = true;
    setOpenValues(new Set(items.filter((item) => item.children).map((item) => item.value)));
  }, [items]);

  const toggle = useCallback((value: string, open: boolean) => {
    setOpenValues((current) => {
      if (current.has(value) === open) return current;
      const next = new Set(current);
      if (open) next.add(value);
      else next.delete(value);
      return next;
    });
  }, []);

  const reveal = useCallback((values: string[]) => {
    if (values.length === 0) return;
    setOpenValues((current) => {
      if (values.every((value) => current.has(value))) return current;
      const next = new Set(current);
      for (const value of values) next.add(value);
      return next;
    });
  }, []);

  const setAll = useCallback((values: Iterable<string>) => setOpenValues(new Set(values)), []);

  return { openValues, toggle, reveal, setAll };
}
