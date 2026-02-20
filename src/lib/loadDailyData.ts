export type SignalBoardPayload = {
  date?: string | null;
  generated_at_utc?: string | null;
  showPastWeek?: boolean;
  showNextWeek?: boolean;
  priceUpdate?: string;
  pastWeek?: string;
  thisWeek?: string;
  nextWeek?: string;
  whatsHot?: string;
  readMore?: Array<{
    title?: string;
    source?: string;
    url?: string;
  }>;
  aiRead?: string;
  sentiment?: string;
  narrativeShifts?: string;
  liquidityDirection?: string;
  ecosystem?: string;
};

export type NarrativeEvidence = {
  handle?: string;
  link?: string;
  tweetUrl?: string;
};

export type NarrativePastWeekItem = {
  title?: string;
  "tl;dr"?: string;
  tlDr?: string;
  whyItMatters?: string;
  evidence?: NarrativeEvidence[];
};

export type NarrativeThisWeekItem = {
  title?: string;
  whatToWatch?: string;
  bullCase?: string;
  bearCase?: string;
  evidence?: NarrativeEvidence[];
};

export type NarrativeHotItem = {
  title?: string;
  "tl;dr"?: string;
  tlDr?: string;
  whyItMatters?: string;
  noviceExplainer?: string;
  evidence?: NarrativeEvidence[];
};

export type NarrativesPayload = {
  asOfUtc?: string;
  generatedAt?: string;
  generated_at?: string;
  pastWeek?: {
    headline?: string;
    bullets?: NarrativePastWeekItem[];
  };
  thisWeek?: {
    headline?: string;
    watchlist?: NarrativeThisWeekItem[];
  };
  whatsHot?: NarrativeHotItem[];
};

export type BriefingItem = {
  title: string;
  type: "BIG STORY" | "ECOSYSTEM" | "WATCH" | "STAT";
  category?: string;
  source?: string;
  date?: string;
  url?: string;
  whyYouShouldCare?: string;
};

export type BriefingPayload = {
  date?: string | null;
  title?: string;
  subtitle?: string;
  items?: BriefingItem[];
};

export type MarketContextPayload = {
  as_of_utc?: string;
  sol?: {
    price?: number | null;
    change_24h?: number | null;
    change_7d?: number | null;
  };
  mkt_cap?: {
    solana_mkt_cap_usd?: number | null;
    change_24h?: number | null;
  };
  fear_greed?: {
    value?: number | null;
    label?: string | null;
  };
  btc_dominance?: {
    value?: number | null;
  };
  vol?: {
    sol_24h_usd?: number | null;
  };
};

export type NewsCard = {
  title: string;
  source: string;
  url: string;
  category?: string;
  timestamp?: string | null;
  publishedAt?: string | null;
  hook?: string;
  narrative?: string;
  story?: string;
  marketStructure?: string;
  smartMoney?: string;
  positioning?: string;
  whyItMatters?: string;
  watchlist?: string;
  takeaways?: string[];
  content?: {
    signal?: string;
    story?: string;
  };
  whoToFollow?: Array<{
    handle: string;
    reason?: string;
    role?: string;
    engagement?: number | null;
  }>;
  stats?: {
    total_tweets?: number | null;
    total_engagement?: number | null;
    top_engagement?: number | null;
    unique_users?: number | null;
  };
  metrics?: {
    tweets?: number | null;
    engagement?: number | null;
    voices?: number | null;
    topTweet?: number | null;
  };
  citations?: Array<{ handle: string; link: string }>;

  ctPulse?: Array<{
    handle: string;
    thought: string;
    url?: string | null;
  }>;
  deepAnalysis?: {
    ecosystemImpact?: string;
    liquidityImplications?: string;
    winners?: string[];
    losers?: string[];
    timeline?: string;
  };
  smartMoneyWatching?: string[];
  bullCase?: string;
  bearCase?: string;
  positioningTake?: string;
  sections?: {
    theHook?: string;
    whatsActuallyHappening?: string[];
    whyDegensCare?: string[];
    whatToWatchNext?: string[];
    ctReceipts?: Array<{ handle: string; quote: string; tweetUrl: string }>;
  };
  traderTake?: string;
  whatToWatch?: string[] | string; // Support both array (new) and string (legacy)

  // Legacy fields kept for minimal UI breakage until full migration
  degenImpact?: string | null;
  marketReaction?: string | null;
  tradeSignal?: "BULLISH" | "BEARISH" | "NEUTRAL" | "IGNORE";
  ctSentiment?: string;
  summary?: string;
  who_is_talking?: Array<{ handle: string; summary: string; tweetUrl: string }>;
  mentionedBy?: Array<{ handle: string; url: string }>;
};

