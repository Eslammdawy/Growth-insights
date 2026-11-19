# Sales Growth Analyzer (React + TypeScript)

Client-side analytical dashboard for **HPG (Hefny Pharma Group)** that measures quarterly sales growth versus the same quarter prior year (YoY) from the pre-converted columnar dataset (`public/data/sales.json.gz`).

## Architecture & Data Loading

The production workbooks (`HPG Sales_SalesPerDistributor Py 2025.xlsx` and `HPG Sales_SalesPerDistributor Cy 2026.xlsx`) contain **924,963 raw rows** across PY 2025 and CY 2026 (**901,697 active `Sales` + `Return Sales` rows**). To keep the payload small and interactive slicing instantaneous:

1. **Node Streaming Converter (`npm run convert`)**:
   - Reads each `.xlsx` central directory via random access, inflates `xl/sharedStrings.xml` and the first worksheet incrementally with `fflate`, and scans rows chunk-by-chunk without loading the full XML into memory.
   - Filters columns to the 15 `REQUIRED_COLUMNS` (dropping the 14 unused columns), prints raw per-year/type validation totals, then runs `optimizeDataset` to exclude unsupported transaction types (`Bonus` / `Return Bonus`), round `Quantity` and `Value` to 4 decimal places (`round4`), sort rows Item-first for gzip locality, and compact unused dictionary entries while preserving `dict[0] === ''`.
   - Dictionary-encodes string columns (`dict` + `Int32Array` codes) and stores numeric columns (`Date`, `Quantity`, `Value`) as `Float64Array`, writing `public/data/sales.json.gz` (**5.64 MiB / 5.91 MB**, git-ignored).
2. **In-Browser Web Worker (`src/workers/data.worker.ts`)**:
   - Automatically fetches `./data/sales.json.gz` on startup, decompresses via `DecompressionStream` (with `fflate` fallback), and builds typed-array indexes in memory.
   - **Single-Pass Multi-Level Aggregation (`src/lib/aggregate.ts`)**: computes net and gross totals, monthly trends, Territory × Month matrix, 4 dashboard table levels (`SubType`, `Chains`, `Territory`, `Customer`), Customer Dynamics cohorts/retention, and Contribution-to-Growth & Price/Volume/Mix decomposition simultaneously in a single typed-array pass across the 901k active rows.
   - **Superseded Request Cancellation**: Aborts superseded analysis requests on rapid filter changes, skipping worker execution and discarding outdated calculations.
   - **On-Demand Item Breakdown (`analyzeItems`)**: lazily computes per-item breakdowns (including gross sales and returns) inside the Web Worker whenever any table row, `Chain` child row, or Defector Watchlist row is expanded.

## Metrics & YoY Growth Definitions

- **Supported Transaction Types**: Only `Sales` and `Return Sales` are included (default: both selected = Net Sales). `npm run convert` strips `Bonus` and `Return Bonus` rows before writing `public/data/sales.json.gz`, while `aggregate.ts` still defensively excludes them for raw or test datasets.
- **Primary Metrics** (selectable in the top header alongside the HPG logo and period controls):
  - **Units**: $\sum \text{Quantity}$ (formatted with 0–1 decimals).
  - **Value**: $\sum \text{Value}$ in EGP (formatted with thousands separators).
- **YoY Growth ($\Delta$)**:
  $$\Delta = \text{CY} - \text{PY}$$
- **YoY Growth %**:
  $$\text{YoY Growth \%} = \frac{\text{CY} - \text{PY}}{|\text{PY}|}$$
  - $\text{PY} = 0 \text{ and } \text{CY} \neq 0 \rightarrow \text{New}$
  - $\text{CY} = 0 \text{ and } \text{PY} > 0 \rightarrow -100.0\% \text{ (Lost)}$
  - $\text{PY} = 0 \text{ and } \text{CY} = 0 \rightarrow \text{–}$
