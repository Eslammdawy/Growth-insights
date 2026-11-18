import * as XLSX from 'xlsx';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { GroupRow, LEVEL_LABEL, Level, TABLE_LEVELS, sumRows } from './aggregate';
import {
  Growth,
  GrowthStatus,
  Metric,
  PRODUCT_EXPOSURE_LEVEL_LABEL,
  ProductExposureLevel,
  ProductSegmentBreakdown,
  Sums,
  contributionPp,
  deriveRow,
  metricPair,
  returnsRatePct,
} from './metrics';

function formatGrowthCell(g: Growth): number | string {
  if (g.kind === 'pct') return g.value;
  if (g.kind === 'lost') return -1.0;
  if (g.kind === 'new') return 'New';
  return 'â€“';
}

function formatStatusLabel(status: GrowthStatus): string {
  switch (status) {
    case 'growing':
      return 'Growing';
    case 'declining':
      return 'Declining';
    case 'new':
      return 'New';
    case 'lost':
      return 'Lost';
    default:
      return 'Flat';
  }
}

function formatContribCell(delta: number, totalPy: number): number | string {
  const raw = contributionPp(delta, totalPy);
  return raw !== null && Number.isFinite(raw) ? raw : 'â€“';
}

function computeColWidths(headers: string[], dataRows: (string | number)[][]): { wch: number }[] {
  return headers.map((h, i) => {
    let maxLen = h.length;
    for (const r of dataRows) {
      const val = r[i];
      if (val !== null && val !== undefined) {
        const len = String(val).length;
        if (len > maxLen) maxLen = len;
      }
    }
    return { wch: Math.min(50, Math.max(12, maxLen + 3)) };
  });
}

function setCellFormat(ws: XLSX.WorkSheet, r: number, c: number, fmt: string): void {
  const cell = ws[XLSX.utils.encode_cell({ r, c })];
  if (cell && typeof cell.v === 'number') cell.z = fmt;
}

/** Turns on Excel AutoFilter dropdowns across the header row + all data rows of a sheet. */
function applyAutoFilter(ws: XLSX.WorkSheet, nCols: number, nDataRows: number): void {
  if (nCols <= 0) return;
  ws['!autofilter'] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, nDataRows), c: nCols - 1 } }),
  };
}

/**
 * Flat (database-style) export layout for the level tables: one row per level value Ã— Item,
 * with the parent's descriptive columns repeated on every row. No parent subtotal rows,
 * no Total row, no Type column, no indentation, so the sheet can be filtered / pivoted safely.
 */
export function flatLevelPrefixHeaders(level: Level, label: string): string[] {
  if (level === 'customer') return ['Customer ID', 'Customer Name', 'Brick (CY)', 'SubType', 'Item', 'Brand'];
  if (level === 'brick') return ['Brick', 'Territory', 'Item', 'Brand'];
  return [label, 'Item', 'Brand'];
}

function flatParentCells(level: Level, r: GroupRow): (string | number)[] {
  if (level === 'customer') return [r.customerId ?? '', r.label, r.brick ?? '', r.subType ?? ''];
  if (level === 'brick') return [r.label, r.territory ?? ''];
  return [r.label];
}

/**
 * Builds the flat data rows for one level. Parents keep the given order; each parent's
 * items are sorted by YoY Growth (Î”, in `sortMetric`) desc. A parent without any item
 * breakdown is emitted once with blank Item/Brand so its sales are never dropped.
 */
function buildFlatLevelRows(
  level: Level,
  parents: GroupRow[],
  itemsByRow: Record<string, GroupRow[]>,
  sortMetric: Metric,
  tail: (row: GroupRow) => (string | number)[],
): (string | number)[][] {
  const out: (string | number)[][] = [];
  for (const p of parents) {
    const prefix = flatParentCells(level, p);
    const children = sortRowsByDeltaDesc(itemsByRow[p.id] ?? [], sortMetric);
    if (children.length === 0) {
      out.push([...prefix, '', '', ...tail(p)]);
      continue;
    }
    for (const it of children) out.push([...prefix, it.label, it.brand ?? '', ...tail(it)]);
  }
  return out;
}

