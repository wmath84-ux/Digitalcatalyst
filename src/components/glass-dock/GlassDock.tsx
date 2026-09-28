'use client'

/**
 * The footer navigation dock — the AI Canvas Glass Dock
 * (https://aicanvas.me/components/glass-dock), look/animation exact:
 *   · frosted panel (rgba-white pane + hairline border + inset top-light)
 *     with a SEPARATE non-animating blur layer (blur 24 / saturate 1.8),
 *   · dock entrance spring (y:50 → 0, stiffness 180 / damping 20),
 *   · per-item staggered entrance (opacity/y, delay index*0.04),
 *   · distance-based magnification with spring physics (ICON_SIZE 44,
 *     MAG_RANGE 120, MAG_SCALE 1.55, lift −12px),
 *   · notification-style tinted icon badges (`${color}18` fill,
 *     `${color}22` border, radius 12) and frosted tooltips.
 *
 * KEPT on the owner's direction: the finger-swipe behaviour — touch
 * tracking drives the same magnification wave as the cursor, and lifting
 * the finger on an icon selects it (see onPointerUp + idFromPoint).
 *
 * Old footer implementations: src/components/glass-dock/stored/
 *
 * ════════════════════════════════════════════════════════════════════════
 * THE WAVE IS NOW TRANSFORM-ONLY — owner brief 2026-09-28
 * ════════════════════════════════════════════════════════════════════════
 *   "Home page per footer navigation drag-scroll karne per animation lag
 *    karta hai, jabki course player / My Day per wahi footer lag nahin
 *    karta. Difference analyse karo aur vaise hi design karo."
 *
 * The look above never changed — the GEOMETRY of this file is provably the
 * same one the layout-driven wave produced (see
 * tests/footerDockSmoothDragContract.test.mjs, which recomputes both models
 * and asserts they agree to the sub-pixel). What changed is the work each
 * frame asks the browser for. Three things made Home — and only Home —
 * stutter, and all three lived in the old per-frame path:
 *
 *   1. THE PLATES ANIMATED `width` / `height`. Every spring tick wrote a
 *      layout property on all seven/eight plates, so every frame ran a
 *      layout pass and repainted the capsule. Worse, the capsule is
 *      `w-max`, so the plates' growth resized the CAPSULE, which resized
 *      GlassMaterial (`absolute inset-0`), which fired its ResizeObserver
 *      and rebuilt the refraction lens map — a 220×220 pixel loop plus a
 *      blocking `canvas.toDataURL()` PNG encode plus a React re-render plus
 *      a brand-new `<feImage>` — once per distinct capsule size, i.e. many
 *      times a second for the whole length of a drag. (With glass on, that
 *      lens is not even painted: the `html[data-glass="on"]` rule in
 *      src/glass.css overrides the layer's `backdrop-filter` with a flat
 *      blur, so the rebuild was pure cost.)
 *   2. THE DISTANCE WAS MEASURED PER ITEM PER FRAME. Each plate's
 *      `useTransform` called `getBoundingClientRect()`, so one pointer move
 *      forced eight synchronous layouts — after the style writes of the same
 *      frame, i.e. the worst possible place for a read.
 *   3. EVERY ONE OF THOSE STYLE WRITES WAS A DOCUMENT-WIDE EVENT.
 *      src/utils/footerNavSpace.ts watched `document.body`'s whole subtree
 *      for `class`/`style` mutations to re-measure the footer, and published
 *      the result as `--dc-footer-nav-h` on <html>. The capsule's height
 *      changes while the wave runs, so each frame ended with a custom
 *      property write on the ROOT — a document-wide style recalculation —
 *      and with the page scroller's `::after` clearance
 *      (`[data-app-frame] > main::after { height: var(--dc-footer-nav-h) }`)
 *      re-laid out under it.
 *
 * The cost of (3) is proportional to the size of the document, which is the
 * whole difference the owner saw: Home is the longest, busiest page in the
 * app (hero carousel, product grid, reviews rail, matter.js sticker wall,
 * social card), so a per-frame root recalculation costs it tens of
 * milliseconds. My Day is a handful of cards, and the course player's peek
 * dock is not inside a `[data-site-footer-nav]` at all, so it never touched
 * `--dc-footer-nav-h`. Same component, same springs — a page-size bill.
 *
 * So the wave now runs where the compositor can carry it:
 *
 *   · plates keep a FIXED layout box (`plateSize`) and magnify with
 *     `scale` (origin bottom-centre) + `y` (the −12px lift) + `x` (the
 *     neighbour push). No layout property is animated on an item, ever;
 *   · the capsule grows through its own `padding-top` / `padding-inline` —
 *     ONE element, one small subtree, instead of eight plates — driven by
 *     the same spring config, so it stays in lockstep with the plates;
 *   · centres are measured ONCE per gesture (on pointerdown, at rest) plus
 *     on resize — never per frame;
 *   · pointer moves are coalesced to one update per animation frame;
 *   · the gesture publishes `data-dc-dock-gesture` on <html> while it runs,
 *     which is what lets footerNavSpace skip the root write mid-drag
 *     (and publish the settled value once, afterwards).
 *
 * `whileTap={{scale:0.82}}` became a press spring multiplied into the wave's
 * scale, because a `whileTap` scale would fight the magnification scale for
 * the same transform slot. Same 0.82, same feel, no conflict.
 *
 * ── THE HOME DOCK'S FILL (owner brief, later the same day) ────────────────
 *   "Home screen per footer navigation ka size thoda bada karo — matlab side
 *    mein jitna area khali hai vah sab cover ho jaaye … ekadam pura hi na ho
 *    jaaye ki sat jaaye ekadam edge se, lekin aur bada ho jaaye icon vagaira
 *    jisse."
 *
 * The fill is the ONLY thing that changes a dock's resting size, and it is
 * opt-in: `SiteFooterNav` measures the width the nav leaves the capsule,
 * solves for the biggest plate that still keeps a margin from the screen edge
 * (capped at 60px, with the leftover handed to the gaps), and passes the four
 * numbers down as `fill`. Because the plate size is part of the wave's
 * geometry, the magnification, the lift, the neighbour push, the tooltip and
 * the glyph all grow with it — one size, no separate length/width edits, and
 * nothing is frozen by a CSS `width` (which is what the old bar did).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ComponentType,
  type ReactNode,
  type Ref,
} from 'react'
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from 'framer-motion'
import GlassMaterial, {
  DOCK_PANEL_BG,
  DOCK_PANEL_BLUR,
  DOCK_PANEL_BORDER,
  DOCK_PANEL_SHADOW,
} from './GlassMaterial'

export const ICON_SIZE = 44
/** Compact plate: seven/eight tabs still fit an ordinary phone. */
export const COMPACT_ICON_SIZE = 38
/** Eight home destinations on a 320 px phone, without horizontal clipping. */
export const DENSE_ICON_SIZE = 34
export const MAG_RANGE = 120
export const MAG_SCALE = 1.55
/** How far the plate rises at full magnification (the old `y: [0, -12]`). */
export const MAG_LIFT = 12
/** The old `whileTap={{ scale: 0.82 }}`, kept — multiplied into the wave. */
const TAP_SCALE = 0.82
/**
 * ONE spring drives the plate scale, the lift, the neighbour push and the
 * capsule padding. Identical config ⇒ identical time evolution, so the glass
 * and the plates can never drift apart mid-gesture.
 */
