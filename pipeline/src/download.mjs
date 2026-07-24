// Downloads the DPWH transparency dataset (Parquet) from Hugging Face into
// pipeline/data/raw/. Skips files that already exist.
//
// Source: https://huggingface.co/datasets/bettergovph/dpwh-transparency-data
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = join(__dirname, '..', 'data', 'raw');

const BASE =
  'https://huggingface.co/datasets/bettergovph/dpwh-transparency-data/resolve/main';

// The smaller summary file is the primary input for the pipeline. The larger
// all-details file (115 MB) is optional — enable it by setting ALL_DETAILS=1.
const FILES = [
  { name: 'dpwh_transparency_data.parquet' },
  ...(process.env.ALL_DETAILS
    ? [{ name: 'dpwh_transparency_data_all_details.parquet' }]
    : []),
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function download({ name }) {
  const dest = join(RAW_DIR, name);
  if (await exists(dest)) {
    console.log(`✓ ${name} already present, skipping`);
    return;
  }
  const url = `${BASE}/${name}?download=true`;
  console.log(`↓ downloading ${name} ...`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${name}: HTTP ${res.status}`);
  }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  const { size } = await stat(dest);
  console.log(`✓ ${name} (${(size / 1e6).toFixed(1)} MB)`);
}

async function main() {
  await mkdir(RAW_DIR, { recursive: true });
  for (const file of FILES) {
    await download(file);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
