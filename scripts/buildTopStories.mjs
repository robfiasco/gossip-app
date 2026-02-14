import fs from "fs";
import path from "path";
import {
  hydrateMemory,
  createRunSet,
  canUseStory,
  extractEntities,
} from "./storyMemory.mjs";

const cwd = process.cwd();
const ARTICLES_PATH = path.join(cwd, "data", "articles.json");
const CLUSTERS_PATH = path.join(cwd, "data", "tweet_clusters.json");
const SIGNALS_PATH = path.join(cwd, "signals_raw.json");
const OUTPUT_PATH = path.join(cwd, "data", "top_stories.json");

const HOURS_WINDOW = 72;
const MAX_STORIES = 5;

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from", "has", "have", "in",
  "into", "is", "it", "its", "of", "on", "or", "that", "the", "their", "this", "to", "was", "were", "will",
  "with", "you", "your", "about", "after", "all", "also", "any", "can", "could", "more", "new", "not", "our",
  "over", "than", "they", "them", "these", "those", "via", "what", "when", "where", "which", "while", "who",
  "why", "http", "https", "www", "com", "co", "io", "net", "org",
]);

const SOLANA_KEYWORDS = [
  "solana", "sol", "spl", "jupiter", "jup", "raydium", "orca", "meteora", "drift", "marginfi", "kamino",
  "tensor", "magic eden", "helius", "firedancer", "openclaw", "seeker", "saga", "pump.fun", "backpack",
  "mad lads", "jito", "pyth", "marinade", "solend", "phantom", "solflare", "validator", "staking", "airdrop",
  "tokenomics", "unlock", "burn", "governance", "proposal", "vote", "tvl", "dex", "perps", "liquidity",
  "stablecoin", "stablecoins",
];
const SOLANA_KEYWORDS_STRICT = SOLANA_KEYWORDS.filter((k) => k !== "sol");
const SOLANA_SIGNAL_TERMS = ["solana", "sol", ...SOLANA_KEYWORDS_STRICT];

const SOLANA_DOMAIN_ALLOWLIST = new Set([
  "solana.com",
  "jup.ag",
  "helius.dev",
  "birdeye.so",
  "backpack.exchange",
  "raydium.io",
  "orca.so",
  "drift.trade",
  "kamino.finance",
  "jito.network",
]);

const NEGATIVE_MACRO_TERMS = [
  "bitcoin",
  "btc",
  "ethereum",
  "eth",
  "federal reserve",
  "fed",
  "treasury",
  "nonfarm",
  "cpi",
  "macro",
];

const SOURCE_PRIORITY = {
  "the block": 4,
  coindesk: 4,
  decrypt: 3,
  messari: 3,
  blockworks: 3,
  "solana news": 5,
  "solana blog": 5,
  "solana foundation": 5,
  cryptoslate: 2,
  "amb crypto": 1,
};

const TOPIC_HINTS = {
  tokenomics: ["tokenomics", "unlock", "airdrop", "tge", "burn", "supply"],
  infra: ["validator", "rpc", "firedancer", "latency", "throughput", "infra"],
  defi: ["dex", "tvl", "perps", "liquidity", "yield", "stablecoin", "stablecoins"],
  market: ["etf", "regulation", "macro", "volatility", "risk", "flows"],
  consumer: ["wallet", "backpack", "phantom", "mobile", "seeker", "saga"],
};

const PREMIUM_NARRATIVE_BOOSTS = {
  new_product: {
    points: 12,
    terms: ["launch", "released", "release", "announced", "introducing", "tokenomics", "airdrop", "unlock", "tge", "mainnet", "beta", "event"],
  },
  ai: {
    points: 8,
    terms: ["ai", "agent", "agents", "openclaw", "inference", "llm"],
  },
  gaming: {
    points: 7,
    terms: ["gaming", "game", "shooter", "esports", "playtest"],
  },
};

const loadJson = (filePath, fallback = null) => {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
};

const canonicalizeUrl = (rawUrl) => {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "ref" || key === "source") {
        url.searchParams.delete(key);
      }
    }
    let out = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
    if (url.searchParams.toString()) out += `?${url.searchParams.toString()}`;
    return out.toLowerCase();
  } catch {
    return String(rawUrl).trim().toLowerCase().replace(/\/+$/, "");
  }
};

