// src/classroom3d/SurfaceContexts.tsx
//
// WHY EVERY BOARD IN THIS ROOM NEEDS A BRIDGE.
//
// drei's `<Html>` does NOT render its children into the React tree it sits in.
// Look at its source (`@react-three/drei/web/Html.js`):
//
//     React.useLayoutEffect(() => {
//       const currentRoot = root.current = ReactDOM.createRoot(el);
//       …
//     }, [target, transform]);
//
//     React.useLayoutEffect(() => {
//       root.current.render(<div …>{children}</div>);
//     });                                   // ← every render
//
// It makes a **second React root** on a detached element and pushes the
// children into it. A React root is a context universe of its own: nothing
// provided above it is visible inside it. `createPortal` would have kept the
// context; `createRoot` does not.
//
// That is invisible until a panel reaches for one. `ResourceViewer` — the body
// of the lecture board — calls `useAuth()`, and `useAuth` throws when the
// context is missing:
//
//     if (!context) throw new Error("useAuth must be used within an AuthProvider");
//
// So the board threw on mount, `SurfaceFrame`'s error boundary swallowed it and
// painted "Lecture board could not load. The rest of the classroom is still
// live." — while the notes and mind boards, which consume no app context, sat
// there working and made the failure look board-specific. It was not: EVERY
// context in the app was missing on EVERY surface.
//
// The fix is the standard one, applied one level deeper than usual. R3F already
// bridges the DOM tree's contexts into the canvas reconciler (`<Canvas>` wraps
// its children in its own `useContextBridge()`), so a component INSIDE the
// canvas — `SurfaceFrame`, `DeskConsole` — can still read them normally. This
// module reads them there and re-provides them inside the `<Html>` children,
// restoring one continuous context chain from `<App>` down to the viewer on
// the wall.
//
// Values, not providers: only the current value is carried across, so the
// bridge never duplicates a Firestore listener, an auth subscription or a
// piece of state. The panels keep consuming the real contexts; the room just
// stops cutting them off.

import { useContext, useMemo, type ReactNode } from "react";
import { AuthContext } from "../context/AuthContext";
import { BrandingContext } from "../context/BrandingContext";
import { CatalogContext } from "../context/CatalogContext";
import { CommerceContext } from "../context/CommerceContext";
import { ConnectivityContext } from "../context/ConnectivityContext";
import { FeatureVisibilityContext } from "../context/FeatureVisibilityContext";

/**
 * The app contexts a surface may need. Read them with `useSurfaceContexts()`
 * INSIDE the canvas (where R3F has already bridged them) and hand the result
 * to `<SurfaceContexts>` around the `<Html>` children.
 *
 * A fixed, unconditional list of `useContext` calls — hook order can never
 * vary between renders, which is what makes this safe to call in a component
 * that re-renders on every focus hop and pinch tick.
 */
export function useSurfaceContexts() {
  const auth = useContext(AuthContext);
  const branding = useContext(BrandingContext);
  const catalog = useContext(CatalogContext);
  const commerce = useContext(CommerceContext);
  const connectivity = useContext(ConnectivityContext);
  const features = useContext(FeatureVisibilityContext);

  // Memoised so a pinch tick that re-renders the room does not hand the panel
  // a fresh object identity and re-render every consumer behind the bridge.
  return useMemo(
    () => ({ auth, branding, catalog, commerce, connectivity, features }),
    [auth, branding, catalog, commerce, connectivity, features],
  );
}

export type SurfaceContextSnapshot = ReturnType<typeof useSurfaceContexts>;

/**
 * Re-provide the captured contexts inside a drei `<Html>` root. Rendered as
 * the OUTERMOST thing in the surface's children, so every panel body — and
 * anything it mounts later — sits under the same providers it would have had
 * in the flat player.
 */
export default function SurfaceContexts({
  value,
  children,
}: {
  value: SurfaceContextSnapshot;
  children: ReactNode;
}) {
  return (
    <AuthContext.Provider value={value.auth}>
      <BrandingContext.Provider value={value.branding}>
        <CatalogContext.Provider value={value.catalog}>
          <CommerceContext.Provider value={value.commerce}>
            <ConnectivityContext.Provider value={value.connectivity}>
              <FeatureVisibilityContext.Provider value={value.features}>
                {children}
              </FeatureVisibilityContext.Provider>
            </ConnectivityContext.Provider>
          </CommerceContext.Provider>
        </CatalogContext.Provider>
      </BrandingContext.Provider>
    </AuthContext.Provider>
  );
}
