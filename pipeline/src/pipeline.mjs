// DPWH transparency ETL pipeline.
//
// Reads the raw Parquet downloaded by download.mjs, cleans and aggregates it
// with DuckDB SQL, and writes tidy, pre-aggregated Parquet artifacts to
// data/out/ for the dashboard (loaded client-side via DuckDB-WASM).
import duckdb from 'duckdb';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW = join(__dirname, '..', 'data', 'raw', 'dpwh_transparency_data.parquet');
const OUT = join(__dirname, '..', 'data', 'out');

const db = new duckdb.Database(':memory:');
const con = db.connect();
const run = (sql) =>
  new Promise((resolve, reject) =>
    con.run(sql, (err) => (err ? reject(err) : resolve())),
  );
const all = (sql) =>
  new Promise((resolve, reject) =>
    con.all(sql, (err, rows) => (err ? reject(err) : resolve(rows))),
  );

// Write a query result to a ZSTD-compressed Parquet file in data/out/.
async function emit(name, sql) {
  const dest = join(OUT, `${name}.parquet`);
  await run(`COPY (${sql}) TO '${dest}' (FORMAT PARQUET, COMPRESSION ZSTD)`);
  const [{ n }] = await all(`SELECT count(*) AS n FROM read_parquet('${dest}')`);
  console.log(`✓ ${name}.parquet (${n} rows)`);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  // Base cleaned view: normalize types, flatten the location struct, and drop
  // rows that are unusable for analysis (no budget).
  await run(`
    CREATE VIEW projects AS
    SELECT
      contractId,
      description,
      NULLIF(TRIM(category), '')            AS category,
      NULLIF(TRIM(status), '')              AS status,
      CAST(budget AS DOUBLE)                AS budget,
      CAST(amountPaid AS DOUBLE)            AS amount_paid,
      CAST(progress AS DOUBLE)              AS progress,
      location.region                       AS region,
      location.province                     AS province,
      NULLIF(TRIM(contractor), '')          AS contractor,
      startDate                             AS start_date,
      completionDate                        AS completion_date,
      TRY_CAST(infraYear AS INTEGER)        AS infra_year,
      NULLIF(TRIM(programName), '')         AS program_name,
      NULLIF(TRIM(sourceOfFunds), '')       AS source_of_funds,
      latitude,
      longitude
    FROM read_parquet('${RAW}')
    WHERE budget IS NOT NULL AND budget > 0
  `);

  const [{ total, budget }] = await all(`
    SELECT count(*) AS total, sum(budget) AS budget FROM projects
  `);
  console.log(
    `Loaded ${total} projects, total budget ₱${Number(budget).toLocaleString()}`,
  );

  // 1. Spend & counts by infrastructure category.
  await emit(
    'by_category',
    `SELECT
       coalesce(category, 'Unknown') AS category,
       count(*)              AS project_count,
       round(sum(budget), 2) AS total_budget,
       round(avg(progress), 1) AS avg_progress
     FROM projects
     GROUP BY 1
     ORDER BY total_budget DESC`,
  );

  // 2. Spend & counts by region.
  await emit(
    'by_region',
    `SELECT
       coalesce(region, 'Unknown') AS region,
       count(*)              AS project_count,
       round(sum(budget), 2) AS total_budget
     FROM projects
     GROUP BY 1
     ORDER BY total_budget DESC`,
  );

  // 3. Budget trend by infrastructure year.
  await emit(
    'by_year',
    `SELECT
       infra_year            AS year,
       count(*)              AS project_count,
       round(sum(budget), 2) AS total_budget
     FROM projects
     WHERE infra_year IS NOT NULL
     GROUP BY 1
     ORDER BY year`,
  );

  // 4. Project counts by status.
  await emit(
    'by_status',
    `SELECT
       coalesce(status, 'Unknown') AS status,
       count(*)              AS project_count,
       round(sum(budget), 2) AS total_budget
     FROM projects
     GROUP BY 1
     ORDER BY project_count DESC`,
  );

  // 5. Top contractors by total awarded budget.
  await emit(
    'top_contractors',
    `SELECT
       contractor,
       count(*)              AS project_count,
       round(sum(budget), 2) AS total_budget
     FROM projects
     WHERE contractor IS NOT NULL
     GROUP BY 1
     ORDER BY total_budget DESC
     LIMIT 50`,
  );

  console.log(`\nOutput written to ${OUT}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.close());
