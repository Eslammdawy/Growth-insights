# Sales Growth Analyzer (React + TypeScript)

Client-side analytical dashboard that measures quarterly sales growth versus the same quarter prior year (YoY) from the pre-converted columnar dataset (`public/data/sales.json.gz`).

## Architecture & Data Loading

The production workbook (`HPG Sales_SalesPerDistributorCustomerLevel Q3-2026.xlsx`) contains **494,242 rows** across 29 columns (~415 MB of uncompressed worksheet XML). To make loading and interactive slicing instantaneous:

1. **Node Streaming Converter (`npm run convert`)**:
   - Reads the `.xlsx` central directory via random access, inflates `xl/sharedStrings.xml` and the first worksheet incrementally with `fflate`, and scans rows chunk-by-chunk without loading the full XML into memory.
   - Dictionary-encodes string columns (`dict` + `Int32Array` codes) and stores numeric columns (`Date`, `Quantity`, `Value`) as `Float64Array`, writing `public/data/sales.json.gz` (~11 MB, git-ignored).
2. **In-Browser Web Worker (`src/workers/data.worker.ts`)**:
   - Automatically fetches `./data/sales.json.gz` on startup, decompresses via `DecompressionStream` (with `fflate` fallback), and builds typed-array indexes in memory.
   - **Single-Pass Multi-Level Aggregation (`src/lib/aggregate.ts`)**: computes totals, monthly trends, Territory × Month matrix, sidebar Line summaries, analysis levels, and Phase 4 Contribution-to-Growth & Price/Volume/Mix decomposition simultaneously in a single typed-array pass (~15–20 ms across 494k rows).
   - **Superseded Request Cancellation**: Aborts superseded analysis requests on rapid filter changes, skipping worker execution and discarding outdated calculations.
   - **On-Demand Item Breakdown (`analyzeItems`)**: lazily computes per-item breakdowns inside the Web Worker whenever any table row (or Chain child row) is expanded.

## Metrics & YoY Growth Definitions

- **Supported Transaction Types**: Only `Sales` and `Return Sales` are included (default: both selected = Net Sales). `Bonus` and `Return Bonus` rows are kept in the parsed dataset but always excluded from all metric and customer-attribute calculations.
- **Primary Metrics** (selectable in the top header):
  - **Units**: $\sum \text{Quantity}$ (formatted with 0–1 decimals).
  - **Value**: $\sum \text{Value}$ in EGP (formatted with thousands separators).
- **YoY Growth ($\Delta$)**:
  $$\Delta = \text{CY} - \text{PY}$$
- **YoY Growth %**:
  $$\text{YoY Growth \%} = \frac{\text{CY} - \text{PY}}{|\text{PY}|}$$
  - $\text{PY} = 0 \text{ and } \text{CY} \neq 0 \rightarrow \text{New}$
  - $\text{CY} = 0 \text{ and } \text{PY} > 0 \rightarrow -100.0\% \text{ (Lost)}$
  - $\text{PY} = 0 \text{ and } \text{CY} = 0 \rightarrow \text{–}$
- **Phase 4 Contribution-to-Growth & Price / Volume / Mix Decomposition (`src/lib/metrics.ts`)**:
  - **Contribution to Growth (pp)**: $\text{Contrib}_{\text{pp}} = \frac{\Delta_i}{|\text{PY}_{\text{total}}|} \times 100$, summing across all rows at any non-excluded level to the total YoY Growth %.
  - **Continuing Business ($\text{PY}_Q \neq 0, \text{CY}_Q \neq 0$)**:
    $$\Delta V_i = \underbrace{(\text{CY}_{Q,i} - \text{PY}_{Q,i}) \times P_{\text{PY},i}}_{\text{Volume Effect}} + \underbrace{\text{CY}_{Q,i} \times (P_{\text{CY},i} - P_{\text{PY},i})}_{\text{Price Effect}}$$
  - **Pure Volume vs. Mix**: Volume Effect decomposes into $\text{Pure Volume Effect} = (\text{CY}_{Q,i} - \text{PY}_{Q,i}) \times \bar{P}_{\text{PY}}$ and $\text{Mix Effect} = \text{Volume Effect} - \text{Pure Volume Effect}$.
  - **New & Lost Business**: Rows with $\text{PY}_Q = 0$ allocate $\Delta V_i$ to `newEffect`; rows with $\text{CY}_Q = 0$ allocate $\Delta V_i$ to `lostEffect`, guaranteeing exact additivity: $\text{Volume} + \text{Price} + \text{New} + \text{Lost} = \Delta V_{\text{total}}$.