export type NewsCardsPayload = {
  date?: string | null;
  items?: NewsCard[];
};

const getBaseUrl = () => {
  if (typeof window !== "undefined") return ""; // browser
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
};

const safeFetch = async <T>(url: string, fallback: T): Promise<T> => {
  try {
    const fullUrl = url.startsWith("/") ? `${getBaseUrl()}${url}` : url;
    const res = await fetch(fullUrl, { cache: "no-store", next: { revalidate: 0 } });
    if (!res.ok) return fallback;
    return (await res.json()) as T;
  } catch {
    return fallback;
  }
};

const safeFetchMany = async <T>(urls: string[], fallback: T): Promise<T> => {
  for (const url of urls) {
    const value = await safeFetch<T | null>(url, null);
    if (value && (typeof value !== "object" || Object.keys(value as object).length > 0)) {
      return value as T;
    }
  }
  return fallback;
};

const hasUsableMarketValue = (payload: MarketContextPayload | null | undefined) => {
  if (!payload || typeof payload !== "object") return false;
  const solPrice = Number(payload?.sol?.price);
  const sol24h = Number(payload?.sol?.change_24h);
  const mktCap = Number(payload?.mkt_cap?.solana_mkt_cap_usd);
  return Number.isFinite(solPrice) || Number.isFinite(sol24h) || Number.isFinite(mktCap);
};

const loadMarketContext = async (fallback: MarketContextPayload): Promise<MarketContextPayload> => {
  // Prefer static files first to avoid API route cwd/path issues returning null fallback payloads.
  const urls = ["/data/market_context.json", "/market_context.json", "/api/market-context"];
  for (const url of urls) {
    const value = await safeFetch<MarketContextPayload | null>(url, null);
    if (hasUsableMarketValue(value)) {
      return value as MarketContextPayload;
    }
  }
  return fallback;
};

import { createClient } from "@vercel/kv";

// Initialize KV client - safe to call even if env vars are missing (methods will just fail/throw)
const getKv = () => {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn("⚠️ KV_REST_API_URL or KV_REST_API_TOKEN is missing. KV fetch will be skipped.");
    return null;
  }

  try {
    return createClient({ url, token });
  } catch (err) {
    console.warn("Failed to initialize KV client", err);
    return null;
  }
};

