import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileSpreadsheet,
  Filter,
  Loader2,
  Network,
  Package,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { DrillChip, GroupRow, ItemTarget, LEVEL_LABEL, Level, sumRows } from '../lib/aggregate';
import { exportLevelTableToExcel } from '../lib/exportExcel';
import { fmtGrowth, fmtMetric, fmtPct, fmtPp, fmtSigned } from '../lib/format';
import {
  DerivedRow,
  Metric,
  classifyCustomerSegment,
  contributionPp,
  deriveRow,
  emptySums,
  isReturnsFlagged,
  returnsRatePct,
} from '../lib/metrics';
import { StatusFilter, useDashboardStore } from '../store/useDashboardStore';

type SortId = 'label' | 'py' | 'cy' | 'delta' | 'growth' | 'contrib' | 'returns';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All rows' },
  { value: 'growing', label: 'Growing' },
  { value: 'declining', label: 'Declining' },
  { value: 'new', label: 'New' },
  { value: 'lost', label: 'Lost (−100%)' },
];

const CUSTOMER_STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All segments' },
  { value: 'new', label: 'New' },
  { value: 'growing', label: 'Growing (>+5%)' },
  { value: 'stable', label: 'Stable (±5%)' },
  { value: 'declining', label: 'Declining (<−5%)' },
  { value: 'lost', label: 'Lost (−100%)' },
];

const TOP_N_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All ranks' },
  { value: '10', label: 'Top 10' },
  { value: '25', label: 'Top 25' },
  { value: '50', label: 'Top 50' },
  { value: '-10', label: 'Bottom 10' },
  { value: '-25', label: 'Bottom 25' },
];

/** One rendered line of the table. */
type FlatRow =
  | { kind: 'row' | 'chain' | 'item'; key: string; row: GroupRow; d: DerivedRow; depth: number; target?: ItemTarget }
  | { kind: 'status'; key: string; depth: number; state: 'loading' | 'error' | 'empty'; retry?: () => void };

const CHAINS_SUFFIX = '#chains';

const LEVEL_THEME: Record<
  Level,
  {
    topBar: string;
    toolbarBg: string;
    badge: string;
    theadBg: string;
  }
> = {
  subtype: {
    topBar: 'from-indigo-500 via-violet-500 to-purple-500',
    toolbarBg: 'from-indigo-50/80 via-violet-50/40 to-white/90 dark:from-indigo-950/50 dark:via-slate-900/90 dark:to-slate-900/90',
    badge: 'from-indigo-600 to-violet-600',
    theadBg: 'from-indigo-100/95 via-violet-50/95 to-indigo-50/95 dark:from-slate-900/95 dark:via-indigo-950/90 dark:to-slate-900/95',
  },
  distributor: {
    topBar: 'from-cyan-500 via-sky-500 to-blue-600',
    toolbarBg: 'from-cyan-50/80 via-sky-50/40 to-white/90 dark:from-cyan-950/50 dark:via-slate-900/90 dark:to-slate-900/90',
    badge: 'from-cyan-600 to-blue-600',
    theadBg: 'from-cyan-100/95 via-sky-50/95 to-cyan-50/95 dark:from-slate-900/95 dark:via-cyan-950/90 dark:to-slate-900/95',
  },
  chain: {
    topBar: 'from-purple-500 via-pink-500 to-rose-500',
    toolbarBg: 'from-purple-50/80 via-pink-50/40 to-white/90 dark:from-purple-950/50 dark:via-slate-900/90 dark:to-slate-900/90',
    badge: 'from-purple-600 to-pink-600',
    theadBg: 'from-purple-100/95 via-pink-50/95 to-purple-50/95 dark:from-slate-900/95 dark:via-purple-950/90 dark:to-slate-900/95',
  },
  territory: {
    topBar: 'from-emerald-500 via-teal-500 to-cyan-500',
    toolbarBg: 'from-emerald-50/80 via-teal-50/40 to-white/90 dark:from-emerald-950/50 dark:via-slate-900/90 dark:to-slate-900/90',
    badge: 'from-emerald-600 to-teal-600',
    theadBg: 'from-emerald-100/95 via-teal-50/95 to-emerald-50/95 dark:from-slate-900/95 dark:via-emerald-950/90 dark:to-slate-900/95',
  },
  brick: {
    topBar: 'from-amber-500 via-orange-500 to-rose-500',
    toolbarBg: 'from-amber-50/80 via-orange-50/40 to-white/90 dark:from-amber-950/50 dark:via-slate-900/90 dark:to-slate-900/90',
    badge: 'from-amber-500 to-orange-600',
    theadBg: 'from-amber-100/95 via-orange-50/95 to-amber-50/95 dark:from-slate-900/95 dark:via-amber-950/90 dark:to-slate-900/95',
  },
  customer: {
    topBar: 'from-fuchsia-500 via-purple-500 to-indigo-500',
    toolbarBg: 'from-fuchsia-50/80 via-purple-50/40 to-white/90 dark:from-fuchsia-950/50 dark:via-slate-900/90 dark:to-slate-900/90',
    badge: 'from-fuchsia-600 to-purple-600',
    theadBg: 'from-fuchsia-100/95 via-purple-50/95 to-indigo-50/95 dark:from-slate-900/95 dark:via-purple-950/90 dark:to-slate-900/95',
  },
};

