import fs from "node:fs";
import path from "node:path";
import {
  hydrateMemory,
  createRunSet,
  canUseStory,
  buildMemoryEntry,
  writeMemory,
  extractEntities,
} from "./storyMemory.mjs";

const cwd = process.cwd();
const ARTICLES_PATH = path.join(cwd, "data", "articles.json");
const OUT_ROOT = path.join(cwd, "briefing.json");
const OUT_DATA = path.join(cwd, "data", "briefing.json");
const OUT_PUBLIC = path.join(cwd, "public", "briefing.json");

const LOOKBACK_DAYS = 7;
const MAX_ITEMS = 3;
const MAX_PER_SOURCE = 2;

const SOLANA_IMPACT_TERMS = [
  "solana", "sol", "jupiter", "jup", "raydium", "orca", "meteora", "drift",
  "kamino", "marginfi", "jito", "pyth", "helius", "firedancer", "backpack",
  "tokenomics", "unlock", "airdrop", "listing", "payments", "stablecoin",
  "validator", "rpc", "exploit", "outage", "governance", "tvl", "dex", "perps",
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
  if (/(unlock|tokenomics|airdrop|listing)/.test(text)) {
    return "Token supply timing can move flows fast, so this one matters for short-term risk.";
  }
  if (/(dex|perps|liquidity|tvl|yield)/.test(text)) {
    return "This affects where liquidity is concentrating, which usually shows up in SOL beta.";
  }
  if (/(validator|rpc|firedancer|infra|outage)/.test(text)) {
    return "Execution quality and infra stability can reset confidence quickly.";
  }
  return "This is a narrative input that can shift positioning over the next few sessions.";
};

const formatDate = (iso) => {
  const ts = Date.parse(String(iso || ""));
  if (Number.isNaN(ts)) return new Date().toISOString().slice(0, 10);
  return new Date(ts).toISOString().slice(0, 10);
};

const recentCutoffMs = Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

const main = () => {
  const rawArticles = loadJson(ARTICLES_PATH, { items: [] });
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

      const gateImpact = includesAny(`${title} ${summary}`, SOLANA_IMPACT_TERMS);
      const gateSource = REPUTABLE_SOURCES.has(source.toLowerCase());
      if (!(gateImpact && gateSource)) return null;

      let score = 0;
      score += gateImpact ? 4 : 0;
      score += gateSource ? 2 : 0;
      if (/(unlock|tokenomics|airdrop|listing|exploit|outage|payments|stablecoin|firedancer)/i.test(`${title} ${summary}`)) {
        score += 3;
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
  const trySelect = (story, preferNewSource) => {
    if (selected.length >= MAX_ITEMS) return false;
    const sourceKey = String(story.source || "").toLowerCase();
    const sourceCount = selected.filter((item) => String(item.source || "").toLowerCase() === sourceKey).length;
    if (sourceCount >= MAX_PER_SOURCE) return false;
    if (preferNewSource && sourceCount > 0) return false;
    const topicTags = extractEntities(`${story.title} ${story.summary}`);
    const verdict = canUseStory(
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

  // Pass 1: enforce source diversity.
  for (const story of scored) {
    if (selected.length >= MAX_ITEMS) break;
    trySelect(story, true);
  }
  // Pass 2: backfill from remaining scored stories if needed.
  if (selected.length < MAX_ITEMS) {
    for (const story of scored) {
      if (selected.length >= MAX_ITEMS) break;
      if (selected.some((item) => item.url === story.url)) continue;
      trySelect(story, false);
    }
  }

  writeMemory(memory, newMemoryEntries);

  const payload = {
    date: new Date().toISOString().slice(0, 10),
    title: "STORIES YOU MAY HAVE MISSED THIS WEEK",
    subtitle: "Curated from trusted RSS sources (Solana-focused)",
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
