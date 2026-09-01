'use client'

/**
 * Renders a glass dock of labeled icons in the original footer slot.
 * Nearby icons magnify and lift as the pointer or finger moves across.
 * Lifting a finger on an icon selects it.
 *
 * MAG constants match the GlassDock spec. The capsule hugs its icons —
 * no full-width strip. Bar finish is WebsiteGlass refraction / frost /
 * tint / blur (strength 0.28, frost 0.3, radius 20, accent #38bdf8).
 *
 * Old footer implementations: src/components/glass-dock/stored/
 */

import { useRef, type CSSProperties, type ComponentType, type ReactNode, type Ref } from 'react'
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion'
import GlassMaterial, {
  GLASS_ACCENT,
  GLASS_PILL_RADIUS,
  GLASS_RADIUS,
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 18, delay: index * 0.04 }}
    >
      <motion.div
        className={`pointer-events-none absolute -top-10 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-800/90 ${
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
        style={{
          background: 'rgba(255, 255, 255, 0.22)',
          backdropFilter: 'blur(16px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.6)',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.9), 0 8px 20px -10px rgba(0,0,0,0.22)',
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
          background: active ? `${GLASS_ACCENT}33` : 'rgba(255,255,255,0.16)',
          border: active ? `1px solid ${GLASS_ACCENT}66` : '1px solid rgba(255,255,255,0.38)',
          borderRadius: GLASS_PILL_RADIUS,
          boxShadow: active
            ? `0 0 16px ${GLASS_ACCENT}55, inset 0 1px 1px rgba(255,255,255,0.7)`
            : 'inset 0 1px 1px rgba(255,255,255,0.7)',
        }}
        whileTap={{ scale: 0.82 }}
        className={`relative flex items-center justify-center select-none ${buttonProps?.className ?? ''}`}
      >
        <span className="flex items-center justify-center" style={{ color: active ? GLASS_ACCENT : color }}>
          <Icon size={22} className="h-[22px] w-[22px] shrink-0" style={{ color: active ? GLASS_ACCENT : color }} />
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
      className="relative mx-auto flex w-max max-w-full shrink-0 items-end gap-2 px-3 py-2"
      style={{
        touchAction: 'none',
        borderRadius: GLASS_RADIUS,
        boxShadow:
          'inset 0 1px 1px rgba(255,255,255,0.9), inset 0 0 0 1px rgba(255,255,255,0.4), 0 14px 38px -12px rgba(0,0,0,0.28)',
      }}
      data-glass-dock=""
      data-site-footer={siteFooter ? '' : undefined}
    >
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
