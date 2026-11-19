# Worklog & Application Status (`worklog.md`)

**Last Updated**: 2026-11-19
**Application**: Sales Growth Analyzer
**Status**: Healthy — All TypeScript compiler checks (`tsc --noEmit`), Vitest unit, acceptance, export & converter tests (`46/46`), and production Vite build (`npm run build`) pass with zero errors.

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

### 1.14 Product × Customer-Segment Exposure Matrix & Customer-Behavior Growth Decomposition (2026-11-05)
- **Single-Pass Item × Customer Accumulation & Product-Side Math (`src/lib/metrics.ts`, `src/lib/aggregate.ts`)**:
  - Extended the single-pass `analyze()` loop in `src/lib/aggregate.ts` to populate a sparse `itemCustMap` (`item * nCust + cust → Sums`), followed by a post-loop finalisation step (`buildProductExposure`) over that map (for both `value` and `units` metrics) that rolls Item breakdowns up to `Brand` (`p.itemBrand`) and `Line` (`p.itemLine`).
  - Added pure helpers `buildProductSegmentBreakdown`, `decomposeCustomerBehavior`, `mergeCustomerBehaviorRows`, and `buildProductBehaviorWaterfall` in `src/lib/metrics.ts`.
  - **Enhancement 1 (Exposure Matrix)**: For each `Item`, `Brand`, and `Line`, buckets each `(product, customer)` pair into the customer's overall lifecycle segment (`New`, `Growing`, `Stable`, `Declining`, `Lost`) and computes signed percentage-point contributions (`segment Δ ÷ |product PY| × 100`), guaranteeing `Σ segments.delta === product.totals.delta` and `Σ signed segment pp === product YoY %`.
  - **Enhancement 2 (Customer-Behavior Decomposition)**: Decomposes each item's YoY Δ across its own customers into `newCustomerEffect + expansionEffect + contractionEffect + lostCustomerEffect === totalDelta` (`PY → +New → +Expansion → −Contraction → −Lost → CY`), and sums item-level effects up to Brand and Line.
- **Interactive `ProductCustomerExposure` Component & Shared `KpiInfoTooltip` (`src/components/ProductCustomerExposure.tsx`, `src/components/KpiInfoTooltip.tsx`, `src/pages/Dashboard.tsx`)**:
  - Extracted `KpiInfoTooltip` into `src/components/KpiInfoTooltip.tsx` and reused it across `CustomerDynamics.tsx` and `ProductCustomerExposure.tsx`.
  - Lazy-loaded `ProductCustomerExposure.tsx` inside `#section-customer-dynamics` directly below `CustomerDynamics.tsx` with `Item` / `Brand` / `Line` level selector (`pel=`), quick-view chips (`All`, `Top 10 churn-exposed`, `Top 10 new-customer-driven` persisted via `pev=`), `Chart / Table` toggle, sortable columns with `aria-sort`, proportional 5-segment Δ bars, inline expandable 6-step Recharts bridge waterfall, and `.xlsx` export (`exportProductExposureToExcel`).

---

## 2. Codebase Inventory & Review Status

