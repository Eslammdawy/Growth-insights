/**
 * Central configuration. Change values here rather than in components.
 */

/** SubTypes whose rows can be expanded into a per-Chain breakdown on the SubType level. */
export const EXPANDABLE_SUBTYPES: readonly string[] = ['Chain'];

/** Distributors excluded from the Distributor level table (already represented in SubType). */
export const EXCLUDED_DISTRIBUTORS: readonly string[] = ['Ezaby', 'Ezzaby'];

/** Columns that must be present in the uploaded / converted data (matched by header name). */
export const REQUIRED_COLUMNS = [
  'Date',
  'Line',
  'Brand',
  'Item',
  'MainType',
  'SubType',
  'Brick',
  'Territory',
  'Chain',
  'CustomerID',
  'CustomerName',
  'Distributor',
  'TransactionType',
  'Quantity',
  'Value',
] as const;

/** All known columns of the export (others are kept too if present). */
export const KNOWN_COLUMNS = [
  'Date',
  'Line',
  'Brand',
  'Item',
  'ClientItemCode',
  'OriginalItem',
  'MainType',
  'SubType',
  'Brick',
  'Territory',
  'Country',
  'Chain',
  'CustomerID',
  'ClientCustomerCode',
  'CustomerName',
  'CustomerIDName',
  'CustomerAddress',
  'BranchID',
  'BranchName',
  'BranchCode',
  'Distributor',
  'TransactionType',
  'Quantity',
  'Value',
  'IsTender',
  'IsOffer',
  'IsUPA',
  'IsMirror',
  'AddedByMirrorRole',
] as const;

/** Columns stored as plain numeric arrays; every other column is dictionary-encoded text. */
export const NUMERIC_COLUMNS: readonly string[] = ['Date', 'Quantity', 'Value'];

/** Supported transaction types (Bonus / Return Bonus are always excluded from metrics). */
export const TX_TYPES = ['Sales', 'Return Sales'] as const;
export type TxType = (typeof TX_TYPES)[number];

/** Above this row count aggregation runs inside the Web Worker. */
export const WORKER_AGGREGATION_THRESHOLD = 50_000;

/** Files above this size trigger a "use the convert script" recommendation. */
export const LARGE_FILE_WARNING_BYTES = 20 * 1024 * 1024;

/** Location of the converted sample data (relative to the app base). */
export const SAMPLE_DATA_URL = './data/sales.json.gz';

export const UNASSIGNED_LABEL = '(Unassigned)';
export const UNASSIGNED_CHAIN_LABEL = '(Unassigned / Independent)';

/** Values with an absolute magnitude below this are treated as zero (floating-point noise). */
export const EPSILON = 1e-9;

export const GROWTH_BAND = 0.05;          // ±5% stable band for customer segments
export const WATERFALL_TOP_N = 8;         // individual bars each side of the waterfall
export const PARETO_TOP_N = 10;
export const RETURNS_FLAG_FACTOR = 1.5;   // > 1.5× portfolio rate flags a row
export const RETURNS_MIN_GROSS = 10_000;  // EGP gross floor before flagging

