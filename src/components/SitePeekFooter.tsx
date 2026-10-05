'use client'

/**
 * Home / My Day footer — the Course Player peek-dock interaction, wearing
 * the site GlassDock (home icons, siteFooter material).
 *
 * Owner brief (2026-10-04): apply the course player's footer drag / reveal
 * animation (not its icons) to the homepage footer, then mount that same
 * footer on My Day. The line, the hold-drag wave, the tap-to-pin, and the
 * "hide only when the pointer leaves the area" rule are the course dock's;
 * the plates are BottomNav's.
 *
 * `alwaysOpen` (owner brief 2026-10-05, Home): the dock is visible by default
 * and never collapses — not on load, resize, rotation, keyboard or any
 * breakpoint. Revealing it must not depend on a gesture, so the line stops
 * being a toggle (no tap-to-pin, no hover-to-reveal state that could close
 * it); it stays as the optional hold-drag strip for the magnification wave
 * and drag-to-select. Because the nav is then always at its full height,
 * `utils/footerNavSpace` publishes the real clearance and page content is
 * never hidden behind it.
 */

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useMotionValue, type MotionValue } from 'framer-motion'
import GlassDock, { type GlassDockItem } from './glass-dock/GlassDock'
import GlassMaterial from './glass-dock/GlassMaterial'
import { isInsidePeekDockArea, peekDockAreaOf } from './glass-dock/peekDockArea'

const DRAG_SELECT_THRESHOLD = 12
const CLOSE_GRACE_MS = 80

