# Worklog & Application Status (`worklog.md`)

**Last Updated**: 2026-10-25
**Application**: Sales Growth Analyzer
**Status**: Healthy — All TypeScript checks (`tsc --noEmit`), Vitest acceptance tests (`10/10`), and production Vite build (`npm run build`) pass with zero errors.

---

## 1. Summary of Recent Changes (2026-10-25 Update)

### 1.1 Removed All PPG Data & Focused on YoY Growth (`src/lib/metrics.ts`, `src/lib/format.ts`, `src/components/KpiCards.tsx`)
- Removed `ppg` from the `Metric` union (`Metric = 'units' | 'value'`), removed `fmtPpg`, `ppg()`, and `ppgDecomposition()`.
- Removed `Share of Total (CY)`, `Contrib. to Δ (pp)`, `CY Units Share`, and `Price Effect / Mix Effect` columns from the table model.
- Kept only **PY**, **CY**, **YoY Growth ($\Delta = \text{CY} - \text{PY}$)**, and **YoY Growth %** ($(\text{CY} - \text{PY}) / |\text{PY}|$).
- Updated `KpiCards.tsx` to display **Prior Period**, **Current Period**, **YoY Growth %**, and **YoY Growth ($\Delta$)** with both Units and Value sub-labels and no PPG references.

### 1.2 Header Cleanup & Layout Shift (`src/components/TopBar.tsx`, `src/pages/Dashboard.tsx`)
- Removed the **Upload**, **Load sample data**, **CSV Export**, and **Excel Export** buttons from `TopBar.tsx`, and removed obsolete `src/lib/export.ts`.
- Kept the **Light / Dark mode toggle** on the right side of the sticky header.
- Removed drag-and-drop upload overlays and large-file warning banners from `Dashboard.tsx`, and tightened vertical padding (`p-3 sm:p-4`, `space-y-3`) so the filters, KPI cards, charts, and level tables sit higher on the page.

### 1.3 Dedicated Table per Analysis Level with Inline Item Drill-Down (`src/components/LevelTable.tsx`, `src/lib/aggregate.ts`)
- Replaced single-table tab switching (`ComparisonTable.tsx` & `LevelTabs.tsx`, both removed) with five stacked `LevelTable` instances rendered on the main page in order:
  1. **SubType Level**
  2. **Distributor Level**
  3. **Territory Level**
  4. **Brick Level**
  5. **Customer Level**
- Updated `analyze()` in `src/lib/aggregate.ts` to compute all 5 levels simultaneously in a single pass over the columnar dataset (`result.levels[level]`).
- Added `analyzeItems(ds, query, target)` in `src/lib/aggregate.ts` (exposed via Web Worker message `type: 'items'`) to compute on-demand **Item** breakdowns for any expanded row.
- On the **SubType Level** table, expandable SubTypes (`Chain`, `Private`) retain their inline **Chain** breakdown via a `N chains` toggle button, and both SubType rows and Chain child rows expand into their **Item** breakdown when clicked (`SubType → Chain → Item` or `SubType → Item`).
- Each `LevelTable` has its own search box, growth status filter (`All`, `Growing`, `Declining`, `New`, `Lost`), Top/Bottom $N$ rank filter, collapse/expand toggle, virtualized row rendering (`@tanstack/react-virtual`), row-level cross-filter icon, and pinned **Totals** row.
- Added a level selector dropdown to `GrowthChart.tsx` so the Top-10 horizontal bar chart can inspect any of the 5 levels.

### 1.4 Unified Customer Identity & True CY Brick / Territory Attribution (`src/lib/aggregate.ts`)
- Built a composite customer key (`CustomerID + CustomerName`) in `buildCustomerColumn()` so customers sharing the same ID and Name in PY and CY are always merged as **one customer** regardless of brick changes.
- In `computeCustomers()`, each customer's most recent active sales month (CY first) determines their **updated true Brick** and **updated true Territory** (ignoring `Bonus` and `Return Bonus` rows).
- Remapped the effective `Brick` and `Territory` columns (`effBrick`, `effTerr`) for every transaction row belonging to a customer to their CY Brick and CY Territory. As a result:
  - A customer who moved from Brick A in PY to Brick B in CY appears as a single customer under Brick B on the **Customer Level** table (with Brick A shown in the `+1` tooltip badge).
  - Both PY and CY sales of that customer are attributed to Brick B on the **Brick Level** table and to Brick B's territory on the **Territory Level** table.

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
| `src/lib/aggregate.ts` | Single-pass multi-level aggregator, CY Brick/Territory remapping, `analyzeItems` | Updated & Verified |
| `src/lib/acceptance.test.ts` | 10 Vitest acceptance & invariant tests against `sample.json` and `edge-cases.json` | 10/10 Passing |
| `src/workers/data.worker.ts` | Web Worker hosting dataset, `analyze`, and `analyzeItems` off the main thread | Updated & Verified |
| `src/workers/workerClient.ts` | Promise RPC wrapper for `data.worker.ts` | Updated & Verified |
| `src/store/useDashboardStore.ts` | Zustand store (filters, period, drill chips, cached `itemsByRow`, theme, URL hash) | Updated & Verified |
| `src/components/TopBar.tsx` | Sticky header with period banner, Units/Value toggle, period controls, theme toggle | Updated & Verified |
| `src/components/Sidebar.tsx` | Collapsible Sales Line navigation sorted by CY Value with YoY % badges | Clean |
| `src/components/Filters.tsx` | Per-Line `Brand`/`Item` multi-selects + global `MainType` and `TransactionType` filters | Updated & Verified |
| `src/components/DrillChips.tsx` | Active cross-filter chip bar | Updated & Verified |
| `src/components/KpiCards.tsx` | 4 KPI summary cards (PY, CY, YoY Growth %, YoY Growth $\Delta$) | Updated & Verified |
| `src/components/MonthChart.tsx` | Monthly PY vs CY bar chart with per-month YoY % badges | Updated & Verified |
| `src/components/GrowthChart.tsx` | Top-10 horizontal YoY $\Delta$ / YoY % bar chart with level selector | Updated & Verified |
| `src/components/LevelTable.tsx` | Virtualized level table with inline Item drill-down & SubType Chain breakdown | New & Verified |
| `src/pages/Dashboard.tsx` | Main page layout assembling sidebar, header, filters, KPIs, charts, and 5 level tables | Updated & Verified |

---

## 3. Verification Results

- **TypeScript Check (`npm run typecheck`)**: Passed (`0` errors).
- **Automated Tests (`npm run test`)**: Passed (`10/10` tests in `src/lib/acceptance.test.ts`, including multi-level totals, SubType chain children, per-row Item drill-down across all levels and chains, like-for-like period matching, growth edge cases, per-Line filter scoping, Bonus exclusion, and Customer CY Brick/Territory unification).
- **Production Build (`npm run build`)**: Passed (`dist/index.html`, `dist/assets/data.worker-*.js`, `dist/assets/index-*.css`, `dist/assets/index-*.js` generated cleanly).
