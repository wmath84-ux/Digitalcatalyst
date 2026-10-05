// Test fixture for tests/homeFooterAlwaysVisibleBrowser.test.mjs — see
// homeFooter.html.
//
//   ?page=home  — Home's footer exactly as src/home/App.tsx mounts it
//                 (`<BottomNav active="home" peek peekAlwaysOpen …/>`);
//   ?page=myday — My Day's footer (`peek` only), the unchanged control.
//
// The frame → main → footer structure and class names are Home's, so the
// production CSS (src/index.css) and the measured clearance apply unchanged.
// The window hook below is the only test-only surface.

import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/glass.css";
import BottomNav, { type TabKey } from "../../../src/components/BottomNav";
import { initFooterNavSpace } from "../../../src/utils/footerNavSpace";

declare global {
  interface Window {
    /** Footer tabs the page received through onChange, in order. */
    __selected: string[];
  }
}
window.__selected = [];

const page = new URLSearchParams(window.location.search).get("page") || "home";

function HomeLikePage() {
  return (
    <div className="dc-app-shell min-h-screen sm:py-6">
      <div
        data-app-frame
        className="dc-app-frame relative mx-auto flex min-h-screen max-w-md flex-col sm:min-h-[calc(100vh-3rem)] sm:overflow-hidden sm:rounded-[2rem] md:max-w-none md:rounded-none md:bg-transparent md:shadow-none md:border-0"
      >
        <header style={{ padding: 16, color: "#fff" }}>Header</header>
        <main className="flex-1 overflow-y-auto pb-2" data-harness-main>
          <input data-harness-input placeholder="Search" style={{ margin: 16, width: "80%" }} />
          {Array.from({ length: 40 }).map((_, index) => (
            <p key={index} data-harness-row={index} style={{ color: "#e5e7eb", margin: 0, padding: "14px 20px" }}>
              Row {index}
            </p>
          ))}
          <button type="button" data-harness-last style={{ margin: "8px 20px", padding: 12 }}>
            Last tappable thing
          </button>
        </main>
        <BottomNav
          active={page === "myday" ? "myday" : "home"}
          peek
          peekAlwaysOpen={page !== "myday"}
          onChange={(tab: TabKey) => window.__selected.push(tab)}
        />
      </div>
    </div>
  );
}

initFooterNavSpace();
createRoot(document.getElementById("root")!).render(<HomeLikePage />);
