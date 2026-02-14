import fs from "fs";
import path from "path";

type StoryStore = {
  seen: Array<{ url: string; seenAt: string }>;
};

const STORE_PATH = path.join(process.cwd(), "data", "seenStories.json");
const MAX_DAYS = 3;

const readStore = (): StoryStore => {
  try {
    if (!fs.existsSync(STORE_PATH)) {
      return { seen: [] };
    }
    const raw = fs.readFileSync(STORE_PATH, "utf-8");
    return JSON.parse(raw) as StoryStore;
  } catch {
    return { seen: [] };
  }
};

const writeStore = (store: StoryStore) => {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
};

export const filterRecentStories = (urls: string[]) => {
  const store = readStore();
  const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000;
  const recent = new Set(
    store.seen
      .filter((entry) => new Date(entry.seenAt).getTime() > cutoff)
      .map((entry) => entry.url)
  );
  return urls.filter((url) => !recent.has(url));
};

export const markStoriesSeen = (urls: string[]) => {
  const store = readStore();
  const now = new Date().toISOString();
  const existing = new Set(store.seen.map((entry) => entry.url));
  const updated = [
    ...store.seen.filter((entry) => existing.has(entry.url)),
    ...urls.filter((url) => !existing.has(url)).map((url) => ({ url, seenAt: now })),
  ];
  store.seen = updated;
  writeStore(store);
};
