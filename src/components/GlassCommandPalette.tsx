// src/components/GlassCommandPalette.tsx
//
// Wave 3 (commerce) closes the ⌘K item the desktop shell deferred: this is the
// registry's `glass-command` palette, mounted once for the whole app.
//
// Why the wrapper owns the shortcut instead of `GlassCommand shortcut`:
//   · the kill switch has to work — with `data-glass="off"` the palette must not
//     steal ⌘K at all, and the vendored item binds the key unconditionally;
//   · admin routes are out of scope for the rollout, so ⌘K there keeps the
//     browser's behaviour;
//   · the app's other overlays (course player, My Day sheet) already use Escape,
//     and a palette that opens while one of those owns focus is a trap.
//
// Filtering is the pack's: each item declares searchable text via its label plus
// `keywords`, and `GlassCommandEmpty` shows when nothing matches.
import { useEffect, useMemo, useState } from "react";
import {
  GlassCommand,
  GlassCommandEmpty,
  GlassCommandGroup,
  GlassCommandItem,
} from "@/components/ui/glass-command";
import { ALL_RAIL } from "@/components/DesktopShell";
import { useCatalog } from "@/context/CatalogContext";

const go = (hash: string) => {
  window.location.hash = hash;
};

/** True when an input/textarea/contenteditable owns focus. */
function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
}

function glassEnabled() {
  return document.documentElement.dataset.glass !== "off";
}

function onAdminRoute() {
  const hash = window.location.hash;
  return hash.startsWith("#/admin") || hash.startsWith("#/course/");
}

export default function GlassCommandPalette() {
  const [open, setOpen] = useState(false);
  const { products } = useCatalog();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      if (!glassEnabled() || onAdminRoute()) return;
      // ⌘K inside a field means "select the text", the way every macOS app does
      // it — the palette only takes the shortcut from the page itself.
      if (isTyping(event.target)) return;
      event.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // The catalogue is unbounded; the palette is a jump list, not a search engine.
  // 24 titles keep the filtered DOM small (every hidden item is still mounted).
  const catalogue = useMemo(
    () =>
      products
        .filter((product) => product.availableForSale !== false)
        .slice(0, 24)
        .map((product) => ({
          id: product.id,
          title: product.title,
          instructor: product.instructor,
          price: product.price,
        })),
    [products],
  );

  return (
    <GlassCommand open={open} onOpenChange={setOpen} shortcut={false}>
      <GlassCommandGroup heading="Go to">
        {ALL_RAIL.map((entry) => (
          <GlassCommandItem
            key={entry.key}
            keywords={`${entry.description} ${entry.hash}`}
            onSelect={() => go(entry.hash)}
          >
            <entry.Icon size={15} />
            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
          </GlassCommandItem>
        ))}
      </GlassCommandGroup>

      <GlassCommandGroup heading="Actions">
        <GlassCommandItem keywords="find courses search catalogue products" onSelect={() => go("#/search")}>
          Search the catalogue
        </GlassCommandItem>
        <GlassCommandItem keywords="cart checkout buy" onSelect={() => go("#/cart")}>
          Open cart
        </GlassCommandItem>
        <GlassCommandItem keywords="wishlist favourites saved" onSelect={() => go("#/favorites")}>
          Open favourites
        </GlassCommandItem>
        <GlassCommandItem keywords="plans membership" onSelect={() => go("#/subscription")}>
          Plans & membership
        </GlassCommandItem>
      </GlassCommandGroup>

      {catalogue.length > 0 ? (
        <GlassCommandGroup heading="Catalogue">
          {catalogue.map((product) => (
            <GlassCommandItem
              key={product.id}
              keywords={`${product.instructor} ${product.price} product course`}
              onSelect={() => go(`#/product/${product.id}`)}
            >
              <span className="min-w-0 flex-1 truncate">{product.title}</span>
              <span className="shrink-0 text-[11px] font-bold text-white/45">₹{product.price}</span>
            </GlassCommandItem>
          ))}
        </GlassCommandGroup>
      ) : null}

      <GlassCommandEmpty>
        Nothing matches — try a page name, or press Enter on “Search the catalogue”.
      </GlassCommandEmpty>
    </GlassCommand>
  );
}
