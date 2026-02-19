import fs from "node:fs";
import path from "node:path";
import {
  hydrateMemory,
  createRunSet,
  canUseStory,
  buildMemoryEntry,
  writeMemory,
  extractEntities,
  createStoryFingerprint,
} from "./storyMemory.mjs";

const cwd = process.cwd();
const ARTICLES_PATH = path.join(cwd, "data", "articles.json");
const OUT_ROOT = path.join(cwd, "briefing.json");
const OUT_DATA = path.join(cwd, "data", "briefing.json");
const OUT_PUBLIC = path.join(cwd, "public", "briefing.json");
const TOP_STORIES_PATH = path.join(cwd, "data", "top_stories.json");

const LOOKBACK_DAYS = 2;
const MAX_ITEMS = 3;
const MAX_PER_SOURCE = 1;

const SOLANA_IMPACT_TERMS = [
  "solana", "sol", "jupiter", "jup", "raydium", "orca", "meteora", "drift",
  "kamino", "marginfi", "jito", "pyth", "helius", "firedancer", "backpack",
  "tokenomics", "unlock", "airdrop", "listing", "payments", "stablecoin",
  "validator", "rpc", "exploit", "outage", "governance", "tvl", "dex", "perps",
];

const SOLANA_ANCHOR_TERMS = [
  "solana", "sol", "jupiter", "jup", "raydium", "orca", "meteora", "drift",
  "kamino", "marginfi", "jito", "pyth", "helius", "firedancer", "backpack",
  "mad lads", "seeker", "saga", "phantom", "tensor", "pump.fun",
];

const REPUTABLE_SOURCES = new Set([
  "the block", "coindesk", "decrypt", "cointelegraph", "messari",
  "blockworks", "solana news", "cryptoslate", "amb crypto", "cryptopotato",
]);

const loadJson = (filePath, fallback) => {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
};

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\w\s.$-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const includesAny = (text, terms) => {
  const normalized = normalizeText(text);
  return terms.some((term) => {
    const t = normalizeText(term);
    if (!t) return false;
    if (t === "sol") return /\bsol\b/.test(normalized);
    if (t === "jup") return /\bjup\b/.test(normalized);
    if (t.includes(".") || t.includes("-")) return normalized.includes(t);
    return new RegExp(`\\b${escapeRegex(t)}\\b`).test(normalized);
  });
};

const classifyCategory = (article) => {
  const text = normalizeText(`${article.title || ""} ${article.summary || ""}`);
  if (/(exploit|hack|outage|incident|security)/.test(text)) return "RISK";
  if (/(validator|rpc|firedancer|infrastructure|latency|throughput)/.test(text)) return "INFRA";
  if (/(dex|perps|tvl|liquidity|yield|stablecoin|payments)/.test(text)) return "MARKET";
  if (/(launch|airdrop|unlock|tokenomics|listing|governance|vote)/.test(text)) return "ECOSYSTEM";
  return "APPS";
};

const whyCareLine = (article) => {
  const text = normalizeText(`${article.title || ""} ${article.summary || ""}`);
  const title = String(article.title || "");
  const source = String(article.source || "source");
  if (/(unlock|tokenomics|airdrop|listing)/.test(text)) {
    return "Token supply timing can move flows quickly, so this is a near-term positioning story.";
  }
  if (/(dex|perps|liquidity|tvl|yield)/.test(text)) {
    return "Liquidity is rotating here, and SOL beta usually follows when this trend sticks.";
  }
  if (/(validator|rpc|firedancer|infra|outage)/.test(text)) {
    return "Infra reliability can reset confidence fast, especially during volatile sessions.";
  }
  if (/(borrow|lending|staking|institutional|etf|payments|stablecoin|tokenization)/.test(text)) {
    return "This is flow-relevant: if adoption continues, it can change who is buying SOL and why.";
  }
  if (/(security|exploit|hack|breach|risk)/.test(text)) {
    return "Risk events change positioning quickly, so this is more about downside control than hype.";
  }
  const conciseTitle = title.length > 72 ? `${title.slice(0, 71).trimEnd()}…` : title;
  return `Worth a read from ${source}: it adds context around "${conciseTitle}" for the next few sessions.`;
};

const formatDate = (iso) => {
  const ts = Date.parse(String(iso || ""));
  if (Number.isNaN(ts)) return new Date().toISOString().slice(0, 10);
  return new Date(ts).toISOString().slice(0, 10);
};

const relevanceBoost = (article, topStories) => {
  const text = normalizeText(`${article.title || ""} ${article.summary || ""}`);
  let score = 0;

  if (/(ai|agent|gaming|game|product|launch|ship|payments|stablecoin|tokenization|perps|yield|liquidity)/.test(text)) {
    score += 2;
  }

  for (const story of topStories) {
    const urlMatch = article.url && story.url && String(article.url).toLowerCase() === String(story.url).toLowerCase();
    if (urlMatch) {
      score += 4;
      continue;
    }
    const storyTokens = normalizeText(story.title || "")
      .split(/\s+/)
      .filter((token) => token.length >= 5);
    const overlap = storyTokens.filter((token) => text.includes(token)).length;
    if (overlap >= 2) score += 2;
  }

  return score;
};

const recentCutoffMs = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

