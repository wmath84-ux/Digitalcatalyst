// The Course Player's footer navigation — the Workspace pill, verbatim.
//
// Owner brief:
//   "Workspace ke existing pill-style footer navigation ka exact design
//    Course Player ke footer navigation mein use karo."
//
// So this is NOT a course look-alike of the pill: it renders the Workspace
// footer's own markup (`[data-work-footer-nav]` → `[data-site-footer]` →
// `[data-work-nav-row]` → `[data-work-nav-cell]`, exactly as
// src/work/WorkFooterNav.tsx renders it) and imports the Workspace footer's
// own stylesheet, so the button design, styling and dimensions — 26px icons
// in 46–56px cells, the destination's own accent on the selected cell, the
// 0.8 → 1 opacity ramp, the −4px hover lift, the soft
// `0 10px 15px rgba(0,0,0,.041)` shadow on a white 40px-radius plate — are
// the Workspace footer's, shared, not copied. The Workspace footer itself
// (WorkFooterNav + work-footer-nav.css) is untouched.
//
// Two course-only adaptations, both in course-strip-nav.css and both forced
// by the brief's other clauses, neither of which restyles a button:
//
//   · the footer AREA keeps its size: the pill's height token
//     (--work-nav-h) is set to the 44px the strip's buttons already
//     occupied, so the in-flow footer strip is exactly as tall as before;
//   · with ten study tools (Workspace has six), the pill is the horizontal
//     scroller: swipe/drag left-right inside it to reach the rest. (In
//     Workspace every cell fits, so its pill never needs to scroll.)
import { useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { TABS, type DockTab } from './CourseOverlay'

// The footer's single website colour — same value as COURSE_FOOTER_COLOR in
// CourseOverlay.tsx (kept local here: CourseOverlay imports nothing from the strip).
// It is the pill's resting `--work-nav-active` (hover/focus tint); a selected
// cell overrides it with its destination's own accent, exactly as the
// Workspace footer does.
const FOOTER_COLOR = '#4f46e5'
import { useCourseKeyboard } from './useCourseKeyboard'
import { useFooterHiddenPage } from './coursePanelSession'
import { useFooterNavigationAlways } from '../utils/footerNavigationVisibility'
// The Workspace footer's design, shared — imported FIRST so the course
// strip's area/scroll overrides (course-strip-nav.css) win their ties.
import '../work/work-footer-nav.css'
import './course-strip-nav.css'

export default function CoursePeekDock({ tab, onTabChange, hiddenTabs = [] }: {
  tab: DockTab
  onTabChange: (tab: DockTab) => void
  hiddenTabs?: DockTab[]
}) {
  const { keyboardVisible } = useCourseKeyboard()
  // The ONE page rule (coursePanelSession.ts → `isFooterHiddenPage`): the
  // footer is not shown while an editor is in EDIT mode (reading a note, a
  // mind map or a sketch keeps it), on the Brain answer deck, in a live
  // experiment, in the Read PDF / annotations viewer, on the Music player or
  // on either search page — where a results page also slides it away while
  // the learner scrolls down and brings it back at the top.
  //
  // Settings can overrule it: "Visible footer navigation always" keeps the
  // footer navigation on every page.
  const pageRuleHidesFooter = useFooterHiddenPage(tab)
  const immersivePage = pageRuleHidesFooter && !useFooterNavigationAlways()
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
  if (keyboardVisible || immersivePage) return null
  return (
    <nav ref={navRef} data-course-strip-nav aria-label="Course study tools">
      {/* The Workspace pill, in-flow: its wrapper is re-homed (not restyled)
          by course-strip-nav.css so the strip keeps its exact area. No
          [data-site-footer-nav]: that hook belongs to the measured site
          footer (utils/footerNavSpace.ts), which this strip is not. */}
      <div data-work-footer-nav="" data-course-work-pill="" data-position="flow">
        <div
          data-site-footer=""
          data-nav-count={String(items.length)}
          style={{ '--work-nav-n': String(items.length), '--work-nav-active': FOOTER_COLOR } as CSSProperties}
        >
          <div data-work-nav-row="">
            {items.map((item, index) => {
              const Icon = item.icon
              const isActive = tab === item.key
              // The selected cell publishes its own accent, so the pill's
              // tint and the destination's colour stay one rule — the
              // Workspace footer's own mechanism (WorkFooterNav).
              const cellStyle = {
                ...(isActive ? { '--work-nav-active': item.color } : null),
              } as CSSProperties
              return (
                <button key={item.key} type="button"
                  data-work-nav-cell={item.key}
                  data-course-strip={item.key}
                  data-active={isActive ? 'true' : 'false'}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.heading} title={item.heading}
                  onClick={() => onTabChange(item.key)} onKeyDown={event => moveFocus(event, index)}
                  style={cellStyle}>
                  <span data-work-nav-icon="" aria-hidden="true">
                    <Icon size={26} />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}
