# Worklog & Application Status (`worklog.md`)

**Last Updated**: 2026-10-29
**Application**: Sales Growth Analyzer
**Status**: Healthy — All TypeScript compiler checks (`tsc --noEmit`), Vitest acceptance & export tests (`26/26`), and production Vite build (`npm run build`) pass with zero errors.

---

## 1. Summary of Recent Improvements

### 1.1 Phase 1: Bug Fixes & Design Alignment (2026-10-25)
- **Tailwind Class Corrections**: Replaced invalid `w-68` with `w-72` in `Sidebar.tsx`, and replaced invalid `py-0.2` with `py-0.5` in `Sidebar.tsx` and `Filters.tsx`.
- **Merge Conflict Resolution**: Cleaned up leftover merge conflict markers in `README.md` and normalized documentation references.
- **Color-Blind-Safe Growth Palette**: Made the Okabe-Ito `up` (`#0072B2`) and `down` (`#D55E00`) palette in `tailwind.config.js` the single source of truth. Exposed tokens as CSS custom properties (`--color-up`, `--color-down`) and wired them into UI badges, table progress bars, and Recharts fills.
- **Visual Feedback on Analysis**: Exposed store's `analyzing` state via an indeterminate progress bar on `TopBar.tsx` and a dimmed transition overlay on the active table container during recalculation.

### 1.2 Phase 2: React Performance & State Architecture (2026-10-25)
- **Zustand Selectors & Shallow Comparison**: Wrapped all store subscriptions across components with granular selectors and `useShallow`. Isolates changes to search text, collapse state, and chart modes from triggering table re-renders.
- **Memoized Table Rows**: Extracted `LevelTableRow` in `LevelTable.tsx` into a `React.memo` component with stable primitive props and memoized callbacks (`toggle`, `handleFilter`).
- **Concurrent React 18 Primitives**: Implemented `useDeferredValue` for table filtering and `useTransition` for filter and period updates.
- **Code-Splitting & Lazy Loading**: Split charts and analytical sections via `React.lazy` and `Suspense` with skeleton loaders.
- **Error Boundaries**: Wrapped each chart and level table with `ErrorBoundary.tsx` to provide graceful retry cards on render exceptions.
- **URL Hash Synchronization via `useSyncExternalStore`**: Built `src/lib/hashState.ts` providing bidirectional URL hash sync validated against `DatasetMeta` on load.
- **Worker Cancellation**: Added cancellation RPC in `workerClient.ts` and `data.worker.ts` so superseded analysis requests are aborted in-flight and skipped.

### 1.3 Phase 3: Accessibility & Responsive UI (2026-10-25)
- **Accessible Table Row Expansion**: Replaced chevron icons with accessible `<button aria-expanded aria-controls aria-label>`, added `aria-sort` on sortable `<th>` headers, and set `aria-rowcount`/`aria-rowindex` on virtualized tables.
- **280px Chart Height & Empty States**: Increased chart containers to `h-[280px]` and replaced `return null` with empty-state placeholder cards.
- **Sticky In-Page Jump Bar**: Implemented `TableJumpBar.tsx` for one-click smooth scrolling between visual sections and stacked level tables.
- **KPI Cards Sparkline**: Added a zero-dependency SVG monthly CY-vs-PY sparkline and removed the static `(CY − PY) / |PY|` caption.

### 1.4 Brick Level Table Removal (2026-10-25)
- Removed the Brick table from the main dashboard stacked tables view and the jump bar per user request.
- Preserved Brick computation in the worker and customer attributes so Brick CY and historical `+N` badges on the Customer table continue functioning seamlessly.

### 1.5 Table & KPI Card Refinements (2026-10-25)
- **Distributor Level Exclusion**: Added `EXCLUDED_DISTRIBUTORS = ['Ezaby', 'Ezzaby']` in `src/lib/config.ts` and filtered `Ezaby` out of `levels.distributor` in `src/lib/aggregate.ts` (since its figures are already illustrated in the SubType level table), while computing each table's footer total directly from its displayed rows (`sumRows(rowList)`).
- **Customer Level Column Cleanup**: Removed the `Customer ID` column from the Customer level table UI in `src/components/LevelTable.tsx` to give more horizontal space to Customer Name, Brick (CY), SubType, and metric columns.
- **3-Column KPI Cards Layout**: Removed the standalone Prior Period KPI card in `src/components/KpiCards.tsx`, displayed the Prior Period figure in the metadata line under the Current Period figure, and aligned the 3 KPI cards side-by-side (`sm:grid-cols-3`).