- **Contribution-to-Growth % & Price / Volume / Mix Decomposition (`src/lib/metrics.ts`)**:
  - **Contribution to Growth (`Contrib. %`)**: $\text{Contrib}_{\%} = \frac{\Delta_i}{|\text{PY}_{\text{total}}|} \times 100$, summing across all rows at any non-excluded level to the total YoY Growth %.
  - **Continuing Business ($\text{PY}_Q \neq 0, \text{CY}_Q \neq 0$)**:
    $$\Delta V_i = \underbrace{(\text{CY}_{Q,i} - \text{PY}_{Q,i}) \times P_{\text{PY},i}}_{\text{Volume Effect}} + \underbrace{\text{CY}_{Q,i} \times (P_{\text{CY},i} - P_{\text{PY},i})}_{\text{Price Effect}}$$
  - **Pure Volume vs. Mix**: Volume Effect decomposes into $\text{Pure Volume Effect} = (\text{CY}_{Q,i} - \text{PY}_{Q,i}) \times \bar{P}_{\text{PY}}$ and $\text{Mix Effect} = \text{Volume Effect} - \text{Pure Volume Effect}$.
  - **New & Lost Business**: Rows with $\text{PY}_Q = 0$ allocate $\Delta V_i$ to `newEffect`; rows with $\text{CY}_Q = 0$ allocate $\Delta V_i$ to `lostEffect`, guaranteeing exact additivity: $\text{Volume} + \text{Price} + \text{New} + \text{Lost} = \Delta V_{\text{total}}$.
- **Gross Sales, Returns & Returns Rate (`src/lib/metrics.ts`)**:
  - **Gross Sales**: $\text{Gross} = \sum \text{Value where TransactionType} = \text{'Sales'}$.
  - **Returns**: $\text{Returns} = \text{Gross} - \text{Net}$ (algebraically equal to $|\sum \text{Value where TransactionType} = \text{'Return Sales'}|$ when both transaction types are active; `0` when `Return Sales` is deselected).
  - **Returns Rate**: $\text{Returns Rate} = \frac{\text{Returns}}{\text{Gross}} \times 100$ (shown as `–` if $\text{Gross} \le 0$). A row is flagged when $\text{Returns Rate}_i > 1.5 \times \text{Portfolio Returns Rate}$ and $\text{CY Gross}_i \ge 10{,}000\text{ EGP}$.
- **Growth Concentration & Dominance Flag (`src/lib/insights.ts`)**:
  - **Top-$N$ Positive Share**: $\frac{\sum_{i=1}^{N} \Delta_i^+}{\sum_{\Delta_i > 0} \Delta_i}$ across rows with $\Delta_i > 0$.
  - **Top-$N$ Negative Share**: $\frac{\sum_{i=1}^{N} |\Delta_i^-|}{\sum_{\Delta_i < 0} |\Delta_i|}$ across rows with $\Delta_i < 0$.
  - **Dominance Flag**: Raised when $\frac{\max_i(\Delta_i^+)}{\sum_{\Delta_i > 0} \Delta_i} > 0.5$.
- **Customer Lifecycle Segments & Retention Metrics (`src/lib/metrics.ts`)**:
  - **Segments** (`GROWTH_BAND = 0.05`):
    - `New`: $\text{PY} = 0 \land \text{CY} > 0$
    - `Lost`: $\text{PY} > 0 \land \text{CY} = 0$
    - `Growing (>+5%)`: $\text{PY} > 0 \land \text{CY} > 0 \land \frac{\text{CY} - \text{PY}}{\text{PY}} > +5\%$
    - `Declining (<-5%)`: $\text{PY} > 0 \land \text{CY} > 0 \land \frac{\text{CY} - \text{PY}}{\text{PY}} < -5\%$
    - `Stable (±5%)`: $\text{PY} > 0 \land \text{CY} > 0 \land \left|\frac{\text{CY} - \text{PY}}{\text{PY}}\right| \le 5\%$
  - **Retention & Cohort Ratios** (with $\text{PY}_{\text{active}} = \sum_{\text{PY}_i > 0} \text{PY}_i$):
    - **Net Retention (NRR)**: $\frac{\sum_{\text{PY}_i > 0 \land \text{CY}_i > 0} \text{CY}_i}{|\text{PY}_{\text{active}}|}$
    - **Gross Retention (GRR)**: $\frac{\sum_{\text{PY}_i > 0 \land \text{CY}_i > 0} \min(\text{CY}_i, \text{PY}_i)}{|\text{PY}_{\text{active}}|} \in [0, 1]$
    - **Lost Churn Rate**: $\frac{\sum_{\text{Lost}} \text{PY}_i}{|\text{PY}_{\text{active}}|}$ and **Contraction Rate**: $\frac{\sum_{\text{Retained, }\Delta_i < 0} |\Delta_i|}{|\text{PY}_{\text{active}}|}$ (satisfying $\text{GRR} + \text{Contraction Rate} + \text{Churn Rate} = 1$)
    - **New-Business Rate**: $\frac{\sum_{\text{New}} \text{CY}_i}{|\text{PY}_{\text{active}}|}$ (satisfying $\text{NRR} + \text{New-Business Rate} = 1 + g$)
