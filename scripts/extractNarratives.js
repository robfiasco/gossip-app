import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "signals_raw_2026-02-09.json");

const buckets = [
  { key: "tokenomics", keywords: ["tokenomics", "unlock", "supply"] },
  { key: "staking", keywords: ["staking", "yield", "lp"] },
  { key: "infra", keywords: ["infra", "rpc", "latency", "scaling"] },
  { key: "trading", keywords: ["trading", "perps", "liquidity"] },
  { key: "stablecoins", keywords: ["stablecoin", "stablecoins", "payments"] },
  { key: "memecoins", keywords: ["memecoin", "memecoins", "bonk", "wif"] },
  { key: "ai agents", keywords: ["ai agents", "agents", "agent"] },
];

const cleanText = (text) =>
  (text ?? "")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase();

try {
  const raw = fs.readFileSync(filePath, "utf-8");
  const data = JSON.parse(raw);
  const posts = Array.isArray(data?.posts)
    ? data.posts
    : Array.isArray(data)
    ? data
    : [];

  const results = buckets.map((bucket) => {
    const matches = posts.filter((post) => {
      const text = cleanText(post.text);
      return bucket.keywords.some((kw) => text.includes(kw));
    });
    return {
      narrative: bucket.key,
      mentions: matches.length,
      examplePosts: matches.slice(0, 3).map((post) => post.text),
    };
  });

  const top = results
    .filter((r) => r.mentions > 0)
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 3);

  console.log(JSON.stringify(top, null, 2));
} catch (err) {
  console.error("ERROR:", err?.message || err);
  process.exit(1);
}
