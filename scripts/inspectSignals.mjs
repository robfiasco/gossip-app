import fs from "fs";
import path from "path";

const cwd = process.cwd();
const primaryPath = path.join(cwd, "signals_raw.json");
const fallbackPath = path.join(cwd, "signals_raw_2026-02-09.json");
const importPath = path.join(cwd, "signals_import.json");
const latestSignalsFile = () => {
  const entries = fs.readdirSync(cwd);
  const dated = entries
    .filter((name) => /^signals_raw_\d{4}-\d{2}-\d{2}\.json$/.test(name))
    .map((name) => ({
      name,
      full: path.join(cwd, name),
      mtime: fs.statSync(path.join(cwd, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  if (dated.length) return dated[0].full;
  return fs.existsSync(primaryPath) ? primaryPath : fallbackPath;
};

const extractPosts = (data) => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.posts)) return data.posts;
  if (Array.isArray(data?.tweets)) return data.tweets;
  return [];
};

const readJson = (filePath) => {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    const posts = extractPosts(data);
    if (!Array.isArray(posts)) {
      throw new Error("No posts array found (expected posts/tweets/array)");
    }
    return posts;
  } catch (err) {
    throw new Error(
      `Failed to read/parse ${path.basename(filePath)}: ${err.message}`
    );
  }
};

const parseTimestamp = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const summarize = (posts) => {
  const total = posts.length;
  const handleCounts = new Map();
  let newest = null;
  let oldest = null;
  let timestampMissing = 0;

  for (const post of posts) {
    const handle = post?.handle || post?.author || "unknown";
    handleCounts.set(handle, (handleCounts.get(handle) || 0) + 1);
    const ts = parseTimestamp(post?.timestamp);
    if (!post?.timestamp) timestampMissing += 1;
    if (ts) {
      if (!newest || ts > newest) newest = ts;
      if (!oldest || ts < oldest) oldest = ts;
    }
  }

  const sortedHandles = Array.from(handleCounts.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  const sample = posts.slice(0, 3).map((post) => ({
    handle: post?.handle || post?.author || "unknown",
    timestamp: post?.timestamp || null,
    textPreview: String(post?.text || "").slice(0, 120),
  }));

  console.log(`Total posts: ${total}`);
  console.log(`Unique handles: ${handleCounts.size}`);
  console.log(
    "Top handles:",
    sortedHandles.slice(0, 5).map(([h, c]) => `${h}(${c})`).join(", ")
  );
  console.log("Newest timestamp:", newest ? newest.toISOString() : "n/a");
  console.log("Oldest timestamp:", oldest ? oldest.toISOString() : "n/a");
  if (timestampMissing === total) {
    console.warn("Warning: all timestamps are null/missing.");
  } else if (timestampMissing > 0) {
    console.warn(`Warning: ${timestampMissing} posts missing timestamps.`);
  }
  console.log("Sample posts:", sample);
};

const mergeIfPresent = () => {
  if (!fs.existsSync(primaryPath) || !fs.existsSync(importPath)) return;

  const primary = readJson(primaryPath);
  const imported = readJson(importPath);
  const merged = [...primary, ...imported];

  const seen = new Set();
  const deduped = [];

  for (const post of merged) {
    const key = post?.permalink || post?.url || null;
    if (!key) {
      deduped.push(post);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(post);
  }

  deduped.sort((a, b) => {
    const ta = parseTimestamp(a?.timestamp)?.getTime() || 0;
    const tb = parseTimestamp(b?.timestamp)?.getTime() || 0;
    return tb - ta;
  });

  fs.writeFileSync(primaryPath, JSON.stringify(deduped, null, 2), "utf-8");
  console.log(
    `Merged ${primary.length} + ${imported.length} -> ${deduped.length} into signals_raw.json`
  );
};

try {
  mergeIfPresent();
  const fileToRead = latestSignalsFile();
  if (!fs.existsSync(fileToRead)) {
    console.error("No signals file found (signals_raw.json or fallback).");
    process.exit(1);
  }
  console.log("Using signals file:", path.basename(fileToRead));
  const posts = readJson(fileToRead);
  summarize(posts);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
