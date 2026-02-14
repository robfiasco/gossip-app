import { fetchRss } from "./rss";
import { getStoryImage } from "./imageFetcher";
import { filterRecentStories, markStoriesSeen } from "./storyStore";
import type { TerminalData } from "./types";

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { data: TerminalData; fetchedAt: number } | null = null;

const toNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const formatClassification = (value: number) => {
  if (value <= 24) return "FEAR";
  if (value <= 49) return "NEUTRAL";
  if (value <= 74) return "GREED";
  return "EXTREME GREED";
};

const slugify = (input: string) =>
  input
    .toLowerCase()
    .replace(/https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);

const fetchSolData = async () => {
  const url =
    "https://api.coingecko.com/api/v3/coins/solana?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false";
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) {
    throw new Error("CoinGecko SOL fetch failed");
  }
  const json = (await res.json()) as {
    market_data?: {
      current_price?: { usd?: number };
      price_change_percentage_24h?: number;
      price_change_percentage_7d?: number;
    };
  };
  const data = json.market_data;
  return {
    priceUsd: toNumber(data?.current_price?.usd),
    change24hPct: toNumber(data?.price_change_percentage_24h),
    change7dPct: toNumber(data?.price_change_percentage_7d),
  };
};

const fetchGlobalData = async () => {
  const url = "https://api.coingecko.com/api/v3/global";
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) {
    throw new Error("CoinGecko global fetch failed");
  }
  const json = (await res.json()) as {
    data?: {
      total_market_cap?: { usd?: number };
      market_cap_change_percentage_24h_usd?: number;
      market_cap_percentage?: { btc?: number };
      total_volume?: { usd?: number };
    };
  };
  return {
    totalUsd: toNumber(json.data?.total_market_cap?.usd),
    change24hPct: toNumber(json.data?.market_cap_change_percentage_24h_usd),
    change7dPct: null,
    btcDominance: toNumber(json.data?.market_cap_percentage?.btc),
  };
};

const fetchFearGreed = async () => {
  const res = await fetch("https://api.alternative.me/fng/?limit=1&format=json", {
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error("Fear & Greed fetch failed");
  }
  const json = (await res.json()) as {
    data?: { value: string; value_classification: string }[];
  };
  const entry = json.data?.[0];
  const score = toNumber(entry?.value);
  return {
    value: score,
    classification: score === null ? null : formatClassification(score),
  };
};

const fetchStableYields = async () => {
  try {
    // Payload ~17MB, skip cache
    const res = await fetch("https://yields.llama.fi/pools", {
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("DefiLlama yields fetch failed", res.status);
      return [];
    }
    const json = (await res.json()) as {
      data?: Array<{
        chain?: string;
        project?: string;
        symbol?: string;
        apyBase?: number;
        apy?: number;
        tvlUsd?: number;
        pool?: string;
      }>;
    };

    const pools = (json.data ?? []);
    console.log(`[Yields] Fetched ${pools.length} pools. Filtering...`);

    const majors = new Set([
      "Kamino",
      "Marginfi",
      "Drift",
      "Solend",
      "Meteora",
    ]);
    const stableSymbols = ["USDC", "USDT", "USDS", "USDH", "USDY", "PYUSD"];

    const filtered = pools.filter((pool) => {
      if (!pool.chain || pool.chain.toLowerCase() !== "solana") return false;
      if (!pool.symbol) return false;
      const symbol = pool.symbol.toUpperCase();
      if (!stableSymbols.some((stable) => symbol.includes(stable))) return false;
      if (pool.tvlUsd && pool.tvlUsd >= 10_000_000) return true;
      if (pool.project && majors.has(pool.project)) return true;
      return false;
    });

    console.log(`[Yields] Reduced to ${filtered.length} Solana stable pools.`);

    const sorted = filtered
      .map((pool) => ({
        protocol: pool.project ?? "Unknown",
        name: pool.pool ?? pool.symbol ?? "Solana stable pool",
        apy: pool.apyBase ?? pool.apy ?? null,
        tvl: pool.tvlUsd ?? null,
      }))
      .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));

    return sorted.slice(0, 3);
  } catch (err) {
    console.error("fetchStableYields error:", err);
    return [];
  }
};

