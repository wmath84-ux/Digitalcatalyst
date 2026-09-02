'use client'

/**
 * Hover-to-reveal MAG dock for screens that use the desktop shell
 * (left rail / side panel instead of the always-on bottom footer).
 *
 * A thin frosted-glass line sits at the very bottom centre of the
 * PAGE column (`[data-desktop-main]`), not the full viewport — the
 * left rail is excluded so the line tracks page width. Always
 * visible. Pointer enter activates the same GlassDock (MAG, click).
 * Pointer leave hides it. The Home button is a plain tap — the old
 * long-press → FlowPath shortcut was removed on the owner's direction. Phone + tablet-
 * portrait never mount this. The left rail never hides with the dock.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { BagIcon, CalendarIcon, FlowPathIcon, HomeIcon, SparkBookIcon, StoreIcon } from '../icons'
import GlassDock, { type GlassDockItem } from './GlassDock'
import GlassMaterial from './GlassMaterial'
import type { TabKey } from '../BottomNav'
import type { DesktopRailKey } from '../DesktopShell'

const TABS: { key: TabKey; label: string; icon: typeof HomeIcon; color: string; hash: string }[] = [
  { key: 'home', label: 'Home', icon: HomeIcon, color: '#FFBE0B', hash: '#/home' },
  { key: 'myday', label: 'My Day', icon: CalendarIcon, color: '#06D6A0', hash: '#/my-day' },
  { key: 'store', label: 'Store', icon: StoreIcon, color: '#FF7B54', hash: '#/store' },
  { key: 'purchases', label: 'Purchases', icon: BagIcon, color: '#C9A96E', hash: '#/store/purchases' },
  // Profile moved to the header/rail. Owner (post Wave 14): Revision takes
  // the slot FlowPath had and FlowPath is the right-most item (same order as
  // the mobile footer dock in BottomNav).
  { key: 'revision', label: 'Revision', icon: SparkBookIcon, color: '#3A86FF', hash: '#/revision' },
  { key: 'flowpath', label: 'FlowPath', icon: FlowPathIcon, color: '#B388FF', hash: '#/flowpath' },
]


function railToTab(active: DesktopRailKey): TabKey | null {
  if (active === 'favorites' || active === 'settings' || active === 'profile') return null
  return active
}

export default function DesktopPeekDock({
  active,
  purchasesBadge,
}: {
  active: DesktopRailKey
  purchasesBadge?: number
}) {
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const hostRef = useRef<HTMLDivElement>(null)

  const show = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setOpen(true)
  }, [])

  const hide = useCallback(() => {
    if (closeTimerRef.current !== null) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false)
      closeTimerRef.current = null
    }, 80)
  }, [])

  // Seat the peek line + dock on the PAGE column (`[data-desktop-main]`),
  // never the full viewport. The left rail is therefore excluded so the
  // line stays in the centre of the page area, not the whole screen.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const apply = () => {
      const page = document.querySelector('.dc-desktop-shell [data-desktop-main]')
      if (!(page instanceof HTMLElement)) return
      const box = page.getBoundingClientRect()
      host.style.left = `${Math.max(0, box.left)}px`
      host.style.width = `${Math.max(0, box.width)}px`
      host.setAttribute('data-page-seat', 'true')
    }
    apply()
    const page = document.querySelector('.dc-desktop-shell [data-desktop-main]')
    const rail = document.querySelector('.dc-desktop-shell [data-desktop-rail]')
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(apply)
    if (ro && page instanceof HTMLElement) ro.observe(page)
    if (ro && rail instanceof HTMLElement) ro.observe(rail)
    window.addEventListener('resize', apply)
    const frame = requestAnimationFrame(apply)
    return () => {
      cancelAnimationFrame(frame)
      ro?.disconnect()
      window.removeEventListener('resize', apply)
    }
  }, [])

  const current = railToTab(active)

  const items: GlassDockItem[] = TABS.map(({ key, label, icon, color }) => {
    return {
      id: key,
      label,
      icon,
      color,
      active: current === key,
      badge: key === 'purchases' ? purchasesBadge : undefined,
    }
  })

  return (
    <>
      <div
        ref={hostRef}
        data-desktop-peek-dock=""
        data-open={open ? 'true' : 'false'}
        className="fixed bottom-0 z-50 flex flex-col items-center"
      >
        <div data-desktop-peek-panel="" aria-hidden={!open} onPointerEnter={show} onPointerLeave={hide}>
          <GlassDock
            items={items}
            onSelect={(id) => {
              const key = id as TabKey
              const tab = TABS.find((item) => item.key === key)
              if (tab) window.location.hash = tab.hash
            }}
          />
        </div>
        <div
          data-desktop-peek-line=""
          aria-label="Show navigation dock"
          onPointerEnter={show}
          onPointerLeave={hide}
          onPointerDown={show}
        >
          <GlassMaterial radius={6} />
        </div>
      </div>
    </>
  )
}
