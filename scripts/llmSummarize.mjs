import fs from "fs";
import path from "path";

const cwd = process.cwd();

const signalsFallback = path.join(cwd, "signals_raw.json");
const articlesPrimary = path.join(cwd, "articles.json");
const articlesFallback = path.join(cwd, "data", "articles.json");

const outSignal = path.join(cwd, "signal_board.json");
const outBriefing = path.join(cwd, "briefing.json");
const outNews = path.join(cwd, "news_cards.json");
const outSignalPublic = path.join(cwd, "public", "signal_board.json");
const outBriefingPublic = path.join(cwd, "public", "briefing.json");
const outNewsPublic = path.join(cwd, "public", "news_cards.json");
const llmDebugOut = path.join(cwd, "data", "llm_last_response.txt");

const BACKPACK_SEED_URL =
  "https://learn.backpack.exchange/blog/backpack-tokenomics-explained";

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
  ].map((h) => h.toLowerCase())
);

const normalizeHandle = (handle) =>
  String(handle || "").trim().replace(/^@/, "").toLowerCase();

const listSignalsFiles = () => {
  const entries = fs.readdirSync(cwd);
  const matches = entries
    .filter((name) => /^signals_raw_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => ({
      name,
      full: path.join(cwd, name),
      mtime: fs.statSync(path.join(cwd, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return matches;
};

const pickSignalsFile = () => {
  const dated = listSignalsFiles();
  if (dated.length) return dated[0].full;
  if (fs.existsSync(signalsFallback)) return signalsFallback;
  return null;
};

const loadJson = (filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
};

const extractPosts = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.posts)) return data.posts;
  if (Array.isArray(data?.tweets)) return data.tweets;
  return [];
};

const cleanText = (text) =>
  String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/#[^\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const keywordize = (text) => {
  const cleaned = String(text || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];
  const stop = new Set([
    "this", "that", "with", "from", "have", "your", "just", "like", "into", "over", "under", "than",
    "then", "them", "they", "their", "there", "about", "after", "before", "could", "would", "should",
    "where", "when", "what", "which", "while", "still", "been", "being", "also", "more", "most",
    "some", "such", "very", "much", "many", "here", "only", "make", "made", "does", "did", "doing",
    "will", "cant", "can't", "dont", "don't", "https", "http", "www", "com", "twitter", "x", "tco"
  ]);
  return cleaned
    .split(" ")
    .filter((t) => t.length >= 4 && !stop.has(t));
};

const summarizeTweet = (text) => {
  const cleaned = cleanText(text)
    .replace(/\b(breaking|gm|gmgm|thread|update)\b/gi, "")
    .trim();
  if (!cleaned) return "";
  const words = cleaned.split(" ").slice(0, 12).join(" ");
  return words.length < cleaned.length ? `${words}…` : words;
};

const engagementScore = (post) => {
  const reply = Number(post.replyCount || 0);
  const repost = Number(post.repostCount || 0);
  const like = Number(post.likeCount || 0);
  const view = Number(post.viewCount || 0);
  return reply * 2 + repost * 3 + like + Math.floor(view / 1000);
};

const loadSignals = () => {
  const file = pickSignalsFile();
  const raw = loadJson(file);
  const posts = extractPosts(raw)
    .map((post) => ({
      ...post,
      handle: normalizeHandle(post.handle || post.author || post.user),
    }))
    .filter((post) => !post.handle || allowedHandles.has(post.handle));
  return { file, posts };
};

const loadArticles = () => {
  const raw = loadJson(articlesPrimary) || loadJson(articlesFallback) || {};
  const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  return { raw, items };
};

const ensureBackpack = (articles) => {
  const hasBackpack = articles.some((a) =>
    String(a.url || "").includes("backpack.exchange")
  );
  if (hasBackpack) return { articles, seeded: false };
  const now = new Date();
  const seed = {
    id: `seed_backpack_${now.toISOString().slice(0, 10)}`,
    source: "Backpack Exchange",
    sourceType: "seed",
    title: "Backpack Tokenomics Explained",
    url: BACKPACK_SEED_URL,
    publishedAt: new Date(now.setUTCHours(7, 0, 0, 0)).toISOString(),
    summary: "Backpack details tokenomics, supply, and distribution ahead of TGE.",
    tags: ["tokenomics", "tge"],
    scoreHint: 5,
  };
  return { articles: [seed, ...articles], seeded: true };
};

const formatDate = (date) =>
  date.toISOString().slice(0, 10);

const pickRecentArticles = (articles, limit = 30) => {
  const withDates = articles.map((article) => ({
    ...article,
    publishedTs: article.publishedAt ? new Date(article.publishedAt).getTime() : 0,
  }));
  return withDates
    .sort((a, b) => b.publishedTs - a.publishedTs)
    .slice(0, limit);
};

const extractJsonBlock = (text) => {
  const fenced = text.match(/```json([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const startObj = text.indexOf("{");
  const endObj = text.lastIndexOf("}");
  const startArr = text.indexOf("[");
  const endArr = text.lastIndexOf("]");
  if (startObj === -1 && startArr === -1) return null;
  if (startArr !== -1 && (startArr < startObj || startObj === -1)) {
    if (endArr !== -1 && endArr > startArr) return text.slice(startArr, endArr + 1);
  }
  if (startObj !== -1 && endObj !== -1 && endObj > startObj) {
    return text.slice(startObj, endObj + 1);
  }
  return null;
};

const naiveRepair = (text) => {
  if (!text) return text;
  let repaired = text;
  repaired = repaired.replace(/,\s*([}\]])/g, "$1");
  repaired = repaired.replace(/'/g, "\"");
  return repaired;
};

const parseLLMJsonOrThrow = (raw) => {
  try {
    return JSON.parse(raw);
  } catch (err) {
    const block = extractJsonBlock(raw);
    if (block) {
      try {
        return JSON.parse(block);
      } catch {
        const repaired = naiveRepair(block);
        return JSON.parse(repaired);
      }
    }
    const repaired = naiveRepair(raw);
    return JSON.parse(repaired);
  }
};

const callOpenAI = async (prompt) => {
  if (!process.env.OPENAI_API_KEY) throw new Error("No OPENAI_API_KEY array found.");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" }
    })
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${err}`);
  }
  const data = await response.json();
  return data.choices[0].message.content;
};

