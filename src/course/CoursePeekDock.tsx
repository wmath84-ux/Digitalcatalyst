// Compact, direct-access study strips replace the icon dock and reveal handle.
import { useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { TABS, type DockTab } from './CourseOverlay'

// The footer's single website colour — same value as COURSE_FOOTER_COLOR in
// CourseOverlay.tsx (kept local here: CourseOverlay imports nothing from the strip).
const FOOTER_COLOR = '#4f46e5'
import { useCourseKeyboard } from './useCourseKeyboard'
import './course-strip-nav.css'

const LABELS: Partial<Record<DockTab, [string, string]>> = {
  modules: ['M', 'Modules'], brain: ['B', 'Brain'], notes: ['N', 'Notes'],
  mindmap: ['MM', 'Map'], ai: ['AI', 'AI'], paid: ['P', 'Paid'],
  experiment: ['E', 'Lab'], sketch: ['S', 'Sketch'], read: ['R', 'Read'],
  // Music takes the note glyph, not an "M": Modules already owns that letter.
  music: ['♪', 'Music'],
}

export default function CoursePeekDock({ tab, onTabChange, hiddenTabs = [] }: {
  tab: DockTab
  onTabChange: (tab: DockTab) => void
  hiddenTabs?: DockTab[]
}) {
  const { keyboardVisible } = useCourseKeyboard()
  const navRef = useRef<HTMLElement>(null)
  const items = TABS.filter(item => !hiddenTabs.includes(item.key))
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    const buttons = navRef.current?.querySelectorAll<HTMLButtonElement>('button')
    buttons?.[next]?.focus()
    buttons?.[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  if (keyboardVisible) return null
  return (
    <nav ref={navRef} data-course-strip-nav aria-label="Course study tools">
      <div className="course-strip-track">
        {items.map((item, index) => {
          const [letter, name] = LABELS[item.key] ?? [item.label[0], item.label]
          return (
            <button key={item.key} type="button" data-course-strip={item.key}
              aria-label={item.heading} title={item.heading}
              aria-pressed={tab === item.key}
              onClick={() => onTabChange(item.key)} onKeyDown={event => moveFocus(event, index)}
              style={{ '--strip-color': FOOTER_COLOR } as CSSProperties}>
              <span className="course-strip-plate" aria-hidden="true">{letter}</span>
              <span className="course-strip-name" aria-hidden="true">{name}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
