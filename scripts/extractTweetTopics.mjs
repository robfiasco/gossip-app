import fs from "fs";
import path from "path";

const cwd = process.cwd();
const inputPath = path.join(cwd, "signals_raw.json");
const outputPath = path.join(cwd, "data", "tweet_clusters.json");
const narrativesPath = path.join(cwd, "data", "narratives.json");

const WINDOW_HOURS = 48;
const WINDOW_MS = WINDOW_HOURS * 60 * 60 * 1000;

const STOPWORDS = new Set([
  "the", "and", "of", "to", "in", "for", "on", "with", "at", "by", "from", "is", "are", "was", "were",
  "be", "been", "being", "it", "its", "as", "an", "a", "or", "that", "this", "these", "those", "than",
  "then", "so", "but", "if", "not", "no", "yes", "you", "your", "yours", "we", "our", "ours", "they",
  "their", "theirs", "i", "me", "my", "mine", "he", "him", "his", "she", "her", "hers", "them", "us",
  "about", "into", "over", "under", "after", "before", "during", "because", "via", "rt", "amp",
  "don", "just", "like", "will", "has", "can", "have", "all", "more", "one", "out", "now",
  "get", "up", "do", "what", "time", "people", "today", "new", "crypto", "blockchain", "market",
  "price", "coin", "token", "project", "ecosystem", "network", "chain", "web3", "defi"
]);

const SOLANA_KEYWORDS = new Set([
  "solana", "sol", "jupiter", "jup", "helius", "firedancer", "backpack", "phantom", "raydium", "orca",
  "meteora", "jito", "pyth", "tensor", "drift", "kamino", "marginfi", "openclaw", "mad", "lads",
  "bonk", "wif", "wen", "jto", "cloud", "mobile", "saga", "seeker", "rank", "leaderboard"
]);

const SOLANA_CASHTAGS = new Set([
  "$SOL", "$JUP", "$RAY", "$ORCA", "$DRIFT", "$KMNO", "$JTO", "$PYTH", "$TNSR", "$BONK", "$WIF",
  "$WEN", "$METEORA", "$MARGINFI", "$CLOUD", "$SEEKER", "$SAGA", "$OPENCLAW", "$BACKPACK",
]);

const HIGH_SIGNAL_PHRASES = [
  "jupiter perps", "liquid staking", "yield farming", "lp", "mev", "rwa", "depin",
  "token extension", "zk compression", "priority fee", "local fee", "airdrop", "unlock"
];

const KEY_CANONICAL = new Map([
  ["sol", "solana"],
  ["$SOL", "solana"],
  ["$JUP", "jup"],
]);

const TOPIC_PATTERNS = {
  ai: [/\bai\b/i, /\bagent(s)?\b/i, /\bopenclaw\b/i, /\bllm\b/i],
  gaming: [/\bgaming\b/i, /\bgame(s)?\b/i, /\bshooter\b/i, /\besport/i],
  newProducts: [
    /\blaunch(ed|ing)?\b/i,
    /\brelease(d)?\b/i,
    /\bannounce(d|ment)?\b/i,
    /\bintroduc(e|ed|ing)\b/i,
    /\bmainnet\b/i,
    /\bbeta\b/i,
    /\btokenomics\b/i,
    /\bairdrop\b/i,
    /\bunlock\b/i,
    /\bintegration\b/i,
  ],
};

const loadJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
};

const extractPosts = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.posts)) return data.posts;
  if (Array.isArray(data?.tweets)) return data.tweets;
  return [];
};

const toTimestampMs = (tweet) => {
  const privateTs = tweet?.metadata?.twe_private_fields?.created_at;
  if (typeof privateTs === "number" && Number.isFinite(privateTs)) return privateTs;
  if (typeof privateTs === "string" && privateTs.trim()) {
    const n = Number(privateTs);
    if (!Number.isNaN(n)) return n;
  }
  if (typeof tweet.timestampMs === "number") return tweet.timestampMs;
  if (typeof tweet.timestampMs === "string" && tweet.timestampMs.trim()) {
    const n = Number(tweet.timestampMs);
    if (!Number.isNaN(n)) return n;
  }
  if (tweet.timestamp) {
    const parsed = Date.parse(tweet.timestamp);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (tweet.created_at) {
    const raw = String(tweet.created_at).trim();
    const normalized = raw
      .replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/, "$1T$2")
      .replace(/\s+([+-]\d{2}:\d{2})$/, "$1");
    const parsed = Date.parse(normalized);
    if (!Number.isNaN(parsed)) return parsed;
    const parsedRaw = Date.parse(raw);
    if (!Number.isNaN(parsedRaw)) return parsedRaw;
  }
  return null;
};

const normalizeText = (text) => {
  return String(text || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\w\s$@]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
};

const tokenize = (text) => {
  return text
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .filter((t) => !STOPWORDS.has(t));
};

// --- Clustering Logic ---

