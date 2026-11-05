import React from 'react';
import { Info } from 'lucide-react';

export interface KpiInfoTooltipProps {
  id: string;
  title: string;
  meaning: string;
  formula: string;
  alignClass?: string;
  iconToneClass?: string;
}

export const KpiInfoTooltip: React.FC<KpiInfoTooltipProps> = ({
  id,
  title,
  meaning,
  formula,
  alignClass = 'left-0',
  iconToneClass = 'text-slate-400 hover:bg-indigo-500/15 hover:text-indigo-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-indigo-300',
}) => (
  <div className="group/info inline-flex shrink-0 items-center">
    <button
      type="button"
      aria-label={`About ${title}`}
      aria-describedby={id}
      className={`inline-flex h-4 w-4 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-500 ${iconToneClass}`}
    >
      <Info className="h-3.5 w-3.5" />
    </button>
    <div
      id={id}
      role="tooltip"
      className={`pointer-events-none invisible absolute top-8 z-40 w-64 rounded-xl border border-indigo-200/90 bg-white/95 p-2.5 text-left text-[11px] leading-snug text-slate-700 opacity-0 shadow-glass-lg ring-1 ring-indigo-500/15 backdrop-blur-xl transition-all duration-150 group-hover/info:pointer-events-auto group-hover/info:visible group-hover/info:opacity-100 group-focus-within/info:pointer-events-auto group-focus-within/info:visible group-focus-within/info:opacity-100 dark:border-slate-700/90 dark:bg-slate-900/95 dark:text-slate-200 ${alignClass}`}
    >
      <div className="font-extrabold text-slate-900 dark:text-white">{title}</div>
      <p className="mt-1 font-normal text-slate-600 dark:text-slate-300">{meaning}</p>
      <div className="mt-1.5 rounded-lg border border-indigo-100/80 bg-indigo-50/70 px-2 py-1.5 font-mono text-[10px] font-semibold text-indigo-950 dark:border-slate-800 dark:bg-slate-800/90 dark:text-indigo-200">
        <span className="block text-[9px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          How it&apos;s calculated
        </span>
        <span className="mt-0.5 block">{formula}</span>
      </div>
    </div>
  </div>
);