const safeHost = (rawUrl) => {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const normalizeText = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\w$./@\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const containsKeyword = (haystack, keyword) => {
  const text = normalizeText(haystack);
  const key = keyword.toLowerCase();
  if (!text || !key) return false;
  if (key === "sol") return /\bsol\b|\$sol\b/i.test(text);
  if (key === "jup") return /\bjup\b|\$jup\b/i.test(text);
  if (key.includes(".") || key.includes(" ")) return text.includes(key);
  return new RegExp(`\\b${escapeRegex(key)}\\b`, "i").test(text);
};

const tokenize = (text) =>
  normalizeText(text)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));

const extractTweetUrls = (tweet) => {
  const urls = new Set();
  if (typeof tweet.url === "string" && tweet.url) {
    urls.add(canonicalizeUrl(tweet.url));
  }
  const text = String(tweet.full_text || tweet.text || "");
  const matches = text.match(/https?:\/\/\S+/g) || [];
  for (const match of matches) urls.add(canonicalizeUrl(match));
  return [...urls].filter(Boolean);
};

const toPublishedIso = (article) =>
  article.publishedAt || article.published || article.date || null;

const toTimestamp = (iso) => {
  if (!iso) return 0;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? 0 : value;
};

const hasSolanaInTitle = (article) => {
  const title = article.title || "";
  return SOLANA_KEYWORDS.some((keyword) => containsKeyword(title, keyword));
};

const isSolanaRelevant = (article) => {
  const title = normalizeText(article.title || "");
  const summary = normalizeText(article.summary || article.excerpt || "");
  const url = normalizeText(article.url || "");
  const combined = `${title} ${summary} ${url}`;

  const hasKeyword = SOLANA_KEYWORDS_STRICT.some((keyword) => containsKeyword(combined, keyword));
  const hasTitleKeyword = SOLANA_KEYWORDS_STRICT.some((keyword) => containsKeyword(title, keyword));
  const explicitSolanaMention = /\bsolana\b/i.test(combined);
  const host = safeHost(article.url);
  const allowlistHost = [...SOLANA_DOMAIN_ALLOWLIST].some((domain) => host.includes(domain));
  const softSummaryHit =
    !hasTitleKeyword &&
    (summary.match(/\bsolana\b/g)?.length || 0) >= 1;

  const hasNegativeMacro =
    NEGATIVE_MACRO_TERMS.some((term) => title.includes(term) || summary.includes(term)) &&
    !hasKeyword &&
    !allowlistHost;

  if (hasNegativeMacro) return false;
  return hasTitleKeyword || allowlistHost || hasKeyword || explicitSolanaMention || softSummaryHit;
};

const solanaRelevanceScore = (article) => {
  const title = normalizeText(article.title || "");
  const summary = normalizeText(article.summary || article.excerpt || "");
  const host = safeHost(article.url);

  let score = 0;
  for (const keyword of SOLANA_KEYWORDS) {
    const key = keyword.toLowerCase();
    if (containsKeyword(title, key)) score += 5;
    if (containsKeyword(summary, key)) score += 3;
  }
  if ([...SOLANA_DOMAIN_ALLOWLIST].some((domain) => host.includes(domain))) score += 6;
  if (NEGATIVE_MACRO_TERMS.some((term) => title.includes(term)) && !title.includes("solana")) score -= 6;
  return score;
};

const countSolanaSignalHits = (text) =>
  SOLANA_SIGNAL_TERMS.reduce((count, term) => (containsKeyword(text, term) ? count + 1 : count), 0);

const topicBucket = (article) => {
  const text = normalizeText(`${article.title || ""} ${article.summary || ""}`);
  for (const [bucket, terms] of Object.entries(TOPIC_HINTS)) {
    if (terms.some((term) => text.includes(term))) return bucket;
  }
  return "general";
};