### 1.6 Phase 4 & Phase 5: Analytical Decomposition & Visual Insights Suite (2026-10-25)
- **Shared Color Palette (`src/lib/palette.ts` & `tailwind.config.js`)**:
  - Exposed `--color-up-vivid` and `--color-down-vivid` on `:root` alongside `--color-up`, `--color-up-light`, `--color-down`, `--color-down-light`.
  - Created `src/lib/palette.ts` exporting `SHARED_PALETTE`, `STATUS_LABEL`, `statusColor(status, isDark)`, `growthScaleStyle(growth, isDark)`, `contribPpScaleStyle(pp, isDark)`, and `treemapFillColor(growth, isDark)`.
- **Phase 4 Metrics & Single-Pass Worker Aggregation (`src/lib/metrics.ts` & `src/lib/aggregate.ts`)**:
  - Added pure helpers `unitPrice`, `shareOfTotal`, `contributionPp`, `priceVolumeRow`, and `decomposePriceVolume` in `src/lib/metrics.ts`.
  - Extended single-pass `analyze(ds, query)` in `src/lib/aggregate.ts` to accumulate `territoryMonths` (`TerritoryMonthRow[]`) and `itemAcc` (`Item` level), returning `territoryMonths` and `insights: AnalysisInsights` (`pvmSummary`, `levelPvmSummary`, and `byLevel` across `subtype`, `distributor`, `territory`, `brick`, `item`).
  - Added `fmtPrice` and `fmtSignedPrice` in `src/lib/format.ts`.
- **Visual Analytics + Cross-Cutting Accessibility (`Chart / Table` toggle, `sr-only` summary, dark mode, formatted tooltips via `format.ts`, and empty state with filter reset)**:
  - **Bubble Scatter (`src/components/BubbleScatterChart.tsx`)**: Plots `x = PY`, `y = YoY %`, `size = CY`, and `color = status`; clicking a bubble adds a cross-filter drill chip (`addDrillRow`). Removed the redundant `Drill` column from its table toggle view for cleaner presentation.
  - **CY Value Treemap Colored by Growth (`src/components/CyTreemap.tsx`)**: Recharts `Treemap` sized by `CY Value` and colored by `YoY Value Growth %` from the shared palette (`treemapFillColor`), with level selector and click-to-drill tiles.
  - **Upgraded `MonthChart` to `ComposedChart` (`src/components/MonthChart.tsx`)**: Primary left Y-axis with `PY` / `CY` bars plus a secondary right Y-axis with a `YoY Growth %` line overlay, plus `Chart / Table` toggle on both `MonthChart.tsx` and `GrowthChart.tsx`.

### 1.7 Item-to-Line Reallocation & PY-Only Unallocated Item Removal (2026-10-25)
- **Latest CY Period Item Attribution (`src/lib/aggregate.ts`)**:
  - Added `computeItemAllocations` inside `prepare(ds)` so every row of an `Item` (across both PY and CY) is attributed to the `Line` and `Brand` recorded in that item's latest period in the Current Year (`202609` Sep 2026 first, falling back to `202608`/`202607` if the item had CY activity in Jul/Aug 2026 but no Sep invoice).
  - For example, `Ampofer 100 mg 5 Amp` (which was in `Capital 1` in PY and moved to `Capital 3` in CY) now has all of its PY and CY rows attributed to `Capital 3`.
- **Global Removal of Unallocated PY-Only Items (`src/lib/aggregate.ts`)**:
  - Items that exist only in PY (`2025`) and have no allocation to any Line in CY (`2026`) receive `lineOfItem[it] = -1`, have their rows excluded (`tx[i] = 0`) from all aggregations, and are omitted from `buildMeta(ds)` (`meta.products`, `brandOptions`, `itemOptions`).
  - Ensures that the sum of the 9 Lines reconciles 100% with the `All Lines` total.

