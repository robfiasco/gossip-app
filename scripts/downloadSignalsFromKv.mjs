/**
 * Downloads admin:signals_raw from Vercel KV and writes it to signals_raw.json.
 * Used by the ct-stories.yml GitHub Actions workflow before running the CT pipeline.
 * Exits with code 1 if the key is missing so the workflow fails clearly.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
  console.error("❌  KV_REST_API_URL / KV_REST_API_TOKEN not set.");
  process.exit(1);
}

const key = "admin:signals_raw";
const url = `${KV_REST_API_URL}/get/${encodeURIComponent(key)}`;

console.log(`⬇️  Fetching ${key} from KV...`);

const res = await fetch(url, {
  headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
});

if (!res.ok) {
  console.error(`❌  KV request failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const body = await res.json();

// Upstash REST API wraps the value: { result: <value> }
const value = body.result;

if (value === null || value === undefined) {
  console.error(`❌  Key "${key}" not found in KV. Upload signals via the admin page first.`);
  process.exit(1);
}

const outPath = path.join(process.cwd(), "signals_raw.json");
fs.writeFileSync(outPath, JSON.stringify(value, null, 2), "utf-8");

const size = fs.statSync(outPath).size;
console.log(`✅  Wrote signals_raw.json (${(size / 1024).toFixed(1)} KB)`);
