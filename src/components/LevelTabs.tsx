import React from 'react';
import { Search, X } from 'lucide-react';
import { LEVELS, LEVEL_LABEL } from '../lib/aggregate';
import { StatusFilter, useDashboardStore } from '../store/useDashboardStore';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All rows' },
  { value: 'growing', label: 'Only growing' },
  { value: 'declining', label: 'Only declining' },
  { value: 'new', label: 'Only new' },
  { value: 'lost', label: 'Only lost (−100%)' },
];

const TOP_N_OPTIONS: { value: string; num: number | null; label: string }[] = [
  { value: '', num: null, label: 'All ranks' },
  { value: '10', num: 10, label: 'Top 10' },
  { value: '25', num: 25, label: 'Top 25' },
  { value: '50', num: 50, label: 'Top 50' },
  { value: '-10', num: -10, label: 'Bottom 10' },
  { value: '-25', num: -25, label: 'Bottom 25' },
];

interface LevelTabsProps {
  visibleCount: number;
  totalLevelCount: number;
}

export const LevelTabs: React.FC<LevelTabsProps> = ({ visibleCount, totalLevelCount }) => {
  const {
    level,
    setLevel,
    statusFilter,
    setStatusFilter,
    topN,
    setTopN,
    search,
    setSearch,
  } = useDashboardStore();

  return (
    <div className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/70 dark:border-slate-800/80 px-3.5 py-2.5">
      {/* Level Segmented Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label="Analysis level"
          className="inline-flex flex-wrap rounded-xl bg-slate-200/80 dark:bg-slate-800/90 p-1"
        >
          {LEVELS.map((lvl) => {
            const active = level === lvl;
            return (
              <button
                key={lvl}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setLevel(lvl)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                  active
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-sky-600 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white'
                }`}
              >
                {LEVEL_LABEL[lvl]}
              </button>
            );
          })}
        </div>

        <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          Showing <strong>{visibleCount.toLocaleString('en-US')}</strong> of{' '}
          {totalLevelCount.toLocaleString('en-US')} {LEVEL_LABEL[level].toLowerCase()}s
        </span>
      </div>

      {/* Right: Search, Status Quick Filter, Top N / Bottom N */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Search Input */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              level === 'customer'
                ? 'Search customer name, ID, brick...'
                : `Search ${LEVEL_LABEL[level].toLowerCase()}...`
            }
            aria-label={`Search ${LEVEL_LABEL[level]}`}
            className="w-52 sm:w-60 rounded-xl border border-slate-200/80 bg-white/70 py-1.5 pl-8 pr-7 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100"
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

        {/* Status Filter Pills */}
        <div
          role="group"
          aria-label="Growth status filter"
          className="inline-flex rounded-xl border border-slate-200/80 bg-white/70 p-0.5 text-xs dark:border-slate-700/80 dark:bg-slate-900/50"
        >
          {STATUS_OPTIONS.map((opt) => {
            const active = statusFilter === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setStatusFilter(opt.value)}
                aria-pressed={active}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Top N / Bottom N Selector */}
        <label className="sr-only" htmlFor="top-n-select">
          Top or Bottom N filter
        </label>
        <select
          id="top-n-select"
          value={topN === null ? '' : String(topN)}
          onChange={(e) => setTopN(e.target.value === '' ? null : Number(e.target.value))}
          className="rounded-xl border border-slate-200/80 bg-white/70 px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-sky-500 focus:outline-none dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-200"
        >
          {TOP_N_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-white dark:bg-slate-900">
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
