import React, { Suspense, useEffect, useSyncExternalStore } from 'react';
import { AlertCircle, Database, Loader2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { DrillChips } from '../components/DrillChips';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Filters } from '../components/Filters';
import { KpiCards } from '../components/KpiCards';
import { LevelTable } from '../components/LevelTable';
import { Sidebar } from '../components/Sidebar';
import { TableJumpBar } from '../components/TableJumpBar';
import { TopBar } from '../components/TopBar';
import { LEVEL_LABEL, TABLE_LEVELS } from '../lib/aggregate';
import { getHashSnapshot, subscribeHash } from '../lib/hashState';
import { useDashboardStore } from '../store/useDashboardStore';

const MonthChart = React.lazy(() =>
  import('../components/MonthChart').then((m) => ({ default: m.MonthChart }))
);
const GrowthChart = React.lazy(() =>
  import('../components/GrowthChart').then((m) => ({ default: m.GrowthChart }))
);

function ChartSkeleton() {
  return (
    <div className="glass-panel flex h-[280px] w-full flex-col justify-between rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800/80">
      <div className="animate-pulse space-y-2">
        <div className="h-3.5 w-36 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-2.5 w-24 rounded bg-slate-200/60 dark:bg-slate-800/60" />
      </div>
      <div className="h-44 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />
    </div>
  );
}

export const Dashboard: React.FC = () => {
  const {
    meta,
    result,
    loading,
    progress,
    error,
    loadSampleData,
    theme,
    syncFromHash,
    analyzing,
  } = useDashboardStore(
    useShallow((s) => ({
      meta: s.meta,
      result: s.result,
      loading: s.loading,
      progress: s.progress,
      error: s.error,
      loadSampleData: s.loadSampleData,
      theme: s.theme,
      syncFromHash: s.syncFromHash,
      analyzing: s.analyzing,
    }))
  );

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  // Subscribe to URL hash navigation via useSyncExternalStore
  const hash = useSyncExternalStore(subscribeHash, getHashSnapshot, () => '');
  useEffect(() => {
    if (meta) {
      syncFromHash(hash);
    }
  }, [hash, meta, syncFromHash]);

  // Auto-load dataset on first mount
  useEffect(() => {
    void loadSampleData();
  }, [loadSampleData]);

  return (
    <div className="relative flex min-h-screen bg-gradient-to-br from-slate-100 via-sky-50/40 to-indigo-100/50 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/60 dark:text-slate-100">
      {/* Left Sidebar / Mobile Drawer */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />

        <main className="flex-1 space-y-3 p-3 sm:p-4">
          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="glass-panel rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-900 dark:text-rose-200"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                <div className="flex-1">
                  <h3 className="text-sm font-bold">Unable to load dataset</h3>
                  <p className="mt-1 text-xs">{error.message}</p>
                  {error.details && error.details.length > 0 && (
                    <ul className="mt-2 list-inside list-disc space-y-0.5 font-mono text-xs">
                      {error.details.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void loadSampleData()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
                    >
                      <Database className="h-3.5 w-3.5" />
                      Retry loading data
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Loading / Streaming Progress Skeleton */}
          {loading && (
            <div className="glass-panel flex flex-col items-center justify-center rounded-2xl border border-slate-200/70 dark:border-slate-800/80 py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
              <p className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                {progress?.phase === 'strings'
                  ? 'Reading shared strings dictionary...'
                  : progress?.phase === 'sheet'
                    ? `Streaming worksheet rows (${progress.rows.toLocaleString('en-US')} rows)...`
                    : progress?.phase === 'finalizing'
                      ? 'Building columnar indexes...'
                      : 'Loading dataset in Web Worker...'}
              </p>
              {progress && (
                <div className="mt-3 h-2 w-64 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <div
                    style={{ width: `${Math.max(5, Math.round(progress.ratio * 100))}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-600 transition-all duration-150"
                  />
                </div>
              )}
            </div>
          )}

          {/* Active Dashboard Content */}
          {!loading && meta && result && (
            <>
              <Filters />
              <DrillChips />
              <KpiCards />

              {/* Charts Row: Month-by-Month Trend + Top N YoY Growth Chart */}
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <ErrorBoundary title="Monthly Trend Chart">
                  <Suspense fallback={<ChartSkeleton />}>
                    <MonthChart />
                  </Suspense>
                </ErrorBoundary>
                <ErrorBoundary title="YoY Growth Chart">
                  <Suspense fallback={<ChartSkeleton />}>
                    <GrowthChart />
                  </Suspense>
                </ErrorBoundary>
              </div>

              {/* In-page jump bar */}
              <TableJumpBar />

              {/* Stacked Level Tables: SubType, Distributor, Territory, Customer */}
              <div className={`space-y-4 pt-1 transition-opacity duration-200 ${analyzing ? 'opacity-60 pointer-events-none' : 'opacity-100'}`}>
                {TABLE_LEVELS.map((lvl) => (
                  <ErrorBoundary key={lvl} title={`${LEVEL_LABEL[lvl]} Level Table`}>
                    <LevelTable level={lvl} />
                  </ErrorBoundary>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};