const WAVE_SPRING = { stiffness: 300, damping: 22, mass: 0.5 } as const
/** Anything at/after this distance from the pointer is at rest. */
const FAR = 1e4
/** How long after the last pointer event the gesture is considered over. */
const GESTURE_SETTLE_MS = 260

export type GlassDockIcon = ComponentType<{
  className?: string
  style?: CSSProperties
  size?: number
}>

export type GlassDockButtonProps = {
  className?: string
  onPointerDown?: (event?: never) => void
  onPointerUp?: (event?: never) => void
  onPointerLeave?: (event?: never) => void
  onPointerCancel?: (event?: never) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onContextMenu?: (event: any) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onClick?: (event: any) => void
}

export type GlassDockItem = {
  id: string
  label: string
  color: string
  icon: GlassDockIcon
  active?: boolean
  badge?: number
  extra?: ReactNode
  buttonRef?: Ref<HTMLButtonElement>
  buttonProps?: GlassDockButtonProps
  dataAttrs?: Record<string, string | undefined>
  /**
   * Wide PRIMARY text button (Flow dock's "Create"): renders the label text
   * instead of the icon, noticeably wider than an icon plate, same height so
   * the dock's baseline/alignment is unchanged, with the app's indigo→violet
   * primary treatment. Opts OUT of the magnification wave (a wide pill
   * stretching under the pointer reads as broken). Off everywhere else, so
   * every existing dock is untouched.
   */
  wide?: boolean
}