export interface ExportLevelTableOptions {
  level: Level;
  label: string;
  /** Parent rows in the order shown in the table (already filtered by status / search / Top-N). */
  rows: GroupRow[];
  /** Item breakdown per parent row id. */
  itemsByRow: Record<string, GroupRow[]>;
  period: { pyLabel: string; cyLabel: string };
  metric: Metric;
  portfolioTotals?: Sums;
  showReturns?: boolean;
}

/**
 * Download a SheetJS workbook in the browser environment.
 * With `freezeHeader`, the top row of every sheet is frozen.
 */
export function saveWorkbook(wb: XLSX.WorkBook, filename: string, opts: { freezeHeader?: boolean } = {}): void {
  let wbout: Uint8Array = new Uint8Array(XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer);
  if (opts.freezeHeader) wbout = freezeHeaderRow(wbout);
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return;
  }
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const FROZEN_PANE_XML =
  '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
  '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';

/**
 * SheetJS Community Edition can't write frozen panes, so post-process the .xlsx (zip)
 * and inject a frozen top-row pane into every worksheet's <sheetView>.
 */
export function freezeHeaderRow(xlsx: Uint8Array): Uint8Array {
  const files = unzipSync(xlsx);
  for (const path of Object.keys(files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) continue;
    const xml = strFromU8(files[path]);
    const patched = xml.replace(/<sheetView\b([^>]*?)\/>/, `<sheetView$1>${FROZEN_PANE_XML}</sheetView>`);
    if (patched !== xml) files[path] = strToU8(patched);
  }
  return zipSync(files, { level: 6 });
}

/**
 * Builds a flat Excel sheet for one level table (SubType, Distributor, Chains, Territory, Brick,
 * Customer): every visible parent row broken down into all of its Items, one row per
 * parent Ã— Item, in the currently selected metric. Triggers a browser download.
 */
export function exportLevelTableToExcel({
  level,
  label,
  rows,
  itemsByRow,
  period,
  metric,
  portfolioTotals,
  showReturns,
}: ExportLevelTableOptions): void {
  const wb = XLSX.utils.book_new();

  const metricSuffix = metric === 'units' ? 'Units' : 'EGP';
  const pyHeader = `PY (${period.pyLabel}) [${metricSuffix}]`;
  const cyHeader = `CY (${period.cyLabel}) [${metricSuffix}]`;
  const growthHeader = `YoY Growth [${metricSuffix}]`;
  const pctHeader = 'YoY Growth %';
  const contribHeader = 'Contrib. %';
  const totalPy = portfolioTotals
    ? metric === 'units'
      ? portfolioTotals.pyQ
      : portfolioTotals.pyV
    : deriveRow(sumRows(rows), metric).py;

  const metricTailHeaders = showReturns
    ? [
        pyHeader,
        cyHeader,
        growthHeader,
        pctHeader,
        contribHeader,
        `CY Gross [${metricSuffix}]`,
        `CY Returns [${metricSuffix}]`,
        'Returns %',
        'Status',
      ]
    : [pyHeader, cyHeader, growthHeader, pctHeader, contribHeader, 'Status'];

  const headers = [...flatLevelPrefixHeaders(level, label), ...metricTailHeaders];

  const tailLen = metricTailHeaders.length;
  const pyColIdx = headers.length - tailLen;
  const cyColIdx = pyColIdx + 1;
  const deltaColIdx = pyColIdx + 2;
  const growthColIdx = pyColIdx + 3;
  const contribColIdx = pyColIdx + 4;
  const grossColIdx = showReturns ? pyColIdx + 5 : -1;
  const returnsColIdx = showReturns ? pyColIdx + 6 : -1;
  const returnsPctColIdx = showReturns ? pyColIdx + 7 : -1;

  const buildTail = (row: GroupRow): (string | number)[] => {
    const d = deriveRow(row.sums, metric);
    const growthVal = formatGrowthCell(d.growth);
    const contribVal = formatContribCell(d.delta, totalPy);
    const statusVal = formatStatusLabel(d.status);
    if (!showReturns) return [d.py, d.cy, d.delta, growthVal, contribVal, statusVal];

    const grossCy = row.gross ? (metric === 'units' ? row.gross.cyQ : row.gross.cyV) : d.cy;
    const returnsCy = d.cy - grossCy;
    const retPct = row.gross ? returnsRatePct(row.sums.cyV, row.gross.cyV) : null;
    const retPctCell: number | string = retPct !== null ? retPct / 100 : 'â€“';
    return [d.py, d.cy, d.delta, growthVal, contribVal, grossCy, returnsCy, retPctCell, statusVal];
  };

  const dataRows = buildFlatLevelRows(level, rows, itemsByRow, metric, buildTail);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

  // Set cell number formats
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = 1; R <= range.e.r; ++R) {
    setCellFormat(ws, R, pyColIdx, '#,##0');
    setCellFormat(ws, R, cyColIdx, '#,##0');
    setCellFormat(ws, R, deltaColIdx, '+#,##0;-#,##0;0');
    setCellFormat(ws, R, growthColIdx, '+0.0%;-0.0%;0.0%');
    setCellFormat(ws, R, contribColIdx, '+0.00"%";-0.00"%";0.00"%"');
    if (showReturns) {
      setCellFormat(ws, R, grossColIdx, '#,##0');
      setCellFormat(ws, R, returnsColIdx, '+#,##0;-#,##0;0');
      setCellFormat(ws, R, returnsPctColIdx, '0.0%');
    }
  }

  ws['!cols'] = computeColWidths(headers, dataRows);
  applyAutoFilter(ws, headers.length, dataRows.length);

  const sheetName = `${label} Level`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const safeLabel = label.replace(/\s+/g, '_');
  const filename = `HPG_${safeLabel}_Level_${period.cyLabel}_${metric}.xlsx`;
  saveWorkbook(wb, filename, { freezeHeader: true });
}

