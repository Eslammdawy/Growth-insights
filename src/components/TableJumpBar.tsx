import React from 'react';
import { Layers, Sparkles } from 'lucide-react';
import { LEVEL_LABEL, TABLE_LEVELS, Level } from '../lib/aggregate';

const JUMP_PILL_STYLE: Record<Level, string> = {
  subtype:
    'border-indigo-500/30 bg-indigo-500/10 text-indigo-800 hover:bg-indigo-600 hover:text-white dark:text-indigo-200 dark:hover:bg-indigo-600',
  distributor:
    'border-cyan-500/30 bg-cyan-500/10 text-cyan-800 hover:bg-cyan-600 hover:text-white dark:text-cyan-200 dark:hover:bg-cyan-600',
  territory:
    'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-600 hover:text-white dark:text-emerald-200 dark:hover:bg-emerald-600',
  brick:
    'border-amber-500/30 bg-amber-500/10 text-amber-800 hover:bg-amber-600 hover:text-white dark:text-amber-200 dark:hover:bg-amber-600',
  customer:
    'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-800 hover:bg-fuchsia-600 hover:text-white dark:text-fuchsia-200 dark:hover:bg-fuchsia-600',
};

export const TableJumpBar: React.FC = () => {
  const scrollToElement = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
            onClick={() => scrollToElement('section-insights')}
            className="inline-flex items-center gap-1 rounded-xl border border-violet-500/35 bg-violet-500/10 px-3 py-1 font-bold text-violet-800 shadow-sm transition-all hover:bg-violet-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-violet-200 dark:hover:bg-violet-600"
          >
            <Sparkles className="h-3 w-3" />
            Insights
          </button>
          {TABLE_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => scrollToElement(`table-${lvl}`)}
              className={`rounded-xl border px-3 py-1 font-bold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${JUMP_PILL_STYLE[lvl]}`}
            >
              {LEVEL_LABEL[lvl]}
            </button>
          ))}
        </div>
      </div>
      <span className="hidden rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300 md:inline">
        Visual insights + 4 levels stacked
      </span>
    </nav>
  );
};
