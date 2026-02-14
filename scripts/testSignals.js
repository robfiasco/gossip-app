import fs from "fs";
import path from "path";

const filePath = path.join(process.cwd(), "signals_raw.json");

console.log("CWD:", process.cwd());
console.log("Looking for:", filePath);

try {
  console.log("Exists?", fs.existsSync(filePath));

  // If it doesn't exist, list the files in the cwd to spot naming/placement issues
  if (!fs.existsSync(filePath)) {
    console.log("Files in CWD:", fs.readdirSync(process.cwd()).slice(0, 50));
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, "utf-8");

  console.log("Bytes:", Buffer.byteLength(raw, "utf-8"));
  console.log("First 200 chars:\n", raw.slice(0, 200));
  console.log("Last 200 chars:\n", raw.slice(-200));

  let data;
  try {
    data = JSON.parse(raw);
  } catch (parseErr) {
    console.error("JSON PARSE ERROR:", parseErr.message);
    process.exit(1);
  }

  const posts = Array.isArray(data?.posts)
    ? data.posts
    : Array.isArray(data)
    ? data
    : [];

  console.log(`Total posts: ${posts.length}`);
  console.log("First post:", posts[0] ?? null);
} catch (err) {
  console.error("READ/FS ERROR:", err?.message || err);
}