### 1.8 Sidebar Removal, Visual Insights Streamlining & Outside-End Data Labels (2026-10-25)
- **Sidebar Removal (`src/pages/Dashboard.tsx`, `src/components/TopBar.tsx`)**:
  - Removed `src/components/Sidebar.tsx` and the mobile drawer trigger in `TopBar.tsx`, expanding the main report to full viewport width without requiring any Sales Line selection while preserving `computeItemAllocations` in `src/lib/aggregate.ts`.
- **Visual Insights Streamlining (`src/pages/Dashboard.tsx`)**:
  - Removed `TerritoryHeatmap.tsx` and `ContributionPriceVolume.tsx` from the dashboard, keeping the collapsible **Visual Insights** section (`#section-insights`) focused on the 2-column grid of **PY vs YoY % Bubble Scatter** (`BubbleScatterChart.tsx`) and **CY Value Treemap** (`CyTreemap.tsx`).
- **Outside-End Data Labels (`src/components/GrowthChart.tsx`, `src/components/MonthChart.tsx`)**:
  - Added Recharts `<LabelList>` outside the end of each horizontal bar in `GrowthChart.tsx` showing `fmtGrowth(d.growth)` with positive/negative positioning and 15% X-axis headroom.
  - Added `<LabelList position="top">` on `PY` and `CY` bars in `MonthChart.tsx` showing compact values (`fmtCompact(val)`) with 16% Y-axis headroom.

### 1.9 Product-Focused Filter Bar & Level Table Excel Export (2026-10-27)
- **Product-Focused Filter Bar (`src/components/Filters.tsx`)**:
  - Simplified `Filters.tsx` into a clean 2-step **Product Filters** bar (**1. Brand** → **2. Item**) with searchable multi-select dropdowns and active filter count/reset, while keeping channel/market/entity cross-filtering (`SubType`, `Chain`, `Distributor`, `Territory`, `Brick`, `Customer`, `Item`) in `DrillChips.tsx`.
- **Excel Export (`src/lib/exportExcel.ts`, `src/lib/exportExcel.test.ts`, `src/components/LevelTable.tsx`)**:
  - Built `exportLevelTableToExcel` and `saveWorkbook` in `src/lib/exportExcel.ts` (using SheetJS `xlsx`) and added an **`Export to Excel`** button on every `LevelTable` header (accessible even when the table is collapsed).
  - Exports visible rows, any expanded `Chain` and `Item` child rows with indentation and `Type`/`Brand` columns, Excel number/percentage formats (`#,##0`, `+#,##0;-#,##0;0`, `+0.0%;-0.0%;0.0%`, `+0.00"%";-0.00"%";0.00"%"`), auto-computed column widths, and a summary Total row.

### 1.10 Dedicated `Chains` Level Table & `EXPANDABLE_SUBTYPES` Refinement (2026-10-28)
- **5th Stacked Level Table — `Chains` (`src/lib/aggregate.ts`, `src/components/LevelTable.tsx`, `src/components/TableJumpBar.tsx`, `src/pages/Dashboard.tsx`)**:
  - Added `chain` (`Chains`) to `LEVELS` and `TABLE_LEVELS = ['subtype', 'distributor', 'chain', 'territory', 'customer']` so 5 stacked level tables are rendered on the dashboard.
  - Filtered empty, `(Unassigned)`, and `(Unassigned / Independent)` chain labels out of `levels.chain` so the `Chains` table lists only named pharmacy chains, with full inline **Item** breakdown expansion and a purple/pink visual theme.
  - Added the `Chains` quick-jump pill to `TableJumpBar.tsx` (`Visual insights + 5 levels stacked`).
- **`EXPANDABLE_SUBTYPES = ['Chain']` (`src/lib/config.ts`, `src/lib/acceptance.test.ts`)**:
  - Updated `EXPANDABLE_SUBTYPES` from `['Chain', 'Private']` to `['Chain']` so only the `Chain` row on the `SubType` table expands into per-chain children (`Private` no longer expands into chains).