function OthersBadge({ others, fieldName }: { others?: string[]; fieldName: string }) {
  if (!others || others.length === 0) return null;
  return (
    <span
      title={`Prior / other ${fieldName} values: ${others.join(', ')}`}
      className="ml-1.5 inline-flex cursor-help items-center rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-500/30 dark:text-amber-300 tabular-nums"
    >
      +{others.length}
    </span>
  );
}

function sortValue(r: { row: GroupRow; d: DerivedRow }, id: SortId, totalPy: number): number | string {
  switch (id) {
    case 'label':
      return r.row.label;
    case 'py':
      return r.d.py ?? -Infinity;
    case 'cy':
      return r.d.cy ?? -Infinity;
    case 'delta':
      return r.d.delta;
    case 'growth':
      return r.d.growth.kind === 'new' ? Infinity : r.d.growth.kind === 'none' ? -Infinity : r.d.growth.value;
    case 'contrib': {
      const pp = contributionPp(r.d.delta, totalPy);
      return pp !== null ? pp : r.d.delta;
    }
    case 'returns': {
      const rate = r.row.gross ? returnsRatePct(r.row.sums.cyV, r.row.gross.cyV) : null;
      return rate !== null ? rate : -Infinity;
    }
  }
}

function sortList<T extends { row: GroupRow; d: DerivedRow }>(list: T[], id: SortId, desc: boolean, totalPy: number): T[] {
  const dir = desc ? -1 : 1;
  return [...list].sort((a, b) => {
    const va = sortValue(a, id, totalPy);
    const vb = sortValue(b, id, totalPy);
    if (typeof va === 'string' || typeof vb === 'string') return dir * String(va).localeCompare(String(vb));
    return va === vb ? 0 : va > vb ? dir : -dir;
  });
}

interface LevelTableRowProps {
  fr: FlatRow;
  rowIndex: number;
  level: Level;
  metric: Metric;
  colCount: number;
  maxMag: number;
  totalPy: number;
  showReturns: boolean;
  portfolioReturnsRatePct: number | null;
  itemsOpen: boolean;
  chainsOpen: boolean;
  onToggle: (key: string, target?: ItemTarget) => void;
  onFilter: (r: GroupRow) => void;
}

