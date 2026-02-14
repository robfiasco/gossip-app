import fs from "node:fs";
import path from "node:path";
import {
  hydrateMemory,
  createRunSet,
  canUseStory,
  buildMemoryEntry,
  writeMemory,
} from "./storyMemory.mjs";

const cwd = process.cwd();
const MARKET_PATH = path.join(cwd, "data", "market_context.json");
const ARTICLES_PATH = path.join(cwd, "data", "articles.json");
const OUT_ROOT = path.join(cwd, "signal_board.json");
const OUT_DATA = path.join(cwd, "data", "signal_board.json");
const OUT_PUBLIC = path.join(cwd, "public", "signal_board.json");

const SOLANA_TERMS = [
  "solana", "sol", "jupiter", "jup", "raydium", "orca", "meteora", "drift",
  "kamino", "marginfi", "jito", "pyth", "helius", "firedancer", "backpack",
  "seeker", "saga", "pump.fun", "bonk", "wif", "perps", "dex", "staking",
  "yield", "tokenomics", "airdrop", "unlock", "stablecoin", "payments",
];

const THEME_RULES = [
  { key: "ai agents", test: /(ai|agent|agents|autonomous|openclaw)/i },
  { key: "gaming", test: /(gaming|game|onchain game|esports)/i },
  { key: "yield", test: /(yield|apy|staking|lst|restaking|carry)/i },
  { key: "new products", test: /(launch|released|announced|new app|new wallet|new protocol|seeker)/i },
  { key: "tokenomics", test: /(tokenomics|unlock|airdrop|supply|vesting|burn)/i },
  { key: "liquidity", test: /(dex|perps|volume|liquidity|tvl|flows|open interest)/i },
  { key: "infrastructure", test: /(rpc|firedancer|validator|latency|throughput|infra)/i },
  { key: "payments", test: /(payments|stablecoin|rwa|tokenized|settlement)/i },
];

const loadJson = (filePath, fallback) => {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
};

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\w\s.$-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const isSolanaArticle = (article) => {
  const text = normalize(`${article?.title || ""} ${article?.summary || ""} ${article?.url || ""}`);
  return SOLANA_TERMS.some((term) => {
    const t = normalize(term);
    if (!t) return false;
    if (t === "sol") return /\bsol\b/.test(text);
    if (t === "jup") return /\bjup\b/.test(text);
    if (t.includes(".") || t.includes("-")) return text.includes(t);
    return new RegExp(`\\b${escapeRegex(t)}\\b`).test(text);
  });
};

const getRecentArticles = (articles, days) => {
  const now = Date.now();
  const cutoff = now - days * 24 * 60 * 60 * 1000;
  return (Array.isArray(articles) ? articles : [])
    .map((item) => {
      const publishedAt = item?.published || item?.publishedAt || item?.date || null;
      const ts = Date.parse(String(publishedAt || ""));
      return { ...item, ts: Number.isFinite(ts) ? ts : 0, publishedAt };
    })
    .filter((item) => item.ts >= cutoff && isSolanaArticle(item))
    .sort((a, b) => b.ts - a.ts);
};

const compactTitle = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[:;].*$/, "")
    .trim();

