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
import { COMMAND_PALETTE_OPEN_EVENT, type CommandPaletteRequest, type CommandPaletteScope } from "@/lib/commandPalette";
import "./GlassCommandPalette.css";

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
  const [scope, setScope] = useState<CommandPaletteScope>("all");
  const { products } = useCatalog();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      if (!glassEnabled() || onAdminRoute()) return;
      // ⌘K inside a field means "select the text", the way every macOS app does
      // it — the palette only takes the shortcut from the page itself.
      if (isTyping(event.target)) return;
      event.preventDefault();
      setScope("all");
      setOpen(true);
    };
    // Home opens the full command palette; Store opens its product-only search
    // mode while keeping this exact same glass dialog and keyboard behavior.
    const onOpenRequest = (event: Event) => {
      if (!glassEnabled()) return;
      const request = (event as CustomEvent<CommandPaletteRequest>).detail;
      setScope(request?.scope === "products" ? "products" : "all");
      setOpen(true);
    };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpenRequest);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, onOpenRequest);
    };
  }, []);

  // The palette doubles as the Store's product finder, so the live catalogue
  // keeps image, title, metadata and price evidence for the richer result rows.
  const catalogue = useMemo(
    () =>
      products.slice(0, 200).map((product) => ({
        ...product,
        tagsText: (product.tags || []).join(" "),
        keywordsText: (product.searchKeywords || []).join(" "),
      })),
    [products],
  );
  const availableCatalogue = useMemo(
    () => catalogue.filter((product) => product.availableForSale !== false),
    [catalogue],
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setScope("all");
  };

  return (
    <GlassCommand
      open={open}
      onOpenChange={handleOpenChange}
      shortcut={false}
      placeholder={scope === "products" ? "Search by product, subject, class or instructor…" : undefined}
      inputLabel={scope === "products" ? "Search Store products" : undefined}
      panelClassName={scope === "products" ? "dc-product-search-palette-panel" : undefined}
      listClassName={scope === "products" ? "dc-product-search-palette-list" : undefined}
    >
      {scope === "products" ? (
        <>
          <GlassCommandGroup heading="Products" className="dc-command-product-results" data-command-product-results>
            {catalogue.map((product) => {
              const price = product.isFree === true || product.price === 0
                ? "Free"
                : `₹${product.price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
              const hasOriginalPrice =
                Number.isFinite(product.originalPrice) &&
                product.originalPrice > product.price &&
                product.originalPrice > 0;
              const originalPrice = hasOriginalPrice
                ? `₹${product.originalPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                : "";
              const metadata = [product.category, product.subject, product.classLevel]
                .filter(Boolean)
                .join(" · ");
              return (
                <GlassCommandItem
                  key={product.id}
                  data-command-product={product.id}
                  aria-label={`${product.title}, ${metadata}, ${price}`}
                  keywords={`${product.title} ${product.instructor} ${product.subject} ${product.classLevel} ${product.category} ${product.tagsText} ${product.keywordsText} ${product.description || ""} ${product.price} product course`}
                  className="dc-command-product-row"
                  onSelect={() => go(`#/product/${encodeURIComponent(product.id)}`)}
                >
                  <span className="dc-command-product-image" aria-hidden="true">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                          const fallback = event.currentTarget.nextElementSibling as HTMLElement | null;
                          if (fallback) fallback.hidden = false;
                        }}
                      />
                    ) : null}
                    <span className="dc-command-product-image-fallback" hidden={Boolean(product.image)}>
                      {product.category}
                    </span>
                  </span>
                  <span className="dc-command-product-copy">
                    <span className="dc-command-product-meta">{metadata || product.category}</span>
                    <strong className="dc-command-product-title" title={product.title}>{product.title}</strong>
                    {product.instructor ? <span className="dc-command-product-instructor">{product.instructor}</span> : null}
                  </span>
                  <span className="dc-command-product-pricing">
                    <strong>{price}</strong>
                    {hasOriginalPrice ? <del>{originalPrice}</del> : null}
                  </span>
                </GlassCommandItem>
              );
            })}
          </GlassCommandGroup>
          <GlassCommandEmpty className="dc-command-product-empty">
            No matching products. Try a title, subject, class or instructor.
          </GlassCommandEmpty>
        </>
      ) : (
        <>
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

          {availableCatalogue.length > 0 ? (
            <GlassCommandGroup heading="Catalogue">
              {availableCatalogue.map((product) => (
                <GlassCommandItem
                  key={product.id}
                  keywords={`${product.title} ${product.instructor} ${product.subject} ${product.category} ${product.tagsText} ${product.keywordsText} ${product.price} product course`}
                  onSelect={() => go(`#/product/${encodeURIComponent(product.id)}`)}
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
        </>
      )}
    </GlassCommand>
  );
}
