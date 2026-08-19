export declare const collectPaidModuleIdSet: (paidUpdates: unknown) => Set<string>;

export declare const isPaidUpgradeModule: (module: unknown, paidModuleIds?: Set<string> | null) => boolean;

export declare const resolvePaidUpdateForModule: (
  module: unknown,
  paidUpdates: unknown,
) => { id?: string; title?: string; cashPrice?: number } | null;

export declare const filterCurriculumForPdp: <T extends { id?: string; paid?: boolean; paidUpdateId?: string; modules?: T[] }>(
  modules: T[] | unknown,
  options?: {
    isProductOwned?: boolean;
    ownedUpdateIds?: ReadonlySet<string> | readonly string[];
  },
) => { modules: T[]; mode: "included" | "paid-upgrade" };

export declare const countCurriculumTree: (modules: unknown) => { modulesCount: number; resourcesCount: number };
