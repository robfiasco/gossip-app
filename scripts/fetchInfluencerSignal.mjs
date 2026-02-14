import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import cheerio from "cheerio";

const OUTPUT_PATH = new URL("../public/influencer-signal.json", import.meta.url);

const HANDLES = [
  "FabianoSolana",
  "sol_nxxn",
  "jussy_world",
  "Heavymetalcook6",
  "mert",
  "Lightspeedpodhq",
  "weremeow",
];

const TOPICS = [
  "sol",
  "jup",
  "jupiter",
  "wif",
  "bonk",
  "jito",
  "tensor",
  "kamino",
  "meteora",
  "marginfi",
  "drift",
  "raydium",
  "orca",
  "sanctum",
  "pyth",
  "wormhole",
  "ai agents",
  "memecoins",
  "unlocks",
  "staking",
  "restaking",
  "validator",
  "etf",
  "stablecoin",
  "liquidity",
  "airdrops",
  "fees",
  "volume",
  "perps",
];

const cleanText = (text) =>
  (text ?? "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const fetchNitter = async (handle) => {
  const url = `https://nitter.net/${handle}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": "ValidatorBot/1.0 (+https://nitter.net) Node.js fetch",
    },
  });
  if (!res.ok) {
    throw new Error(`Nitter fetch failed for ${handle}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);
  const posts = [];
  $(".timeline-item").each((_, el) => {
    const content = $(el).find(".tweet-content").first().text();
    const text = cleanText(content);
    if (text) posts.push(text);
  });
  return posts.slice(0, 20);
};

const fetchJinaFallback = async (handle) => {
  const url = `https://r.jina.ai/https://twitter.com/${handle}`;
  const res = await fetch(url, {
    headers: {
      "user-agent": "ValidatorBot/1.0 (+https://twitter.com) Node.js fetch",
    },
  });
  if (!res.ok) return [];
  const text = await res.text();
  const lines = text.split("\n").map(cleanText).filter(Boolean);
  const posts = [];
  for (const line of lines) {
    if (line.length < 20) continue;
    if (line.startsWith("@")) continue;
    posts.push(line);
    if (posts.length >= 20) break;
  }
  return posts;
};

const buildTopicCounts = (posts) => {
  const counts = new Map();
  for (const post of posts) {
    const lowered = post.toLowerCase();
    for (const topic of TOPICS) {
      if (lowered.includes(topic)) {
        counts.set(topic, (counts.get(topic) ?? 0) + 1);
      }
    }
  }
  return Array.from(counts.entries())
    .map(([keyword, count]) => ({ keyword, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
};

const main = async () => {
  try {
    const posts = [];
    for (const handle of HANDLES) {
      let texts = [];
      try {
        texts = await fetchNitter(handle);
      } catch {
        texts = await fetchJinaFallback(handle);
      }
      texts.forEach((text) => posts.push({ handle, text }));
    }

    const topics = buildTopicCounts(posts.map((p) => p.text));
    const payload = {
      updatedAt: new Date().toISOString(),
      topics,
      posts,
    };

    await mkdir(dirname(OUTPUT_PATH.pathname), { recursive: true });
    await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`Saved influencer signal to ${OUTPUT_PATH.pathname}`);
  } catch (err) {
    console.error("Failed to fetch influencer signal:", err);
    process.exit(1);
  }
};

main();
