import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import cheerio from "cheerio";

const INPUT_PATH = new URL("../public/influencer-signal.json", import.meta.url);
const OUTPUT_PATH = new URL("../public/signal-source.json", import.meta.url);

const MAX_RESULTS = 3;
const SEARCH_LIMIT = 5;

const ENTITY_KEYWORDS = [
  "backpack",
  "jupiter",
  "jito",
  "drift",
  "raydium",
  "orca",
  "meteora",
  "kamino",
  "marginfi",
  "tensor",
  "magic eden",
  "pyth",
  "wormhole",
  "sanctum",
  "phantom",
  "seeker",
  "solana",
  "sol",
];

const ACTION_KEYWORDS = [
  "launch",
  "tokenomics",
  "unlock",
  "integration",
  "release",
  "announced",
  "introducing",
  "governance",
];

const SOURCE_ALLOWLIST = [
  "solana.com",
  "blog.solana.com",
  "solanafloor.com",
  "jito.network",
  "jup.ag",
  "jupiter.ag",
  "messari.io",
  "blockworks.co",
  "theblock.co",
  "coindesk.com",
  "defillama.com",
  "medium.com",
  "github.com",
];

const cleanText = (text) =>
  (text ?? "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const extractUrls = (text) => {
  const matches = text.match(/https?:\/\/\S+/g);
  return matches ? matches.map((url) => url.replace(/[),.]+$/, "")) : [];
};

const extractEntities = (text) => {
  const lowered = text.toLowerCase();
  return ENTITY_KEYWORDS.filter((entity) => lowered.includes(entity));
};

const extractActionKeywords = (text) => {
  const lowered = text.toLowerCase();
  return ACTION_KEYWORDS.filter((kw) => lowered.includes(kw));
};

const domainFromUrl = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const isAllowedSource = (url) => {
  const domain = domainFromUrl(url);
  return SOURCE_ALLOWLIST.some((allowed) => domain.endsWith(allowed));
};

const fetchHtml = async (url) => {
  const res = await fetch(url, {
    headers: {
      "user-agent": "ValidatorBot/1.0 (+https://validator.local) Node.js fetch",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
};

const parsePublishedAt = ($) => {
  const meta =
    $("meta[property='article:published_time']").attr("content") ||
    $("meta[name='pubdate']").attr("content") ||
    $("time[datetime]").attr("datetime");
  return meta ?? null;
};

const parseTitle = ($) => {
  return (
    $("meta[property='og:title']").attr("content") ||
    $("title").first().text().trim()
  );
};

const textContainsAll = (text, entities, keywords) => {
  const lowered = text.toLowerCase();
  const entityMatch = entities.some((e) => lowered.includes(e));
  const keywordMatch = keywords.some((k) => lowered.includes(k));
  return entityMatch && keywordMatch;
};

const withinHours = (publishedAt, hours) => {
  if (!publishedAt) return false;
  const date = new Date(publishedAt);
  if (Number.isNaN(date.getTime())) return false;
  return Date.now() - date.getTime() <= hours * 60 * 60 * 1000;
};

const scoreMatch = (title, body, entities, keywords) => {
  let score = 0;
  const text = `${title} ${body}`.toLowerCase();
  entities.forEach((e) => {
    if (text.includes(e)) score += 2;
  });
  keywords.forEach((k) => {
    if (text.includes(k)) score += 2;
  });
  ACTION_KEYWORDS.forEach((k) => {
    if (text.includes(k)) score += 1;
  });
  return score;
};

const searchSources = async (query) => {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const links = [];
  $(".result__a").each((_, el) => {
    const href = $(el).attr("href");
    if (href && href.startsWith("http")) links.push(href);
  });
  return links.slice(0, SEARCH_LIMIT);
};

const validateSource = async (url, entities, keywords) => {
  if (!isAllowedSource(url)) return null;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const title = parseTitle($);
  const publishedAt = parsePublishedAt($);
  const bodyText = $("body").text();
  const valid =
    textContainsAll(title + " " + bodyText, entities, keywords) ||
    ACTION_KEYWORDS.some((k) => title.toLowerCase().includes(k));
  const recent = withinHours(publishedAt, 72);
  if (!valid && !recent) return null;
  return {
    title: title || url,
    url,
    source_domain: domainFromUrl(url),
    publishedAt,
    score: scoreMatch(title, bodyText, entities, keywords),
  };
};

const main = async () => {
  try {
    const raw = await readFile(INPUT_PATH, "utf-8");
    const json = JSON.parse(raw);
    const posts = Array.isArray(json.posts) ? json.posts : [];

    const candidates = [];

    for (const post of posts) {
      const text = cleanText(post.text ?? "");
      if (!text) continue;
      const entities = extractEntities(text);
      const keywords = extractActionKeywords(text);
      const urls = extractUrls(post.text ?? "");

      const postRecord = {
        text,
        entities,
        keywords,
        urls,
        author: `@${post.handle}`,
      };

      if (!entities.length && !keywords.length) continue;

      for (const url of urls) {
        if (!isAllowedSource(url)) continue;
        const match = await validateSource(url, entities, keywords);
        if (match) {
          candidates.push({
            ...match,
            matched_entities: entities,
            matched_keywords: keywords,
            discovered_from: postRecord.author,
          });
        }
      }

      if (!urls.length) {
        const queries = [
          `${entities[0] ?? "Solana"} ${keywords[0] ?? "announcement"}`,
          `${entities[0] ?? "Solana"} ${keywords[0] ?? "launch"} solana`,
          `${entities[0] ?? "Solana"} tokenomics solana`,
        ];
        for (const query of queries) {
          const links = await searchSources(query);
          for (const link of links) {
            const match = await validateSource(link, entities, keywords);
            if (match) {
              candidates.push({
                ...match,
                matched_entities: entities,
                matched_keywords: keywords,
                discovered_from: postRecord.author,
              });
            }
          }
        }
      }
    }

    const deduped = [];
    const seen = new Set();
    for (const item of candidates) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      deduped.push(item);
    }

    const top = deduped
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((item) => ({
        title: item.title,
        url: item.url,
        source_domain: item.source_domain,
        matched_entities: item.matched_entities,
        matched_keywords: item.matched_keywords,
        discovered_from: item.discovered_from,
        confidence_score: item.score,
      }));

    const payload = {
      updatedAt: new Date().toISOString(),
      stories: top,
    };

    await mkdir(dirname(OUTPUT_PATH.pathname), { recursive: true });
    await writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
    console.log(`Saved ${top.length} stories to ${OUTPUT_PATH.pathname}`);
  } catch (err) {
    console.error("Signal → Source failed:", err);
    process.exit(1);
  }
};

main();
