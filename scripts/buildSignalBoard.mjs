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
const BRIEFING_PATH = path.join(cwd, "data", "briefing.json");
const OUT_ROOT = path.join(cwd, "signal_board.json");
const OUT_DATA = path.join(cwd, "data", "signal_board.json");
const OUT_PUBLIC = path.join(cwd, "public", "signal_board.json");

const SOLANA_TERMS = [
  "solana", "sol", "jupiter", "jup", "raydium", "orca", "meteora", "drift",
  "kamino", "marginfi", "jito", "pyth", "helius", "firedancer", "backpack",
  "seeker", "saga", "pump.fun", "bonk", "wif", "tokenomics", "airdrop", "unlock",
];

const SOLANA_HARD_TERMS = [
  "solana", "jupiter", "raydium", "orca", "meteora", "drift", "kamino", "marginfi",
  "jito", "pyth", "helius", "firedancer", "backpack", "seeker", "saga", "pump.fun",
  "bonk", "wif", "mad lads",
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
  const hasHard = SOLANA_HARD_TERMS.some((term) => {
    const t = normalize(term);
    if (!t) return false;
    if (t === "sol") return /\bsol\b/.test(text);
    if (t === "jup") return /\bjup\b/.test(text);
    if (t.includes(".") || t.includes("-")) return text.includes(t);
    return new RegExp(`\\b${escapeRegex(t)}\\b`).test(text);
  });
  if (!hasHard) return false;
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

const teaserTitle = (value, max = 82) => {
  const t = compactTitle(value);
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
};

const cleanHeadline = (value, max = 78) =>
  teaserTitle(value, max)
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

const headlineForCopy = (value, max = 64) => {
  const text = cleanHeadline(value, 200).replace(/\s*[–-]\s*is this.*$/i, "").trim();
  if (text.length <= max) return text;
  const clipped = text.slice(0, max);
  const safe = clipped.includes(" ") ? clipped.slice(0, clipped.lastIndexOf(" ")) : clipped;
  return safe.replace(/[^\w)\]]+$/g, "").trim();
};

const formatPct = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
};

const formatB = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  return `${n.toFixed(0)}`;
};

const fearLabel = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "mixed sentiment";
  if (n <= 20) return "extreme fear";
  if (n <= 40) return "risk-off";
  if (n <= 60) return "neutral";
  if (n <= 80) return "risk-on";
  return "extreme greed";
};

const themeLabel = (key) => {
  switch (key) {
    case "ai agents":
      return "AI agents";
    case "new products":
      return "new product launches";
    case "tokenomics":
      return "tokenomics and unlocks";
    case "liquidity":
      return "DEX/perps liquidity";
    case "payments":
      return "payments and stablecoins";
    case "infrastructure":
      return "infrastructure and execution";
    default:
      return key;
  }
};

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
    showPastWeek: utcDay >= 1 && utcDay <= 3, // Mon-Wed only
    showNextWeek: utcDay === 0 || utcDay >= 4, // Thu-Sun
    generatedDate: now.toISOString().slice(0, 10),
  };
};

const priceInsight = (market, themes, weekArticles) => {
  const change24h = Number(market?.sol?.change_24h);
  const change7d = Number(market?.sol?.change_7d);
  const vol = formatB(market?.vol?.sol_24h_usd);
  const fg = Number(market?.fear_greed?.value);
  const sentiment = fearLabel(fg);
  const leadTheme = themes[0]?.name ? themeLabel(themes[0].name) : "ecosystem headlines";
  const leadArticle = weekArticles[0] ? cleanHeadline(weekArticles[0].title, 72) : null;

  if (!Number.isFinite(change24h) || !Number.isFinite(change7d)) {
    return "SOL data is incomplete right now, so the short-term trend is less reliable. Wait for clean price and volume confirmation before treating this as a directional move.";
  }

  const s24 = formatPct(change24h) || "0.0%";
  const s7 = formatPct(change7d) || "0.0%";
  const line1 = `SOL is ${s24} in the last 24h and ${s7} over the last 7 days, while sentiment is still ${sentiment}.`;
  const line2 = vol
    ? `24h volume is about $${vol}, which shows active trading. The key question is whether ecosystem flow remains strong.`
    : "Trading is active, but the direction depends on broader market macro conditions.";
  const line3 = leadArticle
    ? `Near-term direction depends on whether ${leadTheme} headlines turn into real usage (wallets, swaps, borrowing), led by ${headlineForCopy(leadArticle, 68)}.`
    : `Near-term direction depends on whether ${leadTheme} headlines turn into actual on-chain activity.`;
  return `${line1} ${line2} ${line3}`;
};

