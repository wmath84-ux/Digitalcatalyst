export const normalizeLibrarySearchText: (value: unknown) => string;

export interface PersonalResourceIdentityInput {
  type?: unknown;
  provider?: unknown;
  url?: unknown;
  sourceUrl?: unknown;
  embedUrl?: unknown;
  youtubeUrl?: unknown;
  youtubeVideoId?: unknown;
  originKind?: unknown;
  sourceProductId?: unknown;
  sourceModuleId?: unknown;
  sourceResourceId?: unknown;
  metadata?: Record<string, unknown>;
  origin?: {
    kind?: unknown;
    productId?: unknown;
    moduleId?: unknown;
    resourceId?: unknown;
  };
}

export const personalResourceIdentityDescriptor: (raw?: PersonalResourceIdentityInput) => string;
export const officialResourceReferenceKey: (reference?: {
  productId?: unknown;
  moduleId?: unknown;
  resourceId?: unknown;
}) => string;
export const libraryResourceSearchText: (resource: Record<string, unknown>, moduleTitle?: string) => string;

export interface PersonalLibraryFilterOptions {
  query?: string;
  type?: string;
  moduleId?: string;
  state?: "all" | "saved" | "organized" | "recent-added" | "recent-opened" | string;
  moduleTitleById?: Record<string, string>;
  now?: number;
  recentWindowMs?: number;
}

export const filterPersonalLibraryResources: <T extends object>(
  resources: T[],
  options?: PersonalLibraryFilterOptions,
) => T[];
export const sortPersonalLibraryResources: <T extends object>(
  resources: T[],
  mode?: "recent" | "opened" | "name" | "module" | string,
) => T[];
export const movePersonalLibraryItem: <T>(items: T[], fromIndex: number, toIndex: number) => T[];
