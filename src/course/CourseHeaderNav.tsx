// src/course/CourseHeaderNav.tsx
//
// THE PLACEABLE COURSE NAVIGATION — the owner's brief (2026-10-16):
//
//   "Desktop header mein progress bar aur Settings ke saath footer navigation
//    bhi add kar do — ek hi line mein. Aur footer navigation ka size 6 px
//    chhota kar do.
//
//    Ek naya header button add karo — sirf tab dikhe jab tablet/desktop size
//    detect ho — jisse footer navigation ko kahin bhi place kiya ja sake:
//    left, right, bottom, header. Click karne par 4 options ka dropdown khule.
//    Dropdown us taraf khule jahan jagah bachi hai — navigation top mein hai to
//    neeche, bottom mein hai to upar, left mein hai to right, right mein to
//    left. Kabhi screen ke bahar na jaye.
//
//    Desktop pe footer navigation ki alag strip hata do — jo ek hi navigation
//    component ho jo kahin bhi lagaya ja sake: header mein ho to poora
//    navigation (icons + labels, apni row) aur har page pe rahe, uske saare
//    current button kaam karein. Sirf size aur position badlegi."
//
// So this file is the ONE navigation that can be placed anywhere:
//
//   · the same TAB list the footer strip builds (CourseOverlay.TABS), so every
//     button that works in the footer works here — same tab keys, same
//     headings, same keyboard routing;
//   · icons + labels, its own row, sized from `footerNavigationSizeVars()`
//     (the shrunken "-6px" rhythm);
//   · the SAME visibility rule as the footer (edit-mode / immersive pages),
//     because the owner's footer rule stands — the only things that change
//     here are size and position;
//   · the placement button, which rides WITH the navigation (so its dropdown
//     really does open into the free space: header → down, bottom → up,
//     left → right, right → left) and only renders from 768px up.
//
// Mobile never mounts this component: the player only places the navigation
// this way in the plus-deck layout, which starts at 768px.

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { PanelBottom, PanelLeft, PanelRight, PanelTop, Move } from "lucide-react";
import { TABS, type DockTab } from "./CourseOverlay";
import { useCourseKeyboard } from "./useCourseKeyboard";
import { useFooterHiddenPage } from "./coursePanelSession";
import { useFooterNavigationAlways } from "../utils/footerNavigationVisibility";
import {
  FOOTER_NAVIGATION_PLACEMENTS,
  FOOTER_NAVIGATION_PLACEMENT_HINT,
  FOOTER_NAVIGATION_PLACEMENT_LABEL,
  footerNavigationMenuSide,
  footerNavigationSizeVars,
  setFooterNavigationPlacement,
  useFooterNavigationPlacement,
  useFooterNavigationPlacementEnabled,
  type FooterNavigationPlacement,
} from "../utils/footerNavigationPlacement";
import "./course-header-nav.css";

const PLACEMENT_ICON = {
  header: PanelTop,
  left: PanelLeft,
  right: PanelRight,
  bottom: PanelBottom,
} as const;

export interface CourseHeaderNavProps {
  tab: DockTab;
  onTabChange: (tab: DockTab) => void;
  hiddenTabs?: DockTab[];
  /** Where the navigation currently sits — it also sets the dropdown's side. */
  placement: FooterNavigationPlacement;
}

/**
 * The navigation itself. Renders nothing while the soft keyboard is up or on
 * a page the footer rule hides (edit mode, the Brain answer deck, a live
 * experiment, the PDF reader, the Music player or either search page) — the
 * same rule the footer strip obeys.
 */
