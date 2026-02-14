import fs from "fs";
import path from "path";

const cwd = process.cwd();
const articlesPath = path.join(cwd, "data", "articles.json");
const signalsPath = path.join(cwd, "signals_raw.json");
const outScored = path.join(cwd, "data", "articles_scored.json");
const outTop = path.join(cwd, "data", "top_stories.json");

const loadJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
};

const canonicalizeUrl = (raw) => {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const params = new URLSearchParams(url.search);
    for (const key of [...params.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || key.toLowerCase() === "ref") {
        params.delete(key);
      }
    }
    url.search = params.toString() ? `?${params.toString()}` : "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return raw.split("#")[0].split("?")[0];
  }
};

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stopwords = new Set([
  "the","and","for","with","from","this","that","have","has","will","into","over","after","before","about","more","than","into","onto","just","they","them","their","what","when","where","why","how","are","was","were","been","being","its","our","your","you","i","we","to","of","in","on","at","by","as","is","it","a","an","or",
]);

const tokenize = (value) =>
  normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !stopwords.has(token));

const extractPosts = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.posts)) return data.posts;
  if (Array.isArray(data?.tweets)) return data.tweets;
  return [];
};

const dedupeTweets = (tweets) => {
  const seen = new Set();
  return tweets.filter((tweet) => {
    const handle = String(tweet.handle || tweet.author || tweet.user || "").toLowerCase();
    const text = normalizeText(tweet.text);
    const key = `${handle}::${text}`;
    if (!handle || !text) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sourcePriority = new Map([
  ["theblock", 3],
  ["coindesk", 3],
  ["decrypt", 3],
  ["messari", 2],
  ["blockworks", 2],
  ["solana", 2],
]);

const scoreArticles = (articles, tweets) => {
  const tweetList = dedupeTweets(tweets);
  const scored = articles.map((article) => {
    const articleUrl = canonicalizeUrl(article.url);
    const articleDomain = (() => {
      try {
        return new URL(article.url).hostname.replace(/^www\./, "");
      } catch {
        return "";
      }
    })();
    const titleTokens = new Set(tokenize(article.title));
    const summaryTokens = new Set(tokenize(article.summary));
    const articleTokens = new Set([...titleTokens, ...summaryTokens]);

    let mentionCount = 0;
    const who = [];
    const seenHandles = new Set();
    let matchReason = null;

    for (const tweet of tweetList) {
      const tweetText = String(tweet.text || "");
      const tweetUrls = Array.isArray(tweet.urls) ? tweet.urls : [];
      const tweetUrlHit = tweetUrls
        .map(canonicalizeUrl)
        .filter(Boolean)
        .some((u) => u === articleUrl);
      if (tweetUrlHit) {
        mentionCount += 1;
        matchReason = matchReason || "url_match";
      } else {
        const urlDomainHit = tweetUrls.some((u) => {
          try {
            return new URL(u).hostname.replace(/^www\./, "") === articleDomain;
          } catch {
            return false;
          }
        });
        if (urlDomainHit) {
          const tweetTokens = new Set(tokenize(tweetText));
          let overlap = 0;
          for (const token of tweetTokens) {
            if (articleTokens.has(token)) overlap += 1;
          }
          if (overlap >= 3) {
            mentionCount += 1;
            matchReason = matchReason || "domain_match";
          }
        } else {
          const tweetTokens = new Set(tokenize(tweetText));
          let overlap = 0;
          for (const token of tweetTokens) {
            if (articleTokens.has(token)) overlap += 1;
          }
          if (overlap >= 3) {
            mentionCount += 1;
            matchReason = matchReason || "keyword_match";
          }
        }
      }

      if (mentionCount > 0 && who.length < 3) {
        const handle = tweet.handle || tweet.author || tweet.user || "";
        if (handle && !seenHandles.has(handle)) {
          seenHandles.add(handle);
          who.push({
            handle: handle.startsWith("@") ? handle : `@${handle}`,
            tweetUrl: tweet.permalink || tweet.url || null,
            oneLineSummary: normalizeText(tweetText).slice(0, 140),
          });
        }
      }
    }

    const publishedTs = article.publishedAt ? new Date(article.publishedAt).getTime() : 0;
    const sourceKey = String(article.source || "").toLowerCase();
    const priority = sourcePriority.get(sourceKey) || 0;

    return {
      title: article.title,
      url: article.url,
      source: article.source,
      publishedAt: article.publishedAt || null,
      summary: article.summary || null,
      mentionCount,
      who,
      matchReason,
      _sort: { mentionCount, publishedTs, priority },
    };
  });

  scored.sort((a, b) => {
    if (b._sort.mentionCount !== a._sort.mentionCount) {
      return b._sort.mentionCount - a._sort.mentionCount;
    }
    if (b._sort.publishedTs !== a._sort.publishedTs) {
      return b._sort.publishedTs - a._sort.publishedTs;
    }
    return b._sort.priority - a._sort.priority;
  });

  return scored;
};

const main = () => {
  const articlesRaw = loadJson(articlesPath) || {};
  const articles = Array.isArray(articlesRaw?.items)
    ? articlesRaw.items
    : Array.isArray(articlesRaw)
    ? articlesRaw
    : [];

  const signalsRaw = loadJson(signalsPath) || {};
  const tweets = extractPosts(signalsRaw);

  const scored = scoreArticles(articles, tweets);
  fs.mkdirSync(path.dirname(outScored), { recursive: true });
  fs.writeFileSync(outScored, JSON.stringify(scored, null, 2), "utf-8");

  const top = scored.slice(0, 5).map((item, index) => ({
    rank: index + 1,
    title: item.title,
    url: item.url,
    source: item.source,
    publishedAt: item.publishedAt,
    mentionCount: item.mentionCount,
    who: item.who,
    matchReason: item.matchReason || null,
  }));

  fs.writeFileSync(outTop, JSON.stringify(top, null, 2), "utf-8");

  console.log(`Scored ${scored.length} articles -> ${outTop}`);
  top.forEach((item) => {
    console.log(`[${item.rank}] ${item.source} ${item.title} (mentions: ${item.mentionCount})`);
  });
};

main();
