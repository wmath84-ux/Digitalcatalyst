// Cached CPU geometry/materials can survive room visits, but their Three
// `dispose` listeners must not retain every old renderer/context. Dispose GPU
// bindings when the LAST mounted owner leaves; keep the CPU objects reusable.
// Never dispose on focus, culling, quality changes, or another owner's exit.
interface SharedResource { dispose(): void }
const owners = new WeakMap<SharedResource, number>();

export function retainSharedResources(resources: readonly SharedResource[]): () => void {
  const unique = new Set(resources);
  for (const resource of unique) owners.set(resource, (owners.get(resource) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const resource of unique) {
      const count = (owners.get(resource) ?? 1) - 1;
      if (count > 0) owners.set(resource, count);
      else {
        owners.delete(resource);
        resource.dispose();
      }
    }
    unique.clear();
  };
}