| File | Role | Status |
| :--- | :--- | :--- |
| `src/lib/config.ts` | Constants (`EXPANDABLE_SUBTYPES = ['Chain']`, `EXCLUDED_DISTRIBUTORS`, `GROWTH_BAND`, `WATERFALL_TOP_N`, `RETURNS_FLAG_FACTOR`, `RETURNS_MIN_GROSS`) | Updated & Verified |
| `src/lib/columnar.ts` | Dictionary-encoded `StrColumn` & `Float64Array` `NumColumn` dataset codec + validation | Clean |
| `src/lib/parse.ts` | Streaming `.xlsx` parser (`fflate` + chunked XML scanner) | Clean |
| `src/lib/periods.ts` | Quarter/Month period resolution & like-for-like month matching | Clean |
| `src/lib/palette.ts` | Shared color-blind-safe palette tokens, `growthScaleStyle`, `contribPpScaleStyle`, and `treemapFillColor` | Updated & Verified |
| `src/lib/metrics.ts` | `Units` & `Value` metric helpers, YoY Growth, `Contrib. %`, PVM, Customer retention/segments, and Returns helpers | Updated & Verified |
| `src/lib/insights.ts` | Deterministic headline builder, waterfall builder, driver ranker, and growth concentration metrics | New & Verified |
| `src/lib/format.ts` | Number, currency (`EGP`), unit price (`fmtPrice`), signed delta, percentage, and `Contrib. %` (`fmtPp`) formatters | Updated & Verified |
| `src/lib/aggregate.ts` | Single-pass 5-level aggregator (`subtype`, `distributor`, `chain`, `territory`, `customer`), CY item-to-line reallocation, `excludeDistributors`, `gross`/`grossTotals`, `customerInsights`, `insights`, `analyzeItems` | Updated & Verified |
| `src/lib/checkboxFilter.ts` | Pure state engine for Excel-style checkbox filters (`ALL_CHECKED`, `resolveCheckboxFilter`, `toggleCheckboxOption`, `selectOnlyCheckboxOption`, `toggleAllCheckboxOptions`, `pruneCheckboxFilter`) | New & Verified |
| `src/lib/checkboxFilter.test.ts` | 8 Vitest unit tests covering checkbox toggling, `Only`, draft-empty handling, smart `exclude`/`include` display mode, and sticky scope pruning | 8/8 Passing |
| `src/lib/hashState.ts` | URL hash serialization (`dlv`, `ret`, `hmm`, `excludeDistributors`), parsing, `DatasetMeta` validation, and `useSyncExternalStore` subscription | Updated & Verified |
| `src/lib/exportExcel.ts` | Excel (`.xlsx`) export for `LevelTable` and Defector Watchlist (`exportDefectorWatchlistToExcel`) | Updated & Verified |
| `src/lib/acceptance.test.ts` | 29 Vitest acceptance, invariant, Territory×Month, Contribution, PVM, Item reallocation, Chains level, Waterfall, Customer Dynamics, SubType/Chain normalization (`Ezzaby`, `Chain`, `Retail → Private`, `Stores+Private`), Exclude-Distributor & Returns tests | 29/29 Passing |
| `src/lib/exportExcel.test.ts` | 5 Vitest tests verifying `.xlsx` export headers, row calculations, optional returns columns, and all-levels export | 5/5 Passing |
| `src/workers/data.worker.ts` | Web Worker hosting dataset, `analyze`, `analyzeItems`, and request cancellation | Verified |
| `src/workers/workerClient.ts` | Promise RPC wrapper for `data.worker.ts` with abort/cancellation tracking | Verified |
| `src/store/useDashboardStore.ts` | Zustand store (`driverLevel`, `showReturns`, `heatmapMode`, `customerStatusFilter`, `excludedDistributors`, filters, URL hash sync) | Updated & Verified |
| `src/components/TopBar.tsx` | Header with HPG logo (`public/hpg-logo.jpg`), period banner, Units/Value toggle, period controls, progress bar | Updated & Verified |
| `src/components/CheckboxMultiSelect.tsx` | Shared Excel-style searchable checkbox dropdown with tri-state `Select all`, per-row `Only`, draft-empty handling, and smart `Except`/`N of M` summary | New & Verified |
| `src/components/Filters.tsx` | Guide Report banner (`Line → Brand → Product` multi-select + Excel-style `Distributor` checkbox filter with smart `Excluding:` / `Distributor:` chips) | Updated & Verified |
| `src/components/DrillChips.tsx` | Active cross-filter chip bar (`SubType`, `Chain`, `Distributor`, `Territory`, `Brick`, `Customer`, `Item`) | Verified |
| `src/components/KpiCards.tsx` | 3 KPI summary cards with live monthly CY-vs-PY mini sparklines | Verified |
| `src/components/KpiInfoTooltip.tsx` | Accessible hover/focus formula & definition popover shared across KPI cards and table headers | New & Verified |
| `src/components/GrowthDrivers.tsx` | Narrative headline banner, concentration/returns chips, horizontal bridge waterfall, Top-5 contributors/detractors | New & Verified |
| `src/components/MonthChart.tsx` | Upgraded `ComposedChart`: PY/CY bars with outside-end labels + YoY % line on secondary axis, Chart/Table toggle | Verified |
| `src/components/GrowthChart.tsx` | Top-10 horizontal YoY bar chart with shared palette, outside-end labels, Chart/Table toggle | Verified |
| `src/components/BubbleScatterChart.tsx` | Bubble scatter (`x=PY, y=YoY%, size=CY, color=status`) with click-to-drill & Chart/Table toggle | Updated & Verified |
| `src/components/CyTreemap.tsx` | CY Value Treemap colored by YoY growth from shared palette with click-to-drill & Treemap/Table toggle | Verified |
| `src/components/CustomerDynamics.tsx` | 4-card retention KPI strip with interactive `KpiInfoTooltip` formula popovers, Excel-style `SubType` checkbox filter, clickable 5-segment cohort bridge table, and Top-10 Lost Defector Watchlist | Updated & Verified |
| `src/components/TableJumpBar.tsx` | Sticky in-page navigation bar (`Filters / Top · Drivers · SubType · Chains · Territory · Customer Dynamics · Customer`) + 4-level `Export All Levels` | Updated & Verified |
| `src/components/ErrorBoundary.tsx` | React error boundary component with retry support for charts and tables | Verified |
| `src/components/LevelTable.tsx` | Virtualized 4-level table (`SubType`, `Chains`, `Territory`, `Customer`) with `Contrib. %` diverging bars, `.xlsx` export, optional `Returns %` column & flags, 5-segment customer filter, and filtered subtotal `<tfoot>` | Updated & Verified |
| `src/pages/Dashboard.tsx` | Main page layout assembling header, product filters, KPIs, `#section-drivers`, primary charts, `#section-insights`, `#section-customer-dynamics` (`CustomerDynamics`), and 4 stacked level tables | Updated & Verified |
| `scripts/convert.ts` | Streaming `.xlsx` converter with `round4` and `optimizeDataset` (`REQUIRED_COLUMNS`, active `Sales`/`Return Sales` filtering, dictionary compaction, Item-first sort) | Updated & Verified |
| `scripts/convert.test.ts` | 4 Vitest unit & parity tests covering `round4`, `optimizeDataset`, dictionary compaction, sort order, and fixture parity | New & Verified (4/4 Passing) |

