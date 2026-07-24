# PRD — DPWH Transparency Dashboard (v0.1 draft)

Short scope doc for the two-piece project. Parquet is the hand-off contract.
This PRD is the source of truth; `.kiro/steering/stack.md` enforces it so the
pipeline and dashboard stay consistent.

## 1. Goal

Turn the ~248k-row DPWH infrastructure transparency dataset into a fast,
browser-only dashboard that answers: **where does public-works money go, on
what, by whom, and is it getting done?**

## 2. Data source

- Hugging Face `bettergovph/dpwh-transparency-data`.
- `dpwh_transparency_data.parquet` (24 MB, ~248k projects) — primary input.
- `dpwh_transparency_data_all_details.parquet` (115 MB) — optional, opt-in.

### Raw fields used
`contractId, description, category, status, budget (DOUBLE), amountPaid,
progress, location{region, province}, contractor, startDate, completionDate,
infraYear, programName, sourceOfFunds, latitude, longitude`.

## 3. Pipeline — transform rules

Runtime: Node.js + DuckDB. All logic is SQL in `pipeline/src/pipeline.mjs`.

**Cleaning (base `projects` view):**
- Trim/normalize text fields; empty strings → `NULL`.
- Cast `budget`, `amountPaid`, `progress` to `DOUBLE`; `infraYear` → `INTEGER` (TRY_CAST).
- Flatten `location` struct into `region` / `province`.
- **Row filter:** drop rows where `budget IS NULL OR budget <= 0` (unusable for spend analysis).
- `NULL` category/region/status → surfaced as `"Unknown"` in aggregates.

**Aggregated outputs (ZSTD Parquet → `pipeline/data/out/`):**
| File | Grain | Measures |
| --- | --- | --- |
| `by_category` | category | project_count, total_budget, avg_progress |
| `by_region` | region | project_count, total_budget |
| `by_year` | infra_year | project_count, total_budget |
| `by_status` | status | project_count, total_budget |
| `top_contractors` | contractor (top 50 by budget) | project_count, total_budget |

Rules: budgets rounded to 2 decimals; sorted by the primary measure; each output
is small (< a few KB) so the browser loads instantly.

## 4. Dashboard — key visualizations

Stack: TanStack Start (Vite + React + TS), DuckDB-WASM (query Parquet in-browser),
Chart.js. Each chart = one output Parquet file registered with DuckDB-WASM.

1. **KPI cards** — total projects, total budget, avg progress (from base counts).
2. **Budget by category** — horizontal bar, `by_category` (top N + "Other").
3. **Budget by region** — bar/map, `by_region`.
4. **Budget trend by year** — line, `by_year`.
5. **Status breakdown** — doughnut, `by_status`.
6. **Top contractors** — table/bar, `top_contractors`.

## 5. Non-goals (v0.1)

- No project-level search/detail table (needs the 115 MB details file).
- No live/geospatial map layer initially (lat/long present but out of scope).
- No auth; static Parquet loaded client-side only.

## 6. Open questions (please confirm)

1. **Budget field meaning** — is `budget` contract cost (ABC/awarded)? Should we
   also chart `amountPaid` (disbursed) vs `budget` to show utilization?
2. **Category granularity** — raw `category` has ~137 distinct values (messy).
   Roll up to a curated set (Roads/Bridges/Flood Control/Buildings/Other), or keep raw?
3. **Region normalization** — regions look like `"Region XIII"` and provinces like
   `"Agusan del Norte DEO"` (district-office suffix). Strip `" DEO"` / standardize region labels?
4. **Year scope** — `infraYear` spans ~10 years. Limit to a range (e.g. last 5)?
5. **Details file** — include the 115 MB file to enable a searchable project table,
   or stay summary-only for v0.1?
6. **Chart library** — Chart.js confirmed (vs recharts)?
7. **Map** — want a province/region choropleth or point map now, or defer?

Answer these and I'll fold the decisions into `.kiro/steering/stack.md` and adjust
the transforms/visualizations accordingly.
