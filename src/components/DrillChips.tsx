import React, { useTransition } from 'react';
import { FilterX, Navigation, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { DRILL_FIELD_LABEL } from '../lib/aggregate';
import { useDashboardStore } from '../store/useDashboardStore';

export const DrillChips: React.FC = () => {
  const [, startTransition] = useTransition();
  const { drill, removeDrillChip, clearDrillChips } = useDashboardStore(
    useShallow((s) => ({
      drill: s.drill,
      removeDrillChip: s.removeDrillChip,
      clearDrillChips: s.clearDrillChips,
    }))
  );
  if (drill.length === 0) return null;

  return (
    <div
      aria-label="Active drill-down filters"
      className="glass-panel relative z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-500/35 bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-cyan-500/10 px-3.5 py-2"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-indigo-700 dark:text-indigo-300">
          <Navigation className="h-3.5 w-3.5" />
          Drill path:
        </span>
        {drill.map((chip, idx) => (
          <React.Fragment key={`${chip.field}:${chip.value}`}>
            {idx > 0 && <span className="text-xs font-bold text-indigo-400">→</span>}
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-500/40 bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-sm dark:bg-slate-900/90 dark:text-slate-100">
              <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                {DRILL_FIELD_LABEL[chip.field]}:
              </span>
              <span dir="auto">{chip.label}</span>
              <button
                type="button"
                onClick={() => startTransition(() => removeDrillChip(idx))}
                aria-label={`Remove ${chip.field} = ${chip.label} drill filter`}
                className="rounded-full p-0.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-600 dark:hover:text-rose-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          </React.Fragment>
        ))}
      </div>

      <button
        type="button"
        onClick={() => startTransition(() => clearDrillChips())}
        className="inline-flex items-center gap-1 rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
      >
        <FilterX className="h-3.5 w-3.5" />
        Clear drill-down
      </button>
    </div>
  );
};