### 1.12 Inclusive Product Allocation (Counting All Products Regardless of CY Activity) (2026-11-12)
- **Universal Product Inclusion (`src/lib/aggregate.ts`)**:
  - Updated `computeItemAllocations` in `prepare(ds)`: Products with sales in PY that do not have invoices in CY are no longer excluded (`tx[i] = 0`). Instead, they fall back to their latest period in PY to attribute their effective `Line` and `Brand`.
  - Products with PY sales and zero CY sales are now fully counted across all views, tables, charts, customer dynamics, defector watchlists, PVM waterfalls, and Excel exports, categorized with status `'lost'` (YoY % = `-100.0%`, Δ = `−PY`).
  - Updated test suite (`src/lib/acceptance.test.ts`) to verify that discontinued / PY-only products are included, attributed to their latest PY line, and reflected across all summary totals. All 43 test assertions pass.

### 1.15 Guide Report Multi-Select Line Filter & Latest-Period Line Structure (2026-11-17)
- **Multi-Line Engine & Options (`src/lib/aggregate.ts`)**:
  - Added `lines?: string[]` to `AnalysisQuery` and `lines: string[]` to `CascadingFilterOptions`, with `buildContext` resolving `activeLines` from `query.lines` or legacy `query.line`.
  - Updated `brandOptions` and `itemOptions` via `normalizeLines` to accept single or multiple Lines based on `meta.products`, which reflects each item's globally resolved latest-period `Line` and `Brand` from `computeItemAllocations` (latest CY month first, falling back to latest PY month).
