import fs from "fs";
import path from "path";

const cwd = process.cwd();
const signalsPath = path.join(cwd, "signals_raw.json");
const signalsFallbackPath = path.join(cwd, "signals_raw_2026-02-09.json");
const articlesPath = path.join(cwd, "data", "articles.json");

const newsOut = path.join(cwd, "news_cards.json");
const briefingOut = path.join(cwd, "briefing.json");
const signalOut = path.join(cwd, "signal_board.json");
const publicNewsOut = path.join(cwd, "public", "news_cards.json");
const publicBriefingOut = path.join(cwd, "public", "briefing.json");
const publicSignalOut = path.join(cwd, "public", "signal_board.json");

const stopwords = new Set([
  "this","that","with","from","have","your","just","like","into","over","under","than",
  "then","them","they","their","there","about","after","before","could","would","should",
  "where","when","what","which","while","still","been","being","also","more","most",
  "some","such","very","much","many","here","only","make","made","does","did","doing",
  "will","cant","can't","dont","don't","https","http","www","com","twitter","x","tco"
]);

const loadJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
};

const cleanTokens = (text) => {
  const cleaned = String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  return cleaned
    .split(" ")
    .filter((t) => t.length >= 4 && !stopwords.has(t));
};

const unique = (arr) => Array.from(new Set(arr));

const engagementScore = (post) => {
  const reply = Number(post.replyCount || 0);
  const repost = Number(post.repostCount || 0);
  const like = Number(post.likeCount || 0);
  const view = Number(post.viewCount || 0);
  return reply * 2 + repost * 3 + like * 1 + Math.floor(view / 1000);
};

const within24h = (post) => {
  const ts = post.timestamp || post.timestampMs || null;
  if (!ts) return true;
  const time = typeof ts === "number" ? ts : new Date(ts).getTime();
  if (!Number.isFinite(time)) return true;
  return Date.now() - time <= 24 * 60 * 60 * 1000;
};

const buildKeywordWeights = (posts) => {
  const weights = new Map();
  for (const post of posts) {
    const score = engagementScore(post);
    const kws = Array.isArray(post.keywords) && post.keywords.length
      ? post.keywords
      : cleanTokens(post.text);
    for (const kw of unique(kws)) {
      weights.set(kw, (weights.get(kw) || 0) + Math.max(1, score));
    }
  }
  return weights;
};

const topicTagFrom = (text) => {
  const t = text.toLowerCase();
  if (/(tokenomics|unlock|supply|airdrop)/.test(t)) return "TOKENOMICS";
  if (/(validator|staking|restaking|delegat)/.test(t)) return "STAKING";
  if (/(rpc|infra|latency|firedancer|client)/.test(t)) return "INFRA";
  if (/(stable|usdc|usdt|payments)/.test(t)) return "STABLES";
  if (/(perps|derivatives|funding|liquidations)/.test(t)) return "DERIVATIVES";
  if (/(memecoin|bonk|wif|meme)/.test(t)) return "MEME";
  return "DEFI";
};

const buildWhyItMatters = (title, tag) => {
  switch (tag) {
    case "TOKENOMICS":
      return "Supply mechanics matter here — positioning will hinge on timing.";
    case "STAKING":
      return "Validator economics shift the floor for SOL risk/reward.";
    case "INFRA":
      return "Infra changes can quietly move flows before price reacts.";
    case "STABLES":
      return "Stable flows are the cleanest early signal for risk-on.";
    case "DERIVATIVES":
      return "Positioning data here can swing the next leg.";
    case "MEME":
      return "Rotation here often precedes broader retail appetite.";
    default:
      return "This is the type of update that changes short-term positioning.";
  }
};

const normalizeArticleKeywords = (article) => {
  const base = `${article.title || ""} ${article.summary || ""}`;
  return unique(cleanTokens(base));
};

const matchArticleScore = (article, keywordWeights) => {
  const kws = normalizeArticleKeywords(article);
  return kws.reduce((acc, kw) => acc + (keywordWeights.get(kw) || 0), 0);
};

