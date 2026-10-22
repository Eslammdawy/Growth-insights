import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Database,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react';
import { ComparisonTable, EnrichedTableRow } from '../components/ComparisonTable';
import { DrillChips } from '../components/DrillChips';
import { Filters } from '../components/Filters';
import { GrowthChart } from '../components/GrowthChart';
import { KpiCards } from '../components/KpiCards';
import { LevelTabs } from '../components/LevelTabs';
import { MonthChart } from '../components/MonthChart';
import { Sidebar } from '../components/Sidebar';
import { TopBar } from '../components/TopBar';
import { AnalysisQuery } from '../lib/aggregate';
import { ExportContext, exportToCsv, exportToXlsx } from '../lib/export';
import { deriveRow } from '../lib/metrics';
import { useDashboardStore } from '../store/useDashboardStore';

export const Dashboard: React.FC = () => {
  const {
    meta,
    result,
    loading,
    progress,
    error,
    largeFileWarning,
    dismissLargeFileWarning,
    loadSampleData,
    loadFile,
    metric,
    level,
    line,
    period,
    txTypes,
    mainTypes,
    perLineFilters,
    drill,
    statusFilter,
    topN,
    search,
    expandedIds,
    theme,
    syncFromHash,
  } = useDashboardStore();

  const [dragging, setDragging] = useState(false);

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  // Listen to browser hash navigation
  useEffect(() => {
    const onHash = () => syncFromHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [syncFromHash]);

  // Auto-load converted sample dataset on first mount
  useEffect(() => {
    void loadSampleData();
  }, [loadSampleData]);

  // Enrich, filter (status, search), and slice (Top N / Bottom N) rows
  const enrichedRows = useMemo<EnrichedTableRow[]>(() => {
    if (!result) return [];
    const q = search.trim().toLowerCase();

    let list: EnrichedTableRow[] = result.rows.map((r) => {
      const derived = deriveRow(r.sums, result.totals, metric);
      const childrenEnriched = r.children?.map((ch) => ({
        row: ch,
        derived: deriveRow(ch.sums, result.totals, metric),
        isChild: true,
      }));
      return { row: r, derived, childrenEnriched };
    });

    if (statusFilter !== 'all') {
      list = list.filter((item) => item.derived.status === statusFilter);
    }

    if (q) {
      list = list.filter((item) => {
        const r = item.row;
        if (r.label.toLowerCase().includes(q)) return true;
        if (r.customerId && r.customerId.toLowerCase().includes(q)) return true;
        if (r.brick && r.brick.toLowerCase().includes(q)) return true;
        if (r.territory && r.territory.toLowerCase().includes(q)) return true;
        if (r.subType && r.subType.toLowerCase().includes(q)) return true;
        if (r.children?.some((c) => c.label.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    if (topN !== null && topN !== 0) {
      const sortedByDelta = [...list].sort(
        (a, b) => (b.derived.delta ?? -Infinity) - (a.derived.delta ?? -Infinity),
      );
      list = topN > 0 ? sortedByDelta.slice(0, topN) : sortedByDelta.slice(topN).reverse();
    }

    return list;
  }, [result, metric, statusFilter, search, topN]);

  const buildExportContext = (): ExportContext | null => {
    if (!result) return null;
    const lf = perLineFilters[line ?? '__ALL__'] ?? { brands: [], items: [] };
    const query: AnalysisQuery = {
      period,
      txTypes,
      line,
      brands: lf.brands,
      items: lf.items,
      mainTypes,
      drill,
      level,
    };
    return {
      query,
      result,
      metric,
      visibleRows: enrichedRows.map((e) => e.row),
      expandedIds: new Set(expandedIds),
      statusFilter,
      topN,
      search,
    };
  };

  const handleExportCsv = () => {
    const ctx = buildExportContext();
    if (ctx) exportToCsv(ctx);
  };

  const handleExportXlsx = () => {
    const ctx = buildExportContext();
    if (ctx) exportToXlsx(ctx);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) void loadFile(file);
      }}
      className="relative flex min-h-screen bg-gradient-to-br from-slate-100 via-sky-50/40 to-indigo-100/50 text-slate-900 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/60 dark:text-slate-100"
    >
      {/* Drag-and-drop overlay */}
      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
          <div className="glass-panel flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-sky-400 p-10 text-center">
            <UploadCloud className="h-12 w-12 text-sky-400 animate-bounce" />
            <p className="text-lg font-bold text-white">Drop .xlsx or .json.gz file to analyze</p>
            <p className="text-xs text-slate-300">
              Parsed directly in your browser using a streaming Web Worker
            </p>
          </div>
        </div>
      )}

      {/* Left Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onExportCsv={handleExportCsv} onExportXlsx={handleExportXlsx} />

        <main className="flex-1 space-y-3.5 p-4">
          {/* Large file warning banner */}
          {largeFileWarning && (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                <span>{largeFileWarning}</span>
              </div>
              <button
                type="button"
                onClick={dismissLargeFileWarning}
                aria-label="Dismiss warning"
                className="rounded-lg p-1 hover:bg-amber-500/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div
              role="alert"
              className="glass-panel rounded-2xl border border-rose-500/40 bg-rose-500/10 p-5 text-rose-900 dark:text-rose-200"
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
                      Load sample data
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

              {/* Charts Row: Month-by-Month Trend + Top N Horizontal Growth/Delta Chart */}
              <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
                <MonthChart />
                <GrowthChart rows={enrichedRows.map((e) => e.row)} />
              </div>

              <LevelTabs
                visibleCount={enrichedRows.length}
                totalLevelCount={result.rows.length}
              />

              <ComparisonTable enrichedRows={enrichedRows} />
            </>
          )}
        </main>
      </div>
    </div>
  );
};