- **Store & URL Hash Sync (`src/store/useDashboardStore.ts`, `src/lib/hashState.ts`)**:
  - Added `lines: string[]` and cascading `setLines(lines)` action that narrows `brands` and `items` to the active `lines`, updates `line` (`lines[0] ?? null`), fixes `setBrands` to keep `items` scoped to `st.lines`, and syncs comma-separated `line=` in the URL hash.
- **Guide Report Banner & Exposure Drill (`src/components/Filters.tsx`, `src/components/ProductCustomerExposure.tsx`)**:
  - Added a searchable multi-select **Line** dropdown (`Latest Period` scope badge) first in the Guide Report filter bar (**Line → Brand → Product**), backed by `meta` so each dropdown always displays the full latest-period roster for the active upstream selection, with removable `Line:` summary chips.
  - Updated `ProductCustomerExposure` line-row drilling to append into `lines`.
- **Docs & Tests (`docs/DECISIONS.md`, `src/lib/acceptance.test.ts`)**:
  - Updated Decision #8 and added Decision #9 in `docs/DECISIONS.md`; added multi-line aggregation, cascading option, and URL hash round-trip assertions in `src/lib/acceptance.test.ts`.

### 1.16 Documentation Sync Rule (2026-11-18)
- Added `AGENTS.md` (in `app/`, plus a pointer at the workspace root) requiring `README.md` and `worklog.md` to be updated after every project change.
- README: no changes needed (no user-facing behavior change).

### 1.17 Guide Report SubType Multi-Select & Customer Dynamics SubType Multi-Select (2026-11-18)
- **SubType options narrowed by product (`src/lib/aggregate.ts`)**: `buildMeta` now emits `itemSubTypes` (unique `[item, subType]` pairs across the whole dataset), and `subTypeOptions(meta, mainTypes, scope?)` accepts an optional `ProductScope` (`lines` / `brands` / `items`) to keep only SubTypes with sales for the selected products. Narrowing is one-way (Line → Brand → Product → SubType).
- **Store & hash (`src/store/useDashboardStore.ts`, `src/lib/hashState.ts`)**: `setLines` / `setBrands` / `setItems` prune selected `subTypes` that no longer qualify (`pruneSubTypes`); `setMainTypes` and hash validation use the product-scoped options, and hash SubTypes are now validated after Lines/Brands/Items.
- **Guide Report banner (`src/components/Filters.tsx`)**: Added an emerald **SubType** multi-select group next to the Line → Brand → Product group. It drives the existing global `subTypes` filter (whole dashboard, `subTypes=` hash, Reset filters), shows removable `SubType:` chips, and counts toward the active-filter badge.
- **Shared component (`src/components/SearchableMultiSelect.tsx`)**: Moved the searchable multi-select out of `Filters.tsx` and added optional `optionCounts`, `placeholderCount`, `ariaLabel`, and a `fuchsia` accent.
- **Customer Dynamics (`src/components/CustomerDynamics.tsx`)**: Replaced the single-select SubType `<select>` with the shared multi-select (customer counts per SubType). It stays local to the section and matches on the customer's primary SubType; selecting every SubType counts as "All". The notice shows `A, B +N more` with one **Show all SubTypes** reset.
- **Tests (`src/lib/acceptance.test.ts`)**: Added test 17b covering product-scoped SubType options and the guarantee that no rows match for out-of-scope SubTypes.
- README: updated the Filtering and Customer Dynamics sections.

