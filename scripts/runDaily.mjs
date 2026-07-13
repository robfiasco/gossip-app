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
  console.log("  - public/data/validator_stories.json (on-chain fund flow story)");
  console.log("=============================\n");
};

const printWrittenFilesSummary = () => {
  const files = [
    "data/market_context.json",
    "data/articles.json",
    "signal_board.json",
    "briefing.json",
    "data/briefing.json",
    "data/signal_board.json",
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
    await runStep("STEP 2: BRIEFING BUILT", "npm", ["run", "briefing:build"]);
    await runStep("STEP 3: BRIEFING NARRATIVE ENHANCED", "npm", ["run", "briefing:enhance"]);
    await runStep("STEP 4: SIGNAL BOARD BUILT", "npm", ["run", "signal:build"]);
    printWrittenFilesSummary();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
};

main();
