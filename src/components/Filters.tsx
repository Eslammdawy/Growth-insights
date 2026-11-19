import React, { useMemo, useTransition } from 'react';
import { ArrowRight, Compass, RotateCcw, X } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { brandOptions, distributorOptions, itemOptions } from '../lib/aggregate';
import {
  CheckboxFilterState,
  reincludeCheckboxOption,
  removeIncludedCheckboxOption,
  resolveCheckboxFilter,
} from '../lib/checkboxFilter';
import { useDashboardStore } from '../store/useDashboardStore';
import { CheckboxMultiSelect } from './CheckboxMultiSelect';
import { SearchableMultiSelect } from './SearchableMultiSelect';

export const Filters: React.FC = () => {
  const [, startTransition] = useTransition();
  const {
    meta,
    lines,
    setLines,
    brands,
    setBrands,
    items,
    setItems,
    distributors,
    excludedDistributors,
    setDistributorFilter,
    drill,
    resetFilters,
  } = useDashboardStore(
    useShallow((s) => ({
      meta: s.meta,
      lines: s.lines,
      setLines: s.setLines,
      brands: s.brands,
      setBrands: s.setBrands,
      items: s.items,
      setItems: s.setItems,
      distributors: s.distributors,
      excludedDistributors: s.excludedDistributors,
      setDistributorFilter: s.setDistributorFilter,
      drill: s.drill,
      resetFilters: s.resetFilters,
    }))
  );

  const availableLines = useMemo(() => meta?.lines ?? [], [meta]);
  const availableBrands = useMemo(
    () => (meta ? brandOptions(meta, lines) : []),
    [meta, lines]
  );
  const availableItems = useMemo(
    () => (meta ? itemOptions(meta, lines, brands) : []),
    [meta, lines, brands]
  );
  const availableDistributors = useMemo(
    () => (meta ? distributorOptions(meta, { lines, brands, items }) : []),
    [meta, lines, brands, items]
  );

  const distributorFilter: CheckboxFilterState = useMemo(
    () =>
      distributors.length > 0
        ? { mode: 'include', values: distributors }
        : { mode: 'exclude', values: excludedDistributors },
    [distributors, excludedDistributors]
  );
  const distResolved = useMemo(
    () => resolveCheckboxFilter(distributorFilter, availableDistributors),
    [distributorFilter, availableDistributors]
  );
  const distributorChipCount = !distResolved.isActive
    ? 0
    : distResolved.displayMode === 'exclude'
      ? distResolved.excluded.length
      : distResolved.checked.length;

  const activeFilterCount =
    lines.length + brands.length + items.length + distributorChipCount + drill.length;
  const productScopeBadge =
    items.length > 0
      ? `In ${items.length} Product${items.length > 1 ? 's' : ''}`
      : brands.length > 0
        ? `In ${brands.length} Brand${brands.length > 1 ? 's' : ''}`
        : lines.length > 0
          ? `In ${lines.length} Line${lines.length > 1 ? 's' : ''}`
          : 'Distributor';

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

          {/* Line, Brand & Product Filters */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-indigo-200/70 bg-indigo-50/35 px-2 py-1 dark:border-indigo-500/20 dark:bg-indigo-950/20">
            <span className="rounded-md bg-indigo-500/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-indigo-800 dark:bg-indigo-500/25 dark:text-indigo-200">
              Line, Brand & Product
            </span>
            <SearchableMultiSelect
              label="Line"
              scopeBadge="Latest Period"
              options={availableLines}
              selected={lines}
              onChange={(next) => startTransition(() => setLines(next))}
              placeholder="All Lines"
              accent="purple"
            />
            <ArrowRight className="hidden h-3 w-3 text-indigo-400 sm:inline-block" />
            <SearchableMultiSelect
              label="Brand"
              scopeBadge={lines.length > 0 ? `In ${lines.length} Line${lines.length > 1 ? 's' : ''}` : 'Brand'}
              options={availableBrands}
              selected={brands}
              onChange={(next) => startTransition(() => setBrands(next))}
              placeholder="All Brands"
              accent="indigo"
            />
            <ArrowRight className="hidden h-3 w-3 text-indigo-400 sm:inline-block" />
            <SearchableMultiSelect
              label="Product"
              scopeBadge={
                brands.length > 0
                  ? `In ${brands.length} Brand${brands.length > 1 ? 's' : ''}`
                  : lines.length > 0
                    ? `In ${lines.length} Line${lines.length > 1 ? 's' : ''}`
                    : 'Product'
              }
              options={availableItems}
              selected={items}
              onChange={(next) => startTransition(() => setItems(next))}
              placeholder="All Products"
              accent="cyan"
            />
          </div>

          {/* Distributor Filter (options narrowed by Line/Brand/Product) */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-emerald-200/70 bg-emerald-50/35 px-2 py-1 dark:border-emerald-500/20 dark:bg-emerald-950/20">
            <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-200">
              Distributor
            </span>
            <CheckboxMultiSelect
              label="Distributor"
              scopeBadge={productScopeBadge}
              options={availableDistributors}
              value={distributorFilter}
              onChange={(next) => startTransition(() => setDistributorFilter(next))}
              placeholder="All Distributors"
              accent="emerald"
            />
          </div>
        </div>

        {/* Active Filter Summary Chips + Reset Button */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {lines.map((l) => (
              <span
                key={`l-${l}`}
                className="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/15 px-2 py-0.5 text-[11px] font-semibold text-purple-800 dark:text-purple-200"
              >
                Line: {l}
                <button
                  type="button"
                  onClick={() => startTransition(() => setLines(lines.filter((x) => x !== l)))}
                  aria-label={`Remove line ${l}`}
                  className="rounded-full p-0.5 hover:bg-purple-500/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
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
            {distResolved.displayMode === 'exclude' &&
              distResolved.excluded.map((d) => (
                <span
                  key={`dx-${d}`}
                  title={`Excluded Distributor: ${d}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/35 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:text-amber-200"
                >
                  Excluding: <span className="max-w-[120px] truncate">{d}</span>
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(() =>
                        setDistributorFilter(
                          reincludeCheckboxOption(distributorFilter, availableDistributors, d)
                        )
                      )
                    }
                    aria-label={`Re-include Distributor ${d}`}
                    className="rounded-full p-0.5 hover:bg-amber-500/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            {distResolved.displayMode === 'include' &&
              distResolved.checked.map((d) => (
                <span
                  key={`d-${d}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 dark:text-emerald-200"
                >
                  Distributor: <span className="max-w-[120px] truncate">{d}</span>
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(() =>
                        setDistributorFilter(
                          removeIncludedCheckboxOption(distributorFilter, availableDistributors, d)
                        )
                      )
                    }
                    aria-label={`Remove Distributor ${d}`}
                    className="rounded-full p-0.5 hover:bg-emerald-500/20"
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
