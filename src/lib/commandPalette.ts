// One tiny bridge so any search box can open the pack's ⌘K palette
// (`GlassCommandPalette`, mounted once in main.tsx) without prop plumbing.
// The store SearchBar and the home header's search slot dispatch this on tap;
// the palette listens and opens with the pack's own filter + keyboard nav.
export const COMMAND_PALETTE_OPEN_EVENT = "dc:command-palette-open";

export function openCommandPalette() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(COMMAND_PALETTE_OPEN_EVENT));
}
