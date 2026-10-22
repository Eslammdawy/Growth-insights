import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Filter, Info, RotateCcw, Search, X } from 'lucide-react';
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
}

const SearchableMultiSelect: React.FC<MultiSelectProps> = ({
  label,
  scopeBadge,
  options,
  selected,
  onChange,
  placeholder = 'All',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

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
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs transition-all focus:outline-none focus:ring-2 focus:ring-sky-500 ${
          selected.length > 0
            ? 'border-sky-500/60 bg-sky-500/10 font-semibold text-sky-800 dark:text-sky-200'
            : 'border-slate-200/80 bg-white/70 text-slate-700 hover:bg-white dark:border-slate-700/80 dark:bg-slate-900/50 dark:text-slate-200'
        }`}
      >
        <span className="text-slate-500 dark:text-slate-400">{label}:</span>
        <span className="max-w-[160px] truncate">
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
            className="rounded-full p-0.5 hover:bg-sky-500/20"
          >
            <X className="h-3 w-3" />
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>

      {open && (
        <div className="glass-panel absolute left-0 top-full z-40 mt-1.5 w-72 rounded-2xl border border-slate-200/90 p-2.5 shadow-xl dark:border-slate-700/90">
          <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span>
              {label} <span className="rounded bg-slate-500/10 px-1 py-0.5 text-[10px]">{scopeBadge}</span>
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onChange([...options])}
                className="font-medium text-sky-600 hover:underline dark:text-sky-400"
              >
                Select all ({options.length})
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="font-medium text-slate-500 hover:underline dark:text-slate-400"
              >
                Clear
              </button>
            </div>
          </div>

          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${label.toLowerCase()}...`}
              className="w-full rounded-lg border border-slate-200 bg-white/80 py-1.5 pl-8 pr-2 text-xs text-slate-800 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
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
                    className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
                      checked
                        ? 'bg-sky-500/15 font-semibold text-sky-800 dark:text-sky-200'
                        : 'text-slate-700 hover:bg-slate-200/50 dark:text-slate-200 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="truncate pr-2" dir="auto">
                      {opt}
                    </span>
                    {checked && <Check className="h-3.5 w-3.5 shrink-0 text-sky-500" />}
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
    statusFilter,
    topN,
    search,
    resetFilters,
  } = useDashboardStore();

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
    drill.length +
    (statusFilter !== 'all' ? 1 : 0) +
    (topN !== null ? 1 : 0) +
    (search.trim() !== '' ? 1 : 0);

  const toggleTxType = (t: TxType) => {
    if (txTypes.includes(t)) {
      if (txTypes.length > 1) setTxTypes(txTypes.filter((x) => x !== t));
    } else {
      setTxTypes([...txTypes, t]);
    }
  };

  return (
    <section
      aria-label="Filters"
      className="glass-panel rounded-2xl border border-slate-200/70 dark:border-slate-800/80 px-3.5 py-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 pr-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
            <Filter className="h-3.5 w-3.5 text-sky-500" />
            <span>Filters</span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-sky-500 px-1.5 py-0.2 text-[11px] font-bold text-white tabular-nums">
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
            onChange={setBrandsForCurrentLine}
          />

          <SearchableMultiSelect
            label="Item"
            scopeBadge={line ? `Line: ${line}` : 'All Lines'}
            options={availableItems}
            selected={currentLineFilter.items}
            onChange={setItemsForCurrentLine}
          />

          <span className="mx-0.5 hidden h-4 w-px bg-slate-300 dark:bg-slate-700 sm:inline-block" />

          {/* Global MainType Filter */}
          <SearchableMultiSelect
            label="MainType"
            scopeBadge="Global"
            options={meta?.mainTypes ?? []}
            selected={mainTypes}
            onChange={setMainTypes}
          />

          {/* Global Transaction Types Pills */}
          <div
            role="group"
            aria-label="Transaction types"
            className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/70 px-2 py-1 text-xs dark:border-slate-700/80 dark:bg-slate-900/50"
          >
            <span className="text-slate-500 dark:text-slate-400">Tx:</span>
            {TX_TYPES.map((t) => {
              const checked = txTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTxType(t)}
                  aria-pressed={checked}
                  className={`rounded-lg px-2 py-0.5 text-xs font-medium transition-colors ${
                    checked
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-500 hover:bg-slate-200/60 dark:text-slate-400 dark:hover:bg-slate-800'
                  }`}
                >
                  {t}
                </button>
              );
            })}
            <span
              className="ml-0.5 cursor-help text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
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
              className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:text-sky-200"
            >
              Brand: {b}
              <button
                type="button"
                onClick={() =>
                  setBrandsForCurrentLine(currentLineFilter.brands.filter((x) => x !== b))
                }
                aria-label={`Remove brand ${b}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {currentLineFilter.items.slice(0, 2).map((it) => (
            <span
              key={`i-${it}`}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-800 dark:text-indigo-200"
            >
              Item: <span className="max-w-[120px] truncate">{it}</span>
              <button
                type="button"
                onClick={() =>
                  setItemsForCurrentLine(currentLineFilter.items.filter((x) => x !== it))
                }
                aria-label={`Remove item ${it}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
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
