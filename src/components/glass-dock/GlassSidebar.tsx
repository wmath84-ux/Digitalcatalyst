'use client'

/**
 * Glass Sidebar — the AI Canvas component
 * (https://aicanvas.me/components/glass-sidebar), look / animation /
 * minimising logic exact:
 *   · COLLAPSED_WIDTH 64 → EXPANDED_WIDTH 220, driven by
 *     useSpring(stiffness 280 / damping 26) — the panel expands rightward
 *     inside a fixed EXPANDED_WIDTH container so the left edge never moves,
 *   · entrance x:-20 → 0, spring 200/22 delay 0.1,
 *   · frosted panel: rgba-white pane + hairline border + deep shadow with an
 *     inset top-light, and a SEPARATE z-[-1] blur layer (blur 24 / sat 1.8),
 *   · 44×44 tinted icon tiles (active `${color}28`/`${color}44`, idle
 *     `${color}18`/`${color}22`), icon size 20,
 *   · row motion: hover scale 1.08 open / 1.15 collapsed (+3px x when
 *     collapsed), tap 0.90, spring 320/20,
 *   · labels only when open, staggered in (0.18 + index*0.03, dur 0.18) and
 *     out fast (0.08),
 *   · collapsed + hovered → right-side frosted tooltip at left-[calc(100%+10px)],
 *     and `hovered` resets whenever `isOpen` flips so no tooltip sticks,
 *   · 1px divider, then the 44×36 rounded-2xl toggle whose arrow spins 90°
 *     on every swap (AnimatePresence mode="wait", 0.18).
 *
 * This is the rail used on the SMALLEST screen band that still shows the
 * desktop side panel (tablet / narrow-desktop, ≤1023px) — see DesktopShell.
 */

import { useEffect, useState, type ComponentType } from 'react'
import { AnimatePresence, motion, useSpring } from 'framer-motion'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import {
  DOCK_PANEL_BG,
  DOCK_PANEL_BLUR,
  DOCK_PANEL_BORDER,
  DOCK_PANEL_SHADOW,
} from './GlassMaterial'

export const COLLAPSED_WIDTH = 64
export const EXPANDED_WIDTH = 220
const ICON_TILE_SIZE = 44
const TOGGLE_BUTTON_HEIGHT = 36

export type GlassSidebarItem = {
  id: string
  label: string
  color: string
  Icon: ComponentType<{ size?: number; className?: string }>
  active?: boolean
  badge?: number
}

