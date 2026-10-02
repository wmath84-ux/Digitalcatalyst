// Test fixture for tests/peekDockRevealBrowser.test.mjs — see shell.html.
//
// Mounts the REAL DesktopShell (rail + page column + the real DesktopPeekDock)
// so the footer reveal/hide interaction is driven against the exact chrome the
// desktop app renders. The Firebase-backed contexts are stubbed via Vite
// aliases in the test (stubs/*), so nothing here talks to the network.

import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/glass.css";
import DesktopShell from "../../../src/components/DesktopShell";

createRoot(document.getElementById("root")!).render(
  <DesktopShell active="home" pageTitle="Home" onSearch={() => {}}>
    <div style={{ color: "#e5e7eb", padding: 24 }}>
      <h1 data-harness-page style={{ margin: 0 }}>
        Desktop page
      </h1>
      {Array.from({ length: 60 }).map((_, index) => (
        <p key={index} style={{ opacity: 0.6 }}>
          Row {index}
        </p>
      ))}
    </div>
  </DesktopShell>,
);
