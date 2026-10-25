# Worklog & Application Status (`worklog.md`)

**Last Updated**: 2026-10-25
**Application**: Sales Growth Analyzer
**Status**: Healthy — All TypeScript compiler checks (`tsc --noEmit`), Vitest acceptance tests (`12/12`), and production Vite build (`npm run build`) pass with zero errors.

---

## 1. Summary of Recent Improvements (2026-10-25)

### 1.1 Phase 1: Bug Fixes & Design Alignment
- **Tailwind Class Corrections**: Replaced invalid `w-68` with `w-72` in `Sidebar.tsx`, and replaced invalid `py-0.2` with `py-0.5` in `Sidebar.tsx` and `Filters.tsx`.
- **Merge Conflict Resolution**: Cleaned up leftover merge conflict markers in `README.md` and normalized documentation references.
- **Color-Blind-Safe Growth Palette**: Made the Okabe-Ito `up` (`#0072B2`) and `down` (`#D55E00`) palette in `tailwind.config.js` the single source of truth. Exposed tokens as CSS custom properties (`--color-up`, `--color-down`) and wired them into UI badges, table progress bars, and Recharts fills.
- **Visual Feedback on Analysis**: Exposed store's `analyzing` state via an indeterminate progress bar on `TopBar.tsx` and a dimmed transition overlay on the active table container during recalculation.

### 1.2 Phase 2: React Performance & State Architecture
- **Zustand Selectors & Shallow Comparison**: Wrapped all 9 store subscriptions across components with granular selectors and `useShallow`. Isolates changes to search text, sidebar collapse state, and chart modes from triggering table re-renders.
- **Memoized Table Rows**: Extracted `LevelTableRow` in `LevelTable.tsx` into a `React.memo` component with stable primitive props and memoized callbacks (`toggle`, `handleFilter`).
- **Concurrent React 18 Primitives**: Implemented `useDeferredValue` for table filtering and `useTransition` for line, filter, and period updates.
- **Code-Splitting & Lazy Loading**: Split `MonthChart` and `GrowthChart` via `React.lazy` and `Suspense` with skeleton loaders, decreasing main bundle size from 624 kB down to 258 kB.
- **Error Boundaries**: Wrapped each chart and level table with `ErrorBoundary.tsx` to provide graceful retry cards on render exceptions.
- **URL Hash Synchronization via `useSyncExternalStore`**: Built `src/lib/hashState.ts` providing bidirectional URL hash sync (`metric`, `line`, `year`, `q`, `m`, `lfl`, `brands`, `items`, `mainTypes`, `txTypes`, `drill`) validated against `DatasetMeta` on load.
- **Worker Cancellation**: Added cancellation RPC in `workerClient.ts` and `data.worker.ts` so superseded analysis requests are aborted in-flight and skipped.

### 1.3 Phase 3: Accessibility & Responsive UI
- **Accessible Table Row Expansion**: Replaced chevron icons with accessible `<button aria-expanded aria-controls aria-label>`, added `aria-sort` on sortable `<th>` headers, and set `aria-rowcount`/`aria-rowindex` on virtualized tables.
- **Accessible Sidebar Navigation**: Removed misleading `role="tablist"`/`role="tab"` semantics; enabled arrow-key navigation that focuses buttons without firing premature calculations until confirmed.
- **Off-Canvas Mobile Drawer**: Added responsive drawer behavior below `md` (< 768px) with backdrop overlay and a hamburger menu trigger in `TopBar.tsx`.
- **280px Chart Height & Empty States**: Increased chart containers to `h-[280px]` and replaced `return null` with empty-state placeholder cards.
- **Sticky In-Page Jump Bar**: Implemented `TableJumpBar.tsx` for one-click smooth scrolling between active stacked tables (`SubType`, `Distributor`, `Territory`, `Customer`).
- **KPI Cards Sparkline**: Added a zero-dependency SVG monthly CY-vs-PY sparkline and removed the static `(CY − PY) / |PY|` caption.

### 1.4 Brick Level Table Removal
- Defined `TABLE_LEVELS = ['subtype', 'distributor', 'territory', 'customer']` in `src/lib/aggregate.ts`.
- Removed the Brick table from the main dashboard stacked tables view and the jump bar per user request.
- Preserved Brick computation in the worker and customer attributes so Brick CY and historical `+N` badges on the Customer table continue functioning seamlessly.

