export type DockCountDestination = 'Store' | 'Purchased' | 'Wishlist' | 'Cart' | 'News' | 'Blog' | 'Free';

export type DockInventory = {
  Store: string[];
  Purchased: string[];
  Wishlist: string[];
  Cart: number;
  News: string[];
  Blog: string[];
  Free: string[];
};

export type DockSeenState = {
  version: 1;
  initializedAt: string;
  viewerKey: string;
  Store: string[];
  Purchased: string[];
  Wishlist: string[];
  Cart: number;
  News: string[];
  Blog: string[];
  Free: string[];
};

export type DockActivitySummary = {
  badgeCounts: Partial<Record<DockCountDestination, number>>;
  glowItems: DockCountDestination[];
};

const STORAGE_PREFIX = 'eduvora.dockSeen.v1';
const ARRAY_DESTINATIONS: Array<Exclude<DockCountDestination, 'Cart'>> = ['Store', 'Purchased', 'Wishlist', 'News', 'Blog', 'Free'];

const normalizeIds = (values: Array<string | number> = []) => Array.from(new Set(values.map(value => String(value)).filter(Boolean)));
const storageKey = (viewerKey: string) => `${STORAGE_PREFIX}:${viewerKey || 'guest'}`;

export const createDockInventory = (input: {
  storeIds?: Array<string | number>;
  purchasedIds?: Array<string | number>;
  wishlistIds?: Array<string | number>;
  cartCount?: number;
  newsIds?: Array<string | number>;
  blogIds?: Array<string | number>;
  freeIds?: Array<string | number>;
}): DockInventory => ({
  Store: normalizeIds(input.storeIds),
  Purchased: normalizeIds(input.purchasedIds),
  Wishlist: normalizeIds(input.wishlistIds),
  Cart: Math.max(0, Math.round(Number(input.cartCount) || 0)),
  News: normalizeIds(input.newsIds),
  Blog: normalizeIds(input.blogIds),
  Free: normalizeIds(input.freeIds),
});

const createBaseline = (viewerKey: string, inventory: DockInventory): DockSeenState => ({
  version: 1,
  initializedAt: new Date().toISOString(),
  viewerKey: viewerKey || 'guest',
  Store: [...inventory.Store],
  Purchased: [...inventory.Purchased],
  Wishlist: [...inventory.Wishlist],
  Cart: inventory.Cart,
  News: [...inventory.News],
  Blog: [...inventory.Blog],
  Free: [...inventory.Free],
});

export const persistDockSeenState = (viewerKey: string, state: DockSeenState) => {
  if (typeof window === 'undefined') return state;
  try {
    window.localStorage.setItem(storageKey(viewerKey), JSON.stringify(state));
  } catch {
    // New-content indicators remain usable in memory when storage is restricted.
  }
  return state;
};

export const readOrInitializeDockSeenState = (viewerKey: string, inventory: DockInventory): DockSeenState => {
  const baseline = createBaseline(viewerKey, inventory);
  if (typeof window === 'undefined') return baseline;

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(viewerKey)) || 'null') as Partial<DockSeenState> | null;
    if (!parsed || parsed.version !== 1) return persistDockSeenState(viewerKey, baseline);

    const normalized: DockSeenState = {
      version: 1,
      initializedAt: typeof parsed.initializedAt === 'string' ? parsed.initializedAt : baseline.initializedAt,
      viewerKey: typeof parsed.viewerKey === 'string' ? parsed.viewerKey : baseline.viewerKey,
      Store: Array.isArray(parsed.Store) ? normalizeIds(parsed.Store) : baseline.Store,
      Purchased: Array.isArray(parsed.Purchased) ? normalizeIds(parsed.Purchased) : baseline.Purchased,
      Wishlist: Array.isArray(parsed.Wishlist) ? normalizeIds(parsed.Wishlist) : baseline.Wishlist,
      Cart: Number.isFinite(Number(parsed.Cart)) ? Math.max(0, Math.round(Number(parsed.Cart))) : baseline.Cart,
      News: Array.isArray(parsed.News) ? normalizeIds(parsed.News) : baseline.News,
      Blog: Array.isArray(parsed.Blog) ? normalizeIds(parsed.Blog) : baseline.Blog,
      Free: Array.isArray(parsed.Free) ? normalizeIds(parsed.Free) : baseline.Free,
    };
    return persistDockSeenState(viewerKey, normalized);
  } catch {
    return persistDockSeenState(viewerKey, baseline);
  }
};

const unseenCount = (current: string[], seen: string[]) => {
  const seenSet = new Set(seen);
  return current.reduce((count, id) => count + (seenSet.has(id) ? 0 : 1), 0);
};

export const computeDockActivity = (inventory: DockInventory, seen: DockSeenState | null): DockActivitySummary => {
  const safeSeen = seen || createBaseline('anonymous-baseline', inventory);
  const additions = {
    Store: unseenCount(inventory.Store, safeSeen.Store),
    Purchased: unseenCount(inventory.Purchased, safeSeen.Purchased),
    Wishlist: unseenCount(inventory.Wishlist, safeSeen.Wishlist),
    Cart: Math.max(0, inventory.Cart - safeSeen.Cart),
    News: unseenCount(inventory.News, safeSeen.News),
    Blog: unseenCount(inventory.Blog, safeSeen.Blog),
    Free: unseenCount(inventory.Free, safeSeen.Free),
  };

  return {
    badgeCounts: {
      Store: additions.Store,
      Purchased: inventory.Purchased.length,
      Wishlist: inventory.Wishlist.length,
      Cart: inventory.Cart,
      News: additions.News,
      Blog: additions.Blog,
      Free: additions.Free,
    },
    glowItems: (Object.keys(additions) as DockCountDestination[]).filter(destination => additions[destination] > 0),
  };
};

export const acknowledgeDockDestination = (
  viewerKey: string,
  currentState: DockSeenState | null,
  inventory: DockInventory,
  destination: DockCountDestination,
): DockSeenState => {
  const base = currentState?.viewerKey === viewerKey
    ? currentState
    : readOrInitializeDockSeenState(viewerKey, inventory);
  const next: DockSeenState = { ...base };

  if (destination === 'Cart') {
    next.Cart = inventory.Cart;
  } else if (ARRAY_DESTINATIONS.includes(destination)) {
    next[destination] = [...inventory[destination]];
  }

  return persistDockSeenState(viewerKey, next);
};
