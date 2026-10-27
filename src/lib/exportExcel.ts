import * as XLSX from 'xlsx';
import { GroupRow, Level } from './aggregate';
import { DerivedRow, Metric } from './metrics';

export interface ExportableRowItem {
  kind: 'row' | 'chain' | 'item' | 'status';
  row?: GroupRow;
  d?: DerivedRow;
  depth?: number;
}

export interface ExportLevelTableOptions {
  level: Level;
  label: string;
  rows: ExportableRowItem[];
  total: DerivedRow;
  totalCount: number;
  period: { pyLabel: string; cyLabel: string };
  metric: Metric;
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
}: ExportLevelTableOptions): void {
  const wb = XLSX.utils.book_new();

  const hasExpanded = rows.some((r) => r.kind === 'item' || r.kind === 'chain');

  const metricSuffix = metric === 'units' ? 'Units' : 'EGP';
  const pyHeader = `PY (${period.pyLabel}) [${metricSuffix}]`;
  const cyHeader = `CY (${period.cyLabel}) [${metricSuffix}]`;
  const growthHeader = `YoY Growth [${metricSuffix}]`;
  const pctHeader = 'YoY Growth %';

  let headers: string[];
  if (level === 'customer') {
    headers = hasExpanded
      ? [
          'Customer ID',
          'Customer Name / Item',
          'Brick (CY)',
          'SubType',
          'Type',
          'Brand',
          pyHeader,
          cyHeader,
          growthHeader,
          pctHeader,
          'Status',
        ]
      : [
          'Customer ID',
          'Customer Name',
          'Brick (CY)',
          'SubType',
          pyHeader,
          cyHeader,
          growthHeader,
          pctHeader,
          'Status',
        ];
  } else if (level === 'brick') {
    headers = hasExpanded
      ? [
          'Brick / Item',
          'Territory',
          'Type',
          'Brand',
          pyHeader,
          cyHeader,
          growthHeader,
          pctHeader,
          'Status',
        ]
      : ['Brick', 'Territory', pyHeader, cyHeader, growthHeader, pctHeader, 'Status'];
  } else {
    headers = hasExpanded
      ? [`${label} / Item`, 'Type', 'Brand', pyHeader, cyHeader, growthHeader, pctHeader, 'Status']
      : [label, pyHeader, cyHeader, growthHeader, pctHeader, 'Status'];
  }

  const pyColIdx = headers.length - 5;
  const cyColIdx = headers.length - 4;
  const deltaColIdx = headers.length - 3;
  const growthColIdx = headers.length - 2;

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

    const depth = fr.depth ?? 0;
    const indent = '  '.repeat(depth);
    const rowLabel = indent + (fr.kind === 'chain' ? `[Chain] ${fr.row.label}` : fr.row.label);
    const rowType = fr.kind === 'chain' ? 'Chain' : fr.kind === 'item' ? 'Item' : label;
    const brandVal = fr.row.brand ?? '';

    if (level === 'customer') {
      if (hasExpanded) {
        if (fr.kind === 'item') {
          dataRows.push(['', rowLabel, '', '', rowType, brandVal, pyVal, cyVal, deltaVal, growthVal, statusVal]);
        } else {
          dataRows.push([
            fr.row.customerId ?? '',
            rowLabel,
            fr.row.brick ?? '',
            fr.row.subType ?? '',
            rowType,
            '',
            pyVal,
            cyVal,
            deltaVal,
            growthVal,
            statusVal,
          ]);
        }
      } else {
        dataRows.push([
          fr.row.customerId ?? '',
          fr.row.label,
          fr.row.brick ?? '',
          fr.row.subType ?? '',
          pyVal,
          cyVal,
          deltaVal,
          growthVal,
          statusVal,
        ]);
      }
    } else if (level === 'brick') {
      if (hasExpanded) {
        if (fr.kind === 'item') {
          dataRows.push([rowLabel, '', rowType, brandVal, pyVal, cyVal, deltaVal, growthVal, statusVal]);
        } else {
          dataRows.push([rowLabel, fr.row.territory ?? '', rowType, '', pyVal, cyVal, deltaVal, growthVal, statusVal]);
        }
      } else {
        dataRows.push([fr.row.label, fr.row.territory ?? '', pyVal, cyVal, deltaVal, growthVal, statusVal]);
      }
    } else {
      if (hasExpanded) {
        dataRows.push([rowLabel, rowType, brandVal, pyVal, cyVal, deltaVal, growthVal, statusVal]);
      } else {
        dataRows.push([fr.row.label, pyVal, cyVal, deltaVal, growthVal, statusVal]);
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

  let totalRow: (string | number)[];
  if (level === 'customer') {
    totalRow = hasExpanded
      ? ['', totalLabel, '', '', 'Total', '', total.py, total.cy, total.delta, totalGrowthVal, totalStatus]
      : ['', totalLabel, '', '', total.py, total.cy, total.delta, totalGrowthVal, totalStatus];
  } else if (level === 'brick') {
    totalRow = hasExpanded
      ? [totalLabel, '', 'Total', '', total.py, total.cy, total.delta, totalGrowthVal, totalStatus]
      : [totalLabel, '', total.py, total.cy, total.delta, totalGrowthVal, totalStatus];
  } else {
    totalRow = hasExpanded
      ? [totalLabel, 'Total', '', total.py, total.cy, total.delta, totalGrowthVal, totalStatus]
      : [totalLabel, total.py, total.cy, total.delta, totalGrowthVal, totalStatus];
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
