import { createClient } from "@vercel/kv";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    console.error("❌ KV credentials not found in environment.");
    process.exit(1);
}

const kv = createClient({
    url: KV_REST_API_URL,
    token: KV_REST_API_TOKEN,
});

async function verify() {
    console.log("🔍 Verifying KV Integration...");

    try {
        // 1. Check Connection
        await kv.set("validator:test_key", "success");
        const val = await kv.get("validator:test_key");
        if (val === "success") {
            console.log("✅ KV Connection: OK");
            await kv.del("validator:test_key");
        } else {
            console.error("❌ KV Connection: Failed (Value mismatch)");
        }

        // 2. Check Data Presence (Optional, depends on if sync ran)
        const keys = [
            "validator:market_context",
            "validator:stories",
            "validator:signal_board"
        ];

        for (const key of keys) {
            const exists = await kv.exists(key);
            console.log(`${exists ? "✅" : "⚠️"} Key '${key}': ${exists ? "Found" : "Not Found (Run sync to populate)"}`);
        }

    } catch (error) {
        console.error("❌ Verification Failed:", error);
    }
}

verify();
