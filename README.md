# Sales Growth Analyzer (React + TypeScript)

Client-side analytical dashboard that measures quarterly sales growth versus the same quarter prior year (YoY) from the pre-converted columnar dataset (`public/data/sales.json.gz`).

<<<<<<< HEAD
<<<<<<< HEAD
## Architecture & Hybrid Data Loading
=======
##  Hybrid Data Loading
>>>>>>> 0173b1f (Describe what you changed)
=======
## Architecture & Data Loading
>>>>>>> e81cd6e (Describe your changes)

The production workbook (`HPG Sales_SalesPerDistributorCustomerLevel Q3-2026.xlsx`) contains **494,242 rows** across 29 columns (~415 MB of uncompressed worksheet XML). To make loading and interactive slicing instantaneous:

1. **Node Streaming Converter (`npm run convert`)**:
   - Reads the `.xlsx` central directory via random access, inflates `xl/sharedStrings.xml` and the first worksheet incrementally with `fflate`, and scans rows chunk-by-chunk without loading the full XML into memory.
   - Dictionary-encodes string columns (`dict` + `Int32Array` codes) and stores numeric columns (`Date`, `Quantity`, `Value`) as `Float64Array`, writing `public/data/sales.json.gz` (~11 MB, git-ignored).
2. **In-Browser Web Worker (`src/workers/data.worker.ts`)**:
   - Automatically fetches `./data/sales.json.gz` on startup, decompresses via `DecompressionStream` (with `fflate` fallback), and builds typed-array indexes in memory.
   - **Single-Pass Multi-Level Aggregation (`src/lib/aggregate.ts`)**: computes totals, monthly trends, sidebar Line summaries, and **all 5 analysis level tables** (`SubType`, `Distributor`, `Territory`, `Brick`, `Customer`) simultaneously in a single typed-array pass (~15–20 ms across 494k rows).
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
- **Table Value Columns**:
  - `PY`, `CY`, `YoY Growth` ($\Delta$), and `YoY Growth %` (with inline magnitude bars and status badges).

## Multi-Level Stacked Tables & Item Drill-Down

All five analysis levels are displayed in dedicated stacked tables on the main dashboard page (`src/components/LevelTable.tsx`):

1. **SubType Level**:
   - Click any `SubType` row to expand its **Item** breakdown inline.
   - For expandable SubTypes (`Chain` and `Private`), click the **`N chains`** pill to expand the per-`Chain` breakdown inline; click any `Chain` child row to expand that chain's **Item** breakdown (3-level hierarchy: `SubType → Chain → Item`).
2. **Distributor Level**: Click any distributor row to expand its **Item** breakdown.
3. **Territory Level**: Click any territory row to expand its **Item** breakdown.
4. **Brick Level**: Shows the brick and its dominant `Territory` (`+N` badge if multiple); click any brick row to expand its **Item** breakdown.
5. **Customer Level**: Shows `Customer Name`, `Customer ID`, `Brick (CY)`, and `SubType` (`+N` badges for historical values); click any customer row to expand its **Item** breakdown.

Each level table includes independent **search**, **growth status filter** (`All`, `Growing`, `Declining`, `New`, `Lost`), **Top / Bottom N** filter, section collapse toggle, virtualized scrolling (`@tanstack/react-virtual`), a row-level cross-filter button, and a pinned **Totals** footer.

## Customer Identity & CY Brick / Territory Attribution

- **Unified Customer Identity**: Customers are keyed jointly by `CustomerID + CustomerName` so that a customer with the same ID and Name in PY and CY is always treated as **one single customer** even if their brick changed between PY and CY.
- **Updated True Brick (CY)**: Each customer's `Brick` and `Territory` from their most recent sales period (CY first) are treated as the **updated true Brick and Territory**. All historical (PY) and current (CY) transactions for that customer are attributed to their CY Brick and CY Territory so that Brick-level, Territory-level, and Customer-level YoY comparisons remain strictly like-for-like. Prior bricks are preserved in the `+N` tooltip badge on the Customer table.

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
npm run test         # Run Vitest acceptance test suite (10 tests)
npm run typecheck    # Run TypeScript compiler check (tsc --noEmit)
npm run build        # Typecheck and build production bundle to dist/
```
