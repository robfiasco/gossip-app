import { NextRequest, NextResponse } from "next/server";

const GITHUB_RUNS_URL =
  "https://api.github.com/repos/robfiasco/gossip-app/actions/workflows/ct-stories.yml/runs?per_page=5";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (token !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = req.nextUrl.searchParams.get("since");
  if (!since) {
    return NextResponse.json({ error: "Missing since param" }, { status: 400 });
  }

  const githubPat = process.env.GITHUB_PAT;
  if (!githubPat) {
    return NextResponse.json({ error: "GITHUB_PAT not configured" }, { status: 500 });
  }

  const ghRes = await fetch(GITHUB_RUNS_URL, {
    headers: {
      Authorization: `Bearer ${githubPat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    // Don't cache — always want fresh status
    cache: "no-store",
  });

  if (!ghRes.ok) {
    return NextResponse.json({ error: `GitHub API failed: ${ghRes.status}` }, { status: 502 });
  }

  const data = await ghRes.json();
  const sinceDate = new Date(since);

  // Find the first run created after the trigger time
  const run = (data.workflow_runs as Array<{
    created_at: string;
    status: string;
    conclusion: string | null;
    html_url: string;
    updated_at: string;
  }>).find((r) => new Date(r.created_at) >= sinceDate);

  if (!run) {
    return NextResponse.json({ status: "not_found" });
  }

  return NextResponse.json({
    status: run.status,
    conclusion: run.conclusion,
    html_url: run.html_url,
    created_at: run.created_at,
    updated_at: run.updated_at,
  });
}
