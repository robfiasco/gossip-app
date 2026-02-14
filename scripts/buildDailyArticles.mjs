import fs from "fs";
import path from "path";
import Parser from "rss-parser";

const parser = new Parser();
const cwd = process.cwd();
const outputPath = path.join(cwd, "data", "articles.json");
const logPath = path.join(cwd, "data", "articles_build.log");

const now = Date.now();
const maxAgeHours = 720;
const maxItems = 120;
const maxCandidates = 300;
const maxPerSource = 30;

const feeds = [
  { name: "The Block", url: "https://www.theblock.co/rss.xml", domain: "theblock.co" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", domain: "coindesk.com" },
  { name: "Decrypt", url: "https://decrypt.co/feed", domain: "decrypt.co" },
  { name: "Cointelegraph", url: "https://cointelegraph.com/rss", domain: "cointelegraph.com" },
  { name: "Messari", url: "https://messari.io/rss", domain: "messari.io" },
  { name: "Blockworks", url: "https://blockworks.co/feed", domain: "blockworks.co" },
  { name: "Solana News", url: "https://solana.com/news/rss.xml", domain: "solana.com" },
  { name: "CryptoSlate", url: "https://cryptoslate.com/feed/", domain: "cryptoslate.com" },
  { name: "AMB Crypto", url: "https://ambcrypto.com/feed/", domain: "ambcrypto.com" },
  { name: "CryptoPotato", url: "https://cryptopotato.com/tag/solana/feed/", domain: "cryptopotato.com" },
];

const stripHtml = (input) =>
  String(input || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const canonicalizeUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl);
    const params = url.searchParams;
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "source"].forEach(
      (key) => params.delete(key)
    );
    url.search = params.toString() ? `?${params.toString()}` : "";
    url.hash = "";
    const normalized = url.toString().replace(/\/+$/, "");
    return normalized;
  } catch {
    return String(rawUrl || "").split("#")[0].replace(/\/+$/, "");
  }
};

const getDomain = (rawUrl) => {
  try {
    return new URL(rawUrl).hostname.replace("www.", "");
  } catch {
    return "unknown";
  }
};

const isRecent = (iso) => {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return false;
  return now - ts <= maxAgeHours * 60 * 60 * 1000;
};

const fetchFeed = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
};

const logLine = (line) => {
  fs.appendFileSync(logPath, `${line}\n`, "utf-8");
};

const SOLANA_TERMS = [
  "solana",
  "sol",
  "jupiter",
  "jup",
  "raydium",
  "orca",
  "meteora",
  "helius",
  "backpack",
  "mad lads",
  "firedancer",
  "seeker",
  "drift",
];

const scoreSourceBoost = (source) => {
  const src = String(source || "").toLowerCase();
  if (src.includes("the block")) return 1;
  if (src.includes("coindesk")) return 1;
  if (src.includes("decrypt")) return 1;
  if (src.includes("messari")) return 1;
  if (src.includes("blockworks")) return 1;
  if (src.includes("solana")) return 1;
  return 0;
};

const extractKeywords = (title, summary) => {
  const combined = `${title || ""} ${summary || ""}`.toLowerCase();
  const tokens = combined
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 4);
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

const scoreTitle = (title) => {
  const t = String(title || "").toLowerCase();
  let score = 0;
  if (t.includes("solana") || t.includes(" sol ")) score += 5;
  if (SOLANA_TERMS.some((term) => t.includes(term))) score += 4;
  return score;
};

const scoreBody = (summary) => {
  const s = String(summary || "").toLowerCase();
  return SOLANA_TERMS.some((term) => s.includes(term)) ? 2 : 0;
};

const isSolanaRelevant = (title, summary) => {
  const combined = `${title || ""} ${summary || ""}`.toLowerCase();
  return SOLANA_TERMS.some((kw) => combined.includes(kw));
};

const main = async () => {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(logPath, "", "utf-8");

  const items = [];
  const seen = new Set();
  const sourcesLog = [];
  const perSource = new Map();

  for (const feed of feeds) {
    let count = 0;
    try {
      const xml = await fetchFeed(feed.url);
      const data = await parser.parseString(xml);
      for (const entry of data.items || []) {
        if ((perSource.get(feed.name) || 0) >= maxPerSource) break;
        const rawUrl = entry.link || entry.guid || entry.id;
        if (!rawUrl) continue;
        const url = canonicalizeUrl(rawUrl);
        const title = String(entry.title || "").trim();
        if (title.length < 8) continue;
        const key = url || `${feed.name}:${title.toLowerCase()}`;
        if (seen.has(key)) continue;
        const publishedAt = entry.isoDate || entry.pubDate || entry.published || null;
        if (publishedAt && !isRecent(publishedAt)) continue;
        const summary = stripHtml(entry.contentSnippet || entry.content || entry.summary || "").slice(0, 300);
        const scoreT = scoreTitle(title);
        const scoreB = scoreBody(summary);
        const scoreS = scoreSourceBoost(feed.name);
        const keywords = extractKeywords(title, summary);
        items.push({
          source: feed.name,
          title,
          url,
          published: publishedAt ? new Date(publishedAt).toISOString() : null,
          summary,
          keywords,
          scoreTitle: scoreT,
          scoreBody: scoreB,
          scoreSource: scoreS,
          score: scoreT + scoreB + scoreS,
        });
        seen.add(key);
        count += 1;
        perSource.set(feed.name, (perSource.get(feed.name) || 0) + 1);
      }
      sourcesLog.push({ name: feed.name, count, ok: true });
      console.log(`Feed ok: ${feed.name} (${count})`);
    } catch (err) {
      sourcesLog.push({ name: feed.name, count, ok: false, error: err?.message || String(err) });
      logLine(`Failed ${feed.name}: ${err?.message || err}`);
      console.log(`Feed failed: ${feed.name} (${feed.url}) ${err?.message || err}`);
    }
  }

  const deduped = [];
  const seenKey = new Set();
  for (const item of items) {
    const key = item.url || `${item.source}:${item.title.toLowerCase()}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    deduped.push(item);
  }

  deduped.sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    const ta = a.published ? new Date(a.published).getTime() : 0;
    const tb = b.published ? new Date(b.published).getTime() : 0;
    return tb - ta;
  });

  const candidates = deduped.slice(0, maxCandidates);
  const finalItems = candidates.slice(0, maxItems);
  const output = {
    generatedAt: new Date().toISOString(),
    sources: sourcesLog.map((s) => {
      const feed = feeds.find((f) => f.name === s.name);
      return {
        name: s.name,
        url: feed?.url || "",
        domain: feed?.domain || "",
      };
    }),
    items: finalItems,
  };

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf-8");
  const candidatesPath = path.join(cwd, "data", "articles_candidates.json");
  fs.writeFileSync(candidatesPath, JSON.stringify(candidates, null, 2), "utf-8");

  const domainCounts = new Map();
  for (const item of finalItems) {
    const domain = getDomain(item.url);
    domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
  }
  const breakdown = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => `${domain}(${count})`)
    .join(", ");

  console.log(`Fetched ${items.length} items, deduped to ${deduped.length}`);
  console.log(`Saved ${finalItems.length} articles`);
  console.log(`Sources breakdown: ${breakdown}`);
};

main().catch((err) => {
  console.error("Build failed:", err?.message || err);
  process.exit(1);
});
