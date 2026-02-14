import { NextResponse } from "next/server";
import { getTerminalData } from "../../../lib/data/terminalData";

export const revalidate = 300;

export async function GET() {
  const data = await getTerminalData();
  return NextResponse.json(data);
}
