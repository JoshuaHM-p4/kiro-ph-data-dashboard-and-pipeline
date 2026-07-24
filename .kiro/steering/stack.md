---
inclusion: always
---

# Stack & Conventions

This project has two cooperating pieces that hand off data via **Parquet**.

## Repo layout

```
.               # monorepo root (git + .kiro steering)
├── dashboard/  # Vite + React + TS app (TanStack Start)
└── pipeline/   # Node.js + DuckDB ETL
```

Each piece is its own npm package with its own `package.json`. Run npm commands
from inside `dashboard/` or `pipeline/`, not from the root.

## 1. Pipeline (`pipeline/`)

- **Runtime:** Node.js (ESM, `"type": "module"`).
- **Engine:** [`duckdb`](https://www.npmjs.com/package/duckdb) — the native Node.js binding.
- **Job:** Ingest the raw DPWH transparency dataset (Parquet from Hugging Face),
  clean/aggregate it with SQL, and emit tidy **Parquet** artifacts for the dashboard.
- **Entry point:** `pipeline/src/pipeline.mjs`, run with `npm run pipeline`.
- **Inputs:** `pipeline/data/raw/*.parquet` (downloaded, git-ignored).
- **Outputs:** `pipeline/data/out/*.parquet` — the hand-off format.

### Conventions
- Keep raw downloads out of git (`data/raw/` is ignored); commit only code.
- All transformation logic lives in SQL executed through DuckDB; keep JS thin.
- Output Parquet must be small and query-friendly (pre-aggregated where sensible)
  so the browser can load it quickly.
- Use `ZSTD` compression on output Parquet.

## 2. Dashboard (`dashboard/` — TanStack Start / Vite + React + TS)

- **Stack:** Vite + React + TypeScript (TanStack Start / Router), Tailwind CSS.
- **In-browser analytics:** [`@duckdb/duckdb-wasm`](https://www.npmjs.com/package/@duckdb/duckdb-wasm)
  loads the pipeline's Parquet output and runs SQL client-side.
- **Charts:** [`chart.js`](https://www.chartjs.org/).
- **Dev server:** `npm run dev` (port 3000).

### Conventions
- The dashboard reads Parquet produced by the pipeline; it never touches raw data.
- Register a Parquet file with DuckDB-WASM, query with SQL, feed results to Chart.js.
- Keep bundle lean: DuckDB-WASM is loaded lazily where possible.
- UI primitives use **shadcn/ui** (`base-nova` style, built on **Base UI** `@base-ui/react`,
  not Radix). Components live in `src/components/ui/`; add more with
  `npx shadcn@latest add <name>`. The `@/*` import alias maps to `src/*`
  (tsconfig paths + an explicit Vite `resolve.alias`).
- shadcn design tokens live at the bottom of `src/styles.css`; the app's own
  sea/lagoon theme is separate and must stay intact.
- `/` redirects to `/dashboard` (the landing page).

## Data hand-off contract

```
Hugging Face raw Parquet
        │  (pipeline: DuckDB SQL clean + aggregate)
        ▼
pipeline/data/out/*.parquet
        │  (dashboard: DuckDB-WASM + Chart.js)
        ▼
Charts in the browser
```

Parquet is the single hand-off format between the two halves. Schema changes to the
output Parquet are a contract change — update both the pipeline and the dashboard.

## Source of truth

`PRD.md` (repo root) defines project scope, the pipeline transform rules, and the
dashboard visualizations. Keep this steering file and the code aligned with it.

### Output Parquet contract (`pipeline/data/out/`)

The dashboard depends on exactly these files/columns. Changing them means updating
both the pipeline transforms and the dashboard charts together:

| File | Columns |
| --- | --- |
| `cleaned_dataset.parquet` | row-level cleaned data (SNAPPY): `contract_id, description, category, status, budget DECIMAL(18,2), amount_paid BIGINT, progress DOUBLE, region, province, contractor, start_date, completion_date, infra_year, program_name, source_of_funds, latitude, longitude`. Zero nulls in core fields. |
| `by_category.parquet` | `category, project_count, total_budget, avg_progress` |
| `by_region.parquet` | `region, project_count, total_budget` |
| `by_year.parquet` | `year, project_count, total_budget` |
| `by_status.parquet` | `status, project_count, total_budget` |
| `top_contractors.parquet` | `contractor, project_count, total_budget` |

### Pipeline scripts (`pipeline/`)

| Command | Script | Purpose |
| --- | --- | --- |
| `npm run download` | `src/download.mjs` | fetch raw Parquet from Hugging Face |
| `npm run audit` | `src/audit.mjs` | Step 1 — data-quality diagnostics (schema, missingness, dupes) |
| `npm run clean` | `src/clean.mjs` | Steps 2–3 — clean + validate + export `cleaned_dataset.parquet` (SNAPPY) |
| `npm run pipeline` | `src/pipeline.mjs` | build the aggregate `by_*` Parquet files |
| `npm start` | — | download → clean → pipeline (full run) |

Categorical text is standardized to UPPER case and core fields are imputed
(`'UNKNOWN'`) or filtered so the cleaned output has zero nulls in core fields.
