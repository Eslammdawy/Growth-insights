# Worklog & Application Status (`worklog.md`)

**Last Updated**: 2026-10-25
**Application**: Sales Growth Analyzer
**Status**: Healthy — All TypeScript compiler checks (`tsc --noEmit`), Vitest acceptance tests (`16/16`), and production Vite build (`npm run build`) pass with zero errors.

---

## 1. Summary of Recent Improvements (2026-10-25)

### 1.1 Phase 1: Bug Fixes & Design Alignment
- **Tailwind Class Corrections**: Replaced invalid `w-68` with `w-72` in `Sidebar.tsx`, and replaced invalid `py-0.2` with `py-0.5` in `Sidebar.tsx` and `Filters.tsx`.
- **Merge Conflict Resolution**: Cleaned up leftover merge conflict markers in `README.md` and normalized documentation references.
- **Color-Blind-Safe Growth Palette**: Made the Okabe-Ito `up` (`#0072B2`) and `down` (`#D55E00`) palette in `tailwind.config.js` the single source of truth. Exposed tokens as CSS custom properties (`--color-up`, `--color-down`) and wired them into UI badges, table progress bars, and Recharts fills.
- **Visual Feedback on Analysis**: Exposed store's `analyzing` state via an indeterminate progress bar on `TopBar.tsx` and a dimmed transition overlay on the active table container during recalculation.

### 1.2 Phase 2: React Performance & State Architecture
- **Zustand Selectors & Shallow Comparison**: Wrapped all store subscriptions across components with granular selectors and `useShallow`. Isolates changes to search text, sidebar collapse state, and chart modes from triggering table re-renders.
- **Memoized Table Rows**: Extracted `LevelTableRow` in `LevelTable.tsx` into a `React.memo` component with stable primitive props and memoized callbacks (`toggle`, `handleFilter`).
- **Concurrent React 18 Primitives**: Implemented `useDeferredValue` for table filtering and `useTransition` for line, filter, and period updates.
- **Code-Splitting & Lazy Loading**: Split charts (`MonthChart`, `GrowthChart`, `BubbleScatterChart`, `TerritoryHeatmap`, `CyTreemap`, `ContributionPriceVolume`) via `React.lazy` and `Suspense` with skeleton loaders.
- **Error Boundaries**: Wrapped each chart and level table with `ErrorBoundary.tsx` to provide graceful retry cards on render exceptions.
- **URL Hash Synchronization via `useSyncExternalStore`**: Built `src/lib/hashState.ts` providing bidirectional URL hash sync (`metric`, `line`, `year`, `q`, `m`, `lfl`, `brands`, `items`, `mainTypes`, `txTypes`, `drill`) validated against `DatasetMeta` on load.
- **Worker Cancellation**: Added cancellation RPC in `workerClient.ts` and `data.worker.ts` so superseded analysis requests are aborted in-flight and skipped.

### 1.3 Phase 3: Accessibility & Responsive UI
- **Accessible Table Row Expansion**: Replaced chevron icons with accessible `<button aria-expanded aria-controls aria-label>`, added `aria-sort` on sortable `<th>` headers, and set `aria-rowcount`/`aria-rowindex` on virtualized tables.
- **Accessible Sidebar Navigation**: Removed misleading `role="tablist"`/`role="tab"` semantics; enabled arrow-key navigation that focuses buttons without firing premature calculations until confirmed.
- **Off-Canvas Mobile Drawer**: Added responsive drawer behavior below `md` (< 768px) with backdrop overlay and a hamburger menu trigger in `TopBar.tsx`.
- **280px Chart Height & Empty States**: Increased chart containers to `h-[280px]` and replaced `return null` with empty-state placeholder cards.
- **Sticky In-Page Jump Bar**: Implemented `TableJumpBar.tsx` for one-click smooth scrolling between the Visual Insights section and active stacked tables (`Insights`, `SubType`, `Distributor`, `Territory`, `Customer`).
- **KPI Cards Sparkline**: Added a zero-dependency SVG monthly CY-vs-PY sparkline and removed the static `(CY − PY) / |PY|` caption.

