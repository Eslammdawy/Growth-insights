import React, { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileSpreadsheet,
  Filter,
  Package,
  RotateCcw,
  Sparkles,
  Table2,
  UserMinus,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useShallow } from 'zustand/react/shallow';
import { PARETO_TOP_N, PRODUCT_EXPOSURE_DEFAULT_LIMIT } from '../lib/config';
import { exportProductExposureToExcel } from '../lib/exportExcel';
import { fmtCompact, fmtGrowth, fmtMetric, fmtPp, fmtSigned } from '../lib/format';
import { ProductExposureView } from '../lib/hashState';
import {
  CUSTOMER_SEGMENTS,
  CUSTOMER_SEGMENT_LABEL,
  CustomerSegment,
  METRIC_LABEL,
  Metric,
  PRODUCT_EXPOSURE_LEVELS,
  PRODUCT_EXPOSURE_LEVEL_LABEL,
  ProductBehaviorWaterfallStep,
  ProductExposureLevel,
  ProductSegmentBreakdown,
  buildProductBehaviorWaterfall,
  deriveRow,
  isZero,
  metricPair,
} from '../lib/metrics';
import { SHARED_PALETTE } from '../lib/palette';
import { useDashboardStore } from '../store/useDashboardStore';
import { KpiInfoTooltip } from './KpiInfoTooltip';

type SortColumn =
  | 'label'
  | 'py'
  | 'cy'
  | 'delta'
  | 'absDelta'
  | 'growth'
  | 'newPp'
  | 'expansionPp'
  | 'stablePp'
  | 'contractionPp'
  | 'churnPp';

const VIEW_LABELS: Record<ProductExposureView, string> = {
  all: 'All Products',
  churn: `Top ${PARETO_TOP_N} Churn-Exposed`,
  new: `Top ${PARETO_TOP_N} New-Customer-Driven`,
};

function segDeltaOf(row: ProductSegmentBreakdown, seg: CustomerSegment, metric: Metric): number {
  const { py, cy } = metricPair(row.segments[seg], metric);
  return cy - py;
}

function segmentBarFill(seg: CustomerSegment, isDark: boolean): string {
  switch (seg) {
    case 'new':
      return isDark ? SHARED_PALETTE.upLight : SHARED_PALETTE.upVivid;
    case 'growing':
      return isDark ? SHARED_PALETTE.upVivid : SHARED_PALETTE.up;
    case 'stable':
      return SHARED_PALETTE.flat;
    case 'declining':
      return isDark ? SHARED_PALETTE.downLight : SHARED_PALETTE.downVivid;
    case 'lost':
      return isDark ? SHARED_PALETTE.downVivid : SHARED_PALETTE.down;
  }
}