const buildPrompt = ({ posts, articles, date }) => {
  const trimmedPosts = posts.slice(0, 25).map((post) => ({
    handle: post.handle ? `@${post.handle}` : null,
    text: cleanText(post.text),
    urls: post.urls || [],
    permalink: post.permalink || null,
  }));
  const trimmedArticles = articles.map((article) => ({
    id: article.id,
    title: article.title,
    url: article.url,
    source: article.source,
    publishedAt: article.publishedAt,
    summary: String(article.summary || "").slice(0, 200),
  }));
  return `
You are the Head of Research for a top-tier Solana trading desk.
Audience: experienced SOL traders, DeFi power users, and liquid fund managers.
Tone: institutional but crypto-native. Concise. Cynical when needed. Bullish only on data.
No beginner definitions. No fluff. No hype phrasing. Output JSON ONLY.

DATE: ${date}

Signals (recent influencer posts):
${JSON.stringify(trimmedPosts, null, 2)}

Articles (choose from this list ONLY):
${JSON.stringify(trimmedArticles, null, 2)}

Return JSON with this shape:
{
  "signal_board": {
    "date": "YYYY-MM-DD",
    "pastWeek": "3-4 sentences grounded in articles + tweets",
    "thisWeek": "3-4 sentences grounded in articles + tweets",
    "whatsHot": [
      { "topic":"...", "why":"...", "evidence":["tweet:...","article:..."] },
      { "topic":"...", "why":"...", "evidence":["tweet:...","article:..."] }
    ]
  },
  "briefing": {
    "date":"YYYY-MM-DD",
    "needToKnow":[ "sentence (source: ...)" ],
    "goodToKnow":[ "sentence (source: ...)" ],
    "keepAnEyeOn":[ "sentence (source: ...)" ]
  },
  "news_cards": [
    {
      "articleId":"<id from list>",
      "summary":"1-2 sentences",
      "tags":["tokenomics","infra"],
      "whyItMatters":"1 sentence",
      "whosTalking":[
        { "handle":"@jussy_world", "summary":"1 line", "tweetUrl":"https://x.com/..." }
      ]
    }
  ]
}

Rules:
- Choose exactly 3 news_cards using articleId from the list.
- No generic fluff. Use concrete entities from the data.
- Treat every word as expensive.
- For each story apply this logic:
  - HEADLINE: 5-7 words, active voice
  - The Signal: exactly what happened (1-2 sentences)
  - The Thesis: second-order impact (liquidity/tokenomics/governance/market structure)
  - The Play: actionable look-ahead
- If signals are thin, say so in signal_board.
- Keep whosTalking to max 3 entries per story.
- Output JSON ONLY.
`;
};

