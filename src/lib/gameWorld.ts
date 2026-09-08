/** A normal full-page navigation works independently of React event listeners,
 * native dialog support and parent-frame GPU/memory limits. Header buttons stay
 * where they are; the SAME full world is opened on every device. */
export function openGameWorld() {
  try {
    window.sessionStorage.setItem("dc:game:return-to",
      window.location.pathname + window.location.search + window.location.hash);
  } catch { /* Storage can be blocked; the game page still has a Home link. */ }
  window.location.assign(gameWorldUrl());
}

export function gameWorldUrl(): string {
  return `${import.meta.env.BASE_URL}game-world/index.html?scene=world&nogate=1`;
}