export default function CourseHeaderNav({ tab, onTabChange, hiddenTabs = [], placement }: CourseHeaderNavProps) {
  const { keyboardVisible } = useCourseKeyboard();
  const pageRuleHidesFooter = useFooterHiddenPage(tab);
  const immersivePage = pageRuleHidesFooter && !useFooterNavigationAlways();
  const navRef = useRef<HTMLElement | null>(null);
  const items = TABS.filter((item) => !hiddenTabs.includes(item.key));

  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const back = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (back ? -1 : 1) + items.length) % items.length;
    const buttons = navRef.current?.querySelectorAll<HTMLButtonElement>("button");
    buttons?.[next]?.focus();
    buttons?.[next]?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };

  if (keyboardVisible || immersivePage) return null;

  return (
    <nav
      ref={navRef}
      data-dc-header-nav
      data-placement={placement}
      aria-label="Course study tools"
      className="dc-header-nav"
      style={footerNavigationSizeVars() as CSSProperties}
    >
      <div data-dc-header-nav-row className="dc-header-nav__row">
        {items.map((item, index) => {
          const Icon = item.icon;
          const isActive = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              data-dc-header-nav-tab={item.key}
              data-tab={item.key}
              data-active={isActive ? "true" : "false"}
              aria-current={isActive ? "page" : undefined}
              aria-label={item.heading}
              title={item.heading}
              className="dc-header-nav__item"
              style={isActive ? ({ "--dc-header-nav-accent": item.color } as CSSProperties) : undefined}
              onClick={() => onTabChange(item.key)}
              onKeyDown={(event) => moveFocus(event, index)}
            >
              <span data-dc-header-nav-icon aria-hidden className="dc-header-nav__icon">
                <Icon size={16} />
              </span>
              <span data-dc-header-nav-label className="dc-header-nav__label">
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
      <FooterNavigationPlacementButton placement={placement} />
    </nav>
  );
}

/**
 * The owner's placement button: four choices, and a dropdown that always opens
 * toward the space the navigation is NOT using. It travels with the navigation,
 * which is what makes the direction rule true wherever the navigation lives.
 */
export function FooterNavigationPlacementButton({ placement }: { placement: FooterNavigationPlacement }) {
  const enabled = useFooterNavigationPlacementEnabled();
  const current = useFooterNavigationPlacement();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: Event) => {
      const target = event.target as Element | null;
      if (target && wrapRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent | globalThis.KeyboardEvent) => {
      if ((event as globalThis.KeyboardEvent).key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // The device gate: tablet/desktop only, and it closes itself again if the
  // window shrinks back to a phone width.
  if (!enabled) return null;

  const side = footerNavigationMenuSide(placement);

  return (
    <div ref={wrapRef} data-dc-header-nav-placement-wrap className="dc-header-nav__place">
      <button
        type="button"
        data-dc-header-nav-placement
        data-side={side}
        aria-haspopup="menu"
        aria-expanded={open ? "true" : "false"}
        aria-label="Place the footer navigation"
        title="Place the footer navigation"
        className="dc-header-nav__place-button"
        onClick={() => setOpen((value) => !value)}
      >
        <Move size={15} aria-hidden />
        <span className="dc-header-nav__place-text">Place</span>
      </button>

      {open ? (
        <div
          data-dc-header-nav-menu
          data-side={side}
          role="menu"
          aria-label="Place the footer navigation"
          className="dc-header-nav__menu"
        >
          <p data-dc-header-nav-menu-title className="dc-header-nav__menu-title">
            Footer navigation
          </p>
          {FOOTER_NAVIGATION_PLACEMENTS.map((option) => {
            const Icon = PLACEMENT_ICON[option];
            const isCurrent = current === option;
            return (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={isCurrent ? "true" : "false"}
                data-dc-header-nav-option={option}
                data-active={isCurrent ? "true" : "false"}
                className="dc-header-nav__option"
                onClick={() => {
                  setFooterNavigationPlacement(option);
                  setOpen(false);
                }}
              >
                <Icon size={15} aria-hidden />
                <span className="dc-header-nav__option-label">{FOOTER_NAVIGATION_PLACEMENT_LABEL[option]}</span>
                <small className="dc-header-nav__option-hint">{FOOTER_NAVIGATION_PLACEMENT_HINT[option]}</small>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
