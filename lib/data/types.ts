export type TerminalData = {
  sol: {
    priceUsd: number | null;
    change24hPct: number | null;
    change7dPct: number | null;
  };
  marketCap: {
    totalUsd: number | null;
    change24hPct: number | null;
    change7dPct: number | null;
  };
  fearGreed: {
    value: number | null;
    classification: string | null;
  };
  btcDominance: {
    valuePct: number | null;
  };
  volume: {
    change24hPct: number | null;
  };
  signalBoard: {
    aiRead: string;
    topSignal: { title: string; url: string } | null;
    trendingNow: string[];
    marketDrivers: string[];
    marketContext: string[];
  };
  stories: Array<{
    id: string;
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    tags: string[];
    signalTags: string[];
    badge?: "HIGH SIGNAL" | "NEW" | "EXPLAINS DROP";
    summary: string;
    imageUrl: string | null;
    imageSource: string | null;

    // key trader intel
    degenImpact?: string | null;
    marketReaction?: string | null;
    tradeSignal?: "BULLISH" | "BEARISH" | "NEUTRAL" | "IGNORE";
    ctSentiment?: string;

    // deprecated but kept for compatibility during migration
    whyItMatters?: string | null;
    whatToWatch?: string;

    relatedTokens?: string[];
    quote: string | null;
    xMentions: number | null;
    mentions: Array<{ label: string; url: string }>;
    mentionedBy?: Array<{ handle: string; tweetUrl?: string; summary?: string; one_line_take?: string; url?: string; }>;
    who_is_talking?: Array<{ handle: string; tweet_id?: string; tweetUrl?: string; linkToTweet?: string; url?: string; summary?: string; one_line_take?: string }>;
    entities?: string[];
    score?: number;
  }>;
};
