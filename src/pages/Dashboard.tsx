import React, { Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { AlertCircle, ChevronDown, ChevronUp, Database, Loader2, Sparkles } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { DrillChips } from '../components/DrillChips';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { Filters } from '../components/Filters';
import { KpiCards } from '../components/KpiCards';
import { LevelTable } from '../components/LevelTable';
import { TableJumpBar } from '../components/TableJumpBar';
import { TopBar } from '../components/TopBar';
import { LEVEL_LABEL, TABLE_LEVELS } from '../lib/aggregate';
import { getHashSnapshot, subscribeHash } from '../lib/hashState';
import { useDashboardStore } from '../store/useDashboardStore';

const GrowthDrivers = React.lazy(() =>
  import('../components/GrowthDrivers').then((m) => ({ default: m.GrowthDrivers }))
);
const MonthChart = React.lazy(() =>
  import('../components/MonthChart').then((m) => ({ default: m.MonthChart }))
);
const GrowthChart = React.lazy(() =>
  import('../components/GrowthChart').then((m) => ({ default: m.GrowthChart }))
);
const BubbleScatterChart = React.lazy(() =>
  import('../components/BubbleScatterChart').then((m) => ({ default: m.BubbleScatterChart }))
);
const CyTreemap = React.lazy(() =>
  import('../components/CyTreemap').then((m) => ({ default: m.CyTreemap }))
);
const CustomerDynamics = React.lazy(() =>
  import('../components/CustomerDynamics').then((m) => ({ default: m.CustomerDynamics }))
);

function ChartSkeleton() {
  return (
    <div className="glass-panel flex h-[340px] w-full flex-col justify-between rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800/80">
      <div className="animate-pulse space-y-2">
        <div className="h-3.5 w-36 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-2.5 w-24 rounded bg-slate-200/60 dark:bg-slate-800/60" />
      </div>
      <div className="h-56 w-full animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/50" />
    </div>
  );
}

export const Dashboard: React.FC = () => {
  const [insightsOpen, setInsightsOpen] = useState(true);

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
    <div className="relative flex min-h-screen bg-gradient-to-br from-indigo-50/90 via-sky-50/70 to-fuchsia-50/60 text-slate-900 dark:from-slate-950 dark:via-indigo-950/60 dark:to-slate-900 dark:text-slate-100">
      {/* Main Content Area (Full Width) */}
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
            <div className="glass-panel flex flex-col items-center justify-center rounded-2xl border border-slate-200/70 py-16 text-center dark:border-slate-800/80">
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

              {/* Growth Drivers Story Section (WI-1 & WI-3) */}
              <ErrorBoundary title="Growth Drivers">
                <Suspense fallback={<ChartSkeleton />}>
                  <GrowthDrivers />
                </Suspense>
              </ErrorBoundary>

              {/* Primary Charts Row: Composed Monthly Trend + Top N YoY Growth Chart */}
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

              {/* Collapsible Visual Insights Section */}
              <section
                id="section-insights"
                aria-label="Visual Insights"
                className="space-y-3 scroll-mt-28"
              >
                <div className="glass-panel flex items-center justify-between rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-indigo-50/80 via-violet-50/50 to-cyan-50/50 px-3.5 py-2 dark:border-slate-800/80 dark:from-slate-900/90 dark:via-indigo-950/40 dark:to-slate-900/90">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInsightsOpen((o) => !o)}
                      aria-expanded={insightsOpen}
                      aria-controls="insights-grid"
                      title={insightsOpen ? 'Collapse visual insights' : 'Expand visual insights'}
                      className="rounded-lg p-1 text-indigo-600 hover:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-slate-800"
                    >
                      {insightsOpen ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-2.5 py-0.5 text-xs font-extrabold tracking-wide text-white shadow-sm">
                      <Sparkles className="h-3.5 w-3.5" />
                      Visual Insights
                    </span>
                    <span className="hidden text-xs font-medium text-slate-600 dark:text-slate-300 sm:inline">
                      Bubble Scatter · CY Value Treemap
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInsightsOpen((o) => !o)}
                    className="rounded-xl bg-indigo-500/10 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-500/20 dark:text-indigo-300"
                  >
                    {insightsOpen ? 'Hide insights' : 'Show insights'}
                  </button>
                </div>

                {insightsOpen && (
                  <div
                    id="insights-grid"
                    className={`space-y-3 transition-opacity duration-200 ${
                      analyzing ? 'pointer-events-none opacity-60' : 'opacity-100'
                    }`}
                  >
                    {/* Row 1: Bubble Scatter + CY Value Treemap */}
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      <ErrorBoundary title="PY vs YoY % Bubble Scatter">
                        <Suspense fallback={<ChartSkeleton />}>
                          <BubbleScatterChart />
                        </Suspense>
                      </ErrorBoundary>
                      <ErrorBoundary title="CY Value Treemap">
                        <Suspense fallback={<ChartSkeleton />}>
                          <CyTreemap />
                        </Suspense>
                      </ErrorBoundary>
                    </div>
                  </div>
                )}
              </section>

              {/* In-page jump bar */}
              <TableJumpBar />

              {/* Stacked Level Tables: SubType, Distributor, Chains, Territory, Customer (+ CustomerDynamics above Customer) */}
              <div
                className={`space-y-4 pt-1 transition-opacity duration-200 ${
                  analyzing ? 'pointer-events-none opacity-60' : 'opacity-100'
                }`}
              >
                {TABLE_LEVELS.map((lvl) => (
                  <React.Fragment key={lvl}>
                    {lvl === 'customer' && (
                      <ErrorBoundary title="Customer Dynamics">
                        <Suspense fallback={<ChartSkeleton />}>
                          <CustomerDynamics />
                        </Suspense>
                      </ErrorBoundary>
                    )}
                    <ErrorBoundary title={`${LEVEL_LABEL[lvl]} Level Table`}>
                      <LevelTable level={lvl} />
                    </ErrorBoundary>
                  </React.Fragment>
                ))}
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
};