### 1.11 Growth Drivers Story Section, LevelTable `Contrib. %` Column & Concentration Chips (2026-10-28 / 2026-10-29)
- **Sortable `Contrib. %` Column on Every `LevelTable` (`src/components/LevelTable.tsx`, `src/lib/aggregate.ts`, `src/lib/exportExcel.ts`, `src/lib/format.ts`)**:
  - Updated `byLevel.distributor` in `src/lib/aggregate.ts` so `contributionPp` across all levels uses the portfolio report total (`totals.pyV` / `totals.pyQ`) as denominator.
  - Added a sortable `'Contrib. %'` (`sortBy: 'contribPp'`, formatted via `fmtPp` with `%` suffix) column to `LevelTable.tsx` with a diverging inline magnitude bar anchored at center (`left: 50%`, colored via `--color-up` / `--color-down`), pinned footer reconciliation (`sumRows(rowList)`), and `'Contrib. %'` column in `exportLevelTableToExcel`.
- **Growth Drivers Narrative, Bridge Waterfall & Top-5 Strip (`src/lib/insights.ts`, `src/components/GrowthDrivers.tsx`)**:
  - Created pure narrative and waterfall engine `src/lib/insights.ts` implementing `buildHeadline` (6 deterministic edge cases), `buildWaterfall` (with `WATERFALL_TOP_N = 8`, residual absorption for excluded distributors so `PY_total + ΣΔ === CY_total` always holds, and `console.assert` invariant check), `rankDrivers`, and `growthConcentration`.
  - Built lazy-loaded `src/components/GrowthDrivers.tsx` (`#section-drivers`, placed directly below `KpiCards`) featuring a segmented level selector (`SubType`, `Distributor`, `Territory`, `Item` persisted in hash `dlv=`), Chart/Table toggle, `sr-only` narrative summary, horizontal Recharts bridge waterfall (`[0, base]` transparent spacer + `[base, top]` colored delta bar), and clickable Top-5 Contributors / Top-5 Detractors strips.
- **Growth Concentration & Single-Entity Dominance Chips (`src/components/GrowthDrivers.tsx`, `src/lib/insights.ts`)**:
  - Computed `topPosShare1`, `topPosShare5`, `topNegShare1`, `topNegShare5`, and `dominance` (`max(Δ_i) / ΣposΔ > 0.5`) in `growthConcentration` and rendered compact stat chips + dominance warning pill below the headline banner.

### 1.12 Customer Dynamics — Retention KPI Strip with Interactive Formula Tooltips, Cohort Bridge & Defector Watchlist (2026-10-28 / 2026-10-29)
- **Customer Lifecycle & Retention Engine (`src/lib/metrics.ts`, `src/lib/aggregate.ts`)**:
  - Added `classifyCustomerSegment` (`GROWTH_BAND = 0.05`: `new`, `growing`, `stable`, `declining`, `lost`) and `computeCustomerInsights` in `src/lib/metrics.ts`, precomputing both `value` and `units` views in `result.customerInsights` (`active`, `nrr`, `grr`, `churnRate`, `contractionRate`, `expansionRate`, `newRate`, `avgPerActive`, `segments`).
  - Guaranteed exact retention identity `GRR + ContractionRate + ChurnRate === 1` (`|1 - (grr + contractionRate + churnRate)| < 1e-9`) and `Σ segment.delta === totals.cy - totals.py`.
- **Customer Dynamics Panel & KPI Info Tooltips (`src/components/CustomerDynamics.tsx`)**:
  - Placed `#section-customer-dynamics` directly above the Customer `LevelTable` (and added `Drivers` and `Customer Dynamics` pills to `TableJumpBar.tsx`).
  - Rendered a 6-card retention KPI strip (`Active Customers`, `Avg / Active (Value / Units)`, `Net Retention (NRR)`, `Gross Retention (GRR)`, `Lost Churn Rate`, and `New-Business Rate`), where each card includes an accessible **`KpiInfoTooltip`** (`i` icon button + hover/focus popover) displaying its plain-English definition and exact calculation formula (`How it's calculated`).
  - Built an interactive 5-row lifecycle breakdown table (`New`, `Growing (>+5%)`, `Stable (±5%)`, `Declining (<-5%)`, `Lost`) with `Contrib. %` that filters the Customer `LevelTable` and scrolls smoothly to `#table-customer`.
  - Built a Top-10 Lost Customers **Defector Watchlist** with inline `analyzeItems` PY product expansion, one-click customer drill filter button, and `.xlsx` export (`exportDefectorWatchlistToExcel`).

