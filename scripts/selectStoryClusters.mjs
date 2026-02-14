import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { isStoryDuplicate } from "./storyMemory.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootDir = path.resolve(__dirname, "..");
const inputPath = path.join(rootDir, "data", "tweet_clusters.json");
const outputPath = path.join(rootDir, "data", "story_candidates.json");

// --- Configuration ---
const MAX_CANDIDATES = 3;
const MIN_TWEETS = 2;
const MIN_SCORE = 60; // lower floor to avoid starving premium stories
const SOLANA_ENTITIES = [
    "solana",
    "sol",
    "jupiter",
    "jup",
    "raydium",
    "orca",
    "meteora",
    "drift",
    "kamino",
    "marginfi",
    "jito",
    "pyth",
    "helius",
    "backpack",
    "mad lads",
    "seeker",
    "saga",
    "openclaw",
    "firedancer",
    "pump.fun",
    "bonk",
    "wif",
];

const STOPWORDS = new Set([
    "the", "and", "for", "with", "from", "that", "this", "into", "over", "under", "your",
    "just", "will", "have", "has", "are", "is", "was", "were", "new", "live", "next",
]);

// --- Helpers ---

const normalizeText = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, " ")
        .replace(/[^\w\s$@.-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const titleCase = (value) =>
    String(value || "")
        .toLowerCase()
        .replace(/\b\w/g, (m) => m.toUpperCase())
        .replace(/\bAi\b/g, "AI")
        .replace(/\bDefi\b/g, "DeFi")
        .replace(/\bRpc\b/g, "RPC")
        .replace(/\bTge\b/g, "TGE")
        .trim();

const narrativeFromSignals = (cluster) => {
    const samples = Array.isArray(cluster.sampleTweets) ? cluster.sampleTweets : [];
    const allText = normalizeText(
        `${cluster.category || ""} ${(cluster.topKeywords || []).join(" ")} ${samples.map((s) => s?.text || "").join(" ")}`
    );

    const has = (pattern) => pattern.test(allText);

    if (has(/\bpaypal\b/) && has(/\bsolana\b|\bsol\b/)) {
        return "PayPal integrates Solana as default network";
    }
    if (has(/\bbackpack\b/) && has(/\btokenomics\b|\bunlock\b|\bairdrop\b/)) {
        return "Backpack anti-dump tokenomics reset";
    }
    if (has(/\bagent\b|\bagents\b|\bai\b/) && has(/\bhackathon\b|\bplatforms\b|\bprize\b/)) {
        return "AI agent hackathon momentum builds";
    }
    if (has(/\bjupiter\b|\bjup\b/) && has(/\bvote\b|\bunlock\b|\bemissions\b|\bairdrop\b/)) {
        return "Jupiter vote reframes emissions and unlock risk";
    }
    if (has(/\bkamino\b|\banchorage\b/) && has(/\bcollateral\b|\bcustody\b|\blending\b/)) {
        return "Institutional collateral rails expand on Solana";
    }
    if (has(/\bfiredancer\b|\brpc\b|\bvalidator\b|\blatency\b/)) {
        return "Execution and infra quality move center stage";
    }
    if (has(/\bgaming\b|\bgame\b|\bonchain game\b/)) {
        return "Onchain gaming flow gains traction";
    }
    if (has(/\bagent\b|\bagents\b|\bai\b/)) {
        return "AI agents gain traction on Solana";
    }

    const tokens = allText
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
        .slice(0, 4)
        .map((w) => w.replace(/^@/, ""));
    const phrase = tokens.length ? tokens.join(" ") : String(cluster.category || "Solana narrative");
    return titleCase(`${phrase} narrative emerging`);
};

const generateTitleDraft = (cluster) => narrativeFromSignals(cluster);

const generateWhyNow = (cluster) => {
    const count = cluster.tweetCount;
    const cat = cluster.category;
    return `High engagement cluster in ${cat} with ${count} tweets in last 72h. Strong signal from multiple sources.`;
};

const hasSolanaEntity = (cluster) => {
    const keywords = Array.isArray(cluster.topKeywords) ? cluster.topKeywords : [];
    const sampleTweets = Array.isArray(cluster.sampleTweets) ? cluster.sampleTweets : [];
    const haystack = [
        cluster.category || "",
        ...keywords,
        ...sampleTweets.map((t) => t?.text || ""),
    ]
        .join(" ")
        .toLowerCase();
    return SOLANA_ENTITIES.some((kw) => haystack.includes(kw));
};

// --- Main ---

try {
    if (!fs.existsSync(inputPath)) {
        console.error(`Input file not found: ${inputPath}`);
        process.exit(1);
    }

    const clusters = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
    console.log(`[Selector] Loaded ${clusters.length} clusters.`);

    // 1. Filter & Dedupe
    const candidates = clusters.filter(c => {
        if (c.tweetCount < MIN_TWEETS) return false;
        if (c.clusterScore < MIN_SCORE) return false;
        if (!hasSolanaEntity(c)) return false;

        // Memory Check
        // Construct mock candidate for check
        const mockCandidate = {
            category: c.category,
            titleDraft: generateTitleDraft(c)
        };

        const duplicateCheck = isStoryDuplicate(mockCandidate);
        if (duplicateCheck.isDuplicate) {
            // console.log(`[Selector] Skipping duplicate: "${mockCandidate.titleDraft}" (${duplicateCheck.reason})`);
            return false;
        }

        return true;
    });

    console.log(`[Selector] ${candidates.length} valid candidates after filtering (min tweets=${MIN_TWEETS}, min score=${MIN_SCORE}, dedupe).`);

    // 2. Sort by Score (already sorted in input, but re-verify)
    candidates.sort((a, b) => b.clusterScore - a.clusterScore);

    // 3. Select Top N with category diversity
    const selected = [];
    const usedCategories = new Set();
    const usedNarratives = new Set();
    for (const candidate of candidates) {
        if (selected.length >= MAX_CANDIDATES) break;
        const categoryKey = String(candidate.category || "").toLowerCase();
        if (usedCategories.has(categoryKey)) continue;
        const narrativeKey = generateTitleDraft(candidate).toLowerCase();
        if (usedNarratives.has(narrativeKey)) continue;
        selected.push(candidate);
        usedCategories.add(categoryKey);
        usedNarratives.add(narrativeKey);
    }

    // Backfill if too few after diversity pass
    if (selected.length < MAX_CANDIDATES) {
        for (const candidate of candidates) {
            if (selected.length >= MAX_CANDIDATES) break;
            if (selected.includes(candidate)) continue;
            const narrativeKey = generateTitleDraft(candidate).toLowerCase();
            if (usedNarratives.has(narrativeKey)) continue;
            selected.push(candidate);
            usedNarratives.add(narrativeKey);
        }
    }

    // Last resort backfill from all clusters (still Solana entity required)
    if (selected.length < MAX_CANDIDATES) {
        const fallbackPool = clusters
            .filter((c) => c.tweetCount >= 1 && c.clusterScore >= 30 && hasSolanaEntity(c))
            .sort((a, b) => b.clusterScore - a.clusterScore);
        for (const candidate of fallbackPool) {
            if (selected.length >= MAX_CANDIDATES) break;
            if (selected.includes(candidate)) continue;
            const narrativeKey = generateTitleDraft(candidate).toLowerCase();
            if (usedNarratives.has(narrativeKey)) continue;
            selected.push(candidate);
            usedNarratives.add(narrativeKey);
        }
    }

    // 4. Transform to Story Candidate Format
    const output = selected.map((c, index) => {
        // Extract synthesis bullets from text of top tweets
        // Simple heuristic: take first 100 chars of top 3 tweets
        const thesisBullets = c.sampleTweets.slice(0, 4).map(t => {
            const clean = t.text.replace(/\n+/g, " ").trim();
            return clean.length > 120 ? clean.substring(0, 117) + "..." : clean;
        });

        // Supporting Tweets (limit 5)
        const supportingTweetRefs = c.sampleTweets.slice(0, 5).map(t => ({
            handle: t.handle,
            url: t.url,
            excerpt: t.text.substring(0, 50) + "..."
        }));

        // Calculate Confidence (0-100)
        // Normalize score against top score, but cap at 95
        const baseConfidence = Math.min(95, Math.floor(Math.log(c.clusterScore) * 12));

        return {
            storyId: `story_${Date.now()}_${index}`,
            category: c.category,
            titleDraft: generateTitleDraft(c),
            thesisBullets,
            supportingTweetRefs,
            tweetCount: c.tweetCount,
            clusterScore: c.clusterScore,
            confidence: baseConfidence,
            whyNow: generateWhyNow(c)
        };
    });

    // 5. Write Output
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");

    // 6. Log Summary
    console.log(`[Selector] Selected ${output.length} candidates.`);
    output.forEach(c => {
        console.log(`- [${c.category}] Score: ${c.confidence}% | "${c.titleDraft}"`);
    });
    console.log(`Output saved to: ${outputPath}`);

} catch (e) {
    console.error(`Processing error: ${e.message}`, e);
    process.exit(1);
}