/**
 * The FILL metrics of a dock whose owner asked for a bigger, width-covering
 * footer — today that is Home's eight-tab dock and nothing else.
 *
 * Owner brief, 2026-09-28:
 *
 *   "Home screen per footer navigation ka size thoda bada karo — matlab side
 *    mein jitna area khali hai vah sab cover ho jaaye … ekadam pura hi na ho
 *    jaaye ki sat jaaye ekadam edge se, lekin aur bada ho jaaye icon vagaira
 *    jisse."
 *
 * Home is the only footer with an eighth destination (the Sanctuary slot), so
 * it was the only one wearing the 38 px `compact` plates on an ordinary phone
 * — narrower plates, a smaller glyph, and 20–70 px of empty screen either side
 * of the capsule. `SiteFooterNav` measures the width the nav actually leaves
 * the capsule and hands the answer down here as ONE set of numbers, so the
 * dock stays a single size: bigger plates (up to 60 px), the glyph half of
 * them, wider rhythm, and the magnification wave — which is measured against
 * `plateSize` — grows with them instead of being frozen by CSS.
 *
 * Everything is optional: with no `fill` the dock is byte-for-byte the dock
 * every other screen (My Day, Revision, Cart, Store, the course player) has
 * always worn.
 */
export type GlassDockFill = {
  /** Resting plate (tap target + the wave's geometry), in px. */
  plateSize: number
  /** Resting gap between plates. */
  gap: number
  /** Resting capsule padding — left and right, each. */
  padInline: number
  /** Resting capsule padding — top and bottom, each. */
  padBlock: number
}

/**
 * 0 at rest → 1 with the pointer exactly on the plate: the same linear ramp
 * the old `useTransform(distance, [0, MAG_RANGE], …)` produced.
 */
const ramp = (distance: number) => (distance >= MAG_RANGE ? 0 : 1 - distance / MAG_RANGE)

/** How many extra pixels of width a plate `distance` from the pointer gains. */
const growthFor = (distance: number, plateSize: number) =>
  (MAG_SCALE - 1) * plateSize * ramp(distance)

/** The resting plate layout the wave is measured against. */
type DockLayout = {
  /** id → plate centre X in viewport coordinates, measured AT REST. */
  centres: Record<string, number>
  /** ids in row order — the push an item gets depends on its neighbours. */
  ids: string[]
  /** The capsule's resting padding, read from the cascade (media rules win). */
  padTop: number
  padInline: number
  /**
   * ≤319px with seven tabs spreads the row edge to edge
   * (`width:100%; justify-content:space-between`). There the capsule is not
   * free to grow, so the horizontal growth is dropped instead of squeezing
   * the row.
   */
  spread: boolean
}

