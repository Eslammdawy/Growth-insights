# Design Decisions (`docs/DECISIONS.md`)

Recorded from the design interview (2026-10-22) after profiling `HPG Sales_SalesPerDistributorCustomerLevel Q3-2026.xlsx` (494,242 rows, 415 MB worksheet XML).

1. **Data Loading Architecture (Q1)**:
   - **Decision**: Hybrid approach. `npm run convert` streams the `.xlsx` file in Node and outputs a dictionary-encoded columnar `.json.gz` (~11 MB) to `public/data/sales.json.gz` (git-ignored). In-browser `.xlsx` upload is also supported via a streaming Web Worker (`fflate` + chunked regex row scanner) with a warning banner for files > 20 MB.
2. **Transaction Types (Q2)**:
   - **Decision**: Support only `Sales` and `Return Sales`, with both selected by default (= Net Sales). `Bonus` and `Return Bonus` carry positive/negative list-price values in the export and are excluded from all metric calculations.
3. **Expandable SubTypes (Q3)**:
   - **Decision**: `EXPANDABLE_SUBTYPES = ['Chain', 'Private']` in `src/lib/config.ts`. In the real dataset, `SubType = Ezzaby` has `Chain = 'Ezzaby'` on 99.6% of rows, whereas `SubType = Private` has 8,116 rows assigned to pharmacy chains and 273,710 unassigned rows (grouped under `(Unassigned / Independent)`).
4. **Customer Level Multi-Brick / Multi-SubType Handling (Q4)**:
   - **Decision**: Key by `CustomerID` (one row per customer). Display the `Brick` and `SubType` from the customer's most recent month (CY first), with a `+N` badge and tooltip listing any other historical values.
5. **Period Scope (Q5)**:
   - **Decision**: Generalize to any quarter (`Q1–Q4`) with optional single-month selection. Auto-detect the latest year as CY, prior year as PY, and the latest quarter with CY data. Keep "Like-for-like months" ON by default.
6. **Sample Data & Test Fixtures (Q6)**:
   - **Decision**: "Load sample data" loads `public/data/sales.json.gz` (git-ignored so customer PII is not committed). Vitest acceptance tests run against a deterministic, stratified 3,000-row fixture (`src/lib/__fixtures__/sample.json`) plus a hand-crafted edge-case fixture (`src/lib/__fixtures__/edge-cases.json`).
7. **Filter & Drill-Chip Scope Across Line Tabs (Q7)**:
   - **Decision**: `Brand` and `Item` selections are remembered per `Line` tab. `MainType`, `TransactionType`, and drill-down chips are global across tabs. Sidebar Line growth badges respect global filters and drill chips but ignore `Brand`/`Item`. URL hash syncs `line`, `level`, and `metric`.
8. **Drill-Down Click Behavior (Q8)**:
   - **Decision**: Clicking a table row adds its cross-filter chip (or both `SubType` and `Chain` chips when clicking a Chain child row) and auto-advances along `SubType / Distributor → Territory → Brick → Customer`. A secondary filter button on each row allows filtering while staying on the current level.
9. **PPG Mode Columns (Q9)**:
   - **Decision**: Replace `Share of Total` and `Contribution (pp)` with `CY Units Share` (weight) and `Price Effect` (`CY Units Share × Row PPG Δ`), with the residual `Mix Effect` displayed in the pinned Totals row.
10. **Deployment & Levels (Q10–Q11)**:
    - **Decision**: Static build in `app/` with relative base (`./`) for local/internal hosting; keep the 5 analysis levels from the prompt (`SubType`, `Territory`, `Brick`, `Customer`, `Distributor`).
