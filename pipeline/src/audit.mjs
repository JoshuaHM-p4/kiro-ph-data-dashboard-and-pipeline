// ============================================================================
// STEP 1 — DATA QUALITY ASSESSMENT & DIAGNOSTICS
// ============================================================================
// Runs an initial audit over the RAW source WITHOUT loading it into JS memory:
//   • schema + data types            (DESCRIBE)
//   • row count                      (COUNT(*))
//   • per-column missingness         (NULL + blank/whitespace for text)
//   • duplicate-record anomalies     (full-row + business-key duplicates)
//
// DuckDB reads the file with a streaming, columnar engine, so the audit runs in
// near-constant Node.js memory regardless of dataset size. All heavy scanning
// happens inside the C++ engine; Node only receives the small summary rows.
import duckdb from 'duckdb';
import { resolveRawSource, readerFor } from './source.mjs';

const RAW = resolveRawSource();
const SRC = readerFor(RAW);

const db = new duckdb.Database(':memory:');
const con = db.connect();
const all = (sql) =>
  new Promise((res, rej) => con.all(sql, (e, r) => (e ? rej(e) : res(r))));
const num = (v) => (typeof v === 'bigint' ? Number(v) : v);

async function main() {
  console.log(`\n=== STEP 1: DATA AUDIT ===\nsource: ${RAW}\n`);

  // --- 1a. Schema & data types ------------------------------------------------
  // DESCRIBE reports the column types DuckDB inferred. On raw enterprise data
  // this is where you catch monetary/numeric columns mis-typed as VARCHAR.
  const schema = await all(`DESCRIBE SELECT * FROM ${SRC}`);
  console.log('-- schema (column : type) --');
  for (const c of schema) console.log(`   ${c.column_name.padEnd(22)} ${c.column_type}`);

  // --- 1b. Row count ----------------------------------------------------------
  const [{ rows }] = await all(`SELECT count(*) AS rows FROM ${SRC}`);
  console.log(`\n-- row count: ${num(rows).toLocaleString()} --`);

  // --- 1c. Per-column missingness --------------------------------------------
  // Build one aggregate query that, for every column, counts NULLs and (for
  // text columns) values that are empty or whitespace-only once trimmed.
  const parts = schema.map((c) => {
    const col = `"${c.column_name}"`;
    const nulls = `sum(CASE WHEN ${col} IS NULL THEN 1 ELSE 0 END)`;
    const blanks = /^(VARCHAR|CHAR|TEXT|STRING)/i.test(c.column_type.trim())
      ? `sum(CASE WHEN ${col} IS NOT NULL AND length(trim(${col})) = 0 THEN 1 ELSE 0 END)`
      : `0`;
    return `${nulls} AS "${c.column_name}__null", ${blanks} AS "${c.column_name}__blank"`;
  });
  const [miss] = await all(`SELECT ${parts.join(', ')} FROM ${SRC}`);
  console.log('\n-- missingness (nulls / blanks) --');
  for (const c of schema) {
    const n = num(miss[`${c.column_name}__null`]);
    const b = num(miss[`${c.column_name}__blank`]);
    if (n || b) {
      const pct = ((n / num(rows)) * 100).toFixed(1);
      console.log(`   ${c.column_name.padEnd(22)} nulls=${n} (${pct}%)  blanks=${b}`);
    }
  }

  // --- 1d. Duplicate-record anomalies ----------------------------------------
  // Full-row duplicates over the scalar columns (exclude STRUCT/JSON which are
  // not comparable via DISTINCT), plus duplicates on the business key.
  const scalarCols = schema
    .filter((c) => !/STRUCT|JSON|MAP|LIST|\[\]/i.test(c.column_type))
    .map((c) => `"${c.column_name}"`);
  const [{ total_rows, distinct_rows }] = await all(`
    SELECT count(*) AS total_rows,
           (SELECT count(*) FROM (SELECT DISTINCT ${scalarCols.join(', ')} FROM ${SRC})) AS distinct_rows
    FROM ${SRC}`);
  console.log('\n-- duplicates --');
  console.log(`   full-row duplicates : ${num(total_rows) - num(distinct_rows)}`);

  // Business-key duplicates (contractId here). Adjust the key per dataset.
  const keyExists = schema.some((c) => c.column_name === 'contractId');
  if (keyExists) {
    const [{ dup_keys }] = await all(`
      SELECT coalesce(sum(c - 1), 0) AS dup_keys
      FROM (SELECT count(*) AS c FROM ${SRC} GROUP BY contractId HAVING count(*) > 1)`);
    console.log(`   duplicate contractId rows : ${num(dup_keys)}`);
  }

  console.log('\nAudit complete.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.close());
