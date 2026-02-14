import fs from "fs";
import path from "path";
import crypto from "crypto";

const cwd = process.cwd();
const inputPath = path.join(cwd, "data", "signals_raw.json");
const inputFallbackPath = path.join(cwd, "signals_raw.json");
const outputPath = path.join(cwd, "data", "signals_clean.json");

const HOT_HOURS = 48;
const WEEK_DAYS = 7;

const SOLANA_KEYWORDS = [
  "solana","sol","jupiter","jup","kamino","jito","drift","backpack","madlads",
  "seeker","opos","magicblock","raydium","orca","meteora","tensor","helius",
  "saga","phantom","pyth","marginfi","firedancer","openclaw","airdrop",
  "tokenomics","unlock","burn","tge","agents","hackathon"
];

const PRICE_KEYWORDS = [
  "liquidation","dump","crash","bounce","bottom","drawdown","selloff","rally",
  "breakdown","breakout","volatility","open interest","funding"
];

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

const normalizeText = (text) =>
  String(text || "")
    .replace(/\s+/g, " ")
    .replace(/Solana and \d+ others.*$/i, "")
    .trim()
    .toLowerCase();

const hashText = (text) =>
  crypto.createHash("sha1").update(text).digest("hex");

const toTimestampMs = (tweet) => {
  if (typeof tweet.timestampMs === "number") return tweet.timestampMs;
  if (typeof tweet.timestampMs === "string" && tweet.timestampMs.trim()) {
    const n = Number(tweet.timestampMs);
    if (!Number.isNaN(n)) return n;
  }
  if (tweet.timestamp) {
    const parsed = Date.parse(tweet.timestamp);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (tweet.createdAt) {
    const parsed = Date.parse(tweet.createdAt);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (tweet.created_at) {
    const parsed = Date.parse(tweet.created_at);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
};

const extractEntities = (text) => {
  const tickers = [];
  const handles = [];
  const urls = [];
  const words = String(text || "");
  const cashtags = words.match(/\$[A-Za-z0-9]{2,10}/g) || [];
  const atHandles = words.match(/@[A-Za-z0-9_]{2,30}/g) || [];
  const linkMatches = words.match(/https?:\/\/\S+/g) || [];

  for (const c of cashtags) tickers.push(c.toUpperCase());
  for (const h of atHandles) handles.push(h.toLowerCase());
  for (const u of linkMatches) urls.push(u);

  return { tickers, handles, urls };
};

const extractUrlCandidates = (tweet) => {
  const out = new Set();
  const add = (value) => {
    const str = String(value || "").trim();
    if (!str) return;
    if (!/^https?:\/\//i.test(str)) return;
    out.add(str);
  };

  const text = String(tweet.full_text || tweet.text || "");
  const textLinks = text.match(/https?:\/\/\S+/g) || [];
  textLinks.forEach(add);

  const directUrls = Array.isArray(tweet.urls) ? tweet.urls : [];
  for (const u of directUrls) {
    if (typeof u === "string") {
      add(u);
      continue;
    }
    add(u?.expanded_url || u?.expandedUrl || u?.url);
  }

  const media = Array.isArray(tweet.media) ? tweet.media : [];
  for (const m of media) {
    add(m?.url);
    add(m?.expanded_url);
  }

  const metaUrls = tweet?.metadata?.legacy?.entities?.urls;
  if (Array.isArray(metaUrls)) {
    for (const u of metaUrls) {
      add(u?.expanded_url || u?.expandedUrl || u?.url);
    }
  }

  add(tweet.url);
  add(tweet.permalink);

  return Array.from(out);
};

const scoreSolana = (text) => {
  const hay = text.toLowerCase();
  let score = 0;
  for (const kw of SOLANA_KEYWORDS) {
    if (hay.includes(kw)) score += 2;
  }
  for (const kw of PRICE_KEYWORDS) {
    if (hay.includes(kw)) score += 1;
  }
  if (/\bsol\b/.test(hay)) score += 2;
  if (/\bsolana\b/.test(hay)) score += 3;
  return score;
};

const main = () => {
  const raw = loadJson(inputPath) || loadJson(inputFallbackPath);
  if (!raw) {
    console.error(`Missing ${inputPath} and ${inputFallbackPath}`);
    process.exit(1);
  }

  const posts = extractPosts(raw);
  const now = Date.now();
  const seen = new Set();
  const cleaned = [];

  for (const post of posts) {
    const textRaw = String(post.text || "");
    const fallbackText = String(post.full_text || post.fullText || "");
    const mergedText = textRaw || fallbackText;
    const normalized = normalizeText(mergedText);
    if (!normalized) continue;

    const link = post.permalink || post.url || null;
    const key = link ? `link:${link}` : `hash:${hashText(`${post.handle || post.author || ""}:${normalized}`)}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const ts = toTimestampMs(post);
    const createdAtIso = ts ? new Date(ts).toISOString() : null;
    const entities = extractEntities(mergedText);
    const extractedUrls = extractUrlCandidates(post);
    for (const url of extractedUrls) {
      if (!entities.urls.includes(url)) {
        entities.urls.push(url);
      }
    }
    const solScore = scoreSolana(normalized);
    const recencyBoost = Math.max(0, (HOT_HOURS * 60 * 60 * 1000 - (now - ts)) / (HOT_HOURS * 60 * 60 * 1000));

    cleaned.push({
      id: post.id || post.permalink || hashText(`${post.handle || post.author || ""}:${normalized}`),
      createdAt: createdAtIso,
      created_at: post.created_at || post.createdAt || post.timestamp || null,
      created_at_ms: ts ?? null,
      created_at_iso: createdAtIso,
      handle: post.handle || post.screen_name || post.author || post.user || null,
      text: mergedText.trim(),
      link,
      entities,
      score: {
        solanaRelevance: solScore,
        recencyBoost: Number(recencyBoost.toFixed(3)),
      },
    });
  }

  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      window: { hotHours: HOT_HOURS, weekDays: WEEK_DAYS },
      counts: {
        in: posts.length,
        deduped: cleaned.length,
        out: cleaned.length,
      },
    },
    tweets: cleaned,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  const withTs = cleaned
    .map((tweet) => tweet.created_at_ms)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  const oldestIso = withTs.length ? new Date(withTs[0]).toISOString() : "n/a";
  const newestIso = withTs.length
    ? new Date(withTs[withTs.length - 1]).toISOString()
    : "n/a";
  const missingTs = cleaned.length - withTs.length;
  console.log(`Wrote ${outputPath}`);
  console.log(`Counts: in=${posts.length}, out=${cleaned.length}, deduped=${cleaned.length}`);
  console.log(`Timestamps: oldest=${oldestIso} newest=${newestIso} missing_created_at_ms=${missingTs}`);
};

main();