const solanaKeywords = [
  "solana",
  "sol",
  "spl",
  "sealevel",
  "firedancer",
  "anza",
  "jito",
  "mev",
  "restaking",
  "validator",
  "staking",
  "helius",
  "triton",
  "quicknode",
  "alchemy",
  "jupiter",
  "jup",
  "raydium",
  "orca",
  "meteora",
  "kamino",
  "marginfi",
  "drift",
  "marinade",
  "tensor",
  "magic eden",
  "pyth",
  "wormhole",
  "backpack",
  "dialect",
  "solana mobile",
  "seeker",
  "saga",
  "seed vault",
  "mwa",
];

const sourceWhitelist = [
  "SolanaFloor",
  "Solana Foundation",
  "Solana",
  "Anza",
  "Jito",
  "Helius",
  "Kamino",
  "Drift",
  "Jupiter",
  "Tensor",
  "Magic Eden",
  "Meteora",
  "Marginfi",
  "Blockworks",
  "CoinDesk",
  "The Block",
  "Decrypt",
];

const excludeIfNotSolana = (title: string) => {
  const lowered = title.toLowerCase();
  const hasSolana =
    lowered.includes("solana") ||
    /\bsol\b/.test(lowered) ||
    solanaKeywords.some((word) => lowered.includes(word));
  const macro =
    lowered.includes("ethereum") ||
    /\beth\b/.test(lowered) ||
    lowered.includes("bitcoin") ||
    /\bbtc\b/.test(lowered);
  return macro && !hasSolana;
};

const filterTitle = (title: string, description: string) => {
  const lowered = `${title} ${description}`.toLowerCase();
  const blocked = [
    "memecoin",
    "meme coin",
    "pump",
    "wif",
    "bonk",
    "airdrop.*meme",
    "giveaway",
    "degenerate",
    "degen",
  ];
  if (blocked.some((word) => new RegExp(word).test(lowered))) return false;
  if (lowered.includes("airdrop") && !lowered.includes("jito")) return false;
  if (excludeIfNotSolana(title)) return false;
  return true;
};

const scoreStorySolanaRelevance = (story: {
  title: string;
  source: string;
  description: string;
}) => {
  const lowered = `${story.title} ${story.description}`.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  if (lowered.includes("solana") || /\bsol\b/.test(lowered) || lowered.includes("spl")) {
    score += 3;
    reasons.push("solana");
  }
  for (const keyword of solanaKeywords) {
    if (lowered.includes(keyword)) {
      score += 2;
      reasons.push(keyword);
      break;
    }
  }
  if (sourceWhitelist.some((source) => story.source.includes(source))) {
    score += 2;
    reasons.push("source");
  }
  if (lowered.includes("validator") || lowered.includes("staking") || lowered.includes("restaking")) {
    score += 2;
    reasons.push("validator");
  }
  if (
    lowered.includes("launch") ||
    lowered.includes("released") ||
    lowered.includes("integration") ||
    lowered.includes("rolls out") ||
    lowered.includes("mainnet") ||
    lowered.includes("beta")
  ) {
    score += 1;
    reasons.push("launch");
  }
  return { score, reasons };
};

const deriveTags = (title: string) => {
  const lowered = title.toLowerCase();
  const tags: string[] = [];
  if (lowered.includes("validator") || lowered.includes("staking") || lowered.includes("restaking")) {
    tags.push("STAKING");
  }
  if (lowered.includes("defi") || lowered.includes("liquidity") || lowered.includes("tvl")) {
    tags.push("DEFI");
  }
  if (lowered.includes("client") || lowered.includes("firedancer") || lowered.includes("infra")) {
    tags.push("INFRA");
  }
  if (lowered.includes("wallet") || lowered.includes("mobile") || lowered.includes("seeker")) {
    tags.push("MOBILE");
  }
  if (
    lowered.includes("launch") ||
    lowered.includes("released") ||
    lowered.includes("integration") ||
    lowered.includes("rolls out") ||
    lowered.includes("mainnet") ||
    lowered.includes("beta")
  ) {
    tags.push("LAUNCH");
  }
  return tags;
};