- **KPI Cards (`src/components/KpiCards.tsx`)**:
  - Displays 3 aligned KPI cards: Current Period (with Prior Period figure shown in the metadata below), YoY Growth %, and YoY Growth ($\Delta$).
  - Displays a live monthly CY-vs-PY mini sparkline under YoY Growth % comparing trends across the quarter.
- **Table Value Columns**:
  - `PY`, `CY`, `YoY Growth` ($\Delta$), `YoY Growth %`, `Contrib. %` (with diverging inline magnitude bars), and optional `Returns %` (behind the `"Show returns"` toggle, with warning flags).

## Filtering & Cross-Filtering

- **Guide Report Filters Bar (`src/components/Filters.tsx`)**:
  - Cascading product filter group (**Line** → **Brand** → **Product**) with searchable multi-select dropdowns (shared `src/components/SearchableMultiSelect.tsx`), removable summary chips, and a quick reset trigger. Selecting Lines scopes Brands; selecting Brands scopes Products.
  - Separate **Distributor** checkbox filter group (`src/components/CheckboxMultiSelect.tsx`, backed by `src/lib/checkboxFilter.ts`) next to the product group. All Distributors in the dataset (including `Ezaby`, while `levels.distributor` keeps `EXCLUDED_DISTRIBUTORS` filtered internally) start **checked by default**; unchecking boxes excludes them immediately at transaction level (`excludeDistributors` / `distributors` in the store and `excludeDistributors=` / `distributors=` in the URL hash, cleared by **Reset filters**). Includes a master tri-state `Select all` checkbox, search box, per-row **Only** shortcut, local draft-empty handling when unchecking all items, smart **Excluding:** / **Distributor:** summary chips, and one-way product scoping (`distributorOptions(meta, { lines, brands, items })`, backed by `meta.itemDistributors`) that preserves exclude/include intent across product selection changes.
- **Interactive Cross-Filter Chips (`src/components/DrillChips.tsx`)**:
  - Clicking bars, bubbles, treemap tiles, Growth Drivers rows, Defector Watchlist customers, or table filter buttons adds global cross-filter chips across `SubType`, `Chain`, `Distributor`, `Territory`, `Brick`, `Customer`, and `Item`.

## Growth Drivers, Customer Dynamics & Visual Insights

Every visual on the dashboard includes: (1) an `sr-only` text summary alternative and an interactive **Chart / Table** toggle button, (2) full **dark-mode** support, (3) formatted tooltips via [`src/lib/format.ts`](src/lib/format.ts), and (4) a meaningful **empty state** with a filter reset button.

1. **Growth Drivers — Contribution Bridge & Narrative (`src/components/GrowthDrivers.tsx`, `#section-drivers`)**:
   - Deterministic plain-English headline banner (`buildHeadline`) covering 6 portfolio edge cases, accompanied by concentration chips (`Top 5` share of gains & `Top 1` detractor share of decline), a single-entity dominance warning badge (`>50%` of positive growth), and a portfolio Returns Rate chip (`Returns rate %` vs `PY %`, highlighted when elevated `> 1.25×` PY).
   - Interactive horizontal contribution waterfall (`buildWaterfall`) bridging `PY` → Top positive drivers → Top negative detractors → `Other growth / decline` → `CY` across `SubType`, `Chains`, `Territory`, or `Item`, alongside clickable Top-5 Contributors and Top-5 Detractors strips.
2. **Upgraded Monthly PY vs CY & YoY % (`src/components/MonthChart.tsx`)**:
   - Recharts `ComposedChart` pairing `PY` and `CY` bars (with compact outside-end labels) on the primary left Y-axis with a `YoY Growth %` line overlay on a secondary right Y-axis.
3. **Top-10 Growth Leaders / Decliners (`src/components/GrowthChart.tsx`)**:
   - Horizontal bar chart of top entities by `YoY Δ` or `YoY %` across any selectable level (`SubType`, `Chains`, `Territory`, `Brick`, `Customer`), with outside-end `YoY %` labels colored by the shared Okabe-Ito palette (`src/lib/palette.ts`).
4. **Bubble Scatter (`src/components/BubbleScatterChart.tsx`)**:
   - Plots `x = PY`, `y = YoY %`, `size = CY`, and `color = status` (`Growing`, `Declining`, `New`, `Lost`, `Flat`) across `SubType`, `Chains`, `Territory`, `Brick`, or `Customer`. Clicking any bubble adds a cross-filter drill chip.
5. **CY Value Treemap Colored by Growth (`src/components/CyTreemap.tsx`)**:
   - Recharts `Treemap` where tile area is proportional to `CY Value` and tile fill reflects `YoY Value Growth %` via `treemapFillColor` from the shared palette (`src/lib/palette.ts`). Clicking any tile adds a drill chip.
