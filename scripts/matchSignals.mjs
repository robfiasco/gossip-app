import fs from "fs";
import path from "path";

const ARTICLES_PATH = path.join(process.cwd(), "data", "articles.json");
const TWEETS_PATH = path.join(process.cwd(), "data", "processed_tweets.json");
const OUTPUT_PATH = path.join(process.cwd(), "data", "matched_stories.json");

const loadJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
};

const cleanText = (text) =>
  String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/#[^\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const summarizeTweet = (text) => {
  const cleaned = cleanText(text)
    .replace(/\b(breaking|gm|gmgm|thread|update)\b/gi, "")
    .trim();
  if (!cleaned) return "";
  const words = cleaned.split(" ").slice(0, 12).join(" ");
  return words.length < cleaned.length ? `${words}…` : words;
};

const normalizeUrl = (url) => {
  if (!url) return "";
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

const normalizeKeywords = (keywords) =>
  Array.isArray(keywords)
    ? keywords.map((k) => String(k).toLowerCase())
    : [];

const main = () => {
  const articlesRaw = loadJson(ARTICLES_PATH) || [];
  const tweetsRaw = loadJson(TWEETS_PATH) || [];
  const articles = Array.isArray(articlesRaw)
    ? articlesRaw
    : Array.isArray(articlesRaw?.items)
    ? articlesRaw.items
    : [];
  const tweets = Array.isArray(tweetsRaw) ? tweetsRaw : [];

  const output = articles.map((article) => {
    const articleKeywords = new Set(normalizeKeywords(article.keywords));
    const articleUrl = normalizeUrl(article.url);

    const scored = tweets
      .map((tweet) => {
        const tweetKeywords = normalizeKeywords(tweet.keywords);
        const keywordOverlap = tweetKeywords.filter((kw) => articleKeywords.has(kw));
        const urlMatch =
          articleUrl &&
          String(tweet.url || "").toLowerCase().includes(articleUrl.toLowerCase());
        const projectMatch = keywordOverlap.length > 0;
        const score = keywordOverlap.length * 3 + (urlMatch ? 8 : 0) + (projectMatch ? 2 : 0);
        return { tweet, score, overlap: keywordOverlap.length, urlMatch };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    const seenHandles = new Set();
    const matchedTweets = [];
    for (const match of scored) {
      const handle = match.tweet.handle ? `@${match.tweet.handle}` : null;
      if (!handle || seenHandles.has(handle)) continue;
      seenHandles.add(handle);
      matchedTweets.push({
        handle,
        tweetSummary: summarizeTweet(match.tweet.text),
        tweetUrl: match.tweet.url || null,
      });
      if (matchedTweets.length >= 3) break;
    }

    return {
      title: article.title,
      source: article.source,
      url: article.url,
      summary: article.summary,
      matchScore: scored.length ? scored[0].score : 0,
      matchedTweets,
    };
  });

  const sorted = output.sort((a, b) => b.matchScore - a.matchScore);
  const matchedCount = sorted.filter((item) => item.matchScore > 0).length;

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(sorted, null, 2), "utf-8");

  if (matchedCount === 0) {
    console.log("NO MATCHING STORIES FOUND — NEED MORE TWEETS");
  }
  console.log(`Saved ${sorted.length} stories to ${OUTPUT_PATH}`);
};

main();