### 1.5 Table & KPI Card Refinements
- **Distributor Level Exclusion**: Added `EXCLUDED_DISTRIBUTORS = ['Ezaby', 'Ezzaby']` in `src/lib/config.ts` and filtered `Ezaby` out of `levels.distributor` in `src/lib/aggregate.ts` (since its figures are already illustrated in the SubType level table), while computing each table's footer total directly from its displayed rows (`sumRows(rowList)`).
- **Customer Level Column Cleanup**: Removed the `Customer ID` column from the Customer level table in `src/components/LevelTable.tsx` to give more horizontal space to Customer Name, Brick (CY), SubType, and metric columns.
- **3-Column KPI Cards Layout**: Removed the standalone Prior Period KPI card in `src/components/KpiCards.tsx`, displayed the Prior Period figure in the metadata line under the Current Period figure, and aligned the 3 KPI cards side-by-side (`sm:grid-cols-3`).

---

## 2. Codebase Inventory & Review Status

| File | Role | Status |
| :--- | :--- | :--- |
| `src/lib/config.ts` | Constants (`EXPANDABLE_SUBTYPES`, `REQUIRED_COLUMNS`, `TX_TYPES`, `SAMPLE_DATA_URL`) | Clean |
| `src/lib/columnar.ts` | Dictionary-encoded `StrColumn` & `Float64Array` `NumColumn` dataset codec + validation | Clean |
| `src/lib/parse.ts` | Streaming `.xlsx` parser (`fflate` + chunked XML scanner) | Clean |
| `src/lib/periods.ts` | Quarter/Month period resolution & like-for-like month matching | Clean |
| `src/lib/metrics.ts` | `Units` & `Value` metric helpers, YoY Growth ($\Delta$) and YoY Growth % | Updated & Verified |
| `src/lib/format.ts` | Number, currency (`EGP`), signed delta, and percentage formatters | Updated & Verified |
| `src/lib/aggregate.ts` | Single-pass multi-level aggregator, CY Brick/Territory remapping, `analyzeItems`, `TABLE_LEVELS` | Updated & Verified |
| `src/lib/hashState.ts` | URL hash serialization, parsing, `DatasetMeta` validation, and `useSyncExternalStore` subscription | New & Verified |
| `src/lib/acceptance.test.ts` | 12 Vitest acceptance, invariant, and URL hash round-trip tests | 12/12 Passing |
| `src/workers/data.worker.ts` | Web Worker hosting dataset, `analyze`, `analyzeItems`, and request cancellation | Updated & Verified |
| `src/workers/workerClient.ts` | Promise RPC wrapper for `data.worker.ts` with abort/cancellation tracking | Updated & Verified |
| `src/store/useDashboardStore.ts` | Zustand store (selectors, filters, period, drill chips, cached `itemsByRow`, URL hash sync) | Updated & Verified |
| `src/components/TopBar.tsx` | Header with period banner, Units/Value toggle, period controls, mobile menu button, progress bar | Updated & Verified |
| `src/components/Sidebar.tsx` | Sales Line navigation with arrow key navigation, YoY % badges, off-canvas mobile drawer | Updated & Verified |
| `src/components/Filters.tsx` | Per-Line `Brand`/`Item` multi-selects + global `MainType`/`TransactionType` filters with transitions | Updated & Verified |
| `src/components/DrillChips.tsx` | Active cross-filter chip bar with transitions | Updated & Verified |
| `src/components/KpiCards.tsx` | 4 KPI summary cards with live monthly CY-vs-PY mini sparklines | Updated & Verified |
| `src/components/MonthChart.tsx` | Monthly PY vs CY bar chart (280px height, empty state, lazy-loaded) | Updated & Verified |
| `src/components/GrowthChart.tsx` | Top-10 horizontal YoY bar chart (280px height, empty state, lazy-loaded) | Updated & Verified |
| `src/components/TableJumpBar.tsx` | Sticky in-page navigation bar scrolling to each stacked level table | New & Verified |
| `src/components/ErrorBoundary.tsx` | React error boundary component with retry support for charts and tables | New & Verified |
| `src/components/LevelTable.tsx` | Virtualized level table with memoized rows, deferred search, accessible buttons, and ARIA attributes | Updated & Verified |
| `src/pages/Dashboard.tsx` | Main page layout assembling sidebar drawer, header, filters, KPIs, charts, and stacked tables | Updated & Verified |

---

## 3. Verification Results

- **TypeScript Check (`npm run typecheck`)**: Passed (`0` errors).
- **Automated Tests (`npm run test`)**: Passed (`12/12` tests in `src/lib/acceptance.test.ts`, including multi-level totals, SubType chain children, per-row Item drill-down across all levels and chains, like-for-like period matching, growth edge cases, per-Line filter scoping, Bonus exclusion, Customer CY Brick/Territory unification, and URL hash serialization/validation).
- **Production Build (`npm run build`)**: Passed cleanly with asynchronous chunks for charts (`MonthChart`, `GrowthChart`, `BarChart`) and an initial entry bundle of ~261 kB.
