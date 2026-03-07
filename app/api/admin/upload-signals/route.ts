import { NextRequest, NextResponse } from "next/server";
import { kv } from "../../../../lib/kv";

const GITHUB_WORKFLOW_URL =
  "https://api.github.com/repos/robfiasco/gossip-app/actions/workflows/ct-stories.yml/dispatches";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { secret, signals } = body as { secret: unknown; signals: unknown };

  if (secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!signals || typeof signals !== "object") {
    return NextResponse.json({ error: "signals must be a JSON object or array" }, { status: 400 });
  }

  if (!kv) {
    return NextResponse.json({ error: "KV not configured" }, { status: 500 });
  }

  // Store signals in KV so the GH Actions workflow can fetch them
  await kv.set("admin:signals_raw", signals);

  // Trigger the GitHub Actions workflow
  const githubPat = process.env.GITHUB_PAT;
  if (!githubPat) {
    return NextResponse.json({ error: "GITHUB_PAT not configured" }, { status: 500 });
  }

  const triggeredAt = new Date().toISOString();

  const ghRes = await fetch(GITHUB_WORKFLOW_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${githubPat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (!ghRes.ok) {
    const errText = await ghRes.text();
    console.error("GitHub dispatch failed:", ghRes.status, errText);
    return NextResponse.json(
      { error: `GitHub dispatch failed: ${ghRes.status}` },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, triggeredAt });
}