export default function SitePeekFooter({
  label,
  items,
  onSelect,
  compact = false,
  alwaysOpen = false,
  dataAttrs,
}: {
  label: string
  items: GlassDockItem[]
  onSelect: (id: string) => void
  compact?: boolean
  /** Dock always visible; the line is only an optional drag strip. */
  alwaysOpen?: boolean
  dataAttrs?: Record<string, string | undefined>
}) {
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const rootRef = useRef<HTMLElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const wasPinnedRef = useRef(false)
  const pointerTypeRef = useRef('mouse')
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const pinnedRef = useRef(false)
  pinnedRef.current = pinned
  const pointerX: MotionValue<number> = useMotionValue(-200)

  const open = alwaysOpen || hover || pinned

  const rememberPointer = useCallback((x: number, y: number) => {
    pointerRef.current = { x, y }
  }, [])

  const pointerInArea = useCallback(() => {
    const point = pointerRef.current
    if (!point) return false
    return isInsidePeekDockArea(point.x, point.y, [
      peekDockAreaOf(lineRef.current),
      peekDockAreaOf(panelRef.current),
    ])
  }, [])

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const show = useCallback(
    (event?: ReactPointerEvent<HTMLElement>) => {
      if (event) rememberPointer(event.clientX, event.clientY)
      cancelClose()
      setHover(true)
    },
    [cancelClose, rememberPointer],
  )

  const hide = useCallback(
    (event?: ReactPointerEvent<HTMLElement>) => {
      if (event) rememberPointer(event.clientX, event.clientY)
      cancelClose()
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null
        if (pinnedRef.current) return
        if (pointerInArea()) return
        setHover(false)
      }, CLOSE_GRACE_MS)
    },
    [cancelClose, pointerInArea, rememberPointer],
  )

  useEffect(() => {
    if (!pinned) return undefined
    const onDown = (event: PointerEvent) => {
      const root = rootRef.current
      if (root && event.target instanceof Node && root.contains(event.target)) return
      setPinned(false)
      setHover(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [pinned])

  useEffect(
    () => () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined
    const onMove = (event: PointerEvent) => rememberPointer(event.clientX, event.clientY)
    const onDocumentLeave = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      if (event.relatedTarget) return
      pointerRef.current = null
      hide()
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('pointerleave', onDocumentLeave)
    document.addEventListener('pointerout', onDocumentLeave)
    return () => {
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerleave', onDocumentLeave)
      document.removeEventListener('pointerout', onDocumentLeave)
    }
  }, [open, hide, rememberPointer])

  const tabAtX = useCallback((clientX: number): string | null => {
    const root = rootRef.current
    if (!root) return null
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-glass-dock-item]'))
    let best: string | null = null
    let bestDist = Infinity
    for (const node of nodes) {
      const rect = node.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const dist = Math.abs(rect.left + rect.width / 2 - clientX)
      if (dist < bestDist) {
        bestDist = dist
        best = node.getAttribute('data-glass-dock-item')
      }
    }
    return best
  }, [])

  const handleSelect = useCallback(
    (id: string) => {
      setPinned(false)
      setHover(false)
      pointerX.set(-200)
      onSelect(id)
    },
    [onSelect, pointerX],
  )

  const close = useCallback(() => {
    setPinned(false)
    setHover(false)
    pointerX.set(-200)
  }, [pointerX])

  return (
    <nav
      ref={rootRef}
      data-site-footer-nav
      data-site-peek-dock=""
      data-open={open ? 'true' : 'false'}
      data-pinned={pinned ? 'true' : 'false'}
      data-always-open={alwaysOpen ? 'true' : undefined}
      data-dock-count={String(items.length)}
      {...dataAttrs}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex w-full flex-col items-center overflow-visible"
      aria-label={label}
    >
      <div
        ref={panelRef}
        data-site-peek-panel=""
        data-site-footer
        aria-hidden={!open}
        inert={!open}
        onPointerEnter={show}
        onPointerLeave={hide}
        className="pointer-events-none"
      >
        <div className="pointer-events-auto mx-auto w-max max-w-full">
          <GlassDock siteFooter compact={compact} items={items} onSelect={handleSelect} pointerX={pointerX} />
        </div>
      </div>
      {!alwaysOpen ? (
        <div
          ref={lineRef}
          data-site-peek-line-hit=""
          // Drag/peek line for minimized states; completely hidden when alwaysOpen
          role="button"
          tabIndex={0}
          aria-label="Show site navigation"
          aria-expanded={open}
          onPointerEnter={show}
          onPointerLeave={hide}
          onPointerDown={(event) => {
            pointerTypeRef.current = event.pointerType
            wasPinnedRef.current = pinned
            draggingRef.current = true
            startXRef.current = event.clientX
            startYRef.current = event.clientY
            rememberPointer(event.clientX, event.clientY)
            cancelClose()
            setHover(true)
            if (event.pointerType !== 'mouse') setPinned(true)
            pointerX.set(event.clientX)
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {
              /* capture is a nicety — the drag still works without it */
            }
          }}
          onPointerMove={(event) => {
            if (!draggingRef.current) return
            rememberPointer(event.clientX, event.clientY)
            pointerX.set(event.clientX)
          }}
          onPointerUp={(event) => {
            if (!draggingRef.current) return
            draggingRef.current = false
            try {
              event.currentTarget.releasePointerCapture?.(event.pointerId)
            } catch {
              /* ignore */
            }
            const dx = event.clientX - startXRef.current
            const dy = event.clientY - startYRef.current
            const isTap = Math.abs(dx) < DRAG_SELECT_THRESHOLD && Math.abs(dy) < DRAG_SELECT_THRESHOLD
            if (isTap) {
              if (pointerTypeRef.current !== 'mouse') {
                if (wasPinnedRef.current) close()
                else setPinned(true)
              }
              return
            }
            const isHorizontalDrag =
              Math.abs(dx) >= DRAG_SELECT_THRESHOLD && Math.abs(dx) > Math.abs(dy)
            if (!isHorizontalDrag) {
              close()
              return
            }
            const id = tabAtX(event.clientX)
            if (id) handleSelect(id)
            else close()
          }}
          onPointerCancel={() => {
            draggingRef.current = false
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              setPinned((value) => !value)
            }
          }}
        >
          <div data-site-peek-line="">
            <GlassMaterial radius={6} />
          </div>
        </div>
      ) : null}
    </nav>
  )
}
