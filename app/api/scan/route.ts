// Returns the last DLMM "hot pools" scan result for the /printers page.
// Reads from Vercel KV first; falls back to data/dlmm_printers.json.
// Does NOT run the scan itself - scanning (and Telegram alerting) happens
// once per cron tick via scripts/dlmmScanner.mjs, not on every page view.
import { NextResponse } from "next/server";
import { kv } from "../../../lib/kv";
import fs from "fs";
import path from "path";

export const revalidate = 60;

const FALLBACK_PATH = path.join(process.cwd(), "data", "dlmm_printers.json");

export async function GET() {
    if (kv) {
        try {
            const cached = await kv.get("validator:dlmm_printers");
            if (cached) {
                return NextResponse.json(cached);
            }
        } catch (e) {
            console.warn("KV fetch failed for dlmm_printers, falling back to file", e);
        }
    }

    if (fs.existsSync(FALLBACK_PATH)) {
        const content = fs.readFileSync(FALLBACK_PATH, "utf-8");
        const json = JSON.parse(content);
        return NextResponse.json(json);
    }

    return NextResponse.json({ generated_at: null, printers: [], alerted: false });
}
