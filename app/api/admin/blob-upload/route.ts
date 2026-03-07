// Generates a client upload token for Vercel Blob.
// Called by the @vercel/blob client SDK before uploading directly to blob storage.
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
    const body = (await request.json()) as HandleUploadBody;

    try {
        const jsonResponse = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async (_pathname, clientPayload) => {
                // Validate the admin secret passed as clientPayload
                const { secret } = JSON.parse(clientPayload ?? "{}");
                if (!secret || secret !== process.env.ADMIN_SECRET) {
                    throw new Error("Unauthorized");
                }
                return {
                    allowedContentTypes: ["application/json", "text/plain"],
                    maximumSizeInBytes: 50 * 1024 * 1024, // 50 MB
                };
            },
            onUploadCompleted: async () => {
                // Nothing needed here — upload-signals stores the URL after upload
            },
        });

        return NextResponse.json(jsonResponse);
    } catch (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        const status = msg === "Unauthorized" ? 401 : 400;
        return NextResponse.json({ error: msg }, { status });
    }
}
