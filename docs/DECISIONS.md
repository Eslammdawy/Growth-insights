# Design Decisions (`docs/DECISIONS.md`)

Recorded from the initial design interview (2026-10-22) and updated after the 2026-10-25 dashboard refinement.

1. **Data Loading Architecture**:
   - `npm run convert` streams the `.xlsx` file in Node and outputs a dictionary-encoded columnar `.json.gz` (~11 MB) to `public/data/sales.json.gz` (git-ignored). On startup, the Web Worker automatically loads `public/data/sales.json.gz`.
2. **Transaction Types**:
   - Support only `Sales` and `Return Sales`, with both selected by default (= Net Sales). `Bonus` and `Return Bonus` are excluded from all metric and customer-attribute calculations.
3. **Metrics & Value Columns**:
   - Only **Units** and **Value (EGP)** are supported (all PPG metrics, price/mix decomposition, Share of Total, and Contribution pp columns were removed per user request).
   - Every table displays **PY**, **CY**, **YoY Growth** ($\Delta = \text{CY} - \text{PY}$), and **YoY Growth %** ($(\text{CY} - \text{PY}) / |\text{PY}|$).
4. **Header & Layout**:
   - Upload, Load Sample Data, and CSV/Excel Export buttons were removed from the top bar.
   - Only the **Light / Dark mode toggle** is kept in the right side of the header, and vertical spacing is tightened so KPI cards and main tables sit higher on the page.
5. **Stacked Per-Level Tables with Inline Item Drill-Down**:
   - All 5 analysis levels (`SubType`, `Distributor`, `Territory`, `Brick`, `Customer`) are rendered as separate stacked tables on the main page (`src/components/LevelTable.tsx`).
   - Clicking any row in any level table expands an inline **Item** breakdown for that row (computed on demand in the Web Worker via `analyzeItems`).
   - On the `SubType` table, `EXPANDABLE_SUBTYPES = ['Chain', 'Private']` also expose a `chains` pill that expands the per-Chain breakdown inline, and each Chain child row can itself be clicked to expand its Item breakdown.
   - Each table has a hover filter button to add a global cross-filter chip (`DrillChips`) when desired.
6. **Customer Identity & True CY Brick / Territory Attribution**:
   - Customers with the same `CustomerID` and `CustomerName` in PY and CY are unified as one customer even if their Brick changed between PY and CY.
   - The customer's `Brick` (and associated `Territory`) in the most recent period (CY first) is treated as the **updated true Brick**. All PY and CY transactions for that customer are attributed to that CY Brick and CY Territory across the Brick, Territory, and Customer tables, with prior bricks shown in a `+N` tooltip badge on the Customer table.
7. **Period Scope**:
   - Supports any quarter (`Q1–Q4`) with optional single-month selection. Auto-detects the latest year as CY, prior year as PY, and the latest quarter with CY data. "Like-for-like months" is ON by default.
8. **Filter Scope Across Line Tabs**:
   - `Brand` and `Item` selections are remembered per `Line` tab. `MainType`, `TransactionType`, and cross-filter chips are global across tabs. Sidebar Line growth badges respect global filters and drill chips but ignore `Brand`/`Item`. URL hash syncs `line` and `metric`.
