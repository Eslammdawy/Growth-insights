import React, { useMemo, useRef, useState } from 'react';
import {
  ColumnDef,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Filter,
  Info,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { DrillChip, GroupRow, LEVEL_LABEL, NEXT_LEVEL } from '../lib/aggregate';
import { fmtGrowth, fmtMetric, fmtPct, fmtPp, fmtSigned } from '../lib/format';
import { DerivedRow, METRIC_LABEL, deriveRow, ppgDecomposition } from '../lib/metrics';
import { useDashboardStore } from '../store/useDashboardStore';

export interface EnrichedTableRow {
  row: GroupRow;
  derived: DerivedRow;
  isChild?: boolean;
  childrenEnriched?: EnrichedTableRow[];
}

interface ComparisonTableProps {
  enrichedRows: EnrichedTableRow[];
}

function OthersBadge({ others, fieldName }: { others?: string[]; fieldName: string }) {
  if (!others || others.length === 0) return null;
  return (
    <span
      title={`Prior / other ${fieldName} values: ${others.join(', ')}`}
      className="ml-1.5 inline-flex cursor-help items-center rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 tabular-nums"
    >
      +{others.length}
    </span>
  );
}

export const ComparisonTable: React.FC<ComparisonTableProps> = ({ enrichedRows }) => {
  const {
    result,
    metric,
    level,
    expandedIds,
    toggleExpanded,
    addDrillRow,
    resetFilters,
  } = useDashboardStore();

  const [sorting, setSorting] = useState<SortingState>([{ id: 'delta', desc: true }]);

  const expandedSet = useMemo(() => new Set(expandedIds), [expandedIds]);

  // Max magnitude for data bars
  const maxBarMagnitude = useMemo(() => {
    let max = 0;
    for (const item of enrichedRows) {
      const v =
        metric === 'ppg'
          ? item.derived.growth.kind === 'pct'
            ? Math.abs(item.derived.growth.value)
            : item.derived.growth.kind === 'lost'
              ? 1
              : 0
          : Math.abs(item.derived.delta ?? 0);
      if (v > max) max = v;
    }
    return max || 1;
  }, [enrichedRows, metric]);

  const handleRowDrill = (r: GroupRow, stayOnLevel = false) => {
    const chips: DrillChip[] = [];
    if (r.field === 'Chain' && r.parentValue !== undefined) {
      chips.push({ field: 'SubType', value: r.parentValue, label: r.parentValue });
      chips.push({ field: 'Chain', value: r.value, label: r.label });
    } else {
      chips.push({ field: r.field, value: r.value, label: r.label });
    }
    addDrillRow(chips, stayOnLevel);
  };

  const columns = useMemo<ColumnDef<EnrichedTableRow>[]>(() => {
    if (!result) return [];
    const mLabel = METRIC_LABEL[metric];
    const cols: ColumnDef<EnrichedTableRow>[] = [
      {
        id: 'label',
        accessorFn: (r) => r.row.label,
        header: LEVEL_LABEL[level],
        size: level === 'customer' ? 250 : 230,
        cell: ({ row }) => {
          const item = row.original;
          const r = item.row;
          const hasChildren = Boolean(r.children && r.children.length > 0);
          const isExpanded = expandedSet.has(r.id);

          return (
            <div
              className={`flex items-center justify-between gap-2 ${
                item.isChild ? 'pl-6 text-slate-600 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-slate-100'
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                {hasChildren ? (
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${r.label} chains`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(r.id);
                    }}
                    className="rounded-md p-0.5 text-slate-500 hover:bg-slate-200/80 dark:text-slate-400 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-sky-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                ) : item.isChild ? (
                  <span className="text-xs text-slate-400">↳</span>
                ) : null}

                <span className="truncate" dir="auto" title={r.label}>
                  {r.label}
                </span>

                {hasChildren && (
                  <span className="shrink-0 rounded-full bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.2 text-[10px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                    {r.children!.length}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRowDrill(r, true);
                }}
                title="Filter only (stay on this level)"
                aria-label={`Filter by ${r.label} and stay on ${LEVEL_LABEL[level]} level`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 rounded-md p-1 text-slate-400 hover:bg-sky-500/15 hover:text-sky-600 dark:hover:text-sky-300 transition-opacity"
              >
                <Filter className="h-3 w-3" />
              </button>
            </div>
          );
        },
      },
    ];

    if (level === 'brick') {
      cols.push({
        id: 'territory',
        accessorFn: (r) => r.row.territory ?? '',
        header: 'Territory',
        size: 165,
        cell: ({ row }) => {
          const r = row.original.row;
          return (
            <div className="flex items-center truncate text-xs text-slate-600 dark:text-slate-300" dir="auto">
              <span className="truncate">{r.territory}</span>
              <OthersBadge others={r.territoryOthers} fieldName="Territory" />
            </div>
          );
        },
      });
    }

    if (level === 'customer') {
      cols.push(
        {
          id: 'customerId',
          accessorFn: (r) => r.row.customerId ?? r.row.value,
          header: 'Customer ID',
          size: 115,
          cell: ({ row }) => (
            <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {row.original.row.customerId ?? row.original.row.value}
            </span>
          ),
        },
        {
          id: 'brick',
          accessorFn: (r) => r.row.brick ?? '',
          header: 'Brick (Latest)',
          size: 165,
          cell: ({ row }) => {
            const r = row.original.row;
            return (
              <div className="flex items-center truncate text-xs text-slate-600 dark:text-slate-300" dir="auto">
                <span className="truncate">{r.brick}</span>
                <OthersBadge others={r.brickOthers} fieldName="Brick" />
              </div>
            );
          },
        },
        {
          id: 'subType',
          accessorFn: (r) => r.row.subType ?? '',
          header: 'SubType (Latest)',
          size: 145,
          cell: ({ row }) => {
            const r = row.original.row;
            return (
              <div className="flex items-center truncate text-xs text-slate-600 dark:text-slate-300" dir="auto">
                <span className="truncate">{r.subType}</span>
                <OthersBadge others={r.subTypeOthers} fieldName="SubType" />
              </div>
            );
          },
        },
      );
    }

    cols.push(
      {
        id: 'py',
        accessorFn: (r) => r.derived.py ?? -Infinity,
        header: `PY (${result.period.pyLabel})`,
        size: 130,
        cell: ({ row }) => (
          <div className="text-right tabular-nums text-slate-700 dark:text-slate-300">
            {fmtMetric(row.original.derived.py, metric, false)}
          </div>
        ),
      },
      {
        id: 'cy',
        accessorFn: (r) => r.derived.cy ?? -Infinity,
        header: `CY (${result.period.cyLabel})`,
        size: 130,
        cell: ({ row }) => (
          <div className="text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {fmtMetric(row.original.derived.cy, metric, false)}
          </div>
        ),
      },
      {
        id: 'delta',
        accessorFn: (r) => r.derived.delta ?? -Infinity,
        header: `Δ ${mLabel}`,
        size: 135,
        cell: ({ row }) => {
          const d = row.original.derived;
          const isUp = (d.delta ?? 0) > 0;
          const isDown = (d.delta ?? 0) < 0;
          return (
            <div
              className={`text-right font-semibold tabular-nums ${
                isUp
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : isDown
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-500'
              }`}
            >
              {fmtSigned(d.delta, metric, false)}
            </div>
          );
        },
      },
      {
        id: 'growth',
        accessorFn: (r) => r.derived.growthNum,
        header: 'Growth %',
        size: 175,
        cell: ({ row }) => {
          const d = row.original.derived;
          const g = d.growth;
          const text = fmtGrowth(g);
          const isUp = d.status === 'growing' || d.status === 'new';
          const isDown = d.status === 'declining' || d.status === 'lost';
          const rawMag =
            metric === 'ppg'
              ? g.kind === 'pct'
                ? Math.abs(g.value)
                : g.kind === 'lost'
                  ? 1
                  : 0
              : Math.abs(d.delta ?? 0);
          const barWidth = Math.min(100, Math.round((rawMag / maxBarMagnitude) * 100));

          return (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1 tabular-nums">
                {g.kind === 'new' ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300">
                    <Sparkles className="h-3 w-3" />
                    New
                  </span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-0.5 text-xs font-bold ${
                      isUp
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : isDown
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-slate-500'
                    }`}
                  >
                    {isUp ? '▲' : isDown ? '▼' : ''}
                    {text}
                  </span>
                )}
              </div>
              {/* Inline Data Bar */}
              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
                <div
                  style={{ width: `${barWidth}%` }}
                  className={`h-full rounded-full ${
                    isUp ? 'bg-emerald-500' : isDown ? 'bg-amber-500' : 'bg-slate-400'
                  }`}
                />
              </div>
            </div>
          );
        },
      },
    );

    if (metric === 'ppg') {
      cols.push(
        {
          id: 'unitsShare',
          accessorFn: (r) => r.derived.unitsShare ?? -Infinity,
          header: 'CY Units Share',
          size: 125,
          cell: ({ row }) => (
            <div className="text-right tabular-nums text-slate-600 dark:text-slate-300">
              {fmtPct(row.original.derived.unitsShare)}
            </div>
          ),
        },
        {
          id: 'priceEffect',
          accessorFn: (r) => r.derived.priceEffect ?? -Infinity,
          header: () => (
            <span
              className="inline-flex items-center gap-1 cursor-help"
              title="Price Effect = Row CY Units Share × Row PPG Δ. The difference between Σ Price Effects and Total PPG Δ is the Mix Effect (shown in Totals row)."
            >
              Price Effect
              <Info className="h-3 w-3 text-slate-400" />
            </span>
          ),
          size: 135,
          cell: ({ row }) => {
            const pe = row.original.derived.priceEffect;
            const isUp = (pe ?? 0) > 0;
            const isDown = (pe ?? 0) < 0;
            return (
              <div
                className={`text-right font-medium tabular-nums ${
                  isUp
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : isDown
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500'
                }`}
              >
                {fmtSigned(pe, 'ppg', false)}
              </div>
            );
          },
        },
      );
    } else {
      cols.push(
        {
          id: 'share',
          accessorFn: (r) => r.derived.share ?? -Infinity,
          header: 'Share of Total (CY)',
          size: 135,
          cell: ({ row }) => (
            <div className="text-right tabular-nums text-slate-600 dark:text-slate-300">
              {fmtPct(row.original.derived.share)}
            </div>
          ),
        },
        {
          id: 'contributionPp',
          accessorFn: (r) => r.derived.contributionPp ?? -Infinity,
          header: 'Contrib. to Δ (pp)',
          size: 140,
          cell: ({ row }) => {
            const pp = row.original.derived.contributionPp;
            const isUp = (pp ?? 0) > 0;
            const isDown = (pp ?? 0) < 0;
            return (
              <div
                className={`text-right font-medium tabular-nums ${
                  isUp
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : isDown
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500'
                }`}
              >
                {fmtPp(pp)}
              </div>
            );
          },
        },
      );
    }

    return cols;
  }, [result, metric, level, expandedSet, maxBarMagnitude]);

  const table = useReactTable({
    data: enrichedRows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Flatten sorted top-level rows + any expanded children (sorted by same comparator)
  const flatRows = useMemo(() => {
    const sortedModel = table.getSortedRowModel().rows;
    const out: EnrichedTableRow[] = [];
    const activeSort = sorting[0];

    const sortChildren = (children: EnrichedTableRow[]) => {
      if (!activeSort) return children;
      const copy = [...children];
      const dir = activeSort.desc ? -1 : 1;
      copy.sort((a, b) => {
        let va: number | string = 0;
        let vb: number | string = 0;
        switch (activeSort.id) {
          case 'label':
            return dir * a.row.label.localeCompare(b.row.label);
          case 'py':
            va = a.derived.py ?? -Infinity;
            vb = b.derived.py ?? -Infinity;
            break;
          case 'cy':
            va = a.derived.cy ?? -Infinity;
            vb = b.derived.cy ?? -Infinity;
            break;
          case 'growth':
            va = Number.isNaN(a.derived.growthNum) ? -Infinity : a.derived.growthNum;
            vb = Number.isNaN(b.derived.growthNum) ? -Infinity : b.derived.growthNum;
            break;
          case 'share':
            va = a.derived.share ?? -Infinity;
            vb = b.derived.share ?? -Infinity;
            break;
          case 'contributionPp':
            va = a.derived.contributionPp ?? -Infinity;
            vb = b.derived.contributionPp ?? -Infinity;
            break;
          case 'unitsShare':
            va = a.derived.unitsShare ?? -Infinity;
            vb = b.derived.unitsShare ?? -Infinity;
            break;
          case 'priceEffect':
            va = a.derived.priceEffect ?? -Infinity;
            vb = b.derived.priceEffect ?? -Infinity;
            break;
          case 'delta':
          default:
            va = a.derived.delta ?? -Infinity;
            vb = b.derived.delta ?? -Infinity;
            break;
        }
        return va === vb ? 0 : va > vb ? dir : -dir;
      });
      return copy;
    };

    for (const r of sortedModel) {
      const orig = r.original;
      out.push(orig);
      if (orig.childrenEnriched && expandedSet.has(orig.row.id)) {
        out.push(...sortChildren(orig.childrenEnriched));
      }
    }
    return out;
  }, [table.getSortedRowModel().rows, expandedSet, sorting]);

  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 46,
    overscan: 14,
  });

  if (!result) return null;

  if (enrichedRows.length === 0) {
    return (
      <div className="glass-panel flex flex-col items-center justify-center rounded-2xl border border-slate-200/70 dark:border-slate-800/80 py-14 text-center">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          No rows match the current filter combination
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Try clearing search terms, status filters, or drill-down chips.
        </p>
        <button
          type="button"
          onClick={resetFilters}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset all filters
        </button>
      </div>
    );
  }

  const totalDerived = deriveRow(result.totals, result.totals, metric);
  const ppgDec =
    metric === 'ppg'
      ? ppgDecomposition(
          result.rows.map((r) => r.sums),
          result.totals,
        )
      : null;

  const virtualItems = rowVirtualizer.getVirtualItems();
  const totalHeight = rowVirtualizer.getTotalSize();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? totalHeight - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="glass-panel flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/80">
      {/* Table Top Info Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-800/80 px-4 py-2 text-xs text-slate-500 dark:text-slate-400">
        <div>
          Click any row to cross-filter and advance to{' '}
          <strong className="text-slate-700 dark:text-slate-200">
            {LEVEL_LABEL[NEXT_LEVEL[level]]}
          </strong>
          {level === 'subtype' && ' · Click chevron (▸) on Chain or Private to expand chains'}
        </div>
        <div className="flex items-center gap-2">
          <span>Quick sort:</span>
          <button
            type="button"
            onClick={() => setSorting([{ id: 'delta', desc: true }])}
            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
              sorting[0]?.id === 'delta'
                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                : 'hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            Δ Descending
          </button>
          <button
            type="button"
            onClick={() => setSorting([{ id: 'growth', desc: true }])}
            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
              sorting[0]?.id === 'growth'
                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                : 'hover:bg-slate-200/60 dark:hover:bg-slate-800'
            }`}
          >
            Growth % Descending
          </button>
        </div>
      </div>

      {/* Virtualized Scroll Container */}
      <div ref={parentRef} className="max-h-[540px] overflow-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-20 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-md shadow-sm">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header, idx) => {
                  const sorted = header.column.getIsSorted();
                  const isNumeric = idx >= (level === 'customer' ? 4 : level === 'brick' ? 2 : 1);
                  return (
                    <th
                      key={header.id}
                      style={{ width: header.getSize() }}
                      className={`border-b border-slate-200/80 dark:border-slate-800 px-3.5 py-2.5 font-bold uppercase tracking-wider text-[11px] text-slate-600 dark:text-slate-300 select-none ${
                        isNumeric ? 'text-right' : 'text-left'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={`inline-flex items-center gap-1 hover:text-sky-600 dark:hover:text-sky-400 focus:outline-none ${
                          isNumeric ? 'ml-auto' : ''
                        }`}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' ? (
                          <ArrowUp className="h-3.5 w-3.5 text-sky-500" />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="h-3.5 w-3.5 text-sky-500" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-35" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/60">
            {paddingTop > 0 && (
              <tr>
                <td style={{ height: `${paddingTop}px` }} colSpan={columns.length} />
              </tr>
            )}

            {virtualItems.map((vRow) => {
              const item = flatRows[vRow.index];
              const tempRow = { original: item } as any;
              return (
                <tr
                  key={item.row.id}
                  onClick={() => handleRowDrill(item.row, false)}
                  className={`group cursor-pointer transition-colors ${
                    item.isChild
                      ? 'bg-slate-50/70 hover:bg-sky-500/10 dark:bg-slate-900/40 dark:hover:bg-sky-500/10'
                      : 'hover:bg-sky-500/10 dark:hover:bg-sky-500/10'
                  }`}
                >
                  {table.getAllColumns().map((col) => (
                    <td key={col.id} className="px-3.5 py-2 align-middle">
                      {flexRender(col.columnDef.cell, {
                        row: tempRow,
                        column: col,
                      } as any)}
                    </td>
                  ))}
                </tr>
              );
            })}

            {paddingBottom > 0 && (
              <tr>
                <td style={{ height: `${paddingBottom}px` }} colSpan={columns.length} />
              </tr>
            )}
          </tbody>

          {/* Pinned Totals Row */}
          <tfoot className="sticky bottom-0 z-20 border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100/95 dark:bg-slate-900/95 backdrop-blur-md font-bold text-slate-900 dark:text-white shadow-inner">
            <tr>
              <td className="px-3.5 py-2.5">
                Total ({result.rows.length.toLocaleString('en-US')} {LEVEL_LABEL[level].toLowerCase()}s)
              </td>
              {level === 'brick' && <td className="px-3.5 py-2.5" />}
              {level === 'customer' && (
                <>
                  <td className="px-3.5 py-2.5" />
                  <td className="px-3.5 py-2.5" />
                  <td className="px-3.5 py-2.5" />
                </>
              )}
              <td className="px-3.5 py-2.5 text-right tabular-nums">
                {fmtMetric(totalDerived.py, metric, false)}
              </td>
              <td className="px-3.5 py-2.5 text-right tabular-nums">
                {fmtMetric(totalDerived.cy, metric, false)}
              </td>
              <td className="px-3.5 py-2.5 text-right tabular-nums">
                {fmtSigned(totalDerived.delta, metric, false)}
              </td>
              <td className="px-3.5 py-2.5 text-right tabular-nums">
                {fmtGrowth(totalDerived.growth)}
              </td>
              {metric === 'ppg' ? (
                <>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">100.0%</td>
                  <td
                    className="px-3.5 py-2.5 text-right text-[11px] tabular-nums"
                    title="Total PPG Δ = Σ Price Effects + Mix Effect"
                  >
                    <div>Price: {fmtSigned(ppgDec?.priceEffect, 'ppg', false)}</div>
                    <div className="font-normal text-slate-500 dark:text-slate-400">
                      Mix: {fmtSigned(ppgDec?.mixEffect, 'ppg', false)}
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">100.0%</td>
                  <td className="px-3.5 py-2.5 text-right tabular-nums">
                    {fmtPp(totalDerived.contributionPp)}
                  </td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