### 1.18 SubType/Chain Normalization, Distributor UI Removal & LevelTable Filtered Subtotals (2026-11-18)
- **Distributor Level Removed from UI (`src/lib/aggregate.ts`, `src/lib/insights.ts`, `src/lib/hashState.ts`, `src/components/TableJumpBar.tsx`, `src/components/GrowthChart.tsx`, `src/components/BubbleScatterChart.tsx`, `src/pages/Dashboard.tsx`)**:
  - Removed `'distributor'` from `TABLE_LEVELS` (`['subtype', 'chain', 'territory', 'customer']`), `INSIGHT_LEVELS`, `DRIVER_LEVELS` (`['subtype', 'chain', 'territory', 'item']`), `VALID_DRIVER_LEVELS`, and `CHART_LEVELS` (`['subtype', 'chain', 'territory', 'brick', 'customer']`), eliminating the Distributor stacked table, Jump Bar pill, `Export All Levels` tab, and Distributor chart/driver selector options while replacing Distributor with `Chains` in Growth Drivers.
  - Updated `TableJumpBar.tsx` badge/tooltip from `5 levels` to `4 levels`.
- **`Ezzaby` & `Chain` Normalization + Latest-Period `SubType` Unification (`src/lib/aggregate.ts`)**:
  - In `prepare(ds)`, rows with raw `SubType` `'Ezzaby'`/`'Ezaby'` are remapped to `SubType = 'Chain'` and `Chain = 'Ezzaby'`, removing `'Ezzaby'` from `SubType` completely and consolidating all Ezzaby sales under `Chain = 'Ezzaby'`.
  - Rows with any non-empty named `Chain` (e.g., `SubType = 'Private'` with a populated `Chain`) are remapped to `SubType = 'Chain'`, so `SubType = 'Chain'` and the dedicated `Chains` table reconcile 100%.
  - Extended `computeCustomers` to return `subTypeOf`, unifying non-chain customers' historical rows to their latest-period `SubType` (matching Brick/Territory behavior) so `#table-subtype` and `CustomerDynamics` local `SubType` totals match 100% across all 20 SubTypes.
- **`Stores + Private → Stores` Customer Rule (`src/lib/aggregate.ts`)**:
  - In `prepare(ds)`, any customer with both `Stores` (`Store`) and `Private` across active transactions (in PY, CY, or across years) has all of their `Private` rows normalized to `Stores` before `computeCustomers`, classifying them as `Stores` without a `+1 (Private)` badge on the Customer table.
- **`LevelTable` Filtered Subtotal Footer (`src/components/LevelTable.tsx`)**:
  - Updated `tableTotals` and `tableGrossTotals` to sum `topRows` when a table-local `Search`, `Status`, or `Top/Bottom N` filter is active, displaying `Filtered Subtotal (X of Y ...)` in `<tfoot>`.
- **Tests (`src/lib/acceptance.test.ts`, `src/lib/exportExcel.test.ts`)**:
  - Updated existing assertions for 4 `TABLE_LEVELS` and `Ezzaby` removal from `SubType`; added test 28 verifying `Ezzaby → Chain(Ezzaby)`, named `Chain → SubType=Chain`, and latest-period `SubType` unification across `levels.subtype`, `levels.chain`, and `levels.customer`.
- README: updated stacked tables, Jump Bar, Growth Drivers, normalization/attribution definitions, and test count.

