// Shared raw-source resolver.
//
// The workshop names the raw file `raw_dataset.csv`, but this project's real raw
// input is a Parquet download. This helper makes the scripts source-agnostic:
// point RAW_SOURCE at any .csv or .parquet and the correct DuckDB reader is used.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(__dirname, '..', 'data', 'raw');

// Preference order: explicit env var → raw_dataset.csv → the DPWH parquet.
export function resolveRawSource() {
  if (process.env.RAW_SOURCE) return process.env.RAW_SOURCE;
  const csv = join(RAW_DIR, 'raw_dataset.csv');
  if (existsSync(csv)) return csv;
  return join(RAW_DIR, 'dpwh_transparency_data.parquet');
}

// Return the DuckDB table function call for a given file, by extension.
export function readerFor(path) {
  if (path.toLowerCase().endsWith('.csv')) {
    // sample_size=-1 forces a full-file type sniff (no truncated inference).
    return `read_csv_auto('${path}', sample_size=-1)`;
  }
  return `read_parquet('${path}')`;
}