const scoreThemes = (articles) => {
  const scores = new Map();
  for (const article of articles) {
    const weight = 1;
    const text = normalize(`${article?.title || ""} ${article?.summary || ""}`);
    for (const theme of THEME_RULES) {
      if (theme.test.test(text)) {
        scores.set(theme.key, (scores.get(theme.key) || 0) + weight);
      }
    }
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
};

const utcWeekVisibility = () => {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=Sun,1=Mon...6=Sat
  return {
    showPastWeek: utcDay >= 1 && utcDay <= 3, // hide Thu-Sun
    generatedDate: now.toISOString().slice(0, 10),
  };
};

const priceInsight = (market) => {
  const change24h = Number(market?.sol?.change_24h);
  const change7d = Number(market?.sol?.change_7d);
  if (!Number.isFinite(change24h) || !Number.isFinite(change7d)) {
    return "Price check: live feed is mixed. Treat momentum as unconfirmed until 24h and 7d align.";
  }

  const side24h = change24h >= 0 ? "up" : "down";
  const side7d = change7d >= 0 ? "up" : "down";
  const abs24 = Math.abs(change24h).toFixed(1);
  const abs7 = Math.abs(change7d).toFixed(1);

  if (change24h > 2 && change7d > 5) {
    return `Price check: SOL is up ${abs24}% in 24h and up ${abs7}% on 7d. That is trend continuation, not just a dead-cat bounce.`;
  }
  if (change24h < -2 && change7d < -5) {
    return `Price check: SOL is down ${abs24}% in 24h and down ${abs7}% on 7d. Risk stays skewed to defensive positioning until buyers reclaim momentum.`;
  }
  return `Price check: SOL is ${side24h} ${abs24}% in 24h and ${side7d} ${abs7}% on 7d. Tape is still two-way, so execution quality matters more than conviction calls.`;
};

const buildPastWeek = (market, weekArticles) => {
  const top = weekArticles[0];
  const change7d = Number(market?.sol?.change_7d);
  const changeText = Number.isFinite(change7d)
    ? `SOL closed ${change7d >= 0 ? "up" : "down"} ${Math.abs(change7d).toFixed(1)}% on 7d`
    : "SOL closed the week in mixed tape";
  if (!top) return `${changeText}, with no single catalyst clearly owning flows.`;
  return `${changeText}; the most discussed structural driver was ${compactTitle(top.title)} (${top.source}).`;
};

const buildThisWeek = (themes, articles) => {
  const topThemes = themes.slice(0, 2).map((item) => item.name);
  const lead = articles[0];
  if (!lead && !topThemes.length) {
    return "This week: watch for fresh catalysts that can convert from headlines into real spot and perps flow.";
  }
  if (topThemes.length >= 2) {
    return `This week: focus is shifting toward ${topThemes[0]} and ${topThemes[1]}. If those narratives keep getting real volume follow-through, SOL can hold higher.`;  
  }
  if (lead) {
    return `This week: ${compactTitle(lead.title)} is the lead setup. Watch whether mentions turn into execution flow across majors, not just headline spikes.`;
  }
  return `This week: ${topThemes[0]} is the main setup. Watch if it stays narrative-only or pulls real liquidity.`;
};

const buildNextWeek = (themes, articles) => {
  const top = themes.slice(0, 3).map((item) => item.name);
  const lead = articles[1] || articles[0];
  if (top.length >= 2) {
    return `Next week: watch whether ${top[0]} and ${top[1]} stay bid after the first reaction. If participation broadens, that usually feeds cleaner trend structure.`;
  }
  if (lead) {
    return `Next week: keep ${compactTitle(lead.title)} on radar. The key question is whether this evolves into sustained demand or fades after initial positioning.`;
  }
  return "Next week: watch for one narrative to separate from noise and attract consistent liquidity.";
};

const buildWhatsHot = (themes) => {
  const has = (name) => themes.find((item) => item.name === name);
  const ai = has("ai agents");
  const gaming = has("gaming");
  const yields = has("yield");
  const products = has("new products");
  const hot = [ai, gaming, yields, products].filter(Boolean).map((item) => item.name);
  if (hot.length) {
    return `What's hot: ${hot.join(", ")} are getting the highest share of Solana headlines right now.`;
  }
  const fallback = themes.slice(0, 2).map((item) => item.name);
  if (fallback.length) {
    return `What's hot: ${fallback.join(" and ")} are leading the current Solana conversation.`;
  }
  return "What's hot: no single narrative has clear dominance yet, so stay selective and event-driven.";
};

const buildReadMore = (articles, max = 3) => {
  const used = new Set();
  const links = [];
  for (const article of articles) {
    if (!article?.url || !article?.title) continue;
    const sourceKey = String(article.source || "").toLowerCase();
    if (used.has(sourceKey)) continue;
    used.add(sourceKey);
    links.push({
      title: compactTitle(article.title),
      source: article.source || "Source",
      url: article.url,
    });
    if (links.length >= max) break;
  }
  return links;
};

const main = () => {
  const market = loadJson(MARKET_PATH, {});
  const rawArticles = loadJson(ARTICLES_PATH, { items: [] });
  const articles = Array.isArray(rawArticles?.items)
    ? rawArticles.items
    : Array.isArray(rawArticles)
      ? rawArticles
      : [];
  const weekArticles = getRecentArticles(articles, 7);
  const themes = scoreThemes(weekArticles);
  const visibility = utcWeekVisibility();

  const payload = {
    date: visibility.generatedDate,
    generated_at_utc: new Date().toISOString(),
    showPastWeek: visibility.showPastWeek,
    priceUpdate: priceInsight(market),
    pastWeek: visibility.showPastWeek ? buildPastWeek(market, weekArticles) : "",
    thisWeek: buildThisWeek(themes, weekArticles),
    nextWeek: buildNextWeek(themes, weekArticles),
    whatsHot: buildWhatsHot(themes),
    readMore: buildReadMore(weekArticles, 3),
  };

  const memory = hydrateMemory();
  const runSet = createRunSet(memory);
  const summaryCandidate = {
    title: `Signal Board Summary ${payload.date}`,
    source: "signal-board",
    url: "",
    topicTags: ["signal-board", ...themes.slice(0, 3).map((item) => item.name)],
    dateBucket: payload.date,
  };
  const verdict = canUseStory(summaryCandidate, memory, runSet);
  if (verdict.allowed) {
    writeMemory(memory, [buildMemoryEntry(summaryCandidate, verdict.fingerprint, "signal")]);
  }

  fs.mkdirSync(path.dirname(OUT_DATA), { recursive: true });
  fs.mkdirSync(path.dirname(OUT_PUBLIC), { recursive: true });
  fs.writeFileSync(OUT_ROOT, JSON.stringify(payload, null, 2), "utf-8");
  fs.writeFileSync(OUT_DATA, JSON.stringify(payload, null, 2), "utf-8");
  fs.writeFileSync(OUT_PUBLIC, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`Signal board summary generated (rss+market only). Articles used: ${weekArticles.length}`);
};

main();