const byDateDesc = (a, b) => {
  const ta = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
  const tb = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
  return tb - ta;
};

const signalsRaw = loadJson(signalsPath) || loadJson(signalsFallbackPath) || {};
const rawPosts = Array.isArray(signalsRaw.posts)
  ? signalsRaw.posts
  : Array.isArray(signalsRaw.tweets)
  ? signalsRaw.tweets
  : Array.isArray(signalsRaw)
  ? signalsRaw
  : [];
const normalizeHandle = (handle) =>
  String(handle || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
const allowedHandles = new Set(
  [
    "fabianosolana",
    "sol_nxxn",
    "jussy_world",
    "heavymetalcook6",
    "mert",
    "lightspeedpodhq",
    "weremeow",
    "solanasensei",
  ].map(normalizeHandle)
);
const posts = rawPosts
  .filter(within24h)
  .map((post) => ({
    ...post,
    handle: normalizeHandle(post.handle || post.author || post.user),
  }))
  .filter((post) => !post.handle || allowedHandles.has(post.handle));

const rawArticles = loadJson(articlesPath) || [];
const articles = Array.isArray(rawArticles)
  ? rawArticles
  : Array.isArray(rawArticles?.items)
  ? rawArticles.items
  : [];

const keywordWeights = buildKeywordWeights(posts);
const topKeywords = Array.from(keywordWeights.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5)
  .map(([kw]) => kw);

const findDirectMatch = (post, article) => {
  if (!post.firstExternalUrl || !article.url) return false;
  return post.firstExternalUrl === article.url;
};

const signalsMentionBackpack = posts.some((post) => {
  const text = String(post.text || "").toLowerCase();
  return text.includes("backpack") || text.includes("tokenomics");
});

const pickTopStories = () => {
  const scored = articles.map((article) => {
    const score = matchArticleScore(article, keywordWeights);
    return { ...article, matchScore: score };
  });

  const topEngagementPosts = posts
    .slice()
    .sort((a, b) => engagementScore(b) - engagementScore(a))
    .slice(0, 3);

  const selected = [];
  const selectedUrls = new Set();

  if (signalsMentionBackpack) {
    const backpack = scored.find((a) =>
      `${a.title} ${a.summary}`.toLowerCase().includes("backpack")
    );
    if (backpack) {
      selected.push(backpack);
      selectedUrls.add(backpack.url);
    }
  }

  for (const post of topEngagementPosts) {
    if (selected.length >= 2) break;
    let best = null;
    for (const article of scored) {
      if (selectedUrls.has(article.url)) continue;
      if (findDirectMatch(post, article)) {
        best = article;
        break;
      }
    }
    if (!best) {
      const postKeywords = unique(
        (Array.isArray(post.keywords) && post.keywords.length
          ? post.keywords
          : cleanTokens(post.text))
      );
      best = scored
        .filter((a) => !selectedUrls.has(a.url))
        .map((a) => {
          const overlap = a.matchScore + postKeywords.reduce(
            (acc, kw) => acc + (keywordWeights.get(kw) || 0),
            0
          );
          return { ...a, overlap };
        })
        .sort((a, b) => b.overlap - a.overlap || byDateDesc(a, b))[0];
    }
    if (best) {
      selected.push(best);
      selectedUrls.add(best.url);
    }
  }

  if (selected.length < 2) {
    const remaining = scored
      .filter((a) => !selectedUrls.has(a.url))
      .sort((a, b) => b.matchScore - a.matchScore || byDateDesc(a, b));
    while (selected.length < 2 && remaining.length) {
      const next = remaining.shift();
      selected.push(next);
      selectedUrls.add(next.url);
    }
  }

  // Story #3: important but quiet
  const quietCandidates = scored
    .filter((a) => !selectedUrls.has(a.url))
    .sort((a, b) => {
      const aScore = a.matchScore;
      const bScore = b.matchScore;
      if (aScore !== bScore) return aScore - bScore;
      return byDateDesc(b, a);
    });
  const important = quietCandidates.find((a) => {
    const t = `${a.title} ${a.summary}`.toLowerCase();
    return /(tokenomics|validator|upgrade|unlock|staking|liquidity)/.test(t);
  });
  if (important) {
    selected.push(important);
  } else if (quietCandidates.length) {
    selected.push(quietCandidates[0]);
  }

  return selected.slice(0, 3);
};

const attachInfluencers = (article) => {
  const kwSet = new Set(normalizeArticleKeywords(article));
  const matched = posts
    .map((post) => {
      const kws = Array.isArray(post.keywords) && post.keywords.length
        ? post.keywords
        : cleanTokens(post.text);
      const overlap = kws.filter((k) => kwSet.has(k)).length;
      return { post, overlap };
    })
    .filter((m) => m.overlap > 0)
    .sort((a, b) => engagementScore(b.post) - engagementScore(a.post))
    .slice(0, 2)
    .map(({ post }) => ({
      handle: post.handle || null,
      snippet: String(post.text || "").slice(0, 120),
      engagementScore: engagementScore(post),
      permalink: post.permalink || null,
    }));
  return matched;
};

const summarizeTweet = (text) => {
  const cleaned = String(text || "")
    .replace(/#[^\s]+/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\\b(breaking|gm|gmgm|thread|update)\\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const words = cleaned.split(" ").slice(0, 12).join(" ");
  return words.length < cleaned.length ? `${words}…` : words;
};

const buildWhosTalking = (article) => {
  const kwSet = new Set(normalizeArticleKeywords(article));
  const candidates = posts
    .map((post) => {
      const kws = Array.isArray(post.keywords) && post.keywords.length
        ? post.keywords
        : cleanTokens(post.text);
      const overlap = kws.filter((k) => kwSet.has(k)).length;
      const score =
        overlap * 4 +
        engagementScore(post) +
        (post.firstExternalUrl ? 2 : 0) +
        Math.min(String(post.text || "").length / 120, 3);
      return { post, score };
    })
    .filter((m) => m.score > 0 && (m.post.permalink || m.post.url || m.post.firstExternalUrl))
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const whosTalking = [];
  for (const cand of candidates) {
    const handleRaw = cand.post.handle || cand.post.author || "";
    const handleClean = normalizeHandle(handleRaw);
    const handle = handleClean
      ? `@${handleClean}`
      : "";
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    whosTalking.push({
      handle,
      summary: summarizeTweet(cand.post.text),
      url: cand.post.permalink || cand.post.url || cand.post.firstExternalUrl || "",
      score: Math.round(cand.score),
    });
    if (whosTalking.length >= 3) break;
  }
  return whosTalking;
};

const selected = pickTopStories();

const newsCards = selected.map((article) => {
  const topicTag = topicTagFrom(`${article.title} ${article.summary}`);
  return {
    title: article.title,
    url: article.url,
    source: article.source,
    publishedAt: article.publishedAt || null,
    whyItMatters: buildWhyItMatters(article.title, topicTag),
    matchedInfluencers: attachInfluencers(article),
    whosTalking: buildWhosTalking(article),
    topicTag,
  };
});

const generatedAt = new Date().toISOString();

const briefing = {
  generatedAt,
  items: newsCards.map((story) => `${story.title} — ${story.whyItMatters}`),
};

const extractTopics = () => {
  const topics = new Map();
  const entities = new Map();
  const rules = [
    { tag: "tokenomics", keywords: ["tokenomics", "unlock", "tge", "airdrop", "supply"] },
    { tag: "infra", keywords: ["rpc", "infra", "latency", "firedancer", "client", "upgrade"] },
    { tag: "staking", keywords: ["staking", "validator", "delegation", "restaking", "yield"] },
    { tag: "stablecoins", keywords: ["stablecoin", "usdc", "usdt", "liquidity", "payments"] },
    { tag: "defi", keywords: ["defi", "tvl", "pool", "dex", "perps"] },
    { tag: "macro", keywords: ["etf", "macro", "rates", "risk", "dominance"] },
  ];
  const entityRules = [
    "backpack",
    "jito",
    "jupiter",
    "solana",
    "firedancer",
    "raydium",
    "orca",
    "drift",
    "kamino",
  ];
  for (const story of newsCards) {
    const text = `${story.title} ${story.whyItMatters}`.toLowerCase();
    rules.forEach((rule) => {
      if (rule.keywords.some((kw) => text.includes(kw))) {
        topics.set(rule.tag, (topics.get(rule.tag) || 0) + 1);
      }
    });
    entityRules.forEach((entity) => {
      if (text.includes(entity)) {
        entities.set(entity, (entities.get(entity) || 0) + 1);
      }
    });
  }
  return {
    topTopics: Array.from(topics.entries()).sort((a, b) => b[1] - a[1]).map(([t]) => t),
    entities: Array.from(entities.entries()).sort((a, b) => b[1] - a[1]).map(([e]) => e),
  };
};

const buildPastWeek = () => {
  const { topTopics, entities } = extractTopics();
  const bullets = [];
  if (entities.includes("backpack") || topTopics.includes("tokenomics")) {
    bullets.push("Backpack tokenomics/TGE chatter pushed the tape all week.");
  }
  if (topTopics.includes("infra")) {
    bullets.push("Infra and RPC reliability kept creeping into headlines.");
  }
  if (topTopics.includes("stablecoins")) {
    bullets.push("Stablecoin flow notes stayed front-of-mind in Solana coverage.");
  }
  if (!bullets.length) {
    bullets.push("Headlines stayed fragmented; no single Solana catalyst dominated.");
  }
  return bullets.slice(0, 3);
};

const buildThisWeek = () => {
  const { topTopics } = extractTopics();
  const bullets = [];
  if (topTopics.includes("tokenomics")) {
    bullets.push("Track tokenomics/TGE timing for the next liquidity test.");
  }
  if (topTopics.includes("staking")) {
    bullets.push("Staking and validator yield shifts are the clean signal.");
  }
  if (topTopics.includes("infra")) {
    bullets.push("Infra/perf chatter can swing flows quickly; keep it on screen.");
  }
  if (!bullets.length) {
    bullets.push("Focus on follow-through from today’s top Solana headlines.");
  }
  return bullets.slice(0, 3);
};

const buildWhatsHot = () => {
  const hottest = newsCards
    .map((story) => ({
      story,
      heat: Array.isArray(story.whosTalking) ? story.whosTalking.length : 0,
    }))
    .sort((a, b) => b.heat - a.heat)[0];
  if (hottest && hottest.heat > 0) {
    return [
      `${hottest.story.title.split("—")[0].trim()} is pulling the most attention.`,
      "Influencer chatter is clustering around today’s lead story.",
    ];
  }
  const topTheme = topKeywords[0] || "flows";
  return [`${topTheme} is the dominant theme in recent chatter.`];
};

const signalBoard = {
  generatedAt,
  pastWeek: buildPastWeek(),
  thisWeek: buildThisWeek(),
  whatsHot: buildWhatsHot(),
};

const newsOutput = { generatedAt, items: newsCards };

fs.writeFileSync(newsOut, JSON.stringify(newsOutput, null, 2), "utf-8");
fs.writeFileSync(briefingOut, JSON.stringify(briefing, null, 2), "utf-8");
fs.writeFileSync(signalOut, JSON.stringify(signalBoard, null, 2), "utf-8");
fs.mkdirSync(path.dirname(publicNewsOut), { recursive: true });
fs.writeFileSync(publicNewsOut, JSON.stringify(newsOutput, null, 2), "utf-8");
fs.writeFileSync(publicBriefingOut, JSON.stringify(briefing, null, 2), "utf-8");
fs.writeFileSync(publicSignalOut, JSON.stringify(signalBoard, null, 2), "utf-8");

console.log(`Wrote ${newsCards.length} stories to ${newsOut}`);
console.log(`Wrote briefing to ${briefingOut}`);
console.log(`Wrote signal board to ${signalOut}`);