### 1.4 Brick Level Table Removal
- Defined `TABLE_LEVELS = ['subtype', 'distributor', 'territory', 'customer']` in `src/lib/aggregate.ts`.
- Removed the Brick table from the main dashboard stacked tables view and the jump bar per user request.
- Preserved Brick computation in the worker and customer attributes so Brick CY and historical `+N` badges on the Customer table continue functioning seamlessly.

### 1.5 Table & KPI Card Refinements
- **Distributor Level Exclusion**: Added `EXCLUDED_DISTRIBUTORS = ['Ezaby', 'Ezzaby']` in `src/lib/config.ts` and filtered `Ezaby` out of `levels.distributor` in `src/lib/aggregate.ts` (since its figures are already illustrated in the SubType level table), while computing each table's footer total directly from its displayed rows (`sumRows(rowList)`).
- **Customer Level Column Cleanup**: Removed the `Customer ID` column from the Customer level table in `src/components/LevelTable.tsx` to give more horizontal space to Customer Name, Brick (CY), SubType, and metric columns.
- **3-Column KPI Cards Layout**: Removed the standalone Prior Period KPI card in `src/components/KpiCards.tsx`, displayed the Prior Period figure in the metadata line under the Current Period figure, and aligned the 3 KPI cards side-by-side (`sm:grid-cols-3`).

### 1.6 Phase 4 & Phase 5: Analytical Decomposition & Visual Insights Suite
- **Shared Color Palette (`src/lib/palette.ts` & `tailwind.config.js`)**:
  - Exposed `--color-up-vivid` and `--color-down-vivid` on `:root` alongside `--color-up`, `--color-up-light`, `--color-down`, `--color-down-light`.
  - Created `src/lib/palette.ts` exporting `SHARED_PALETTE`, `STATUS_LABEL`, `statusColor(status, isDark)`, `growthScaleStyle(growth, isDark)`, and `treemapFillColor(growth, isDark)`.
- **Phase 4 Metrics & Single-Pass Worker Aggregation (`src/lib/metrics.ts` & `src/lib/aggregate.ts`)**:
  - Added pure helpers `unitPrice`, `shareOfTotal`, `contributionPp`, `priceVolumeRow`, and `decomposePriceVolume` in `src/lib/metrics.ts`.
  - Extended single-pass `analyze(ds, query)` in `src/lib/aggregate.ts` to accumulate `territoryMonths` (`TerritoryMonthRow[]`) and `itemAcc` (`Item` level), returning `territoryMonths` and `insights: AnalysisInsights` (`pvmSummary`, `levelPvmSummary`, and `byLevel` across `subtype`, `distributor`, `territory`, `brick`, `item`).
  - Added `fmtPrice` and `fmtSignedPrice` in `src/lib/format.ts`.
- **5 Visual Analytics + Cross-Cutting Accessibility (`Chart / Table` toggle, `sr-only` summary, dark mode, formatted tooltips via `format.ts`, and empty state with filter reset)**:
  1. **Bubble Scatter (`src/components/BubbleScatterChart.tsx`)**: Plots `x = PY`, `y = YoY %`, `size = CY`, and `color = status`; clicking a bubble adds a cross-filter drill chip (`addDrillRow`).
  2. **Territory × Month YoY % Heatmap (`src/components/TerritoryHeatmap.tsx`)**: Responsive CSS grid colored via `growthScaleStyle` from the shared palette, with territory search, Top-N selector, live hover summary bar, and click-to-drill territory rows.
  3. **CY Value Treemap Colored by Growth (`src/components/CyTreemap.tsx`)**: Recharts `Treemap` sized by `CY Value` and colored by `YoY Value Growth %` from the shared palette (`treemapFillColor`), with level selector and click-to-drill tiles.
  4. **Upgraded `MonthChart` to `ComposedChart` (`src/components/MonthChart.tsx`)**: Primary left Y-axis with `PY` / `CY` bars plus a secondary right Y-axis with a `YoY Growth %` line overlay, plus `Chart / Table` toggle on both `MonthChart.tsx` and `GrowthChart.tsx`.
  5. **Contribution-to-Growth & Price / Volume Cards and Table (`src/components/ContributionPriceVolume.tsx`)**: Reads from `result.insights` to display 4 portfolio decomposition cards (Total Value YoY Δ & Avg Price, Item-Level Volume Effect + Pure Vol/Mix, Item-Level Price Effect, and New/Lost Items Effect) plus an interactive multi-level table and stacked bar chart toggle.
