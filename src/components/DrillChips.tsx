import React from 'react';
import { FilterX, Navigation, X } from 'lucide-react';
import { useDashboardStore } from '../store/useDashboardStore';

export const DrillChips: React.FC = () => {
  const { drill, removeDrillChip, clearDrillChips } = useDashboardStore();
  if (drill.length === 0) return null;

  return (
    <div
      aria-label="Active drill-down filters"
      className="glass-panel flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-500/30 bg-sky-500/5 px-3.5 py-2"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
          <Navigation className="h-3.5 w-3.5" />
          Drill path:
        </span>
        {drill.map((chip, idx) => (
          <React.Fragment key={`${chip.field}:${chip.value}`}>
            {idx > 0 && <span className="text-xs text-slate-400">→</span>}
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-white/80 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm dark:bg-slate-900/80 dark:text-slate-100">
              <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                {chip.field}:
              </span>
              <span dir="auto">{chip.label}</span>
              <button
                type="button"
                onClick={() => removeDrillChip(idx)}
                aria-label={`Remove ${chip.field} = ${chip.label} drill filter`}
                className="rounded-full p-0.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-600 dark:hover:text-rose-300 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </React.Fragment>
        ))}
      </div>

      <button
        type="button"
        onClick={clearDrillChips}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <FilterX className="h-3.5 w-3.5" />
        Clear drill-down
      </button>
    </div>
  );
};
