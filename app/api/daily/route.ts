import { NextResponse } from "next/server";
import { loadDailyData } from "../../../src/lib/loadDailyData";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET() {
    try {
        const data = await loadDailyData();
        return NextResponse.json({
            ...data,
            diagnostics: {
                kvUrl: !!process.env.KV_REST_API_URL,
                kvToken: !!process.env.KV_REST_API_TOKEN,
                pwd: process.cwd(),
                nodeEnv: process.env.NODE_ENV,
                date: new Date().toISOString()
            }
        });
    } catch(e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