export const LevelTableRow = React.memo<LevelTableRowProps>(function LevelTableRow({
  fr,
  rowIndex,
  level,
  metric,
  colCount,
  maxMag,
  totalPy,
  showReturns,
  portfolioReturnsRatePct,
  itemsOpen,
  chainsOpen,
  onToggle,
  onFilter,
}) {
  if (fr.kind === 'status') {
    return (
      <tr aria-rowindex={rowIndex} className="bg-slate-50/70 dark:bg-slate-900/40">
        <td colSpan={colCount} className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400" style={{ paddingLeft: 16 + fr.depth * 22 }}>
          {fr.state === 'loading' ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" /> Loading items…
            </span>
          ) : fr.state === 'empty' ? (
            'No items'
          ) : (
            <span>
              Could not load items.{' '}
              {fr.retry && (
                <button type="button" onClick={fr.retry} className="font-semibold text-sky-600 hover:underline dark:text-sky-400">
                  Retry
                </button>
              )}
            </span>
          )}
        </td>
      </tr>
    );
  }

  const { row: r, d, depth, kind } = fr;
  const isItem = kind === 'item';
  const isUp = d.status === 'growing' || d.status === 'new';
  const isDown = d.status === 'declining' || d.status === 'lost';
  const tone = isUp
    ? 'text-emerald-600 dark:text-emerald-400'
    : isDown
      ? 'text-rose-600 dark:text-rose-400'
      : 'text-slate-500';
  const barWidth = Math.min(100, Math.round((Math.abs(d.delta) / maxMag) * 100));
  const contribPp = contributionPp(d.delta, totalPy);
  const contribHalfWidth = Math.min(50, Math.round((Math.abs(d.delta) / maxMag) * 50));

  return (
    <tr
      aria-rowindex={rowIndex}
      onClick={isItem ? undefined : () => onToggle(r.id, fr.target)}
      className={`group transition-colors ${isItem ? '' : 'cursor-pointer'} ${
        depth === 0
          ? rowIndex % 2 === 0
            ? 'bg-white/60 hover:bg-indigo-500/10 dark:bg-slate-900/35 dark:hover:bg-indigo-500/20'
            : 'bg-indigo-50/40 hover:bg-indigo-500/10 dark:bg-indigo-950/20 dark:hover:bg-indigo-500/20'
          : isItem
            ? 'bg-cyan-50/55 hover:bg-cyan-500/15 dark:bg-cyan-950/25 dark:hover:bg-cyan-500/20'
            : 'bg-violet-50/60 hover:bg-violet-500/15 dark:bg-violet-950/30 dark:hover:bg-violet-500/20'
      }`}
    >
      {/* Label */}
      <td className="px-3 py-1.5 align-middle">
        <div className="flex items-center justify-between gap-2" style={{ paddingLeft: depth * 22 }}>
          <div
            className={`flex min-w-0 items-center gap-1.5 ${
              depth === 0 ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-200'
            }`}
          >
            {isItem ? (
              <Package className="h-3.5 w-3.5 shrink-0 text-cyan-500 dark:text-cyan-400" />
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(r.id, fr.target);
                }}
                aria-expanded={itemsOpen}
                aria-controls={`items-${r.id}`}
                aria-label={`${itemsOpen ? 'Hide' : 'Show'} items of ${r.label}`}
                className="rounded-md p-0.5 text-indigo-500 hover:bg-indigo-500/15 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {itemsOpen ? <ChevronDown className="h-4 w-4 text-indigo-600 dark:text-indigo-400" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            )}
            <span className="truncate" dir="auto" title={r.label}>
              {r.label}
            </span>
            {isItem && r.brand && (
              <span className="shrink-0 truncate rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300" dir="auto">
                {r.brand}
              </span>
            )}
            {kind === 'chain' && (
              <span className="shrink-0 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-500/25 dark:text-violet-300">
                Chain
              </span>
            )}
            {kind === 'row' && r.children && r.children.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(r.id + CHAINS_SUFFIX);
                }}
                aria-expanded={chainsOpen}
                aria-controls={`chains-${r.id}`}
                title={`${chainsOpen ? 'Hide' : 'Show'} chain breakdown`}
                className={`ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all ${
                  chainsOpen
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                    : 'bg-violet-500/15 text-violet-700 ring-1 ring-violet-500/30 hover:bg-violet-500/25 dark:bg-violet-500/20 dark:text-violet-300'
                }`}
              >
                <Network className="h-3 w-3" />
                {r.children.length} chains
              </button>
            )}
          </div>
          {!isItem && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFilter(r);
              }}
              title="Filter the whole dashboard by this row"
              aria-label={`Filter dashboard by ${r.label}`}
              className="rounded-md p-1 text-indigo-400 opacity-0 transition-opacity hover:bg-indigo-500/15 hover:text-indigo-600 focus:opacity-100 group-hover:opacity-100 dark:hover:text-indigo-300"
            >
              <Filter className="h-3 w-3" />
            </button>
          )}
        </div>
      </td>

      {level === 'brick' && (
        <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300" dir="auto">
          {depth === 0 && (
            <div className="flex items-center truncate">
              <span className="truncate">{r.territory}</span>
              <OthersBadge others={r.territoryOthers} fieldName="Territory" />
            </div>
          )}
        </td>
      )}
      {level === 'customer' && (
        <>
          <td className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300" dir="auto">
            {depth === 0 && (
              <div className="flex items-center truncate">
                <span className="truncate">{r.brick}</span>
                <OthersBadge others={r.brickOthers} fieldName="Brick" />
              </div>
            )}
          </td>
          <td className="px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300" dir="auto">
            {depth === 0 && (
              <div className="flex items-center truncate">
                <span className="truncate rounded-md bg-purple-500/10 px-1.5 py-0.5 text-[11px] font-medium text-purple-800 dark:bg-purple-500/20 dark:text-purple-200">{r.subType}</span>
                <OthersBadge others={r.subTypeOthers} fieldName="SubType" />
              </div>
            )}
          </td>
        </>
      )}

      <td className="px-3 py-1.5 text-right font-medium tabular-nums text-slate-600 dark:text-slate-300">{fmtMetric(d.py, metric, false)}</td>
      <td className="bg-indigo-500/[0.03] px-3 py-1.5 text-right font-bold tabular-nums text-indigo-950 dark:bg-cyan-500/[0.04] dark:text-cyan-100">
        {fmtMetric(d.cy, metric, false)}
      </td>
      <td className={`px-3 py-1.5 text-right font-bold tabular-nums ${tone}`}>{fmtSigned(d.delta, metric, false)}</td>
      <td className="px-3 py-1.5">
        <div className="flex flex-col items-end gap-1">
          {d.growth.kind === 'new' ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-500/30 dark:bg-amber-500/25 dark:text-amber-300">
              <Sparkles className="h-3 w-3" />
              New
            </span>
          ) : (
            <span
              className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                isUp
                  ? 'bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-300'
                  : isDown
                    ? 'bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30 dark:bg-rose-500/20 dark:text-rose-300'
                    : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
              }`}
            >
              {isUp ? '▲' : isDown ? '▼' : ''}
              {fmtGrowth(d.growth)}
            </span>
          )}
          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
            <div
              style={{ width: `${barWidth}%` }}
              className={`h-full rounded-full ${
                isUp
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  : isDown
                    ? 'bg-gradient-to-r from-rose-500 to-orange-500'
                    : 'bg-slate-400'
              }`}
            />
          </div>
        </div>
      </td>
      <td className="px-3 py-1.5">
        <div className="flex flex-col items-end gap-1">
          <span className={`text-[11px] font-bold tabular-nums ${tone}`}>
            {fmtPp(contribPp)}
          </span>
          <div className="relative h-1.5 w-20 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
            <div className="absolute inset-y-0 left-1/2 w-px bg-slate-400/60 dark:bg-slate-600" />
            {contribHalfWidth > 0 && (
              <div
                style={
                  d.delta >= 0
                    ? { left: '50%', width: `${contribHalfWidth}%` }
                    : { right: '50%', width: `${contribHalfWidth}%` }
                }
                className={`absolute inset-y-0 rounded-full ${
                  d.delta >= 0
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : 'bg-gradient-to-l from-rose-500 to-orange-500'
                }`}
              />
            )}
          </div>
        </div>
      </td>
      {showReturns && (
        <td className="px-3 py-1.5 text-right tabular-nums">
          {(() => {
            const retPct = r.gross ? returnsRatePct(r.sums.cyV, r.gross.cyV) : null;
            const flagged = r.gross
              ? isReturnsFlagged(r.sums.cyV, r.gross.cyV, portfolioReturnsRatePct)
              : false;
            return (
              <div className="inline-flex items-center justify-end gap-1.5">
                {flagged && (
                  <span
                    title="Elevated returns: row returns rate exceeds 1.5× portfolio rate with CY Gross ≥ 10,000 EGP"
                    aria-label="Elevated returns warning"
                    className="h-2 w-2 shrink-0 rounded-full bg-rose-500 ring-2 ring-rose-500/35"
                  />
                )}
                <span
                  className={
                    flagged
                      ? 'font-bold text-rose-600 dark:text-rose-400'
                      : 'font-medium text-slate-600 dark:text-slate-300'
                  }
                >
                  {retPct !== null ? fmtPct(retPct / 100) : '–'}
                </span>
              </div>
            );
          })()}
        </td>
      )}
    </tr>
  );
});

interface LevelTableProps {
  level: Level;
}

export const LevelTable: React.FC<LevelTableProps> = ({ level }) => {
  const [, startTransition] = useTransition();

  const {
    rows,
    period,
    totals,
    grossTotals,
    metric,
    txTypes,
    showReturns,
    setShowReturns,
    customerStatusFilter,
    setCustomerStatusFilter,
    itemsByRow,
    fetchItems,
    addDrillRow,
  } = useDashboardStore(
    useShallow((s) => ({
      rows: s.result?.levels[level],
      period: s.result?.period,
      totals: s.result?.totals,
      grossTotals: s.result?.grossTotals,
      metric: s.metric,
      txTypes: s.txTypes,
      showReturns: s.showReturns,
      setShowReturns: s.setShowReturns,
      customerStatusFilter: s.customerStatusFilter,
      setCustomerStatusFilter: s.setCustomerStatusFilter,
      itemsByRow: s.itemsByRow,
      fetchItems: s.fetchItems,
      addDrillRow: s.addDrillRow,
    }))
  );

  const [sort, setSort] = useState<{ id: SortId; desc: boolean }>({ id: 'delta', desc: true });
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [localStatus, setLocalStatus] = useState<StatusFilter>('all');
  const status = level === 'customer' ? customerStatusFilter : localStatus;
  const setStatus = level === 'customer' ? setCustomerStatusFilter : setLocalStatus;
  const [topN, setTopN] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const targets = useRef(new Map<string, ItemTarget>());

  const rowList = rows ?? [];
  const totalPy = totals ? (metric === 'units' ? totals.pyQ : totals.pyV) : 0;
  const bothTxTypes = txTypes.includes('Sales') && txTypes.includes('Return Sales');
  const effectiveShowReturns = showReturns && bothTxTypes;
  const portfolioReturnsRatePct =
    bothTxTypes && totals && grossTotals ? returnsRatePct(totals.cyV, grossTotals.cyV) : null;

  // Re-fetch item breakdowns of expanded rows after the analysis was refreshed (filters changed).
  useEffect(() => {
    for (const key of expanded) {
      if (key.endsWith(CHAINS_SUFFIX)) continue;
      const t = targets.current.get(key);
      if (t && itemsByRow[key] === undefined) void fetchItems(key, t);
    }
  }, [expanded, itemsByRow, fetchItems]);

  const toggle = useCallback((key: string, target?: ItemTarget) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        if (target) {
          targets.current.set(key, target);
          void fetchItems(key, target);
        }
      }
      return next;
    });
  }, [fetchItems]);

  const handleFilter = useCallback(
    (r: GroupRow) => {
      const chips: DrillChip[] = [];
      if (r.field === 'Chain' && r.parentValue !== undefined) {
        chips.push({ field: 'SubType', value: r.parentValue, label: r.parentValue });
        chips.push({ field: 'Chain', value: r.value, label: r.label });
      } else if (r.field !== 'Item') {
        chips.push({ field: r.field, value: r.value, label: r.label });
      }
      if (chips.length) {
        startTransition(() => {
          addDrillRow(chips);
        });
      }
    },
    [addDrillRow]
  );

  const topRows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    let list = rowList.map((row) => ({ row, d: deriveRow(row.sums, metric) }));
    if (status !== 'all') {
      if (level === 'customer') {
        list = list.filter((x) => classifyCustomerSegment(x.row.sums, metric) === status);
      } else {
        list = list.filter((x) => x.d.status === status);
      }
    }
    if (q) {
      list = list.filter(({ row: r }) =>
        [r.label, r.customerId, r.brick, r.territory, r.subType, ...(r.children?.map((c) => c.label) ?? [])].some(
          (s) => s && s.toLowerCase().includes(q),
        ),
      );
    }
    if (topN) {
      const byDelta = sortList(list, 'delta', true, totalPy);
      list = topN > 0 ? byDelta.slice(0, topN) : byDelta.slice(topN).reverse();
    }
    return sortList(list, sort.id, sort.desc, totalPy);
  }, [rowList, metric, status, level, deferredSearch, topN, sort, totalPy]);

  const maxMag = useMemo(() => {
    let m = 0;
    for (const x of topRows) m = Math.max(m, Math.abs(x.d.delta));
    return m || 1;
  }, [topRows]);

  const flat = useMemo<FlatRow[]>(() => {
    const out: FlatRow[] = [];
    const pushItems = (key: string, depth: number) => {
      const entry = itemsByRow[key];
      if (entry === undefined || entry === 'loading') {
        out.push({ kind: 'status', key: `${key}#status`, depth, state: 'loading' });
      } else if (entry === 'error') {
        const t = targets.current.get(key);
        out.push({
          kind: 'status',
          key: `${key}#status`,
          depth,
          state: 'error',
          retry: t ? () => void fetchItems(key, t) : undefined,
        });
      } else if (entry.length === 0) {
        out.push({ kind: 'status', key: `${key}#status`, depth, state: 'empty' });
      } else {
        const items = sortList(
          entry.map((row) => ({ row, d: deriveRow(row.sums, metric) })),
          sort.id,
          sort.desc,
          totalPy,
        );
        for (const it of items) out.push({ kind: 'item', key: it.row.id, row: it.row, d: it.d, depth });
      }
    };
    for (const top of topRows) {
      const r = top.row;
      const target: ItemTarget = { level, value: r.value };
      out.push({ kind: 'row', key: r.id, row: r, d: top.d, depth: 0, target });
      if (expanded.has(r.id)) pushItems(r.id, 1);
      if (r.children && expanded.has(r.id + CHAINS_SUFFIX)) {
        const chains = sortList(
          r.children.map((row) => ({ row, d: deriveRow(row.sums, metric) })),
          sort.id,
          sort.desc,
          totalPy,
        );
        for (const ch of chains) {
          const ct: ItemTarget = { level: 'subtype', value: r.value, chain: ch.row.value };
          out.push({ kind: 'chain', key: ch.row.id, row: ch.row, d: ch.d, depth: 1, target: ct });
          if (expanded.has(ch.row.id)) pushItems(ch.row.id, 2);
        }
      }
    }
    return out;
  }, [topRows, expanded, itemsByRow, metric, sort, level, fetchItems, totalPy]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: collapsed ? 0 : flat.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 42,
    overscan: 12,
  });

  const tableTotals = useMemo(() => sumRows(rowList), [rowList]);
  const tableGrossTotals = useMemo(() => {
    const s = emptySums();
    for (const r of rowList) {
      if (r.gross) {
        s.pyQ += r.gross.pyQ;
        s.pyV += r.gross.pyV;
        s.cyQ += r.gross.cyQ;
        s.cyV += r.gross.cyV;
      }
    }
    return s;
  }, [rowList]);

  if (!rows || !period || !totals) return null;

  const extraCols = level === 'customer' ? 2 : level === 'brick' ? 1 : 0;
  const colCount = 6 + extraCols + (effectiveShowReturns ? 1 : 0);
  const total = deriveRow(tableTotals, metric);
  const totalContribPp = contributionPp(total.delta, totalPy);
  const totalReturnsPct = returnsRatePct(tableTotals.cyV, tableGrossTotals.cyV);
  const isPartialLevel = level === 'distributor' || level === 'chain';
  const label = LEVEL_LABEL[level];
  const themeStyle = LEVEL_THEME[level];
  const totalUp = total.status === 'growing' || total.status === 'new';
  const totalDown = total.status === 'declining' || total.status === 'lost';
  const statusOptions = level === 'customer' ? CUSTOMER_STATUS_OPTIONS : STATUS_OPTIONS;

  const handleExportExcel = useCallback(() => {
    if (!rows || !period || !totals) return;
    setExporting(true);
    try {
      exportLevelTableToExcel({
        level,
        label,
        rows: flat,
        total,
        totalCount: rowList.length,
        period,
        metric,
        portfolioTotals: totals,
        showReturns: effectiveShowReturns,
        tableGrossTotals,
      });
    } catch (err) {
      console.error('Failed to export table to Excel:', err);
    } finally {
      setExporting(false);
    }
  }, [rows, period, totals, level, label, flat, total, rowList.length, metric, effectiveShowReturns, tableGrossTotals]);

  const headerCell = (id: SortId, text: string, align: 'left' | 'right' = 'right') => {
    const isSorted = sort.id === id;
    const sortState = isSorted ? (sort.desc ? 'descending' : 'ascending') : 'none';
    return (
      <th
        aria-sort={sortState}
        className={`border-b border-indigo-200/80 dark:border-slate-800 px-3 py-2.5 font-extrabold uppercase tracking-wider text-[11px] text-indigo-950 dark:text-indigo-200 select-none ${
          align === 'right' ? 'text-right' : 'text-left'
        }`}
      >
        <button
          type="button"
          onClick={() => setSort((s) => ({ id, desc: s.id === id ? !s.desc : id !== 'label' }))}
          className={`inline-flex items-center gap-1 hover:text-indigo-600 dark:hover:text-cyan-400 focus:outline-none ${
            align === 'right' ? 'ml-auto' : ''
          }`}
        >
          {text}
          {sort.id === id ? (
            sort.desc ? (
              <ArrowDown className="h-3.5 w-3.5 text-indigo-600 dark:text-cyan-400" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5 text-indigo-600 dark:text-cyan-400" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-40" />
          )}
        </button>
      </th>
    );
  };

  const plainHeader = (text: string) => (
    <th className="border-b border-indigo-200/80 dark:border-slate-800 px-3 py-2.5 text-left font-extrabold uppercase tracking-wider text-[11px] text-indigo-950 dark:text-indigo-200">
      {text}
    </th>
  );

  const vItems = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const padTop = vItems.length ? vItems[0].start : 0;
  const padBottom = vItems.length ? totalSize - vItems[vItems.length - 1].end : 0;

  return (
    <section
      id={`table-${level}`}
      aria-label={`${label} level table`}
      className="glass-panel relative flex flex-col overflow-hidden rounded-2xl border border-indigo-200/70 dark:border-slate-800/80 scroll-mt-28"
    >
      <div className={`h-1.5 w-full bg-gradient-to-r ${themeStyle.topBar}`} />
      {/* Table toolbar */}
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200/60 bg-gradient-to-r ${themeStyle.toolbarBg} px-3.5 py-2.5 dark:border-slate-800/80`}>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            title={collapsed ? 'Show table' : 'Hide table'}
            className="rounded-lg p-1 text-indigo-600 hover:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-slate-800"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <span className={`inline-flex items-center rounded-lg bg-gradient-to-r ${themeStyle.badge} px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-white shadow-sm`}>
            {label} Level
          </span>
          <span className="text-xs font-medium text-slate-600 tabular-nums dark:text-slate-300">
            {topRows.length.toLocaleString('en-US')} of {rowList.length.toLocaleString('en-US')} · click a row to drill down by items
            {level === 'subtype' && ' · use “chains” for the chain breakdown'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!collapsed && (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-indigo-400" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={level === 'customer' ? 'Search customer, brick…' : `Search ${label.toLowerCase()}…`}
                  aria-label={`Search ${label}`}
                  className="w-48 rounded-xl border border-indigo-200/80 bg-white/85 py-1 pl-8 pr-7 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-100"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
                aria-label={`${label} growth status filter`}
                className="rounded-xl border border-indigo-200/80 bg-white/85 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-200"
              >
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value} className="bg-white dark:bg-slate-900">
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={topN === null ? '' : String(topN)}
                onChange={(e) => setTopN(e.target.value === '' ? null : Number(e.target.value))}
                aria-label={`${label} top or bottom N`}
                className="rounded-xl border border-indigo-200/80 bg-white/85 px-2.5 py-1 text-xs font-semibold text-slate-700 focus:border-indigo-500 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-200"
              >
                {TOP_N_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-white dark:bg-slate-900">
                    {o.label}
                  </option>
                ))}
              </select>
              {bothTxTypes && (
                <button
                  type="button"
                  onClick={() => setShowReturns(!showReturns)}
                  aria-pressed={showReturns}
                  title="Toggle Returns % column (persisted in URL hash)"
                  className={`rounded-xl border px-2.5 py-1 text-xs font-semibold transition-all ${
                    showReturns
                      ? 'border-rose-500/50 bg-rose-500/15 text-rose-800 dark:text-rose-200'
                      : 'border-indigo-200/80 bg-white/85 text-slate-700 hover:bg-indigo-50 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-200'
                  }`}
                >
                  Show returns
                </button>
              )}
              {expanded.size > 0 && (
                <button
                  type="button"
                  onClick={() => setExpanded(new Set())}
                  className="rounded-xl bg-indigo-500/15 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-500/25 dark:text-indigo-300"
                >
                  Collapse all
                </button>
              )}
            </>
          )}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting}
            title={`Export ${label} table to Excel`}
            aria-label={`Export ${label} table to Excel`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 to-teal-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:from-emerald-500/25 hover:to-teal-500/25 dark:border-emerald-500/30 dark:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm transition-all disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
            ) : (
              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            )}
            <span>{exporting ? 'Exporting…' : 'Export to Excel'}</span>
          </button>
        </div>
      </div>

      {!collapsed && (
        <div ref={parentRef} className="max-h-[440px] overflow-auto">
          <table
            aria-rowcount={flat.length}
            className="w-full border-collapse text-left text-xs"
          >
            <thead className={`sticky top-0 z-20 bg-gradient-to-r ${themeStyle.theadBg} shadow-sm backdrop-blur-md`}>
              <tr>
                {headerCell('label', level === 'customer' ? 'Customer' : label, 'left')}
                {level === 'brick' && plainHeader('Territory')}
                {level === 'customer' && (
                  <>
                    {plainHeader('Brick (CY)')}
                    {plainHeader('SubType')}
                  </>
                )}
                {headerCell('py', `PY (${period.pyLabel})`)}
                {headerCell('cy', `CY (${period.cyLabel})`)}
                {headerCell('delta', 'YoY Growth')}
                {headerCell('growth', 'YoY Growth %')}
                {headerCell('contrib', 'Contrib. %')}
                {effectiveShowReturns && headerCell('returns', 'Returns %')}
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-100/70 dark:divide-slate-800/70">
              {flat.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                    No rows match the current filters.
                  </td>
                </tr>
              )}
              {padTop > 0 && (
                <tr>
                  <td style={{ height: padTop }} colSpan={colCount} />
                </tr>
              )}
              {vItems.map((v) => {
                const fr = flat[v.index];
                if (fr.kind === 'status') {
                  return (
                    <LevelTableRow
                      key={fr.key}
                      fr={fr}
                      rowIndex={v.index + 1}
                      level={level}
                      metric={metric}
                      colCount={colCount}
                      maxMag={maxMag}
                      totalPy={totalPy}
                      showReturns={effectiveShowReturns}
                      portfolioReturnsRatePct={portfolioReturnsRatePct}
                      itemsOpen={false}
                      chainsOpen={false}
                      onToggle={toggle}
                      onFilter={handleFilter}
                    />
                  );
                }

                const isItem = fr.kind === 'item';
                const itemsOpen = !isItem && expanded.has(fr.row.id);
                const chainsOpen =
                  fr.kind === 'row' && Boolean(fr.row.children?.length) && expanded.has(fr.row.id + CHAINS_SUFFIX);

                return (
                  <LevelTableRow
                    key={fr.key}
                    fr={fr}
                    rowIndex={v.index + 1}
                    level={level}
                    metric={metric}
                    colCount={colCount}
                    maxMag={maxMag}
                    totalPy={totalPy}
                    showReturns={effectiveShowReturns}
                    portfolioReturnsRatePct={portfolioReturnsRatePct}
                    itemsOpen={itemsOpen}
                    chainsOpen={chainsOpen}
                    onToggle={toggle}
                    onFilter={handleFilter}
                  />
                );
              })}
              {padBottom > 0 && (
                <tr>
                  <td style={{ height: padBottom }} colSpan={colCount} />
                </tr>
              )}
            </tbody>
            <tfoot className="sticky bottom-0 z-20 border-t-2 border-indigo-400/50 bg-gradient-to-r from-indigo-950 via-violet-950 to-slate-900 font-bold text-white shadow-inner backdrop-blur-md">
              <tr>
                <td className="px-3 py-2.5 text-indigo-100" colSpan={1 + extraCols}>
                  Total ({rowList.length.toLocaleString('en-US')} {label.toLowerCase()}s)
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-violet-200">{fmtMetric(total.py, metric, false)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-cyan-300">{fmtMetric(total.cy, metric, false)}</td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${
                    totalUp ? 'text-emerald-400' : totalDown ? 'text-rose-400' : 'text-slate-200'
                  }`}
                >
                  {fmtSigned(total.delta, metric, false)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-extrabold ${
                      totalUp
                        ? 'bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-400/40'
                        : totalDown
                          ? 'bg-rose-500/25 text-rose-300 ring-1 ring-rose-400/40'
                          : 'bg-white/10 text-white'
                    }`}
                  >
                    {totalUp ? '▲ ' : totalDown ? '▼ ' : ''}
                    {fmtGrowth(total.growth)}
                  </span>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <div className="flex flex-col items-end">
                    <span
                      className={`text-xs font-extrabold ${
                        totalUp ? 'text-emerald-300' : totalDown ? 'text-rose-300' : 'text-slate-200'
                      }`}
                    >
                      {fmtPp(totalContribPp)}
                    </span>
                    <span className="text-[10px] font-medium text-indigo-200/80">
                      {isPartialLevel ? 'of portfolio YoY %' : '= portfolio YoY %'}
                    </span>
                  </div>
                </td>
                {effectiveShowReturns && (
                  <td className="px-3 py-2.5 text-right tabular-nums text-rose-200">
                    {totalReturnsPct !== null ? fmtPct(totalReturnsPct / 100) : '–'}
                  </td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
};