### 1.13 Returns-Rate Tracking & Flags + HPG Brand Logo in Header (2026-10-28 / 2026-10-29)
- **Single-Pass Gross & Returns Tracking (`src/lib/aggregate.ts`, `src/lib/metrics.ts`, `src/components/LevelTable.tsx`, `src/lib/exportExcel.ts`)**:
  - Extended `analyze()` and `analyzeItems()` in `src/lib/aggregate.ts` to accumulate `gross: Sums` (`TransactionType === 'Sales'`) on every `GroupRow` and `grossTotals: Sums` on `AnalysisResult` in the same typed-array pass without adding extra loops.
  - Added `deriveReturnsSums`, `returnsRatePct`, and `isReturnsFlagged` (`RETURNS_FLAG_FACTOR = 1.5`, `RETURNS_MIN_GROSS = 10_000`) in `src/lib/metrics.ts`.
  - Added a portfolio returns-rate chip (`Returns rate: X.X% (PY Y.Y%)`, highlighted when `> 1.25×` PY rate) to `GrowthDrivers.tsx`.
  - Added a `"Show returns"` toolbar checkbox (`ret=1` in URL hash) on every `LevelTable` that reveals a sortable `'Returns %'` column with a warning badge when a row's returns rate exceeds `1.5×` the portfolio rate and `CY Gross ≥ 10,000 EGP`, plus `CY Gross`, `CY Returns`, and `Returns %` columns in `exportLevelTableToExcel`.
- **HPG Brand Logo in Header (`public/hpg-logo.jpg`, `src/components/TopBar.tsx`)**:
  - Copied the official **HPG (Hefny Pharma Group)** logo into `public/hpg-logo.jpg` and integrated it into the left brand section of `TopBar.tsx`.

---

## 2. Codebase Inventory & Review Status

