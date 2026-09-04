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
 */

import { useRef, type CSSProperties, type ComponentType, type ReactNode, type Ref } from 'react'
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion'
import GlassMaterial, {
  DOCK_PANEL_BG,
  DOCK_PANEL_BLUR,
  DOCK_PANEL_BORDER,
  DOCK_PANEL_SHADOW,
} from './GlassMaterial'

export const ICON_SIZE = 44
export const MAG_RANGE = 120
export const MAG_SCALE = 1.55

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
  onSelect,
  skipClickRef,
}: GlassDockItem & {
  mouseX: MotionValue<number>
  index: number
  onSelect: () => void
  skipClickRef: { current: boolean }
}) {
  const ref = useRef<HTMLDivElement>(null)

  const distance = useTransform(mouseX, (mx: number) => {
    const el = ref.current
    if (!el || mx < 0) return 200
    const rect = el.getBoundingClientRect()
    const center = rect.left + rect.width / 2
    return Math.abs(mx - center)
  })

  const rawSize = useTransform(distance, [0, MAG_RANGE], [ICON_SIZE * MAG_SCALE, ICON_SIZE])
  const size = useSpring(rawSize, { stiffness: 300, damping: 22, mass: 0.5 })
  const y = useTransform(size, [ICON_SIZE, ICON_SIZE * MAG_SCALE], [0, -12])

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
      ref={ref}
      data-glass-dock-item={id}
      className="group relative z-10 flex cursor-pointer flex-col items-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18, delay: index * 0.04 }}
    >
      {/* Frosted tooltip (AI Canvas): visible on hover, pinned open for the
          active tab so the current page keeps its label on touch devices. */}
      <motion.div
        className={`pointer-events-none absolute -top-10 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium text-white/90 ${
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{
          background: DOCK_PANEL_BG,
          backdropFilter: DOCK_PANEL_BLUR,
          WebkitBackdropFilter: DOCK_PANEL_BLUR,
          border: DOCK_PANEL_BORDER,
          transition: 'opacity 0.15s',
        }}
      >
        {label}
      </motion.div>

      <motion.button
        ref={setButtonRef}
        type="button"
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        onPointerDown={() => buttonProps?.onPointerDown?.()}
        onPointerUp={() => buttonProps?.onPointerUp?.()}
        onPointerLeave={() => buttonProps?.onPointerLeave?.()}
        onPointerCancel={() => buttonProps?.onPointerCancel?.()}
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
        style={{
          width: size,
          height: size,
          y,
          // Notification-style tinted badge (AI Canvas): every icon sits on
          // its own colour-tinted plate; the active tab deepens the same
          // tint and gains a soft glow instead of switching palettes.
          background: active ? `${color}30` : `${color}18`,
          border: active ? `1px solid ${color}55` : `1px solid ${color}22`,
          borderRadius: 12,
          boxShadow: active ? `0 0 16px ${color}44` : 'none',
        }}
        whileTap={{ scale: 0.82 }}
        className={`relative flex items-center justify-center select-none ${buttonProps?.className ?? ''}`}
      >
        <span className="flex items-center justify-center" style={{ color }}>
          <Icon size={22} className="h-[22px] w-[22px] shrink-0" style={{ color }} />
        </span>
        {extra}
        {!!badge && badge > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </motion.button>
    </motion.div>
  )
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
}: {
  items: GlassDockItem[]
  onSelect: (id: string) => void
  siteFooter?: boolean
  leading?: ReactNode
}) {
  const mouseX = useMotionValue(-200)
  const skipClickRef = useRef(false)

  const trackPointer = (clientX: number) => mouseX.set(clientX)
  const resetPointer = () => mouseX.set(-200)

  return (
    <motion.div
      initial={{ y: 50 }}
      animate={{ y: 0 }}
      transition={{ type: 'spring', stiffness: 180, damping: 20 }}
      onPointerDown={(event) => {
        if (event.pointerType !== 'mouse') trackPointer(event.clientX)
      }}
      onPointerMove={(event) => trackPointer(event.clientX)}
      onPointerLeave={resetPointer}
      onPointerUp={(event) => {
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
      onPointerCancel={resetPointer}
      className="relative isolate mx-auto flex w-max max-w-full shrink-0 items-end gap-2 rounded-3xl px-4 pb-3 pt-3"
      style={{
        touchAction: 'none',
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
          onSelect={() => onSelect(item.id)}
        />
      ))}
    </motion.div>
  )
}
