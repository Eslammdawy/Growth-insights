import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ArrowRight, Check, ChevronDown, Compass, RotateCcw, Search, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { brandOptions, itemOptions } from '../lib/aggregate';
import { useDashboardStore } from '../store/useDashboardStore';

type FilterAccent = 'purple' | 'indigo' | 'cyan' | 'emerald';

interface MultiSelectProps {
  label: string;
  scopeBadge: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  accent?: FilterAccent;
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
            ? `${placeholder} (${options.length})`
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
    result,
    brands,
    setBrands,
    items,
    setItems,
    drill,
    resetFilters,
  } = useDashboardStore(
    useShallow((s) => ({
      meta: s.meta,
      result: s.result,
      brands: s.brands,
      setBrands: s.setBrands,
      items: s.items,
      setItems: s.setItems,
      drill: s.drill,
      resetFilters: s.resetFilters,
    }))
  );

  const fo = result?.filterOptions;
  const availableBrands = useMemo(
    () => fo?.brands ?? (meta ? brandOptions(meta, null) : []),
    [fo, meta]
  );
  const availableItems = useMemo(
    () => fo?.items ?? (meta ? itemOptions(meta, null, brands) : []),
    [fo, meta, brands]
  );

  const activeFilterCount = brands.length + items.length + drill.length;

  return (
    <section
      id="section-filters"
      aria-label="Guided Report Filters"
      className="glass-panel relative z-30 scroll-mt-20 rounded-2xl border border-indigo-200/70 bg-gradient-to-r from-white/90 via-indigo-50/40 to-cyan-50/40 px-3.5 py-2.5 dark:border-indigo-500/25 dark:from-slate-900/90 dark:via-indigo-950/40 dark:to-slate-900/90"
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Guided Filter Title */}
          <div className="flex items-center gap-1.5 pr-1 text-xs font-bold text-indigo-900 dark:text-indigo-200">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm">
              <Compass className="h-3.5 w-3.5" />
            </span>
            <span>Guide Report</span>
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-gradient-to-r from-indigo-600 to-violet-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-sm tabular-nums">
                {activeFilterCount}
              </span>
            )}
          </div>

          {/* Product & Brand Filters */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-indigo-200/70 bg-indigo-50/35 px-2 py-1 dark:border-indigo-500/20 dark:bg-indigo-950/20">
            <span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-800 dark:bg-indigo-500/25 dark:text-indigo-200">
              Product & Brand
            </span>
            <SearchableMultiSelect
              label="Brand"
              scopeBadge="Brand"
              options={availableBrands}
              selected={brands}
              onChange={(next) => startTransition(() => setBrands(next))}
              placeholder="All Brands"
              accent="indigo"
            />
            <ArrowRight className="hidden h-3 w-3 text-indigo-400 sm:inline-block" />
            <SearchableMultiSelect
              label="Product"
              scopeBadge={brands.length > 0 ? `In ${brands.length} Brand` : 'Product'}
              options={availableItems}
              selected={items}
              onChange={(next) => startTransition(() => setItems(next))}
              placeholder="All Products"
              accent="cyan"
            />
          </div>
        </div>

        {/* Active Filter Summary Chips + Reset Button */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {brands.map((b) => (
              <span
                key={`b-${b}`}
                className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold text-indigo-800 dark:text-indigo-200"
              >
                Brand: {b}
                <button
                  type="button"
                  onClick={() => startTransition(() => setBrands(brands.filter((x) => x !== b)))}
                  aria-label={`Remove brand ${b}`}
                  className="rounded-full p-0.5 hover:bg-indigo-500/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {items.map((it) => (
              <span
                key={`i-${it}`}
                className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-900 dark:text-cyan-200"
              >
                Product: <span className="max-w-[120px] truncate">{it}</span>
                <button
                  type="button"
                  onClick={() => startTransition(() => setItems(items.filter((x) => x !== it)))}
                  aria-label={`Remove product ${it}`}
                  className="rounded-full p-0.5 hover:bg-cyan-500/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}

            <button
              type="button"
              onClick={() => startTransition(() => resetFilters())}
              className="inline-flex items-center gap-1 rounded-xl border border-rose-500/40 bg-gradient-to-r from-rose-500/15 to-pink-500/15 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:from-rose-500/25 hover:to-pink-500/25 dark:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
            >
              <RotateCcw className="h-3 w-3" />
              Reset filters
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
