import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import cheerio from "cheerio";
import { XMLParser } from "fast-xml-parser";

const SOURCE_URL = "https://solanafloor.com/news";
const SOLANA_RSS = "https://solana.com/rss";
const JITO_RSS = "https://www.jito.network/rss.xml";
const BLOCKWORKS_RSS = "https://blockworks.co/feed";
const THEBLOCK_RSS = "https://www.theblock.co/rss";
const COINDESK_RSS = "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml";
const MESSARI_RSS = "https://messari.io/rss";
const DEFILLAMA_RSS = "https://defillama.com/blog/rss.xml";
const OUTPUT_PATH = new URL("../public/daily-stories.json", import.meta.url);
const INFLUENCER_PATH = new URL("../public/influencer-signal.json", import.meta.url);

const toAbsolute = (url) => {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return `https:${url}`;
  if (url.startsWith("/")) return `https://solanafloor.com${url}`;
  return url;
};

const cleanText = (text) => (text ?? "").replace(/\s+/g, " ").trim() || null;

const extractStories = (html) => {
  const $ = cheerio.load(html);
  const items = [];

  const cards = [
    ...$('[data-testid="news-card"]').toArray(),
    ...$(".news-card").toArray(),
    ...$("article").toArray(),
  ];

  for (const el of cards) {
    const card = $(el);
    const link = card.find("a[href]").first();
    const url = toAbsolute(link.attr("href"));
    const title =
      cleanText(link.find("h3, h2").first().text()) ??
      cleanText(card.find("h3, h2").first().text());
    const category = cleanText(card.find("[class*='category']").first().text());
    const excerpt = cleanText(card.find("p").first().text());
    const author = cleanText(card.find("[class*='author']").first().text());
    const image =
      toAbsolute(card.find("img").first().attr("src")) ??
      toAbsolute(card.find("img").first().attr("data-src"));

    if (!title || !url) continue;

    items.push({
      title,
      url,
      source: "SolanaFloor",
      category,
      excerpt,
      author,
      image,
      publishedAt: null,
    });
  }

  const seenTitles = new Set();
  const seenUrls = new Set();
  const deduped = [];
  for (const item of items) {
    const titleKey = item.title.toLowerCase();
    const urlKey = item.url.toLowerCase();
    if (seenTitles.has(titleKey) || seenUrls.has(urlKey)) continue;
    seenTitles.add(titleKey);
    seenUrls.add(urlKey);
    deduped.push(item);
  }

  return deduped;
};

const parseRss = (xml, sourceName) => {
  const parser = new XMLParser({ ignoreAttributes: false });
  const json = parser.parse(xml);
  const items = json?.rss?.channel?.item ?? json?.feed?.entry ?? [];
  const normalized = Array.isArray(items) ? items : [items];
  return normalized.map((item) => {
    const title = cleanText(item.title?.["#text"] ?? item.title);
    const url =
      toAbsolute(item.link?.["@_href"] ?? item.link) ??
      toAbsolute(item.guid?.["#text"] ?? item.guid);
    const excerpt = cleanText(item.description ?? item.summary);
    const publishedAt =
      item.pubDate ?? item.published ?? item.updated ?? null;
    const image =
      toAbsolute(item["media:content"]?.["@_url"]) ??
      toAbsolute(item["media:thumbnail"]?.["@_url"]) ??
      toAbsolute(item.enclosure?.["@_url"]);
    const category =
      cleanText(item.category?.["#text"] ?? item.category) ??
      cleanText(item["dc:subject"]);
    return {
      title,
      url,
      source: sourceName,
      category,
      excerpt,
      author: cleanText(item.author?.name ?? item.author),
      image,
      publishedAt,
    };
  });
};

const fetchRssStories = async (url, sourceName) => {
  const res = await fetch(url, {
    headers: {
      "user-agent": "ValidatorBot/1.0 (+https://solanafloor.com/news) Node.js fetch",
    },
  });
  if (!res.ok) throw new Error(`RSS fetch failed for ${sourceName}`);
  const xml = await res.text();
  return parseRss(xml, sourceName);
};