6. **Customer Dynamics — Retention, Cohort Bridge & Defector Watchlist (`src/components/CustomerDynamics.tsx`, `#section-customer-dynamics`)**:
   - **Local SubType Checkbox Filter**: An Excel-style checkbox dropdown (`src/components/CheckboxMultiSelect.tsx`, with customer counts per SubType) in the section header starts with all SubTypes **checked by default**, narrowing Customer Dynamics only by each customer's **primary** SubType. Its options come from the customers already shown (respecting the global Guide Report filters) and preserve exclude/include intent when global filters change. Includes a per-row **Only** shortcut, local draft-empty handling when unchecking all items, and a smart `Excluding SubType: ...` / `Filtered by SubType: ...` banner notice with a single **Show all SubTypes** reset.
   - **4-Card Retention KPI Strip**: `Active Customers`, `Avg / Active (Value / Units)`, `Retained Growth Share`, and `New Customer Growth Share`. Every card includes an interactive **`KpiInfoTooltip`** (`i` icon popover) explaining its plain-English business meaning and exact calculation formula.
   - **Clickable 5-Segment Lifecycle Table**: Breaks down `New`, `Growing (>+5%)`, `Stable (±5%)`, `Declining (<-5%)`, and `Lost` customer cohorts with `PY`, `CY`, `YoY Δ`, `YoY %`, and `Contrib. %`. Clicking any row filters the Customer table below and smooth-scrolls to `#table-customer`.
   - **Top-10 Lost Customers Defector Watchlist**: Ranks the largest lost accounts by `PY Lost` and `Contrib. %`, supports inline expansion to inspect the exact items each defector bought in PY, one-click customer drill filtering, and `.xlsx` export (`Export watchlist` via `exportDefectorWatchlistToExcel`).

## Multi-Level Stacked Tables, Item Drill-Down & Excel Export

Four dedicated stacked tables are rendered on the main dashboard page (`src/components/LevelTable.tsx`, `TABLE_LEVELS = ['subtype', 'chain', 'territory', 'customer']`):

1. **SubType Level (`subtype`)**:
   - Click any `SubType` row to expand its **Item** breakdown inline.
   - For the `Chain` row (`EXPANDABLE_SUBTYPES = ['Chain']`), click the **`N chains`** pill to expand the per-`Chain` breakdown inline; click any `Chain` child row to expand that chain's **Item** breakdown (3-level hierarchy: `SubType → Chain → Item`).
2. **Chains Level (`chain`)**: Dedicated table listing all named pharmacy chains directly (excluding blank and unassigned chain rows, and matching `SubType = Chain` 100%); click any chain row to expand its **Item** breakdown.
3. **Territory Level (`territory`)**: Click any territory row to expand its **Item** breakdown.
4. **Customer Level (`customer`)**: Shows `Customer Name`, `Brick (CY)`, and `SubType` (`+N` badges for historical values); click any customer row to expand its **Item** breakdown.

Each level table includes:
- **Export to Excel (`src/lib/exportExcel.ts`)**: One-click `.xlsx` export button in the table header (accessible even when collapsed) that exports visible rows, any expanded `Chain` and `Item` child rows, formatted numbers/percentages, `Contrib. %`, and optional `CY Gross` / `CY Returns` / `Returns %` columns (`Export All Levels` in the Jump Bar exports all 4 stacked levels as separate tabs).
- **Keyboard accessibility**: real `<button aria-expanded aria-controls>` chevron toggle, `aria-sort` on sortable headers, and `aria-rowcount`/`aria-rowindex`.
- **Search with `useDeferredValue`**: instant typing responsiveness without blocking table filtering.
- **Growth status filter** (`All`, `Growing`, `Declining`, `New`, `Lost`, plus `Stable (±5%)` on the Customer table).
- **Optional Returns Rate Column (`"Show returns"`)**: toggles a sortable `Returns %` column with automatic warning flags (`> 1.5×` portfolio returns rate and `CY Gross ≥ 10,000 EGP`).
- **Top / Bottom N** filter and **Section collapse toggle**.
- **Memoized virtualized scrolling** (`@tanstack/react-virtual` + `React.memo` row component).
- **Row-level cross-filter button** adding global drill-down chips.
- **Pinned Totals / Filtered Subtotal footer** with `Contrib. %` and `Returns %` reconciliation (automatically switches to `Filtered Subtotal` over visible rows whenever Search, Status, or Top/Bottom N is active).

## Sticky In-Page Navigation

