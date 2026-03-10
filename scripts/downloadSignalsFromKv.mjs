/**
 * Downloads signals_raw.json via the app's /api/admin/download-signals proxy.
 * The server handles all blob auth internally — CI only needs ADMIN_SECRET.
 * Used by ct-stories.yml before running the CT pipeline.
 * Exits with code 1 on any failure so GH Actions fails clearly.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const APP_URL = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.APP_URL || "https://gossip-app-rob-fiasco.vercel.app";

if (!ADMIN_SECRET) {
    console.error("❌  ADMIN_SECRET not set.");
    process.exit(1);
}

console.log(`⬇️  Downloading signals via proxy at ${APP_URL}...`);

const res = await fetch(
    `${APP_URL}/api/admin/download-signals?secret=${encodeURIComponent(ADMIN_SECRET)}`
);

if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`❌  Download failed: ${res.status} ${res.statusText} — ${body}`);
    process.exit(1);
}

const content = await res.text();

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