function DockItem({
  id,
  icon: Icon,
  color,
  label,
  mouseX,
  index,
  active,
  badge,
  extra,
  buttonRef,
  buttonProps,
  dataAttrs,
  wide,
  onSelect,
  skipClickRef,
  plateSize,
  layoutRef,
  registerItem,
}: GlassDockItem & {
  mouseX: MotionValue<number>
  index: number
  onSelect: () => void
  skipClickRef: { current: boolean }
  plateSize: number
  layoutRef: { current: DockLayout }
  registerItem: (id: string, node: HTMLDivElement | null) => void
}) {
  // The plate's box is FIXED at plateSize. Everything the wave does is a
  // transform on this column (the neighbour push) or on the button (scale +
  // lift), so no frame of the gesture ever dirties layout.
  const distance = useTransform(mouseX, (mx: number) => {
    if (mx < 0) return FAR
    const centre = layoutRef.current.centres[id]
    return centre === undefined ? FAR : Math.abs(mx - centre)
  })

  const rawScale = useTransform(distance, (d: number) =>
    wide ? 1 : 1 + (MAG_SCALE - 1) * ramp(d),
  )
  const magnify = useSpring(rawScale, WAVE_SPRING)

  /**
   * Neighbour push, as a transform. In the old flex row a growing plate
   * shoved the row apart; for a centred `w-max` row item i's centre moved by
   * exactly half the growth to its left minus half the growth to its right.
   * That is what this recomputes — same numbers, no layout.
   */
  const rawPush = useTransform(mouseX, (mx: number) => {
    if (mx < 0) return 0
    const { centres, ids } = layoutRef.current
    const centre = centres[id]
    if (centre === undefined) return 0
    let push = 0
    for (const other of ids) {
      if (other === id) continue
      const otherCentre = centres[other]
      if (otherCentre === undefined) continue
      const growth = growthFor(Math.abs(mx - otherCentre), plateSize)
      if (growth === 0) continue
      push += centre > otherCentre ? growth : -growth
    }
    return push / 2
  })
  const push = useSpring(rawPush, WAVE_SPRING)

  /** The −12px lift, and the tooltip riding the plate's new top edge. */
  const lift = useTransform(magnify, [1, MAG_SCALE], [0, -MAG_LIFT])
  const tooltipY = useTransform(
    magnify,
    [1, MAG_SCALE],
    [0, -(plateSize * (MAG_SCALE - 1) + MAG_LIFT)],
  )

  // Tap feedback: a press spring multiplied into the magnification, because
  // `whileTap={{scale}}` and `style={{scale}}` would fight for one slot.
  const pressTarget = useMotionValue(1)
  const press = useSpring(pressTarget, { stiffness: 420, damping: 26 })
  const scale = useTransform([magnify, press], ([m, p]: number[]) => m * p)

  const setButtonRef = (node: HTMLButtonElement | null) => {
    if (typeof buttonRef === 'function') buttonRef(node)
    else if (buttonRef) (buttonRef as { current: HTMLButtonElement | null }).current = node
    if (node && dataAttrs) {
      for (const [key, value] of Object.entries(dataAttrs)) {
        if (value === undefined) node.removeAttribute(key)
        else node.setAttribute(key, value)
      }
    }
  }

  return (
    <motion.div
      ref={(node) => registerItem(id, node)}
      data-glass-dock-item={id}
      className="group relative z-10 flex cursor-pointer flex-col items-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18, delay: index * 0.04 }}
      style={{ x: push }}
    >
      {/* Frosted tooltip (AI Canvas): visible on hover, pinned open for the
          active tab so the current page keeps its label on touch devices.
          The wide primary button already shows its label, so it skips this.
          `tooltipY` keeps it glued to the plate's top edge now that the
          plate's growth is a transform instead of a taller layout box. */}
      {!wide && (
        <motion.div
          className={`pointer-events-none absolute -top-10 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-white/90 ${
            active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          style={{
            y: tooltipY,
            background: DOCK_PANEL_BG,
            backdropFilter: DOCK_PANEL_BLUR,
            WebkitBackdropFilter: DOCK_PANEL_BLUR,
            border: DOCK_PANEL_BORDER,
            transition: 'opacity 0.15s',
          }}
        >
          {label}
        </motion.div>
      )}

      <motion.button
        ref={setButtonRef}
        type="button"
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onPointerDown={() => {
          pressTarget.set(TAP_SCALE)
          buttonProps?.onPointerDown?.()
        }}
        onPointerUp={() => {
          pressTarget.set(1)
          buttonProps?.onPointerUp?.()
        }}
        onPointerLeave={() => {
          pressTarget.set(1)
          buttonProps?.onPointerLeave?.()
        }}
        onPointerCancel={() => {
          pressTarget.set(1)
          buttonProps?.onPointerCancel?.()
        }}
        onContextMenu={(event) => buttonProps?.onContextMenu?.(event)}
        onClick={(event) => {
          if (skipClickRef.current) {
            skipClickRef.current = false
            event.preventDefault()
            return
          }
          buttonProps?.onClick?.(event)
          if (event.defaultPrevented) return
          onSelect()
        }}
        style={
          wide
            ? {
                height: plateSize,
                minWidth: 96,
                y: lift,
                scale: press,
                // Primary action: the app's indigo→violet, white bold label.
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                border: '1px solid rgba(255,255,255,0.22)',
                borderRadius: 12,
                boxShadow: '0 6px 18px -6px rgba(99,102,241,0.65), inset 0 1px 1px rgba(255,255,255,0.35)',
              }
            : {
                // FIXED box — the tap target never changes size, so a plate
                // can never shrink away from a finger mid-gesture.
                width: plateSize,
                height: plateSize,
                y: lift,
                scale,
                // Grows upward from its own baseline, exactly like the old
                // bottom-aligned flex row did.
                transformOrigin: '50% 100%',
                willChange: 'transform',
                // Notification-style tinted badge (AI Canvas): every icon sits on
                // its own colour-tinted plate; the active tab deepens the same
                // tint and gains a soft glow instead of switching palettes.
                background: active ? `${color}30` : `${color}18`,
                border: active ? `1px solid ${color}55` : `1px solid ${color}22`,
                borderRadius: 12,
                boxShadow: active ? `0 0 16px ${color}44` : 'none',
              }
        }
        className={`relative flex items-center justify-center select-none ${buttonProps?.className ?? ''}`}
      >
        {wide ? (
          <span className="whitespace-nowrap px-4 text-[13px] font-extrabold tracking-wide text-white">
            {label}
          </span>
        ) : (
          <>
            <span className="flex items-center justify-center" style={{ color }}>
              <Icon size={glyphFor(plateSize)} className="shrink-0" style={{ color, width: glyphFor(plateSize), height: glyphFor(plateSize) }} />
            </span>
            {extra}
          </>
        )}
        {!!badge && badge > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </motion.button>
    </motion.div>
  )
}

/**
 * The glyph stays proportional to its plate: 22 on 44, 20 on 38/34 — and, on
 * the Home dock's fill plate, whatever half of that plate is (30 on 60), with
 * the 20 px floor the compact/dense plates already sit on.
 */
function glyphFor(plateSize: number) {
  return Math.max(20, Math.round(plateSize / 2))
}

function idFromPoint(clientX: number, clientY: number): string | null {
  const stack = document.elementsFromPoint(clientX, clientY)
  for (const node of stack) {
    if (!(node instanceof Element)) continue
    const item = node.closest('[data-glass-dock-item]')
    const id = item?.getAttribute('data-glass-dock-item')
    if (id) return id
  }
  return null
}

export default function GlassDock({
  items,
  onSelect,
  siteFooter = false,
  leading,
  compact = false,
  dense = false,
  pointerX,
  fill = null,
}: {
  items: GlassDockItem[]
  onSelect: (id: string) => void
  siteFooter?: boolean
  leading?: ReactNode
  /**
   * Compact plates (38px instead of 44, tighter gaps + padding) for docks
   * with more tabs than the home footer — the course player's seven tabs
   * still fit a 360px phone. Springs, stagger, magnification, plates and
   * tooltips are otherwise identical.
   */
  compact?: boolean
  /** 34px plates used only for the eight-tab Home dock on very narrow phones. */
  dense?: boolean
  /**
   * Optional EXTERNAL pointer X the magnification wave follows. The dock
   * normally tracks the pointer itself; when a parent drives the same
   * gesture from elsewhere (e.g. the Course Player's bottom-centre peek
   * LINE — hold + drag across the line selects a tab), it passes its own
   * motion value here so the wave follows the finger during that drag too.
   */
  pointerX?: MotionValue<number>
  /**
   * Explicit resting geometry for a dock that must COVER the width it is
   * given (Home's eight-tab footer — see `GlassDockFill`). When present it
   * replaces the plate size the compact/dense flags would pick AND the
   * cascade's gap/padding, so the capsule and its icons are one size that
   * `SiteFooterNav` can compute per viewport; the springs, stagger,
   * magnification and tooltips are untouched. Absent everywhere else, which
   * is why every other dock keeps its authored rhythm.
   */
  fill?: GlassDockFill | null
}) {
  const internalMouseX = useMotionValue(-200)
  const mouseX = pointerX ?? internalMouseX
  const skipClickRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef(new Map<string, HTMLDivElement>())
  const plateSize = fill?.plateSize ?? (dense ? DENSE_ICON_SIZE : compact ? COMPACT_ICON_SIZE : ICON_SIZE)

  // Read during render so the (deliberately stable) callbacks below never go
  // stale and never need `items` in a dependency array.
  const itemsRef = useRef(items)
  itemsRef.current = items
  const plateSizeRef = useRef(plateSize)
  plateSizeRef.current = plateSize

  // The capsule's resting padding. With a fill the numbers are AUTHORITATIVE
  // (they are what this dock writes inline), so `measureNow` must never take
  // the cascade's value for them — it would read back a stale base when the
  // fill changes on a resize. Without one, the cascade decides exactly as
  // before: media rules win, the flags are the fallback.
  const fallbackPadTop = fill?.padBlock ?? (dense ? 8 : compact ? 10 : 12)
  const fallbackPadInline = fill?.padInline ?? (dense ? 4 : compact ? 12 : 16)
  const layoutRef = useRef<DockLayout>({
    centres: {},
    ids: [],
    padTop: fallbackPadTop,
    padInline: fallbackPadInline,
    spread: false,
  })
  /**
   * The resting padding as a MOTION VALUE, not a constant: the derived
   * `padInline` / `padTop` below only recompute when one of their sources
   * changes, and a fill that is re-solved on a resize is exactly that.
   * Publishing the new base here is what makes the capsule wear the new box in
   * the same commit — without it the dock would keep rendering the previous
   * viewport's padding until the next magnification gesture moved the spring.
   *
   * A fill's numbers are AUTHORITATIVE (they are the props this dock renders
   * with), so they are published during render — the same thing framer does for
   * its own derived values, and the only way the value is already correct when
   * the derived padding is read in that commit. Without a fill the measurement
   * in `measureNow` owns the base, exactly as before; publishing the flag
   * fallback here would overwrite what the media rules said.
   */
  const padTopBase = useMotionValue(fallbackPadTop)
  const padInlineBase = useMotionValue(fallbackPadInline)
  if (fill) {
    if (padTopBase.get() !== fill.padBlock) padTopBase.set(fill.padBlock)
    if (padInlineBase.get() !== fill.padInline) padInlineBase.set(fill.padInline)
  }

  const registerItem = useCallback((id: string, node: HTMLDivElement | null) => {
    if (node) nodesRef.current.set(id, node)
    else nodesRef.current.delete(id)
  }, [])

  // ── the capsule's growth ──────────────────────────────────────────────────
  // ONE element (the dock root) carries the whole envelope change, through
  // padding — the plates themselves never resize. `padding-top` grows the
  // capsule upward only, which is what the bottom-aligned row used to do;
  // `padding-inline` grows it symmetrically, which is what a centred
  // `w-max` capsule did when its plates widened.
  const rawGrowX = useTransform(mouseX, (mx: number) => {
    if (mx < 0) return 0
    let total = 0
    for (const id of layoutRef.current.ids) {
      const centre = layoutRef.current.centres[id]
      total += growthFor(centre === undefined ? FAR : Math.abs(mx - centre), plateSizeRef.current)
    }
    return total
  })
  const rawGrowY = useTransform(mouseX, (mx: number) => {
    if (mx < 0) return 0
    let max = 0
    for (const id of layoutRef.current.ids) {
      const centre = layoutRef.current.centres[id]
      max = Math.max(
        max,
        growthFor(centre === undefined ? FAR : Math.abs(mx - centre), plateSizeRef.current),
      )
    }
    return max
  })
  const growX = useSpring(rawGrowX, WAVE_SPRING)
  const growY = useSpring(rawGrowY, WAVE_SPRING)
  const padInline = useTransform(
    [growX, padInlineBase],
    ([growth, base]: number[]) => base + (layoutRef.current.spread ? 0 : growth / 2),
  )
  const padTop = useTransform([growY, padTopBase], ([growth, base]: number[]) => base + growth)

  /** The wave is settled: the capsule is wearing its resting box. */
  const atRest = () => Math.abs(growX.get()) < 0.5 && Math.abs(growY.get()) < 0.5

  const retryRef = useRef<number | null>(null)

  /**
   * The ONE layout read of a gesture. The wave no longer changes any plate's
   * box, so the resting centres measured here stay true for the whole drag —
   * this runs on mount, on resize, and once on pointerdown (before the wave
   * starts, while every plate is still at rest). It never runs per frame.
   *
   * It also refuses to run while the wave is live, and that is not a
   * refinement: `getComputedStyle` reports the capsule's ANIMATED padding,
   * and the plates' pushed positions, so measuring mid-spring would take the
   * magnified capsule for the resting one and grow the dock a little further
   * on every gesture. A deferred retry closes the gap for a resize that lands
   * mid-gesture.
   */
  const measureNow = useCallback(() => {
    const root = rootRef.current
    const centres: Record<string, number> = {}
    for (const [id, node] of nodesRef.current) {
      const rect = node.getBoundingClientRect()
      if (rect.width > 0) centres[id] = rect.left + rect.width / 2
    }
    let padTopValue = fallbackPadTop
    let padInlineValue = fallbackPadInline
    let spread = false
    if (root && typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
      const style = window.getComputedStyle(root)
      // A filled dock OWNS its padding, so there is nothing to read back: the
      // numbers it is already rendering with ARE the base. (Reading the
      // computed value would freeze the previous viewport's padding into the
      // dock, because the inline style this read returns is the one the dock
      // itself wrote.) The row's spread mode is still the cascade's business.
      if (!fill) {
        const top = parseFloat(style.paddingTop)
        const inline = parseFloat(style.paddingLeft)
        if (Number.isFinite(top) && top > 0) padTopValue = top
        if (Number.isFinite(inline) && inline > 0) padInlineValue = inline
      }
      spread = style.justifyContent === 'space-between'
    }
    const ids = itemsRef.current.map((item) => item.id).filter((id) => centres[id] !== undefined)
    layoutRef.current = { centres, ids, padTop: padTopValue, padInline: padInlineValue, spread }
    // Publish the resting padding so the capsule wears it on this frame (see
    // `padTopBase` / `padInlineBase`).
    padTopBase.set(padTopValue)
    padInlineBase.set(padInlineValue)
  }, [fill, fallbackPadInline, fallbackPadTop, padInlineBase, padTopBase])

  const measure = useCallback(() => {
    if (atRest()) {
      measureNow()
      return
    }
    if (retryRef.current !== null || typeof window === 'undefined') return
    retryRef.current = window.setTimeout(() => {
      retryRef.current = null
      measureNow()
    }, GESTURE_SETTLE_MS + 120)
  }, [measureNow])

  useLayoutEffect(() => {
    measure()
  }, [measure, plateSize, items.length])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    let frame: number | null = null
    const onResize = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        measure()
      })
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [measure])

  // ── pointer → wave, one update per frame ──────────────────────────────────
  const pendingX = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const settleTimer = useRef<number | null>(null)

  const beginGesture = useCallback(() => {
    // The flag footerNavSpace waits for: while a gesture is live the footer's
    // height is mid-spring, so publishing it would write a custom property on
    // <html> — a document-wide style recalculation — on the busiest frames of
    // the drag. Set once per gesture, not once per frame.
    if (typeof document !== 'undefined') document.documentElement.dataset.dcDockGesture = 'true'
    if (settleTimer.current !== null) {
      window.clearTimeout(settleTimer.current)
      settleTimer.current = null
    }
  }, [])

  const endGesture = useCallback(() => {
    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null
      if (typeof document !== 'undefined') delete document.documentElement.dataset.dcDockGesture
    }, GESTURE_SETTLE_MS)
  }, [])

  const flush = useCallback(() => {
    frameRef.current = null
    const next = pendingX.current
    if (next === null) return
    pendingX.current = null
    mouseX.set(next)
  }, [mouseX])

  const trackPointer = useCallback(
    (clientX: number) => {
      beginGesture()
      endGesture()
      pendingX.current = clientX
      // A 120 Hz panel fires two or three moves per frame; the spring only
      // needs the last one. Coalescing keeps the wave at display rate.
      if (frameRef.current === null && typeof window !== 'undefined') {
        frameRef.current = window.requestAnimationFrame(flush)
      }
    },
    [beginGesture, endGesture, flush],
  )

  const resetPointer = useCallback(() => {
    pendingX.current = null
    if (frameRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    mouseX.set(-200)
    endGesture()
  }, [endGesture, mouseX])

  useEffect(
    () => () => {
      if (frameRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      if (settleTimer.current !== null) {
        window.clearTimeout(settleTimer.current)
        settleTimer.current = null
      }
      if (retryRef.current !== null) {
        window.clearTimeout(retryRef.current)
        retryRef.current = null
      }
      if (typeof document !== 'undefined') delete document.documentElement.dataset.dcDockGesture
    },
    [],
  )

  return (
    <motion.div
      ref={rootRef}
      initial={{ y: 50 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 180, damping: 20 }}
      onPointerDown={(event) => {
        // One read per gesture, taken while every plate is still at rest.
        measure()
        if (event.pointerType !== 'mouse') {
          trackPointer(event.clientX)
          try {
            event.currentTarget.setPointerCapture?.(event.pointerId)
          } catch {
            /* capture is a nicety — the wave still follows without it */
          }
        }
      }}
      onPointerMove={(event) => trackPointer(event.clientX)}
      onPointerLeave={resetPointer}
      onPointerUp={(event) => {
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId)
        } catch {
          /* ignore */
        }
        if (event.pointerType === 'mouse') return
        const id = idFromPoint(event.clientX, event.clientY)
        resetPointer()
        if (!id) return
        skipClickRef.current = true
        window.setTimeout(() => {
          skipClickRef.current = false
        }, 400)
        onSelect(id)
      }}
      onPointerCancel={(event) => {
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId)
        } catch {
          /* ignore */
        }
        resetPointer()
      }}
      className={`relative isolate mx-auto flex w-max max-w-full shrink-0 items-end rounded-3xl ${
        dense ? 'gap-0.5 px-1 pb-2 pt-2' : compact ? 'gap-1.5 px-3 pb-2.5 pt-2.5' : 'gap-2 px-4 pb-3 pt-3'
      }`}
      style={{
        touchAction: 'none',
        // A filled dock's rhythm comes from the numbers `SiteFooterNav`
        // measured for this viewport — inline, so it also outranks the fit
        // bands that tighten the eight-tab rhythm on a narrow phone. Without a
        // fill these are `undefined` and the authored classes stand.
        gap: fill ? fill.gap : undefined,
        paddingTop: padTop,
        paddingInline: padInline,
        paddingBottom: fill ? fill.padBlock : undefined,
        // The capsule's own box is the only thing that re-lays out during a
        // gesture; keep that work inside the dock and off the page.
        contain: 'layout style',
        background: DOCK_PANEL_BG,
        border: DOCK_PANEL_BORDER,
        boxShadow: DOCK_PANEL_SHADOW,
      }}
      data-glass-dock=""
      data-site-footer={siteFooter ? '' : undefined}
    >
      {/* The WebsiteGlass lens itself — the pinned docs sensitivity
          (radius 24 · strength 0.5 · blur 4 · tint 0.25): rim refraction on
          Chromium, the frosted panel material everywhere else. Static layer —
          the magnification wave never re-blurs it. */}
      <GlassMaterial />
      {leading}
      {items.map((item, i) => (
        <DockItem
          key={item.id}
          {...item}
          mouseX={mouseX}
          index={i}
          skipClickRef={skipClickRef}
          plateSize={plateSize}
          layoutRef={layoutRef}
          registerItem={registerItem}
          onSelect={() => onSelect(item.id)}
        />
      ))}
    </motion.div>
  )
}
