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

    // Use SDK to get a signed download URL — works for private blobs server-side
    const meta = await head(blobUrl, { token });
    const res = await fetch(meta.downloadUrl);

    if (!res.ok) {
        return NextResponse.json({ error: `Blob fetch failed: ${res.status}` }, { status: 502 });
    }

    const content = await res.text();
    return new NextResponse(content, {
        headers: { "Content-Type": "application/json" },
    });
}
