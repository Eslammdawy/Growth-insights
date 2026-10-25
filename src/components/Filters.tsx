import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Check, ChevronDown, Filter, Info, RotateCcw, Search, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { brandOptions, itemOptions } from '../lib/aggregate';
import { TX_TYPES, TxType } from '../lib/config';
import { useDashboardStore } from '../store/useDashboardStore';

interface MultiSelectProps {
  label: string;
  scopeBadge: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  accent?: 'indigo' | 'cyan' | 'purple';
}

const ACCENT_STYLES = {
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
};

const SearchableMultiSelect: React.FC<MultiSelectProps> = ({
  label,
  scopeBadge,
  options,
  selected,
  onChange,
  placeholder = 'All',
  accent = 'indigo',
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
        className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          selected.length > 0
            ? tone.activeBtn
            : open
              ? 'border-indigo-400 bg-white text-slate-900 shadow-sm dark:border-indigo-500 dark:bg-slate-800 dark:text-white'
              : 'border-indigo-200/80 bg-white/85 text-slate-700 hover:border-indigo-300 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-indigo-500/60'
        }`}
      >
        <span className="font-medium text-slate-500 dark:text-slate-400">{label}:</span>
        <span className="max-w-[160px] truncate font-semibold">
          {selected.length === 0
            ? placeholder
            : selected.length === 1
              ? selected[0]
              : `${selected.length} selected`}
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
        <ChevronDown className={`h-3.5 w-3.5 opacity-70 transition-transform duration-150 ${open ? 'rotate-180 text-indigo-600 dark:text-indigo-400' : ''}`} />
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
                    {checked && <Check className={`h-3.5 w-3.5 shrink-0 ${tone.checkIcon}`} />}
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

export const Filters: React.FC = () => {
  const [, startTransition] = useTransition();
  const {
    meta,
    line,
    txTypes,
    setTxTypes,
    mainTypes,
    setMainTypes,
    perLineFilters,
    setBrandsForCurrentLine,
    setItemsForCurrentLine,
    drill,
    resetFilters,
  } = useDashboardStore(
    useShallow((s) => ({
      meta: s.meta,
      line: s.line,
      txTypes: s.txTypes,
      setTxTypes: s.setTxTypes,
      mainTypes: s.mainTypes,
      setMainTypes: s.setMainTypes,
      perLineFilters: s.perLineFilters,
      setBrandsForCurrentLine: s.setBrandsForCurrentLine,
      setItemsForCurrentLine: s.setItemsForCurrentLine,
      drill: s.drill,
      resetFilters: s.resetFilters,
    }))
  );

  const lineKey = line ?? '__ALL__';
  const currentLineFilter = perLineFilters[lineKey] ?? { brands: [], items: [] };

  const availableBrands = useMemo(
    () => (meta ? brandOptions(meta, line) : []),
    [meta, line],
  );
  const availableItems = useMemo(
    () => (meta ? itemOptions(meta, line, currentLineFilter.brands) : []),
    [meta, line, currentLineFilter.brands],
  );

  const activeFilterCount =
    currentLineFilter.brands.length +
    currentLineFilter.items.length +
    mainTypes.length +
    (txTypes.length !== TX_TYPES.length ? 1 : 0) +
    drill.length;

  const toggleTxType = (t: TxType) => {
    startTransition(() => {
      if (txTypes.includes(t)) {
        if (txTypes.length > 1) setTxTypes(txTypes.filter((x) => x !== t));
      } else {
        setTxTypes([...txTypes, t]);
      }
    });
  };

  const handleBrandsChange = (brands: string[]) => {
    startTransition(() => setBrandsForCurrentLine(brands));
  };
  const handleItemsChange = (items: string[]) => {
    startTransition(() => setItemsForCurrentLine(items));
  };
  const handleMainTypesChange = (types: string[]) => {
    startTransition(() => setMainTypes(types));
  };
  const handleResetFilters = () => {
    startTransition(() => resetFilters());
  };

  return (
    <section
      aria-label="Filters"
      className="glass-panel relative z-30 rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-white/90 via-indigo-50/40 to-cyan-50/40 px-3.5 py-2.5 dark:border-indigo-500/25 dark:from-slate-900/90 dark:via-indigo-950/40 dark:to-slate-900/90"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 pr-1 text-xs font-bold text-indigo-900 dark:text-indigo-200">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm">
              <Filter className="h-3.5 w-3.5" />
            </span>
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm tabular-nums">
                {activeFilterCount}
              </span>
            )}
          </div>

          {/* Per-Line Product Filters */}
          <SearchableMultiSelect
            label="Brand"
            scopeBadge={line ? `Line: ${line}` : 'All Lines'}
            options={availableBrands}
            selected={currentLineFilter.brands}
            onChange={handleBrandsChange}
            accent="indigo"
          />

          <SearchableMultiSelect
            label="Item"
            scopeBadge={line ? `Line: ${line}` : 'All Lines'}
            options={availableItems}
            selected={currentLineFilter.items}
            onChange={handleItemsChange}
            accent="cyan"
          />

          <span className="mx-0.5 hidden h-4 w-px bg-indigo-200 dark:bg-slate-700 sm:inline-block" />

          {/* Global MainType Filter */}
          <SearchableMultiSelect
            label="MainType"
            scopeBadge="Global"
            options={meta?.mainTypes ?? []}
            selected={mainTypes}
            onChange={handleMainTypesChange}
            accent="purple"
          />

          {/* Global Transaction Types Pills */}
          <div
            role="group"
            aria-label="Transaction types"
            className="flex items-center gap-1 rounded-xl border border-indigo-200/80 bg-white/85 px-2 py-1 text-xs dark:border-slate-700/80 dark:bg-slate-900/70"
          >
            <span className="font-medium text-slate-500 dark:text-slate-400">Tx:</span>
            {TX_TYPES.map((t) => {
              const checked = txTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTxType(t)}
                  aria-pressed={checked}
                  className={`rounded-lg px-2.5 py-0.5 text-xs font-semibold transition-all ${
                    checked
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-indigo-50 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  {t}
                </button>
              );
            })}
            <span
              className="ml-0.5 cursor-help text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300"
              title="Returns are negative and are netted against sales. Bonus / Return Bonus are excluded from all metrics."
              aria-label="Returns are negative and are netted against sales. Bonus and Return Bonus are excluded."
            >
              <Info className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>

        {/* Selected Brand/Item chips + Reset button */}
        <div className="flex flex-wrap items-center gap-1.5">
          {currentLineFilter.brands.slice(0, 3).map((b) => (
            <span
              key={`b-${b}`}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 dark:text-indigo-200"
            >
              Brand: {b}
              <button
                type="button"
                onClick={() =>
                  startTransition(() =>
                    setBrandsForCurrentLine(currentLineFilter.brands.filter((x) => x !== b))
                  )
                }
                aria-label={`Remove brand ${b}`}
                className="rounded-full p-0.5 hover:bg-indigo-500/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {currentLineFilter.items.slice(0, 2).map((it) => (
            <span
              key={`i-${it}`}
              className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-900 dark:text-cyan-200"
            >
              Item: <span className="max-w-[120px] truncate">{it}</span>
              <button
                type="button"
                onClick={() =>
                  startTransition(() =>
                    setItemsForCurrentLine(currentLineFilter.items.filter((x) => x !== it))
                  )
                }
                aria-label={`Remove item ${it}`}
                className="rounded-full p-0.5 hover:bg-cyan-500/20"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-500/40 bg-gradient-to-r from-rose-500/15 to-pink-500/15 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:from-rose-500/25 hover:to-pink-500/25 dark:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <RotateCcw className="h-3 w-3" />
              Reset filters
            </button>
          )}
        </div>
      </div>
    </section>
  );
};
