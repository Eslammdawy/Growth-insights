# Sales Growth Analyzer (React + TypeScript)

Client-side analytical dashboard that measures quarterly sales growth versus the same quarter prior year (YoY) from an Excel export or pre-converted columnar dataset.

## Quick Start

```bash
cd app
npm install

# 1. Convert the 63 MB Excel workbook into a compact gzipped columnar dataset (~11 MB)
npm run convert

# 2. Start the development server
npm run dev

# 3. Run the Vitest acceptance test suite
npm test

# 4. Build a static bundle (relative paths, ready for any internal server / SharePoint folder)
npm run build
npm run preview
```

## Architecture & Hybrid Data Loading

The real export (`HPG Sales_SalesPerDistributorCustomerLevel Q3-2026.xlsx`) contains **494,242 rows** across 29 columns (~415 MB of uncompressed worksheet XML). To make loading instantaneous while still supporting direct browser `.xlsx` uploads:

1. **Node Streaming Converter (`npm run convert`)**:
   - Reads the `.xlsx` central directory via random access, inflates `xl/sharedStrings.xml` and the first worksheet incrementally with `fflate`, and scans rows chunk-by-chunk without loading the full XML into memory.
   - Dictionary-encodes string columns (`dict` + `Int32Array` codes) and stores numeric columns (`Date`, `Quantity`, `Value`) as `Float64Array`, writing `public/data/sales.json.gz` (git-ignored).
2. **In-Browser Web Worker (`src/workers/data.worker.ts`)**:
   - **Load Sample Data**: fetches `./data/sales.json.gz`, decompresses via `DecompressionStream`, and prepares typed arrays in memory.
   - **Upload `.xlsx` / `.json.gz`**: streams and parses uploaded files inside the Web Worker with live progress updates. Workbooks over 20 MB display a non-blocking banner recommending `npm run convert`.
   - **Single-Pass Aggregation (`src/lib/aggregate.ts`)**: runs in the worker against typed arrays (`Uint8Array` / `Int32Array` / `Float64Array`), scanning 494k rows in ~15 ms per filter change.

## Metrics & Growth Definitions

- **Supported Transaction Types**: Only `Sales` and `Return Sales` are included (default: both selected = Net Sales). `Bonus` and `Return Bonus` rows are kept in the parsed dataset but always excluded from all metrics so free goods never inflate Value or distort PPG.
- **Units**: $\sum \text{Quantity}$ (formatted with 0–1 decimals).
- **Value**: $\sum \text{Value}$ in EGP (formatted with thousands separators).
- **PPG (Price Per Goods / Unit)**:
  $$\text{PPG} = \frac{\sum \text{Value}}{\sum \text{Quantity}}$$
  Always computed from aggregated sums, never an average of row-level prices. When $\sum \text{Quantity} = 0$, displays `–`.
- **YoY Growth %**:
  $$\text{Growth \%} = \frac{\text{CY} - \text{PY}}{|\text{PY}|}$$
  - $\text{PY} = 0 \text{ and } \text{CY} \neq 0 \rightarrow \text{New}$
  - $\text{CY} = 0 \text{ and } \text{PY} > 0 \rightarrow -100.0\% \text{ (Lost)}$
  - $\text{PY} = 0 \text{ and } \text{CY} = 0 \rightarrow \text{–}$
- **Units / Value Table Columns**:
  - `PY`, `CY`, `Δ`, `Growth %`, `Share of Total (CY)` ($=\text{Row CY} / \text{Total CY}$), and `Contribution to Δ (pp)` ($= \text{Row }\Delta / |\text{Total PY}| \times 100$).
- **PPG Mode Table Columns**:
  - Because PPG is a ratio, standard share and additive contribution do not apply. Instead, PPG mode displays:
    - **CY Units Share**: $w_i = \text{Row CY Units} / \text{Total CY Units}$
    - **Price Effect**: $w_i \times (\text{Row CY PPG} - \text{Row PY PPG})$
    - **Mix Effect** (shown in the pinned Totals row): $\text{Total PPG }\Delta - \sum \text{Price Effects}$.

## Changing `EXPANDABLE_SUBTYPES`

To change which `SubType` rows can expand into a per-`Chain` breakdown on the **SubType** tab, edit [`src/lib/config.ts`](src/lib/config.ts):

```ts
export const EXPANDABLE_SUBTYPES: readonly string[] = ['Chain', 'Private'];
```

Any row under an expandable `SubType` whose `Chain` is empty/null is grouped into `(Unassigned / Independent)` so that child rows always sum exactly to the parent `SubType` row.

## Data Assumptions

1. **First Worksheet**: The parser always reads the first worksheet in workbook order regardless of its title (`SalesPerDistributorCustomerLev` in the production file).
2. **Customer Attribute Resolution**: 969 of the 42,459 customers appear under more than one `Brick` or `SubType` across periods. On the **Customer** level, `Brick` and `SubType` show the value from the customer's **most recent month** (CY first), with a `+N` badge whose tooltip lists all prior/other values.
3. **Filter Scope**: `Brand` and `Item` filters are stored per `Line` tab. `MainType`, `TransactionType`, and `Drill-down chips` are global and persist when switching between `Line` tabs. Sidebar badges reflect global filters and drill-down chips while ignoring `Brand`/`Item`.