- **Dashboard Integration (`src/pages/Dashboard.tsx` & `src/components/TableJumpBar.tsx`)**:
  - Added a collapsible **Visual Insights & Phase 4 Decomposition** section (`#section-insights`, expanded by default) with lazy-loaded components wrapped in `ErrorBoundary` and `Suspense`, and added an `Insights` jump button to `TableJumpBar.tsx`.

### 1.7 Item-to-Line Reallocation & PY-Only Unallocated Item Removal
- **Latest CY Period Item Attribution (`src/lib/aggregate.ts`)**:
  - Added `computeItemAllocations` inside `prepare(ds)` so every row of an `Item` (across both PY and CY) is attributed to the `Line` and `Brand` recorded in that item's latest period in the Current Year (`202609` Sep 2026 first, falling back to `202608`/`202607` if the item had CY activity in Jul/Aug 2026 but no Sep invoice).
  - For example, `Ampofer 100 mg 5 Amp` (which was in `Capital 1` in PY and moved to `Capital 3` in CY) now has all of its PY and CY rows attributed to `Capital 3`.
- **Global Removal of Unallocated PY-Only Items (`src/lib/aggregate.ts`)**:
  - Items that exist only in PY (`2025`) and have no allocation to any Line in CY (`2026`) receive `lineOfItem[it] = -1`, have their rows excluded (`tx[i] = 0`) from all aggregations (`All Lines`, per-Line badges, KPIs, monthly charts, level tables, and Phase 4 Price/Volume/Mix decomposition), and are omitted from `buildMeta(ds)` (`meta.products`, `brandOptions`, `itemOptions`).
  - Ensures that the sum of the 9 Lines reconciles 100% with the `All Lines` total.

---

## 2. Codebase Inventory & Review Status