const main = () => {
  const rawArticles = loadJson(ARTICLES_PATH, { items: [] });
  const topStoriesRaw = loadJson(TOP_STORIES_PATH, []);
  const topStories = Array.isArray(topStoriesRaw?.items)
    ? topStoriesRaw.items
    : Array.isArray(topStoriesRaw)
      ? topStoriesRaw
      : [];
  const articles = Array.isArray(rawArticles?.items)
    ? rawArticles.items
    : Array.isArray(rawArticles)
      ? rawArticles
      : [];
  const memory = hydrateMemory();
  const runSet = createRunSet(memory);
  const newMemoryEntries = [];

  const scored = articles
    .map((article) => {
      const publishedAt = article.published || article.publishedAt || article.date || null;
      const ts = Date.parse(String(publishedAt || ""));
      if (Number.isNaN(ts) || ts < recentCutoffMs) return null;

      const source = String(article.source || "").trim();
      const title = String(article.title || "").trim();
      const summary = String(article.summary || "").trim();
      if (!title || !article.url) return null;
      if (/(price predictions?|daily recap|market wrap|top \d+|week ahead)/i.test(title)) return null;

      const gateImpact = includesAny(`${title} ${summary}`, SOLANA_IMPACT_TERMS);
      const titleAnchor = includesAny(title, SOLANA_ANCHOR_TERMS);
      const bodyAnchor = includesAny(summary, ["solana", "sol ", "jupiter", "kamino", "jito", "drift", "backpack"]);
      const gateAnchor = titleAnchor || bodyAnchor;
      if (!titleAnchor && /(bitcoin|btc|ethereum|eth|crypto enters|macro|federal reserve|fed)/i.test(title)) return null;
      const gateSource = REPUTABLE_SOURCES.has(source.toLowerCase());
      if (!(gateImpact && gateSource && gateAnchor)) return null;

      let score = 0;
      score += gateImpact ? 4 : 0;
      score += gateAnchor ? 4 : 0;
      score += gateSource ? 2 : 0;
      if (/(unlock|tokenomics|airdrop|listing|exploit|outage|payments|stablecoin|firedancer)/i.test(`${title} ${summary}`)) {
        score += 3;
      }
      score += relevanceBoost(article, topStories);
      score += Math.max(0, 2 - Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)));
      if (/(etf|institutional|borrow|staking|payments|tokenization|upgrade|partnership|governance|proposal)/i.test(`${title} ${summary}`)) {
        score += 2;
      }

      return {
        category: classifyCategory(article),
        title,
        source,
        date: formatDate(publishedAt),
        url: article.url,
        whyCare: whyCareLine(article),
        summary,
        ts,
        score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || b.ts - a.ts);

  const selected = [];
  const trySelect = (story, opts = {}) => {
    const {
      preferNewSource = false,
      maxPerSource = MAX_PER_SOURCE,
      ignoreMemory = false,
    } = opts;
    if (selected.length >= MAX_ITEMS) return false;
    const sourceKey = String(story.source || "").toLowerCase();
    const sourceCount = selected.filter((item) => String(item.source || "").toLowerCase() === sourceKey).length;
    if (sourceCount >= maxPerSource) return false;
    if (preferNewSource && sourceCount > 0) return false;
    const topicTags = extractEntities(`${story.title} ${story.summary}`);
    const verdict = ignoreMemory
      ? {
        allowed: true,
        fingerprint: createStoryFingerprint({
          url: story.url,
          title: story.title,
          source: story.source,
          entities: topicTags,
          dateBucket: story.date,
        }),
      }
      : canUseStory(
        { ...story, topicTags, sectionShown: "briefing" },
        memory,
        runSet,
      );
    if (!verdict.allowed) return false;
    selected.push(story);
    runSet.add(verdict.fingerprint);
    newMemoryEntries.push(buildMemoryEntry(
      { ...story, topicTags },
      verdict.fingerprint,
      "briefing",
    ));
    return true;
  };

  // Pass 1: enforce source diversity + memory.
  for (const story of scored) {
    if (selected.length >= MAX_ITEMS) break;
    trySelect(story, { preferNewSource: true, maxPerSource: 1 });
  }

  // Pass 2: allow same source once if needed, still memory-aware.
  if (selected.length < MAX_ITEMS) {
    for (const story of scored) {
      if (selected.length >= MAX_ITEMS) break;
      if (selected.some((item) => item.url === story.url)) continue;
      trySelect(story, { preferNewSource: false, maxPerSource: 2 });
    }
  }

  // Pass 3: avoid blank cards; allow reuse if memory is the only blocker.
  if (selected.length < MAX_ITEMS) {
    for (const story of scored) {
      if (selected.length >= MAX_ITEMS) break;
      if (selected.some((item) => item.url === story.url)) continue;
      trySelect(story, { preferNewSource: false, maxPerSource: 2, ignoreMemory: true });
    }
  }

  writeMemory(memory, newMemoryEntries);

  const payload = {
    date: new Date().toISOString().slice(0, 10),
    title: "TODAY'S SOLANA BRIEFING",
    subtitle: "Top links from trusted desks",
    items: selected.map((story) => ({
      type: story.category,
      title: story.title,
      category: story.category,
      source: story.source,
      date: story.date,
      url: story.url,
      whyYouShouldCare: story.whyCare,
    })),
  };

  fs.mkdirSync(path.dirname(OUT_DATA), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_PUBLIC), { recursive: true });
  fs.writeFileSync(OUT_ROOT, JSON.stringify(payload, null, 2), "utf-8");
  fs.writeFileSync(OUT_DATA, JSON.stringify(payload, null, 2), "utf-8");
  fs.writeFileSync(OUT_PUBLIC, JSON.stringify(payload, null, 2), "utf-8");

  console.log(`Briefing stories selected: ${selected.length}`);
  selected.forEach((story, index) => {
    console.log(`[${index + 1}] ${story.source} | ${story.title}`);
  });
  if (selected.length < 2) {
    console.log("Briefing underfilled by design (quality gates + dedupe).");
  }
};

main();
