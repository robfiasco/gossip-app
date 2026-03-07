// Generates a client upload token for Vercel Blob.
// Secret is validated via query param before handleUpload runs.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
    // Validate secret from query param before anything else
    const secretParam = request.nextUrl.searchParams.get("secret");
    const adminSecret = process.env.ADMIN_SECRET;
    console.log(`[blob-upload] secret param len=${secretParam?.length ?? 0} env len=${adminSecret?.length ?? 0} match=${secretParam === adminSecret}`);
    if (!secretParam || secretParam !== adminSecret) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
        console.error("[blob-upload] BLOB_READ_WRITE_TOKEN is not set");
        return NextResponse.json({ error: "Blob not configured" }, { status: 500 });
    }

    const body = (await request.json()) as HandleUploadBody;

    try {
        const jsonResponse = await handleUpload({
            token,
            body,
            request,
            onBeforeGenerateToken: async () => ({
                allowedContentTypes: ["application/json", "text/plain"],
                maximumSizeInBytes: 50 * 1024 * 1024,
            }),
            onUploadCompleted: async () => {},
        });

        return NextResponse.json(jsonResponse);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        console.error("[blob-upload] handleUpload error:", msg);
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
