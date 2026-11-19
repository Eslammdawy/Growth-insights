/**
 * Excel-style searchable checkbox dropdown (all options checked by default).
 * Unchecking items excludes them immediately; includes a quick "Only" button per row
 * and local draft-empty handling when unchecking all items.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Minus, Search, X } from 'lucide-react';
import {
  ALL_CHECKED,
  CheckboxFilterState,
  resolveCheckboxFilter,
  selectOnlyCheckboxOption,
  toggleAllCheckboxOptions,
  toggleCheckboxOption,
} from '../lib/checkboxFilter';
import type { FilterAccent } from './SearchableMultiSelect';

export interface CheckboxMultiSelectProps {
  label: string;
  scopeBadge: string;
  options: string[];
  value: CheckboxFilterState;
  onChange: (next: CheckboxFilterState) => void;
  placeholder?: string;
  accent?: FilterAccent;
  /** Optional count shown next to each option (e.g. customers per SubType). */
  optionCounts?: Record<string, number>;
  /** Overrides the number shown next to the placeholder (defaults to the option count). */
  placeholderCount?: number;
  /** Accessible label for the trigger button. */
  ariaLabel?: string;
  /** Horizontal alignment of the dropdown popover relative to the trigger. */
  align?: 'left' | 'right';
}

const ACCENT_STYLES: Record<
  FilterAccent,
  {
    activeBtn: string;
    badge: string;
    checkboxChecked: string;
    rowHover: string;
    onlyBtn: string;
    focusRing: string;
    clearHover: string;
  }
> = {
  indigo: {
    activeBtn:
      'border-indigo-500/70 bg-gradient-to-r from-indigo-500/15 to-violet-500/15 font-semibold text-indigo-900 shadow-sm dark:border-indigo-400/60 dark:from-indigo-500/25 dark:to-violet-500/25 dark:text-indigo-100',
    badge: 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-500/25 dark:text-indigo-200',
    checkboxChecked: 'border-indigo-600 bg-indigo-600 text-white dark:border-indigo-500 dark:bg-indigo-500',
    rowHover: 'hover:bg-indigo-50/80 dark:hover:bg-slate-800/80',
    onlyBtn:
      'text-indigo-600 hover:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25',
    focusRing: 'focus:ring-indigo-500',
    clearHover: 'hover:bg-indigo-500/20',
  },
  cyan: {
    activeBtn:
      'border-cyan-500/70 bg-gradient-to-r from-cyan-500/15 to-sky-500/15 font-semibold text-cyan-900 shadow-sm dark:border-cyan-400/60 dark:from-cyan-500/25 dark:to-sky-500/25 dark:text-cyan-100',
    badge: 'bg-cyan-500/15 text-cyan-700 dark:bg-cyan-500/25 dark:text-cyan-200',
    checkboxChecked: 'border-cyan-600 bg-cyan-600 text-white dark:border-cyan-500 dark:bg-cyan-500',
    rowHover: 'hover:bg-cyan-50/80 dark:hover:bg-slate-800/80',
    onlyBtn: 'text-cyan-700 hover:bg-cyan-500/15 dark:text-cyan-300 dark:hover:bg-cyan-500/25',
    focusRing: 'focus:ring-cyan-500',
    clearHover: 'hover:bg-cyan-500/20',
  },
  purple: {
    activeBtn:
      'border-purple-500/70 bg-gradient-to-r from-purple-500/15 to-fuchsia-500/15 font-semibold text-purple-900 shadow-sm dark:border-purple-400/60 dark:from-purple-500/25 dark:to-fuchsia-500/25 dark:text-purple-100',
    badge: 'bg-purple-500/15 text-purple-700 dark:bg-purple-500/25 dark:text-purple-200',
    checkboxChecked: 'border-purple-600 bg-purple-600 text-white dark:border-purple-500 dark:bg-purple-500',
    rowHover: 'hover:bg-purple-50/80 dark:hover:bg-slate-800/80',
    onlyBtn:
      'text-purple-700 hover:bg-purple-500/15 dark:text-purple-300 dark:hover:bg-purple-500/25',
    focusRing: 'focus:ring-purple-500',
    clearHover: 'hover:bg-purple-500/20',
  },
  emerald: {
    activeBtn:
      'border-emerald-500/70 bg-gradient-to-r from-emerald-500/15 to-teal-500/15 font-semibold text-emerald-900 shadow-sm dark:border-emerald-400/60 dark:from-emerald-500/25 dark:to-teal-500/25 dark:text-emerald-100',
    badge: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-200',
    checkboxChecked:
      'border-emerald-600 bg-emerald-600 text-white dark:border-emerald-500 dark:bg-emerald-500',
    rowHover: 'hover:bg-emerald-50/80 dark:hover:bg-slate-800/80',
    onlyBtn:
      'text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25',
    focusRing: 'focus:ring-emerald-500',
    clearHover: 'hover:bg-emerald-500/20',
  },
  fuchsia: {
    activeBtn:
      'border-fuchsia-500/70 bg-gradient-to-r from-fuchsia-500/15 to-purple-500/15 font-semibold text-fuchsia-900 shadow-sm dark:border-fuchsia-400/60 dark:from-fuchsia-500/25 dark:to-purple-500/25 dark:text-fuchsia-100',
    badge: 'bg-fuchsia-500/15 text-fuchsia-700 dark:bg-fuchsia-500/25 dark:text-fuchsia-200',
    checkboxChecked:
      'border-fuchsia-600 bg-fuchsia-600 text-white dark:border-fuchsia-500 dark:bg-fuchsia-500',
    rowHover: 'hover:bg-fuchsia-50/80 dark:hover:bg-slate-800/80',
    onlyBtn:
      'text-fuchsia-700 hover:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:hover:bg-fuchsia-500/25',
    focusRing: 'focus:ring-fuchsia-500',
    clearHover: 'hover:bg-fuchsia-500/20',
  },
};

