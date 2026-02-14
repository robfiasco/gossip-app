import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const inputPath = path.join(rootDir, "data", "tweets_72h.json");
const outputPath = path.join(rootDir, "data", "tweet_clusters.json");

// --- Configuration ---

const CATEGORIES = {
    "Token Launch / Pump": ["launch", "tge", "airdrop", "snapshot", "claim", "token", "meme", "pump", "moon", "presale", "whitelist", "wl"],
    "Hack / Exploit": ["exploit", "hack", "drain", "funds", "compromised", "alert", "rug", "scam", "phishing", "security"],
    "Staking / LST": ["staking", "lst", "liquid", "marinade", "jito", "sanctum", "solayer", "restaking", "eigen"],
    "Perps / Trading": ["perps", "trading", "drift", "zeta", "cypher", "mango", "marginfi", "long", "short", "leverage", "volume", "chart"],
    "DeFi Yield / LP": ["yield", "apy", "farm", "pool", "lp", "kamino", "meteora", "orca", "raydium", "jupiter", "jup", "jlp", "dlmm"],
    "Infra / MEV": ["mev", "validator", "rpc", "helius", "triton", "firedancer", "client", "zk", "compression", "firedancer", "cliff", "upgrade"],
    "AI / Agents": ["ai", "agent", "agents", "llm", "neural", "gpu", "inference", "compute"],
    "Wallets": ["wallet", "phantom", "backpack", "solflare", "ledger", "trezor"],
    "Ecosystem Updates": ["solana", "sol", "ecosystem", "breaking", "update", "colosseum", "radar", "hackathon", "superteam"]
};

// Inverse map for fast category lookup
const KEYWORD_TO_CATEGORY = {};
Object.entries(CATEGORIES).forEach(([cat, keywords]) => {
    keywords.forEach(k => KEYWORD_TO_CATEGORY[k] = cat);
});

// All keywords set for fast checking
const ALL_KEYWORDS = new Set(Object.values(CATEGORIES).flat());

const STOPWORDS = new Set([
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for", "not", "on", "with", "he", "as", "you", "do", "at", "this", "but", "his", "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my", "one", "all", "would", "there", "their", "what", "so", "up", "out", "if", "about", "who", "get", "which", "go", "me", "when", "make", "can", "like", "time", "no", "just", "him", "know", "take", "people", "into", "year", "your", "good", "some", "could", "them", "see", "other", "than", "then", "now", "look", "only", "come", "its", "over", "think", "also", "back", "after", "use", "two", "how", "our", "work", "first", "well", "way", "even", "new", "want", "because", "any", "these", "give", "day", "most", "us", "http", "https", "co", "t", "rt", "via"
]);

// --- Utilities ---

const normalizeText = (text) => {
    return text
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, "") // remove URLs
        .replace(/@\w+/g, "") // remove mentions (handles)
        .replace(/[^\w\s]/g, " ") // remove punctuation
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w));
};

const extractKeywords = (tokens) => {
    const matched = new Set();
    tokens.forEach(t => {
        if (ALL_KEYWORDS.has(t)) matched.add(t);
        // rudimentary plural handling (very basic)
        if (t.endsWith("s") && ALL_KEYWORDS.has(t.slice(0, -1))) matched.add(t.slice(0, -1));
    });
    return Array.from(matched);
};

const determineCategory = (matchedKeywords) => {
    if (matchedKeywords.length === 0) return "General / Uncategorized";

    const counts = {};
    matchedKeywords.forEach(k => {
        const cat = KEYWORD_TO_CATEGORY[k];
        if (cat) counts[cat] = (counts[cat] || 0) + 1;
    });

    let bestCat = "General / Uncategorized";
    let maxCount = 0;

    Object.entries(counts).forEach(([cat, count]) => {
        if (count > maxCount) {
            maxCount = count;
            bestCat = cat;
        }
    });

    return bestCat;
};

const calculateScore = (t, matchedKeywords) => {
    const metrics = t.metrics || {};
    const likes = metrics.likes || 0;
    const reposts = metrics.reposts || 0;
    const replies = metrics.replies || 0;

    // Engagement Score
    const engagement = likes + (reposts * 2) + (replies * 3);

    // Keyword Boost (more relevant keywords = higher score)
    const keywordScore = matchedKeywords.length * 50;

    // Recency Factor (inverse decay)
    const hoursOld = (Date.now() - (t.created_at_ms || Date.now())) / (1000 * 60 * 60);
    const recencyFactor = 1 + (1 / (Math.max(0.1, hoursOld) + 1)) * 2; // e.g. 0h old -> ~3x boost, 24h old -> ~1.04x

    return (engagement + keywordScore) * recencyFactor;
};

