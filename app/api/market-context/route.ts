import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { NextResponse } from "next/server";
import { kv } from "../../../lib/kv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../../../");
const cwd = process.cwd();
const CANDIDATE_PATHS = [
  path.join(repoRoot, "data", "market_context.json"),
  path.join(repoRoot, "market_context.json"),
  path.join(repoRoot, "public", "market_context.json"),
  path.join(cwd, "data", "market_context.json"),
  path.join(cwd, "market_context.json"),
  path.join(cwd, "public", "market_context.json"),
];

const FALLBACK = {
  as_of_utc: new Date().toISOString(),
  sol: { price: null, change_24h: null, change_7d: null },
  mkt_cap: { solana_mkt_cap_usd: null, change_24h: null },
  fear_greed: { value: null, label: "n/a" },
  btc_dominance: { value: null },
  vol: { sol_24h_usd: null },
};

const readFirstValid = () => {
  for (const filePath of CANDIDATE_PATHS) {
    if (!fs.existsSync(filePath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      if (parsed && typeof parsed === "object" && (Number.isFinite(Number(parsed?.sol?.price)) || Number.isFinite(Number(parsed?.mkt_cap?.solana_mkt_cap_usd)))) {
        return parsed;
      }
    } catch {
      // ignore malformed file and try next
    }
  }
  return FALLBACK;
};

export const revalidate = 60;

export async function GET() {
  if (kv) {
    try {
      const cached = await kv.get("validator:market_context");
      if (cached) {
        return NextResponse.json(cached);
      }
    } catch (e) {
      console.warn("KV fetch failed for market-context, falling back to file", e);
    }
  }

  const payload = readFirstValid();
  return NextResponse.json(payload);
}
