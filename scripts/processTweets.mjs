import fs from "fs";
import path from "path";

const INPUT_PATH = path.join(process.cwd(), "signals_raw.json");
const OUTPUT_PATH = path.join(process.cwd(), "data", "processed_tweets.json");

const STOPWORDS = new Set([
  "this","that","with","from","have","your","just","like","into","over","under","than",
  "then","them","they","their","there","about","after","before","could","would","should",
  "where","when","what","which","while","still","been","being","also","more","most",
  "some","such","very","much","many","here","only","make","made","does","did","doing",
  "will","cant","can't","dont","don't","https","http","www","com","twitter","x","tco"
]);

const HIGH_SIGNAL_KEYWORDS = [
  "launch","tokenomics","unlock","tge","airdrop","funding","partnership",
  "integration","release","mainnet","upgrade","validator","staking","restaking",
  "rpc","infra","latency","scaling","security","exploit","outage","yield","tvl",
  "stablecoin","payments","liquidity","airdrop","etf"
];

const NOISE_KEYWORDS = [
  "meme","memecoin","bonk","wif","dog","cat","lol","lmao","gm","gmgm","wen",
  "pump","moon","ape","degenerate","giveaway","airdropfarm","price prediction",
  "chart","ta","technical analysis"
];

const ENTITY_KEYWORDS = [
  "solana","sol","jupiter","jito","firedancer","raydium","orca","kamino","marinade",
  "drift","tensor","magic eden","backpack","seeker","saga","helius","meteora",
  "marginfi","pyth","wormhole","sanctum","phantom","mango"
];

const loadSignals = () => {
  if (!fs.existsSync(INPUT_PATH)) return [];
  const raw = JSON.parse(fs.readFileSync(INPUT_PATH, "utf-8"));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.posts)) return raw.posts;
  if (Array.isArray(raw?.tweets)) return raw.tweets;
  return [];
};

const normalizeHandle = (handle) =>
  String(handle || "").trim().replace(/^@/, "").toLowerCase();

const cleanText = (text) =>
  String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/#[^\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const extractKeywords = (text) => {
  const cleaned = String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const tokens = cleaned
    .split(" ")
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
  const unique = [];
  const seen = new Set();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
    if (unique.length >= 12) break;
  }
  return unique;
};

const isNoise = (text) => {
  const t = text.toLowerCase();
  return NOISE_KEYWORDS.some((kw) => t.includes(kw));
};

const isHighSignal = (text) => {
  const t = text.toLowerCase();
  return HIGH_SIGNAL_KEYWORDS.some((kw) => t.includes(kw)) ||
    ENTITY_KEYWORDS.some((kw) => t.includes(kw));
};

const pickUrl = (post) => {
  const urls = Array.isArray(post?.urls) ? post.urls : [];
  if (urls.length) return urls[0];
  return post?.permalink || post?.url || post?.firstExternalUrl || null;
};

const main = () => {
  const rawPosts = loadSignals();
  const processed = [];

  for (const post of rawPosts) {
    const text = cleanText(post?.text || "");
    if (!text) continue;
    if (isNoise(text)) continue;
    if (!isHighSignal(text)) continue;
    const keywords = extractKeywords(text);
    processed.push({
      handle: normalizeHandle(post?.handle || post?.author || post?.user),
      text,
      url: pickUrl(post),
      timestamp: post?.timestamp || post?.timestampMs || null,
      keywords,
    });
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(processed, null, 2), "utf-8");
  console.log("Processed X high-signal tweets");
  console.log(`Saved ${processed.length} items to ${OUTPUT_PATH}`);
};

main();