const extractSummary = (text: string) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.slice(0, 160);
};

const extractQuote = (text: string) => {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  return sentence.slice(0, 140);
};

const buildMentions = (title: string, source: string) => {
  const items: Array<{ label: string; url: string }> = [];
  const handleMap: Record<string, string> = {
    SolanaFloor: "https://x.com/SolanaFloor",
    "Solana Foundation": "https://x.com/solana",
    Helius: "https://x.com/heliuslabs",
    Jito: "https://x.com/jito_labs",
    Blockworks: "https://x.com/Blockworks_",
    CoinDesk: "https://x.com/CoinDesk",
    "The Block": "https://x.com/TheBlock__",
    Decrypt: "https://x.com/decryptmedia",
    "Solana Mobile": "https://x.com/solanamobile",
    DefiLlama: "https://x.com/DefiLlama",
  };
  if (handleMap[source]) {
    items.push({ label: `X: ${source}`, url: handleMap[source] });
  }
  items.push({
    label: "X: search",
    url: `https://x.com/search?q=${encodeURIComponent(title)}&src=typed_query`,
  });
  return items;
};

const buildSignalTags = (title: string, source: string) => {
  const lowered = title.toLowerCase();
  const tags: string[] = [];
  const pushTag = (tag: string) => {
    if (!tags.includes(tag)) tags.push(tag);
  };
  if (source.toLowerCase().includes("defillama") || lowered.includes("apy") || lowered.includes("yield")) {
    pushTag("YIELD");
    if (lowered.includes("stable") || lowered.includes("usdc")) pushTag("STABLES");
  }
  if (lowered.includes("validator") || lowered.includes("delegation") || lowered.includes("restaking")) {
    pushTag("STAKING");
  }
  if (lowered.includes("inflow") || lowered.includes("outflow") || lowered.includes("cex") || lowered.includes("whale") || lowered.includes("wallet")) {
    pushTag("SMART MONEY");
  }
  if (lowered.includes("helius") || lowered.includes("rpc") || lowered.includes("client") || lowered.includes("upgrade") || lowered.includes("firedancer")) {
    pushTag("INFRA");
  }
  if (lowered.includes("tokenization") || lowered.includes("wisdomtree") || lowered.includes("rwa")) {
    pushTag("RWA");
  }
  if (lowered.includes("funding") || lowered.includes("open interest") || lowered.includes("liquidation")) {
    pushTag("DERIVATIVES");
    pushTag("RISK");
  }
  if (lowered.includes("mobile") || lowered.includes("consumer")) {
    pushTag("CONSUMER");
  }
  return tags.slice(0, 2);
};

const isHighSignal = (title: string) => {
  const lowered = title.toLowerCase();
  return (
    lowered.includes("yield") ||
    lowered.includes("apy") ||
    lowered.includes("restaking") ||
    lowered.includes("staking") ||
    lowered.includes("validator") ||
    lowered.includes("integration") ||
    lowered.includes("launch") ||
    lowered.includes("mainnet") ||
    lowered.includes("tvl") ||
    lowered.includes("liquidity") ||
    lowered.includes("inflow") ||
    lowered.includes("outflow")
  );
};

const buildBadge = (story: { title: string; source: string; signalTags: string[] }, isTop: boolean) => {
  const lowered = story.title.toLowerCase();
  if (isTop) return "HIGH SIGNAL";
  if (lowered.includes("launch") || lowered.includes("integration") || lowered.includes("released")) return "NEW";
  if (lowered.includes("drawdown") || lowered.includes("selloff") || lowered.includes("drop")) return "EXPLAINS DROP";
  if (story.signalTags.includes("RISK") || story.signalTags.includes("DERIVATIVES")) return "EXPLAINS DROP";
  return undefined;
};

