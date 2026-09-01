// src/components/ui/GlassBackdrop.tsx
//
// The "Black Ice" backdrop — the one fixed layer the whole v2 design sits on.
//
// It carries NO paint of its own: every colour, position and falloff lives in
// `.dc-backdrop` / `.dc-grain` in src/glass-theme.css, so the palette stays
// reviewable in one place and `scripts/glass-coverage.mjs` can assert the
// layer's invariants (no filter, no animation, no !important) against real
// CSS rather than against a component's inline styles.
//
// Contract (docs/liquid-glass-v2-brief.md §2 and §4):
//   · position: fixed, inset: 0, z-index: -1 — behind everything, never in
//     flow, never its own isolation context
//   · pointer-events: none — it must never intercept a tap
//   · no filter, no backdrop-filter, no @keyframes on this layer, ever. The
//     softness is the gradients' own falloff, not a blur.
//   · never `background-attachment: fixed` (broken on iOS Safari) — that is
//     why this is a real fixed element instead.
//
// MOUNTING: inside the app shells, never in main.tsx. Admin has its own
// background logic and must not inherit this layer; main.tsx already forces
// the admin tier to `off`, and every rule in glass-theme.css is gated on
// `html[data-glass="on"]`, so `?glass=off` restores the pre-rollout paint.
//
// Mount it exactly ONCE per route. `DesktopShell` is only ever rendered by
// `AppShell` (its single call site), so AppShell mounts the backdrop on the
// mobile/tablet-portrait branch and DesktopShell mounts it on the desktop
// branch — one layer either way. A second mount would stack a second grain
// tile and double its opacity.

interface GlassBackdropProps {
  /**
   * Escape hatch for a shell that needs to suppress the layer without
   * unmounting the tree. Not used today; kept so a future route with its own
   * opaque theme (the course player's light theme, say) can opt out without
   * touching this file.
   */
  hidden?: boolean;
}

export function GlassBackdrop({ hidden = false }: GlassBackdropProps) {
  if (hidden) return null;
  return (
    <>
      {/* aria-hidden: a decorative fixed layer must never enter the a11y tree
          or the tab order. */}
      <div className="dc-backdrop" data-dc-backdrop aria-hidden="true" />
      {/* Static dither tile, its own fixed layer above the gradient. Breaks up
          gradient banding on old LCD panels at 3.5% opacity. */}
      <div className="dc-grain" data-dc-grain aria-hidden="true" />
    </>
  );
}

export default GlassBackdrop;
