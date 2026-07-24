# DPWH Transparency Pipeline

Node.js + DuckDB ETL that turns the raw DPWH transparency dataset into tidy,
pre-aggregated **Parquet** the dashboard loads client-side via DuckDB-WASM.

## Usage

```bash
npm install          # installs duckdb (native binding)
npm run download     # fetch raw Parquet from Hugging Face -> data/raw/
npm run pipeline     # clean + aggregate -> data/out/*.parquet
# or both at once:
npm start
```

Set `ALL_DETAILS=1` before `npm run download` to also grab the 115 MB
`*_all_details.parquet` file.

## Data flow

- **Source:** https://huggingface.co/datasets/bettergovph/dpwh-transparency-data
- **Input:** `data/raw/dpwh_transparency_data.parquet` (~248k projects, git-ignored)
- **Output:** `data/out/*.parquet` (ZSTD-compressed, git-ignored)

## Outputs

| File | Contents |
| --- | --- |
| `by_category.parquet` | project count, total budget, avg progress per category |
| `by_region.parquet` | project count and total budget per region |
| `by_year.parquet` | budget trend by infrastructure year |
| `by_status.parquet` | project counts/budget by status |
| `top_contractors.parquet` | top 50 contractors by awarded budget |

All transformation logic lives as SQL in `src/pipeline.mjs`.