- **KPI Cards**:
  - Displays 3 aligned KPI cards: Current Period (with Prior Period figure shown in the metadata below), YoY Growth %, and YoY Growth ($\Delta$).
  - Displays a live monthly CY-vs-PY mini sparkline under YoY Growth % comparing trends across the quarter.
- **Table Value Columns**:
  - `PY`, `CY`, `YoY Growth` ($\Delta$), and `YoY Growth %` (with inline magnitude bars and status badges).

## Interactive Charts & Visual Insights (`#section-insights`)

Every visual on the dashboard includes: (1) an `sr-only` text summary alternative and an interactive **Chart / Table** toggle button, (2) full **dark-mode** support, (3) formatted tooltips via [`src/lib/format.ts`](src/lib/format.ts), and (4) a meaningful **empty state** with a filter reset button.

1. **Upgraded Monthly PY vs CY & YoY % (`src/components/MonthChart.tsx`)**:
   - Recharts `ComposedChart` pairing `PY` and `CY` bars on the primary left Y-axis with a `YoY Growth %` line overlay on a secondary right Y-axis.
2. **Top-10 Growth Leaders / Decliners (`src/components/GrowthChart.tsx`)**:
   - Horizontal bar chart of top entities by `CY`, `YoY Δ`, or `YoY %` across any selectable level, colored by the shared Okabe-Ito palette (`src/lib/palette.ts`).
3. **Bubble Scatter (`src/components/BubbleScatterChart.tsx`)**:
   - Plots `x = PY`, `y = YoY %`, `size = CY`, and `color = status` (`Growing`, `Declining`, `New`, `Lost`, `Flat`) across `SubType`, `Distributor`, `Territory`, or `Brick`. Clicking any bubble adds a cross-filter drill chip.
4. **Territory × Month YoY % Heatmap (`src/components/TerritoryHeatmap.tsx`)**:
   - Responsive CSS grid (`Territory × Month` + `Total` column) colored using `growthScaleStyle` from the shared palette (`src/lib/palette.ts`), with search, Top-N selector, live formatted hover summary bar, and click-to-drill territory rows.
5. **CY Value Treemap Colored by Growth (`src/components/CyTreemap.tsx`)**:
   - Recharts `Treemap` where tile area is proportional to `CY Value` and tile fill reflects `YoY Value Growth %` via `treemapFillColor` from the shared palette (`src/lib/palette.ts`). Clicking any tile adds a drill chip.
6. **Contribution-to-Growth & Price / Volume Decomposition (`src/components/ContributionPriceVolume.tsx`)**:
   - Displays 4 portfolio summary cards (Total Value YoY Δ & Avg Price, Item-Level Volume Effect + Pure Vol/Mix, Item-Level Price Effect, and New/Lost Items Effect) plus a toggleable multi-level decomposition table and stacked horizontal bar chart (`SubType`, `Distributor`, `Territory`, `Brick`, `Item`).

## Multi-Level Stacked Tables & Item Drill-Down

Dedicated stacked tables are rendered on the main dashboard page (`src/components/LevelTable.tsx`):

1. **SubType Level**:
   - Click any `SubType` row to expand its **Item** breakdown inline.
   - For expandable SubTypes (`Chain` and `Private`), click the **`N chains`** pill to expand the per-`Chain` breakdown inline; click any `Chain` child row to expand that chain's **Item** breakdown (3-level hierarchy: `SubType → Chain → Item`).
2. **Distributor Level**: Excludes `Ezaby` (which is already represented under the `SubType` level table); click any distributor row to expand its **Item** breakdown.
3. **Territory Level**: Click any territory row to expand its **Item** breakdown.
4. **Customer Level**: Shows `Customer Name`, `Brick (CY)`, and `SubType` (`+N` badges for historical values); click any customer row to expand its **Item** breakdown.

