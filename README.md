# Kiro PH Data — DPWH Transparency

A two-piece project that turns the DPWH infrastructure transparency dataset into
an interactive dashboard. **Parquet** is the hand-off format between the halves.

```
.
├── pipeline/    # Node.js + DuckDB ETL: raw Parquet -> tidy aggregated Parquet
└── dashboard/   # Vite + React + TS (TanStack Start) + DuckDB-WASM + Chart.js
```

## Pipeline

```bash
cd pipeline
npm install
npm start          # download raw data + run the ETL
```

Outputs aggregated Parquet to `pipeline/data/out/`. See `pipeline/README.md`.

## Dashboard

```bash
cd dashboard
npm install
npm run dev        # http://localhost:3000
```

Loads the pipeline's Parquet output client-side via DuckDB-WASM and renders it
with Chart.js.

## Data flow

```
Hugging Face raw Parquet
   → pipeline (DuckDB SQL clean + aggregate)
   → pipeline/data/out/*.parquet
   → dashboard (DuckDB-WASM + Chart.js)
   → charts in the browser
```

Source dataset: https://huggingface.co/datasets/bettergovph/dpwh-transparency-data
