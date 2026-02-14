export type SignalBoardPayload = {
  date?: string | null;
  generated_at_utc?: string | null;
  showPastWeek?: boolean;
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

const safeFetch = async <T>(url: string, fallback: T): Promise<T> => {
  try {
    const res = await fetch(url, { cache: "no-store" });
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

export const loadDailyData = async () => {
  const generatedNow = new Date().toISOString();

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

  const [signalBoard, briefing, newsCards, narratives, marketContext] = await Promise.all([
    safeFetchMany<SignalBoardPayload>(
      ["/data/signal_board.json", "/signal_board.json"],
      fallbackSignalBoard
    ),
    safeFetchMany<BriefingPayload>(
      ["/data/briefing.json", "/briefing.json"],
      fallbackBriefing
    ),
    safeFetchMany<NewsCardsPayload | NewsCard[]>(
      ["/data/validator_stories.json", "/data/news_cards.json", "/news_cards.json"],
      fallbackNews
    ),
    safeFetchMany<NarrativesPayload>(
      ["/narratives.json", "/data/narratives.json"],
      {}
    ),
    safeFetchMany<MarketContextPayload>(
      ["/api/market-context", "/data/market_context.json", "/market_context.json"],
      fallbackMarketContext
    ),
  ]);

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
