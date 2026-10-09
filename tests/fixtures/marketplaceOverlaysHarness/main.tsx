import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../../src/index.css";
import "../../../src/glass-theme.css";
import "../../../src/glass.css";
import "../../../src/store-glass.css";
import "../../../src/pdp-minimal.css";
import AppShell from "../../../src/components/AppShell";
import Header from "../../../src/components/Header";
import BottomNav from "../../../src/components/BottomNav";
import LeaderboardApp from "../../../src/LeaderboardApp";
import StorePage from "../../../src/components/StorePage";
import ModuleSelectModal from "../../../src/components/pdp/ModuleSelectModal";
import StudyLibraryPage from "../../../src/personal-library/StudyLibraryPage";
import MyCourseEditorPage from "../../../src/personal-library/MyCourseEditorPage";
import { modules } from "./data";
const params = new URLSearchParams(location.search);
const target = params.get("page") || "store";
history.replaceState(
  null,
  "",
  `${location.pathname}${location.search}${
    target === "leaderboard"
      ? "#/leaderboard"
      : target === "library"
      ? "#/study-library"
      : target === "editor"
      ? "#/my-course/course-one/edit"
      : target === "modules"
      ? "#/product/alpha"
      : "#/store"
  }`
);
const record = (action: string) => {
  document.querySelector("output")!.textContent = action;
};
function Fixture() {
  const [wishlist, setWishlist] = useState(new Set<string>());
  const [cart, setCart] = useState(new Set<string>(["ebook"]));
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const page =
    target === "leaderboard" ? (
      <LeaderboardApp />
    ) : target === "library" ? (
      <StudyLibraryPage />
    ) : target === "editor" ? (
      <MyCourseEditorPage
        courseId={params.has("new") ? "new" : "course-one"}
        onBack={() => record("library")}
        onPlay={(id) => record("play:" + id)}
      />
    ) : target === "modules" ? (
      <div data-app-frame>
        <Header cartCount={0} notifCount={0} />
        <main style={{ padding: "100px 24px" }}>
          <button type="button" data-open-modules onClick={() => setOpen(true)}>
            Choose modules
          </button>
          <p>{selected.join(",")}</p>
          <ModuleSelectModal
            open={open}
            onClose={() => setOpen(false)}
            modules={modules}
            selectedIds={selected}
            ownedIds={new Set(["owned"])}
            fallbackPrice={399}
            onChangeSelected={(ids) => {
              const next = new Set(ids);
              if (next.has("optics")) next.add("waves");
              setSelected([...next]);
            }}
          />
        </main>
      </div>
    ) : (
      <div
        data-app-frame
        className="relative mx-auto flex min-h-screen w-full flex-col"
      >
        <Header cartCount={cart.size} notifCount={0} />
        <main data-footer-nav-space className="min-h-0 flex-1 overflow-y-auto">
          <StorePage
            wishlist={wishlist}
            cartIds={cart}
            purchased={new Set(["owned"])}
            onToggleWishlist={(id) =>
              setWishlist((current) => {
                const next = new Set(current);
                next.has(id) ? next.delete(id) : next.add(id);
                return next;
              })
            }
            onAddToCart={(id) => {
              setCart((current) => new Set([...current, id]));
              record("cart:" + id);
            }}
            onView={(product) => record("view:" + product.id)}
          />
        </main>
        <BottomNav active="store" onChange={() => {}} purchasesBadge={1} />
      </div>
    );
  return (
    <>
      {params.has("shell") ? (
        <AppShell
          pageTitle={
            target === "leaderboard"
              ? "Leaderboard"
              : target === "editor"
              ? "Edit course"
              : undefined
          }
        >
          {page}
        </AppShell>
      ) : (
        page
      )}
      <output
        aria-hidden="true"
        style={{ position: "fixed", bottom: 0, pointerEvents: "none" }}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
