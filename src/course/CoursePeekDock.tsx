// src/course/CoursePeekDock.tsx
//
// The Course Player's footer navigation, rebuilt as the SAME bottom-centre
// peek dock the desktop shell already uses
// (src/components/glass-dock/DesktopPeekDock.tsx):
//
//   · a thin frosted-glass LINE sits at the very bottom centre of the player;
//   · tapping the line (or hovering it with a pointer) OPENS the footer dock
//     — the exact same GlassDock the study pane used to hold;
//   · HOLD + DRAG across the line scrolls the dock: the dock opens on the
//     press, the magnification wave follows the finger left/right (the line
//     drives GlassDock's pointer X), and lifting the finger SELECTS the tab
//     nearest to it — the button the finger settles on is clicked;
//   · once open, swiping LEFT / RIGHT across the dock itself and lifting the
//     finger on a tab selects that tab (GlassDock's own onPointerUp);
//   · picking a tab (or tapping away / tapping the line again) closes it.
//
// Pointer (mouse) interaction works the desktop way: enter reveals, leave
// hides. Touch has no hover, so a tap TOGGLES the dock open/closed and it
// stays open while the learner swipes it. Selecting a tab always closes.
//
// The old always-visible in-pane dock is still one Player-settings row away:
// the "Always-visible footer dock" preference (Player tab → Player settings)
// turns this peek dock off and restores the study pane's dock.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMotionValue, type MotionValue } from 'framer-motion'
import GlassDock, { type GlassDockItem } from '../components/glass-dock/GlassDock'
import GlassMaterial from '../components/glass-dock/GlassMaterial'
import { buildDockItems, type DockTab } from './CourseOverlay'

/** Horizontal travel (px) below which a press counts as a tap, not a drag. */
const DRAG_SELECT_THRESHOLD = 12

export default function CoursePeekDock({
  tab,
  onTabChange,
}: {
  tab: DockTab
  onTabChange: (tab: DockTab) => void
}) {
  // `hover` covers pointer (mouse) hover; `pinned` covers the touch tap
  // toggle. The dock is open while EITHER is true.
  const [hover, setHover] = useState(false)
  const [pinned, setPinned] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const startYRef = useRef(0)
  const wasOpenRef = useRef(false)
  const pointerTypeRef = useRef('mouse')
  // The magnification wave's pointer X — the dock follows it. Shared so the
  // LINE's hold-drag drives the same wave the dock's own pointer moves do.
  const pointerX: MotionValue<number> = useMotionValue(-200)

  const open = hover || pinned

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const show = useCallback(() => {
    cancelClose()
    setHover(true)
  }, [cancelClose])

  const hide = useCallback(() => {
    cancelClose()
    closeTimerRef.current = window.setTimeout(() => {
      setHover(false)
      closeTimerRef.current = null
    }, 80)
  }, [cancelClose])

  // A pinned (touch) dock closes when the learner taps anywhere outside it —
  // the content tap still lands, so a module row can be opened in one go.
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

  const items: GlassDockItem[] = buildDockItems(tab)

  /** The tab whose dock item's horizontal centre is nearest `clientX`. */
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
      onTabChange(id as DockTab)
    },
    [onTabChange, pointerX],
  )

  const close = useCallback(() => {
    setPinned(false)
    setHover(false)
    pointerX.set(-200)
  }, [pointerX])

  return (
    <div
      ref={rootRef}
      data-course-peek-dock=""
      data-open={open ? 'true' : 'false'}
      data-pinned={pinned ? 'true' : 'false'}
      className="fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center"
    >
      <div
        data-course-peek-panel=""
        aria-hidden={!open}
        inert={!open}
        onPointerEnter={show}
        onPointerLeave={hide}
      >
        <GlassDock compact items={items} onSelect={handleSelect} pointerX={pointerX} />
      </div>
      <div
        data-course-peek-line=""
        role="button"
        tabIndex={0}
        aria-label="Show course navigation"
        aria-expanded={open}
        onPointerEnter={show}
        onPointerLeave={hide}
        onPointerDown={(event) => {
          pointerTypeRef.current = event.pointerType
          wasOpenRef.current = open
          draggingRef.current = true
          startXRef.current = event.clientX
          startYRef.current = event.clientY
          // Open immediately so the dock is visible under the finger while it
          // drags — the wave follows `pointerX` from here on.
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
            // Touch has no hover: a tap toggles the dock open/closed. Mouse
            // hover already covers the pointer case (the desktop behaviour).
            if (pointerTypeRef.current !== 'mouse') setPinned(!wasOpenRef.current)
            return
          }
          // A real left/right drag: the button the finger settled on is the
          // one that is clicked.
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
        <GlassMaterial radius={6} />
      </div>
    </div>
  )
}
