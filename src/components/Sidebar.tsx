import React, { useMemo, useRef, useTransition } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  Search,
  TrendingDown,
  TrendingUp,
  Sparkles,
  Minus,
  X,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { fmtCompact, fmtGrowth } from '../lib/format';
import { Growth, metricCells } from '../lib/metrics';
import { useDashboardStore } from '../store/useDashboardStore';

function GrowthBadge({ g }: { g: Growth }) {
  const text = fmtGrowth(g);
  if (g.kind === 'new') {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-500/30 dark:bg-amber-500/25 dark:text-amber-300 tabular-nums">
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
      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
        isUp
          ? 'bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 dark:bg-emerald-500/25 dark:text-emerald-300'
          : isDown
            ? 'bg-rose-500/15 text-rose-700 ring-1 ring-rose-500/30 dark:bg-rose-500/25 dark:text-rose-300'
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
  const [, startTransition] = useTransition();
  const navRef = useRef<HTMLElement>(null);

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
    mobileDrawerOpen,
    setMobileDrawerOpen,
  } = useDashboardStore(
    useShallow((s) => ({
      meta: s.meta,
      result: s.result,
      line: s.line,
      setLine: s.setLine,
      sidebarCollapsed: s.sidebarCollapsed,
      setSidebarCollapsed: s.setSidebarCollapsed,
      sidebarSearch: s.sidebarSearch,
      setSidebarSearch: s.setSidebarSearch,
      perLineFilters: s.perLineFilters,
      mobileDrawerOpen: s.mobileDrawerOpen,
      setMobileDrawerOpen: s.setMobileDrawerOpen,
    }))
  );

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
    let targetIdx = -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      targetIdx = (idx + 1) % tabOrder.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      targetIdx = (idx - 1 + tabOrder.length) % tabOrder.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      targetIdx = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      targetIdx = tabOrder.length - 1;
    }
    if (targetIdx >= 0) {
      const buttons = navRef.current?.querySelectorAll<HTMLButtonElement>('button[data-line-btn]');
      buttons?.[targetIdx]?.focus();
    }
  };

  const selectLine = (l: string | null) => {
    startTransition(() => {
      setLine(l);
    });
    setMobileDrawerOpen(false);
  };

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileDrawerOpen && (
        <div
          role="presentation"
          onClick={() => setMobileDrawerOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        aria-label="Sales Lines navigation"
        className={`glass-panel shrink-0 flex-col border-r border-indigo-200/70 dark:border-slate-800/80 transition-all duration-200 ${
          mobileDrawerOpen
            ? 'fixed inset-y-0 left-0 z-50 flex w-72 shadow-2xl'
            : `hidden md:flex ${sidebarCollapsed ? 'w-16' : 'w-72'}`
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-indigo-200/60 bg-gradient-to-r from-indigo-50/70 via-violet-50/40 to-transparent px-3 py-3.5 dark:border-slate-800/70 dark:from-indigo-950/40">
          {(!sidebarCollapsed || mobileDrawerOpen) && (
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 via-violet-600 to-cyan-500 text-white shadow-sm">
                <Layers className="h-4 w-4" />
              </div>
              <div className="truncate">
                <h1 className="truncate text-sm font-extrabold tracking-tight text-indigo-950 dark:text-white">
                  Sales Lines
                </h1>
                <p className="truncate text-[11px] font-medium text-indigo-600/80 dark:text-indigo-300/80">
                  Sorted by CY Value
                </p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(false)}
              aria-label="Close sidebar"
              className="rounded-lg p-1.5 text-slate-500 hover:bg-indigo-500/10 hover:text-indigo-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white md:hidden"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className="hidden md:inline-flex rounded-lg p-1.5 text-indigo-600 hover:bg-indigo-500/10 hover:text-indigo-900 dark:text-indigo-300 dark:hover:bg-slate-800 dark:hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Search */}
        {(!sidebarCollapsed || mobileDrawerOpen) && (
          <div className="px-3 pt-2.5 pb-1.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-indigo-400" />
              <input
                type="search"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="Filter lines..."
                aria-label="Filter sales lines"
                className="w-full rounded-xl border border-indigo-200/80 bg-white/80 py-1.5 pl-8 pr-2.5 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700/80 dark:bg-slate-900/60 dark:text-slate-100"
              />
            </div>
          </div>
        )}

        {/* Line Navigation */}
        <nav
          ref={navRef}
          aria-label="Sales Lines"
          className="flex-1 space-y-1 overflow-y-auto px-2 py-2"
        >
          {/* All Lines */}
          {(() => {
            const active = line === null;
            const f = perLineFilters['__ALL__'];
            const fCount = (f?.brands.length ?? 0) + (f?.items.length ?? 0);
            return (
              <button
                data-line-btn
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => selectLine(null)}
                onKeyDown={(e) => handleKeyDown(e, null)}
                title={`All Lines — CY Value: EGP ${fmtCompact(allLinesCells.sums.cyV)} (${fmtGrowth(allLinesCells.cells.growth)})`}
                className={`group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  active
                    ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 font-semibold text-white shadow-md'
                    : 'text-slate-700 hover:bg-indigo-500/10 dark:text-slate-300 dark:hover:bg-slate-800/70'
                }`}
              >
                {sidebarCollapsed && !mobileDrawerOpen ? (
                  <span className="mx-auto font-bold">ALL</span>
                ) : (
                  <>
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-bold">All Lines</span>
                        {fCount > 0 && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                              active ? 'bg-white/25 text-white' : 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                            }`}
                          >
                            {fCount}
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-[11px] font-medium tabular-nums ${
                          active ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        EGP {fmtCompact(allLinesCells.sums.cyV)}
                      </div>
                    </div>
                    <div className={active ? 'rounded-full bg-white/95 p-0.5 shadow-sm' : ''}>
                      <GrowthBadge g={allLinesCells.cells.growth} />
                    </div>
                  </>
                )}
              </button>
            );
          })()}

          <div className="my-1.5 border-t border-indigo-200/60 dark:border-slate-800/70" />

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
                data-line-btn
                key={item.name}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => selectLine(item.name)}
                onKeyDown={(e) => handleKeyDown(e, item.name)}
                title={`${item.name} — CY Value: EGP ${fmtCompact(item.sums.cyV)} (${fmtGrowth(item.cells.growth)})`}
                className={`group flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  active
                    ? 'bg-gradient-to-r from-indigo-600 via-violet-600 to-cyan-600 font-semibold text-white shadow-md'
                    : 'text-slate-700 hover:bg-indigo-500/10 dark:text-slate-300 dark:hover:bg-slate-800/70'
                }`}
              >
                {sidebarCollapsed && !mobileDrawerOpen ? (
                  <span className="mx-auto font-bold">{shortCode}</span>
                ) : (
                  <>
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium" dir="auto">
                          {item.name}
                        </span>
                        {fCount > 0 && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                              active ? 'bg-white/25 text-white' : 'bg-indigo-500/20 text-indigo-700 dark:text-indigo-300'
                            }`}
                          >
                            {fCount}
                          </span>
                        )}
                      </div>
                      <div
                        className={`text-[11px] font-medium tabular-nums ${
                          active ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        EGP {fmtCompact(item.sums.cyV)}
                      </div>
                    </div>
                    <div className={active ? 'rounded-full bg-white/95 p-0.5 shadow-sm' : ''}>
                      <GrowthBadge g={item.cells.growth} />
                    </div>
                  </>
                )}
              </button>
            );
          })}
        </nav>

        {(!sidebarCollapsed || mobileDrawerOpen) && (
          <div className="border-t border-indigo-200/60 bg-indigo-50/40 px-3 py-2 text-[11px] font-medium text-indigo-700/80 dark:border-slate-800/70 dark:bg-slate-900/40 dark:text-indigo-300/70">
            {sortedLines.length} lines · click to filter
          </div>
        )}
      </aside>
    </>
  );
};