export interface WatchlistExportCustomer {
  row: GroupRow;
  pyVal: number;
  contribPp: number | null;
  items?: GroupRow[];
}

export interface ExportDefectorWatchlistOptions {
  customers: WatchlistExportCustomer[];
  period: { pyLabel: string; cyLabel: string };
  metric: Metric;
}

/**
 * WI-4: Exports the Top Lost Customers Defector Watchlist (and any expanded items) to Excel.
 */
export function exportDefectorWatchlistToExcel({
  customers,
  period,
  metric,
}: ExportDefectorWatchlistOptions): void {
  const wb = XLSX.utils.book_new();
  const metricSuffix = metric === 'units' ? 'Units' : 'EGP';
  const hasItems = customers.some((c) => c.items && c.items.length > 0);

  const headers = hasItems
    ? [
        'Customer ID',
        'Customer Name / Item',
        'Brick (CY)',
        'SubType',
        'Type',
        'Brand',
        `PY Lost (${period.pyLabel}) [${metricSuffix}]`,
        'Contrib. %',
      ]
    : [
        'Customer ID',
        'Customer Name',
        'Brick (CY)',
        'SubType',
        `PY Lost (${period.pyLabel}) [${metricSuffix}]`,
        'Contrib. %',
      ];

  const pyColIdx = headers.length - 2;
  const contribColIdx = headers.length - 1;
  const dataRows: (string | number)[][] = [];

  for (const c of customers) {
    const contribVal: number | string = c.contribPp !== null && Number.isFinite(c.contribPp) ? c.contribPp : 'â€“';
    if (hasItems) {
      dataRows.push([
        c.row.customerId ?? '',
        c.row.label,
        c.row.brick ?? '',
        c.row.subType ?? '',
        'Customer',
        '',
        c.pyVal,
        contribVal,
      ]);
      if (c.items) {
        for (const it of c.items) {
          const itPy = metric === 'units' ? it.sums.pyQ : it.sums.pyV;
          dataRows.push(['', `  ${it.label}`, '', '', 'Item', it.brand ?? '', itPy, 'â€“']);
        }
      }
    } else {
      dataRows.push([
        c.row.customerId ?? '',
        c.row.label,
        c.row.brick ?? '',
        c.row.subType ?? '',
        c.pyVal,
        contribVal,
      ]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = 1; R <= range.e.r; ++R) {
    const pyCell = ws[XLSX.utils.encode_cell({ r: R, c: pyColIdx })];
    if (pyCell && typeof pyCell.v === 'number') pyCell.z = '#,##0';

    const contribCell = ws[XLSX.utils.encode_cell({ r: R, c: contribColIdx })];
    if (contribCell && typeof contribCell.v === 'number') contribCell.z = '+0.00"%";-0.00"%";0.00"%"';
  }

  ws['!cols'] = headers.map((h, i) => {
    let maxLen = h.length;
    for (const r of dataRows) {
      const val = r[i];
      if (val !== null && val !== undefined) {
        maxLen = Math.max(maxLen, String(val).length);
      }
    }
    return { wch: Math.min(50, Math.max(12, maxLen + 3)) };
  });

  XLSX.utils.book_append_sheet(wb, ws, 'Defector Watchlist');
  saveWorkbook(wb, `HPG_Defector_Watchlist_${period.cyLabel}_${metric}.xlsx`);
}

export interface ExportProductExposureOptions {
  rows: ProductSegmentBreakdown[];
  level: ProductExposureLevel;
  viewLabel?: string;
  period: { pyLabel: string; cyLabel: string };
  metric: Metric;
}

/**
 * Exports the Product Ã— Customer-Segment Exposure Matrix and Customer-Behavior Decomposition
 * for the selected level (Item / Brand / Line) to Excel.
 */
export function exportProductExposureToExcel({
  rows,
  level,
  viewLabel,
  period,
  metric,
}: ExportProductExposureOptions): void {
  const wb = XLSX.utils.book_new();
  const metricSuffix = metric === 'units' ? 'Units' : 'EGP';
  const levelLabel = PRODUCT_EXPOSURE_LEVEL_LABEL[level];

  const prefixHeaders =
    level === 'item'
      ? ['Item', 'Brand', 'Line']
      : level === 'brand'
        ? ['Brand', 'Line']
        : ['Line'];

  const metricHeaders = [
    `PY (${period.pyLabel}) [${metricSuffix}]`,
    `CY (${period.cyLabel}) [${metricSuffix}]`,
    `YoY Î” [${metricSuffix}]`,
    'YoY %',
    `New Seg Î” [${metricSuffix}]`,
    'New Seg pp',
    `Growing Seg Î” [${metricSuffix}]`,
    'Growing Seg pp',
    `Stable Seg Î” [${metricSuffix}]`,
    'Stable Seg pp',
    `Declining Seg Î” [${metricSuffix}]`,
    'Declining Seg pp',
    `Lost Seg Î” [${metricSuffix}]`,
    'Lost Seg pp',
    `+New Cust Effect [${metricSuffix}]`,
    '+New Cust pp',
    `+Expansion Effect [${metricSuffix}]`,
    '+Expansion pp',
    `âˆ’Contraction Effect [${metricSuffix}]`,
    'âˆ’Contraction pp',
    `âˆ’Lost Cust Effect [${metricSuffix}]`,
    'âˆ’Lost Cust pp',
  ];

  const headers = [...prefixHeaders, ...metricHeaders];
  const pLen = prefixHeaders.length;

  const ppCell = (pp: number | null): number | string =>
    pp !== null && Number.isFinite(pp) ? pp : 'â€“';

  const segDelta = (r: ProductSegmentBreakdown, seg: 'new' | 'growing' | 'stable' | 'declining' | 'lost') => {
    const p = metricPair(r.segments[seg], metric);
    return p.cy - p.py;
  };

  const dataRows: (string | number)[][] = [];

  for (const r of rows) {
    const d = deriveRow(r.totals, metric);
    let growthVal: number | string;
    if (d.growth.kind === 'pct') {
      growthVal = d.growth.value;
    } else if (d.growth.kind === 'lost') {
      growthVal = -1.0;
    } else if (d.growth.kind === 'new') {
      growthVal = 'New';
    } else {
      growthVal = 'â€“';
    }

    const prefix =
      level === 'item'
        ? [r.itemLabel, r.brand ?? '', r.line ?? '']
        : level === 'brand'
          ? [r.itemLabel, r.line ?? '']
          : [r.itemLabel];

    const cb = r.customerBehavior;
    dataRows.push([
      ...prefix,
      d.py,
      d.cy,
      d.delta,
      growthVal,
      segDelta(r, 'new'),
      ppCell(r.newAcquisitionPp),
      segDelta(r, 'growing'),
      ppCell(r.expansionPp),
      segDelta(r, 'stable'),
      ppCell(r.stablePp),
      segDelta(r, 'declining'),
      ppCell(r.contractionExposurePp),
      segDelta(r, 'lost'),
      ppCell(r.churnExposurePp),
      cb.newCustomerEffect,
      ppCell(cb.newPp),
      cb.expansionEffect,
      ppCell(cb.expansionPp),
      cb.contractionEffect,
      ppCell(cb.contractionPp),
      cb.lostCustomerEffect,
      ppCell(cb.lostPp),
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

  const pyCol = pLen;
  const cyCol = pLen + 1;
  const deltaCol = pLen + 2;
  const growthCol = pLen + 3;
  // Pairs of (deltaCol, ppCol) starting at pLen + 4 (9 pairs = 18 cols)
  const signedDeltaCols = [
    deltaCol,
    pLen + 4,
    pLen + 6,
    pLen + 8,
    pLen + 10,
    pLen + 12,
    pLen + 14,
    pLen + 16,
    pLen + 18,
    pLen + 20,
  ];
  const ppCols = [
    pLen + 5,
    pLen + 7,
    pLen + 9,
    pLen + 11,
    pLen + 13,
    pLen + 15,
    pLen + 17,
    pLen + 19,
    pLen + 21,
  ];

  for (let R = 1; R <= range.e.r; ++R) {
    const pyC = ws[XLSX.utils.encode_cell({ r: R, c: pyCol })];
    if (pyC && typeof pyC.v === 'number') pyC.z = '#,##0';

    const cyC = ws[XLSX.utils.encode_cell({ r: R, c: cyCol })];
    if (cyC && typeof cyC.v === 'number') cyC.z = '#,##0';

    const grC = ws[XLSX.utils.encode_cell({ r: R, c: growthCol })];
    if (grC && typeof grC.v === 'number') grC.z = '+0.0%;-0.0%;0.0%';

    for (const cIdx of signedDeltaCols) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: cIdx })];
      if (cell && typeof cell.v === 'number') cell.z = '+#,##0;-#,##0;0';
    }
    for (const cIdx of ppCols) {
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: cIdx })];
      if (cell && typeof cell.v === 'number') cell.z = '+0.00"%";-0.00"%";0.00"%"';
    }
  }

  ws['!cols'] = headers.map((h, i) => {
    let maxLen = h.length;
    for (const r of dataRows) {
      const val = r[i];
      if (val !== null && val !== undefined) {
        maxLen = Math.max(maxLen, String(val).length);
      }
    }
    return { wch: Math.min(50, Math.max(12, maxLen + 3)) };
  });

  const sheetTitle = `${levelLabel} Exposure${viewLabel ? ` (${viewLabel})` : ''}`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
  saveWorkbook(wb, `HPG_Product_Exposure_${levelLabel}_${period.cyLabel}_${metric}.xlsx`);
}