| File | Role | Status |
| :--- | :--- | :--- |
| `src/lib/config.ts` | Constants (`EXPANDABLE_SUBTYPES`, `REQUIRED_COLUMNS`, `TX_TYPES`, `SAMPLE_DATA_URL`) | Clean |
| `src/lib/columnar.ts` | Dictionary-encoded `StrColumn` & `Float64Array` `NumColumn` dataset codec + validation | Clean |
| `src/lib/parse.ts` | Streaming `.xlsx` parser (`fflate` + chunked XML scanner) | Clean |
| `src/lib/periods.ts` | Quarter/Month period resolution & like-for-like month matching | Clean |
| `src/lib/palette.ts` | Shared color-blind-safe palette tokens, heatmap CSS scale, and treemap fill helpers | New & Verified |
| `src/lib/metrics.ts` | `Units` & `Value` metric helpers, YoY Growth, Contribution (pp), and Price/Volume/Mix decomposition | Updated & Verified |
| `src/lib/format.ts` | Number, currency (`EGP`), unit price (`fmtPrice`), signed delta, percentage, and `pp` formatters | Updated & Verified |
| `src/lib/aggregate.ts` | Single-pass multi-level aggregator, CY item-to-line reallocation, `territoryMonths` matrix, Phase 4 `insights`, `analyzeItems` | Updated & Verified |
| `src/lib/hashState.ts` | URL hash serialization, parsing, `DatasetMeta` validation, and `useSyncExternalStore` subscription | Verified |
| `src/lib/acceptance.test.ts` | 16 Vitest acceptance, invariant, Territory×Month, Contribution, PVM decomposition, and Item-to-Line reallocation tests | 16/16 Passing |
| `src/workers/data.worker.ts` | Web Worker hosting dataset, `analyze`, `analyzeItems`, and request cancellation | Verified |
| `src/workers/workerClient.ts` | Promise RPC wrapper for `data.worker.ts` with abort/cancellation tracking | Verified |
| `src/store/useDashboardStore.ts` | Zustand store (selectors, filters, period, drill chips, cached `itemsByRow`, URL hash sync) | Verified |
| `src/components/TopBar.tsx` | Header with period banner, Units/Value toggle, period controls, mobile menu button, progress bar | Verified |
| `src/components/Sidebar.tsx` | Sales Line navigation with arrow key navigation, YoY % badges, off-canvas mobile drawer | Verified |
| `src/components/Filters.tsx` | Per-Line `Brand`/`Item` multi-selects + global `MainType`/`TransactionType` filters with transitions | Verified |
| `src/components/DrillChips.tsx` | Active cross-filter chip bar with transitions | Verified |
| `src/components/KpiCards.tsx` | 3 KPI summary cards with live monthly CY-vs-PY mini sparklines | Verified |
| `src/components/MonthChart.tsx` | Upgraded `ComposedChart`: PY/CY bars + YoY % line on secondary axis, Chart/Table toggle | Updated & Verified |
| `src/components/GrowthChart.tsx` | Top-10 horizontal YoY bar chart with shared palette, Chart/Table toggle, and empty state | Updated & Verified |
| `src/components/BubbleScatterChart.tsx` | Bubble scatter (`x=PY, y=YoY%, size=CY, color=status`) with click-to-drill & Chart/Table toggle | New & Verified |
| `src/components/TerritoryHeatmap.tsx` | CSS grid `Territory × Month` YoY % heatmap with shared palette scale & Heatmap/Table toggle | New & Verified |
| `src/components/CyTreemap.tsx` | CY Value Treemap colored by YoY growth from shared palette with click-to-drill & Treemap/Table toggle | New & Verified |
| `src/components/ContributionPriceVolume.tsx` | Phase 4 Contribution-to-Growth & Price/Volume/Mix cards, multi-level table, and stacked chart toggle | New & Verified |
| `src/components/TableJumpBar.tsx` | Sticky in-page navigation bar scrolling to `#section-insights` and each stacked level table | Updated & Verified |
| `src/components/ErrorBoundary.tsx` | React error boundary component with retry support for charts and tables | Verified |
| `src/components/LevelTable.tsx` | Virtualized level table with memoized rows, deferred search, accessible buttons, and ARIA attributes | Verified |
| `src/pages/Dashboard.tsx` | Main page layout assembling sidebar drawer, header, filters, KPIs, charts, `#section-insights`, and tables | Updated & Verified |

---

## 3. Verification Results

- **TypeScript Check (`npm run typecheck`)**: Passed (`0` errors).
- **Automated Tests (`npm run test`)**: Passed (`16/16` tests in `src/lib/acceptance.test.ts`, including multi-level totals, SubType chain children, per-row Item drill-down, like-for-like period matching, growth edge cases, per-Line filter scoping, Bonus exclusion, Customer CY Brick/Territory unification, URL hash round-trip, Territory × Month matrix reconciliation, Phase 4 Contribution-to-Growth reconciliation, Price/Volume/Mix additivity + edge cases, and CY Item-to-Line reallocation + unallocated PY-only item removal).
- **Production Build (`npm run build`)**: Passed cleanly with asynchronous code-split chunks for all visual components (`MonthChart`, `GrowthChart`, `BubbleScatterChart`, `TerritoryHeatmap`, `CyTreemap`, `ContributionPriceVolume`).
