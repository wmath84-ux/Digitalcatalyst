export const FIRESTORE_DOCUMENT_SIZE_LIMIT_BYTES: number;
export const PRODUCT_DOC_SAVE_BUDGET_BYTES: number;
export const EMBEDDED_DATA_URL_OFFLOAD_MIN_BYTES: number;

export type EmbeddedDataUrlEntry = {
  path: string[];
  mime: string;
  isBase64: boolean;
  bytes: number;
  value: string;
};

export declare const isDataUrl: (value: unknown) => boolean;
export declare const parseDataUrl: (value: unknown) => Omit<EmbeddedDataUrlEntry, 'path'> | null;
export declare const collectEmbeddedDataUrls: (value: unknown, minBytes?: number) => EmbeddedDataUrlEntry[];
export declare const estimateFirestoreDocumentBytes: (value: unknown) => number;
export declare const getLargestLeafFields: (value: unknown, count?: number) => Array<{ path: string; bytes: number }>;
export declare const buildDataUrlOffloadPlan: (
  value: unknown,
  budgetBytes?: number
) => { currentEstimate: number; planned: EmbeddedDataUrlEntry[]; estimatedBytesAfter: number };
export declare const describeOversizeProductDocument: (value: unknown) => string | null;
export declare const buildOffloadStoragePath: (input: {
  mime: string;
  productId: number | string;
  index: number;
}) => string;
export declare const offloadProductEmbeddedData: <T>(
  product: T,
  productId: number | string
) => Promise<{ product: T; offloadedCount: number; offloadedBytes: number; estimatedBytes: number }>;
