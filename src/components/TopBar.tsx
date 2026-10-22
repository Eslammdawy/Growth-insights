import React, { useRef } from 'react';
import {
  Calendar,
  Database,
  Download,
  FileSpreadsheet,
  Moon,
  Sun,
  Upload,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { METRICS, METRIC_LABEL } from '../lib/metrics';
import { MONTH_ABBR, quarterMonths } from '../lib/periods';
import { useDashboardStore } from '../store/useDashboardStore';

interface TopBarProps {
  onExportCsv: () => void;
  onExportXlsx: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onExportCsv, onExportXlsx }) => {
  const {
    meta,
    sourceName,
    result,
    metric,
    setMetric,
    period,
    setPeriod,
    loadSampleData,
    loadFile,
    theme,
    toggleTheme,
    loading,
  } = useDashboardStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const years = meta?.availability.years ?? [2025, 2026];
  const qMonths = quarterMonths(period.quarter);

  return (
    <header className="glass-panel sticky top-0 z-30 border-b border-slate-200/70 dark:border-slate-800/80 px-4 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left: Brand & Period Banner */}
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
                Sales Growth Analyzer
              </span>
              {sourceName && (
                <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-slate-200/70 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  <Database className="h-3 w-3 text-sky-500" />
                  {sourceName}
                </span>
              )}
            </div>
            {/* Live Period Banner */}
            {result && (
              <div
                aria-live="polite"
                className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-sky-700 dark:text-sky-300"
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
          {/* Metric Segmented Control */}
          <div
            role="group"
            aria-label="Primary metric"
            className="inline-flex rounded-xl bg-slate-200/80 dark:bg-slate-800/90 p-1"
          >
            {METRICS.map((m) => {
              const active = metric === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMetric(m)}
                  aria-pressed={active}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    active
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-sky-600 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                  }`}
                >
                  {METRIC_LABEL[m]}
                </button>
              );
            })}
          </div>

          {/* Period Selector */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/60 px-2.5 py-1 text-xs dark:border-slate-700/80 dark:bg-slate-900/50">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <label className="sr-only" htmlFor="cy-year-select">
              Current Year
            </label>
            <select
              id="cy-year-select"
              value={period.cyYear}
              onChange={(e) => {
                const cy = Number(e.target.value);
                setPeriod({ cyYear: cy, pyYear: cy - 1 });
              }}
              className="bg-transparent font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
              title="Current Year (CY)"
            >
              {years.map((y) => (
                <option key={y} value={y} className="bg-white dark:bg-slate-900">
                  CY {y}
                </option>
              ))}
            </select>
            <span className="text-slate-400">vs</span>
            <label className="sr-only" htmlFor="py-year-select">
              Prior Year
            </label>
            <select
              id="py-year-select"
              value={period.pyYear}
              onChange={(e) => setPeriod({ pyYear: Number(e.target.value) })}
              className="bg-transparent font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
              title="Prior Year (PY)"
            >
              {[...new Set([period.cyYear - 1, ...years])].sort().map((y) => (
                <option key={y} value={y} className="bg-white dark:bg-slate-900">
                  PY {y}
                </option>
              ))}
            </select>

            <span className="mx-1 text-slate-300 dark:text-slate-700">|</span>

            <label className="sr-only" htmlFor="quarter-select">
              Quarter
            </label>
            <select
              id="quarter-select"
              value={period.quarter}
              onChange={(e) => setPeriod({ quarter: Number(e.target.value), month: null })}
              className="bg-transparent font-semibold text-slate-800 dark:text-slate-100 focus:outline-none"
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
                setPeriod({ month: e.target.value === '' ? null : Number(e.target.value) })
              }
              className="bg-transparent text-slate-600 dark:text-slate-300 focus:outline-none"
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
            className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200/80 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700/80 dark:bg-slate-900/50 dark:text-slate-200"
            title="When ON, Prior Year only includes months present in Current Year for a fair like-for-like comparison."
          >
            <input
              type="checkbox"
              checked={period.likeForLike}
              onChange={(e) => setPeriod({ likeForLike: e.target.checked })}
              className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
            <span>Like-for-like months</span>
          </label>
        </div>

        {/* Right: Data Upload, Sample, Exports, Theme */}
        <div className="flex items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.json,.gz"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
              e.target.value = '';
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            title="Upload .xlsx workbook or converted .json.gz"
          >
            <Upload className="h-3.5 w-3.5 text-sky-500" />
            <span className="hidden md:inline">Upload</span>
          </button>

          <button
            type="button"
            onClick={() => void loadSampleData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            title="Load pre-converted Q3-2026 sample dataset"
          >
            <Database className="h-3.5 w-3.5 text-indigo-500" />
            <span className="hidden lg:inline">Load sample data</span>
          </button>

          <button
            type="button"
            onClick={onExportCsv}
            disabled={!result}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            title="Export visible table (with all 3 metrics) to CSV"
          >
            <Download className="h-3.5 w-3.5 text-emerald-500" />
            <span>CSV</span>
          </button>

          <button
            type="button"
            onClick={onExportXlsx}
            disabled={!result}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-white disabled:opacity-40 dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            title="Export visible table (with all 3 metrics) to Excel (.xlsx)"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="rounded-xl border border-slate-200/80 bg-white/70 p-1.5 text-slate-700 hover:bg-white dark:border-slate-700/80 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </header>
  );
};
