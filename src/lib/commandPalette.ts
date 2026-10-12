// One tiny bridge so any search box can open the pack's ⌘K palette
// (`GlassCommandPalette`, mounted once in main.tsx) without prop plumbing.
// The Store's product-search trigger and Home header's search slot dispatch
// this with an optional scope; one palette owns the glass surface + key nav.
export const COMMAND_PALETTE_OPEN_EVENT = "dc:command-palette-open";

export type CommandPaletteScope = "all" | "products";
export type CommandPaletteRequest = { scope?: CommandPaletteScope };

export function openCommandPalette(request: CommandPaletteRequest = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CommandPaletteRequest>(COMMAND_PALETTE_OPEN_EVENT, { detail: request }));
}
