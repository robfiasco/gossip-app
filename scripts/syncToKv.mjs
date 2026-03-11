import { createClient } from "@vercel/kv";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load environment variables from .env.local or .env
dotenv.config({ path: ".env.local" });
dotenv.config();

const KV_REST_API_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

if (!KV_REST_API_URL || !KV_REST_API_TOKEN) {
    console.warn("⚠️  KV_REST_API_URL / UPSTASH_REDIS_REST_URL not found. Skipping KV sync.");
    process.exit(0); // Exit gracefully so CI/CD doesn't fail if not configured
}

const kv = createClient({
    url: KV_REST_API_URL,
    token: KV_REST_API_TOKEN,
});

const STORIES_ONLY = process.argv.includes("--stories-only");

const ALL_FILES = [
    { local: "data/signal_board.json", key: "validator:signal_board" },
    { local: "data/briefing.json", key: "validator:briefing" },
    { local: "public/data/validator_stories.json", key: "validator:stories" },
    { local: "data/narratives.json", key: "validator:narratives" },
    { local: "data/market_context.json", key: "validator:market_context" },
];

const FILES_TO_SYNC = STORIES_ONLY
    ? ALL_FILES.filter(f => f.key === "validator:stories")
    : ALL_FILES;

const sync = async () => {
    console.log("🔌 Syncing data to Vercel KV...");

    for (const item of FILES_TO_SYNC) {
        const filePath = path.join(process.cwd(), item.local);
        if (fs.existsSync(filePath)) {
            try {
                const content = fs.readFileSync(filePath, "utf-8");
                const json = JSON.parse(content);
                await kv.set(item.key, json);
                console.log(`✅ Synced ${item.local} -> ${item.key}`);
            } catch (error) {
                console.error(`❌ Failed to sync ${item.local}:`, error.message);
            }
        } else {
            console.log(`Examples: ${item.local} not found, skipping.`);
        }
    }

    console.log("🎉 KV Sync complete.");
};

sync();
