// Server-side proxy for CI to download signals_raw.json from Vercel Blob.
// The server has BLOB_READ_WRITE_TOKEN in env, so it can fetch private blobs.
// CI authenticates with ADMIN_SECRET only — no blob token needed in CI.
import { head } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { kv } from "../../../../lib/kv";

export async function GET(request: NextRequest) {
    const secret = request.nextUrl.searchParams.get("secret");
    if (!secret || secret !== process.env.ADMIN_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!kv) {
        return NextResponse.json({ error: "KV not configured" }, { status: 500 });
    }

    const blobUrl = await kv.get<string>("admin:signals_blob_url");
    if (!blobUrl) {
        return NextResponse.json({ error: "No signals uploaded yet" }, { status: 404 });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
        return NextResponse.json({ error: "Blob not configured" }, { status: 500 });
    }

    // Approach 1: head() to get signed downloadUrl
    try {
        const meta = await head(blobUrl, { token });
        const downloadUrl = meta.downloadUrl;
        console.log(`[download-signals] blobUrl domain: ${new URL(blobUrl).hostname}`);
        console.log(`[download-signals] downloadUrl same as blobUrl: ${downloadUrl === blobUrl}`);

        // Try signed URL first, then fall back to auth header
        for (const [label, fetchUrl, fetchOpts] of [
            ["signed-url", downloadUrl, {}],
            ["bearer-token", blobUrl, { headers: { authorization: `Bearer ${token}` } }],
        ] as const) {
            const res = await fetch(fetchUrl, fetchOpts as RequestInit);
            console.log(`[download-signals] ${label}: ${res.status}`);
            if (res.ok) {
                const content = await res.text();
                return new NextResponse(content, {
                    headers: { "Content-Type": "application/json" },
                });
            }
        }
    } catch (e) {
        console.error("[download-signals] head() failed:", e);
    }

    return NextResponse.json({ error: "All download attempts failed" }, { status: 502 });
}