### 1.19 Guide Report Distributor Multi-Select Filter (2026-11-18)
- **Distributor options narrowed by product (`src/lib/aggregate.ts`)**: Replaced `itemSubTypes` in `DatasetMeta` / `buildMeta` with `itemDistributors` (unique `[item, distributor]` pairs across the whole dataset excluding `EXCLUDED_DISTRIBUTORS`), restored `subTypeOptions(meta, mainTypes)` to cascade solely from `mainTypes`, and added `distributorOptions(meta, scope?)` to narrow Distributors one-way by the selected `Line` / `Brand` / `Product` (`ProductScope`).
- **Store & URL hash pruning (`src/store/useDashboardStore.ts`, `src/lib/hashState.ts`)**: Replaced `pruneSubTypes` with `pruneDistributors` so `setLines`, `setBrands`, and `setItems` drop selected `distributors` that no longer have sales for the active product scope; updated `validateHashAgainstMeta` to validate `distributors=` against product-scoped `distributorOptions` after `lines`/`brands`/`items`, and restored `setMainTypes` and hash `subTypes=` validation to `subTypeOptions(meta, mainTypes)`.
- **Guide Report banner (`src/components/Filters.tsx`)**: Replaced the emerald **SubType** multi-select group and `SubType:` chips with **Distributor** (`All Distributors`, `Distributor:` removable chips, `activeFilterCount` including `distributors.length`), wiring it to the global `distributors` filter while leaving the local **SubType** multi-select in `src/components/CustomerDynamics.tsx` and shared `src/components/SearchableMultiSelect.tsx` unchanged.
- **Tests (`src/lib/acceptance.test.ts`)**: Updated test `17b` to verify `itemDistributors`, product-scoped `distributorOptions`, and `matchedRows === 0` for out-of-scope Distributors.
- README: updated the Guide Report filter description in `README.md` to document the **Distributor** multi-select (`distributors=`, `distributorOptions`, `meta.itemDistributors`).

### 1.20 Checkbox Exclusion Filters for Guide Report Distributor & Customer Dynamics SubType (2026-11-19)
- **Checkbox Filter Engine & Shared UI (`src/lib/checkboxFilter.ts`, `src/components/CheckboxMultiSelect.tsx`)**:
  - Built pure state engine `src/lib/checkboxFilter.ts` supporting `exclude` vs `include` intent (`ALL_CHECKED`, `resolveCheckboxFilter`, `toggleCheckboxOption`, `selectOnlyCheckboxOption`, `toggleAllCheckboxOptions`, `reincludeCheckboxOption`, `removeIncludedCheckboxOption`, `pruneCheckboxFilter`, `isSameCheckboxFilterState`, `summarizeNames`).
  - Built `src/components/CheckboxMultiSelect.tsx` with all options checked by default, instant apply on click, a master tri-state `Select all` / `Unselect all` row, search box, per-row **Only** quick button, local **draft-empty** guard when unchecking all boxes (restores previous filter on close if none re-checked), and smart **Except ...** vs **N of M** trigger summaries (`displayMode`).
- **Include `Ezaby` & Transaction-Level Exclusion (`src/lib/aggregate.ts`, `src/lib/hashState.ts`, `src/store/useDashboardStore.ts`)**:
  - Updated `buildMeta` and `analyze` `filterOptions.distributors` in `src/lib/aggregate.ts` to include all dataset Distributors (including `Ezaby`), while keeping `EXCLUDED_DISTRIBUTORS` filtering on `levels.distributor` and `analyzeAllLevelsItems`.
  - Added `excludeDistributors?: string[]` and `excludeMask(...)` to `AnalysisQuery` / `buildContext`, `excludedDistributors` + `setDistributorFilter` + intent-preserving `pruneDistributorSelection` in `src/store/useDashboardStore.ts`, and `excludeDistributors=` serialization/validation in `src/lib/hashState.ts`.
- **Guide Report Distributor & Customer Dynamics SubType (`src/components/Filters.tsx`, `src/components/CustomerDynamics.tsx`)**:
  - Switched **Distributor** in `src/components/Filters.tsx` to `CheckboxMultiSelect` with smart `Excluding:` (re-include on click) vs `Distributor:` chips, leaving `Line`, `Brand`, and `Product` (`SearchableMultiSelect`) unchanged.
  - Switched local **SubType** in `src/components/CustomerDynamics.tsx` to `CheckboxMultiSelect` with intent-preserving pruning across global filter changes and smart `Excluding SubType:` vs `Filtered by SubType:` notice banners.
