import React, { useTransition } from 'react';
import {
  Calendar,
  Database,
  Moon,
  Sun,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { METRICS, METRIC_LABEL } from '../lib/metrics';
import { MONTH_ABBR, quarterMonths, PeriodSelection } from '../lib/periods';
import { useDashboardStore } from '../store/useDashboardStore';

export const TopBar: React.FC = () => {
  const [, startTransition] = useTransition();
  const {
    meta,
    sourceName,
    result,
    metric,
    setMetric,
    period,
    setPeriod,
    theme,
    toggleTheme,
    analyzing,
  } = useDashboardStore(
    useShallow((s) => ({
      meta: s.meta,
      sourceName: s.sourceName,
      result: s.result,
      metric: s.metric,
      setMetric: s.setMetric,
      period: s.period,
      setPeriod: s.setPeriod,
      theme: s.theme,
      toggleTheme: s.toggleTheme,
      analyzing: s.analyzing,
    }))
  );

  const updatePeriod = (patch: Partial<PeriodSelection>) => {
    startTransition(() => {
      setPeriod(patch);
    });
  };

  const years = meta?.availability.years ?? [2025, 2026];
  const qMonths = quarterMonths(period.quarter);

  return (
    <header className="glass-panel sticky top-0 z-40 border-b border-indigo-200/70 bg-gradient-to-r from-white/95 via-indigo-50/40 to-cyan-50/40 px-4 py-2.5 dark:border-indigo-500/25 dark:from-slate-900/95 dark:via-indigo-950/50 dark:to-slate-900/95">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-600 via-violet-500 to-cyan-500" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand & Period Banner */}
        <div className="flex flex-wrap items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}hpg-logo.jpg`}
            alt="HPG - Hefny Pharma Group"
            className="-my-2 h-12 w-auto shrink-0 rounded-md bg-white object-contain p-0.5 shadow-sm ring-1 ring-indigo-200/60 dark:ring-slate-700/80 sm:h-[52px]"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-gradient-to-r from-indigo-700 via-violet-600 to-cyan-600 bg-clip-text text-base font-extrabold tracking-tight text-transparent dark:from-indigo-300 dark:via-violet-300 dark:to-cyan-300">
                Sales Growth Analyzer
              </span>
              {sourceName && (
                <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-500/25 dark:bg-indigo-500/20 dark:text-indigo-300">
                  <Database className="h-3 w-3 text-indigo-500 dark:text-indigo-400" />
                  {sourceName}
                </span>
              )}
            </div>
            {/* Live Period Banner */}
            {result && (
              <div
                aria-live="polite"
                className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-cyan-300"
              >
                {result.period.complete ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                )}
                <span>{result.period.banner}</span>
              </div>
            )}
          </div>
        </div>

        {/* Center: Metric Segmented Toggle + Period Controls + Like-for-like */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Metric Segmented Control (Units vs Value only) */}
          <div
            role="group"
            aria-label="Primary metric"
            className="inline-flex rounded-xl border border-indigo-200/70 bg-indigo-50/80 p-1 dark:border-slate-700/80 dark:bg-slate-800/90"
          >
            {METRICS.map((m) => {
              const active = metric === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  aria-pressed={active}
                  className={`rounded-lg px-3 py-1 text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    active
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                      : 'text-slate-600 hover:text-indigo-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {METRIC_LABEL[m]}
                </button>
              );
            })}
          </div>

          {/* Period Selector */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-indigo-200/80 bg-white/80 px-2.5 py-1 text-xs shadow-sm dark:border-slate-700/80 dark:bg-slate-900/70">
            <Calendar className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
            <label className="sr-only" htmlFor="cy-year-select">
              Current Year
            </label>
            <select
              id="cy-year-select"
              value={period.cyYear}
              onChange={(e) => {
                const cy = Number(e.target.value);
                updatePeriod({ cyYear: cy, pyYear: cy - 1 });
              }}
              className="bg-transparent font-bold text-indigo-950 dark:text-cyan-200 focus:outline-none"
              title="Current Year (CY)"
            >
              {years.map((y) => (
                <option key={y} value={y} className="bg-white dark:bg-slate-900">
                  CY {y}
                </option>
              ))}
            </select>
            <span className="font-semibold text-indigo-400">vs</span>
            <label className="sr-only" htmlFor="py-year-select">
              Prior Year
            </label>
            <select
              id="py-year-select"
              value={period.pyYear}
              onChange={(e) => updatePeriod({ pyYear: Number(e.target.value) })}
              className="bg-transparent font-bold text-violet-800 dark:text-violet-300 focus:outline-none"
              title="Prior Year (PY)"
            >
              {[...new Set([period.cyYear - 1, ...years])].sort().map((y) => (
                <option key={y} value={y} className="bg-white dark:bg-slate-900">
                  PY {y}
                </option>
              ))}
            </select>

            <span className="mx-1 text-indigo-200 dark:text-slate-700">|</span>

            <label className="sr-only" htmlFor="quarter-select">
              Quarter
            </label>
            <select
              id="quarter-select"
              value={period.quarter}
              onChange={(e) => updatePeriod({ quarter: Number(e.target.value), month: null })}
              className="bg-transparent font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
            >
              {[1, 2, 3, 4].map((q) => (
                <option key={q} value={q} className="bg-white dark:bg-slate-900">
                  Q{q}
                </option>
              ))}
            </select>

            <label className="sr-only" htmlFor="month-select">
              Single Month Filter
            </label>
            <select
              id="month-select"
              value={period.month ?? ''}
              onChange={(e) =>
                updatePeriod({ month: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="bg-transparent font-medium text-slate-600 dark:text-slate-300 focus:outline-none"
              title="All months in quarter or single month"
            >
              <option value="" className="bg-white dark:bg-slate-900">
                All Q{period.quarter} months
              </option>
              {qMonths.map((m) => (
                <option key={m} value={m} className="bg-white dark:bg-slate-900">
                  {MONTH_ABBR[m - 1]} only
                </option>
              ))}
            </select>
          </div>

          {/* Like-for-like Toggle */}
          <label
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-indigo-200/80 bg-white/80 px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-200"
            title="When ON, Prior Year only includes months present in Current Year for a fair like-for-like comparison."
          >
            <input
              type="checkbox"
              checked={period.likeForLike}
              onChange={(e) => updatePeriod({ likeForLike: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Like-for-like months</span>
          </label>
        </div>

        {/* Right: Theme Toggle moved to Header */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded-xl border border-indigo-200/80 bg-white/80 p-2 text-indigo-700 shadow-sm hover:bg-white dark:border-slate-700/80 dark:bg-slate-800/80 dark:text-amber-300 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Analyzing Progress Bar */}
      {analyzing && (
        <div
          role="progressbar"
          aria-label="Analyzing data"
          className="absolute bottom-0 left-0 right-0 h-0.5 overflow-hidden bg-indigo-200/50 dark:bg-indigo-950/50"
        >
          <div className="h-full w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-500 animate-indeterminate" />
        </div>
      )}
    </header>
  );
};
