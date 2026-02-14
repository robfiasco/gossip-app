import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const cwd = process.cwd();

const resolveCount = (filePath) => {
  if (!fs.existsSync(filePath)) return 0;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (Array.isArray(data)) return data.length;
    if (Array.isArray(data?.items)) return data.items.length;
    if (Array.isArray(data?.stories)) return data.stories.length;
    if (Array.isArray(data?.tweets)) return data.tweets.length;
    return 1;
  } catch {
    return 0;
  }
};

const printAuditSummary = () => {
  console.log("\n=== Phase 1 Audit Summary ===");
  console.log("Free tier outputs:");
  console.log("  - signal_board.json (theme-level summary)");
  console.log("  - briefing.json (RSS 'missed this week')");
  console.log("Premium output:");
  console.log("  - data/seeker_stories.json");
  console.log("  - public/data/validator_stories.json");
  console.log("Dedup memory:");
  console.log("  - data/stories_shown_last_24h.json");
  console.log("  - data/stories_shown_last_48h.json");
  console.log("=============================\n");
};

const printWrittenFilesSummary = () => {
  const files = [
    "data/market_context.json",
    "data/articles.json",
    "data/tweet_clusters.json",
    "data/top_stories.json",
    "signal_board.json",
    "briefing.json",
    "data/briefing.json",
    "data/signal_board.json",
    "data/ct_stories.json",
    "data/seeker_stories.json",
    "data/stories_shown_last_24h.json",
    "data/stories_shown_last_48h.json",
    "public/data/validator_stories.json",
  ];

  console.log("\nWrote files:");
  for (const file of files) {
    const fullPath = path.join(cwd, file);
    const exists = fs.existsSync(fullPath);
    const count = exists ? resolveCount(fullPath) : 0;
    console.log(`- ${file}${exists ? ` (count: ${count})` : " (missing)"}`);
  }
  console.log("");
};

const runStep = (label, command, args = []) =>
  new Promise((resolve, reject) => {
    console.log(label);
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`${label} failed with exit code ${code}`));
      } else {
        resolve();
      }
    });
  });

const main = async () => {
  try {
    printAuditSummary();
    await runStep("STEP 0: MARKET CONTEXT BUILT", "npm", ["run", "market:build"]);
    await runStep("STEP 1: ARTICLES FETCHED", "npm", ["run", "articles:build"]);
    await runStep("STEP 2: SIGNALS CLEANED", "node", ["scripts/cleanSignals.mjs"]);
    await runStep("STEP 3: TWEETS (72H) FILTERED", "npm", ["run", "tweets:72h"]);
    await runStep("STEP 4: TWEET TOPICS EXTRACTED", "npm", [
      "run",
      "extract:tweetTopics",
    ]);
    await runStep("STEP 5: TWEETS CLUSTERED", "npm", ["run", "cluster:tweets"]);
    await runStep("STEP 6: STORIES BUILT", "node", ["scripts/buildTopStories.mjs"]);
    await runStep("STEP 7: BRIEFING BUILT", "npm", ["run", "briefing:build"]);
    await runStep("STEP 8: SIGNAL BOARD BUILT", "npm", ["run", "signal:build"]);
    await runStep("STEP 9: STORY CANDIDATES SELECTED", "npm", [
      "run",
      "stories:candidates",
    ]);
    await runStep("STEP 10: STORY METRICS EXTRACTED", "npm", [
      "run",
      "stories:metrics",
    ]);
    await runStep("STEP 11: PREMIUM CT STORIES GENERATED", "npm", [
      "run",
      "stories:ct",
    ]);
    printWrittenFilesSummary();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

main();
