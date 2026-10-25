import React from 'react';
import { Layers } from 'lucide-react';
import { LEVEL_LABEL, LEVELS, Level } from '../lib/aggregate';

export const TableJumpBar: React.FC = () => {
  const scrollToTable = (level: Level) => {
    const el = document.getElementById(`table-${level}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <nav
      aria-label="Table jump navigation"
      className="glass-panel sticky top-[57px] z-20 flex items-center justify-between overflow-x-auto rounded-2xl border border-slate-200/70 px-3.5 py-1.5 shadow-sm dark:border-slate-800/80 backdrop-blur-md"
    >
      <div className="flex items-center gap-2">
        <span className="hidden items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 sm:inline-flex">
          <Layers className="h-3.5 w-3.5 text-sky-500" />
          Jump to:
        </span>
        <div className="flex items-center gap-1 text-xs">
          {LEVELS.map((lvl, idx) => (
            <React.Fragment key={lvl}>
              {idx > 0 && <span className="text-slate-300 dark:text-slate-700 select-none">·</span>}
              <button
                type="button"
                onClick={() => scrollToTable(lvl)}
                className="rounded-lg px-2 py-1 font-semibold text-slate-700 hover:bg-sky-500/15 hover:text-sky-600 dark:text-slate-300 dark:hover:bg-sky-500/15 dark:hover:text-sky-400 transition-colors focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {LEVEL_LABEL[lvl]}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>
      <span className="hidden text-[11px] text-slate-400 dark:text-slate-500 md:inline">
        5 levels stacked
      </span>
    </nav>
  );
};
