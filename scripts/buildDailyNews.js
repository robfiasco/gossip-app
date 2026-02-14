import fs from "fs";
import path from "path";

const narrativesPath = path.join(process.cwd(), "narratives.json");
const matchesPath = path.join(process.cwd(), "matching_articles.json");
const outputPath = path.join(process.cwd(), "data", "dailyNews.json");

const loadJson = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const narratives = loadJson(narrativesPath);
const matches = loadJson(matchesPath);

if (!Array.isArray(narratives) || !Array.isArray(matches)) {
  console.error(
    "Missing or invalid input. Expected narratives.json and matching_articles.json in project root."
  );
  process.exit(1);
}

const extractHandles = (texts = []) => {
  const handles = new Set();
  for (const text of texts) {
    const matches = String(text).match(/@[\w_]+/g) || [];
    matches.forEach((h) => handles.add(h));
  }
  return Array.from(handles).slice(0, 3);
};

const results = [];
const seen = new Set();

for (const match of matches) {
  if (results.length >= 3) break;
  const narrative = match?.narrative || "";
  const url = match?.url || "";
  if (!url || seen.has(url)) continue;

  const signal = narratives.find((n) => n.narrative === narrative);
  const supportingSignals = extractHandles(signal?.examplePosts || []);

  results.push({
    source: String(match?.source || "").toUpperCase(),
    title: match?.title || "Untitled",
    url,
    narrative,
    supportingSignals,
  });
  seen.add(url);
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(results.slice(0, 3), null, 2), "utf-8");
console.log(`Saved ${results.length} stories to ${outputPath}`);
