/**
 * CSV and Excel (.xlsx) export of the currently visible comparison table.
 * Includes a metadata header block (period, active Line, filters, drill chips) and
 * all three metrics (Units, Value, PPG) for every visible row + expanded children + totals.
 */
import * as XLSX from 'xlsx';
import { AnalysisQuery, AnalysisResult, GroupRow, LEVEL_LABEL } from './aggregate';
import { fmtGrowth, fmtMetric, fmtPct, fmtPp, fmtSigned } from './format';
import { Metric, METRIC_LABEL, Sums, deriveRow, metricCells, ppgDecomposition } from './metrics';

export interface ExportContext {
  query: AnalysisQuery;
  result: AnalysisResult;
  metric: Metric;
  visibleRows: GroupRow[];
  expandedIds: Set<string>;
  statusFilter: string;
  topN: number | null;
  search: string;
}

function buildSheetMatrix(ctx: ExportContext): (string | number)[][] {
  const { query, result, metric, visibleRows, expandedIds, statusFilter, topN, search } = ctx;
  const lvlLabel = LEVEL_LABEL[query.level];
  const metaRows: (string | number)[][] = [
    ['Sales Growth Analyzer — Export'],
    ['Period', `${result.period.banner}`],
    ['Line', query.line ?? 'All Lines'],
    ['Primary Metric', METRIC_LABEL[metric]],
    ['Level', lvlLabel],
    ['Transaction Types', query.txTypes.join(', ') || 'None'],
    ['MainType Filter', query.mainTypes.length ? query.mainTypes.join(', ') : 'All'],
    ['Brand Filter', query.brands.length ? query.brands.join(', ') : 'All'],
    ['Item Filter', query.items.length ? query.items.join(', ') : 'All'],
    [
      'Drill-down Chips',
      query.drill.length ? query.drill.map((d) => `${d.field}=${d.label}`).join(' → ') : 'None',
    ],
    [
      'Table View Filters',
      [
        statusFilter !== 'all' ? `Status=${statusFilter}` : null,
        topN ? `Limit=${topN > 0 ? `Top ${topN}` : `Bottom ${Math.abs(topN)}`}` : null,
        search ? `Search="${search}"` : null,
      ]
        .filter(Boolean)
        .join(', ') || 'None',
    ],
    [],
  ];

  // Dynamic secondary columns by level
  const secHeaders: string[] = [];
  if (query.level === 'subtype') secHeaders.push('Chain Breakdown');
  if (query.level === 'brick') secHeaders.push('Territory');
  if (query.level === 'customer') secHeaders.push('Customer ID', 'Brick', 'SubType');

  const metricExtraHeaders =
    metric === 'ppg'
      ? ['CY Units Share %', 'Price Effect (EGP)']
      : [
          `${METRIC_LABEL[metric]} Share of Total (CY %)`,
          `${METRIC_LABEL[metric]} Contribution to Change (pp)`,
        ];

  const header: string[] = [
    lvlLabel,
    ...secHeaders,
    'Units PY',
    'Units CY',
    'Units Δ',
    'Units Growth %',
    'Value PY (EGP)',
    'Value CY (EGP)',
    'Value Δ (EGP)',
    'Value Growth %',
    'PPG PY (EGP)',
    'PPG CY (EGP)',
    'PPG Δ (EGP)',
    'PPG Growth %',
    ...metricExtraHeaders,
  ];

  const dataRows: (string | number)[][] = [];

  const formatRow = (sums: Sums, leadCols: (string | number)[], isTotal = false): (string | number)[] => {
    const u = metricCells(sums, 'units');
    const v = metricCells(sums, 'value');
    const p = metricCells(sums, 'ppg');
    const d = deriveRow(sums, result.totals, metric);

    let extra: (string | number)[];
    if (metric === 'ppg') {
      if (isTotal) {
        const dec = ppgDecomposition(
          visibleRows.map((r) => r.sums),
          result.totals,
        );
        extra = [
          '100.0%',
          `Price: ${fmtSigned(dec.priceEffect, 'ppg', false)} | Mix: ${fmtSigned(dec.mixEffect, 'ppg', false)}`,
        ];
      } else {
        extra = [fmtPct(d.unitsShare), d.priceEffect === null ? '–' : Number(d.priceEffect.toFixed(2))];
      }
    } else {
      extra = [
        isTotal ? '100.0%' : fmtPct(d.share),
        isTotal ? fmtPp(d.contributionPp) : fmtPp(d.contributionPp),
      ];
    }

    const num = (x: number | null, dec: number) => (x === null || !Number.isFinite(x) ? '–' : Number(x.toFixed(dec)));

    return [
      ...leadCols,
      num(u.py, 1),
      num(u.cy, 1),
      num(u.delta, 1),
      fmtGrowth(u.growth),
      num(v.py, 2),
      num(v.cy, 2),
      num(v.delta, 2),
      fmtGrowth(v.growth),
      num(p.py, 2),
      num(p.cy, 2),
      num(p.delta, 2),
      fmtGrowth(p.growth),
      ...extra,
    ];
  };

  for (const r of visibleRows) {
    if (query.level === 'subtype') {
      dataRows.push(formatRow(r.sums, [r.label, r.children ? `(${r.children.length} chains)` : '']));
      if (r.children && expandedIds.has(r.id)) {
        for (const ch of r.children) {
          dataRows.push(formatRow(ch.sums, [`  ↳ ${ r.label}`, ch.label]));
        }
      }
    } else if (query.level === 'brick') {
      const tSuffix = r.territoryOthers?.length ? ` (+${r.territoryOthers.length})` : '';
      dataRows.push(formatRow(r.sums, [r.label, `${r.territory ?? ''}${tSuffix}`]));
    } else if (query.level === 'customer') {
      const bSuffix = r.brickOthers?.length ? ` (+${r.brickOthers.length}: ${r.brickOthers.join(', ')})` : '';
      const sSuffix = r.subTypeOthers?.length ? ` (+${r.subTypeOthers.length}: ${r.subTypeOthers.join(', ')})` : '';
      dataRows.push(
        formatRow(r.sums, [
          r.label,
          r.customerId ?? r.value,
          `${r.brick ?? ''}${bSuffix}`,
          `${r.subType ?? ''}${sSuffix}`,
        ]),
      );
    } else {
      dataRows.push(formatRow(r.sums, [r.label]));
    }
  }

  // Pinned totals row
  const blankSec = secHeaders.map(() => '');
  dataRows.push(formatRow(result.totals, ['Total (All Matching Rows)', ...blankSec], true));

  return [...metaRows, header, ...dataRows];
}

function fileSlug(ctx: ExportContext): string {
  const line = (ctx.query.line ?? 'all-lines').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `sales-growth_${line}_${ctx.query.level}_${ctx.metric}_Q${ctx.query.period.quarter}-${ctx.query.period.cyYear}`;
}

export function exportToCsv(ctx: ExportContext): void {
  const matrix = buildSheetMatrix(ctx);
  const csv = matrix
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\r\n');
  // Prepend UTF-8 BOM so Excel opens Arabic characters properly
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${fileSlug(ctx)}.csv`);
}

export function exportToXlsx(ctx: ExportContext): void {
  const matrix = buildSheetMatrix(ctx);
  const ws = XLSX.utils.aoa_to_sheet(matrix);
  ws['!cols'] = matrix[12]?.map((_, i) => ({ wch: i === 0 ? 28 : 16 })) ?? [];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, LEVEL_LABEL[ctx.query.level]);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([out], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `${fileSlug(ctx)}.xlsx`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Re-export fmtMetric so callers can format KPI strings if needed
export { fmtMetric };
