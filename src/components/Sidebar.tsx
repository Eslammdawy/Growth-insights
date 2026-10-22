import React, { useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Search,
  TrendingDown,
  TrendingUp,
  Sparkles,
  Minus,
} from 'lucide-react';
import { fmtCompact, fmtGrowth } from '../lib/format';
import { Growth, metricCells } from '../lib/metrics';
import { useDashboardStore } from '../store/useDashboardStore';

function GrowthBadge({ g }: { g: Growth }) {
  const text = fmtGrowth(g);
  if (g.kind === 'new') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-300 tabular-nums">
        <Sparkles className="h-2.5 w-2.5" />
        New
      </span>
    );
  }
  if (g.kind === 'none') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums">
        <Minus className="h-2.5 w-2.5" />–
      </span>
    );
  }
  const val = g.kind === 'lost' ? -1 : g.value;
  const isUp = val > 0;
  const isDown = val < 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
        isUp
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : isDown
            ? 'bg-amber-600/15 text-amber-800 dark:text-amber-300'
            : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
      }`}
    >
      {isUp ? (
        <TrendingUp className="h-2.5 w-2.5 shrink-0" />
      ) : isDown ? (
        <TrendingDown className="h-2.5 w-2.5 shrink-0" />
      ) : null}
      {text}
    </span>
  );
}

export const Sidebar: React.FC = () => {
  const {
    meta,
    result,
    line,
    setLine,
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarSearch,
    setSidebarSearch,
    perLineFilters,
  } = useDashboardStore();

  const sortedLines = useMemo(() => {
    const allLines = meta?.lines ?? [];
    const byLine = new Map((result?.lines ?? []).map((l) => [l.line, l.sums]));
    const items = allLines.map((name) => {
      const sums = byLine.get(name) ?? { pyQ: 0, pyV: 0, cyQ: 0, cyV: 0 };
      const cells = metricCells(sums, 'value');
      return { name, sums, cells };
    });
    items.sort((a, b) => b.sums.cyV - a.sums.cyV || a.name.localeCompare(b.name));
    const q = sidebarSearch.trim().toLowerCase();
    return q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  }, [meta, result, sidebarSearch]);

  const allLinesCells = useMemo(() => {
    const sums = result?.linesTotal ?? { pyQ: 0, pyV: 0, cyQ: 0, cyV: 0 };
    return { sums, cells: metricCells(sums, 'value') };
  }, [result]);

  const tabOrder = useMemo(() => [null, ...sortedLines.map((l) => l.name)], [sortedLines]);

  const handleKeyDown = (e: React.KeyboardEvent, current: string | null) => {
    const idx = tabOrder.indexOf(current);
    if (idx < 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = tabOrder[(idx + 1) % tabOrder.length];
      setLine(next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = tabOrder[(idx - 1 + tabOrder.length) % tabOrder.length];
      setLine(prev);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setLine(null);
    } else if (e.key === 'End') {
      e.preventDefault();
      setLine(tabOrder[tabOrder.length - 1]);
    }
  };

  return (
    <aside
      aria-label="Sales Lines navigation"
      className={`glass-panel flex shrink-0 flex-col border-r border-slate-200/70 dark:border-slate-800/80 transition-all duration-200 ${
        sidebarCollapsed ? 'w-16' : 'w-68'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/70 px-3 py-3.5">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm">
              <Layers className="h-4 w-4" />
            </div>
            <div className="truncate">
              <h1 className="truncate text-sm font-bold tracking-tight text-slate-900 dark:text-white">
                Sales Lines
              </h1>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                Sorted by CY Value
              </p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-sky-500"
        >
          {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Search */}
      {!sidebarCollapsed && (
        <div className="px-3 pt-2.5 pb-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder="Filter lines..."
              aria-label="Filter sales lines"
              className="w-full rounded-lg border border-slate-200/80 bg-white/60 py-1.5 pl-8 pr-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-sky-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700/80 dark:bg-slate-900/50 dark:text-slate-100"
            />
          </div>
        </div>
      )}

      {/* Line tabs */}
      <nav
        role="tablist"
        aria-orientation="vertical"
        className="flex-1 space-y-1 overflow-y-auto px-2 py-2"
      >
        {/* All Lines tab */}
        {(() => {
          const active = line === null;
          const f = perLineFilters['__ALL__'];
          const fCount = (f?.brands.length ?? 0) + (f?.items.length ?? 0);
          return (
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setLine(null)}
              onKeyDown={(e) => handleKeyDown(e, null)}
              title={`All Lines — CY Value: EGP ${fmtCompact(allLinesCells.sums.cyV)} (${fmtGrowth(allLinesCells.cells.growth)})`}
              className={`group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-all focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                active
                  ? 'bg-gradient-to-r from-sky-600 to-indigo-600 font-semibold text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800/70'
              }`}
            >
              {sidebarCollapsed ? (
                <span className="mx-auto font-bold">ALL</span>
              ) : (
                <>
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">All Lines</span>
                      {fCount > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                            active ? 'bg-white/25 text-white' : 'bg-sky-500/20 text-sky-600 dark:text-sky-300'
                          }`}
                        >
                          {fCount}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[11px] tabular-nums ${
                        active ? 'text-sky-100' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      EGP {fmtCompact(allLinesCells.sums.cyV)}
                    </div>
                  </div>
                  <div className={active ? 'rounded-full bg-white/90 p-0.5' : ''}>
                    <GrowthBadge g={allLinesCells.cells.growth} />
                  </div>
                </>
              )}
            </button>
          );
        })()}

        <div className="my-1.5 border-t border-slate-200/60 dark:border-slate-800/70" />

        {sortedLines.map((item) => {
          const active = line === item.name;
          const f = perLineFilters[item.name];
          const fCount = (f?.brands.length ?? 0) + (f?.items.length ?? 0);
          const shortCode = item.name
            .split(/\s+/)
            .map((w) => w[0])
            .join('')
            .toUpperCase()
            .slice(0, 3);
          return (
            <button
              key={item.name}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setLine(item.name)}
              onKeyDown={(e) => handleKeyDown(e, item.name)}
              title={`${item.name} — CY Value: EGP ${fmtCompact(item.sums.cyV)} (${fmtGrowth(item.cells.growth)})`}
              className={`group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-all focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                active
                  ? 'bg-gradient-to-r from-sky-600 to-indigo-600 font-semibold text-white shadow-sm'
                  : 'text-slate-700 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800/70'
              }`}
            >
              {sidebarCollapsed ? (
                <span className="mx-auto font-bold">{shortCode}</span>
              ) : (
                <>
                  <div className="min-w-0 flex-1 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate" dir="auto">
                        {item.name}
                      </span>
                      {fCount > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                            active ? 'bg-white/25 text-white' : 'bg-sky-500/20 text-sky-600 dark:text-sky-300'
                          }`}
                        >
                          {fCount}
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[11px] tabular-nums ${
                        active ? 'text-sky-100' : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      EGP {fmtCompact(item.sums.cyV)}
                    </div>
                  </div>
                  <div className={active ? 'rounded-full bg-white/90 p-0.5' : ''}>
                    <GrowthBadge g={item.cells.growth} />
                  </div>
                </>
              )}
            </button>
          );
        })}
      </nav>

      {!sidebarCollapsed && (
        <div className="border-t border-slate-200/60 dark:border-slate-800/70 px-3 py-2 text-[11px] text-slate-400 dark:text-slate-500">
          Badges reflect Value YoY % (global filters + drill chips).
        </div>
      )}
    </aside>
  );
};
