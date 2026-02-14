import fs from "fs";
import path from "path";
import cheerio from "cheerio";

const sources = [
  { name: "SolanaFloor", url: "https://solanafloor.com/news" },
  { name: "The Block", url: "https://www.theblock.co/search?q=solana" },
  { name: "CoinDesk", url: "https://www.coindesk.com/tag/solana" },
  { name: "Decrypt", url: "https://decrypt.co/search?q=solana" },
];

const narrativeKeywords = {
  tokenomics: ["tokenomics", "unlock", "supply", "airdrop"],
  staking: ["staking", "yield", "lp", "restaking"],
  infra: ["infra", "rpc", "latency", "scaling", "performance"],
  trading: ["trading", "perps", "liquidity", "volume"],
  stablecoins: ["stablecoin", "payments", "usdc", "usdt"],
  memecoins: ["memecoin", "bonk", "wif", "meme"],
  "ai agents": ["ai agents", "agent", "autonomous"],
};

const extractLinks = (html) => {
  const $ = cheerio.load(html);
  const links = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (href && text) {
      links.push({ href, text });
    }
  });
  return links;
};

const resolveUrl = (base, href) => {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  if (href.startsWith("/")) return `${new URL(base).origin}${href}`;
  return null;
};

const matchNarrative = (links, keywords) => {
  for (const link of links) {
    const haystack = `${link.text} ${link.href}`.toLowerCase();
    if (keywords.some((kw) => haystack.includes(kw))) {
      return link;
    }
  }
  return null;
};

const main = async () => {
  const narrativesPath = path.join(process.cwd(), "narratives.json");
  let narratives = [];
  if (fs.existsSync(narrativesPath)) {
    const raw = fs.readFileSync(narrativesPath, "utf-8");
    narratives = JSON.parse(raw);
  }

  const results = [];

  for (const narrative of narratives) {
    const key = narrative.narrative;
    const keywords = narrativeKeywords[key] || [key];

    let found = null;
    for (const source of sources) {
      const res = await fetch(source.url);
      if (!res.ok) continue;
      const html = await res.text();
      const links = extractLinks(html);
      const match = matchNarrative(links, keywords);
      if (match) {
        found = {
          narrative: key,
          title: match.text,
          url: resolveUrl(source.url, match.href),
          source: source.name,
        };
        break;
      }
    }

    if (found) results.push(found);
  }

  console.log(JSON.stringify(results, null, 2));
};

main();