const getTweetKeys = (text) => {
  const norm = normalizeText(text);
  const coins = (norm.match(/\$[a-z]{2,12}/g) || [])
    .map((c) => c.toUpperCase())
    .filter((c) => SOLANA_CASHTAGS.has(c));
  const handles = (norm.match(/@[a-z0-9_]{2,20}/g) || []).map(h => h.toLowerCase());

  const tokens = tokenize(norm);
  const keywords = tokens.filter(t => SOLANA_KEYWORDS.has(t));

  // Prioritize Entity > Keyword > Cashtag
  const keys = new Set([...keywords, ...coins].map((key) => KEY_CANONICAL.get(key) || key));
  if (TOPIC_PATTERNS.ai.some((rx) => rx.test(norm))) keys.add("ai");
  if (TOPIC_PATTERNS.gaming.some((rx) => rx.test(norm))) keys.add("gaming");
  if (TOPIC_PATTERNS.newProducts.some((rx) => rx.test(norm))) keys.add("new_product");
  if (keys.has("sol")) {
    keys.delete("sol");
    keys.add("solana");
  }
  return Array.from(keys);
};

const extractHandle = (tweet) =>
  (tweet.screen_name ||
    tweet.user?.screen_name ||
    tweet.user?.name ||
    tweet.handle ||
    "unknown");

const topicBoost = (text) => {
  const value = String(text || "");
  let boost = 0;
  if (TOPIC_PATTERNS.ai.some((rx) => rx.test(value))) boost += 2.5;
  if (TOPIC_PATTERNS.gaming.some((rx) => rx.test(value))) boost += 2;
  if (TOPIC_PATTERNS.newProducts.some((rx) => rx.test(value))) boost += 3;
  return boost;
};

const clusterTweets = (tweets) => {
  const clusters = new Map(); // Key -> { key, count, tweets[], summaryVector }

  for (const tweet of tweets) {
    const text = tweet.full_text || tweet.text || "";
    if (!text) continue;

    const keys = getTweetKeys(text);
    if (keys.length === 0) continue; // Skip noise

    // Simplistic: Assign to first major key found. 
    // Improvement: Could assign to all keys, then merge.
    // For now, let's pick the "Rarest" key or just the first Solana matches?
    // Let's iterate all keys and increment count.

    for (const key of keys) {
      if (!clusters.has(key)) {
        clusters.set(key, { key, count: 0, weightedScore: 0, tweets: [] });
      }
      const entry = clusters.get(key);
      const boost = topicBoost(text);
      entry.count++;
      entry.weightedScore += 1 + boost;
      // Keep only top 5 tweets per cluster to save space/time later
      if (entry.tweets.length < 10) {
        entry.tweets.push({
          id: tweet.id_str || tweet.id,
          text: text,
          handle: extractHandle(tweet),
          url: tweet.url || tweet.permalink
        });
      }
    }
  }

  // Convert map to array and sort by volume
  const all = Array.from(clusters.values()).sort((a, b) => {
    if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore;
    return b.count - a.count;
  });
  const strong = all.filter((c) => c.count >= 2);
  const sorted = (strong.length >= 5 ? strong : all).slice(0, 15); // keep recall if volume is thin

  return sorted;
};

const main = () => {
  console.log("Loading tweets...");
  const raw = loadJson(inputPath) || {};
  const posts = extractPosts(raw);
  const now = Date.now();
  const cutoff = now - WINDOW_MS;

  const windowed = posts.filter((tweet) => {
    if (tweet.timestampUnknown) return false;
    const ts = toTimestampMs(tweet);
    if (!ts) return false;
    return ts >= cutoff;
  });

  console.log(`Analyzing ${windowed.length} tweets from last ${WINDOW_HOURS}h...`);

  const topicSummary = {
    ai: windowed.filter((t) => TOPIC_PATTERNS.ai.some((rx) => rx.test(String(t.full_text || t.text || "")))).length,
    gaming: windowed.filter((t) => TOPIC_PATTERNS.gaming.some((rx) => rx.test(String(t.full_text || t.text || "")))).length,
    newProducts: windowed.filter((t) => TOPIC_PATTERNS.newProducts.some((rx) => rx.test(String(t.full_text || t.text || "")))).length,
  };

  const clusters = clusterTweets(windowed);

  // Generate a distinct list of "Narrative Keywords" from the top clusters
  const narrativeVector = clusters.map(c => c.key).slice(0, 10);

  // Filter clusters to keep only top 8 for story matching
  const topClusters = clusters.slice(0, 8);

  const output = {
    as_of_utc: new Date().toISOString(),
    clusters: topClusters
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");

  // Update narratives.json for consistency
  let narrativesData = loadJson(narrativesPath) || {};
  narrativesData.narrative_vector = narrativeVector;
  fs.writeFileSync(narrativesPath, JSON.stringify(narrativesData, null, 2), "utf-8");

  console.log(`Wrote ${topClusters.length} clusters to ${outputPath}`);
  console.log(`Top Narratives: ${narrativeVector.join(", ")}`);
  console.log(
    `Topic mentions (48h): AI=${topicSummary.ai}, Gaming=${topicSummary.gaming}, NewProducts=${topicSummary.newProducts}`,
  );
};

main();
