import fs from "fs";
import path from "path";
import crypto from "crypto";
import Parser from "rss-parser";

const parser = new Parser();
const outputPath = path.join(process.cwd(), "data", "articles.json");
const publicOutputPath = path.join(process.cwd(), "public", "data", "articles.json");
const now = Date.now();
const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

const feeds = [
  { name: "Backpack", url: "https://learn.backpack.exchange/blog/rss.xml" },
  { name: "Solana Blog", url: "https://solana.com/rss.xml" },
  { name: "Jupiter", url: "https://station.jup.ag/rss.xml" },
  { name: "Helius", url: "https://helius.dev/blog/rss.xml" },
  { name: "Jito", url: "https://www.jito.network/blog/rss.xml" },
  { name: "SolanaFloor", url: "https://solanafloor.com/rss" },
  { name: "The Block", url: "https://www.theblock.co/rss.xml" },
  { name: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml" },
  { name: "Decrypt", url: "https://decrypt.co/feed" },
  { name: "DefiLlama", url: "https://blog.defillama.com/rss/" },
];

const stripHtml = (input) =>
  String(input || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hashId = (url) =>
  crypto.createHash("sha1").update(url).digest("hex").slice(0, 12);

const isRecent = (date) => {
  if (!date) return false;
  const ts = new Date(date).getTime();
  if (Number.isNaN(ts)) return false;
  return now - ts <= sevenDaysMs;
};

const results = [];
const seen = new Set();
const counts = {};

for (const feed of feeds) {
  counts[feed.name] = 0;
  try {
    const data = await parser.parseURL(feed.url);
    for (const item of data.items || []) {
      const url = item.link || item.guid;
      if (!url || seen.has(url)) continue;
      const publishedAt = item.isoDate || item.pubDate || null;
      if (!isRecent(publishedAt)) continue;
      const summary = stripHtml(item.contentSnippet || item.content || item.summary || "");
      const entry = {
        id: hashId(url),
        source: feed.name,
        title: item.title || "Untitled",
        url,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
        summary: summary.slice(0, 240),
      };
      results.push(entry);
      seen.add(url);
      counts[feed.name] += 1;
    }
  } catch (err) {
    console.error(`Failed to fetch ${feed.name}:`, err?.message || err);
  }
}

results.sort((a, b) => {
  const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
  const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
  return tb - ta;
});

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf-8");
fs.mkdirSync(path.dirname(publicOutputPath), { recursive: true });
fs.writeFileSync(publicOutputPath, JSON.stringify(results, null, 2), "utf-8");
console.log(`Saved ${results.length} articles to ${outputPath}`);
console.log(`Saved ${results.length} articles to ${publicOutputPath}`);
Object.entries(counts).forEach(([name, count]) => {
  console.log(`${name}: ${count}`);
});
