import React, { useCallback, useState } from 'react';
import { ArrowUp, Compass, FileSpreadsheet, Layers, Loader2 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { LEVEL_LABEL, TABLE_LEVELS, Level } from '../lib/aggregate';
import { exportAllLevelsToExcel } from '../lib/exportExcel';
import { useDashboardStore } from '../store/useDashboardStore';

const JUMP_PILL_STYLE: Record<Level, string> = {
  subtype:
    'border-indigo-500/30 bg-indigo-500/10 text-indigo-800 hover:bg-indigo-600 hover:text-white dark:text-indigo-200 dark:hover:bg-indigo-600',
  distributor:
    'border-cyan-500/30 bg-cyan-500/10 text-cyan-800 hover:bg-cyan-600 hover:text-white dark:text-cyan-200 dark:hover:bg-cyan-600',
  chain:
    'border-purple-500/30 bg-purple-500/10 text-purple-800 hover:bg-purple-600 hover:text-white dark:text-purple-200 dark:hover:bg-purple-600',
  territory:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-600 hover:text-white dark:text-emerald-200 dark:hover:bg-emerald-600',
  brick:
    'border-amber-500/30 bg-amber-500/10 text-amber-800 hover:bg-amber-600 hover:text-white dark:text-amber-200 dark:hover:bg-amber-600',
  customer:
    'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-800 hover:bg-fuchsia-600 hover:text-white dark:text-fuchsia-200 dark:hover:bg-fuchsia-600',
};

export const TableJumpBar: React.FC = () => {
  const { result, metric, txTypes, showReturns, analyzing, fetchAllLevelsItems } = useDashboardStore(
    useShallow((s) => ({
      result: s.result,
      metric: s.metric,
      txTypes: s.txTypes,
      showReturns: s.showReturns,
      analyzing: s.analyzing,
      fetchAllLevelsItems: s.fetchAllLevelsItems,
    })),
  );
  const [exporting, setExporting] = useState(false);

  const bothTxTypes = txTypes.includes('Sales') && txTypes.includes('Return Sales');
  const effectiveShowReturns = showReturns && bothTxTypes;

  const handleExportAllLevels = useCallback(async () => {
    if (!result || exporting || analyzing) return;
    setExporting(true);
    try {
      const itemsByLevel = await fetchAllLevelsItems(TABLE_LEVELS);
      if (!itemsByLevel) return;
      exportAllLevelsToExcel({
        levels: TABLE_LEVELS,
        levelsData: result.levels,
        itemsByLevel,
        period: result.period,
        metric,
        portfolioTotals: result.totals,
        portfolioGrossTotals: result.grossTotals,
        showReturns: effectiveShowReturns,
      });
    } catch (err) {
      console.error('Failed to export all levels to Excel:', err);
    } finally {
      setExporting(false);
    }
  }, [result, exporting, analyzing, fetchAllLevelsItems, metric, effectiveShowReturns]);

  const scrollToElement = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const jumpToLevel = (lvl: Level) => {
    window.dispatchEvent(new CustomEvent('expand-level', { detail: lvl }));
    requestAnimationFrame(() => {
      scrollToElement(`table-${lvl}`);
    });
  };

  const jumpToDrivers = () => {
    window.dispatchEvent(new CustomEvent('expand-drivers'));
    requestAnimationFrame(() => {
      scrollToElement('section-drivers');
    });
  };

  const jumpToCustomerDynamics = () => {
    window.dispatchEvent(new CustomEvent('expand-customer-dynamics'));
    requestAnimationFrame(() => {
      scrollToElement('section-customer-dynamics');
    });
  };

  return (
    <nav
      aria-label="Table jump navigation"
      className="glass-panel sticky top-[57px] z-20 flex items-center justify-between overflow-x-auto rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-white/90 via-indigo-50/50 to-cyan-50/50 px-3.5 py-2 shadow-sm dark:border-slate-800/80 dark:from-slate-900/90 dark:via-indigo-950/50 dark:to-slate-900/90 backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-300 sm:inline-flex">
          <Layers className="h-3.5 w-3.5 text-indigo-500" />
          Jump to:
        </span>
        <div className="flex items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={() => scrollToElement('section-filters')}
            className="inline-flex items-center gap-1 rounded-xl border border-indigo-500/35 bg-indigo-500/10 px-3 py-1 font-bold text-indigo-800 shadow-sm transition-all hover:bg-indigo-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-indigo-200 dark:hover:bg-indigo-600"
          >
            <Compass className="h-3 w-3" />
            Filters / Top
            <ArrowUp className="h-3 w-3 opacity-80" />
          </button>
          <button
            type="button"
            onClick={jumpToDrivers}
            className="inline-flex items-center gap-1 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-1 font-bold text-emerald-800 shadow-sm transition-all hover:bg-emerald-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-emerald-200 dark:hover:bg-emerald-600"
          >
            <Compass className="h-3 w-3" />
            Drivers
          </button>
          {TABLE_LEVELS.map((lvl) => (
            <React.Fragment key={lvl}>
              {lvl === 'customer' && (
                <button
                  type="button"
                  onClick={jumpToCustomerDynamics}
                  className="rounded-xl border border-fuchsia-500/35 bg-fuchsia-500/10 px-3 py-1 font-bold text-fuchsia-800 shadow-sm transition-all hover:bg-fuchsia-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-fuchsia-200 dark:hover:bg-fuchsia-600"
                >
                  Customer Dynamics
                </button>
              )}
              <button
                type="button"
                onClick={() => jumpToLevel(lvl)}
                className={`rounded-xl border px-3 py-1 font-bold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${JUMP_PILL_STYLE[lvl]}`}
              >
                {LEVEL_LABEL[lvl]}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-2">
        <span className="hidden rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 md:inline">
          4 levels stacked
        </span>
        <button
          type="button"
          onClick={() => void handleExportAllLevels()}
          disabled={exporting || analyzing || !result}
          title="Export all 4 levels (each in a separate Excel tab) with per-product breakdown"
          aria-label="Export all levels to Excel"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 to-teal-500/15 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm transition-all hover:from-emerald-500/25 hover:to-teal-500/25 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-500/30 dark:text-emerald-300"
        >
          {exporting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600 dark:text-emerald-400" />
          ) : (
            <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          <span>{exporting ? 'Exporting…' : 'Export All Levels'}</span>
        </button>
      </div>
    </nav>
  );
};
