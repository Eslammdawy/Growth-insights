/**
 * Shared searchable multi-select dropdown (Guide Report banner filters, Customer Dynamics SubType).
 * Empty selection means "All".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

export type FilterAccent = 'purple' | 'indigo' | 'cyan' | 'emerald' | 'fuchsia';

export interface MultiSelectProps {
  label: string;
  scopeBadge: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  accent?: FilterAccent;
  /** Optional count shown next to each option (e.g. customers per SubType). */
  optionCounts?: Record<string, number>;
  /** Overrides the number shown next to the placeholder (defaults to the option count). */
  placeholderCount?: number;
  /** Accessible label for the trigger button. */
  ariaLabel?: string;
}

const ACCENT_STYLES: Record<
  FilterAccent,
  {
    activeBtn: string;
    badge: string;
    checkedRow: string;
    checkIcon: string;
  }
> = {
  indigo: {
    activeBtn:
      'border-indigo-500/70 bg-gradient-to-r from-indigo-500/15 to-violet-500/15 font-semibold text-indigo-900 shadow-sm dark:border-indigo-400/60 dark:from-indigo-500/25 dark:to-violet-500/25 dark:text-indigo-100',
    badge: 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-200',
    checkedRow: 'bg-gradient-to-r from-indigo-500/15 to-violet-500/15 font-semibold text-indigo-900 dark:text-indigo-100',
    checkIcon: 'text-indigo-600 dark:text-indigo-400',
  },
  cyan: {
    activeBtn:
      'border-cyan-500/70 bg-gradient-to-r from-cyan-500/15 to-sky-500/15 font-semibold text-cyan-900 shadow-sm dark:border-cyan-400/60 dark:from-cyan-500/25 dark:to-sky-500/25 dark:text-cyan-100',
    badge: 'bg-cyan-500/15 text-cyan-700 dark:bg-cyan-500/25 dark:text-cyan-200',
    checkedRow: 'bg-gradient-to-r from-cyan-500/15 to-sky-500/15 font-semibold text-cyan-900 dark:text-cyan-100',
    checkIcon: 'text-cyan-600 dark:text-cyan-400',
  },
  purple: {
    activeBtn:
      'border-purple-500/70 bg-gradient-to-r from-purple-500/15 to-fuchsia-500/15 font-semibold text-purple-900 shadow-sm dark:border-purple-400/60 dark:from-purple-500/25 dark:to-fuchsia-500/25 dark:text-purple-100',
    badge: 'bg-purple-500/15 text-purple-700 dark:bg-purple-500/25 dark:text-purple-200',
    checkedRow: 'bg-gradient-to-r from-purple-500/15 to-fuchsia-500/15 font-semibold text-purple-900 dark:text-purple-100',
    checkIcon: 'text-purple-600 dark:text-purple-400',
  },
  emerald: {
    activeBtn:
      'border-emerald-500/70 bg-gradient-to-r from-emerald-500/15 to-teal-500/15 font-semibold text-emerald-900 shadow-sm dark:border-emerald-400/60 dark:from-emerald-500/25 dark:to-teal-500/25 dark:text-emerald-100',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200',
    checkedRow: 'bg-gradient-to-r from-emerald-500/15 to-teal-500/15 font-semibold text-emerald-900 dark:text-emerald-100',
    checkIcon: 'text-emerald-600 dark:text-emerald-400',
  },
  fuchsia: {
    activeBtn:
      'border-fuchsia-500/70 bg-gradient-to-r from-fuchsia-500/15 to-purple-500/15 font-semibold text-fuchsia-900 shadow-sm dark:border-fuchsia-400/60 dark:from-fuchsia-500/25 dark:to-purple-500/25 dark:text-fuchsia-100',
    badge: 'bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-500/25 dark:text-fuchsia-200',
    checkedRow: 'bg-gradient-to-r from-fuchsia-500/15 to-purple-500/15 font-semibold text-fuchsia-900 dark:text-fuchsia-100',
    checkIcon: 'text-fuchsia-600 dark:text-fuchsia-400',
  },
};

export const SearchableMultiSelect: React.FC<MultiSelectProps> = ({
  label,
  scopeBadge,
  options,
  selected,
  onChange,
  placeholder = 'All',
  accent = 'indigo',
  optionCounts,
  placeholderCount,
  ariaLabel,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const tone = ACCENT_STYLES[accent];

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const selSet = useMemo(() => new Set(selected), [selected]);

  const toggleOption = (opt: string) => {
    if (selSet.has(opt)) onChange(selected.filter((x) => x !== opt));
    else onChange([...selected, opt]);
  };

  return (
    <div ref={ref} className={`relative ${open ? 'z-50' : 'z-10'}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          selected.length > 0
            ? tone.activeBtn
            : open
              ? 'border-indigo-400 bg-white text-slate-900 shadow-sm dark:border-indigo-500 dark:bg-slate-800 dark:text-white'
              : 'border-indigo-200/80 bg-white/85 text-slate-700 hover:border-indigo-300 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-indigo-500/60'
        }`}
      >
        <span className="font-medium text-slate-500 dark:text-slate-400">{label}:</span>
        <span className="max-w-[140px] truncate font-semibold">
          {selected.length === 0
            ? `${placeholder} (${(placeholderCount ?? options.length).toLocaleString('en-US')})`
            : selected.length === 1
              ? selected[0]
              : `${selected.length} of ${options.length}`}
        </span>
        {selected.length > 0 && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onChange([]);
            }}
            role="button"
            tabIndex={0}
            aria-label={`Clear ${label} filter`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onChange([]);
              }
            }}
            className="rounded-full p-0.5 hover:bg-indigo-500/20"
          >
            <X className="h-3 w-3" />
          </span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 opacity-70 transition-transform duration-150 ${
            open ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-indigo-200/90 bg-white/95 p-3 shadow-glass-lg ring-1 ring-indigo-500/15 backdrop-blur-2xl dark:border-indigo-500/40 dark:bg-slate-900/95">
          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {label}{' '}
              <span className={`ml-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tone.badge}`}>
                {scopeBadge}
              </span>
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange([...options])}
                className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
              >
                Select all ({options.length})
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="font-medium text-rose-600 hover:underline dark:text-rose-400"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-indigo-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="w-full rounded-xl border border-indigo-200/80 bg-slate-50/90 py-1.5 pl-8 pr-2 text-xs text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100"
            />
          </div>

          <div className="max-h-60 space-y-0.5 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">No matching options</div>
            ) : (
              filtered.map((opt) => {
                const checked = selSet.has(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggleOption(opt)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                      checked
                        ? tone.checkedRow
                        : 'text-slate-700 hover:bg-indigo-50/80 dark:text-slate-200 dark:hover:bg-slate-800/80'
                    }`}
                  >
                    <span className="truncate pr-2" dir="auto">
                      {opt}
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {optionCounts && optionCounts[opt] !== undefined && (
                        <span className="text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                          {optionCounts[opt].toLocaleString('en-US')}
                        </span>
                      )}
                      {checked && <Check className={`h-3.5 w-3.5 shrink-0 ${tone.checkIcon}`} />}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
