import { readFile } from "node:fs/promises";

const FILE_PATH = new URL("../public/daily-stories.json", import.meta.url);

const fail = (message) => {
  console.error(`daily:validate error: ${message}`);
  process.exit(1);
};

const main = async () => {
  try {
    const raw = await readFile(FILE_PATH, "utf-8");
    const json = JSON.parse(raw);
    if (!json.generatedAt) fail("missing generatedAt");
    if (!Array.isArray(json.stories)) fail("stories is not an array");
    if (json.stories.length !== 3) fail(`stories length is ${json.stories.length}, expected 3`);

    json.stories.forEach((story, idx) => {
      const missing = [];
      if (story.rank === undefined) missing.push("rank");
      if (!story.title) missing.push("title");
      if (!story.url) missing.push("url");
      if (!story.source) missing.push("source");
      if (missing.length) {
        fail(`story ${idx + 1} missing fields: ${missing.join(", ")}`);
      }
    });

    console.log(
      `daily:validate ok — ${json.stories.length} stories, generatedAt ${json.generatedAt}`
    );
  } catch (err) {
    fail(err instanceof Error ? err.message : "unknown error");
  }
};

main();