const buildWhyTradersCare = (title: string, tags: string[], summary: string) => {
  const lowered = title.toLowerCase();
  if (tags.includes("YIELD")) {
    return "Watch yield sustainability; signals where idle capital parks.";
  }
  if (tags.includes("STAKING")) {
    return "If staking shifts, validator economics and SOL demand follow.";
  }
  if (tags.includes("SMART MONEY")) {
    return "Most likely driver: large flows; watch for follow‑through.";
  }
  if (tags.includes("INFRA")) {
    return "Infra upgrades can unlock throughput; watch validator adoption.";
  }
  if (tags.includes("RWA")) {
    return "RWA traction implies institutional flow potential.";
  }
  if (tags.includes("DERIVATIVES") || tags.includes("RISK")) {
    return "Positioning risk is elevated; watch funding and OI.";
  }
  if (tags.includes("CONSUMER")) {
    return "Consumer adoption signals demand outside trading loops.";
  }
  if (lowered.includes("liquidity") || lowered.includes("tvl")) {
    return "Liquidity shifts reveal where capital is rotating next.";
  }
  return summary
    ? `Most likely driver: ${summary.toLowerCase()}.`
    : "Most likely driver: shifting SOL positioning and liquidity.";
};

const deriveEntities = (title: string, summary: string) => {
  const candidates = [
    "Kamino",
    "Jupiter",
    "Jupiter Lend",
    "Meteora",
    "Jito",
    "Helius",
    "Drift",
    "Marginfi",
    "Orca",
    "Raydium",
    "Tensor",
    "Magic Eden",
    "Pyth",
    "Wormhole",
    "Solana Mobile",
    "Seeker",
    "Validator",
    "Restaking",
    "Stablecoin",
    "USDC",
    "TVL",
  ];
  const haystack = `${title} ${summary}`.toLowerCase();
  return candidates.filter((entity) => haystack.includes(entity.toLowerCase()));
};

const deriveWhyItMatters = (title: string, summary: string, tags: string[]) => {
  const lowered = title.toLowerCase();
  if (tags.includes("STAKING")) {
    return "Validator economics and staking flows are shifting.";
  }
  if (tags.includes("INFRA")) {
    return "Infra upgrades can change performance and reliability.";
  }
  if (tags.includes("DEFI")) {
    return "Liquidity shifts signal where capital is concentrating.";
  }
  if (tags.includes("LAUNCH")) {
    return "Launch momentum is a leading indicator of adoption.";
  }
  if (lowered.includes("stable") || lowered.includes("usdc")) {
    return "Stablecoin flows often lead Solana activity shifts.";
  }
  return summary ? summary.slice(0, 120) : "Solana signal to monitor.";
};