const keywordWeights = [
  ["jupiter", 6],
  ["raydium", 5],
  ["drift", 5],
  ["jito", 5],
  ["firedancer", 5],
  ["seeker", 4],
  ["phantom", 4],
  ["pump.fun", 4],
  ["bonk", 3],
  ["wif", 3],
  ["sanctum", 3],
  ["kamino", 4],
  ["meteora", 4],
  ["marginfi", 4],
  ["tensor", 3],
  ["magic eden", 3],
  ["pyth", 3],
  ["wormhole", 3],
  ["solana", 3],
  ["sol", 2],
  ["staking", 3],
  ["validator", 3],
  ["restaking", 3],
  ["defi", 3],
  ["security", 3],
  ["outage", 2],
  ["upgrade", 2],
  ["mainnet", 2],
  ["market", 2],
  ["etf", 2],
];

const penalties = ["newsletter", "video", "podcast", "sponsored", "giveaway"];

const isRecent = (publishedAt, hours = 24) => {
  if (!publishedAt) return false;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return false;
  const diff = Date.now() - date.getTime();
  return diff <= hours * 60 * 60 * 1000;
};

const storyDateScore = (publishedAt) => {
  if (!publishedAt) return 0;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getTime();
};

const scoreStory = (story) => {
  const haystack = `${story.title} ${story.category ?? ""} ${story.excerpt ?? ""}`.toLowerCase();
  let score = 0;
  for (const [key, weight] of keywordWeights) {
    if (haystack.includes(key)) score += weight;
  }
  if (story.category) {
    const cat = story.category.toLowerCase();
    if (["markets", "defi", "security", "solana"].some((k) => cat.includes(k))) score += 3;
  }
  for (const word of penalties) {
    if (haystack.includes(word)) score -= 3;
  }
  return score;
};

const tagMap = [
  ["defi", "DeFi"],
  ["staking", "Staking"],
  ["validator", "Validator"],
  ["restaking", "Restaking"],
  ["market", "Market Structure"],
  ["security", "Security"],
  ["airdrop", "Airdrop"],
  ["etf", "ETF"],
  ["jupiter", "Jupiter"],
  ["raydium", "Raydium"],
  ["drift", "Drift"],
  ["jito", "Jito"],
  ["firedancer", "Firedancer"],
  ["seeker", "Seeker"],
  ["phantom", "Phantom"],
  ["pump.fun", "Pump.fun"],
  ["bonk", "Memecoins"],
  ["wif", "Memecoins"],
];

const deriveTags = (story) => {
  const haystack = `${story.title} ${story.category ?? ""} ${story.excerpt ?? ""}`.toLowerCase();
  const tags = [];
  for (const [key, tag] of tagMap) {
    if (haystack.includes(key) && !tags.includes(tag)) tags.push(tag);
    if (tags.length >= 3) break;
  }
  return tags;
};

const buildWhyItMatters = (story) => {
  const title = story.title.toLowerCase();
  if (title.includes("staking") || title.includes("validator")) {
    return "Validator economics are changing—positioning around yields will matter this week.";
  }
  if (title.includes("jupiter") || title.includes("dex") || title.includes("defi")) {
    return "This is the kind of DeFi headline that shifts flow and sentiment quickly.";
  }
  if (title.includes("security") || title.includes("outage")) {
    return "Any security signal here can reset risk fast—worth tracking closely.";
  }
  if (title.includes("firedancer") || title.includes("upgrade")) {
    return "Infra changes like this can reprice reliability and throughput expectations.";
  }
  return "If you’re trading SOL this week, this is the headline that moves sentiment.";
};

const loadInfluencerSignal = async () => {
  try {
    const raw = await readFile(INFLUENCER_PATH, "utf-8");
    const json = JSON.parse(raw);
    const topics = Array.isArray(json.topics) ? json.topics : [];
    const posts = Array.isArray(json.posts) ? json.posts : [];
    return { topics, posts };
  } catch {
    return { topics: [], posts: [] };
  }
};

const buildInfluencerKeywords = (topics) =>
  topics
    .slice(0, 5)
    .map((t) => String(t.keyword ?? "").toLowerCase())
    .filter(Boolean);

const storyMatchesKeyword = (story, keyword) => {
  const haystack = `${story.title} ${story.category ?? ""} ${story.excerpt ?? ""}`.toLowerCase();
  return haystack.includes(keyword);
};

const attachInfluencerContext = (story, keywords, posts) => {
  for (const keyword of keywords) {
    if (!storyMatchesKeyword(story, keyword)) continue;
    const seenBy = posts
      .filter((p) => String(p.text ?? "").toLowerCase().includes(keyword))
      .map((p) => `@${p.handle}`)
      .filter(Boolean);
    const unique = Array.from(new Set(seenBy)).slice(0, 2);
    return { keyword, seenBy: unique };
  }
  return null;
};