function SidebarRow({
  item,
  index,
  isOpen,
  onSelect,
}: {
  item: GlassSidebarItem
  index: number
  isOpen: boolean
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  // Reset hover whenever the rail collapses/expands so a tooltip can never
  // stay stuck on screen after the layout changes under the pointer.
  useEffect(() => {
    setHovered(false)
  }, [isOpen])

  const { Icon, color, active } = item

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      animate={{
        scale: hovered ? (isOpen ? 1.08 : 1.15) : 1,
        x: hovered ? (isOpen ? 0 : 3) : 0,
      }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 320, damping: 20 }}
      className="relative flex w-full items-center gap-3 rounded-2xl outline-none"
      data-glass-sidebar-item={item.id}
      data-active={active ? 'true' : 'false'}
    >
      <span
        className="relative grid shrink-0 place-items-center rounded-xl"
        style={{
          width: ICON_TILE_SIZE,
          height: ICON_TILE_SIZE,
          background: active ? `${color}28` : `${color}18`,
          border: `1px solid ${active ? `${color}44` : `${color}22`}`,
        }}
      >
        <Icon size={20} />
        {!!item.badge && item.badge > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {item.badge > 9 ? '9+' : item.badge}
          </span>
        )}
      </span>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.span
            key="label"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.18, delay: 0.18 + index * 0.03 }}
            className="truncate text-sm font-semibold"
            style={{ color: active ? color : 'rgba(255,255,255,0.75)' }}
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>

      {/* Collapsed + hovered → frosted tooltip to the right of the tile. */}
      <AnimatePresence>
        {!isOpen && hovered && (
          <motion.span
            key="tip"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute left-[calc(100%+10px)] z-50 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-white/90"
            style={{
              background: 'rgba(255,255,255,0.1)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  )
}

export default function GlassSidebar({
  items,
  onSelect,
  header,
  footer,
  open,
  onOpenChange,
}: {
  items: GlassSidebarItem[]
  onSelect: (id: string) => void
  /** Optional brand block, shown only while expanded. */
  header?: React.ReactNode
  /** Optional footer block (profile / logout), shown only while expanded. */
  footer?: React.ReactNode
  /** Controlled open state; omit for the component's own state. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [innerOpen, setInnerOpen] = useState(false)
  const isOpen = open ?? innerOpen
  const width = useSpring(isOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH, {
    stiffness: 280,
    damping: 26,
  })

  const setOpen = (next: boolean) => {
    if (open === undefined) setInnerOpen(next)
    onOpenChange?.(next)
    width.set(next ? EXPANDED_WIDTH : COLLAPSED_WIDTH)
  }

  // Keep the spring in sync when the state is driven from outside.
  useEffect(() => {
    width.set(isOpen ? EXPANDED_WIDTH : COLLAPSED_WIDTH)
  }, [isOpen, width])

  return (
    // Fixed-width container: the panel grows rightward from a stable left edge.
    <div
      className="relative h-full shrink-0"
      style={{ width: COLLAPSED_WIDTH }}
      data-glass-sidebar-slot
      data-open={isOpen ? 'true' : 'false'}
    >
      <motion.aside
        initial={{ x: -20 }}
        animate={{ x: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 22, delay: 0.1 }}
        style={{
          width,
          background: DOCK_PANEL_BG,
          border: DOCK_PANEL_BORDER,
          boxShadow: DOCK_PANEL_SHADOW,
        }}
        className="absolute inset-y-0 left-0 z-40 isolate flex flex-col gap-1 overflow-hidden rounded-3xl px-2.5 py-3"
        aria-label="Primary"
        data-glass-sidebar
      >
        {/* Separate non-animating blur layer. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-[-1] rounded-3xl"
          style={{ backdropFilter: DOCK_PANEL_BLUR, WebkitBackdropFilter: DOCK_PANEL_BLUR }}
        />

        {header ? (
          <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div
                key="header"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ duration: 0.18, delay: 0.18 }}
                className="mb-1 min-w-0 px-1"
              >
                {header}
              </motion.div>
            )}
          </AnimatePresence>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          {items.map((item, index) => (
            <SidebarRow
              key={item.id}
              item={item}
              index={index}
              isOpen={isOpen}
              onSelect={() => onSelect(item.id)}
            />
          ))}
        </div>

        {footer ? (
          <AnimatePresence initial={false}>
            {isOpen && (
              <motion.div
                key="footer"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.08 } }}
                transition={{ duration: 0.18, delay: 0.2 }}
                className="min-w-0 px-1"
              >
                {footer}
              </motion.div>
            )}
          </AnimatePresence>
        ) : null}

        {/* Divider */}
        <div className="h-[1px] w-full shrink-0" style={{ background: 'rgba(255,255,255,0.1)' }} aria-hidden />

        {/* Toggle */}
        <div className={`flex shrink-0 ${isOpen ? 'justify-start px-1' : 'justify-center'}`}>
          <motion.button
            type="button"
            onClick={() => setOpen(!isOpen)}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            aria-label={isOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-expanded={isOpen}
            className="grid place-items-center rounded-2xl text-white/70"
            style={{
              width: ICON_TILE_SIZE,
              height: TOGGLE_BUTTON_HEIGHT,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
            data-glass-sidebar-toggle
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={isOpen ? 'left' : 'right'}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="grid place-items-center"
              >
                {isOpen ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.aside>
    </div>
  )
}
