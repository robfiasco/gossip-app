import fs from "fs";
import path from "path";

const root = process.cwd();
const inputPath = path.join(root, "signals_raw.json");
const outputPath = path.join(root, "data", "story_metrics.json");

const toArray = (value) => (Array.isArray(value) ? value : []);

const normalizeHandle = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("@") ? raw : `@${raw}`;
};

const readSignals = () => {
  if (!fs.existsSync(inputPath)) return [];
  const raw = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.tweets)) return raw.tweets;
  if (Array.isArray(raw?.posts)) return raw.posts;
  return [];
};

const engagementFromTweet = (tweet) => {
  const fromMetrics =
    Number(tweet?.engagement) ||
    Number(tweet?.metrics?.engagement) ||
    Number(tweet?.public_metrics?.engagement) ||
    0;
  if (fromMetrics > 0) return fromMetrics;

  const likes =
    Number(tweet?.likeCount) ||
    Number(tweet?.favorite_count) ||
    Number(tweet?.public_metrics?.like_count) ||
    0;
  const reposts =
    Number(tweet?.repostCount) ||
    Number(tweet?.retweet_count) ||
    Number(tweet?.public_metrics?.retweet_count) ||
    0;
  const replies =
    Number(tweet?.replyCount) ||
    Number(tweet?.reply_count) ||
    Number(tweet?.public_metrics?.reply_count) ||
    0;
  const views =
    Number(tweet?.viewCount) ||
    Number(tweet?.views?.count) ||
    Number(tweet?.public_metrics?.impression_count) ||
    0;

  return likes + reposts + replies + Math.floor(views / 100);
};

const main = () => {
  const tweets = readSignals();
  const handleAgg = new Map();
  let totalEngagement = 0;
  let topTweet = { id: null, handle: null, engagement: 0 };

  for (const tweet of tweets) {
    const handle = normalizeHandle(tweet?.handle || tweet?.user?.screen_name || tweet?.author || tweet?.username);
    const engagement = engagementFromTweet(tweet);
    totalEngagement += engagement;

    if (engagement > topTweet.engagement) {
      topTweet = {
        id: String(tweet?.id || tweet?.rest_id || ""),
        handle,
        engagement,
      };
    }

    if (!handle) continue;
    const prev = handleAgg.get(handle) || { handle, tweets: 0, engagement: 0 };
    prev.tweets += 1;
    prev.engagement += engagement;
    handleAgg.set(handle, prev);
  }

  const topUsers = Array.from(handleAgg.values())
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 10);

  const payload = {
    generatedAt: new Date().toISOString(),
    totals: {
      total_tweets: tweets.length,
      total_engagement: totalEngagement,
      top_tweet_engagement: topTweet.engagement,
      unique_users: handleAgg.size,
    },
    top_tweet: topTweet,
    top_users: topUsers,
    by_handle: Object.fromEntries(
      Array.from(handleAgg.entries()).map(([handle, row]) => [handle.toLowerCase(), row])
    ),
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf-8");
  console.log(
    `[Metrics] Processed ${tweets.length} tweets. Engagement=${totalEngagement}. Top tweet=${topTweet.engagement}.`
  );
  console.log(`[Metrics] Saved ${outputPath}`);
};

main();