const matchWhosTalking = (article, posts) => {
  const articleText = `${article.title} ${article.summary}`.toLowerCase();
  const articleKeywords = new Set(keywordize(articleText));
  const scored = posts
    .map((post) => {
      const text = String(post.text || "").toLowerCase();
      const direct =
        (post.urls || []).some((url) => url && article.url && url.includes(article.url)) ||
        (post.permalink && article.url && post.permalink.includes(article.url));
      const overlap = keywordize(text).filter((kw) => articleKeywords.has(kw)).length;
      const score =
        (direct ? 10 : 0) + overlap * 3 + engagementScore(post);
      return { post, score, overlap, direct };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  const seen = new Set();
  const results = [];
  for (const entry of scored) {
    const handle = entry.post.handle ? `@${entry.post.handle}` : null;
    const url = entry.post.permalink || entry.post.url || entry.post.firstExternalUrl || null;
    if (!handle || !url || seen.has(handle)) continue;
    seen.add(handle);
    results.push({
      handle,
      summary: summarizeTweet(entry.post.text),
      tweetUrl: url,
      score: entry.score,
    });
    if (results.length >= 3) break;
  }
  return results;
};

const fallbackDigest = (articles, date) => {
  const fallbackArticles = articles.slice(0, 3);
  const keywordCounts = new Map();
  for (const article of articles) {
    const words = keywordize(`${article.title} ${article.summary}`);
    for (const word of words) {
      keywordCounts.set(word, (keywordCounts.get(word) || 0) + 1);
    }
  }
  const topKeyword = Array.from(keywordCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  const exampleHeadline = fallbackArticles[0]?.title || "Solana updates";
  const sourceCounts = new Map();
  for (const article of articles) {
    if (!article.source) continue;
    sourceCounts.set(article.source, (sourceCounts.get(article.source) || 0) + 1);
  }
  const topSources = Array.from(sourceCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([source]) => source);
  return {
    signal_board: {
      date,
      pastWeek: topKeyword
        ? `${topKeyword} dominated coverage; see: ${exampleHeadline}.`
        : `Coverage was thin; the clearest item was: ${exampleHeadline}.`,
      thisWeek: topSources.length
        ? `Watch ${topSources.join(" and ")} for follow-through updates.`
        : "Watch for follow-through from today’s top Solana headlines.",
      whatsHot: [
        {
          topic: topKeyword || "Limited signal",
          why: "Thin post volume, low overlap across stories.",
          evidence: [],
        },
      ],
    },
    briefing: {
      date,
      needToKnow: fallbackArticles.map((a) => `${a.title} (source: ${a.source})`),
      goodToKnow: [],
      keepAnEyeOn: [],
    },
    news_cards: fallbackArticles.map((a) => ({
      articleId: a.id,
      summary: a.summary || "",
      tags: [],
      whyItMatters: "Keep this on your radar for Solana positioning.",
      whosTalking: [],
    })),
  };
};

const main = async () => {
  console.log("Using OpenAI model: gpt-4o-mini");
  const { file: signalsFile, posts } = loadSignals();
  const { items: rawArticles } = loadArticles();
  const date = formatDate(new Date());
  const { articles, seeded } = ensureBackpack(rawArticles);
  let recentArticles = pickRecentArticles(articles, 40);
  const backpackCandidate =
    rawArticles.find((a) => a.url === BACKPACK_SEED_URL) ||
    rawArticles.find((a) => String(a.url || "").includes("backpack.exchange")) ||
    rawArticles.find((a) =>
      String(a.title || "").toLowerCase().includes("backpack tokenomics")
    );
  if (!recentArticles.some((a) => a.url === BACKPACK_SEED_URL)) {
    if (backpackCandidate) {
      recentArticles = [
        {
          ...backpackCandidate,
          id: backpackCandidate.id || `seed_backpack_${date}`,
        },
        ...recentArticles,
      ];
    } else {
      recentArticles = [
        {
          id: `seed_backpack_${date}`,
          source: "Backpack Exchange",
          sourceType: "seed",
          title: "Backpack Tokenomics Explained",
          url: BACKPACK_SEED_URL,
          publishedAt: new Date().toISOString(),
          summary: "Backpack tokenomics explained with supply and distribution details.",
          tags: ["backpack", "tokenomics"],
          scoreHint: 5,
        },
        ...recentArticles,
      ];
    }
  }

  console.log("Signals file:", signalsFile || "none");
  console.log("Signals count:", posts.length);
  console.log("Articles count:", recentArticles.length);
  console.log(
    "Backpack seeded:",
    recentArticles.some((a) => a.url === BACKPACK_SEED_URL)
  );

  let parsed;
  try {
    const prompt = buildPrompt({ posts, articles: recentArticles, date });
    const output = await callOpenAI(prompt);
    fs.mkdirSync(path.dirname(llmDebugOut), { recursive: true });
    fs.writeFileSync(llmDebugOut, output, "utf-8");
    parsed = parseLLMJsonOrThrow(output);
  } catch (err) {
    console.error("LLM failed:", err.message);
    console.error(`Raw response saved to ${llmDebugOut}`);
    parsed = fallbackDigest(recentArticles, date);
  }

  const newsCards = [];
  const articleIndex = new Map(recentArticles.map((a) => [a.id, a]));

  for (const card of parsed.news_cards || []) {
    const article = articleIndex.get(card.articleId);
    if (!article) continue;
    newsCards.push({
      source: article.source,
      title: article.title,
      url: article.url,
      publishedAt: article.publishedAt || null,
      summary: card.summary || article.summary || "",
      tags: Array.isArray(card.tags) ? card.tags.slice(0, 3) : [],
      whyItMatters: card.whyItMatters || "",
      whosTalking: matchWhosTalking(article, posts),
    });
  }

  if (newsCards.length < 3) {
    for (const article of recentArticles) {
      if (newsCards.length >= 3) break;
      if (newsCards.some((c) => c.url === article.url)) continue;
      newsCards.push({
        source: article.source,
        title: article.title,
        url: article.url,
        publishedAt: article.publishedAt || null,
        summary: article.summary || "",
        tags: Array.isArray(article.tags) ? article.tags.slice(0, 3) : [],
        whyItMatters: "Worth a read for Solana positioning context.",
        whosTalking: matchWhosTalking(article, posts),
      });
    }
  }

  const signalBoard = {
    date,
    pastWeek: parsed.signal_board?.pastWeek || "",
    thisWeek: parsed.signal_board?.thisWeek || "",
    whatsHot: parsed.signal_board?.whatsHot || [],
  };

  const briefing = {
    date,
    needToKnow: parsed.briefing?.needToKnow || [],
    goodToKnow: parsed.briefing?.goodToKnow || [],
    keepAnEyeOn: parsed.briefing?.keepAnEyeOn || [],
  };

  const newsOutput = newsCards;

  fs.writeFileSync(outSignal, JSON.stringify(signalBoard, null, 2), "utf-8");
  fs.writeFileSync(outBriefing, JSON.stringify(briefing, null, 2), "utf-8");
  fs.writeFileSync(outNews, JSON.stringify(newsOutput, null, 2), "utf-8");
  fs.mkdirSync(path.dirname(outSignalPublic), { recursive: true });
  fs.writeFileSync(outSignalPublic, JSON.stringify(signalBoard, null, 2), "utf-8");
  fs.writeFileSync(outBriefingPublic, JSON.stringify(briefing, null, 2), "utf-8");
  fs.writeFileSync(outNewsPublic, JSON.stringify(newsOutput, null, 2), "utf-8");

  console.log("Wrote:", outSignal);
  console.log("Wrote:", outBriefing);
  console.log("Wrote:", outNews);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