const dedupeTweets = (tweets) => {
  const seen = new Set();
  const out = [];
  for (const tweet of tweets) {
    const handle = String(tweet.screen_name || tweet.handle || tweet.username || "").toLowerCase();
    const text = normalizeText(tweet.full_text || tweet.text || "");
    if (!text) continue;
    const key = `${handle}|${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: String(tweet.id || ""),
      handle: handle ? `@${handle.replace(/^@/, "")}` : "@unknown",
      text,
      rawText: String(tweet.full_text || tweet.text || "").replace(/\s+/g, " ").trim(),
      createdAt: tweet.created_at || null,
      urls: extractTweetUrls(tweet),
    });
  }
  return out;
};

const getNarrativeKeywords = (clusters) => {
  if (!Array.isArray(clusters)) return [];
  const tokens = new Map();
  for (const cluster of clusters) {
    const key = normalizeText(cluster.key || "");
    if (key && key.length >= 3) tokens.set(key, (tokens.get(key) || 0) + Number(cluster.count || 1));
  }
  return [...tokens.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([term]) => term);
};

const buildStoryTerms = (article) => {
  const base = tokenize(`${article.title || ""} ${article.summary || ""}`);
  const set = new Set();
  for (const token of base) {
    if (!GENERIC_KEEP_OUT.has(token)) set.add(token);
  }
  for (const keyword of SOLANA_KEYWORDS) {
    if ((article.title || "").toLowerCase().includes(keyword.toLowerCase())) {
      set.add(keyword.toLowerCase());
    }
  }
  return [...set].slice(0, 8);
};

const GENERIC_KEEP_OUT = new Set([
  "today", "week", "crypto", "market", "update", "news", "report", "token", "tokens", "exchange",
]);

const buildEntityTerms = (article) => {
  const titleTokens = tokenize(article.title || "");
  const entities = [];
  for (const token of titleTokens) {
    if (GENERIC_KEEP_OUT.has(token)) continue;
    if (STOPWORDS.has(token)) continue;
    if (token.length < 4) continue;
    if (SOLANA_SIGNAL_TERMS.includes(token)) continue;
    entities.push(token);
    if (entities.length >= 6) break;
  }
  return entities;
};

const summarizeTweet = (text) => {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^breaking[:\s-]*/i, "")
    .trim();
  if (cleaned.length <= 120) return cleaned;
  return `${cleaned.slice(0, 117)}...`;
};

const scoreMentions = (article, tweets, narrativeSet) => {
  const canonicalUrl = canonicalizeUrl(article.url);
  const articleHost = safeHost(article.url);
  const articleTerms = buildStoryTerms(article);
  const entityTerms = buildEntityTerms(article);
  const articleTitleTokens = new Set(tokenize(article.title || "").slice(0, 8));

  const matched = [];
  let directUrlMatches = 0;
  let domainMatches = 0;
  let keywordMatches = 0;

  for (const tweet of tweets) {
    const tweetTokens = new Set(tokenize(tweet.text));
    const tweetUrls = tweet.urls || [];

    const direct = tweetUrls.some((url) => url === canonicalUrl);
    const domain = !direct && articleHost && tweetUrls.some((url) => safeHost(url) === articleHost);
    const overlapTerms = articleTerms.filter((term) => containsKeyword(tweet.text, term) || tweetTokens.has(term));
    const overlap = overlapTerms.length;
    const titleOverlap = [...articleTitleTokens].filter((token) => tweetTokens.has(token)).length;
    const signalOverlap = overlapTerms.filter(
      (term) => SOLANA_SIGNAL_TERMS.includes(term) || narrativeSet.has(term),
    ).length;
    const entityHit = entityTerms.some((term) => containsKeyword(tweet.text, term) || tweetTokens.has(term));
    const keyword =
      !direct &&
      !domain &&
      entityHit &&
      signalOverlap >= 1 &&
      ((overlap >= 2) || (titleOverlap >= 2));

    if (!direct && !domain && !keyword) continue;

    if (direct) directUrlMatches += 1;
    else if (domain) domainMatches += 1;
    else keywordMatches += 1;

    matched.push({
      handle: tweet.handle,
      summary: summarizeTweet(tweet.rawText),
      tweetUrl: tweetUrls.find((url) => safeHost(url).includes("x.com") || safeHost(url).includes("twitter.com")) || null,
      matchReason: direct ? "url_match" : domain ? "domain_match" : "keyword_match",
    });
  }

  const seenHandles = new Set();
  const who = [];
  for (const item of matched) {
    const key = item.handle.toLowerCase();
    if (seenHandles.has(key)) continue;
    seenHandles.add(key);
    who.push(item);
    if (who.length >= 3) break;
  }

  const mentionCount = seenHandles.size;
  const mentionScore = mentionCount * 8 + directUrlMatches * 6 + domainMatches * 3 + keywordMatches * 2;

  return {
    mentionCount,
    mentionScore,
    who,
    matchReason:
      directUrlMatches > 0 ? "url_match" : domainMatches > 0 ? "domain_match" : keywordMatches > 0 ? "keyword_match" : "none",
  };
};

const buildWhyItMatters = (article, mentions) => {
  if (mentions.mentionCount > 0) {
    return "Conversation overlap is live — this is actively shaping Solana positioning.";
  }
  const text = normalizeText(`${article.title || ""} ${article.summary || ""}`);
  if (text.includes("tokenomics") || text.includes("unlock") || text.includes("airdrop")) {
    return "Token supply mechanics can move short-term flows fast.";
  }
  if (text.includes("validator") || text.includes("staking") || text.includes("firedancer")) {
    return "Infrastructure changes here can reset risk and throughput expectations.";
  }
  if (text.includes("dex") || text.includes("perps") || text.includes("tvl")) {
    return "Flow and volume shifts here usually show up first in Solana risk appetite.";
  }
  return "Keep this on radar — it can shift near-term SOL narrative and positioning.";
};

const scorePremiumNarratives = (article, narrativeSet) => {
  const text = normalizeText(`${article.title || ""} ${article.summary || ""}`);
  let score = 0;
  const matchedNarratives = [];

  for (const [narrative, cfg] of Object.entries(PREMIUM_NARRATIVE_BOOSTS)) {
    if (!narrativeSet.has(narrative)) continue;
    if (cfg.terms.some((term) => containsKeyword(text, term))) {
      score += cfg.points;
      matchedNarratives.push(narrative);
    }
  }

  return { score, matchedNarratives };
};

const selectTopStories = (scoredStories) => {
  const preferred = scoredStories.filter((story) => story.xMentions > 0);
  const pool = preferred.length >= 3 ? preferred : scoredStories;
  const selected = [];
  const bucketCounts = new Map();

  for (const story of pool) {
    if (selected.length >= MAX_STORIES) break;
    const bucket = story.topicBucket || "general";
    const count = bucketCounts.get(bucket) || 0;
    if (count >= 2 && scoredStories.length - selected.length > 2) continue;
    selected.push(story);
    bucketCounts.set(bucket, count + 1);
  }

  if (selected.length < MAX_STORIES) {
    for (const story of pool) {
      if (selected.length >= MAX_STORIES) break;
      if (selected.some((s) => s.url === story.url)) continue;
      selected.push(story);
    }
  }
  return selected.slice(0, MAX_STORIES);
};

const main = () => {
  const rawArticles = loadJson(ARTICLES_PATH, { items: [] });
  const articles = Array.isArray(rawArticles) ? rawArticles : Array.isArray(rawArticles?.items) ? rawArticles.items : [];
  const clustersRaw = loadJson(CLUSTERS_PATH, { clusters: [] });
  const clusters = Array.isArray(clustersRaw?.clusters) ? clustersRaw.clusters : [];
  const rawSignals = loadJson(SIGNALS_PATH, []);
  const signalTweets = Array.isArray(rawSignals?.tweets) ? rawSignals.tweets : Array.isArray(rawSignals) ? rawSignals : [];
  const tweets = dedupeTweets(signalTweets);

  const now = Date.now();
  const recencyCutoff = now - HOURS_WINDOW * 60 * 60 * 1000;
  const recentArticles = articles.filter((article) => {
    const ts = toTimestamp(toPublishedIso(article));
    return ts > 0 && ts >= recencyCutoff;
  });

  const totalCandidates = recentArticles.length;
  const solanaCandidates = recentArticles
    .filter(isSolanaRelevant)
    .filter((article) => countSolanaSignalHits(`${article.title || ""} ${article.summary || article.excerpt || ""}`) > 0);

  const narrativeKeywords = getNarrativeKeywords(clusters);
  const narrativeSet = new Set(narrativeKeywords);
  const memoryState = hydrateMemory();
  const runSet = createRunSet(memoryState);
  const dedupedCandidates = [];

  for (const article of solanaCandidates) {
    const topicTags = extractEntities(`${article.title || ""} ${article.summary || article.excerpt || ""}`);
    const verdict = canUseStory(
      {
        title: article.title,
        url: article.url,
        source: article.source,
        summary: article.summary || article.excerpt || "",
        topicTags,
      },
      memoryState,
      runSet,
    );
    if (!verdict.allowed) continue;
    runSet.add(verdict.fingerprint);
    dedupedCandidates.push({ article, fingerprint: verdict.fingerprint });
  }

  const scored = dedupedCandidates
    .map(({ article, fingerprint }) => {
      const mentions = scoreMentions(article, tweets, narrativeSet);
      const relevanceScore = solanaRelevanceScore(article);
      const recencyScore = Math.max(
        0,
        10 - Math.floor((now - toTimestamp(toPublishedIso(article))) / (12 * 60 * 60 * 1000)),
      );
      const sourceScore = SOURCE_PRIORITY[String(article.source || "").toLowerCase()] || 0;
      const topic = topicBucket(article);

      const narrativeMatches = narrativeKeywords.filter((term) =>
        normalizeText(`${article.title || ""} ${article.summary || ""}`).includes(term),
      );
      const narrativeScore = Math.min(10, narrativeMatches.length * 2);
      const premiumNarrative = scorePremiumNarratives(article, narrativeSet);

      const titleLower = normalizeText(article.title || "");
      const genericMacroPenalty =
        !SOLANA_KEYWORDS_STRICT.some((k) => containsKeyword(titleLower, k)) &&
        /(bitcoin|btc|ethereum|eth|binance|xrp|doge|cardano)/i.test(titleLower)
          ? 10
          : 0;
      const finalScore =
        relevanceScore +
        mentions.mentionScore +
        recencyScore +
        sourceScore +
        narrativeScore +
        premiumNarrative.score -
        genericMacroPenalty;

      return {
        id: article.id || canonicalizeUrl(article.url),
        title: article.title,
        url: article.url,
        source: article.source,
        publishedAt: toPublishedIso(article),
        summary: article.summary || article.excerpt || "",
        tags: Array.isArray(article.keywords) ? article.keywords.slice(0, 3) : [],
        topicBucket: topic,
        whyItMatters: buildWhyItMatters(article, mentions),
        mentionCount: mentions.mentionCount,
        xMentions: mentions.mentionCount,
        who: mentions.who,
        xWho: mentions.who,
        mentionedBy: mentions.who.map((w) => ({ handle: w.handle, linkToTweet: w.tweetUrl })),
        matchReason: mentions.matchReason,
        narrativesMatched: narrativeMatches.slice(0, 4),
        premiumNarrativesMatched: premiumNarrative.matchedNarratives,
        scoreBreakdown: {
          relevanceScore,
          mentionScore: mentions.mentionScore,
          recencyScore,
          sourceScore,
          narrativeScore,
          premiumNarrativeScore: premiumNarrative.score,
        },
        dedupeFingerprint: fingerprint,
        score: finalScore,
      };
    })
    .sort((a, b) => b.score - a.score || toTimestamp(b.publishedAt) - toTimestamp(a.publishedAt));

  const selected = selectTopStories(scored);
  const output = {
    meta: {
      generatedAt: new Date().toISOString(),
      totalCandidates,
      solanaCandidates: solanaCandidates.length,
      selected: selected.length,
      tweetPool: tweets.length,
      narrativeKeywordsCount: narrativeKeywords.length,
    },
    items: selected,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");

  console.log(
    `Candidates: total=${totalCandidates}, solana_after_filter=${solanaCandidates.length}, after_memory_gate=${dedupedCandidates.length}`
  );
  console.log(`Narrative keywords total count: ${narrativeKeywords.length}`);
  console.log(`Top 20 narrative keywords: ${narrativeKeywords.slice(0, 20).join(", ") || "none"}`);
  if (selected.length === 0) {
    console.log("Selected stories: none");
  } else {
    selected.forEach((story, index) => {
      const reasons = [
        story.matchReason !== "none" ? `match=${story.matchReason}` : null,
        `mentions=${story.xMentions}`,
        `score=${Math.round(story.score)}`,
      ]
        .filter(Boolean)
        .join(", ");
      console.log(`[${index + 1}] ${story.source} | ${story.title} (${reasons})`);
    });
  }
  console.log(`Top stories saved: ${selected.length} -> ${OUTPUT_PATH}`);
};

main();