- **Tests (`src/lib/checkboxFilter.test.ts`, `src/lib/acceptance.test.ts`)**:
  - Added 8 unit tests in `src/lib/checkboxFilter.test.ts` and test `17c` + `Ezaby` metadata/exclusion assertions in test `28` of `src/lib/acceptance.test.ts`.
- README: updated Guide Report Distributor, Customer Dynamics SubType, URL hash parameter list, and test count in `README.md`.

### 1.21 Removal of Product × Customer-Segment Exposure Section (2026-11-19)
- **UI & Dashboard Removal (`src/pages/Dashboard.tsx`)**:
  - Deleted `src/components/ProductCustomerExposure.tsx` and removed its lazy mount from `#section-customer-dynamics` in `src/pages/Dashboard.tsx`, keeping `CustomerDynamics.tsx` and shared `KpiInfoTooltip.tsx` intact.
- **Aggregation, Metrics, Export & State Cleanup (`src/lib/aggregate.ts`, `src/lib/metrics.ts`, `src/lib/config.ts`, `src/lib/exportExcel.ts`, `src/lib/hashState.ts`, `src/store/useDashboardStore.ts`)**:
  - Removed the `Item × Customer` accumulator (`itemCustMap`), `buildProductExposure`, `buildProductExposureForMetric`, `emptySegmentMap`, and `AnalysisResult.productExposure` from `src/lib/aggregate.ts` so `analyze()` no longer computes unused exposure matrices on every filter change.
  - Removed `ProductExposureLevel`, `PRODUCT_EXPOSURE_LEVELS`, `PRODUCT_EXPOSURE_LEVEL_LABEL`, `CustomerBehaviorRow`, `decomposeCustomerBehavior`, `mergeCustomerBehaviorRows`, `ProductSegmentBreakdown`, `ProductExposureByMetric`, `ProductExposure`, `buildProductSegmentBreakdown`, `ProductBehaviorWaterfallStep`, and `buildProductBehaviorWaterfall` from `src/lib/metrics.ts`.
  - Removed unused `PARETO_TOP_N` and `PRODUCT_EXPOSURE_DEFAULT_LIMIT` from `src/lib/config.ts`, `ExportProductExposureOptions` and `exportProductExposureToExcel` from `src/lib/exportExcel.ts`, `pel`/`pev` hash parameters (`ProductExposureView`, `PRODUCT_EXPOSURE_VIEWS`) from `src/lib/hashState.ts`, and `productExposureLevel`/`productExposureView` state & setters from `src/store/useDashboardStore.ts`.
- **Tests (`src/lib/acceptance.test.ts`, `src/lib/exportExcel.test.ts`)**:
  - Removed Product Exposure / Customer-Behavior Decomposition tests `24` and `25` and `pel`/`pev` round-trip assertions from `src/lib/acceptance.test.ts`, and removed the `exportProductExposureToExcel` test from `src/lib/exportExcel.test.ts`.
- README: updated Metrics, Customer Dynamics, Lazy Loading, URL hash parameters, and test count in `README.md`.

### 1.22 Converter Size Optimization — Required Columns, Active Rows, 4-Decimal Rounding & Item-First Sort (2026-11-19)
- **Column & Row Filtering (`scripts/convert.ts`)**:
  - Updated `scripts/convert.ts` to read strictly the 15 `REQUIRED_COLUMNS` (dropping all 14 unused columns such as `CustomerAddress`, `CustomerIDName`, and constant flag columns) while keeping the existing `sga-columnar` v1 `.json.gz` schema and leaving `src/lib/aggregate.ts` and `src/workers/data.worker.ts` untouched.
  - Added `round4` and `optimizeDataset` in `scripts/convert.ts` to drop unsupported `Bonus` / `Return Bonus` rows (23,266 of 924,963 rows) while preserving all 901,697 active `Sales` + `Return Sales` rows intact (preserving exact `matchedRows`), compact unused dictionary entries while preserving `dict[0] === ''`, round `Quantity` and `Value` to 4 decimal places, and sort rows Item-first (`Date` → `TransactionType` → `Line` → `Brand` → `Item` → ... → `Quantity`) for gzip compression locality.
