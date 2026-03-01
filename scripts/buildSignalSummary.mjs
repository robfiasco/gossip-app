import fs from "fs";
import path from "path";

const cwd = process.cwd();
const matchedPath = path.join(cwd, "data", "matched_stories.json");
const tweetsPath = path.join(cwd, "data", "processed_tweets.json");

const outNews = path.join(cwd, "news_cards.json");
const outBriefing = path.join(cwd, "briefing.json");
const outSignal = path.join(cwd, "signal_board.json");
const outNewsPublic = path.join(cwd, "public", "news_cards.json");
const outBriefingPublic = path.join(cwd, "public", "briefing.json");
const outSignalPublic = path.join(cwd, "public", "signal_board.json");

const loadJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
};

const cleanText = (text) =>
  String(text || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/#[^\s]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

const extractJsonBlock = (text) => {
  const fenced = text.match(/```json([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const startObj = text.indexOf("{");
  const endObj = text.lastIndexOf("}");
  if (startObj === -1 || endObj === -1 || endObj <= startObj) return null;
  return text.slice(startObj, endObj + 1);
};

const parseLLMJsonOrThrow = (raw) => {
  const block = extractJsonBlock(raw);
  if (!block) {
    throw new Error("No JSON block detected in LLM output");
  }
  try {
    return JSON.parse(block);
  } catch {
    const repaired = block.replace(/,\s*([}\]])/g, "$1").replace(/'/g, "\"");
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
      model: "gpt-4.1",
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

const buildPrompt = ({ matchedStories, tweets }) => {
  const trimmedStories = matchedStories.slice(0, 20).map((story) => ({
    title: story.title,
    source: story.source,
    url: story.url,
    summary: story.summary,
    matchScore: story.matchScore,
    matchedTweets: story.matchedTweets?.map((t) => ({
      handle: t.handle,
      tweetSummary: cleanText(t.tweetSummary),
      tweetUrl: t.tweetUrl,
    })),
  }));

  const trimmedTweets = tweets.slice(0, 40).map((tweet) => ({
    handle: tweet.handle ? `@${tweet.handle}` : null,
    text: cleanText(tweet.text),
    url: tweet.url,
  }));

  return `
SYSTEM:
You are the Head of Research for a top-tier Solana trading desk.
Audience: experienced SOL traders, DeFi power users, liquid fund managers.
Tone: institutional but crypto-native, concise, skeptical when needed, no hype.
No beginner definitions. No fluff. Return STRICT JSON only.

USER:
Matched stories:
${JSON.stringify(trimmedStories, null, 2)}

Recent tweet summaries:
${JSON.stringify(trimmedTweets, null, 2)}

Return JSON with this exact shape:
{
  "topStories": [
    {
      "title": "...",
      "source": "...",
      "url": "...",
      "summary": "...",
      "whyItMatters": "...",
      "whosTalking": [
        { "handle": "@handle", "summary": "...", "tweetUrl": "..." }
      ]
    }
  ],
  "needToKnow": "",
  "goodToKnow": "",
  "watchList": ""
}

Rules:
- topStories max 5, prioritize stories with matchedTweets.
- concise, trader-focused, second-order thinking first.
- for each story include:
  - The Signal (what happened)
  - The Thesis (market structure/liquidity/tokenomics implication)
  - The Play (actionable next watch)
- ignore generic news.
- JSON only, no commentary.
`;
};

const fallback = (matchedStories) => {
  const top = matchedStories
    .filter((s) => s.matchScore > 0)
    .slice(0, 3)
    .map((s) => ({
      title: s.title,
      source: s.source,
      url: s.url,
      summary: s.summary || "",
      whyItMatters: "Keep this on your radar for positioning.",
      whosTalking: s.matchedTweets || [],
    }));

  return {
    topStories: top,
    needToKnow: "Signal volume is thin; focus on the top matched headlines.",
    goodToKnow: "Market chatter is concentrated in a few narratives.",
    watchList: "Watch for follow-through on the top story themes.",
  };
};

const main = async () => {
  console.log("Using OpenAI model: gpt-4.1");
  const matchedStoriesRaw = loadJson(matchedPath);
  const tweetsRaw = loadJson(tweetsPath);
  const matchedStories = Array.isArray(matchedStoriesRaw)
    ? matchedStoriesRaw
    : [];
  const tweets = Array.isArray(tweetsRaw) ? tweetsRaw : [];

  let parsed;
  try {
    const prompt = buildPrompt({ matchedStories, tweets });
    const output = await callOpenAI(prompt);
    parsed = parseLLMJsonOrThrow(output);
  } catch (err) {
    console.error("LLM failed:", err.message);
    parsed = fallback(matchedStories);
  }

  const topStories = Array.isArray(parsed.topStories) ? parsed.topStories.slice(0, 5) : [];
  const newsCards = topStories.map((story) => ({
    source: story.source,
    title: story.title,
    url: story.url,
    publishedAt: null,
    summary: story.summary || "",
    whyItMatters: story.whyItMatters || "",
    whosTalking: Array.isArray(story.whosTalking) ? story.whosTalking.slice(0, 3) : [],
  }));

  const briefing = {
    needToKnow: parsed.needToKnow || "",
    goodToKnow: parsed.goodToKnow || "",
    keepAnEyeOn: parsed.watchList || "",
  };

  const signalBoard = {
    pastWeek: parsed.needToKnow || "",
    thisWeek: parsed.goodToKnow || "",
    whatsHot: parsed.watchList || "",
  };

  fs.writeFileSync(outNews, JSON.stringify(newsCards, null, 2), "utf-8");
  fs.writeFileSync(outBriefing, JSON.stringify(briefing, null, 2), "utf-8");
  fs.writeFileSync(outSignal, JSON.stringify(signalBoard, null, 2), "utf-8");
  fs.mkdirSync(path.dirname(outNewsPublic), { recursive: true });
  fs.writeFileSync(outNewsPublic, JSON.stringify(newsCards, null, 2), "utf-8");
  fs.writeFileSync(outBriefingPublic, JSON.stringify(briefing, null, 2), "utf-8");
  fs.writeFileSync(outSignalPublic, JSON.stringify(signalBoard, null, 2), "utf-8");

  console.log("DAILY SIGNAL SUMMARY GENERATED");
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
