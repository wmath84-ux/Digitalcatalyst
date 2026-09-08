// src/course/CoursePeekDock.tsx
//
// The Course Player's footer navigation, rebuilt as the SAME bottom-centre
// peek dock the desktop shell already uses
// (src/components/glass-dock/DesktopPeekDock.tsx):
//
//   · a thin frosted-glass LINE sits at the very bottom centre of the player;
//   · tapping the line (or hovering it with a pointer) OPENS the footer dock
//     — the exact same GlassDock the study pane used to hold;
//   · once open, swiping LEFT / RIGHT across the dock and lifting the finger
//     on a tab SELECTS that tab (GlassDock's own onPointerUp), so the button
//     the finger settles on is the one that is clicked;
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
import GlassDock, { type GlassDockItem } from '../components/glass-dock/GlassDock'
import GlassMaterial from '../components/glass-dock/GlassMaterial'
import { buildDockItems, type DockTab } from './CourseOverlay'

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
  const lastPointerType = useRef<string>('mouse')

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

  const handleSelect = useCallback(
    (id: string) => {
      setPinned(false)
      setHover(false)
      onTabChange(id as DockTab)
    },
    [onTabChange],
  )

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
        <GlassDock compact items={items} onSelect={handleSelect} />
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
          lastPointerType.current = event.pointerType
          show()
        }}
        onClick={() => {
          // Touch has no hover: a tap toggles the dock open/closed. Mouse
          // hover already covers the pointer case (the desktop behaviour).
          if (lastPointerType.current !== 'mouse') setPinned((value) => !value)
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
