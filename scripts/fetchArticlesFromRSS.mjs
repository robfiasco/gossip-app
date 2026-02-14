import fs from "fs";
import path from "path";
import Parser from "rss-parser";

const OUTPUT_PATH = path.join(process.cwd(), "data", "articles.json");
const HOURS_36 = 36 * 60 * 60 * 1000;

const FEEDS = [
  { name: "The Block", url: "https://www.theblock.co/rss.xml" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Decrypt", url: "https://decrypt.co/feed" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss" },
  { name: "Messari", url: "https://messari.io/rss" },
  { name: "Blockworks", url: "https://blockworks.co/feed" },
  { name: "Solana News", url: "https://solana.com/news/rss.xml" },
  { name: "Solana Blog", url: "https://solana.com/blog/rss.xml" },
];

const SOLANA_KEYWORDS = [
  "solana",
  "sol",
  "jupiter",
  "jito",
  "firedancer",
  "raydium",
  "orca",
  "kamino",
  "marinade",
  "drift",
  "tensor",
  "magic eden",
  "backpack",
  "seeker",
  "saga",
  "helius",
  "mango",
  "meteora",
  "marginfi",
  "pyth",
  "wormhole",
  "sanctum",
];

const STOPWORDS = new Set([
  "this","that","with","from","have","your","just","like","into","over","under","than",
  "then","them","they","their","there","about","after","before","could","would","should",
  "where","when","what","which","while","still","been","being","also","more","most",
  "some","such","very","much","many","here","only","make","made","does","did","doing",
  "will","cant","can't","dont","don't","https","http","www","com","rss","news"
]);

const parser = new Parser({
  timeout: 15000,
  headers: { "User-Agent": "validator-rss-ingest/1.0" },
});

const cleanText = (text) =>
  String(text || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const extractKeywords = (title, summary) => {
  const combined = `${title || ""} ${summary || ""}`.toLowerCase();
  const tokens = combined
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
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

const isSolanaRelevant = (title, summary, sourceName) => {
  const combined = `${title || ""} ${summary || ""}`.toLowerCase();
  if (sourceName.toLowerCase().includes("solana")) return true;
  return SOLANA_KEYWORDS.some((kw) => combined.includes(kw));
};

const parseDate = (item) => {
  const raw = item.isoDate || item.pubDate || item.published || item.updated;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
};

const canonicalizeUrl = (url) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.searchParams.forEach((_, key) => {
      if (key.toLowerCase().startsWith("utm_")) parsed.searchParams.delete(key);
      if (["ref", "source"].includes(key.toLowerCase())) parsed.searchParams.delete(key);
    });
    return parsed.toString();
  } catch {
    return url;
  }
};

const getDomain = (url) => {
  if (!url) return "unknown";
  try {
    return new URL(url).hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
};

const main = async () => {
  const now = Date.now();
  const items = [];
  const sourceCounts = new Map();

  for (const feed of FEEDS) {
    try {
      const res = await parser.parseURL(feed.url);
      const entries = res.items || [];
      for (const entry of entries) {
        const title = cleanText(entry.title);
        const summary = cleanText(entry.contentSnippet || entry.content || entry.summary || "");
        const publishedAt = parseDate(entry);
        const url = canonicalizeUrl(entry.link || entry.guid || "");
        if (!title || !url) continue;
        if (publishedAt && now - publishedAt.getTime() > HOURS_36) continue;
        if (!isSolanaRelevant(title, summary, feed.name)) continue;
        const article = {
          title,
          source: feed.name,
          url,
          published: publishedAt ? publishedAt.toISOString() : null,
          summary: summary ? summary.slice(0, 280) : "",
          keywords: extractKeywords(title, summary),
        };
        items.push(article);
        const domain = getDomain(url);
        sourceCounts.set(domain, (sourceCounts.get(domain) || 0) + 1);
      }
    } catch (err) {
      console.warn(`Feed failed: ${feed.name} (${feed.url})`);
    }
  }

  const deduped = [];
  const seenUrl = new Set();
  const seenTitle = new Set();
  for (const item of items) {
    const urlKey = item.url;
    const titleKey = item.title.toLowerCase();
    if (seenUrl.has(urlKey) || seenTitle.has(titleKey)) continue;
    seenUrl.add(urlKey);
    seenTitle.add(titleKey);
    deduped.push(item);
  }

  deduped.sort((a, b) => {
    const ta = a.published ? new Date(a.published).getTime() : 0;
    const tb = b.published ? new Date(b.published).getTime() : 0;
    return tb - ta;
  });

  const finalItems = deduped.slice(0, 25);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(finalItems, null, 2), "utf-8");

  console.log(`Saved ${finalItems.length} articles`);
  const breakdown = Array.from(sourceCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => `${domain}(${count})`);
  console.log("Sources breakdown:", breakdown.join(", "));
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
