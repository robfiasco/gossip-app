export type DailyStory = {
  id: string;
  rank: number;
  title: string;
  url: string;
  source: string;
  category?: string | null;
  excerpt?: string | null;
  author?: string | null;
  image?: string | null;
  publishedAt?: string | null;
  whyItMatters?: string | null;
  tags?: string[];
};

export type DailyStoriesPayload = {
  generatedAt?: string;
  source?: string;
  stories: DailyStory[];
};

let cache: DailyStoriesPayload | null = null;

const slugify = (input: string) =>
  input
    .toLowerCase()
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);

const fallbackStories: DailyStory[] = [
  {
    id: "sol-week-move",
    rank: 1,
    title: "SOL Week: -14% move — what drove it",
    url: "https://solanafloor.com/news",
    source: "SolanaFloor",
    category: "Markets",
    excerpt: null,
    publishedAt: null,
    whyItMatters: "Positioning looks washed out; watch for a clean reclaim.",
    tags: ["Market Structure"],
  },
  {
    id: "stable-yield-watch",
    rank: 2,
    title: "Stable Yield Watch: top Solana pools",
    url: "https://solanafloor.com/news",
    source: "DefiLlama",
    category: "DeFi",
    excerpt: null,
    publishedAt: null,
    whyItMatters: "Yield is where attention goes when spot is weak.",
    tags: ["DeFi", "Yield"],
  },
  {
    id: "validator-economics",
    rank: 3,
    title: "Validator economics: fee mix + staking flows",
    url: "https://solanafloor.com/news",
    source: "Solana",
    category: "Validators",
    excerpt: null,
    publishedAt: null,
    whyItMatters: "Staking shifts can quietly move the whole curve.",
    tags: ["Staking"],
  },
];

export const fetchDailyStories = async (): Promise<DailyStoriesPayload> => {
  if (cache?.stories?.length) return cache;
  try {
    const res = await fetch("/daily-stories.json", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch daily stories");
    const json = (await res.json()) as DailyStoriesPayload;
    const stories = (json.stories ?? []).map((story) => ({
      ...story,
      id: story.id || slugify(story.url || story.title),
    }));
    cache = { ...json, stories };
    return cache;
  } catch (err) {
    cache = { generatedAt: new Date().toISOString(), source: "fallback", stories: fallbackStories };
    return cache;
  }
};