Each level table includes:
- **Keyboard accessibility**: real `<button aria-expanded aria-controls>` chevron toggle, `aria-sort` on sortable headers, and `aria-rowcount`/`aria-rowindex`.
- **Search with `useDeferredValue`**: instant typing responsiveness without blocking table filtering.
- **Growth status filter** (`All`, `Growing`, `Declining`, `New`, `Lost`).
- **Top / Bottom N** filter.
- **Section collapse toggle**.
- **Memoized virtualized scrolling** (`@tanstack/react-virtual` + `React.memo` row component).
- **Row-level cross-filter button** adding global drill-down chips.
- **Pinned Totals footer**.

## Sticky In-Page Navigation & Responsive Drawer

- **Table Jump Bar (`src/components/TableJumpBar.tsx`)**: A sticky jump bar (`Insights · SubType · Distributor · Territory · Customer`) enables one-click smooth scrolling directly to the Visual Insights section or any level table.
- **Responsive Navigation**: On viewports below `md` (< 768px), the sidebar collapses into an off-canvas drawer opened via a hamburger menu button in the header. Arrow keys navigate focus among line buttons without firing premature calculations until confirmed.

## Performance & State Architecture

1. **Granular Selectors (`useShallow`)**: Isolated Zustand store subscriptions prevent table re-renders when typing in the sidebar search, toggling chart modes, or expanding/collapsing sidebars.
2. **Concurrent Transitions (`useTransition`)**: Filter, line, and period switches are scheduled as low-priority transitions, keeping the user interface completely responsive.
3. **Code-Splitting & Lazy Loading**: All chart and visual insight components (`MonthChart`, `GrowthChart`, `BubbleScatterChart`, `TerritoryHeatmap`, `CyTreemap`, `ContributionPriceVolume`) are lazily loaded with `Suspense` skeletons and isolated by an `ErrorBoundary`.
4. **URL Hash Synchronization (`useSyncExternalStore`)**:
   - Automatically synchronizes filter parameters in the URL hash (`metric`, `line`, `year`, `q`, `m`, `lfl`, `brands`, `items`, `mainTypes`, `txTypes`, `drill`).
   - Uses `useSyncExternalStore` for browser navigation (Back/Forward) and validates all URL parameters against dataset metadata on load.
5. **Color-Blind-Safe Theming (`src/lib/palette.ts`)**:
   - Okabe-Ito inspired `up` (`#0072B2`) and `down` (`#D55E00`) palette defined centrally in `tailwind.config.js` and exposed via CSS variables (`--color-up`, `--color-up-light`, `--color-up-vivid`, `--color-down`, `--color-down-light`, `--color-down-vivid`).
   - Shared helper functions in `src/lib/palette.ts` drive consistent status colors, heatmap cell styles, and treemap tile fills across light and dark modes.

## Customer Identity & CY Brick / Territory Attribution

- **Unified Customer Identity**: Customers are keyed jointly by `CustomerID + CustomerName` so that a customer with the same ID and Name in PY and CY is always treated as **one single customer** even if their brick changed between PY and CY.
- **Updated True Brick (CY)**: Each customer's `Brick` and `Territory` from their most recent sales period (CY first) are treated as the **updated true Brick and Territory**. All historical (PY) and current (CY) transactions for that customer are attributed to their CY Brick and CY Territory so that comparisons remain strictly like-for-like. Prior bricks are preserved in the `+N` tooltip badge on the Customer table.

## Changing `EXPANDABLE_SUBTYPES`

To change which `SubType` rows offer a per-`Chain` breakdown on the **SubType Level** table, edit [`src/lib/config.ts`](src/lib/config.ts):

```ts
export const EXPANDABLE_SUBTYPES: readonly string[] = ['Chain', 'Private'];
```

Any row under an expandable `SubType` whose `Chain` is empty/null is grouped into `(Unassigned / Independent)` so that child rows always sum exactly to the parent `SubType` row.

## Scripts

```bash
npm install          # Install dependencies
npm run convert      # Stream-convert ../HPG Sales_SalesPerDistributorCustomerLevel Q3-2026.xlsx -> public/data/sales.json.gz
npm run dev          # Start Vite dev server
npm run test         # Run Vitest acceptance test suite (15 tests)
npm run typecheck    # Run TypeScript compiler check (tsc --noEmit)
npm run build        # Typecheck and build production bundle to dist/
```
