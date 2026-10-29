import React, { useMemo, useState, useTransition } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Compass,
  Filter,
  RotateCcw,
  Table2,
  TrendingDown,
  TrendingUp,
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
import { ContributionRow, DrillField } from '../lib/aggregate';
import { fmtCompact, fmtGrowth, fmtMetric, fmtPct, fmtPp, fmtSigned } from '../lib/format';
import {
  DRIVER_LEVELS,
  DRIVER_LEVEL_LABEL,
  WaterfallStep,
  buildHeadline,
  buildWaterfall,
  growthConcentration,
  rankDrivers,
} from '../lib/insights';
import { METRIC_LABEL, deriveRow, isZero, returnsRatePct } from '../lib/metrics';
import { SHARED_PALETTE } from '../lib/palette';
import { useDashboardStore } from '../store/useDashboardStore';

export const GrowthDrivers: React.FC = () => {
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(true);
  const [showTable, setShowTable] = useState(false);

  const {
    result,
    metric,
    txTypes,
    driverLevel,
    setDriverLevel,
    theme,
    drill,
    addDrillRow,
    resetFilters,
    analyzing,
  } = useDashboardStore(
    useShallow((s) => ({
      result: s.result,
      metric: s.metric,
      txTypes: s.txTypes,
      driverLevel: s.driverLevel,
      setDriverLevel: s.setDriverLevel,
      theme: s.theme,
      drill: s.drill,
      addDrillRow: s.addDrillRow,
      resetFilters: s.resetFilters,
      analyzing: s.analyzing,
    }))
  );

  const rows: ContributionRow[] = useMemo(
    () => result?.insights.byLevel[driverLevel] ?? [],
    [result, driverLevel]
  );

  const ranked = useMemo(() => rankDrivers(rows, metric, 5), [rows, metric]);

  const headline = useMemo(() => {
    if (!result) return { kind: 'empty' as const, text: '' };
    const getDelta = (r: ContributionRow) => (metric === 'units' ? r.unitsDelta : r.valueDelta);
    const getPp = (r: ContributionRow) => (metric === 'units' ? r.unitsContribPp : r.valueContribPp);
    const topPos = ranked.contributors[0]
      ? {
          label: ranked.contributors[0].label,
          delta: getDelta(ranked.contributors[0]),
          pp: getPp(ranked.contributors[0]),
        }
      : null;
    const topNeg = ranked.detractors[0]
      ? {
          label: ranked.detractors[0].label,
          delta: getDelta(ranked.detractors[0]),
          pp: getPp(ranked.detractors[0]),
        }
      : null;
    return buildHeadline(metric, result.totals, topPos, topNeg, result.period);
  }, [result, metric, ranked]);

  const waterfall = useMemo(() => {
    if (!result) return [];
    return buildWaterfall(rows, result.totals, metric, result.period);
  }, [rows, result, metric]);

  const concentration = useMemo(() => growthConcentration(rows, metric), [rows, metric]);

  const sortedTableRows = useMemo(() => {
    const getDelta = (r: ContributionRow) => (metric === 'units' ? r.unitsDelta : r.valueDelta);
    return [...rows].sort((a, b) => getDelta(b) - getDelta(a));
  }, [rows, metric]);

  if (!result) return null;

  const isDark = theme === 'dark';
  const gridColor = isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(148, 163, 184, 0.25)';
  const axisColor = isDark ? '#cbd5e1' : '#334155';
  const totalNeutralColor = isDark ? '#6366f1' : '#4f46e5';
  const otherPosColor = isDark ? 'rgba(52, 211, 153, 0.55)' : 'rgba(5, 150, 105, 0.55)';
  const otherNegColor = isDark ? 'rgba(251, 113, 133, 0.55)' : 'rgba(225, 29, 72, 0.55)';

  const handleDrill = (field: DrillField, value: string, label: string) => {
    startTransition(() => {
      addDrillRow([{ field, value, label }]);
    });
  };

  const hasActivity = !isZero(result.totals.pyQ) || !isZero(result.totals.pyV) || !isZero(result.totals.cyQ) || !isZero(result.totals.cyV);
  const chartHeight = Math.min(340, Math.max(210, waterfall.length * 24 + 28));

  const bothTxTypesIncluded = txTypes.includes('Sales') && txTypes.includes('Return Sales');
  const cyReturnsRatePct =
    bothTxTypesIncluded && result.grossTotals
      ? returnsRatePct(result.totals.cyV, result.grossTotals.cyV)
      : null;
  const pyReturnsRatePct =
    bothTxTypesIncluded && result.grossTotals
      ? returnsRatePct(result.totals.pyV, result.grossTotals.pyV)
      : null;
  const returnsRateElevated =
    cyReturnsRatePct !== null &&
    pyReturnsRatePct !== null &&
    cyReturnsRatePct > pyReturnsRatePct * 1.25;

  const getStepFill = (step: WaterfallStep) => {
    switch (step.kind) {
      case 'py':
      case 'cy':
        return totalNeutralColor;
      case 'pos':
        return isDark ? SHARED_PALETTE.upLight : SHARED_PALETTE.up;
      case 'other-pos':
        return otherPosColor;
      case 'neg':
        return isDark ? SHARED_PALETTE.downLight : SHARED_PALETTE.down;
      case 'other-neg':
        return otherNegColor;
    }
  };

  return (
    <section
      id="section-drivers"
      aria-label="Growth Drivers"
      className={`glass-panel relative flex flex-col overflow-hidden rounded-2xl border border-indigo-200/70 dark:border-slate-800/80 scroll-mt-28 transition-opacity duration-200 ${
        analyzing ? 'pointer-events-none opacity-60' : 'opacity-100'
      }`}
    >
      <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-emerald-500 to-rose-500" />

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-200/60 bg-gradient-to-r from-indigo-50/80 via-emerald-50/40 to-cyan-50/50 px-3.5 py-2 dark:border-slate-800/80 dark:from-slate-900/90 dark:via-indigo-950/40 dark:to-slate-900/90">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="drivers-body"
            title={open ? 'Collapse Growth Drivers' : 'Expand Growth Drivers'}
            className="rounded-lg p-1 text-indigo-600 hover:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-slate-800"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-emerald-600 px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-white shadow-sm">
            <Compass className="h-3.5 w-3.5" />
            Growth Drivers
          </span>
          <span className="hidden text-xs font-medium text-slate-600 dark:text-slate-300 sm:inline">
            Contribution Bridge (%) · Top Contributors & Detractors
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Segmented Level Selector */}
          <div
            role="group"
            aria-label="Growth drivers level"
            className="inline-flex rounded-xl border border-indigo-200/70 bg-indigo-50/80 p-0.5 text-xs dark:border-slate-700/80 dark:bg-slate-800/90"
          >
            {DRIVER_LEVELS.map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setDriverLevel(lvl)}
                aria-pressed={driverLevel === lvl}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all ${
                  driverLevel === lvl
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-indigo-700 dark:text-slate-300 dark:hover:text-indigo-200'
                }`}
              >
                {DRIVER_LEVEL_LABEL[lvl]}
              </button>
            ))}
          </div>

          {open && (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-pressed={showTable}
              aria-label={showTable ? 'Show contribution waterfall chart' : 'Show contribution drivers table'}
              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                showTable
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                  : 'border-indigo-200/80 bg-white/80 text-slate-700 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200'
              }`}
            >
              {showTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
              <span>{showTable ? 'Chart' : 'Table'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-xl bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300"
          >
            {open ? 'Hide drivers' : 'Show drivers'}
          </button>
        </div>
      </div>

      {/* Screen-reader narrative summary */}
      <p className="sr-only">
        {headline.text}{' '}
        {concentration.topPosShare5 !== null
          ? `Top 5 contributors represent ${fmtPct(concentration.topPosShare5)} of positive growth.`
          : ''}
      </p>

      {open && (
        <div id="drivers-body" className="space-y-3 p-3.5">
          {/* Headline Banner + WI-3 Concentration Stat Chips */}
          <div className="flex flex-col gap-2 rounded-xl border border-indigo-200/70 bg-white/75 px-3.5 py-2.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
            <p className="text-xs font-bold leading-relaxed text-slate-800 dark:text-slate-100">
              {headline.text}
            </p>

            {/* Stat chips row (WI-3 Concentration + WI-5 Portfolio Returns Rate) */}
            {(concentration.topPosShare5 !== null ||
              concentration.topNegShare1 !== null ||
              concentration.dominance ||
              cyReturnsRatePct !== null) && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
                {concentration.topPosShare5 !== null && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-0.5 font-semibold text-emerald-800 ring-1 ring-emerald-500/25 dark:bg-emerald-500/15 dark:text-emerald-300 tabular-nums">
                    Top-{Math.min(5, concentration.posCount)} contributors ={' '}
                    <strong>{fmtPct(concentration.topPosShare5)}</strong> of all growth
                  </span>
                )}
                {concentration.topNegShare1 !== null && concentration.topNegLabel && (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2 py-0.5 font-semibold text-rose-800 ring-1 ring-rose-500/25 dark:bg-rose-500/15 dark:text-rose-300 tabular-nums">
                    Top detractor ({concentration.topNegLabel}) ={' '}
                    <strong>{fmtPct(concentration.topNegShare1)}</strong> of all decline
                  </span>
                )}
                {concentration.dominance && concentration.topPosLabel && concentration.topPosShare1 !== null && (
                  <span
                    role="status"
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-500/15 px-2.5 py-0.5 font-bold text-amber-800 ring-1 ring-amber-500/40 dark:bg-amber-500/20 dark:text-amber-300 tabular-nums"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    Dominance warning: {concentration.topPosLabel} = {fmtPct(concentration.topPosShare1)} of positive growth
                  </span>
                )}
                {cyReturnsRatePct !== null && (
                  <span
                    title="Portfolio Returns Rate = (−Return Sales Value) / Gross Sales Value × 100. Highlighted in red when CY rate exceeds 1.25× PY rate."
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-semibold tabular-nums ${
                      returnsRateElevated
                        ? 'bg-rose-500/15 font-bold text-rose-800 ring-1 ring-rose-500/40 dark:bg-rose-500/20 dark:text-rose-300'
                        : 'bg-slate-500/10 text-slate-700 ring-1 ring-slate-500/25 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    Returns rate: <strong>{fmtPct(cyReturnsRatePct / 100)}</strong>
                    {pyReturnsRatePct !== null && (
                      <span className="opacity-80"> (PY {fmtPct(pyReturnsRatePct / 100)})</span>
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          {!hasActivity || rows.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-slate-200/70 p-6 text-center dark:border-slate-800/80">
              <Compass className="h-7 w-7 text-slate-400 dark:text-slate-500" />
              <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                No {DRIVER_LEVEL_LABEL[driverLevel].toLowerCase()} contribution data matches the current filters.
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
          ) : showTable ? (
            /* Full Ranked Table View */
            <div className="max-h-[340px] w-full overflow-auto rounded-xl border border-indigo-100/80 dark:border-slate-800">
              <table className="w-full border-collapse text-left text-xs tabular-nums">
                <thead className="sticky top-0 z-10 bg-indigo-50/95 text-[11px] font-extrabold uppercase tracking-wider text-indigo-950 backdrop-blur-md dark:bg-slate-900/95 dark:text-indigo-200">
                  <tr>
                    <th className="border-b border-indigo-200/70 px-3 py-2 dark:border-slate-800">
                      {DRIVER_LEVEL_LABEL[driverLevel]}
                    </th>
                    <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                      PY ({result.period.pyLabel})
                    </th>
                    <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                      CY ({result.period.cyLabel})
                    </th>
                    <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                      YoY Δ
                    </th>
                    <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                      YoY %
                    </th>
                    <th className="border-b border-indigo-200/70 px-3 py-2 text-right dark:border-slate-800">
                      Contrib. %
                    </th>
                    <th className="border-b border-indigo-200/70 px-2 py-2 text-center dark:border-slate-800">
                      Drill
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-100/60 dark:divide-slate-800/70">
                  {sortedTableRows.map((r) => {
                    const d = deriveRow(r.sums, metric);
                    const pp = metric === 'units' ? r.unitsContribPp : r.valueContribPp;
                    const isPos = d.delta >= 0;
                    return (
                      <tr key={r.id} className="hover:bg-indigo-500/5 dark:hover:bg-indigo-500/10">
                        <td className="px-3 py-1.5 font-semibold text-slate-900 dark:text-slate-100" dir="auto">
                          {r.label}
                          {r.brand && (
                            <span className="ml-1.5 rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                              {r.brand}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-right text-slate-600 dark:text-slate-300">
                          {fmtMetric(d.py, metric, false)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-bold text-slate-900 dark:text-white">
                          {fmtMetric(d.cy, metric, false)}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-bold ${
                            isPos ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                          }`}
                        >
                          {fmtSigned(d.delta, metric, false)}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-bold ${
                            isPos ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                          }`}
                        >
                          {fmtGrowth(d.growth)}
                        </td>
                        <td
                          className={`px-3 py-1.5 text-right font-bold ${
                            isPos ? 'text-up dark:text-up-light' : 'text-down dark:text-down-light'
                          }`}
                        >
                          {fmtPp(pp)}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleDrill(r.field as DrillField, r.value, r.label)}
                            title={`Filter dashboard by ${r.label}`}
                            aria-label={`Filter dashboard by ${r.label}`}
                            className="rounded-md p-1 text-indigo-500 hover:bg-indigo-500/15 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-200"
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Contribution Waterfall + Top 5 Ranked Lists */
            <div className="space-y-3">
              <div style={{ height: chartHeight }} className="w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={waterfall}
                    layout="vertical"
                    margin={{ top: 4, right: 86, left: 10, bottom: 2 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => fmtCompact(v)}
                      tick={{ fill: axisColor, fontSize: 10 }}
                      axisLine={{ stroke: gridColor }}
                      tickLine={false}
                      domain={[
                        0,
                        (dataMax: number) => (dataMax > 0 ? dataMax * 1.12 : 1),
                      ]}
                    />
                    <YAxis
                      type="category"
                      dataKey="shortLabel"
                      width={145}
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
                      formatter={(_: unknown, name: string, item: { payload?: WaterfallStep }) => {
                        if (name === 'spacer') return [null, null];
                        const step = item.payload;
                        if (!step) return ['', ''];
                        if (step.kind === 'py' || step.kind === 'cy') {
                          const ppSuffix = step.pp !== null ? ` (${fmtPp(step.pp)})` : '';
                          return [`${fmtMetric(step.delta, metric)}${ppSuffix}`, step.label];
                        }
                        return [
                          `${fmtSigned(step.delta, metric)} (${fmtPp(step.pp)}) · Click bar to filter`,
                          step.label,
                        ];
                      }}
                    />
                    <Bar dataKey="spacer" stackId="bridge" fill="transparent" isAnimationActive={false} />
                    <Bar
                      dataKey="span"
                      stackId="bridge"
                      radius={[4, 4, 4, 4]}
                      maxBarSize={18}
                      onClick={(data: WaterfallStep) => {
                        if (data?.drill) {
                          handleDrill(data.drill.field, data.drill.value, data.drill.label);
                        }
                      }}
                      className="cursor-pointer"
                    >
                      {waterfall.map((step) => (
                        <Cell key={step.id} fill={getStepFill(step)} />
                      ))}
                      <LabelList
                        content={(props: {
                          x?: number | string;
                          y?: number | string;
                          width?: number | string;
                          height?: number | string;
                          index?: number;
                        }) => {
                          const { x = 0, y = 0, width = 0, height = 0, index = 0 } = props;
                          const step = waterfall[index];
                          if (!step) return null;
                          const numX = Number(x);
                          const numY = Number(y);
                          const numW = Number(width);
                          const numH = Number(height);

                          const labelText =
                            step.kind === 'py'
                              ? fmtCompact(step.delta)
                              : step.kind === 'cy'
                                ? `${fmtCompact(step.delta)}${step.pp !== null ? ` (${fmtPp(step.pp)})` : ''}`
                                : fmtPp(step.pp);

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

              {/* Ranked Two-Column Strip: Top 5 Contributors & Top 5 Detractors */}
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                {/* Top 5 Contributors */}
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.04] p-2.5 dark:border-emerald-500/20 dark:bg-emerald-950/20">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                      <TrendingUp className="h-3.5 w-3.5" />
                      Top 5 Contributors ({DRIVER_LEVEL_LABEL[driverLevel]})
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      {METRIC_LABEL[metric]} Δ · Contrib. %
                    </span>
                  </div>
                  {ranked.contributors.length === 0 ? (
                    <p className="py-2 text-xs text-slate-500 dark:text-slate-400">
                      No positive contributors in this period.
                    </p>
                  ) : (
                    <ul className="divide-y divide-emerald-500/10 text-xs tabular-nums">
                      {ranked.contributors.map((r, idx) => {
                        const delta = metric === 'units' ? r.unitsDelta : r.valueDelta;
                        const pp = metric === 'units' ? r.unitsContribPp : r.valueContribPp;
                        return (
                          <li
                            key={r.id}
                            className="flex items-center justify-between gap-2 py-1"
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="w-4 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDrill(r.field as DrillField, r.value, r.label)}
                                className="truncate text-left font-semibold text-slate-800 hover:text-indigo-600 hover:underline dark:text-slate-100 dark:hover:text-cyan-300"
                                dir="auto"
                                title={`Filter by ${r.label}`}
                              >
                                {r.label}
                              </button>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="font-semibold text-slate-600 dark:text-slate-300">
                                {fmtSigned(delta, metric, false)}
                              </span>
                              <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                                {fmtPp(pp)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDrill(r.field as DrillField, r.value, r.label)}
                                title={`Filter dashboard by ${r.label}`}
                                aria-label={`Filter dashboard by ${r.label}`}
                                className="rounded p-0.5 text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400"
                              >
                                <Filter className="h-3 w-3" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                {/* Top 5 Detractors */}
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/[0.04] p-2.5 dark:border-rose-500/20 dark:bg-rose-950/20">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                      <TrendingDown className="h-3.5 w-3.5" />
                      Top 5 Detractors ({DRIVER_LEVEL_LABEL[driverLevel]})
                    </span>
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      {METRIC_LABEL[metric]} Δ · Contrib. %
                    </span>
                  </div>
                  {ranked.detractors.length === 0 ? (
                    <p className="py-2 text-xs text-slate-500 dark:text-slate-400">
                      No negative detractors in this period.
                    </p>
                  ) : (
                    <ul className="divide-y divide-rose-500/10 text-xs tabular-nums">
                      {ranked.detractors.map((r, idx) => {
                        const delta = metric === 'units' ? r.unitsDelta : r.valueDelta;
                        const pp = metric === 'units' ? r.unitsContribPp : r.valueContribPp;
                        return (
                          <li
                            key={r.id}
                            className="flex items-center justify-between gap-2 py-1"
                          >
                            <div className="flex min-w-0 items-center gap-1.5">
                              <span className="w-4 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDrill(r.field as DrillField, r.value, r.label)}
                                className="truncate text-left font-semibold text-slate-800 hover:text-indigo-600 hover:underline dark:text-slate-100 dark:hover:text-cyan-300"
                                dir="auto"
                                title={`Filter by ${r.label}`}
                              >
                                {r.label}
                              </button>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className="font-semibold text-slate-600 dark:text-slate-300">
                                {fmtSigned(delta, metric, false)}
                              </span>
                              <span className="rounded-md bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-bold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
                                {fmtPp(pp)}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleDrill(r.field as DrillField, r.value, r.label)}
                                title={`Filter dashboard by ${r.label}`}
                                aria-label={`Filter dashboard by ${r.label}`}
                                className="rounded p-0.5 text-rose-600 hover:bg-rose-500/15 dark:text-rose-400"
                              >
                                <Filter className="h-3 w-3" />
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
