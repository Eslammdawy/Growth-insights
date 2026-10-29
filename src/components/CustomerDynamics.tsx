import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileSpreadsheet,
  Filter,
  Info,
  Loader2,
  Package,
  RotateCcw,
  Sparkles,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { GroupRow, ItemTarget } from '../lib/aggregate';
import { exportDefectorWatchlistToExcel } from '../lib/exportExcel';
import { fmtGrowth, fmtMetric, fmtPct, fmtPp, fmtSigned } from '../lib/format';
import {
  CUSTOMER_SEGMENTS,
  CUSTOMER_SEGMENT_LABEL,
  CustomerSegment,
  METRIC_LABEL,
  classifyCustomerSegment,
  contributionPp,
  deriveRow,
  growth,
  isZero,
  metricPair,
} from '../lib/metrics';
import { StatusFilter, useDashboardStore } from '../store/useDashboardStore';

const SEGMENT_BADGE: Record<CustomerSegment, string> = {
  new: 'bg-amber-500/15 text-amber-800 ring-1 ring-amber-500/30 dark:bg-amber-500/20 dark:text-amber-300',
  growing:
    'bg-emerald-500/15 text-emerald-800 ring-1 ring-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-300',
  stable:
    'bg-sky-500/15 text-sky-800 ring-1 ring-sky-500/30 dark:bg-sky-500/20 dark:text-sky-300',
  declining:
    'bg-orange-500/15 text-orange-800 ring-1 ring-orange-500/30 dark:bg-orange-500/20 dark:text-orange-300',
  lost: 'bg-rose-500/15 text-rose-800 ring-1 ring-rose-500/30 dark:bg-rose-500/20 dark:text-rose-300',
};

interface KpiInfoTooltipProps {
  id: string;
  title: string;
  meaning: string;
  formula: string;
  alignClass?: string;
  iconToneClass?: string;
}