export interface ExportAllLevelsOptions {
  levels?: readonly Level[];
  levelsData: Record<Level, GroupRow[]>;
  itemsByLevel: Record<Level, Record<string, GroupRow[]>>;
  period: { pyLabel: string; cyLabel: string };
  metric: Metric;
  portfolioTotals: Sums;
  portfolioGrossTotals?: Sums;
  showReturns?: boolean;
}

function sortRowsByDeltaDesc(rows: GroupRow[], metric: Metric): GroupRow[] {
  return [...rows].sort((a, b) => {
    const da = deriveRow(a.sums, metric).delta;
    const db = deriveRow(b.sums, metric).delta;
    if (db !== da) return db - da;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Exports multiple level tables into a single multi-tab Excel workbook, each level in its
 * own worksheet as a flat table (one row per level value Ã— Item, parent columns repeated)
 * with side-by-side Units and Value (EGP) columns.
 */
export function exportAllLevelsToExcel({
  levels = TABLE_LEVELS,
  levelsData,
  itemsByLevel,
  period,
  metric,
  showReturns,
  portfolioTotals,
}: ExportAllLevelsOptions): void {
  const wb = XLSX.utils.book_new();
  const totalPyUnits = portfolioTotals.pyQ;
  const totalPyValue = portfolioTotals.pyV;

  const metricTailHeaders = [
    `PY (${period.pyLabel}) [Units]`,
    `CY (${period.cyLabel}) [Units]`,
    'YoY Growth [Units]',
    'YoY Growth % [Units]',
    'Contrib. % [Units]',
    `PY (${period.pyLabel}) [EGP]`,
    `CY (${period.cyLabel}) [EGP]`,
    'YoY Growth [EGP]',
    'YoY Growth % [EGP]',
    'Contrib. % [EGP]',
    ...(showReturns
      ? ['CY Gross [Units]', 'CY Returns [Units]', 'CY Gross [EGP]', 'CY Returns [EGP]', 'Returns %']
      : []),
    'Status',
  ];

  const buildTailCells = (row: GroupRow): (string | number)[] => {
    const { sums, gross } = row;
    const u = deriveRow(sums, 'units');
    const v = deriveRow(sums, 'value');
    const statusVal = formatStatusLabel((metric === 'units' ? u : v).status);

    const base: (string | number)[] = [
      u.py,
      u.cy,
      u.delta,
      formatGrowthCell(u.growth),
      formatContribCell(u.delta, totalPyUnits),
      v.py,
      v.cy,
      v.delta,
      formatGrowthCell(v.growth),
      formatContribCell(v.delta, totalPyValue),
    ];

    if (!showReturns) {
      return [...base, statusVal];
    }

    const grossCyQ = gross ? gross.cyQ : sums.cyQ;
    const returnsCyQ = sums.cyQ - grossCyQ;
    const grossCyV = gross ? gross.cyV : sums.cyV;
    const returnsCyV = sums.cyV - grossCyV;
    const retPct = gross ? returnsRatePct(sums.cyV, gross.cyV) : null;
    const retPctCell: number | string = retPct !== null ? retPct / 100 : 'â€“';

    return [...base, grossCyQ, returnsCyQ, grossCyV, returnsCyV, retPctCell, statusVal];
  };

  for (const level of levels) {
    const label = LEVEL_LABEL[level];
    const prefixHeaders = flatLevelPrefixHeaders(level, label);
    const headers = [...prefixHeaders, ...metricTailHeaders];
    const pLen = prefixHeaders.length;

    const topList = sortRowsByDeltaDesc(levelsData[level] ?? [], metric);
    const dataRows = buildFlatLevelRows(level, topList, itemsByLevel[level] ?? {}, metric, buildTailCells);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');

    for (let R = 1; R <= range.e.r; ++R) {
      setCellFormat(ws, R, pLen, '#,##0');
      setCellFormat(ws, R, pLen + 1, '#,##0');
      setCellFormat(ws, R, pLen + 2, '+#,##0;-#,##0;0');
      setCellFormat(ws, R, pLen + 3, '+0.0%;-0.0%;0.0%');
      setCellFormat(ws, R, pLen + 4, '+0.00"%";-0.00"%";0.00"%"');
      setCellFormat(ws, R, pLen + 5, '#,##0');
      setCellFormat(ws, R, pLen + 6, '#,##0');
      setCellFormat(ws, R, pLen + 7, '+#,##0;-#,##0;0');
      setCellFormat(ws, R, pLen + 8, '+0.0%;-0.0%;0.0%');
      setCellFormat(ws, R, pLen + 9, '+0.00"%";-0.00"%";0.00"%"');

      if (showReturns) {
        setCellFormat(ws, R, pLen + 10, '#,##0');
        setCellFormat(ws, R, pLen + 11, '+#,##0;-#,##0;0');
        setCellFormat(ws, R, pLen + 12, '#,##0');
        setCellFormat(ws, R, pLen + 13, '+#,##0;-#,##0;0');
        setCellFormat(ws, R, pLen + 14, '0.0%');
      }
    }

    ws['!cols'] = computeColWidths(headers, dataRows);
    applyAutoFilter(ws, headers.length, dataRows.length);
    const sheetName = `${label} Level`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  saveWorkbook(wb, `HPG_All_Levels_${period.cyLabel}.xlsx`, { freezeHeader: true });
}
