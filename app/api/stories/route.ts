import { NextResponse } from "next/server";
import { kv } from "../../../lib/kv";
import fs from "fs";
import path from "path";

export const revalidate = 60;

const FALLBACK_PATH = path.join(process.cwd(), "data", "validator_stories.json");

export async function GET() {
    if (kv) {
        try {
            const cached = await kv.get("validator:stories");
            if (cached) {
                return NextResponse.json(cached);
            }
        } catch (e) {
            console.warn("KV fetch failed for stories, falling back to file", e);
        }
    }

    if (fs.existsSync(FALLBACK_PATH)) {
        const content = fs.readFileSync(FALLBACK_PATH, "utf-8");
        const json = JSON.parse(content);
        return NextResponse.json(json);
    }

    return NextResponse.json({ stories: [] });
}