const KpiInfoTooltip: React.FC<KpiInfoTooltipProps> = ({
  id,
  title,
  meaning,
  formula,
  alignClass = 'left-0',
  iconToneClass = 'text-slate-400 hover:bg-indigo-500/15 hover:text-indigo-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-indigo-300',
}) => (
  <div className="group/info inline-flex shrink-0 items-center">
    <button
      type="button"
      aria-label={`About ${title}`}
      aria-describedby={id}
      title={`${title} — ${meaning} Calculation: ${formula}`}
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-500 ${iconToneClass}`}
    >
      <Info className="h-3.5 w-3.5" />
    </button>
    <div
      id={id}
      role="tooltip"
      className={`pointer-events-none invisible absolute top-8 z-40 w-64 rounded-xl border border-indigo-200/90 bg-white/95 p-2.5 text-left text-[11px] leading-snug text-slate-700 opacity-0 shadow-glass-lg ring-1 ring-indigo-500/15 backdrop-blur-xl transition-all duration-150 group-hover/info:pointer-events-auto group-hover/info:visible group-hover/info:opacity-100 group-focus-within/info:pointer-events-auto group-focus-within/info:visible group-focus-within/info:opacity-100 dark:border-slate-700/90 dark:bg-slate-900/95 dark:text-slate-200 ${alignClass}`}
    >
      <div className="font-extrabold text-slate-900 dark:text-white">{title}</div>
      <p className="mt-1 font-normal text-slate-600 dark:text-slate-300">{meaning}</p>
      <div className="mt-1.5 rounded-lg border border-indigo-100/80 bg-indigo-50/70 px-2 py-1.5 font-mono text-[10px] font-semibold text-indigo-950 dark:border-slate-800 dark:bg-slate-800/90 dark:text-indigo-200">
        <span className="block text-[9px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          How it&apos;s calculated
        </span>
        <span className="mt-0.5 block">{formula}</span>
      </div>
    </div>
  </div>
);

export const CustomerDynamics: React.FC = () => {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(true);
  const [expandedDefectors, setExpandedDefectors] = useState<Set<string>>(() => new Set());
  const targets = useRef(new Map<string, ItemTarget>());

  const {
    result,
    metric,
    itemsByRow,
    fetchItems,
    addDrillRow,
    drill,
    resetFilters,
    customerStatusFilter,
    setCustomerStatusFilter,
    analyzing,
  } = useDashboardStore(
    useShallow((s) => ({
      result: s.result,
      metric: s.metric,
      itemsByRow: s.itemsByRow,
      fetchItems: s.fetchItems,
      addDrillRow: s.addDrillRow,
      drill: s.drill,
      resetFilters: s.resetFilters,
      customerStatusFilter: s.customerStatusFilter,
      setCustomerStatusFilter: s.setCustomerStatusFilter,
      analyzing: s.analyzing,
    }))
  );

  // Re-fetch expanded defector items when analysis refreshes
  useEffect(() => {
    for (const key of expandedDefectors) {
      const t = targets.current.get(key);
      if (t && itemsByRow[key] === undefined) {
        void fetchItems(key, t);
      }
    }
  }, [expandedDefectors, itemsByRow, fetchItems]);

  const toggleDefector = useCallback(
    (row: GroupRow) => {
      const key = row.id;
      const target: ItemTarget = { level: 'customer', value: row.value };
      setExpandedDefectors((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
          targets.current.set(key, target);
          void fetchItems(key, target);
        }
        return next;
      });
    },
    [fetchItems]
  );

  const ci = result?.customerInsights.byMetric[metric];
  const customerRows = result?.levels.customer ?? [];
  const totalPy = result ? (metric === 'units' ? result.totals.pyQ : result.totals.pyV) : 0;

  const defectors = useMemo(() => {
    if (!result) return [];
    return customerRows
      .filter((r) => classifyCustomerSegment(r.sums, metric) === 'lost')
      .map((r) => {
        const { py } = metricPair(r.sums, metric);
        return {
          row: r,
          pyVal: py,
          contribPp: contributionPp(-py, totalPy),
        };
      })
      .filter((x) => x.pyVal > 0 && !isZero(x.pyVal))
      .sort((a, b) => b.pyVal - a.pyVal)
      .slice(0, 10);
  }, [result, customerRows, metric, totalPy]);

  const handleSegmentClick = (seg: CustomerSegment) => {
    const nextFilter: StatusFilter = customerStatusFilter === seg ? 'all' : seg;
    setCustomerStatusFilter(nextFilter);
    const el = document.getElementById('table-customer');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleExportWatchlist = useCallback(() => {
    if (!result || defectors.length === 0) return;
    exportDefectorWatchlistToExcel({
      customers: defectors.map((d) => {
        const entry = itemsByRow[d.row.id];
        return {
          row: d.row,
          pyVal: d.pyVal,
          contribPp: d.contribPp,
          items: Array.isArray(entry) ? entry : undefined,
        };
      }),
      period: result.period,
      metric,
    });
  }, [result, defectors, itemsByRow, metric]);

  if (!result || !ci) return null;

  const activeGrowth = growth(ci.active.pyCount, ci.active.cyCount);
  const avgGrowth = growth(ci.avgPerActive.py, ci.avgPerActive.cy);
  const totalCustCount = ci.active.totalCount;

  return (
    <section
      id="section-customer-dynamics"
      aria-label="Customer Dynamics"
      className={`glass-panel relative flex flex-col rounded-2xl border border-fuchsia-200/70 dark:border-slate-800/80 scroll-mt-28 transition-opacity duration-200 ${
        analyzing ? 'pointer-events-none opacity-60' : 'opacity-100'
      }`}
    >
      <div className="h-1.5 w-full rounded-t-2xl bg-gradient-to-r from-fuchsia-500 via-purple-500 to-indigo-500" />

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-fuchsia-200/60 bg-gradient-to-r from-fuchsia-50/80 via-purple-50/40 to-white/90 px-3.5 py-2.5 dark:border-slate-800/80 dark:from-fuchsia-950/50 dark:via-slate-900/90 dark:to-slate-900/90">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="customer-dynamics-body"
            title={open ? 'Collapse Customer Dynamics' : 'Expand Customer Dynamics'}
            className="rounded-lg p-1 text-fuchsia-600 hover:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:hover:bg-slate-800"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-fuchsia-600 to-purple-600 px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-white shadow-sm">
            <Users className="h-3.5 w-3.5" />
            Customer Dynamics
          </span>
          <span className="hidden text-xs font-medium text-slate-600 dark:text-slate-300 sm:inline">
            Retention (NRR / GRR) · Lifecycle Segments · Defector Watchlist
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {customerStatusFilter !== 'all' && (
            <button
              type="button"
              onClick={() => setCustomerStatusFilter('all')}
              className="rounded-xl bg-fuchsia-500/15 px-2.5 py-1 text-xs font-semibold text-fuchsia-800 hover:bg-fuchsia-500/25 dark:text-fuchsia-200"
            >
              Clear segment filter ({CUSTOMER_SEGMENT_LABEL[customerStatusFilter as CustomerSegment] ?? customerStatusFilter})
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-xl bg-fuchsia-500/10 px-2.5 py-1 text-xs font-semibold text-fuchsia-700 hover:bg-fuchsia-500/20 dark:text-fuchsia-300"
          >
            {open ? 'Hide dynamics' : 'Show dynamics'}
          </button>
        </div>
      </div>

      <p className="sr-only">
        Customer dynamics for {METRIC_LABEL[metric]}: Active customers PY {ci.active.pyCount} to CY {ci.active.cyCount}.
        Net Revenue Retention {fmtPct(ci.nrr)}, Gross Revenue Retention {fmtPct(ci.grr)}, Churn {fmtPct(ci.churnRate)}, New-business rate {fmtPct(ci.newRate)}.
      </p>

      {open && (
        <div id="customer-dynamics-body" className="space-y-3.5 p-3.5">
          {totalCustCount === 0 ? (
            <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-slate-200/70 p-6 text-center dark:border-slate-800/80">
              <Users className="h-7 w-7 text-slate-400 dark:text-slate-500" />
              <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                No customer activity matches the current filters.
              </p>
              {drill.length > 0 && (
                <button
                  type="button"
                  onClick={() => startTransition(() => resetFilters())}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <>
              {/* 1. Retention & Active Base KPI Strip */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                {/* Active Customers */}
                <div className="relative rounded-xl border border-indigo-200/70 bg-white/80 p-2.5 shadow-sm hover:z-30 focus-within:z-30 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Active Customers
                    </div>
                    <KpiInfoTooltip
                      id="kpi-tip-active-customers"
                      title="Active Customers"
                      meaning="Distinct customers with positive net purchases (CY > 0) in the selected period. Retained accounts bought in both PY and CY."
                      formula="CY Active = Count(CY > 0) · YoY % = (CY Active − PY Active) ÷ PY Active"
                      alignClass="left-0"
                    />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1 tabular-nums">
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {ci.active.cyCount.toLocaleString('en-US')}
                    </span>
                    <span
                      className={`text-[11px] font-bold ${
                        ci.active.cyCount >= ci.active.pyCount
                          ? 'text-up dark:text-up-light'
                          : 'text-down dark:text-down-light'
                      }`}
                    >
                      {fmtGrowth(activeGrowth)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                    PY: {ci.active.pyCount.toLocaleString('en-US')} · Retained: {ci.active.bothCount.toLocaleString('en-US')}
                  </div>
                </div>

                {/* Avg per Active Customer */}
                <div className="relative rounded-xl border border-indigo-200/70 bg-white/80 p-2.5 shadow-sm hover:z-30 focus-within:z-30 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Avg / Active ({METRIC_LABEL[metric]})
                    </div>
                    <KpiInfoTooltip
                      id="kpi-tip-avg-active"
                      title={`Avg / Active (${METRIC_LABEL[metric]})`}
                      meaning={`Average ${metric === 'units' ? 'units' : 'sales value'} per active customer — shows whether average account spend/volume is expanding or shrinking.`}
                      formula={`CY Avg = Total CY ${METRIC_LABEL[metric]} ÷ CY Active Customers (PY Avg = Total PY ÷ PY Active)`}
                      alignClass="right-0 sm:left-0"
                    />
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-1 tabular-nums">
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {fmtMetric(ci.avgPerActive.cy, metric, false)}
                    </span>
                    <span
                      className={`text-[11px] font-bold ${
                        (ci.avgPerActive.cy ?? 0) >= (ci.avgPerActive.py ?? 0)
                          ? 'text-up dark:text-up-light'
                          : 'text-down dark:text-down-light'
                      }`}
                    >
                      {fmtGrowth(avgGrowth)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                    PY: {fmtMetric(ci.avgPerActive.py, metric, false)}
                  </div>
                </div>

                {/* Net Revenue Retention (NRR) */}
                <div className="relative rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] p-2.5 shadow-sm hover:z-30 focus-within:z-30 dark:border-emerald-500/20 dark:bg-emerald-950/20">
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                      Net Retention (NRR)
                    </div>
                    <KpiInfoTooltip
                      id="kpi-tip-nrr"
                      title="Net Retention (NRR)"
                      meaning={`Share of Prior Year ${metric === 'units' ? 'units' : 'value'} retained from continuing customers (active in both PY and CY), including expansion and contraction, excluding new customers. NRR > 100% means existing accounts grew net of churn.`}
                      formula="NRR = Σ CY (Retained) ÷ |Σ PY (PY-Active)| = GRR + Expansion Rate"
                      alignClass="left-0 sm:right-0 lg:left-0"
                      iconToneClass="text-emerald-600/70 hover:bg-emerald-500/15 hover:text-emerald-800 dark:text-emerald-400/70 dark:hover:bg-emerald-500/20 dark:hover:text-emerald-200"
                    />
                  </div>
                  <div className="mt-1 text-sm font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">
                    {fmtPct(ci.nrr)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                    Expansion: {fmtPct(ci.expansionRate, true)}
                  </div>
                </div>

                {/* Gross Revenue Retention (GRR) */}
                <div className="relative rounded-xl border border-indigo-200/70 bg-white/80 p-2.5 shadow-sm hover:z-30 focus-within:z-30 dark:border-slate-800 dark:bg-slate-900/70">
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Gross Retention (GRR)
                    </div>
                    <KpiInfoTooltip
                      id="kpi-tip-grr"
                      title="Gross Retention (GRR)"
                      meaning={`Share of Prior Year ${metric === 'units' ? 'units' : 'value'} kept from continuing customers before counting expansion (upsell). Capped at 100% (GRR ≤ NRR) to isolate baseline retention against contraction and lost churn.`}
                      formula="GRR = (Σ PY Retained + Contraction) ÷ |Σ PY (PY-Active)| = 100% − Lost Churn − Contraction"
                      alignClass="right-0 sm:left-0"
                    />
                  </div>
                  <div className="mt-1 text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
                    {fmtPct(ci.grr)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                    Contraction: {ci.contractionRate !== null ? `−${fmtPct(ci.contractionRate)}` : '–'}
                  </div>
                </div>

                {/* Lost-Customer Churn */}
                <div className="relative rounded-xl border border-rose-500/30 bg-rose-500/[0.04] p-2.5 shadow-sm hover:z-30 focus-within:z-30 dark:border-rose-500/20 dark:bg-rose-950/20">
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                      Lost Churn Rate
                    </div>
                    <KpiInfoTooltip
                      id="kpi-tip-churn"
                      title="Lost Churn Rate"
                      meaning={`Share of Prior Year ${metric === 'units' ? 'units' : 'value'} lost from defector customers who purchased in PY (PY ≠ 0) but had zero activity in CY (CY = 0).`}
                      formula="Lost Churn = Σ PY (Lost Customers) ÷ |Σ PY (PY-Active)|"
                      alignClass="left-0 lg:right-0"
                      iconToneClass="text-rose-600/70 hover:bg-rose-500/15 hover:text-rose-800 dark:text-rose-400/70 dark:hover:bg-rose-500/20 dark:hover:text-rose-200"
                    />
                  </div>
                  <div className="mt-1 text-sm font-extrabold tabular-nums text-rose-700 dark:text-rose-300">
                    {fmtPct(ci.churnRate)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {ci.segments.lost.count.toLocaleString('en-US')} lost accounts
                  </div>
                </div>

                {/* New-Business Rate */}
                <div className="relative rounded-xl border border-amber-500/30 bg-amber-500/[0.04] p-2.5 shadow-sm hover:z-30 focus-within:z-30 dark:border-amber-500/20 dark:bg-amber-950/20">
                  <div className="flex items-center justify-between gap-1">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                      New-Business Rate
                    </div>
                    <KpiInfoTooltip
                      id="kpi-tip-new-rate"
                      title="New-Business Rate"
                      meaning={`Share of Prior Year ${metric === 'units' ? 'units' : 'value'} added by newly acquired customers in CY (PY = 0, CY ≠ 0). Together with NRR, it reconciles to total YoY growth.`}
                      formula="New Rate = Σ CY (New Customers) ÷ |Σ PY (PY-Active)| · Identity: NRR + New Rate = 1 + g"
                      alignClass="right-0"
                      iconToneClass="text-amber-600/70 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-400/70 dark:hover:bg-amber-500/20 dark:hover:text-amber-200"
                    />
                  </div>
                  <div className="mt-1 text-sm font-extrabold tabular-nums text-amber-700 dark:text-amber-300">
                    {fmtPct(ci.newRate, true)}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
                    {ci.segments.new.count.toLocaleString('en-US')} new · NRR + New = 1 + g
                  </div>
                </div>
              </div>

              {/* 2. Segment Table + 3. Defector Watchlist */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                {/* Lifecycle Segment Table (7 cols on lg) */}
                <div className="flex flex-col overflow-hidden rounded-xl border border-indigo-100/80 bg-white/60 dark:border-slate-800 dark:bg-slate-900/40 lg:col-span-7">
                  <div className="flex items-center justify-between border-b border-indigo-100/80 bg-indigo-50/60 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/80">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-indigo-950 dark:text-indigo-200">
                      <UserCheck className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                      Customer Lifecycle Segments (Click row to filter Customer Table)
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      Stable band: ±5.0%
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs tabular-nums">
                      <thead className="bg-indigo-50/40 text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
                        <tr>
                          <th className="border-b border-indigo-100/80 px-3 py-2 dark:border-slate-800">Segment</th>
                          <th className="border-b border-indigo-100/80 px-3 py-2 text-right dark:border-slate-800">
                            Customers
                          </th>
                          <th className="border-b border-indigo-100/80 px-3 py-2 text-right dark:border-slate-800">
                            PY ({result.period.pyLabel})
                          </th>
                          <th className="border-b border-indigo-100/80 px-3 py-2 text-right dark:border-slate-800">
                            CY ({result.period.cyLabel})
                          </th>
                          <th className="border-b border-indigo-100/80 px-3 py-2 text-right dark:border-slate-800">
                            YoY Δ
                          </th>
                          <th className="border-b border-indigo-100/80 px-3 py-2 text-right dark:border-slate-800">
                            YoY %
                          </th>
                          <th className="border-b border-indigo-100/80 px-3 py-2 text-right dark:border-slate-800">
                            Contrib. %
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-indigo-100/60 dark:divide-slate-800/70">
                        {CUSTOMER_SEGMENTS.map((seg) => {
                          const st = ci.segments[seg];
                          const d = deriveRow(st.sums, metric);
                          const pp = contributionPp(d.delta, totalPy);
                          const countShare = totalCustCount > 0 ? st.count / totalCustCount : 0;
                          const isSelected = customerStatusFilter === seg;
                          const isPos = d.delta > 0 && !isZero(d.delta);
                          const isNeg = d.delta < 0 && !isZero(d.delta);
                          return (
                            <tr
                              key={seg}
                              onClick={() => handleSegmentClick(seg)}
                              aria-selected={isSelected}
                              title={`Click to filter Customer table by ${CUSTOMER_SEGMENT_LABEL[seg]}`}
                              className={`cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-fuchsia-500/15 font-semibold dark:bg-fuchsia-500/25'
                                  : 'hover:bg-indigo-500/10 dark:hover:bg-indigo-500/15'
                              }`}
                            >
                              <td className="px-3 py-2">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${SEGMENT_BADGE[seg]}`}
                                >
                                  {seg === 'new' && <Sparkles className="h-3 w-3" />}
                                  {CUSTOMER_SEGMENT_LABEL[seg]}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">
                                {st.count.toLocaleString('en-US')}{' '}
                                <span className="text-[10px] font-normal text-slate-500 dark:text-slate-400">
                                  ({fmtPct(countShare)})
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                                {fmtMetric(d.py, metric, false)}
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-slate-900 dark:text-white">
                                {fmtMetric(d.cy, metric, false)}
                              </td>
                              <td
                                className={`px-3 py-2 text-right font-bold ${
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
                                className={`px-3 py-2 text-right font-bold ${
                                  isPos
                                    ? 'text-up dark:text-up-light'
                                    : isNeg
                                      ? 'text-down dark:text-down-light'
                                      : 'text-slate-500'
                                }`}
                              >
                                {fmtGrowth(d.growth)}
                              </td>
                              <td
                                className={`px-3 py-2 text-right font-bold ${
                                  isPos
                                    ? 'text-up dark:text-up-light'
                                    : isNeg
                                      ? 'text-down dark:text-down-light'
                                      : 'text-slate-500'
                                }`}
                              >
                                {fmtPp(pp)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Defector Watchlist: Top 10 Lost Customers (5 cols on lg) */}
                <div className="flex flex-col overflow-hidden rounded-xl border border-rose-500/25 bg-white/60 dark:border-rose-500/20 dark:bg-slate-900/40 lg:col-span-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rose-500/20 bg-rose-50/60 px-3 py-2 dark:border-slate-800 dark:bg-rose-950/30">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-rose-900 dark:text-rose-200">
                      <UserMinus className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
                      Defector Watchlist (Top {defectors.length} Lost)
                    </span>
                    <button
                      type="button"
                      onClick={handleExportWatchlist}
                      disabled={defectors.length === 0}
                      title="Export Defector Watchlist to Excel"
                      className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-500/20 disabled:opacity-40 dark:text-emerald-300"
                    >
                      <FileSpreadsheet className="h-3 w-3" />
                      Export watchlist
                    </button>
                  </div>

                  {defectors.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      No lost customers in this period.
                    </div>
                  ) : (
                    <div className="max-h-[260px] overflow-auto">
                      <table className="w-full border-collapse text-left text-xs tabular-nums">
                        <thead className="sticky top-0 z-10 bg-rose-50/95 text-[10px] font-extrabold uppercase tracking-wider text-rose-950 backdrop-blur-md dark:bg-slate-900/95 dark:text-rose-200">
                          <tr>
                            <th className="border-b border-rose-200/60 px-2.5 py-1.5 dark:border-slate-800">
                              Customer
                            </th>
                            <th className="border-b border-rose-200/60 px-2 py-1.5 dark:border-slate-800">
                              Brick (CY)
                            </th>
                            <th className="border-b border-rose-200/60 px-2 py-1.5 text-right dark:border-slate-800">
                              PY Lost
                            </th>
                            <th className="border-b border-rose-200/60 px-2.5 py-1.5 text-right dark:border-slate-800">
                              Contrib. %
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-rose-100/60 dark:divide-slate-800/70">
                          {defectors.map(({ row: r, pyVal, contribPp }) => {
                            const isOpen = expandedDefectors.has(r.id);
                            const entry = itemsByRow[r.id];
                            return (
                              <React.Fragment key={r.id}>
                                <tr
                                  onClick={() => toggleDefector(r)}
                                  className="cursor-pointer hover:bg-rose-500/10 dark:hover:bg-rose-500/15"
                                >
                                  <td className="px-2.5 py-1.5 font-semibold text-slate-900 dark:text-slate-100">
                                    <div className="flex items-center justify-between gap-1">
                                      <div className="flex min-w-0 items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleDefector(r);
                                          }}
                                          aria-expanded={isOpen}
                                          aria-label={`${isOpen ? 'Hide' : 'Show'} items previously bought by ${r.label}`}
                                          className="rounded p-0.5 text-rose-600 hover:bg-rose-500/15 dark:text-rose-400"
                                        >
                                          {isOpen ? (
                                            <ChevronDown className="h-3.5 w-3.5" />
                                          ) : (
                                            <ChevronRight className="h-3.5 w-3.5" />
                                          )}
                                        </button>
                                        <span className="truncate" dir="auto" title={r.label}>
                                          {r.label}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          startTransition(() =>
                                            addDrillRow([{ field: 'CustomerID', value: r.value, label: r.label }])
                                          );
                                        }}
                                        title={`Filter dashboard by ${r.label}`}
                                        aria-label={`Filter dashboard by ${r.label}`}
                                        className="rounded p-0.5 text-rose-500 hover:bg-rose-500/15"
                                      >
                                        <Filter className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300" dir="auto">
                                    <span className="truncate">{r.brick}</span>
                                  </td>
                                  <td className="px-2 py-1.5 text-right font-semibold text-slate-700 dark:text-slate-200">
                                    {fmtMetric(pyVal, metric, false)}
                                  </td>
                                  <td className="px-2.5 py-1.5 text-right font-bold text-down dark:text-down-light">
                                    {fmtPp(contribPp)}
                                  </td>
                                </tr>
                                {isOpen && (
                                  <>
                                    {entry === undefined || entry === 'loading' ? (
                                      <tr className="bg-slate-50/70 dark:bg-slate-900/40">
                                        <td colSpan={4} className="px-6 py-1.5 text-xs text-slate-500">
                                          <span className="inline-flex items-center gap-1.5">
                                            <Loader2 className="h-3 w-3 animate-spin text-sky-500" />
                                            Loading prior items…
                                          </span>
                                        </td>
                                      </tr>
                                    ) : entry === 'error' ? (
                                      <tr className="bg-slate-50/70 dark:bg-slate-900/40">
                                        <td colSpan={4} className="px-6 py-1.5 text-xs text-rose-600">
                                          Could not load items.
                                        </td>
                                      </tr>
                                    ) : entry.length === 0 ? (
                                      <tr className="bg-slate-50/70 dark:bg-slate-900/40">
                                        <td colSpan={4} className="px-6 py-1.5 text-xs text-slate-500">
                                          No prior items found.
                                        </td>
                                      </tr>
                                    ) : (
                                      [...entry]
                                        .sort(
                                          (a, b) =>
                                            (metric === 'units' ? b.sums.pyQ - a.sums.pyQ : b.sums.pyV - a.sums.pyV)
                                        )
                                        .map((it) => {
                                          const itPy = metric === 'units' ? it.sums.pyQ : it.sums.pyV;
                                          const itPp = contributionPp(-itPy, totalPy);
                                          return (
                                            <tr
                                              key={it.id}
                                              className="bg-cyan-50/45 text-[11px] dark:bg-cyan-950/20"
                                            >
                                              <td className="py-1 pl-7 pr-2 text-slate-700 dark:text-slate-200" colSpan={2}>
                                                <div className="flex items-center gap-1.5">
                                                  <Package className="h-3 w-3 shrink-0 text-cyan-500" />
                                                  <span className="truncate" dir="auto">
                                                    {it.label}
                                                  </span>
                                                  {it.brand && (
                                                    <span className="rounded bg-cyan-500/10 px-1 py-0.5 text-[10px] text-cyan-700 dark:text-cyan-300">
                                                      {it.brand}
                                                    </span>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="px-2 py-1 text-right text-slate-600 dark:text-slate-300">
                                                {fmtMetric(itPy, metric, false)}
                                              </td>
                                              <td className="px-2.5 py-1 text-right font-semibold text-down dark:text-down-light">
                                                {fmtPp(itPp)}
                                              </td>
                                            </tr>
                                          );
                                        })
                                    )}
                                  </>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};
