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
   - Supports **All Qs** (full year / YTD) as well as any individual quarter (`Q1–Q4`), paired with **All months** or optional single-month selection (`Jan–Dec` under `All Qs`, or the quarter's 3 months under `Q1–Q4`). Auto-detects the latest year as CY, prior year as PY, and defaults to `All Qs` + `All months` with "Like-for-like months" ON.
8. **Guide Report Filter Bar (`Line → Brand → Product`) & URL Hash Sync**:
   - The Guide Report banner (`src/components/Filters.tsx`) provides a 3-step cascading searchable multi-select filter bar: **Line → Brand → Product**.
   - Selecting one or more `Lines` narrows the `Brand` and `Product` dropdowns to the selected `Line(s)` and auto-clears any previously selected `Brands` or `Products` outside them; selecting `Brands` further narrows `Product` options.
   - The `Line`, `Brand`, and `Product` dropdowns always list the full latest-period roster assigned to the active upstream selection (independent of TopBar month/quarter filters or table drill chips).
   - Multi-line selections (`lines`) sync to the URL hash via `line=` (comma-separated) alongside `brands`, `items`, `metric`, period settings, and cross-filter chips.
9. **Latest-Period Product-to-Line Attribution**:
   - Because products move between sales lines over time, every product (`Item`) and all of its historical PY and CY transactions are attributed to the `Line` (and `Brand`) recorded in that product's most recent active period in the full dataset (e.g., latest CY month first, falling back to its latest active period in PY if the product had no CY invoices).
   - This global latest-period structure is fixed regardless of the TopBar period selector, ensuring historical comparisons and Guide Report `Line → Brand → Product` filtering remain consistent across periods.
