/**
 * Reads admin:signals_blob_url from Vercel KV, fetches the file from Vercel Blob,
 * and writes it to signals_raw.json in the project root.
 * Used by ct-stories.yml before running the CT pipeline.
 * Exits with code 1 on any failure so GH Actions fails clearly.
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

// Step 1: get the blob URL from KV
const kvKey = "admin:signals_blob_url";
console.log(`⬇️  Fetching ${kvKey} from KV...`);

const kvRes = await fetch(`${KV_REST_API_URL}/get/${encodeURIComponent(kvKey)}`, {
    headers: { Authorization: `Bearer ${KV_REST_API_TOKEN}` },
});

if (!kvRes.ok) {
    console.error(`❌  KV request failed: ${kvRes.status} ${kvRes.statusText}`);
    process.exit(1);
}

const kvBody = await kvRes.json();
const blobUrl = kvBody.result;

if (!blobUrl || typeof blobUrl !== "string") {
    console.error(`❌  Key "${kvKey}" not found. Upload signals via the admin page first.`);
    process.exit(1);
}

// Step 2: fetch the file from Vercel Blob
console.log(`⬇️  Downloading signals from blob...`);

const blobRes = await fetch(blobUrl);

if (!blobRes.ok) {
    console.error(`❌  Blob download failed: ${blobRes.status} ${blobRes.statusText}`);
    process.exit(1);
}

const content = await blobRes.text();

// Quick sanity check
try {
    JSON.parse(content);
} catch {
    console.error("❌  Downloaded file is not valid JSON.");
    process.exit(1);
}

const outPath = path.join(process.cwd(), "signals_raw.json");
fs.writeFileSync(outPath, content, "utf-8");

const size = fs.statSync(outPath).size;
console.log(`✅  Wrote signals_raw.json (${(size / 1024).toFixed(1)} KB)`);