- **Measured Size & Payload Reduction (`public/data/sales.json.gz`)**:
  - Reduced `public/data/sales.json.gz` from **20.42 MiB (21,408,993 bytes)** down to **5.64 MiB (5,908,753 bytes)** (−72.4%) and uncompressed JSON from **93.30 MiB** down to **48.04 MiB (50,368,563 bytes)** (−48.5%), trimming Worker JSON parse work and memory footprint with negligible rounding drift (< 0.6 units and < 0.8 EGP across 632.75M EGP net sales).
- **Tests (`scripts/convert.test.ts`)**:
  - Added 4 Vitest unit & fixture-parity tests in `scripts/convert.test.ts` verifying `round4`, column stripping, active-row filtering, dictionary compaction, Item-first deterministic sort order, `DataError('empty')` guard, and `edge-cases.json` / `sample.json` round-trip parity.
- **Files Touched**: `scripts/convert.ts`, `scripts/convert.test.ts`, `README.md`, `worklog.md`.

### 1.23 SubType Normalization — Retail → Private (2026-11-19)
- **Runtime `Retail → Private` Normalization (`src/lib/aggregate.ts`)**:
  - Added rule 3 in `prepare(ds)` mapping non-chain `SubType = 'Retail'` (exact case-insensitive trimmed match, across all `MainType` values) to canonical `'Private'` before `Stores + Private → Stores` and `computeCustomers`, while keeping `Ezzaby` and named `Chain` precedence intact.
  - Removes `'Retail'` completely from `meta.subTypes`, `levels.subtype`, Customer Dynamics filters, charts, Growth Drivers, Excel exports, and the Customer table's `+N` historical tooltip badge (`subTypeOthers`), and causes `Stores + Retail` customers to normalize cleanly to `Stores`.
- **Tests & Live Verification (`src/lib/acceptance.test.ts`, `public/data/sales.json.gz`)**:
  - Updated test `1` and added test `29` in `src/lib/acceptance.test.ts` verifying no-raw-`Private` datasets, `Private + Retail` badge elimination, `MainType` independence, named `Chain` precedence, `Stores + Retail → Stores`, and full `SubType`/`Customer` reconciliation.
  - Verified against `public/data/sales.json.gz`: `'Retail'` is absent from `meta.subTypes` and `levels.subtype` (19 SubTypes), and all 3 previously-`Retail` customers normalize to `Private` with `subTypeOthers = []`.
- **Files Touched**: `src/lib/aggregate.ts`, `src/lib/acceptance.test.ts`, `README.md`, `worklog.md`.

---

## 3. Verification Results & Bundle Size Deltas

- **TypeScript Check (`npm run typecheck`)**: Passed (`0` errors).
- **Automated Tests (`npm test`)**: Passed (`46/46` tests across `src/lib/checkboxFilter.test.ts` (8 tests), `src/lib/acceptance.test.ts` (29 tests), `src/lib/exportExcel.test.ts` (5 tests), and `scripts/convert.test.ts` (4 tests)).
- **Production Build (`npm run build`)**: Passed cleanly in `5.47s` with zero new runtime dependencies. `public/data/sales.json.gz` remains `5.64 MiB` (`5,908,753 bytes`). Lazy-loaded chunk sizes:
  - `GrowthDrivers-*.js`: `22.37 kB` (`6.73 kB` gzip)
  - `CustomerDynamics-*.js`: `26.52 kB` (`6.75 kB` gzip)
  - `MonthChart-*.js`: `43.25 kB` (`10.89 kB` gzip)
  - `data.worker-*.js`: `41.71 kB`