const main = async () => {
  try {
    const res = await fetch(SOURCE_URL, {
      headers: {
        "user-agent":
          "ValidatorBot/1.0 (+https://solanafloor.com/news) Node.js fetch",
      },
    });
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    const solanaFloorStories = extractStories(html);
    const [
      solanaStories,
      jitoStories,
      blockworksStories,
      theBlockStories,
      coindeskStories,
      messariStories,
      llamaStories,
      influencerSignal,
    ] = await Promise.all([
      fetchRssStories(SOLANA_RSS, "Solana"),
      fetchRssStories(JITO_RSS, "Jito"),
      fetchRssStories(BLOCKWORKS_RSS, "Blockworks"),
      fetchRssStories(THEBLOCK_RSS, "The Block"),
      fetchRssStories(COINDESK_RSS, "CoinDesk"),
      fetchRssStories(MESSARI_RSS, "Messari"),
      fetchRssStories(DEFILLAMA_RSS, "DefiLlama"),
      loadInfluencerSignal(),
    ]);

    const allCandidates = [
      ...solanaFloorStories,
      ...solanaStories,
      ...jitoStories,
      ...blockworksStories,
      ...theBlockStories,
      ...coindeskStories,
      ...messariStories,
      ...llamaStories,
    ].filter((story) => story.title && story.url);

    const influencerKeywords = buildInfluencerKeywords(influencerSignal.topics);

    const scoredStories = allCandidates
      .filter((story) => {
        const title = story.title?.toLowerCase() ?? "";
        const excerpt = story.excerpt?.toLowerCase() ?? "";
        const combined = `${title} ${excerpt}`;
        const hasSolana =
          combined.includes("solana") ||
          /\bsol\b/.test(combined) ||
          solanaKeywords.some((word) => combined.includes(word));
        return hasSolana;
      })
      .map((story) => ({
        ...story,
        score:
          scoreStory(story) +
          influencerKeywords.reduce(
            (acc, keyword) => acc + (storyMatchesKeyword(story, keyword) ? 5 : 0),
            0
          ),
        tags: deriveTags(story),
        whyItMatters: buildWhyItMatters(story),
        summary: story.excerpt ?? null,
        matchedThemes: influencerKeywords.filter((keyword) =>
          storyMatchesKeyword(story, keyword)
        ),
      }))
      .sort((a, b) => {
        const dateA = storyDateScore(a.publishedAt);
        const dateB = storyDateScore(b.publishedAt);
        if (dateA !== dateB) return dateB - dateA;
        return b.score - a.score;
      });

    const matchesKeyword = (story) =>
      influencerKeywords.some((keyword) => storyMatchesKeyword(story, keyword));

    const prioritized = [];
    const used = new Set();
    const strongMatches = scoredStories.filter(
      (story) =>
        matchesKeyword(story) &&
        (isRecent(story.publishedAt, 24) || story.matchedThemes.length >= 2)
    );

    strongMatches.slice(0, 2).forEach((story) => {
      prioritized.push(story);
      used.add(story.url);
    });

    for (const story of scoredStories) {
      if (prioritized.length >= 3) break;
      if (used.has(story.url)) continue;
      if (!matchesKeyword(story)) continue;
      if (!isRecent(story.publishedAt, 24) && story.matchedThemes.length < 2) continue;
      prioritized.push(story);
      used.add(story.url);
    }

    const stories = prioritized.slice(0, 3).map((story, idx) => {
      const { score, ...rest } = story;
      return {
        rank: idx + 1,
        ...rest,
        influencerContext: attachInfluencerContext(
          story,
          influencerKeywords,
          influencerSignal.posts
        ),
        matched_theme: story.matchedThemes?.[0] ?? null,
      };
    });
    const payload = {
      generatedAt: new Date().toISOString(),
      source: SOURCE_URL,
      stories,
    };
    await mkdir(dirname(OUTPUT_PATH.pathname), { recursive: true });
    await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`Saved ${stories.length} stories to ${OUTPUT_PATH.pathname}`);
  } catch (err) {
    console.error("Failed to fetch daily stories:", err);
    process.exit(1);
  }
};

main();
