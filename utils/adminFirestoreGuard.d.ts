export const PRIMARY_ADMIN_EMAIL: string;
export const normalizeAdminEmail: (email?: string | null) => string;
export const isPrimaryAdminEmailAddress: (email?: string | null) => boolean;
export const isAdminRoleValue: (role?: string | null) => boolean;
export const ADMIN_WRITE_ERROR_PREFIX: {
  readonly noAuthUser: string;
  readonly tokenRefreshFailed: string;
  readonly roleCheckReadFailed: string;
  readonly roleMissing: string;
};

export type AdminFirestoreWriteDiagnostics = {
  uid: string;
  email: string | null;
  role: string | null;
  isPrimaryAdminEmail: boolean;
};

export declare const ensureAdminFirestoreWriteAccess: () => Promise<AdminFirestoreWriteDiagnostics>;
export declare const describeFirebaseError: (error: unknown) => string;
export declare const describeAdminProductWriteError: (
  error: unknown,
  action: 'add' | 'update' | 'delete',
  diagnostics?: Partial<AdminFirestoreWriteDiagnostics> | null
) => string;