const fetchStories = async () => {
  const feeds = [
    { source: "Helius", url: "https://www.helius.dev/blog/rss.xml" },
    { source: "Jito", url: "https://www.jito.network/blog/rss.xml" },
    { source: "SolanaFloor", url: "https://solanafloor.com/rss" },
  ];
  const items: Array<TerminalData["stories"][number] & { score: number }> = [];
  for (const feed of feeds) {
    try {
      const rssItems = await fetchRss(feed.url);
      for (const item of rssItems) {
        if (!filterTitle(item.title, item.description)) continue;
        const relevance = scoreStorySolanaRelevance({
          title: item.title,
          source: feed.source,
          description: item.description,
        });
        if (relevance.score < 3) continue;
        const summary = extractSummary(item.description);
        const tags = deriveTags(item.title);
        const signalTags = buildSignalTags(item.title, feed.source);
        const whyTradersCare = buildWhyTradersCare(item.title, signalTags, summary);
        items.push({
          id: slugify(item.link),
          title: item.title,
          url: item.link,
          source: feed.source,
          publishedAt: item.pubDate || new Date().toISOString(),
          tags,
          signalTags,
          badge: undefined,
          summary,
          imageUrl: null,
          imageSource: null,
          quote: extractQuote(item.description),
          mentions: buildMentions(item.title, feed.source),
          whyItMatters: whyTradersCare,
          entities: deriveEntities(item.title, summary),
          xMentions: null,
          score: relevance.score,
        });
      }
    } catch {
      // ignore feed failures
    }
  }

  const normalizeTitle = (title: string) =>
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const uniqueByUrl = Array.from(new Map(items.map((item) => [item.url, item])).values());
  const seenTitles = new Set<string>();
  const unique = uniqueByUrl.filter((item) => {
    const norm = normalizeTitle(item.title);
    if (seenTitles.has(norm)) return false;
    seenTitles.add(norm);
    return true;
  });

  const filteredUrls = filterRecentStories(unique.map((item) => item.url));
  const filtered = unique.filter((item) => filteredUrls.includes(item.url));
  const selected = filtered
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    })
    .slice(0, 12)
    .map(({ score, ...rest }) => rest);

  const enriched = await Promise.all(
    selected.map(async (story) => {
      const image = await getStoryImage(story.url);
      return {
        ...story,
        imageUrl: image.imageUrl,
        imageSource: image.imageSource,
      };
    })
  );
  markStoriesSeen(selected.map((item) => item.url));
  return enriched;
};

const buildSignalBoard = (data: {
  sol: TerminalData["sol"];
  fearGreed: TerminalData["fearGreed"];
  stableYields: Array<{ protocol: string; apy: number | null }>;
  stories: TerminalData["stories"];
}) => {
  const solMove = data.sol.change24hPct ?? 0;
  const fgValue = data.fearGreed.value ?? 0;
  const fgLabel = data.fearGreed.classification ?? "NEUTRAL";
  const topYield = data.stableYields[0];
  const aiRead = `SOL ${solMove >= 0 ? "+" : ""}${solMove.toFixed(1)}% with ${fgLabel || "neutral"
    } ${fgValue || 0}; ${topYield?.apy
      ? `stables ${topYield.apy.toFixed(1)}%+ on ${topYield.protocol}`
      : "validator flow steady"
    }`.slice(0, 90);

  const scoreStory = (title: string) => {
    const lower = title.toLowerCase();
    let score = 0;
    if (lower.includes("validator") || lower.includes("restaking")) score += 3;
    if (lower.includes("upgrade") || lower.includes("client")) score += 3;
    if (lower.includes("launch") || lower.includes("partnership")) score += 2;
    if (lower.includes("tvl") || lower.includes("yield") || lower.includes("stable")) score += 1;
    return score;
  };

  const topSignalStory = [...data.stories].sort(
    (a, b) => scoreStory(b.title) - scoreStory(a.title)
  )[0];
  const topSignal = topSignalStory
    ? { title: topSignalStory.title, url: topSignalStory.url }
    : null;

  const trendingNow = data.stories.slice(0, 3).map((story) => story.title);
  const marketDrivers = [
    `SOL ${solMove >= 0 ? "bid" : "off"} with ${fgLabel} ${fgValue || 0}`,
    topYield?.apy
      ? `Stable yields ${topYield.apy.toFixed(1)}%+ on ${topYield.protocol}`
      : "Validator/staking signals steady",
  ].slice(0, 2);
  const marketContext = [
    data.stories[0] ? `Focus: ${data.stories[0].title}` : "Focus: infra + staking",
  ];

  return { aiRead, topSignal, trendingNow, marketDrivers, marketContext };
};