| File | Role | Status |
| :--- | :--- | :--- |
| `src/lib/config.ts` | Constants (`EXPANDABLE_SUBTYPES = ['Chain']`, `EXCLUDED_DISTRIBUTORS`, `GROWTH_BAND`, `WATERFALL_TOP_N`, `PARETO_TOP_N`, `RETURNS_FLAG_FACTOR`, `RETURNS_MIN_GROSS`) | Updated & Verified |
| `src/lib/columnar.ts` | Dictionary-encoded `StrColumn` & `Float64Array` `NumColumn` dataset codec + validation | Clean |
| `src/lib/parse.ts` | Streaming `.xlsx` parser (`fflate` + chunked XML scanner) | Clean |
| `src/lib/periods.ts` | Quarter/Month period resolution & like-for-like month matching | Clean |
| `src/lib/palette.ts` | Shared color-blind-safe palette tokens, `growthScaleStyle`, `contribPpScaleStyle`, and `treemapFillColor` | Updated & Verified |
| `src/lib/metrics.ts` | `Units` & `Value` metric helpers, YoY Growth, `Contrib. %`, PVM, Customer retention/segments, and Returns helpers | Updated & Verified |
| `src/lib/insights.ts` | Deterministic headline builder, waterfall builder, driver ranker, and growth concentration metrics | New & Verified |
| `src/lib/format.ts` | Number, currency (`EGP`), unit price (`fmtPrice`), signed delta, percentage, and `Contrib. %` (`fmtPp`) formatters | Updated & Verified |
| `src/lib/aggregate.ts` | Single-pass 5-level aggregator (`subtype`, `distributor`, `chain`, `territory`, `customer`), CY item-to-line reallocation, `gross`/`grossTotals`, `customerInsights`, `insights`, `analyzeItems` | Updated & Verified |
| `src/lib/hashState.ts` | URL hash serialization (`dlv`, `ret`, `hmm`), parsing, `DatasetMeta` validation, and `useSyncExternalStore` subscription | Updated & Verified |
| `src/lib/exportExcel.ts` | Excel (`.xlsx`) export for `LevelTable` (`Contrib. %` + optional returns columns) and Defector Watchlist (`exportDefectorWatchlistToExcel`) | Updated & Verified |
| `src/lib/acceptance.test.ts` | 23 Vitest acceptance, invariant, Territory×Month, Contribution, PVM, Item reallocation, Chains level, Waterfall, Customer Dynamics & Returns tests | 23/23 Passing |
| `src/lib/exportExcel.test.ts` | 3 Vitest tests verifying `.xlsx` export headers, row calculations, and optional returns columns | 3/3 Passing |
| `src/workers/data.worker.ts` | Web Worker hosting dataset, `analyze`, `analyzeItems`, and request cancellation | Verified |
| `src/workers/workerClient.ts` | Promise RPC wrapper for `data.worker.ts` with abort/cancellation tracking | Verified |
| `src/store/useDashboardStore.ts` | Zustand store (`driverLevel`, `showReturns`, `heatmapMode`, `customerStatusFilter`, filters, URL hash sync) | Updated & Verified |
| `src/components/TopBar.tsx` | Header with HPG logo (`public/hpg-logo.jpg`), period banner, Units/Value toggle, period controls, progress bar | Updated & Verified |
| `src/components/Filters.tsx` | Streamlined 2-step cascading Product Filters bar (`1. Brand` → `2. Item`) with transitions | Updated & Verified |
| `src/components/DrillChips.tsx` | Active cross-filter chip bar (`SubType`, `Chain`, `Distributor`, `Territory`, `Brick`, `Customer`, `Item`) | Verified |
| `src/components/KpiCards.tsx` | 3 KPI summary cards with live monthly CY-vs-PY mini sparklines | Verified |
| `src/components/GrowthDrivers.tsx` | Narrative headline banner, concentration/returns chips, horizontal bridge waterfall, Top-5 contributors/detractors | New & Verified |
| `src/components/MonthChart.tsx` | Upgraded `ComposedChart`: PY/CY bars with outside-end labels + YoY % line on secondary axis, Chart/Table toggle | Verified |
| `src/components/GrowthChart.tsx` | Top-10 horizontal YoY bar chart with shared palette, outside-end labels, Chart/Table toggle | Verified |
| `src/components/BubbleScatterChart.tsx` | Bubble scatter (`x=PY, y=YoY%, size=CY, color=status`) with click-to-drill & Chart/Table toggle | Updated & Verified |
| `src/components/CyTreemap.tsx` | CY Value Treemap colored by YoY growth from shared palette with click-to-drill & Treemap/Table toggle | Verified |
| `src/components/CustomerDynamics.tsx` | 6-card retention KPI strip with interactive `KpiInfoTooltip` formula popovers, clickable 5-segment cohort bridge table, and Top-10 Lost Defector Watchlist | New & Verified |
| `src/components/TableJumpBar.tsx` | Sticky in-page navigation bar (`Filters / Top · Drivers · Insights · SubType · Distributor · Chains · Territory · Customer Dynamics · Customer`) | Updated & Verified |
| `src/components/ErrorBoundary.tsx` | React error boundary component with retry support for charts and tables | Verified |
| `src/components/LevelTable.tsx` | Virtualized 5-level table (`SubType`, `Distributor`, `Chains`, `Territory`, `Customer`) with `Contrib. %` diverging bars, `.xlsx` export, optional `Returns %` column & flags, and 5-segment customer filter | Updated & Verified |
| `src/pages/Dashboard.tsx` | Main page layout assembling header, product filters, KPIs, `#section-drivers`, primary charts, `#section-insights`, `#section-customer-dynamics`, and 5 stacked level tables | Updated & Verified |

---

## 3. Verification Results & Bundle Size Deltas

- **TypeScript Check (`npm run typecheck`)**: Passed (`0` errors).
- **Automated Tests (`npm run test`)**: Passed (`26/26` tests across `src/lib/acceptance.test.ts` (23 tests) and `src/lib/exportExcel.test.ts` (3 tests)).
- **Production Build (`npm run build`)**: Passed cleanly in `5.55s` with zero new runtime dependencies. Lazy-loaded chunk sizes:
  - `GrowthDrivers-*.js`: `22.29 kB` (`6.70 kB` gzip)
  - `CustomerDynamics-*.js`: `25.42 kB` (`6.20 kB` gzip)
  - `MonthChart-*.js`: `31.65 kB` (`8.94 kB` gzip)
  - `CyTreemap-*.js`: `31.43 kB` (`10.91 kB` gzip)
  - `BubbleScatterChart-*.js`: `10.55 kB` (`3.37 kB` gzip)
  - `GrowthChart-*.js`: `8.46 kB` (`2.95 kB` gzip)
  - `data.worker-*.js`: `37.19 kB`