export const loadDailyData = async () => {
  const generatedNow = new Date().toISOString();
  const kv = getKv();

  const fallbackSignalBoard: SignalBoardPayload = {
    generated_at_utc: generatedNow,
    date: generatedNow.slice(0, 10),
    showPastWeek: true,
    priceUpdate: "Price check: waiting on refreshed market context.",
    aiRead: "Market is mixed with no clear direction.",
    sentiment: "Neutral",
    narrativeShifts: "Focus shifting to infrastructure.",
    liquidityDirection: "Stable.",
    ecosystem: "Solana activity remains high.",
  };

  const fallbackBriefing: BriefingPayload = {
    date: generatedNow.slice(0, 10),
    items: [],
  };

  const fallbackNews: NewsCardsPayload = {
    date: generatedNow.slice(0, 10),
    items: [],
  };

  const fallbackMarketContext: MarketContextPayload = {
    as_of_utc: generatedNow,
    sol: { price: null, change_24h: null, change_7d: null },
    mkt_cap: { solana_mkt_cap_usd: null, change_24h: null },
    fear_greed: { value: null, label: "n/a" },
    btc_dominance: { value: null },
    vol: { sol_24h_usd: null },
  };

  // Try loading from KV first
  let kvSignalBoard: SignalBoardPayload | null = null;
  let kvBriefing: BriefingPayload | null = null;
  let kvNews: NewsCardsPayload | null = null;
  let kvNarratives: NarrativesPayload | null = null;
  let kvMarketContext: MarketContextPayload | null = null;

  if (kv) {
    try {
      console.log("Fetching config from Vercel KV...");
      [kvSignalBoard, kvBriefing, kvNews, kvNarratives, kvMarketContext] = await Promise.all([
        kv.get<SignalBoardPayload>("validator:signal_board"),
        kv.get<BriefingPayload>("validator:briefing"),
        kv.get<NewsCardsPayload>("validator:stories"),
        kv.get<NarrativesPayload>("validator:narratives"),
        kv.get<MarketContextPayload>("validator:market_context"),
      ]);
      console.log("KV Fetch Result:", {
        signalBoard: !!kvSignalBoard,
        briefing: !!kvBriefing,
        newsCards: !!kvNews,
        narratives: !!kvNarratives,
        marketContext: !!kvMarketContext
      });
    } catch (e: any) {
      console.error("Failed to fetch from Vercel KV, falling back to static files:", e.message || String(e));
    }
  }

  // If KV missed anything, fetch from static files
  const [staticSignalBoard, staticBriefing, staticNewsCards, staticNarratives, staticMarketContext] = await Promise.all([
    !kvSignalBoard ? safeFetchMany<SignalBoardPayload>(
      ["/data/signal_board.json", "/signal_board.json"],
      fallbackSignalBoard
    ) : null,
    !kvBriefing ? safeFetchMany<BriefingPayload>(
      ["/data/briefing.json", "/briefing.json"],
      fallbackBriefing
    ) : null,
    !kvNews ? safeFetchMany<NewsCardsPayload | NewsCard[]>(
      ["/data/validator_stories.json", "/data/news_cards.json", "/news_cards.json"],
      fallbackNews
    ) : null,
    !kvNarratives ? safeFetchMany<NarrativesPayload>(
      ["/narratives.json", "/data/narratives.json"],
      {}
    ) : null,
    !kvMarketContext ? loadMarketContext(fallbackMarketContext) : null,
  ]);

  const signalBoard = kvSignalBoard || staticSignalBoard || fallbackSignalBoard;
  const briefing = kvBriefing || staticBriefing || fallbackBriefing;
  const newsCards = kvNews || staticNewsCards || fallbackNews;
  const narratives = kvNarratives || staticNarratives || {};
  const marketContext = kvMarketContext || staticMarketContext || fallbackMarketContext;

  const normalizedNews = Array.isArray(newsCards) ? { items: newsCards } : newsCards;

  // Resolution logic to ensure defaults
  const resolvedSignalBoard = {
    ...fallbackSignalBoard,
    ...(signalBoard || {})
  };

  const resolvedBriefing = {
    ...fallbackBriefing,
    ...(briefing || {}),
    items: Array.isArray(briefing?.items) ? briefing.items : fallbackBriefing.items
  };

  const resolvedNews = {
    ...fallbackNews,
    ...(normalizedNews || {}),
    items: Array.isArray(normalizedNews?.items) ? normalizedNews.items : fallbackNews.items
  };

  return {
    signalBoard: resolvedSignalBoard,
    briefing: resolvedBriefing,
    newsCards: resolvedNews,
    narratives,
    marketContext: { ...fallbackMarketContext, ...(marketContext || {}) },
  };
};