export const getTerminalData = async (): Promise<TerminalData> => {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const fallback: TerminalData = {
    sol: { priceUsd: null, change24hPct: null, change7dPct: null },
    marketCap: { totalUsd: null, change24hPct: null, change7dPct: null },
    fearGreed: { value: null, classification: null },
    btcDominance: { valuePct: null },
    volume: { change24hPct: null },
    signalBoard: {
      aiRead: "LOW EDGE",
      topSignal: null,
      trendingNow: [],
      marketDrivers: [],
      marketContext: [],
    },
    stories: [],
  };

  try {
    const [sol, global, fearGreed, stableYields, stories] = await Promise.all([
      fetchSolData().catch(() => fallback.sol),
      fetchGlobalData().catch(() => ({
        totalUsd: null,
        change24hPct: null,
        change7dPct: null,
        btcDominance: null,
      })),
      fetchFearGreed().catch(() => fallback.fearGreed),
      fetchStableYields().catch(() => []),
      fetchStories().catch(() => []),
    ]);

    let enrichedStories = [...stories];
    const change7d = sol.change7dPct ?? null;
    const withinHours = (story: TerminalData["stories"][number], hours: number) =>
      Date.now() - new Date(story.publishedAt).getTime() <= hours * 60 * 60 * 1000;
    const isLaunch = (story: TerminalData["stories"][number]) =>
      story.tags.includes("LAUNCH") ||
      story.title.toLowerCase().includes("launch") ||
      story.title.toLowerCase().includes("integration") ||
      story.title.toLowerCase().includes("mainnet") ||
      story.title.toLowerCase().includes("beta");
    const isMarketMover = (story: TerminalData["stories"][number]) =>
      story.title.toLowerCase().includes("market") ||
      story.title.toLowerCase().includes("price") ||
      story.title.toLowerCase().includes("drawdown") ||
      story.title.toLowerCase().includes("selloff");

    const fresh = enrichedStories.filter(
      (story) => withinHours(story, 48) || isLaunch(story) || isMarketMover(story) || isHighSignal(story.title)
    );
    if (fresh.length >= 5) {
      enrichedStories = fresh;
    } else {
      const fallback = enrichedStories.filter(
        (story) => withinHours(story, 48) || isHighSignal(story.title)
      );
      enrichedStories = fallback.length ? fallback : enrichedStories;
    }

    const withinDays = (story: TerminalData["stories"][number], days: number) =>
      Date.now() - new Date(story.publishedAt).getTime() <= days * 24 * 60 * 60 * 1000;
    enrichedStories = enrichedStories.filter((story) => withinDays(story, 2) || isHighSignal(story.title));

    const ensureLaunchStory = () => {
      const hasLaunch = enrichedStories.slice(0, 5).some((story) => story.tags.includes("LAUNCH"));
      if (hasLaunch) return;
      const launchStory = enrichedStories.find((story) => story.tags.includes("LAUNCH"));
      if (launchStory) {
        enrichedStories = [
          launchStory,
          ...enrichedStories.filter((story) => story.id !== launchStory.id),
        ];
      }
    };

    const ensureMarketMoveStory = () => {
      if (change7d === null || Math.abs(change7d) < 10) return;
      const hasMarketMove = enrichedStories.slice(0, 5).some((story) => {
        const title = story.title.toLowerCase();
        return (
          title.includes("market") ||
          title.includes("price") ||
          title.includes("week") ||
          title.includes("drawdown") ||
          title.includes("selloff")
        );
      });
      if (hasMarketMove) return;
      enrichedStories.unshift({
        id: slugify("sol-week-market-move"),
        title: `SOL Week: ${change7d.toFixed(1)}% move — what drove it`,
        url: "/market",
        source: "Validator",
        publishedAt: new Date().toISOString(),
        tags: [],
        signalTags: ["RISK"],
        badge: "EXPLAINS DROP",
        summary: `Weekly move reflects shifts in liquidity, sentiment, and Solana-native positioning.`,
        imageUrl: null,
        imageSource: null,
        quote: "Watch leverage resets and Solana flows for confirmation.",
        mentions: buildMentions("SOL weekly move", "Validator"),
        whyItMatters: "Large weekly moves often signal shifts in positioning and liquidity.",
        entities: ["SOL", "Liquidity", "Positioning"],
        xMentions: null,
      });
    };

    ensureLaunchStory();
    ensureMarketMoveStory();

    enrichedStories = enrichedStories.slice(0, 5).map((story, index) => ({
      ...story,
      signalTags: story.signalTags ?? buildSignalTags(story.title, story.source),
      badge: buildBadge(
        { title: story.title, source: story.source, signalTags: story.signalTags ?? [] },
        index === 0
      ),
    }));
    if (enrichedStories.length < 5 && stableYields.length > 0) {
      const topYield = stableYields[0];
      enrichedStories.push({
        id: slugify(`stable-yield-${topYield.protocol}`),
        title: `Stable Yield Watch: ${topYield.protocol} ${topYield.apy?.toFixed(1) ?? "—"}%`,
        url: "https://defillama.com/yields",
        source: "DefiLlama",
        publishedAt: new Date().toISOString(),
        tags: ["YIELD", "STABLECOIN"],
        signalTags: ["YIELD", "STABLES"],
        badge: "HIGH SIGNAL",
        summary: `Top Solana stable yield at ${topYield.protocol} with ${topYield.apy?.toFixed(
          1
        )}% APY.`,
        imageUrl: null,
        imageSource: null,
        quote: `Top Solana stable yield at ${topYield.protocol}.`,
        mentions: buildMentions(topYield.protocol, "DefiLlama"),
        whyItMatters: `Highest visible Solana stable yield on ${topYield.protocol}.`,
        entities: [topYield.protocol, "Stablecoin", "Yield"],
        xMentions: null,
      });
    }

    if (enrichedStories.length < 5) {
      enrichedStories.push({
        id: slugify("validator-economics-watch"),
        title: "Validator Economics Watch: fee mix + staking flows",
        url: "https://solana.com/validators",
        source: "Solana",
        publishedAt: new Date().toISOString(),
        tags: ["STAKING", "VALIDATOR"],
        signalTags: ["STAKING"],
        badge: "HIGH SIGNAL",
        summary: "Monitor fee mix, staking flows, and validator incentives on Solana.",
        imageUrl: null,
        imageSource: null,
        quote: "Fee mix and staking flows remain core validator signals.",
        mentions: buildMentions("Solana validator staking", "Solana"),
        whyItMatters: "Fee mix and staking flows signal validator economics stability.",
        entities: ["Validator", "Staking", "Restaking"],
        xMentions: null,
      });
    }

    if (enrichedStories.length < 5) {
      enrichedStories.push({
        id: slugify("solana-mobile-seeker-updates"),
        title: "Solana Mobile: Seeker ecosystem updates",
        url: "https://solanamobile.com/",
        source: "Solana Mobile",
        publishedAt: new Date().toISOString(),
        tags: ["MOBILE"],
        signalTags: ["CONSUMER"],
        badge: "NEW",
        summary: "Track Seeker device, MWA, and ecosystem partner rollouts.",
        imageUrl: null,
        imageSource: null,
        quote: "Seeker ecosystem rollouts are progressing across partners.",
        mentions: buildMentions("Solana Mobile Seeker", "Solana Mobile"),
        whyItMatters: "Seeker distribution impacts mobile wallet adoption and ecosystem reach.",
        entities: ["Solana Mobile", "Seeker"],
        xMentions: null,
      });
    }

    enrichedStories = enrichedStories.slice(0, 5);

    const data: TerminalData = {
      sol,
      marketCap: {
        totalUsd: global.totalUsd,
        change24hPct: global.change24hPct,
        change7dPct: global.change7dPct,
      },
      fearGreed,
      btcDominance: { valuePct: global.btcDominance },
      volume: { change24hPct: null },
      signalBoard: buildSignalBoard({
        sol,
        fearGreed,
        stableYields,
        stories: enrichedStories,
      }),
      stories: enrichedStories.slice(0, 5),
    };

    cache = { data, fetchedAt: Date.now() };
    return data;
  } catch {
    return fallback;
  }
};
