import * as XLSX from 'xlsx';
import { GroupRow, Level } from './aggregate';
import { DerivedRow, Metric, Sums, contributionPp, returnsRatePct } from './metrics';

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

    let growthVal: number | string;
    if (fr.d.growth.kind === 'pct') {
      growthVal = fr.d.growth.value;
    } else if (fr.d.growth.kind === 'lost') {
      growthVal = -1.0;
    } else if (fr.d.growth.kind === 'new') {
      growthVal = 'New';
    } else {
      growthVal = '–';
    }

    const rawContrib = fr.contribPp !== undefined ? fr.contribPp : contributionPp(deltaVal, totalPy);
    const contribVal: number | string = rawContrib !== null && Number.isFinite(rawContrib) ? rawContrib : '–';

    const statusVal =
      fr.d.status === 'growing'
        ? 'Growing'
        : fr.d.status === 'declining'
          ? 'Declining'
          : fr.d.status === 'new'
            ? 'New'
            : fr.d.status === 'lost'
              ? 'Lost'
              : 'Flat';

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
  let totalGrowthVal: number | string;
  if (total.growth.kind === 'pct') {
    totalGrowthVal = total.growth.value;
  } else if (total.growth.kind === 'lost') {
    totalGrowthVal = -1.0;
  } else if (total.growth.kind === 'new') {
    totalGrowthVal = 'New';
  } else {
    totalGrowthVal = '–';
  }
  const rawTotalContrib = contributionPp(total.delta, totalPy);
  const totalContribVal: number | string =
    rawTotalContrib !== null && Number.isFinite(rawTotalContrib) ? rawTotalContrib : '–';

  const totalStatus =
    total.status === 'growing'
      ? 'Growing'
      : total.status === 'declining'
        ? 'Declining'
        : total.status === 'new'
          ? 'New'
          : total.status === 'lost'
            ? 'Lost'
            : 'Flat';

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
  const colWidths = headers.map((h, i) => {
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
  ws['!cols'] = colWidths;

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

