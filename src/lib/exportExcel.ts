import * as XLSX from 'xlsx';
import { GroupRow, LEVEL_LABEL, Level, TABLE_LEVELS, sumRows } from './aggregate';
import {
  DerivedRow,
  Growth,
  GrowthStatus,
  Metric,
  PRODUCT_EXPOSURE_LEVEL_LABEL,
  ProductExposureLevel,
  ProductSegmentBreakdown,
  Sums,
  contributionPp,
  deriveRow,
  emptySums,
  metricPair,
  returnsRatePct,
} from './metrics';

function formatGrowthCell(g: Growth): number | string {
  if (g.kind === 'pct') return g.value;
  if (g.kind === 'lost') return -1.0;
  if (g.kind === 'new') return 'New';
  return '–';
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
  return raw !== null && Number.isFinite(raw) ? raw : '–';
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

export interface ExportableRowItem {
  kind: 'row' | 'chain' | 'item' | 'status';
  row?: GroupRow;
  d?: DerivedRow;
  depth?: number;
  contribPp?: number | null;
}

export interface ExportLevelTableOptions {
  level: Level;
  label: string;
  rows: ExportableRowItem[];
  total: DerivedRow;
  totalCount: number;
  period: { pyLabel: string; cyLabel: string };
  metric: Metric;
  portfolioTotals?: Sums;
  showReturns?: boolean;
  tableGrossTotals?: Sums;
}

/**
 * Download a SheetJS workbook in the browser environment.
 */
export function saveWorkbook(wb: XLSX.WorkBook, filename: string): void {
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
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

/**
 * Builds an Excel workbook for any level table (SubType, Distributor, Territory, Brick, Customer)
 * and triggers a browser download.
 */
export function exportLevelTableToExcel({
  level,
  label,
  rows,
  total,
  totalCount,
  period,
  metric,
  portfolioTotals,
  showReturns,
  tableGrossTotals,
}: ExportLevelTableOptions): void {
  const wb = XLSX.utils.book_new();

  const hasExpanded = rows.some((r) => r.kind === 'item' || r.kind === 'chain');

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
    : total.py;

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

  let headers: string[];
  if (level === 'customer') {
    headers = hasExpanded
      ? ['Customer ID', 'Customer Name / Item', 'Brick (CY)', 'SubType', 'Type', 'Brand', ...metricTailHeaders]
      : ['Customer ID', 'Customer Name', 'Brick (CY)', 'SubType', ...metricTailHeaders];
  } else if (level === 'brick') {
    headers = hasExpanded
      ? ['Brick / Item', 'Territory', 'Type', 'Brand', ...metricTailHeaders]
      : ['Brick', 'Territory', ...metricTailHeaders];
  } else {
    headers = hasExpanded
      ? [`${label} / Item`, 'Type', 'Brand', ...metricTailHeaders]
      : [label, ...metricTailHeaders];
  }

  const tailLen = metricTailHeaders.length;
  const pyColIdx = headers.length - tailLen;
  const cyColIdx = pyColIdx + 1;
  const deltaColIdx = pyColIdx + 2;
  const growthColIdx = pyColIdx + 3;
  const contribColIdx = pyColIdx + 4;
  const grossColIdx = showReturns ? pyColIdx + 5 : -1;
  const returnsColIdx = showReturns ? pyColIdx + 6 : -1;
  const returnsPctColIdx = showReturns ? pyColIdx + 7 : -1;

  const dataRows: (string | number)[][] = [];

  for (const fr of rows) {
    if (fr.kind === 'status' || !fr.row || !fr.d) continue;

    const pyVal = fr.d.py ?? 0;
    const cyVal = fr.d.cy ?? 0;
    const deltaVal = fr.d.delta;

    const growthVal = formatGrowthCell(fr.d.growth);
    const rawContrib = fr.contribPp !== undefined ? fr.contribPp : contributionPp(deltaVal, totalPy);
    const contribVal: number | string = rawContrib !== null && Number.isFinite(rawContrib) ? rawContrib : '–';
    const statusVal = formatStatusLabel(fr.d.status);

    const grossCy = fr.row.gross ? (metric === 'units' ? fr.row.gross.cyQ : fr.row.gross.cyV) : cyVal;
    const returnsCy = cyVal - grossCy;
    const retPct = fr.row.gross ? returnsRatePct(fr.row.sums.cyV, fr.row.gross.cyV) : null;
    const retPctCell: number | string = retPct !== null ? retPct / 100 : '–';

    const tailCells: (string | number)[] = showReturns
      ? [pyVal, cyVal, deltaVal, growthVal, contribVal, grossCy, returnsCy, retPctCell, statusVal]
      : [pyVal, cyVal, deltaVal, growthVal, contribVal, statusVal];

    const depth = fr.depth ?? 0;
    const indent = '  '.repeat(depth);
    const rowLabel = indent + (fr.kind === 'chain' ? `[Chain] ${fr.row.label}` : fr.row.label);
    const rowType = fr.kind === 'chain' ? 'Chain' : fr.kind === 'item' ? 'Item' : label;
    const brandVal = fr.row.brand ?? '';

    if (level === 'customer') {
      if (hasExpanded) {
        if (fr.kind === 'item') {
          dataRows.push(['', rowLabel, '', '', rowType, brandVal, ...tailCells]);
        } else {
          dataRows.push([
            fr.row.customerId ?? '',
            rowLabel,
            fr.row.brick ?? '',
            fr.row.subType ?? '',
            rowType,
            '',
            ...tailCells,
          ]);
        }
      } else {
        dataRows.push([
          fr.row.customerId ?? '',
          fr.row.label,
          fr.row.brick ?? '',
          fr.row.subType ?? '',
          ...tailCells,
        ]);
      }
    } else if (level === 'brick') {
      if (hasExpanded) {
        if (fr.kind === 'item') {
          dataRows.push([rowLabel, '', rowType, brandVal, ...tailCells]);
        } else {
          dataRows.push([rowLabel, fr.row.territory ?? '', rowType, '', ...tailCells]);
        }
      } else {
        dataRows.push([fr.row.label, fr.row.territory ?? '', ...tailCells]);
      }
    } else {
      if (hasExpanded) {
        dataRows.push([rowLabel, rowType, brandVal, ...tailCells]);
      } else {
        dataRows.push([fr.row.label, ...tailCells]);
      }
    }
  }

  // Summary Total Row
  const totalLabel = `Total (${totalCount.toLocaleString('en-US')} ${label.toLowerCase()}s)`;
  const totalGrowthVal = formatGrowthCell(total.growth);
  const totalContribVal = formatContribCell(total.delta, totalPy);
  const totalStatus = formatStatusLabel(total.status);

  const totGrossCy = tableGrossTotals
    ? metric === 'units'
      ? tableGrossTotals.cyQ
      : tableGrossTotals.cyV
    : total.cy;
  const totReturnsCy = total.cy - totGrossCy;
  const totRetPct = tableGrossTotals
    ? returnsRatePct(metric === 'units' ? total.cy : total.cy, tableGrossTotals.cyV)
    : null;
  const totRetPctCell: number | string = totRetPct !== null ? totRetPct / 100 : '–';

  const totalTailCells: (string | number)[] = showReturns
    ? [total.py, total.cy, total.delta, totalGrowthVal, totalContribVal, totGrossCy, totReturnsCy, totRetPctCell, totalStatus]
    : [total.py, total.cy, total.delta, totalGrowthVal, totalContribVal, totalStatus];

  let totalRow: (string | number)[];
  if (level === 'customer') {
    totalRow = hasExpanded
      ? ['', totalLabel, '', '', 'Total', '', ...totalTailCells]
      : ['', totalLabel, '', '', ...totalTailCells];
  } else if (level === 'brick') {
    totalRow = hasExpanded
      ? [totalLabel, '', 'Total', '', ...totalTailCells]
      : [totalLabel, '', ...totalTailCells];
  } else {
    totalRow = hasExpanded
      ? [totalLabel, 'Total', '', ...totalTailCells]
      : [totalLabel, ...totalTailCells];
  }
  dataRows.push(totalRow);

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);

  // Set cell number formats
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let R = 1; R <= range.e.r; ++R) {
    const pyCell = ws[XLSX.utils.encode_cell({ r: R, c: pyColIdx })];
    if (pyCell && typeof pyCell.v === 'number') pyCell.z = '#,##0';

    const cyCell = ws[XLSX.utils.encode_cell({ r: R, c: cyColIdx })];
    if (cyCell && typeof cyCell.v === 'number') cyCell.z = '#,##0';

    const deltaCell = ws[XLSX.utils.encode_cell({ r: R, c: deltaColIdx })];
    if (deltaCell && typeof deltaCell.v === 'number') deltaCell.z = '+#,##0;-#,##0;0';

    const growthCell = ws[XLSX.utils.encode_cell({ r: R, c: growthColIdx })];
    if (growthCell && typeof growthCell.v === 'number') growthCell.z = '+0.0%;-0.0%;0.0%';

    const contribCell = ws[XLSX.utils.encode_cell({ r: R, c: contribColIdx })];
    if (contribCell && typeof contribCell.v === 'number') contribCell.z = '+0.00"%";-0.00"%";0.00"%"';

    if (showReturns) {
      const gCell = ws[XLSX.utils.encode_cell({ r: R, c: grossColIdx })];
      if (gCell && typeof gCell.v === 'number') gCell.z = '#,##0';

      const rCell = ws[XLSX.utils.encode_cell({ r: R, c: returnsColIdx })];
      if (rCell && typeof rCell.v === 'number') rCell.z = '+#,##0;-#,##0;0';

      const rpCell = ws[XLSX.utils.encode_cell({ r: R, c: returnsPctColIdx })];
      if (rpCell && typeof rpCell.v === 'number') rpCell.z = '0.0%';
    }
  }

  // Compute column widths
  ws['!cols'] = computeColWidths(headers, dataRows);

  const sheetName = `${label} Level`.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const safeLabel = label.replace(/\s+/g, '_');
  const filename = `HPG_${safeLabel}_Level_${period.cyLabel}_${metric}.xlsx`;
  saveWorkbook(wb, filename);
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
    const contribVal: number | string = c.contribPp !== null && Number.isFinite(c.contribPp) ? c.contribPp : '–';
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
          dataRows.push(['', `  ${it.label}`, '', '', 'Item', it.brand ?? '', itPy, '–']);
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
 * Exports the Product × Customer-Segment Exposure Matrix and Customer-Behavior Decomposition
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
    `YoY Δ [${metricSuffix}]`,
    'YoY %',
    `New Seg Δ [${metricSuffix}]`,
    'New Seg pp',
    `Growing Seg Δ [${metricSuffix}]`,
    'Growing Seg pp',
    `Stable Seg Δ [${metricSuffix}]`,
    'Stable Seg pp',
    `Declining Seg Δ [${metricSuffix}]`,
    'Declining Seg pp',
    `Lost Seg Δ [${metricSuffix}]`,
    'Lost Seg pp',
    `+New Cust Effect [${metricSuffix}]`,
    '+New Cust pp',
    `+Expansion Effect [${metricSuffix}]`,
    '+Expansion pp',
    `−Contraction Effect [${metricSuffix}]`,
    '−Contraction pp',
    `−Lost Cust Effect [${metricSuffix}]`,
    '−Lost Cust pp',
  ];

  const headers = [...prefixHeaders, ...metricHeaders];
  const pLen = prefixHeaders.length;

  const ppCell = (pp: number | null): number | string =>
    pp !== null && Number.isFinite(pp) ? pp : '–';

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
      growthVal = '–';
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
 * Exports multiple level tables into a single multi-tab Excel workbook,
 * each level in its own worksheet with hierarchical per-product (Item) rows
 * and side-by-side Units and Value (EGP) columns.
 */