- **Table Jump Bar (`src/components/TableJumpBar.tsx`)**: A sticky jump bar (`Filters / Top · Drivers · SubType · Chains · Territory · Customer Dynamics · Customer`) enables one-click smooth scrolling directly to any analytical section or level table (`4 levels stacked`) and one-click `Export All Levels`.

## Performance & State Architecture

1. **Granular Selectors (`useShallow`)**: Isolated Zustand store subscriptions prevent table re-renders when typing in the search boxes, toggling chart modes, or switching driver levels.
2. **Concurrent Transitions (`useTransition`)**: Filter, period, and view switches are scheduled as low-priority transitions, keeping the user interface completely responsive.
3. **Code-Splitting & Lazy Loading**: All chart and analytical sections (`GrowthDrivers`, `MonthChart`, `GrowthChart`, `BubbleScatterChart`, `CyTreemap`, `CustomerDynamics`) are lazily loaded with `Suspense` skeletons and isolated by an `ErrorBoundary`.
4. **URL Hash Synchronization (`useSyncExternalStore`)**:
   - Automatically synchronizes filter and view parameters in the URL hash (`metric`, `line`, `year`, `q`, `m`, `lfl`, `brands`, `items`, `mainTypes`, `subTypes`, `distributors`, `excludeDistributors`, `territories`, `txTypes`, `drill`, plus optional `dlv`, `ret`, and `hmm`).
   - Uses `useSyncExternalStore` for browser navigation (Back/Forward) and validates all URL parameters against dataset metadata on load.
5. **Color-Blind-Safe Theming (`src/lib/palette.ts`)**:
   - Okabe-Ito inspired `up` (`#0072B2`) and `down` (`#D55E00`) palette defined centrally in `tailwind.config.js` and exposed via CSS variables (`--color-up`, `--color-up-light`, `--color-up-vivid`, `--color-down`, `--color-down-light`, `--color-down-vivid`).
   - Shared helper functions in `src/lib/palette.ts` drive consistent status colors, diverging contribution bars, and treemap tile fills across light and dark modes.

## Customer Identity, SubType/Chain Normalization & CY Brick / Territory Attribution

- **Unified Customer Identity**: Customers are keyed jointly by `CustomerID + CustomerName` so that a customer with the same ID and Name in PY and CY is always treated as **one single customer** even if their brick changed between PY and CY.
- **SubType & Chain Normalization**:
  - Rows with `SubType = 'Ezzaby'` / `'Ezaby'` are normalized to `SubType = 'Chain'` and `Chain = 'Ezzaby'`, removing `'Ezzaby'` from `SubType` altogether and consolidating all Ezzaby sales under `Chain = 'Ezzaby'`.
  - Any row with a non-empty named `Chain` is normalized to `SubType = 'Chain'`, guaranteeing that `SubType = 'Chain'` and the `Chains` table reconcile 100%.
  - Non-chain rows with `SubType = 'Retail'` (case-insensitive, trimmed, across any `MainType`) are normalized to `SubType = 'Private'`, removing `'Retail'` completely everywhere (including the Customer table's `+N` badge) and running before the `Stores + Private` rule.
  - Any customer having both `Stores` and `Private` (including normalized `Retail`) across their transactions (in PY or CY) is normalized to `SubType = 'Stores'` across all rows.
- **Updated True Brick, Territory & SubType (CY)**: Each customer's `Brick`, `Territory`, and (for non-chain customers) `SubType` from their most recent sales period (CY first) are treated as their updated true attributes across all historical (PY) and current (CY) transactions, ensuring like-for-like comparisons and 100% reconciliation between the `SubType` table and `Customer Dynamics`. Prior bricks and prior subtypes are preserved in the `+N` tooltip badges on the Customer table.

## Changing `EXPANDABLE_SUBTYPES`

To change which `SubType` rows offer an inline per-`Chain` breakdown on the **SubType Level** table, edit [`src/lib/config.ts`](src/lib/config.ts):

```ts
export const EXPANDABLE_SUBTYPES: readonly string[] = ['Chain'];
```

Any row under an expandable `SubType` whose `Chain` is empty/null is grouped into `(Unassigned / Independent)` so that child rows always sum exactly to the parent `SubType` row. Named chains are also displayed directly in the dedicated **Chains Level** table.

## Scripts

```bash
npm install          # Install dependencies
npm run convert      # Stream-convert Py 2025 + Cy 2026 .xlsx workbooks -> public/data/sales.json.gz
npm run dev          # Start Vite dev server
npm run test         # Run Vitest unit, acceptance & export test suite (46 tests across 4 files)
npm run typecheck    # Run TypeScript compiler check (tsc --noEmit)
npm run build        # Typecheck and build production bundle to dist/
```
