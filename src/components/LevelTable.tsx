import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Filter,
  Loader2,
  Network,
  Package,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { DrillChip, GroupRow, ItemTarget, LEVEL_LABEL, Level } from '../lib/aggregate';
import { fmtGrowth, fmtMetric, fmtSigned } from '../lib/format';
import { DerivedRow, Metric, deriveRow } from '../lib/metrics';
import { StatusFilter, useDashboardStore } from '../store/useDashboardStore';

type SortId = 'label' | 'py' | 'cy' | 'delta' | 'growth';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All rows' },
  { value: 'growing', label: 'Growing' },
  { value: 'declining', label: 'Declining' },
  { value: 'new', label: 'New' },
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

function sortValue(r: { row: GroupRow; d: DerivedRow }, id: SortId): number | string {
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
  }
}

function sortList<T extends { row: GroupRow; d: DerivedRow }>(list: T[], id: SortId, desc: boolean): T[] {
  const dir = desc ? -1 : 1;
  return [...list].sort((a, b) => {
    const va = sortValue(a, id);
    const vb = sortValue(b, id);
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
  const tone = isUp ? 'text-up dark:text-up-light' : isDown ? 'text-down dark:text-down-light' : 'text-slate-500';
  const barWidth = Math.min(100, Math.round((Math.abs(d.delta) / maxMag) * 100));

  return (
    <tr
      aria-rowindex={rowIndex}
      onClick={isItem ? undefined : () => onToggle(r.id, fr.target)}
      className={`group transition-colors ${isItem ? '' : 'cursor-pointer'} ${
        depth === 0
          ? 'hover:bg-sky-500/10'
          : isItem
            ? 'bg-indigo-50/40 hover:bg-indigo-500/10 dark:bg-indigo-950/20'
            : 'bg-slate-50/70 hover:bg-sky-500/10 dark:bg-slate-900/40'
      }`}
    >
      {/* Label */}
      <td className="px-3 py-1.5 align-middle">
        <div className="flex items-center justify-between gap-2" style={{ paddingLeft: depth * 22 }}>
          <div
            className={`flex min-w-0 items-center gap-1.5 ${
              depth === 0 ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'
            }`}
          >
            {isItem ? (
              <Package className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
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
                className="rounded-md p-0.5 text-slate-500 hover:text-sky-600 dark:text-slate-400 dark:hover:text-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {itemsOpen ? <ChevronDown className="h-4 w-4 text-sky-500" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            )}
            <span className="truncate" dir="auto" title={r.label}>
              {r.label}
            </span>
            {isItem && r.brand && (
              <span className="shrink-0 truncate text-[10px] text-slate-400 dark:text-slate-500" dir="auto">
                {r.brand}
              </span>
            )}
            {kind === 'chain' && (
              <span className="shrink-0 rounded bg-slate-200/70 px-1 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
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
                className={`ml-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                  chainsOpen
                    ? 'bg-sky-600 text-white'
                    : 'bg-slate-200/80 text-slate-600 hover:bg-sky-500/20 dark:bg-slate-800 dark:text-slate-300'
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
              className="rounded-md p-1 text-slate-400 opacity-0 transition-opacity hover:bg-sky-500/15 hover:text-sky-600 focus:opacity-100 group-hover:opacity-100 dark:hover:text-sky-300"
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
          <td className="px-3 py-1.5 font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {depth === 0 ? r.customerId : ''}
          </td>
          <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300" dir="auto">
            {depth === 0 && (
              <div className="flex items-center truncate">
                <span className="truncate">{r.brick}</span>
                <OthersBadge others={r.brickOthers} fieldName="Brick" />
              </div>
            )}
          </td>
          <td className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300" dir="auto">
            {depth === 0 && (
              <div className="flex items-center truncate">
                <span className="truncate">{r.subType}</span>
                <OthersBadge others={r.subTypeOthers} fieldName="SubType" />
              </div>
            )}
          </td>
        </>
      )}

      <td className="px-3 py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-300">{fmtMetric(d.py, metric, false)}</td>
      <td className="px-3 py-1.5 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">
        {fmtMetric(d.cy, metric, false)}
      </td>
      <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${tone}`}>{fmtSigned(d.delta, metric, false)}</td>
      <td className="px-3 py-1.5">
        <div className="flex flex-col items-end gap-1">
          {d.growth.kind === 'new' ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold text-sky-700 dark:text-sky-300">
              <Sparkles className="h-3 w-3" />
              New
            </span>
          ) : (
            <span className={`text-xs font-bold tabular-nums ${tone}`}>
              {isUp ? '▲' : isDown ? '▼' : ''}
              {fmtGrowth(d.growth)}
            </span>
          )}
          <div className="h-1 w-20 overflow-hidden rounded-full bg-slate-200/70 dark:bg-slate-800">
            <div
              style={{ width: `${barWidth}%` }}
              className={`h-full rounded-full ${isUp ? 'bg-up' : isDown ? 'bg-down' : 'bg-slate-400'}`}
            />
          </div>
        </div>
      </td>
    </tr>
  );
});

interface LevelTableProps {
  level: Level;
}

export const LevelTable: React.FC<LevelTableProps> = ({ level }) => {
  const [, startTransition] = useTransition();

  const { rows, period, totals, metric, itemsByRow, fetchItems, addDrillRow } = useDashboardStore(
    useShallow((s) => ({
      rows: s.result?.levels[level],
      period: s.result?.period,
      totals: s.result?.totals,
      metric: s.metric,
      itemsByRow: s.itemsByRow,
      fetchItems: s.fetchItems,
      addDrillRow: s.addDrillRow,
    }))
  );

  const [sort, setSort] = useState<{ id: SortId; desc: boolean }>({ id: 'delta', desc: true });
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [topN, setTopN] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState(false);
  const targets = useRef(new Map<string, ItemTarget>());

  const rowList = rows ?? [];

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
    if (status !== 'all') list = list.filter((x) => x.d.status === status);
    if (q) {
      list = list.filter(({ row: r }) =>
        [r.label, r.customerId, r.brick, r.territory, r.subType, ...(r.children?.map((c) => c.label) ?? [])].some(
          (s) => s && s.toLowerCase().includes(q),
        ),
      );
    }
    if (topN) {
      const byDelta = sortList(list, 'delta', true);
      list = topN > 0 ? byDelta.slice(0, topN) : byDelta.slice(topN).reverse();
    }
    return sortList(list, sort.id, sort.desc);
  }, [rowList, metric, status, deferredSearch, topN, sort]);

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
        );
        for (const ch of chains) {
          const ct: ItemTarget = { level: 'subtype', value: r.value, chain: ch.row.value };
          out.push({ kind: 'chain', key: ch.row.id, row: ch.row, d: ch.d, depth: 1, target: ct });
          if (expanded.has(ch.row.id)) pushItems(ch.row.id, 2);
        }
      }
    }
    return out;
  }, [topRows, expanded, itemsByRow, metric, sort, level, fetchItems]);

  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: collapsed ? 0 : flat.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 42,
    overscan: 12,
  });

  if (!rows || !period || !totals) return null;

  const extraCols = level === 'customer' ? 3 : level === 'brick' ? 1 : 0;
  const colCount = 5 + extraCols;
  const total = deriveRow(totals, metric);
  const label = LEVEL_LABEL[level];

  const headerCell = (id: SortId, text: string, align: 'left' | 'right' = 'right') => {
    const isSorted = sort.id === id;
    const sortState = isSorted ? (sort.desc ? 'descending' : 'ascending') : 'none';
    return (
      <th
        aria-sort={sortState}
        className={`border-b border-slate-200/80 dark:border-slate-800 px-3 py-2 font-bold uppercase tracking-wider text-[11px] text-slate-600 dark:text-slate-300 select-none ${
          align === 'right' ? 'text-right' : 'text-left'
        }`}
      >
        <button
          type="button"
          onClick={() => setSort((s) => ({ id, desc: s.id === id ? !s.desc : id !== 'label' }))}
          className={`inline-flex items-center gap-1 hover:text-sky-600 dark:hover:text-sky-400 focus:outline-none ${
            align === 'right' ? 'ml-auto' : ''
          }`}
        >
          {text}
          {sort.id === id ? (
            sort.desc ? (
              <ArrowDown className="h-3.5 w-3.5 text-sky-500" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5 text-sky-500" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-35" />
          )}
        </button>
      </th>
    );
  };

  const plainHeader = (text: string) => (
    <th className="border-b border-slate-200/80 dark:border-slate-800 px-3 py-2 text-left font-bold uppercase tracking-wider text-[11px] text-slate-600 dark:text-slate-300">
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
      className="glass-panel flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 dark:border-slate-800/80 scroll-mt-28"
    >
      {/* Table toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 px-3.5 py-2 dark:border-slate-800/80">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            title={collapsed ? 'Show table' : 'Hide table'}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">{label} Level</h2>
          <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">
            {topRows.length.toLocaleString('en-US')} of {rowList.length.toLocaleString('en-US')} · click a row to drill down by items
            {level === 'subtype' && ' · use “chains” for the chain breakdown'}
          </span>
        </div>

        {!collapsed && (
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={level === 'customer' ? 'Search name, ID, brick…' : `Search ${label.toLowerCase()}…`}
                aria-label={`Search ${label}`}
                className="w-48 rounded-xl border border-slate-200/80 bg-white/70 py-1 pl-8 pr-7 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100"
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
              className="rounded-xl border border-slate-200/80 bg-white/70 px-2 py-1 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-200"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-white dark:bg-slate-900">
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={topN === null ? '' : String(topN)}
              onChange={(e) => setTopN(e.target.value === '' ? null : Number(e.target.value))}
              aria-label={`${label} top or bottom N`}
              className="rounded-xl border border-slate-200/80 bg-white/70 px-2 py-1 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-200"
            >
              {TOP_N_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-white dark:bg-slate-900">
                  {o.label}
                </option>
              ))}
            </select>
            {expanded.size > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(new Set())}
                className="rounded-xl px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Collapse all
              </button>
            )}
          </div>
        )}
      </div>

      {!collapsed && (
        <div ref={parentRef} className="max-h-[440px] overflow-auto">
          <table
            aria-rowcount={flat.length}
            className="w-full border-collapse text-left text-xs"
          >
            <thead className="sticky top-0 z-20 bg-slate-100/95 shadow-sm backdrop-blur-md dark:bg-slate-900/95">
              <tr>
                {headerCell('label', level === 'customer' ? 'Customer' : label, 'left')}
                {level === 'brick' && plainHeader('Territory')}
                {level === 'customer' && (
                  <>
                    {plainHeader('Customer ID')}
                    {plainHeader('Brick (CY)')}
                    {plainHeader('SubType')}
                  </>
                )}
                {headerCell('py', `PY (${period.pyLabel})`)}
                {headerCell('cy', `CY (${period.cyLabel})`)}
                {headerCell('delta', 'YoY Growth')}
                {headerCell('growth', 'YoY Growth %')}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/60">
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
            <tfoot className="sticky bottom-0 z-20 border-t-2 border-slate-300 bg-slate-100/95 font-bold text-slate-900 shadow-inner backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95 dark:text-white">
              <tr>
                <td className="px-3 py-2" colSpan={1 + extraCols}>
                  Total ({rowList.length.toLocaleString('en-US')} {label.toLowerCase()}s)
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMetric(total.py, metric, false)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMetric(total.cy, metric, false)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtSigned(total.delta, metric, false)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtGrowth(total.growth)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
};
