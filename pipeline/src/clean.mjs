// ============================================================================
// STEP 2 — CLEANING & INTEGRITY ENFORCEMENT   (zero nulls in core fields)
// STEP 3 — POST-QUALITY VALIDATION & EXPORT   (assertions + SNAPPY Parquet)
// ============================================================================
// Produces a row-level, production-ready `cleaned_dataset.parquet` for the
// DuckDB-WASM dashboard. Every transform is expressed as declarative SQL so the
// DuckDB engine streams the 248k rows through its vectorized executor; Node.js
// never materializes the dataset, keeping the ingestion box memory-flat.
import duckdb from 'duckdb';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRawSource, readerFor } from './source.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'data', 'out');
const OUT = join(OUT_DIR, 'cleaned_dataset.parquet');
const RAW = resolveRawSource();
const SRC = readerFor(RAW);

const db = new duckdb.Database(':memory:');
const con = db.connect();
const run = (sql) => new Promise((res, rej) => con.run(sql, (e) => (e ? rej(e) : res())));
const all = (sql) => new Promise((res, rej) => con.all(sql, (e, r) => (e ? rej(e) : res(r))));
const num = (v) => (typeof v === 'bigint' ? Number(v) : v);

// Core analysis fields that MUST be non-null in the output (the quality gate).
const CORE_FIELDS = [
  'contract_id', 'category', 'status', 'region', 'province',
  'contractor', 'budget', 'amount_paid', 'progress',
];

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${message}`);
  console.log(`   ✓ ${message}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`\n=== STEP 2/3: CLEAN + VALIDATE + EXPORT ===\nsource: ${RAW}\n`);
  const [{ raw_rows }] = await all(`SELECT count(*) AS raw_rows FROM ${SRC}`);

  // --------------------------------------------------------------------------
  // STEP 2 — build the cleaned relation with all integrity rules in one pass.
  // --------------------------------------------------------------------------
  await run(`
    CREATE VIEW cleaned AS
    SELECT
      -- Identifier: TRIM whitespace; rows without it are dropped in WHERE below.
      trim(contractId)                                             AS contract_id,
      nullif(trim(description), '')                                AS description,

      -- Standardize categorical casing to one canonical case (UPPER collapses
      -- "Roads"/"roads"/"ROADS" into one group) + impute nulls/blanks.
      coalesce(nullif(upper(trim(category)), ''), 'UNKNOWN')       AS category,
      coalesce(nullif(upper(trim(status)),   ''), 'UNKNOWN')       AS status,

      -- Monetary/numeric: strict types. budget -> DECIMAL(18,2), paid -> BIGINT.
      CAST(budget AS DECIMAL(18,2))                                AS budget,
      CAST(coalesce(amountPaid, 0) AS BIGINT)                      AS amount_paid,
      CAST(coalesce(round(progress, 2), 0) AS DOUBLE)              AS progress,

      -- Flatten STRUCT; TRIM + impute region; strip trailing " DEO" from province.
      coalesce(nullif(trim(location.region), ''), 'Unknown')       AS region,
      coalesce(nullif(trim(regexp_replace(location.province, '\\s*DEO$', '')), ''), 'Unknown') AS province,

      -- Contractor: standardize to UPPER for consistent grouping; impute nulls.
      coalesce(nullif(upper(trim(contractor)), ''), 'UNKNOWN CONTRACTOR') AS contractor,

      startDate                                                    AS start_date,
      completionDate                                               AS completion_date,

      -- infraYear is VARCHAR in raw -> cast to INTEGER, fall back to date years.
      coalesce(try_cast(infraYear AS INTEGER), year(startDate), year(completionDate)) AS infra_year,

      coalesce(nullif(trim(programName), ''),   'Unknown')         AS program_name,
      coalesce(nullif(trim(sourceOfFunds), ''), 'Unknown')         AS source_of_funds,
      latitude,
      longitude
    FROM ${SRC}
    -- Filtered removal: an unusable identifier or non-positive budget can't be
    -- imputed meaningfully, so those rows are dropped rather than guessed.
    WHERE contractId IS NOT NULL AND length(trim(contractId)) > 0
      AND budget IS NOT NULL AND budget > 0
    -- Deduplicate on the business key, keeping the most recently completed row.
    QUALIFY row_number() OVER (
      PARTITION BY trim(contractId)
      ORDER BY completionDate DESC NULLS LAST
    ) = 1
  `);

  const [{ clean_rows }] = await all(`SELECT count(*) AS clean_rows FROM cleaned`);
  console.log(`raw rows:   ${num(raw_rows).toLocaleString()}`);
  console.log(`clean rows: ${num(clean_rows).toLocaleString()}  (dropped ${(num(raw_rows) - num(clean_rows)).toLocaleString()})\n`);

  // --------------------------------------------------------------------------
  // STEP 3a — PRE-EXPORT ASSERTIONS (fail fast before writing any file).
  // --------------------------------------------------------------------------
  console.log('-- validation --');
  const nullSel = CORE_FIELDS
    .map((c) => `sum(CASE WHEN ${c} IS NULL THEN 1 ELSE 0 END) AS ${c}`)
    .join(', ');
  const [nulls] = await all(`SELECT ${nullSel} FROM cleaned`);
  for (const f of CORE_FIELDS) assert(num(nulls[f]) === 0, `zero nulls in core field "${f}"`);

  const [{ min_budget }] = await all(`SELECT min(budget) AS min_budget FROM cleaned`);
  assert(Number(min_budget) > 0, 'all budgets are positive');

  const [{ dup }] = await all(
    `SELECT count(*) - count(DISTINCT contract_id) AS dup FROM cleaned`,
  );
  assert(num(dup) === 0, 'contract_id is unique (no duplicates)');

  assert(
    num(clean_rows) > 0 && num(clean_rows) <= num(raw_rows),
    `row count within bounds (0 < ${num(clean_rows)} <= ${num(raw_rows)})`,
  );

  // --------------------------------------------------------------------------
  // STEP 3b — EXPORT to Parquet with SNAPPY (fast decode for the browser).
  // --------------------------------------------------------------------------
  await run(`COPY (SELECT * FROM cleaned) TO '${OUT}' (FORMAT PARQUET, COMPRESSION SNAPPY)`);
  console.log(`\n✓ exported ${OUT}`);

  // --------------------------------------------------------------------------
  // STEP 3c — POST-EXPORT VALIDATION (re-open the artifact and re-check).
  // --------------------------------------------------------------------------
  const [postNulls] = await all(
    `SELECT ${nullSel} FROM read_parquet('${OUT}')`,
  );
  for (const f of CORE_FIELDS)
    assert(num(postNulls[f]) === 0, `[post-export] zero nulls in "${f}"`);
  const [{ n }] = await all(`SELECT count(*) AS n FROM read_parquet('${OUT}')`);
  assert(num(n) === num(clean_rows), `[post-export] row count matches (${num(n)})`);

  console.log('\nAll checks passed. cleaned_dataset.parquet is production-ready.\n');
}

main()
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  })
  .finally(() => db.close());