// --- Main ---

try {
    if (!fs.existsSync(inputPath)) {
        console.error(`Input file not found: ${inputPath}`);
        process.exit(1);
    }

    const tweets = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
    console.log(`[Clusters] Loaded ${tweets.length} tweets.`);

    // 1. Pre-process
    const processed = tweets.map(t => {
        const tokens = normalizeText(t.text);
        const keywords = extractKeywords(tokens);
        const category = determineCategory(keywords);
        const score = calculateScore(t, keywords);

        return {
            ...t,
            _tokens: tokens,
            _keywords: keywords,
            _category: category,
            _score: score
        };
    });

    // 2. Sort by score
    processed.sort((a, b) => b._score - a._score);

    // 3. Cluster
    const clusters = [];

    processed.forEach(t => {
        let bestCluster = null;
        let bestOverlap = 0;

        // Try to find a matching cluster
        for (const c of clusters) {
            // Must match category
            if (c.category !== t._category) continue;

            // Calculate overlap
            const overlap = c.keywords.filter(k => t._keywords.includes(k)).length;

            // Heuristic: If significant overlap found
            if (overlap > bestOverlap) {
                bestOverlap = overlap;
                bestCluster = c;
            }
        }

        // Thresholds for joining a cluster:
        // - At least 1 specific keyword overlap
        // - OR cluster is very small (< 3) and same category (grouping loose items)
        const canJoin = (bestOverlap >= 1) || (bestCluster && bestCluster.tweets.length < 3);

        if (bestCluster && canJoin) {
            bestCluster.tweets.push(t);
            // Add new keywords to cluster set
            t._keywords.forEach(k => {
                if (!bestCluster.keywords.includes(k)) bestCluster.keywords.push(k);
            });
            bestCluster.score += t._score;
        } else {
            // Create new cluster
            clusters.push({
                id: `cluster_${clusters.length + 1}`,
                category: t._category,
                keywords: [...t._keywords],
                tweets: [t],
                score: t._score
            });
        }
    });

    // 4. Format Output
    const outputClusters = clusters.map(c => {
        // Sort tweets in cluster by score
        c.tweets.sort((a, b) => b._score - a._score);

        // Pick top keywords for the cluster label/reason
        // Frequency analysis within cluster
        const kCounts = {};
        c.tweets.forEach(t => {
            t._keywords.forEach(k => kCounts[k] = (kCounts[k] || 0) + 1);
        });
        const topKeywords = Object.entries(kCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(x => x[0]);

        // Construct Reason string
        const reason = `${c.category} cluster linked by [${topKeywords.join(", ")}]`;

        return {
            clusterId: c.id,
            category: c.category,
            topKeywords: topKeywords,
            tweetCount: c.tweets.length,
            clusterScore: c.score,
            reason: reason,
            sampleTweets: c.tweets.slice(0, 8).map(t => ({
                id: t.id,
                handle: t.handle,
                created_at_iso: t.created_at_iso,
                text: t.text,
                url: t.url,
                score: Math.round(t._score)
            }))
        };
    });

    // Sort clusters by total score
    outputClusters.sort((a, b) => b.clusterScore - a.clusterScore);

    // 5. Write Output
    fs.writeFileSync(outputPath, JSON.stringify(outputClusters, null, 2), "utf-8");

    // 6. Log Summary
    console.log(`[Clusters] Generated ${outputClusters.length} clusters.`);
    console.log(`Top 5 Clusters:`);
    outputClusters.slice(0, 5).forEach(c => {
        console.log(`- [${c.category}] (${c.tweetCount} tweets) Score: ${Math.round(c.clusterScore)}`);
        console.log(`  Keywords: ${c.topKeywords.join(", ")}`);
    });

    // Log global top keywords
    const globalKeywords = {};
    processed.forEach(t => t._keywords.forEach(k => globalKeywords[k] = (globalKeywords[k] || 0) + 1));
    const topGlobal = Object.entries(globalKeywords)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(x => `${x[0]}(${x[1]})`)
        .join(", ");

    console.log(`Top Keywords Overall: ${topGlobal}`);
    console.log(`Output saved to: ${outputPath}`);

} catch (e) {
    console.error(`Processing error: ${e.message}`, e);
    process.exit(1);
}
