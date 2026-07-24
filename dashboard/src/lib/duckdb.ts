// ============================================================================
// STEP 1 — DUCKDB-WASM INITIALIZATION & PARQUET LOADING  (browser only)
// ============================================================================
// A tiny singleton that:
//   1. lazily boots DuckDB-WASM in a Web Worker (off the main thread),
//   2. registers `cleaned_dataset.parquet` into DuckDB's in-memory virtual FS
//      via registerFileBuffer, and
//   3. exposes a timed `query()` helper that returns plain JS objects.
//
// Everything is dynamically imported and guarded so it NEVER runs during SSR
// (TanStack Start / Next.js both render on the server first).
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm'

const PARQUET_URL = '/data/cleaned_dataset.parquet'
const FILE_NAME = 'cleaned_dataset.parquet'
const VIEW = 'projects'

let dbPromise: Promise<AsyncDuckDBConnection> | null = null

/** Boot DuckDB-WASM once and register the Parquet file as a SQL view. */
async function boot(): Promise<AsyncDuckDBConnection> {
  if (typeof window === 'undefined') {
    throw new Error('DuckDB-WASM is browser-only and cannot run during SSR.')
  }
  // Dynamic import keeps the WASM/worker bundle out of the server build.
  const duckdb = await import('@duckdb/duckdb-wasm')

  // Let DuckDB pick the best pre-built bundle (mvp vs eh) from the CDN.
  const bundles = duckdb.getJsDelivrBundles()
  const bundle = await duckdb.selectBundle(bundles)

  // Spin up the worker from a Blob URL (Vite-friendly, no static worker file).
  const workerUrl = URL.createObjectURL(
    new Blob([`importScripts("${bundle.mainWorker}");`], {
      type: 'text/javascript',
    }),
  )
  const worker = new Worker(workerUrl)
  const db: AsyncDuckDB = new duckdb.AsyncDuckDB(new duckdb.ConsoleLogger(), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  URL.revokeObjectURL(workerUrl)

  // Fetch the Parquet once and hand the raw bytes to DuckDB's virtual FS.
  const buffer = new Uint8Array(await (await fetch(PARQUET_URL)).arrayBuffer())
  await db.registerFileBuffer(FILE_NAME, buffer)

  const conn = await db.connect()
  // A view means we never copy the data — queries read straight from Parquet.
  await conn.query(
    `CREATE VIEW ${VIEW} AS SELECT * FROM read_parquet('${FILE_NAME}')`,
  )
  return conn
}

/** Get the shared connection, booting DuckDB-WASM on first call. */
export function getConnection(): Promise<AsyncDuckDBConnection> {
  if (!dbPromise) dbPromise = boot()
  return dbPromise
}

export interface QueryResult<T> {
  rows: T[]
  /** Execution time in milliseconds (performance.now() delta). */
  ms: number
}

/** Convert an Arrow result to plain objects, coercing BigInt -> number. */
function toObjects<T>(table: { toArray: () => Array<{ toJSON: () => any }> }): T[] {
  return table.toArray().map((row) => {
    const obj = row.toJSON()
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'bigint') obj[key] = Number(obj[key])
    }
    return obj as T
  })
}

/** Run SQL against the in-browser dataset and measure latency. */
export async function query<T = Record<string, unknown>>(
  sql: string,
): Promise<QueryResult<T>> {
  const conn = await getConnection()
  const start = performance.now()
  const table = await conn.query(sql)
  const ms = performance.now() - start
  return { rows: toObjects<T>(table as any), ms }
}

export const DATASET_VIEW = VIEW
