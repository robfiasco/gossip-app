import { NextResponse } from "next/server";
import { loadDailyData } from "../../../src/lib/loadDailyData";

export const revalidate = 60; // cache for 60s

export async function GET() {
    const data = await loadDailyData();
    return NextResponse.json(data);
}
