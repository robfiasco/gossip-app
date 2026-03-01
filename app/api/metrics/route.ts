import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const revalidate = 60;

const METRICS_PATH = path.join(process.cwd(), "data", "story_metrics.json");

export async function GET() {
    try {
        if (fs.existsSync(METRICS_PATH)) {
            const content = fs.readFileSync(METRICS_PATH, "utf-8");
            const json = JSON.parse(content);
            return NextResponse.json(json);
        }
        return NextResponse.json({ error: "Metrics not found" }, { status: 404 });
    } catch (e) {
        console.error("Error fetching metrics:", e);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
