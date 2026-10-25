import React, { useMemo, useState, useTransition } from 'react';
import { BarChart3, Layers, RotateCcw, Scale, Table2 } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useShallow } from 'zustand/react/shallow';
import {
  ContributionRow,
  DrillField,
  INSIGHT_LEVELS,
  INSIGHT_LEVEL_LABEL,
  InsightLevel,
} from '../lib/aggregate';
import {
  fmtCompact,
  fmtGrowth,
  fmtPct,
  fmtPp,
  fmtPrice,
  fmtSigned,
  fmtSignedPrice,
} from '../lib/format';
import { METRIC_LABEL } from '../lib/metrics';
import { SHARED_PALETTE } from '../lib/palette';
import { useDashboardStore } from '../store/useDashboardStore';

type ViewMode = 'table' | 'chart';

export const ContributionPriceVolume: React.FC = () => {
  const [, startTransition] = useTransition();
  const [level, setLevel] = useState<InsightLevel>('subtype');
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  const {
    result,
    metric,
    theme,
    addDrillRow,
    setItemsForCurrentLine,
    drill,
    resetFilters,
  } = useDashboardStore(
    useShallow((s) => ({
      result: s.result,
      metric: s.metric,
      theme: s.theme,
      addDrillRow: s.addDrillRow,
      setItemsForCurrentLine: s.setItemsForCurrentLine,
      drill: s.drill,
      resetFilters: s.resetFilters,
    }))
  );

  const rows = useMemo<ContributionRow[]>(() => {
    if (!result) return [];
    const list = [...(result.insights.byLevel[level] ?? [])];
    list.sort((a, b) => Math.abs(b.valueDelta) - Math.abs(a.valueDelta));
    return list;
  }, [result, level]);

  const chartData = useMemo(() => {
    return rows.slice(0, 12).map((r) => ({
      id: r.id,
      name: r.label.length > 20 ? `${r.label.slice(0, 19)}…` : r.label,
      fullName: r.label,
      field: r.field,
      value: r.value,
      volumeEffect: r.pvm.volumeEffect,
      priceEffect: r.pvm.priceEffect,
      newLostEffect: r.pvm.newEffect + r.pvm.lostEffect,
      totalDeltaV: r.valueDelta,
      contribPp: metric === 'units' ? (r.unitsContribPp ?? 0) : (r.valueContribPp ?? 0),
      row: r,
    }));
  }, [rows, metric]);

  if (!result || rows.length === 0) {
    return (
      <div className="glass-panel flex h-[340px] flex-col items-center justify-center rounded-2xl border border-slate-200/70 p-6 text-center dark:border-slate-800/80">
        <Scale className="h-8 w-8 text-slate-400 dark:text-slate-500" />
        <h3 className="mt-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
          Contribution-to-Growth & Price / Volume Decomposition
        </h3>
        <p className="mt-1 max-w-xs text-xs text-slate-500 dark:text-slate-400">
          No Phase 4 decomposition rows match the current filter selection.
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
    );
  }

  const isDark = theme === 'dark';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.25)';
  const axisColor = isDark ? '#cbd5e1' : '#334155';

  // Portfolio item-level PVM summary & active level PVM summary from Phase 4 worker results
  const itemPvm = result.insights.pvmSummary;
  const levelPvm = result.insights.levelPvmSummary[level] ?? itemPvm;
  const newLostTotal = itemPvm.newEffect + itemPvm.lostEffect;
  const newLostPp =
    itemPvm.newPp !== null && itemPvm.lostPp !== null ? itemPvm.newPp + itemPvm.lostPp : null;

  const handleDrill = (field: DrillField | 'Item', value: string, label: string) => {
    startTransition(() => {
      if (field === 'Item') {
        setItemsForCurrentLine([value]);
      } else {
        addDrillRow([{ field, value, label }]);
      }
    });
  };

  const toneClass = (v: number) =>
    v > 1e-9
      ? 'text-up dark:text-up-light'
      : v < -1e-9
        ? 'text-down dark:text-down-light'
        : 'text-slate-500 dark:text-slate-400';

  const textSummary = `Portfolio Value YoY change ${fmtSigned(itemPvm.totalDeltaV, 'value')} (${fmtPp(itemPvm.totalGrowthPp)}): Volume effect ${fmtSigned(itemPvm.volumeEffect, 'value')} (${fmtPp(itemPvm.volumePp)}), Price effect ${fmtSigned(itemPvm.priceEffect, 'value')} (${fmtPp(itemPvm.pricePp)}), New/Lost effect ${fmtSigned(newLostTotal, 'value')} (${fmtPp(newLostPp)}).`;

  return (
    <section
      aria-label="Contribution to growth and Price Volume decomposition"
      className="glass-panel relative flex flex-col overflow-hidden rounded-2xl border border-indigo-200/70 p-3.5 dark:border-slate-800/80"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-emerald-500 to-amber-500" />

      <p className="sr-only">{textSummary}</p>

      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-indigo-950 dark:text-indigo-200">
              Contribution-to-Growth & Price / Volume Decomposition
            </h2>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Phase 4 decomposition: ΔValue = Volume Effect + Price Effect + New/Lost Business
            </p>
          </div>

          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as InsightLevel)}
            aria-label="Contribution and price-volume level"
            className="rounded-lg border border-indigo-200/80 bg-white/85 px-2.5 py-0.5 text-xs font-bold text-indigo-900 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-indigo-200"
          >
            {INSIGHT_LEVELS.map((lvl) => (
              <option key={lvl} value={lvl} className="bg-white dark:bg-slate-900">
                {INSIGHT_LEVEL_LABEL[lvl]} Level
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'table' ? 'chart' : 'table')}
            aria-pressed={viewMode === 'chart'}
            aria-label={
              viewMode === 'table'
                ? 'Switch to Price Volume decomposition chart'
                : 'Switch to Contribution and Price Volume table'
            }
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              viewMode === 'chart'
                ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                : 'border-indigo-200/80 bg-white/80 text-slate-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
            }`}
          >
            {viewMode === 'table' ? (
              <>
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Chart</span>
              </>
            ) : (
              <>
                <Table2 className="h-3.5 w-3.5" />
                <span>Table</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 4 Summary Decomposition Cards (reading from Phase 4 item-level pvmSummary) */}
      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Value YoY Change & Realized Price */}
        <div className="rounded-xl border border-indigo-200/70 bg-white/75 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Total Value YoY Δ</span>
            <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
              {fmtPp(itemPvm.totalGrowthPp)}
            </span>
          </div>
          <div className={`mt-1 text-base font-extrabold tabular-nums ${toneClass(itemPvm.totalDeltaV)}`}>
            {fmtSigned(itemPvm.totalDeltaV, 'value')}
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
            Avg Price: {fmtPrice(itemPvm.pyAvgPrice)} →{' '}
            <strong className="text-slate-700 dark:text-slate-200">{fmtPrice(itemPvm.cyAvgPrice)}</strong>
          </div>
        </div>

        {/* Card 2: Volume Effect (Continuing Items) */}
        <div className="rounded-xl border border-indigo-200/70 bg-white/75 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Volume Effect (Item-Level)</span>
            <span className={`font-bold tabular-nums ${toneClass(itemPvm.volumeEffect)}`}>
              {fmtPp(itemPvm.volumePp)}
            </span>
          </div>
          <div className={`mt-1 text-base font-extrabold tabular-nums ${toneClass(itemPvm.volumeEffect)}`}>
            {fmtSigned(itemPvm.volumeEffect, 'value')}
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
            Pure Vol: {fmtCompact(itemPvm.pureVolumeEffect)} · Mix: {fmtCompact(itemPvm.mixEffect)}
          </div>
        </div>

        {/* Card 3: Price Effect (Realized Price Change) */}
        <div className="rounded-xl border border-indigo-200/70 bg-white/75 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Price Effect (Item-Level)</span>
            <span className={`font-bold tabular-nums ${toneClass(itemPvm.priceEffect)}`}>
              {fmtPp(itemPvm.pricePp)}
            </span>
          </div>
          <div className={`mt-1 text-base font-extrabold tabular-nums ${toneClass(itemPvm.priceEffect)}`}>
            {fmtSigned(itemPvm.priceEffect, 'value')}
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
            Σ CY Units × (CY Price − PY Price)
          </div>
        </div>

        {/* Card 4: New & Lost Business Effect */}
        <div className="rounded-xl border border-indigo-200/70 bg-white/75 p-2.5 dark:border-slate-800 dark:bg-slate-900/60">
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span>New & Lost Items Effect</span>
            <span className={`font-bold tabular-nums ${toneClass(newLostTotal)}`}>
              {fmtPp(newLostPp)}
            </span>
          </div>
          <div className={`mt-1 text-base font-extrabold tabular-nums ${toneClass(newLostTotal)}`}>
            {fmtSigned(newLostTotal, 'value')}
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 tabular-nums">
            New: +{fmtCompact(itemPvm.newEffect)} · Lost: {fmtCompact(itemPvm.lostEffect)}
          </div>
        </div>
      </div>

      {/* Main Content: Table or Stacked Bar Chart */}
      {viewMode === 'chart' ? (
        <div className="h-[280px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 20, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => fmtCompact(v)}
                tick={{ fill: axisColor, fontSize: 10 }}
                axisLine={{ stroke: gridColor }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fill: axisColor, fontSize: 11, fontWeight: 500 }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine x={0} stroke={axisColor} strokeOpacity={0.45} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0]?.payload as (typeof chartData)[number] | undefined;
                  if (!d) return null;
                  const r = d.row;
                  return (
                    <div className="rounded-xl border border-indigo-200/90 bg-white/95 p-2.5 text-xs shadow-lg backdrop-blur-md dark:border-indigo-500/40 dark:bg-slate-900/95">
                      <div className="mb-1.5 font-extrabold text-slate-900 dark:text-white" dir="auto">
                        {d.fullName}
                      </div>
                      <div className="space-y-1 tabular-nums">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">Volume Effect:</span>
                          <span className={`font-bold ${toneClass(r.pvm.volumeEffect)}`}>
                            {fmtSigned(r.pvm.volumeEffect, 'value')} ({fmtPp(r.pvm.volumePp)})
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">Price Effect:</span>
                          <span className={`font-bold ${toneClass(r.pvm.priceEffect)}`}>
                            {fmtSigned(r.pvm.priceEffect, 'value')} ({fmtPp(r.pvm.pricePp)})
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-slate-500 dark:text-slate-400">New / Lost:</span>
                          <span className={`font-bold ${toneClass(d.newLostEffect)}`}>
                            {fmtSigned(d.newLostEffect, 'value')} ({fmtPp(r.pvm.newLostPp)})
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 border-t border-slate-200/70 pt-1 dark:border-slate-800">
                          <span className="text-slate-500 dark:text-slate-400">Total Value Δ:</span>
                          <span className={`font-extrabold ${toneClass(r.valueDelta)}`}>
                            {fmtSigned(r.valueDelta, 'value')} ({fmtPp(r.valueContribPp)})
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 600 }} />
              <Bar
                dataKey="volumeEffect"
                name="Volume Effect (EGP)"
                stackId="pvm"
                fill={isDark ? SHARED_PALETTE.upLight : SHARED_PALETTE.up}
                maxBarSize={16}
              />
              <Bar
                dataKey="priceEffect"
                name="Price Effect (EGP)"
                stackId="pvm"
                fill="#6366f1"
                maxBarSize={16}
              />
              <Bar
                dataKey="newLostEffect"
                name="New / Lost (EGP)"
                stackId="pvm"
                fill="#f59e0b"
                maxBarSize={16}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="max-h-[300px] w-full overflow-auto rounded-xl border border-indigo-100/80 dark:border-slate-800">
          <table className="w-full border-collapse text-left text-xs tabular-nums">
            <thead className="sticky top-0 z-10 bg-indigo-50/95 text-[11px] font-extrabold uppercase tracking-wider text-indigo-950 backdrop-blur-md dark:bg-slate-900/95 dark:text-indigo-200">
              <tr>
                <th className="border-b border-indigo-200/70 px-3 py-2 dark:border-slate-800">
                  {INSIGHT_LEVEL_LABEL[level]}
                </th>
                <th className="border-b border-indigo-200/70 px-2.5 py-2 text-right dark:border-slate-800">
                  CY Share ({METRIC_LABEL[metric]})
                </th>
                <th className="border-b border-indigo-200/70 px-2.5 py-2 text-right dark:border-slate-800">
                  Contrib. ({METRIC_LABEL[metric]})
                </th>
                <th className="border-b border-indigo-200/70 px-2.5 py-2 text-right dark:border-slate-800">
                  PY → CY Price
                </th>
                <th className="border-b border-indigo-200/70 px-2.5 py-2 text-right dark:border-slate-800">
                  Volume Effect
                </th>
                <th className="border-b border-indigo-200/70 px-2.5 py-2 text-right dark:border-slate-800">
                  Price Effect
                </th>
                <th className="border-b border-indigo-200/70 px-2.5 py-2 text-right dark:border-slate-800">
                  New / Lost
                </th>
                <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                  Value YoY Δ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-indigo-100/60 dark:divide-slate-800/70">
              {rows.slice(0, 60).map((r) => {
                const activeShare = metric === 'units' ? r.unitsShareCy : r.valueShareCy;
                const activeContrib = metric === 'units' ? r.unitsContribPp : r.valueContribPp;
                const activeGrowth = metric === 'units' ? r.unitsGrowth : r.valueGrowth;
                const rowNewLost = r.pvm.newEffect + r.pvm.lostEffect;

                return (
                  <tr key={r.id} className="hover:bg-indigo-500/5 dark:hover:bg-indigo-500/10">
                    <td className="px-3 py-1.5 font-semibold text-slate-900 dark:text-slate-100" dir="auto">
                      <button
                        type="button"
                        onClick={() => handleDrill(r.field, r.value, r.label)}
                        className="inline-flex items-center gap-1.5 text-left hover:text-indigo-600 hover:underline dark:hover:text-cyan-400"
                        title={`Filter dashboard by ${r.label}`}
                      >
                        <Layers className="h-3 w-3 shrink-0 text-indigo-400" />
                        <span>{r.label}</span>
                      </button>
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-slate-600 dark:text-slate-300">
                      {fmtPct(activeShare)}
                    </td>
                    <td className={`px-2.5 py-1.5 text-right font-bold ${toneClass(activeContrib ?? 0)}`}>
                      <div>{fmtPp(activeContrib)}</div>
                      <div className="text-[10px] font-medium text-slate-400">
                        YoY: {fmtGrowth(activeGrowth)}
                      </div>
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-slate-600 dark:text-slate-300">
                      <div>
                        {fmtPrice(r.pvm.pyPrice, false)} →{' '}
                        <strong className="text-slate-900 dark:text-white">
                          {fmtPrice(r.pvm.cyPrice, false)}
                        </strong>
                      </div>
                      {r.pvm.priceDelta !== null && (
                        <div className={`text-[10px] font-semibold ${toneClass(r.pvm.priceDelta)}`}>
                          {fmtSignedPrice(r.pvm.priceDelta, false)}
                        </div>
                      )}
                    </td>
                    <td className={`px-2.5 py-1.5 text-right font-semibold ${toneClass(r.pvm.volumeEffect)}`}>
                      <div>{fmtSigned(r.pvm.volumeEffect, 'value', false)}</div>
                      <div className="text-[10px] opacity-80">{fmtPp(r.pvm.volumePp)}</div>
                    </td>
                    <td className={`px-2.5 py-1.5 text-right font-semibold ${toneClass(r.pvm.priceEffect)}`}>
                      <div>{fmtSigned(r.pvm.priceEffect, 'value', false)}</div>
                      <div className="text-[10px] opacity-80">{fmtPp(r.pvm.pricePp)}</div>
                    </td>
                    <td className={`px-2.5 py-1.5 text-right font-semibold ${toneClass(rowNewLost)}`}>
                      <div>{fmtSigned(rowNewLost, 'value', false)}</div>
                      <div className="text-[10px] opacity-80">{fmtPp(r.pvm.newLostPp)}</div>
                    </td>
                    <td className={`px-3 py-1.5 text-right font-extrabold ${toneClass(r.valueDelta)}`}>
                      {fmtSigned(r.valueDelta, 'value', false)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-10 border-t border-indigo-300 bg-indigo-950/95 font-bold text-white dark:border-slate-700">
              <tr>
                <td className="px-3 py-2">
                  Total ({rows.length.toLocaleString('en-US')} {INSIGHT_LEVEL_LABEL[level].toLowerCase()}s)
                </td>
                <td className="px-2.5 py-2 text-right">100.0%</td>
                <td className="px-2.5 py-2 text-right">{fmtPp(levelPvm.totalGrowthPp)}</td>
                <td className="px-2.5 py-2 text-right text-indigo-200">
                  {fmtPrice(levelPvm.pyAvgPrice, false)} → {fmtPrice(levelPvm.cyAvgPrice, false)}
                </td>
                <td className="px-2.5 py-2 text-right text-emerald-300">
                  {fmtSigned(levelPvm.volumeEffect, 'value', false)} ({fmtPp(levelPvm.volumePp)})
                </td>
                <td className="px-2.5 py-2 text-right text-cyan-300">
                  {fmtSigned(levelPvm.priceEffect, 'value', false)} ({fmtPp(levelPvm.pricePp)})
                </td>
                <td className="px-2.5 py-2 text-right text-amber-300">
                  {fmtSigned(levelPvm.newEffect + levelPvm.lostEffect, 'value', false)}
                </td>
                <td className="px-3 py-2 text-right">
                  {fmtSigned(levelPvm.totalDeltaV, 'value', false)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
};