export function exportAllLevelsToExcel({
  levels = TABLE_LEVELS,
  levelsData,
  itemsByLevel,
  period,
  metric,
  portfolioTotals,
  portfolioGrossTotals,
  showReturns,
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

  const buildTailCells = (sums: Sums, gross?: Sums): (string | number)[] => {
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
    const retPctCell: number | string = retPct !== null ? retPct / 100 : '–';

    return [...base, grossCyQ, returnsCyQ, grossCyV, returnsCyV, retPctCell, statusVal];
  };

  for (const level of levels) {
    const label = LEVEL_LABEL[level];
    const prefixHeaders =
      level === 'customer'
        ? ['Customer ID', 'Customer Name / Item', 'Brick (CY)', 'SubType', 'Type', 'Brand']
        : level === 'brick'
          ? ['Brick / Item', 'Territory', 'Type', 'Brand']
          : [`${label} / Item`, 'Type', 'Brand'];

    const headers = [...prefixHeaders, ...metricTailHeaders];
    const pLen = prefixHeaders.length;

    const topList = sortRowsByDeltaDesc(levelsData[level] ?? [], metric);
    const levelItems = itemsByLevel[level] ?? {};
    const dataRows: (string | number)[][] = [];

    for (const r of topList) {
      const parentTail = buildTailCells(r.sums, r.gross);
      if (level === 'customer') {
        dataRows.push([
          r.customerId ?? '',
          r.label,
          r.brick ?? '',
          r.subType ?? '',
          label,
          '',
          ...parentTail,
        ]);
      } else if (level === 'brick') {
        dataRows.push([r.label, r.territory ?? '', label, '', ...parentTail]);
      } else {
        dataRows.push([r.label, label, '', ...parentTail]);
      }

      const children = sortRowsByDeltaDesc(levelItems[r.id] ?? [], metric);
      for (const it of children) {
        const itemTail = buildTailCells(it.sums, it.gross);
        const indentedLabel = `  ${it.label}`;
        if (level === 'customer') {
          dataRows.push(['', indentedLabel, '', '', 'Item', it.brand ?? '', ...itemTail]);
        } else if (level === 'brick') {
          dataRows.push([indentedLabel, '', 'Item', it.brand ?? '', ...itemTail]);
        } else {
          dataRows.push([indentedLabel, 'Item', it.brand ?? '', ...itemTail]);
        }
      }
    }

    const totalSums = sumRows(topList);
    let hasGross = false;
    const tableGrossTotals = emptySums();
    for (const r of topList) {
      if (r.gross) {
        hasGross = true;
        tableGrossTotals.pyQ += r.gross.pyQ;
        tableGrossTotals.pyV += r.gross.pyV;
        tableGrossTotals.cyQ += r.gross.cyQ;
        tableGrossTotals.cyV += r.gross.cyV;
      }
    }
    const totalTail = buildTailCells(totalSums, hasGross ? tableGrossTotals : portfolioGrossTotals);
    const totalLabel = `Total (${topList.length.toLocaleString('en-US')} ${label.toLowerCase()}s)`;

    if (level === 'customer') {
      dataRows.push(['', totalLabel, '', '', 'Total', '', ...totalTail]);
    } else if (level === 'brick') {
      dataRows.push([totalLabel, '', 'Total', '', ...totalTail]);
    } else {
      dataRows.push([totalLabel, 'Total', '', ...totalTail]);
    }

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
    const sheetName = `${label} Level`.slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  saveWorkbook(wb, `HPG_All_Levels_${period.cyLabel}.xlsx`);
}


