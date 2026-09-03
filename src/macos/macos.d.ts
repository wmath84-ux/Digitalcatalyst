// Type surface for the vendored macOS Web Simulator.
//
// `src/macos/**` is upstream JavaScript
// (https://github.com/LikhithSP/MacOS-Web-Simulator, MIT). It is kept as plain
// JSX on purpose — porting ~70 files to TypeScript would make every future
// upstream sync a manual merge. `allowJs` is off for the app, so TypeScript
// needs this one declaration to type the single import that crosses the
// boundary: the simulator root, from src/components/macmode/MacModeHost.tsx.

declare module "@/macos/MacOSApp.jsx" {
  import type { ComponentType } from "react";

  interface MacOSAppProps {
    /**
     * Leave Mac mode and return to the Digital Catalyst app. Wired to the
     * Apple menu ("Exit Mac mode" / "Shut Down…") and to Esc on the desktop
     * stage. Omitting it renders the simulator exactly as upstream does, with
     * no way out.
     */
    onExit?: () => void;
  }

  const MacOSApp: ComponentType<MacOSAppProps>;
  export default MacOSApp;
}
