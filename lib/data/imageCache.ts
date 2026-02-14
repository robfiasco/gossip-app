import fs from "fs";
import path from "path";

const CACHE_PATH = path.join(process.cwd(), "data", "imageCache.json");
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
  storyUrl: string;
  imageUrl: string | null;
  imageSource: string | null;
  cachedAt: string;
};

type ImageCache = {
  entries: CacheEntry[];
};

const readCache = (): ImageCache => {
  try {
    if (!fs.existsSync(CACHE_PATH)) {
      return { entries: [] };
    }
    const raw = fs.readFileSync(CACHE_PATH, "utf-8");
    return JSON.parse(raw) as ImageCache;
  } catch {
    return { entries: [] };
  }
};

const writeCache = (cache: ImageCache) => {
  const dir = path.dirname(CACHE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
};

export const getCachedImage = (storyUrl: string) => {
  const cache = readCache();
  const entry = cache.entries.find((item) => item.storyUrl === storyUrl);
  if (!entry) return null;
  const age = Date.now() - new Date(entry.cachedAt).getTime();
  if (age > CACHE_TTL_MS) return null;
  return entry;
};

export const setCachedImage = (entry: CacheEntry) => {
  const cache = readCache();
  const next = cache.entries.filter((item) => item.storyUrl !== entry.storyUrl);
  next.push(entry);
  cache.entries = next;
  writeCache(cache);
};