export const ProductCustomerExposure: React.FC = () => {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(true);
  const [showTableMode, setShowTableMode] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [sortBy, setSortBy] = useState<SortColumn>('absDelta');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const {
    result,
    metric,
    theme,
    productExposureLevel,
    setProductExposureLevel,
    productExposureView,
    setProductExposureView,
    customerStatusFilter,
    brands,
    setBrands,
    line,
    setLine,
    drill,
    addDrillRow,
    resetFilters,
    analyzing,
  } = useDashboardStore(
    useShallow((s) => ({
      result: s.result,
      metric: s.metric,
      theme: s.theme,
      productExposureLevel: s.productExposureLevel,
      setProductExposureLevel: s.setProductExposureLevel,
      productExposureView: s.productExposureView,
      setProductExposureView: s.setProductExposureView,
      customerStatusFilter: s.customerStatusFilter,
      brands: s.brands,
      setBrands: s.setBrands,
      line: s.line,
      setLine: s.setLine,
      drill: s.drill,
      addDrillRow: s.addDrillRow,
      resetFilters: s.resetFilters,
      analyzing: s.analyzing,
    })),
  );

  // Reset ephemeral pagination and expansion when level or view changes
  useEffect(() => {
    setShowAll(false);
    setExpandedIds(new Set());
  }, [productExposureLevel, productExposureView]);

  const rawRows: ProductSegmentBreakdown[] = useMemo(
    () => result?.productExposure.byMetric[metric].byLevel[productExposureLevel] ?? [],
    [result, metric, productExposureLevel],
  );

  const toggleSort = useCallback(
    (col: SortColumn) => {
      if (sortBy === col) {
        setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
      } else {
        setSortBy(col);
        setSortDir(col === 'label' ? 'asc' : 'desc');
      }
    },
    [sortBy],
  );

  const handleViewChange = useCallback(
    (nextView: ProductExposureView) => {
      setProductExposureView(nextView);
      if (nextView === 'all') {
        setSortBy('absDelta');
        setSortDir('desc');
      }
    },
    [setProductExposureView],
  );

  /** Full ranked list for the current level + view chip (used for both display slicing and Excel export). */
  const rankedRows = useMemo(() => {
    const list = [...rawRows];
    if (productExposureView === 'churn') {
      return list
        .filter((r) => {
          const d = segDeltaOf(r, 'lost', metric);
          return d < 0 && !isZero(d);
        })
        .sort((a, b) => segDeltaOf(a, 'lost', metric) - segDeltaOf(b, 'lost', metric))
        .slice(0, PARETO_TOP_N);
    }
    if (productExposureView === 'new') {
      return list
        .filter((r) => {
          const d = segDeltaOf(r, 'new', metric);
          return d > 0 && !isZero(d);
        })
        .sort((a, b) => segDeltaOf(b, 'new', metric) - segDeltaOf(a, 'new', metric))
        .slice(0, PARETO_TOP_N);
    }

    const mult = sortDir === 'desc' ? -1 : 1;
    const valOf = (r: ProductSegmentBreakdown): number => {
      const d = deriveRow(r.totals, metric);
      switch (sortBy) {
        case 'py':
          return d.py;
        case 'cy':
          return d.cy;
        case 'delta':
          return d.delta;
        case 'absDelta':
          return Math.abs(d.delta);
        case 'growth':
          return Number.isNaN(d.growthNum) ? -Infinity : d.growthNum;
        case 'newPp':
          return r.newAcquisitionPp ?? (d.growth.kind === 'new' ? Infinity : -Infinity);
        case 'expansionPp':
          return r.expansionPp ?? -Infinity;
        case 'stablePp':
          return r.stablePp ?? -Infinity;
        case 'contractionPp':
          return r.contractionExposurePp ?? Infinity;
        case 'churnPp':
          return r.churnExposurePp ?? Infinity;
        default:
          return 0;
      }
    };

    return list.sort((a, b) => {
      if (sortBy === 'label') {
        return mult * a.itemLabel.localeCompare(b.itemLabel);
      }
      const va = valOf(a);
      const vb = valOf(b);
      if (va === vb) return a.itemLabel.localeCompare(b.itemLabel);
      return mult * (va - vb);
    });
  }, [rawRows, productExposureView, metric, sortBy, sortDir]);

  const visibleRows = useMemo(() => {
    if (productExposureView !== 'all' || showAll) return rankedRows;
    return rankedRows.slice(0, PRODUCT_EXPOSURE_DEFAULT_LIMIT);
  }, [rankedRows, productExposureView, showAll]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleDrillProduct = useCallback(
    (row: ProductSegmentBreakdown) => {
      startTransition(() => {
        if (row.level === 'item') {
          const rawVal = row.itemId.replace(/^Item:/, '');
          addDrillRow([{ field: 'Item', value: rawVal, label: row.itemLabel }]);
        } else if (row.level === 'brand') {
          const bVal = row.brand ?? row.itemLabel;
          if (!brands.includes(bVal)) {
            setBrands([...brands, bVal]);
          }
        } else if (row.level === 'line') {
          const lVal = row.line ?? row.itemLabel;
          setLine(lVal);
        }
      });
      const el = document.getElementById('table-customer');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [addDrillRow, brands, setBrands, setLine],
  );

  const handleExport = useCallback(() => {
    if (!result || rankedRows.length === 0) return;
    exportProductExposureToExcel({
      rows: rankedRows,
      level: productExposureLevel,
      viewLabel: productExposureView === 'all' ? undefined : VIEW_LABELS[productExposureView],
      period: result.period,
      metric,
    });
  }, [result, rankedRows, productExposureLevel, productExposureView, metric]);

  if (!result) return null;

  const isDark = theme === 'dark';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.25)';
  const axisColor = isDark ? '#cbd5e1' : '#334155';
  const totalNeutralColor = isDark ? '#6366f1' : '#4f46e5';

  const levelLabel = PRODUCT_EXPOSURE_LEVEL_LABEL[productExposureLevel];
  const hasAnyFilter = Boolean(line) || brands.length > 0 || drill.length > 0;
  const activeSegFilter: CustomerSegment | null =
    customerStatusFilter !== 'all' ? (customerStatusFilter as CustomerSegment) : null;

  // Compute summary stats for sr-only narrative
  const topChurnRow = rawRows
    .filter((r) => segDeltaOf(r, 'lost', metric) < 0)
    .sort((a, b) => segDeltaOf(a, 'lost', metric) - segDeltaOf(b, 'lost', metric))[0];
  const topNewRow = rawRows
    .filter((r) => segDeltaOf(r, 'new', metric) > 0)
    .sort((a, b) => segDeltaOf(b, 'new', metric) - segDeltaOf(a, 'new', metric))[0];

  const renderSortIcon = (col: SortColumn) => {
    if (productExposureView !== 'all') return null;
    if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'desc' ? (
      <ArrowDown className="h-3 w-3 text-fuchsia-600 dark:text-fuchsia-300" />
    ) : (
      <ArrowUp className="h-3 w-3 text-fuchsia-600 dark:text-fuchsia-300" />
    );
  };

  const ariaSortFor = (col: SortColumn): 'ascending' | 'descending' | 'none' | undefined => {
    if (productExposureView !== 'all') return undefined;
    if (sortBy !== col) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  const renderPpCell = (
    pp: number | null,
    isNewProduct: boolean,
    seg: CustomerSegment,
  ) => {
    const isHighlighted = activeSegFilter === seg;
    const highlightCls = isHighlighted
      ? 'bg-fuchsia-500/15 ring-1 ring-inset ring-fuchsia-500/40 dark:bg-fuchsia-500/25'
      : '';
    if (pp === null) {
      return (
        <td className={`px-2 py-2 text-right font-semibold ${highlightCls}`}>
          {isNewProduct ? (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-500/25 dark:text-amber-300">
              New
            </span>
          ) : (
            <span className="text-slate-400">–</span>
          )}
        </td>
      );
    }
    const isPos = pp > 0 && !isZero(pp);
    const isNeg = pp < 0 && !isZero(pp);
    return (
      <td
        className={`px-2 py-2 text-right font-bold ${highlightCls} ${
          isPos
            ? 'text-up dark:text-up-light'
            : isNeg
              ? 'text-down dark:text-down-light'
              : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {fmtPp(pp)}
      </td>
    );
  };

  const totalColSpan = showTableMode ? 10 : 11;

  return (
    <div
      aria-label="Product Customer Exposure Matrix"
      className={`glass-panel relative flex flex-col rounded-2xl border border-fuchsia-200/70 dark:border-slate-800/80 transition-opacity duration-200 ${
        analyzing ? 'pointer-events-none opacity-60' : 'opacity-100'
      }`}
    >
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-fuchsia-200/60 bg-gradient-to-r from-fuchsia-50/80 via-indigo-50/40 to-white/90 px-3.5 py-2.5 dark:border-slate-800/80 dark:from-fuchsia-950/40 dark:via-slate-900/90 dark:to-slate-900/90">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="product-exposure-body"
            title={open ? 'Collapse Product Exposure Matrix' : 'Expand Product Exposure Matrix'}
            className="rounded-lg p-1 text-fuchsia-600 hover:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:hover:bg-slate-800"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-white shadow-sm">
            <Package className="h-3.5 w-3.5" />
            Product × Customer-Segment Exposure
          </span>
          <span className="hidden text-xs font-medium text-slate-600 dark:text-slate-300 lg:inline">
            How customer lifecycle cohorts &amp; retention behavior drive each {levelLabel.toLowerCase()}&apos;s YoY Δ
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Level Selector: Item / Brand / Line */}
          <div
            role="group"
            aria-label="Product exposure level"
            className="inline-flex rounded-xl border border-fuchsia-200/70 bg-fuchsia-50/80 p-0.5 text-xs dark:border-slate-700/80 dark:bg-slate-800/90"
          >
            {PRODUCT_EXPOSURE_LEVELS.map((lvl: ProductExposureLevel) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setProductExposureLevel(lvl)}
                aria-pressed={productExposureLevel === lvl}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  productExposureLevel === lvl
                    ? 'bg-gradient-to-r from-fuchsia-600 to-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-fuchsia-700 dark:text-slate-300 dark:hover:text-fuchsia-200'
                }`}
              >
                {PRODUCT_EXPOSURE_LEVEL_LABEL[lvl]}
              </button>
            ))}
          </div>

          {/* Chart / Table Toggle */}
          {open && (
            <button
              type="button"
              onClick={() => setShowTableMode((v) => !v)}
              aria-pressed={showTableMode}
              aria-label={
                showTableMode
                  ? 'Show stacked segment bars and mini-waterfall charts'
                  : 'Show numeric table mode without bars or charts'
              }
              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-all focus:outline-none focus:ring-2 focus:ring-fuchsia-500 ${
                showTableMode
                  ? 'border-fuchsia-600 bg-fuchsia-600 text-white shadow-sm'
                  : 'border-fuchsia-200/80 bg-white/80 text-slate-700 hover:bg-fuchsia-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
              }`}
            >
              {showTableMode ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
              <span>{showTableMode ? 'Chart' : 'Table'}</span>
            </button>
          )}

          {/* Export to Excel */}
          <button
            type="button"
            onClick={handleExport}
            disabled={rankedRows.length === 0}
            title={`Export ${levelLabel} Exposure Matrix to Excel`}
            className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-300"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Export Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-xl bg-fuchsia-500/10 px-2.5 py-1 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-500/20 dark:text-fuchsia-300"
          >
            {open ? 'Hide matrix' : 'Show matrix'}
          </button>
        </div>
      </div>

      {/* Screen-reader summary */}
      <p className="sr-only">
        Product Customer Exposure Matrix at {levelLabel} level for {METRIC_LABEL[metric]} ({ rawRows.length }{' '}
        {levelLabel.toLowerCase()}s).
        {topChurnRow
          ? ` Most churn-exposed ${levelLabel.toLowerCase()}: ${topChurnRow.itemLabel} with Lost customer Δ ${fmtSigned(
              segDeltaOf(topChurnRow, 'lost', metric),
              metric,
            )}.`
          : ''}
        {topNewRow
          ? ` Top new-customer-driven ${levelLabel.toLowerCase()}: ${topNewRow.itemLabel} with New customer Δ ${fmtSigned(
              segDeltaOf(topNewRow, 'new', metric),
              metric,
            )}.`
          : ''}
      </p>

      {open && (
        <div id="product-exposure-body" className="space-y-3 p-3.5">
          {/* Quick-Toggle Chips & Legend Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Product exposure quick filter"
              className="flex flex-wrap items-center gap-1.5"
            >
              <button
                type="button"
                onClick={() => handleViewChange('all')}
                aria-pressed={productExposureView === 'all'}
                className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-bold transition-all ${
                  productExposureView === 'all'
                    ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                    : 'border-indigo-200/80 bg-white/80 text-slate-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
                }`}
              >
                All ({rawRows.length})
              </button>
              <button
                type="button"
                onClick={() => handleViewChange(productExposureView === 'churn' ? 'all' : 'churn')}
                aria-pressed={productExposureView === 'churn'}
                className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-bold transition-all ${
                  productExposureView === 'churn'
                    ? 'border-rose-600 bg-rose-600 text-white shadow-sm'
                    : 'border-rose-500/35 bg-rose-500/10 text-rose-800 hover:bg-rose-500/20 dark:text-rose-200'
                }`}
              >
                <UserMinus className="h-3.5 w-3.5" />
                Top {PARETO_TOP_N} churn-exposed
              </button>
              <button
                type="button"
                onClick={() => handleViewChange(productExposureView === 'new' ? 'all' : 'new')}
                aria-pressed={productExposureView === 'new'}
                className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-bold transition-all ${
                  productExposureView === 'new'
                    ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                    : 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/20 dark:text-emerald-200'
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Top {PARETO_TOP_N} new-customer-driven
              </button>
            </div>

            {!showTableMode && (
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-500 dark:text-slate-400">Segment Δ bars:</span>
                {CUSTOMER_SEGMENTS.map((seg) => {
                  const isActive = activeSegFilter === seg;
                  return (
                    <span
                      key={seg}
                      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 ${
                        isActive
                          ? 'bg-fuchsia-500/20 font-bold text-fuchsia-900 ring-1 ring-fuchsia-500/40 dark:text-fuchsia-200'
                          : ''
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: segmentBarFill(seg, isDark) }}
                      />
                      <span>{CUSTOMER_SEGMENT_LABEL[seg]}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          {rankedRows.length === 0 ? (
            <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-slate-200/70 p-6 text-center dark:border-slate-800/80">
              <Package className="h-7 w-7 text-slate-400 dark:text-slate-500" />
              <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                No {levelLabel.toLowerCase()} exposure rows match the current view or filters.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {productExposureView !== 'all' && (
                  <button
                    type="button"
                    onClick={() => handleViewChange('all')}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-fuchsia-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-fuchsia-500"
                  >
                    Show all {levelLabel.toLowerCase()}s
                  </button>
                )}
                {hasAnyFilter && (
                  <button
                    type="button"
                    onClick={() => startTransition(() => resetFilters())}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset filters
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-indigo-100/80 bg-white/60 dark:border-slate-800 dark:bg-slate-900/40">
                <table className="w-full border-collapse text-left text-xs tabular-nums">
                  <thead className="bg-indigo-50/70 text-[10px] font-extrabold uppercase tracking-wider text-slate-700 dark:bg-slate-900/80 dark:text-slate-200">
                    <tr>
                      <th
                        aria-sort={ariaSortFor('label')}
                        className="relative border-b border-indigo-100/80 px-3 py-2.5 dark:border-slate-800"
                      >
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggleSort('label')}
                            className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-fuchsia-700 dark:hover:text-fuchsia-300"
                          >
                            <span>{levelLabel}</span>
                            {renderSortIcon('label')}
                          </button>
                          <KpiInfoTooltip
                            id="exp-tip-product"
                            title={`${levelLabel} Row`}
                            meaning={`Click any row or chevron to expand its 5-step Customer-Behavior Decomposition waterfall. Click the filter icon to filter the dashboard by that ${levelLabel.toLowerCase()} and jump to the Customer table.`}
                            formula="Item → Brand → Line hierarchy uses each item's latest CY period allocation."
                            alignClass="left-0"
                          />
                        </div>
                      </th>

                      <th
                        aria-sort={ariaSortFor('py')}
                        className="relative border-b border-indigo-100/80 px-2.5 py-2.5 text-right dark:border-slate-800"
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => toggleSort('py')}
                            className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-fuchsia-700 dark:hover:text-fuchsia-300"
                          >
                            <span>PY ({result.period.pyLabel})</span>
                            {renderSortIcon('py')}
                          </button>
                          <KpiInfoTooltip
                            id="exp-tip-py"
                            title="Prior Year (PY)"
                            meaning={`Total ${METRIC_LABEL[metric].toLowerCase()} for this ${levelLabel.toLowerCase()} in the prior period (${result.period.pyLabel}).`}
                            formula="PY = Σ Segment PY across all 5 customer lifecycle segments"
                            alignClass="right-0"
                          />
                        </div>
                      </th>

                      <th
                        aria-sort={ariaSortFor('cy')}
                        className="relative border-b border-indigo-100/80 px-2.5 py-2.5 text-right dark:border-slate-800"
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => toggleSort('cy')}
                            className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-fuchsia-700 dark:hover:text-fuchsia-300"
                          >
                            <span>CY ({result.period.cyLabel})</span>
                            {renderSortIcon('cy')}
                          </button>
                          <KpiInfoTooltip
                            id="exp-tip-cy"
                            title="Current Year (CY)"
                            meaning={`Total ${METRIC_LABEL[metric].toLowerCase()} for this ${levelLabel.toLowerCase()} in the current period (${result.period.cyLabel}).`}
                            formula="CY = Σ Segment CY across all 5 customer lifecycle segments"
                            alignClass="right-0"
                          />
                        </div>
                      </th>

                      <th
                        aria-sort={ariaSortFor('delta')}
                        className="relative border-b border-indigo-100/80 px-2.5 py-2.5 text-right dark:border-slate-800"
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => toggleSort('delta')}
                            className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-fuchsia-700 dark:hover:text-fuchsia-300"
                          >
                            <span>YoY Δ</span>
                            {renderSortIcon('delta')}
                          </button>
                          <KpiInfoTooltip
                            id="exp-tip-delta"
                            title="Product YoY Δ"
                            meaning="Net year-over-year change for this product. Reconciles strictly to both the 5 customer lifecycle segment deltas and the 4 customer-behavior effects."
                            formula="YoY Δ = CY − PY = Σ Segment Δ = New + Expansion + Contraction + Lost"
                            alignClass="right-0"
                          />
                        </div>
                      </th>

                      <th
                        aria-sort={ariaSortFor('growth')}
                        className="relative border-b border-indigo-100/80 px-2.5 py-2.5 text-right dark:border-slate-800"
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => toggleSort('growth')}
                            className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-fuchsia-700 dark:hover:text-fuchsia-300"
                          >
                            <span>YoY %</span>
                            {renderSortIcon('growth')}
                          </button>
                          <KpiInfoTooltip
                            id="exp-tip-yoy"
                            title="Product YoY %"
                            meaning="Percentage growth of this product relative to its own Prior Year base. Equals the sum of the 5 signed segment pp columns."
                            formula="YoY % = (CY − PY) ÷ |PY| × 100 = New pp + Expansion pp + Stable pp + Contraction pp + Churn pp"
                            alignClass="right-0"
                          />
                        </div>
                      </th>

                      <th
                        aria-sort={ariaSortFor('churnPp')}
                        className={`relative border-b border-indigo-100/80 px-2 py-2.5 text-right dark:border-slate-800 ${
                          activeSegFilter === 'lost' ? 'bg-fuchsia-500/15 dark:bg-fuchsia-500/25' : ''
                        }`}
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => toggleSort('churnPp')}
                            className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-fuchsia-700 dark:hover:text-fuchsia-300"
                          >
                            <span>Churn pp</span>
                            {renderSortIcon('churnPp')}
                          </button>
                          <KpiInfoTooltip
                            id="exp-tip-churn-pp"
                            title="Churn Exposure (pp)"
                            meaning="Signed percentage-point impact on this product's YoY % from customers in the Lost (−100%) lifecycle segment."
                            formula="Churn pp = Σ Δ(Lost Customers) ÷ |Product PY| × 100"
                            alignClass="right-0"
                          />
                        </div>
                      </th>

                      <th
                        aria-sort={ariaSortFor('contractionPp')}
                        className={`relative border-b border-indigo-100/80 px-2 py-2.5 text-right dark:border-slate-800 ${
                          activeSegFilter === 'declining' ? 'bg-fuchsia-500/15 dark:bg-fuchsia-500/25' : ''
                        }`}
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => toggleSort('contractionPp')}
                            className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-fuchsia-700 dark:hover:text-fuchsia-300"
                          >
                            <span>Contraction pp</span>
                            {renderSortIcon('contractionPp')}
                          </button>
                          <KpiInfoTooltip
                            id="exp-tip-contraction-pp"
                            title="Contraction Exposure (pp)"
                            meaning="Signed percentage-point impact on this product's YoY % from customers in the Declining (<−5%) lifecycle segment."
                            formula="Contraction pp = Σ Δ(Declining Customers) ÷ |Product PY| × 100"
                            alignClass="right-0"
                          />
                        </div>
                      </th>

                      <th
                        aria-sort={ariaSortFor('stablePp')}
                        className={`relative border-b border-indigo-100/80 px-2 py-2.5 text-right dark:border-slate-800 ${
                          activeSegFilter === 'stable' ? 'bg-fuchsia-500/15 dark:bg-fuchsia-500/25' : ''
                        }`}
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => toggleSort('stablePp')}
                            className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-fuchsia-700 dark:hover:text-fuchsia-300"
                          >
                            <span>Stable pp</span>
                            {renderSortIcon('stablePp')}
                          </button>
                          <KpiInfoTooltip
                            id="exp-tip-stable-pp"
                            title="Stable Segment (pp)"
                            meaning="Signed percentage-point impact on this product's YoY % from customers in the Stable (±5%) lifecycle segment."
                            formula="Stable pp = Σ Δ(Stable Customers) ÷ |Product PY| × 100"
                            alignClass="right-0"
                          />
                        </div>
                      </th>

                      <th
                        aria-sort={ariaSortFor('expansionPp')}
                        className={`relative border-b border-indigo-100/80 px-2 py-2.5 text-right dark:border-slate-800 ${
                          activeSegFilter === 'growing' ? 'bg-fuchsia-500/15 dark:bg-fuchsia-500/25' : ''
                        }`}
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => toggleSort('expansionPp')}
                            className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-fuchsia-700 dark:hover:text-fuchsia-300"
                          >
                            <span>Expansion pp</span>
                            {renderSortIcon('expansionPp')}
                          </button>
                          <KpiInfoTooltip
                            id="exp-tip-expansion-pp"
                            title="Expansion Segment (pp)"
                            meaning="Signed percentage-point impact on this product's YoY % from customers in the Growing (>+5%) lifecycle segment."
                            formula="Expansion pp = Σ Δ(Growing Customers) ÷ |Product PY| × 100"
                            alignClass="right-0"
                          />
                        </div>
                      </th>

                      <th
                        aria-sort={ariaSortFor('newPp')}
                        className={`relative border-b border-indigo-100/80 px-2 py-2.5 text-right dark:border-slate-800 ${
                          activeSegFilter === 'new' ? 'bg-fuchsia-500/15 dark:bg-fuchsia-500/25' : ''
                        }`}
                      >
                        <div className="inline-flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => toggleSort('newPp')}
                            className="inline-flex items-center gap-1 font-extrabold uppercase tracking-wider hover:text-fuchsia-700 dark:hover:text-fuchsia-300"
                          >
                            <span>New pp</span>
                            {renderSortIcon('newPp')}
                          </button>
                          <KpiInfoTooltip
                            id="exp-tip-new-pp"
                            title="New Customer Acquisition (pp)"
                            meaning="Signed percentage-point impact on this product's YoY % from newly acquired customers (PY = 0, CY > 0)."
                            formula="New pp = Σ Δ(New Customers) ÷ |Product PY| × 100"
                            alignClass="right-0"
                          />
                        </div>
                      </th>

                      {!showTableMode && (
                        <th className="relative border-b border-indigo-100/80 px-3 py-2.5 dark:border-slate-800">
                          <div className="inline-flex items-center gap-1">
                            <span>Segment Δ Mix</span>
                            <KpiInfoTooltip
                              id="exp-tip-mix-bar"
                              title="5-Segment YoY Δ Bar"
                              meaning="Proportional horizontal bar showing how the 5 customer lifecycle segments contribute to this product's YoY Δ."
                              formula="Bar widths proportional to |Segment Δ| ÷ Σ |Segment Δ|"
                              alignClass="right-0"
                            />
                          </div>
                        </th>
                      )}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-indigo-100/60 dark:divide-slate-800/70">
                    {visibleRows.map((row) => {
                      const d = deriveRow(row.totals, metric);
                      const isExpanded = expandedIds.has(row.itemId);
                      const isPos = d.delta > 0 && !isZero(d.delta);
                      const isNeg = d.delta < 0 && !isZero(d.delta);
                      const isNewProduct = isZero(d.py) && !isZero(d.cy);

                      const segDeltas = CUSTOMER_SEGMENTS.map((seg) => ({
                        seg,
                        delta: segDeltaOf(row, seg, metric),
                      }));
                      const totalAbsSegDelta = segDeltas.reduce((acc, s) => acc + Math.abs(s.delta), 0);

                      const cb = row.customerBehavior;
                      const wfSteps = isExpanded
                        ? buildProductBehaviorWaterfall(row.totals, cb, metric, result.period)
                        : [];

                      return (
                        <React.Fragment key={row.itemId}>
                          <tr
                            onClick={() => toggleExpand(row.itemId)}
                            className={`cursor-pointer transition-colors ${
                              isExpanded
                                ? 'bg-fuchsia-500/10 dark:bg-fuchsia-500/20'
                                : 'hover:bg-indigo-500/5 dark:hover:bg-indigo-500/10'
                            }`}
                          >
                            <td className="px-3 py-2 font-semibold text-slate-900 dark:text-slate-100">
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleExpand(row.itemId);
                                    }}
                                    aria-expanded={isExpanded}
                                    aria-controls={`cb-waterfall-${row.itemId}`}
                                    aria-label={`${
                                      isExpanded ? 'Collapse' : 'Expand'
                                    } customer-behavior decomposition for ${row.itemLabel}`}
                                    className="rounded p-0.5 text-fuchsia-600 hover:bg-fuchsia-500/15 dark:text-fuchsia-400"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    ) : (
                                      <ChevronRight className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                  <span className="truncate" dir="auto" title={row.itemLabel}>
                                    {row.itemLabel}
                                  </span>
                                  {row.level === 'item' && row.brand && (
                                    <span className="shrink-0 rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
                                      {row.brand}
                                    </span>
                                  )}
                                  {row.level !== 'line' && row.line && (
                                    <span className="hidden shrink-0 rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 xl:inline">
                                      {row.line}
                                    </span>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDrillProduct(row);
                                  }}
                                  title={`Filter dashboard by ${row.itemLabel} and scroll to Customer table`}
                                  aria-label={`Filter dashboard by ${row.itemLabel} and scroll to Customer table`}
                                  className="shrink-0 rounded p-1 text-indigo-500 hover:bg-indigo-500/15 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200"
                                >
                                  <Filter className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>

                            <td className="px-2.5 py-2 text-right text-slate-600 dark:text-slate-300">
                              {fmtMetric(d.py, metric, false)}
                            </td>

                            <td className="px-2.5 py-2 text-right font-bold text-slate-900 dark:text-white">
                              {fmtMetric(d.cy, metric, false)}
                            </td>

                            <td
                              className={`px-2.5 py-2 text-right font-bold ${
                                isPos
                                  ? 'text-up dark:text-up-light'
                                  : isNeg
                                    ? 'text-down dark:text-down-light'
                                    : 'text-slate-500'
                              }`}
                            >
                              {fmtSigned(d.delta, metric, false)}
                            </td>

                            <td
                              className={`px-2.5 py-2 text-right font-bold ${
                                isPos
                                  ? 'text-up dark:text-up-light'
                                  : isNeg
                                    ? 'text-down dark:text-down-light'
                                    : 'text-slate-500'
                              }`}
                            >
                              {fmtGrowth(d.growth)}
                            </td>

                            {renderPpCell(row.churnExposurePp, isNewProduct, 'lost')}
                            {renderPpCell(row.contractionExposurePp, isNewProduct, 'declining')}
                            {renderPpCell(row.stablePp, isNewProduct, 'stable')}
                            {renderPpCell(row.expansionPp, isNewProduct, 'growing')}
                            {renderPpCell(row.newAcquisitionPp, isNewProduct, 'new')}

                            {!showTableMode && (
                              <td className="w-40 min-w-[140px] px-3 py-2">
                                {isZero(totalAbsSegDelta) ? (
                                  <div className="h-2.5 w-full rounded-full bg-slate-200/70 dark:bg-slate-800" />
                                ) : (
                                  <div
                                    className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-200/60 dark:bg-slate-800/80"
                                    title={segDeltas
                                      .map(
                                        (s) =>
                                          `${CUSTOMER_SEGMENT_LABEL[s.seg]}: ${fmtSigned(s.delta, metric, false)}`,
                                      )
                                      .join(' · ')}
                                  >
                                    {segDeltas.map(({ seg, delta }) => {
                                      if (isZero(delta)) return null;
                                      const pct = (Math.abs(delta) / totalAbsSegDelta) * 100;
                                      const dimmed = activeSegFilter !== null && activeSegFilter !== seg;
                                      return (
                                        <div
                                          key={seg}
                                          style={{
                                            width: `${pct}%`,
                                            backgroundColor: segmentBarFill(seg, isDark),
                                            opacity: dimmed ? 0.25 : 1,
                                          }}
                                          className="h-full transition-opacity"
                                        />
                                      );
                                    })}
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>

                          {/* Expanded Enhancement 2: Customer-Behavior Decomposition Mini-Waterfall */}
                          {isExpanded && (
                            <tr
                              id={`cb-waterfall-${row.itemId}`}
                              className="bg-indigo-50/40 dark:bg-slate-900/70"
                            >
                              <td colSpan={totalColSpan} className="p-3">
                                <div className="rounded-xl border border-indigo-200/70 bg-white/90 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/90">
                                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="rounded-md bg-fuchsia-500/15 px-2 py-0.5 text-[11px] font-extrabold text-fuchsia-800 dark:bg-fuchsia-500/25 dark:text-fuchsia-200">
                                        Customer-Behavior Decomposition · {row.itemLabel}
                                      </span>
                                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                        PY ({fmtMetric(d.py, metric)}) → +New ({fmtSigned(cb.newCustomerEffect, metric)}) → +Expansion ({fmtSigned(cb.expansionEffect, metric)}) → −Contraction ({fmtSigned(cb.contractionEffect, metric)}) → −Lost ({fmtSigned(cb.lostCustomerEffect, metric)}) = CY ({fmtMetric(d.cy, metric)})
                                      </span>
                                    </div>
                                  </div>

                                  <p className="sr-only">
                                    Customer-behavior decomposition for {row.itemLabel}: Prior Year{' '}
                                    {fmtMetric(d.py, metric)}, New customer effect{' '}
                                    {fmtSigned(cb.newCustomerEffect, metric)} ({fmtPp(cb.newPp)}), Expansion effect{' '}
                                    {fmtSigned(cb.expansionEffect, metric)} ({fmtPp(cb.expansionPp)}), Contraction effect{' '}
                                    {fmtSigned(cb.contractionEffect, metric)} ({fmtPp(cb.contractionPp)}), Lost customer effect{' '}
                                    {fmtSigned(cb.lostCustomerEffect, metric)} ({fmtPp(cb.lostPp)}), Current Year{' '}
                                    {fmtMetric(d.cy, metric)}.
                                  </p>

                                  {showTableMode ? (
                                    <div className="overflow-x-auto rounded-lg border border-indigo-100/80 dark:border-slate-800">
                                      <table className="w-full border-collapse text-left text-xs tabular-nums">
                                        <thead className="bg-indigo-50/60 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                                          <tr>
                                            <th className="border-b border-indigo-100/80 px-3 py-1.5 dark:border-slate-700">
                                              Bridge Step
                                            </th>
                                            <th className="border-b border-indigo-100/80 px-3 py-1.5 text-right dark:border-slate-700">
                                              Amount ({METRIC_LABEL[metric]})
                                            </th>
                                            <th className="border-b border-indigo-100/80 px-3 py-1.5 text-right dark:border-slate-700">
                                              Impact on Product YoY %
                                            </th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-indigo-100/60 dark:divide-slate-800">
                                          {wfSteps.map((st) => {
                                            const isEndpoint = st.kind === 'py' || st.kind === 'cy';
                                            const stepPos = st.delta > 0 && !isZero(st.delta);
                                            const stepNeg = st.delta < 0 && !isZero(st.delta);
                                            return (
                                              <tr key={st.id} className={isEndpoint ? 'font-bold bg-indigo-50/30 dark:bg-slate-800/40' : ''}>
                                                <td className="px-3 py-1.5 text-slate-800 dark:text-slate-100">
                                                  {st.label}
                                                </td>
                                                <td
                                                  className={`px-3 py-1.5 text-right font-semibold ${
                                                    isEndpoint
                                                      ? 'text-slate-900 dark:text-white'
                                                      : stepPos
                                                        ? 'text-up dark:text-up-light'
                                                        : stepNeg
                                                          ? 'text-down dark:text-down-light'
                                                          : 'text-slate-500'
                                                  }`}
                                                >
                                                  {isEndpoint
                                                    ? fmtMetric(st.delta, metric, false)
                                                    : fmtSigned(st.delta, metric, false)}
                                                </td>
                                                <td className="px-3 py-1.5 text-right font-semibold text-slate-600 dark:text-slate-300">
                                                  {st.pp !== null ? fmtPp(st.pp) : '–'}
                                                </td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <div className="h-[190px] w-full">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                          data={wfSteps}
                                          layout="vertical"
                                          margin={{ top: 4, right: 95, left: 10, bottom: 2 }}
                                        >
                                          <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke={gridColor}
                                            horizontal={false}
                                          />
                                          <XAxis
                                            type="number"
                                            tickFormatter={(v) => fmtCompact(v)}
                                            tick={{ fill: axisColor, fontSize: 10 }}
                                            axisLine={{ stroke: gridColor }}
                                            tickLine={false}
                                            domain={[
                                              0,
                                              (dataMax: number) => (dataMax > 0 ? dataMax * 1.15 : 1),
                                            ]}
                                          />
                                          <YAxis
                                            type="category"
                                            dataKey="shortLabel"
                                            width={150}
                                            tick={{ fill: axisColor, fontSize: 11, fontWeight: 600 }}
                                            axisLine={false}
                                            tickLine={false}
                                          />
                                          <ReferenceLine x={0} stroke={axisColor} strokeOpacity={0.35} />
                                          <Tooltip
                                            contentStyle={{
                                              backgroundColor: isDark ? '#0f172a' : '#ffffff',
                                              borderColor: isDark ? '#4f46e5' : '#c7d2fe',
                                              borderRadius: '0.75rem',
                                              fontSize: '12px',
                                            }}
                                            formatter={(
                                              _: unknown,
                                              name: string,
                                              item: { payload?: ProductBehaviorWaterfallStep },
                                            ) => {
                                              if (name === 'spacer') return [null, null];
                                              const step = item.payload;
                                              if (!step) return ['', ''];
                                              if (step.kind === 'py' || step.kind === 'cy') {
                                                const ppSuffix = step.pp !== null ? ` (${fmtPp(step.pp)})` : '';
                                                return [`${fmtMetric(step.delta, metric)}${ppSuffix}`, step.label];
                                              }
                                              return [
                                                `${fmtSigned(step.delta, metric)} (${fmtPp(step.pp)})`,
                                                step.label,
                                              ];
                                            }}
                                          />
                                          <Bar
                                            dataKey="spacer"
                                            stackId="cb-bridge"
                                            fill="transparent"
                                            isAnimationActive={false}
                                          />
                                          <Bar
                                            dataKey="span"
                                            stackId="cb-bridge"
                                            radius={[4, 4, 4, 4]}
                                            maxBarSize={18}
                                          >
                                            {wfSteps.map((step) => {
                                              const fill =
                                                step.kind === 'py' || step.kind === 'cy'
                                                  ? totalNeutralColor
                                                  : step.kind === 'pos'
                                                    ? isDark
                                                      ? SHARED_PALETTE.upLight
                                                      : SHARED_PALETTE.up
                                                    : isDark
                                                      ? SHARED_PALETTE.downLight
                                                      : SHARED_PALETTE.down;
                                              return <Cell key={step.id} fill={fill} />;
                                            })}
                                            <LabelList
                                              content={(props: {
                                                x?: number | string;
                                                y?: number | string;
                                                width?: number | string;
                                                height?: number | string;
                                                index?: number;
                                              }) => {
                                                const { x = 0, y = 0, width = 0, height = 0, index = 0 } = props;
                                                const step = wfSteps[index];
                                                if (!step) return null;
                                                const numX = Number(x);
                                                const numY = Number(y);
                                                const numW = Number(width);
                                                const numH = Number(height);

                                                const labelText =
                                                  step.kind === 'py'
                                                    ? fmtCompact(step.delta)
                                                    : step.kind === 'cy'
                                                      ? `${fmtCompact(step.delta)}${
                                                          step.pp !== null ? ` (${fmtPp(step.pp)})` : ''
                                                        }`
                                                      : `${fmtSigned(step.delta, metric, false)}${
                                                          step.pp !== null ? ` (${fmtPp(step.pp)})` : ''
                                                        }`;

                                                const fill =
                                                  step.kind === 'py' || step.kind === 'cy'
                                                    ? axisColor
                                                    : step.delta >= 0
                                                      ? isDark
                                                        ? SHARED_PALETTE.upLight
                                                        : SHARED_PALETTE.up
                                                      : isDark
                                                        ? SHARED_PALETTE.downLight
                                                        : SHARED_PALETTE.down;

                                                return (
                                                  <text
                                                    x={numX + Math.max(0, numW) + 6}
                                                    y={numY + numH / 2}
                                                    textAnchor="start"
                                                    dominantBaseline="central"
                                                    fill={fill}
                                                    fontSize={10}
                                                    fontWeight={700}
                                                    className="tabular-nums select-none"
                                                  >
                                                    {labelText}
                                                  </text>
                                                );
                                              }}
                                            />
                                          </Bar>
                                        </BarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Show All / Show Top 25 Pagination Footer */}
              {productExposureView === 'all' && rankedRows.length > PRODUCT_EXPOSURE_DEFAULT_LIMIT && (
                <div className="flex items-center justify-between px-1 text-xs text-slate-600 dark:text-slate-300">
                  <span>
                    Showing <strong>{visibleRows.length}</strong> of{' '}
                    <strong>{rankedRows.length}</strong> {levelLabel.toLowerCase()}s
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowAll((s) => !s)}
                    className="rounded-xl border border-fuchsia-500/40 bg-fuchsia-500/10 px-3 py-1 font-bold text-fuchsia-800 hover:bg-fuchsia-500/20 dark:text-fuchsia-200"
                  >
                    {showAll
                      ? `Show top ${PRODUCT_EXPOSURE_DEFAULT_LIMIT}`
                      : `Show all (${rankedRows.length})`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