const buildPastWeek = (market, weekArticles) => {
  const top = weekArticles[0];
  const changePrevWeek = Number(market?.sol?.change_prev_week_utc);
  const change7d = Number(market?.sol?.change_7d);
  const describeMove = (n) => {
    if (!Number.isFinite(n)) return "SOL finished the week mixed";
    if (Math.abs(n) < 0.15) return "SOL finished the week roughly flat";
    return `SOL finished the week ${n >= 0 ? "up" : "down"} ${Math.abs(n).toFixed(1)}%`;
  };
  const changeText = Number.isFinite(changePrevWeek)
    ? describeMove(changePrevWeek)
    : describeMove(change7d);
  if (!top) return `${changeText}. No single Solana catalyst clearly controlled flows.`;
  return `${changeText}. The most discussed driver was ${headlineForCopy(top.title, 90)} (${top.source}), because it points to where new liquidity may concentrate.`;
};

const buildThisWeek = (themes, articles, briefingItems = []) => {
  const topThemes = themes.slice(0, 2).map((item) => themeLabel(item.name));
  const briefOne = articles[0]?.title
    ? cleanHeadline(articles[0].title, 90)
    : briefingItems[0]?.title
      ? cleanHeadline(briefingItems[0].title, 90)
      : null;
  const briefTwo = articles[1]?.title
    ? cleanHeadline(articles[1].title, 90)
    : briefingItems[1]?.title
      ? cleanHeadline(briefingItems[1].title, 90)
      : null;
  const lead = articles[0];
  const second = articles[1];
  if (!lead && !topThemes.length) {
    return "There are no hard Solana catalysts in this feed right now, so macro is still doing most of the work. Watch for one narrative to separate from noise through transaction and volume growth.";
  }
  const line1 = briefOne
    ? `The lead setup this week is ${headlineForCopy(briefOne, 88)}, with traders now reacting to specific Solana headlines.`
    : lead
      ? `${cleanHeadline(lead.title)} is the most active Solana development in the feed this week.`
      : `The loudest themes this week are ${topThemes.join(" and ")} across Solana channels.`;
  const line2 = briefTwo
    ? `Next up is ${headlineForCopy(briefTwo, 88)}. These stories only matter if they drive measurable usage, borrowing, and trading depth.`
    : second
      ? `${cleanHeadline(second.title)} is the second leg, and together they matter only if they bring users and liquidity instead of headline churn.`
      : `These narratives matter if they bring users and liquidity instead of headline churn.`;
  const line3 = topThemes.length
    ? `Watch wallet growth, swaps, and perps depth around ${topThemes[0]} first.`
    : `Watch wallet growth, swaps, and perps depth around the lead setup first.`;
  return `${line1} ${line2} ${line3}`;
};

const buildNextWeek = (themes, articles, briefingItems = []) => {
  const top = themes.slice(0, 3).map((item) => themeLabel(item.name));
  const briefThree = briefingItems[2]?.title ? teaserTitle(briefingItems[2].title, 80) : null;
  const upcoming = articles
    .map((item) => compactTitle(item.title))
    .filter((title) => /(claim|closes|ships|launch|vote|unlock|proposal|conference|event|deadline)/i.test(title))
    .slice(0, 2);
  if (upcoming.length >= 2) {
    return `${upcoming[0]} and ${upcoming[1]} are the clearest event-driven setups on deck. These matter because event timing can change short-term supply, participation, and liquidity conditions. Early confirmation should show up in volume concentration and token-specific flow before broad market moves.`;
  }
  if (briefThree) {
    return `Into next week, keep ${briefThree} on watch because it can pull incremental institutional and trading flow into the Solana complex. If that flow broadens beyond one headline, trend quality usually improves. If not, expect rotation and chop instead of continuation.`;
  }
  if (top.length >= 2) {
    return `${top[0]} and ${top[1]} remain the most likely drivers for next week if participation stays broad. The main thing to monitor is whether volume spreads beyond one pocket of the ecosystem. If that breadth fails to appear, momentum usually stalls quickly.`;
  }
  return "There are no obvious Solana-only event catalysts scheduled from this feed, so macro likely sets the pace. The practical watch is whether ecosystem tokens regain volume share versus majors. That shift is often the earliest sign of renewed risk appetite.";
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
  const briefing = loadJson(BRIEFING_PATH, { items: [] });
  const rawArticles = loadJson(ARTICLES_PATH, { items: [] });
  const articles = Array.isArray(rawArticles?.items)
    ? rawArticles.items
    : Array.isArray(rawArticles)
      ? rawArticles
      : [];
  const weekArticles = getRecentArticles(articles, 7);
  const briefingItems = Array.isArray(briefing?.items) ? briefing.items.slice(0, 3) : [];
  const themes = scoreThemes(weekArticles);
  const visibility = utcWeekVisibility();

  const payload = {
    date: visibility.generatedDate,
    generated_at_utc: new Date().toISOString(),
    showPastWeek: visibility.showPastWeek,
    showNextWeek: visibility.showNextWeek,
    priceUpdate: priceInsight(market, themes, weekArticles),
    pastWeek: visibility.showPastWeek ? buildPastWeek(market, weekArticles) : "",
    thisWeek: buildThisWeek(themes, weekArticles, briefingItems),
    nextWeek: visibility.showNextWeek ? buildNextWeek(themes, weekArticles, briefingItems) : "",
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
