'use client'

/**
 * Renders a horizontally scrollable glass dock of labeled icons.
 * Nearby icons magnify and lift as the pointer moves across the dock.
 *
 * Animation constants, spring physics, distance mapping, tooltip chrome
 * and glass materials are copied EXACTLY from the provided GlassDock
 * spec so the magnification reads identically on tablet and mobile.
 *
 * Old footer implementations are stored at:
 *   src/components/glass-dock/stored/
 * Navigation / hold / badge logic stays in each BottomNav caller.
 */

import { useRef, type CSSProperties, type ComponentType, type ReactNode, type Ref } from 'react'
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion'

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
}: GlassDockItem & {
  mouseX: MotionValue<number>
  index: number
  onSelect: () => void
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
      className="group relative flex cursor-pointer flex-col items-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18, delay: index * 0.04 }}
    >
      <motion.div
        className={`pointer-events-none absolute -top-10 rounded-lg px-3 py-1.5 text-xs font-medium text-white/90 ${
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
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
          buttonProps?.onClick?.(event)
          if (event.defaultPrevented) return
          onSelect()
        }}
        style={{
          width: size,
          height: size,
          y,
          background: `${color}18`,
          border: `1px solid ${color}22`,
          borderRadius: 12,
          boxShadow: active ? `0 0 16px ${color}55` : undefined,
        }}
        whileTap={{ scale: 0.82 }}
        className={`relative flex items-center justify-center select-none ${buttonProps?.className ?? ''}`}
      >
        {dataAttrs
          ? Object.entries(dataAttrs).map(([key, value]) =>
              value === undefined ? null : <span key={key} hidden {...{ [key]: value }} />,
            )
          : null}
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

  const trackPointer = (clientX: number) => mouseX.set(clientX)
  const resetPointer = () => mouseX.set(-200)

  return (
    <div className="pointer-events-none flex w-full overflow-x-auto py-12 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <motion.div
        initial={{ y: 50 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 20 }}
        onMouseMove={(e) => trackPointer(e.clientX)}
        onMouseLeave={resetPointer}
        onPointerMove={(e) => trackPointer(e.clientX)}
        onPointerLeave={resetPointer}
        onPointerCancel={resetPointer}
        className="pointer-events-auto relative isolate mx-auto flex shrink-0 items-end gap-2 rounded-3xl px-4 pb-3 pt-3"
        style={{
          background: 'rgba(26, 26, 25, 0.78)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 8px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        }}
        data-glass-dock=""
        data-site-footer={siteFooter ? '' : undefined}
      >
        <div
          className="pointer-events-none absolute inset-0 z-[-1] rounded-3xl"
          style={{
            background: 'rgba(255, 255, 255, 0.06)',
            backdropFilter: 'blur(24px) saturate(1.8)',
            WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
          }}
        />
        {leading}
        {items.map((item, i) => (
          <DockItem
            key={item.id}
            {...item}
            mouseX={mouseX}
            index={i}
            onSelect={() => onSelect(item.id)}
          />
        ))}
      </motion.div>
    </div>
  )
}