export const CheckboxMultiSelect: React.FC<CheckboxMultiSelectProps> = ({
  label,
  scopeBadge,
  options,
  value,
  onChange,
  placeholder = 'All',
  accent = 'emerald',
  optionCounts,
  placeholderCount,
  ariaLabel,
  align = 'left',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [draftEmpty, setDraftEmpty] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tone = ACCENT_STYLES[accent];

  const closePopover = useCallback(() => {
    setOpen(false);
    setDraftEmpty(false);
    setQuery('');
  }, []);

  useEffect(() => {
    setDraftEmpty(false);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) closePopover();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePopover();
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, closePopover]);

  const resolved = useMemo(() => resolveCheckboxFilter(value, options), [value, options]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const effectiveCheckedSet = useMemo(
    () => (draftEmpty ? new Set<string>() : resolved.checkedSet),
    [draftEmpty, resolved.checkedSet],
  );
  const effectiveCheckedCount = draftEmpty ? 0 : resolved.checked.length;

  const targetList = query.trim() ? filtered : options;
  const checkedInTarget = useMemo(
    () => targetList.filter((o) => effectiveCheckedSet.has(o)).length,
    [targetList, effectiveCheckedSet],
  );
  const allTargetChecked = targetList.length > 0 && checkedInTarget === targetList.length;
  const someTargetChecked = checkedInTarget > 0 && checkedInTarget < targetList.length;

  const triggerText = useMemo(() => {
    if (!resolved.isActive) {
      return `${placeholder} (${(placeholderCount ?? options.length).toLocaleString('en-US')})`;
    }
    if (resolved.displayMode === 'exclude') {
      return resolved.excluded.length === 1
        ? `Except ${resolved.excluded[0]}`
        : `Except ${resolved.excluded.length} (${resolved.checked.length}/${options.length})`;
    }
    return resolved.checked.length === 1
      ? resolved.checked[0]
      : `${resolved.checked.length} of ${options.length}`;
  }, [resolved, placeholder, placeholderCount, options.length]);

  const handleToggleOption = (opt: string) => {
    const outcome = toggleCheckboxOption(value, options, opt, draftEmpty);
    setDraftEmpty(outcome.draftEmpty);
    if (outcome.next) onChange(outcome.next);
  };

  const handleOnly = (opt: string) => {
    setDraftEmpty(false);
    onChange(selectOnlyCheckboxOption(options, opt));
  };

  const handleToggleAll = () => {
    if (targetList.length === 0) return;
    const outcome = toggleAllCheckboxOptions(value, options, targetList, draftEmpty);
    setDraftEmpty(outcome.draftEmpty);
    if (outcome.next) onChange(outcome.next);
  };

  const handleSelectAllReset = () => {
    setDraftEmpty(false);
    onChange(ALL_CHECKED);
  };

  return (
    <div ref={ref} className={`relative ${open ? 'z-50' : 'z-10'}`}>
      <button
        type="button"
        onClick={() => (open ? closePopover() : setOpen(true))}
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition-all focus:outline-none focus:ring-2 ${tone.focusRing} ${
          resolved.isActive
            ? tone.activeBtn
            : open
              ? 'border-indigo-400 bg-white text-slate-900 shadow-sm dark:border-indigo-500 dark:bg-slate-800 dark:text-white'
              : 'border-indigo-200/80 bg-white/85 text-slate-700 hover:border-indigo-300 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-indigo-500/60'
        }`}
      >
        <span className="font-medium text-slate-500 dark:text-slate-400">{label}:</span>
        <span className="max-w-[155px] truncate font-semibold" title={triggerText}>
          {triggerText}
        </span>
        {resolved.isActive && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              handleSelectAllReset();
            }}
            role="button"
            tabIndex={0}
            aria-label={`Reset ${label} filter`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                handleSelectAllReset();
              }
            }}
            className={`rounded-full p-0.5 ${tone.clearHover}`}
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
        <div
          className={`absolute ${align === 'right' ? 'right-0' : 'left-0'} top-full z-50 mt-2 w-72 rounded-2xl border border-indigo-200/90 bg-white/95 p-3 shadow-glass-lg ring-1 ring-indigo-500/15 backdrop-blur-2xl dark:border-indigo-500/40 dark:bg-slate-900/95`}
        >
          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {label}{' '}
              <span className={`ml-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tone.badge}`}>
                {scopeBadge}
              </span>
            </span>
            <span className="font-semibold tabular-nums text-slate-600 dark:text-slate-300">
              {effectiveCheckedCount}/{options.length}
            </span>
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

          {/* Master tri-state Select All / Unselect All row */}
          <button
            type="button"
            role="checkbox"
            aria-checked={allTargetChecked ? true : someTargetChecked ? 'mixed' : false}
            disabled={targetList.length === 0}
            onClick={handleToggleAll}
            className="mb-1.5 flex w-full items-center justify-between rounded-lg border-b border-slate-200/80 px-2 py-1.5 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100/80 disabled:opacity-40 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-800/80"
          >
            <span className="flex items-center gap-2">
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  allTargetChecked || someTargetChecked
                    ? tone.checkboxChecked
                    : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                }`}
              >
                {allTargetChecked ? (
                  <Check className="h-3 w-3 stroke-[3]" />
                ) : someTargetChecked ? (
                  <Minus className="h-3 w-3 stroke-[3]" />
                ) : null}
              </span>
              <span>
                {query.trim()
                  ? `Select all matching (${filtered.length})`
                  : `Select all (${options.length})`}
              </span>
            </span>
            {allTargetChecked && (
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                Unselect all
              </span>
            )}
          </button>

          {draftEmpty && (
            <div className="mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-amber-300/70 bg-amber-50/90 px-2 py-1 text-[11px] font-medium text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-200">
              <span>All unchecked — pick at least 1 to apply</span>
              <button
                type="button"
                onClick={handleSelectAllReset}
                className="shrink-0 font-bold underline hover:opacity-80"
              >
                Select all
              </button>
            </div>
          )}

          <div className="max-h-60 space-y-0.5 overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">No matching options</div>
            ) : (
              filtered.map((opt) => {
                const checked = effectiveCheckedSet.has(opt);
                const showOnly =
                  options.length > 1 &&
                  !(!draftEmpty && effectiveCheckedSet.size === 1 && checked);
                return (
                  <div
                    key={opt}
                    className={`group flex items-center gap-1 rounded-lg px-1.5 py-1 transition-colors ${tone.rowHover}`}
                  >
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => handleToggleOption(opt)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left text-xs text-slate-700 focus:outline-none dark:text-slate-200"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          checked
                            ? tone.checkboxChecked
                            : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-800'
                        }`}
                      >
                        {checked && <Check className="h-3 w-3 stroke-[3]" />}
                      </span>
                      <span
                        className={`truncate ${checked ? 'font-medium' : 'text-slate-400 dark:text-slate-500'}`}
                        dir="auto"
                      >
                        {opt}
                      </span>
                      {optionCounts && optionCounts[opt] !== undefined && (
                        <span className="ml-auto shrink-0 text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                          {optionCounts[opt].toLocaleString('en-US')}
                        </span>
                      )}
                    </button>
                    {showOnly && (
                      <button
                        type="button"
                        onClick={() => handleOnly(opt)}
                        aria-label={`Select only ${opt}`}
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 ${tone.onlyBtn}`}
                      >
                        Only
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
