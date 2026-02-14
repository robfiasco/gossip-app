import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define paths
const rootDir = path.resolve(__dirname, "..");
const signalsPath = process.env.SIGNALS_PATH
    ? path.resolve(rootDir, process.env.SIGNALS_PATH)
    : path.join(rootDir, "signals_raw.json");

const outputPath = path.join(rootDir, "data", "tweets_72h.json");

console.log(`[Filter] Reading from: ${signalsPath}`);

try {
    if (!fs.existsSync(signalsPath)) {
        console.error(`[Error] signals_raw.json not found at ${signalsPath}`);
        process.exit(1);
    }

    const rawData = fs.readFileSync(signalsPath, "utf-8");
    const json = JSON.parse(rawData);

    // Extract tweets array (handle different structures)
    let tweets = [];
    if (Array.isArray(json)) {
        tweets = json;
    } else if (json.tweets && Array.isArray(json.tweets)) {
        tweets = json.tweets;
    } else if (json.posts && Array.isArray(json.posts)) {
        tweets = json.posts;
    } else {
        console.error("[Error] Could not find tweets/posts array in JSON");
        process.exit(1);
    }

    const totalBefore = tweets.length;
    console.log(`[Filter] Total tweets found: ${totalBefore}`);

    // Time window: 72 hours
    const now = Date.now();
    const windowMs = 72 * 60 * 60 * 1000;
    const cutoff = now - windowMs;

    let missingTimestamps = 0;
    let minIso = null;
    let maxIso = null;

    const normalized = tweets.map(t => {
        // Resolve metrics
        const metrics = {
            likes: t.metrics?.likes ?? t.likes ?? 0,
            reposts: t.metrics?.reposts ?? t.retweets ?? 0, // Handle 'retweets' vs 'reposts'
            replies: t.metrics?.replies ?? t.replies ?? 0,
            views: t.metrics?.views ?? t.views ?? 0
        };

        // Resolve timestamp
        let ms = 0;
        let iso = "";

        // Try explicit timestampMs (number or string)
        if (t.timestampMs) {
            ms = Number(t.timestampMs);
        }
        // Try created_at_ms variant
        else if (t.created_at_ms) {
            ms = Number(t.created_at_ms);
        }
        // Try created_at ISO string
        else if (t.created_at) {
            ms = new Date(t.created_at).getTime();
            iso = t.created_at;
        }

        // Backfill ISO if we have MS but no ISO
        if (ms > 0 && !iso) {
            iso = new Date(ms).toISOString();
        }

        // Backfill MS if valid ISO
        if (ms === 0 && iso) {
            ms = new Date(iso).getTime();
        }

        if (ms === 0 || isNaN(ms)) {
            missingTimestamps++;
        }

        return {
            id: t.id || t.data_id || t.tweet_id,
            handle: t.handle || t.username || t.screen_name,
            text: t.text || t.full_text || t.content || "",
            url: t.url || t.link || `https://twitter.com/${t.handle}/status/${t.id}`,
            created_at_ms: ms,
            created_at_iso: iso,
            metrics,
            // Optional: keep raw object if user requested "raw: optional (only if needed)"
            // but requirement 2 says "normalize into minimal object", implies discard raw unless needed.
            // Requirement 2 listing: "raw: optional (only if needed)". I will omit for cleanliness unless debugging.
        };
    });

    // Filter
    const filtered = normalized.filter(t => {
        if (!t.created_at_ms) return false;
        return t.created_at_ms >= cutoff;
    });

    // Sort descending (newest first)
    filtered.sort((a, b) => b.created_at_ms - a.created_at_ms);

    if (filtered.length > 0) {
        minIso = filtered[filtered.length - 1].created_at_iso;
        maxIso = filtered[0].created_at_iso;
    }

    // Write output
    // Ensure dir exists
    const outDir = path.dirname(outputPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    fs.writeFileSync(outputPath, JSON.stringify(filtered, null, 2), "utf-8");

    // Summary Logs
    console.log(`[Filter] Filtered to last 72 hours.`);
    console.log(`----------------------------------------`);
    console.log(`Total Before:       ${totalBefore}`);
    console.log(`Total After (72h):  ${filtered.length}`);
    console.log(`Missing Timestamps: ${missingTimestamps}`);
    console.log(`Oldest (in set):    ${minIso || "n/a"}`);
    console.log(`Newest (in set):    ${maxIso || "n/a"}`);
    console.log(`Output:             ${outputPath}`);
    console.log(`----------------------------------------`);

} catch (err) {
    console.error(`[Error] Failed to process tweets: ${err.message}`);
    process.exit(1);
}
