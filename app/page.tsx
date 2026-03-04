"use client";

/**
 * Gossip — Solana Intelligence Terminal
 * 
 * The main application shell that manages the three primary panels:
 * 1. Signal Board (Market data & weekly intel)
 * 2. Briefing (Daily curated news)
 * 3. Seeker Magazine (Long-form stories, gated by Seeker token)
 *
 * Handles global state, theme switching, and touch-based carousel navigation.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import StoryDetail from "./components/StoryDetail";
import { Activity, Brain, Info, MessageCircle, Rocket, TrendingUp, Users } from "lucide-react";
import SeekerGuard from "./components/SeekerGuard";
import GossipLoadingScreen from "./components/GossipLoadingScreen";
import OnboardingCarousel from "./components/OnboardingCarousel";
import AnimatedEngagementChart from "./components/AnimatedEngagementChart";
import MatrixBanner from "./components/MatrixBanner";
import { getKickerClass, getKickerColor } from "./lib/categories";
import { requestAndScheduleNotifications, cancelNotifications } from "./lib/notifications";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";
import { useWallet } from "@solana/wallet-adapter-react";
import type { TerminalData } from "../lib/data/types";
import type {
  BriefingPayload,
  MarketContextPayload,
  NarrativeEvidence,
  NarrativeHotItem,
  NarrativePastWeekItem,
  NarrativeThisWeekItem,
  NarrativesPayload,
  NewsCardsPayload,
  SignalBoardPayload,
} from "../src/lib/loadDailyData";

const PALETTE_1 = ["accent-green", "accent-purple", "accent-cyan", "accent-pink"];
const PALETTE_2 = ["accent-cyan", "accent-pink", "accent-green", "accent-purple"];
const PALETTE_3 = ["accent-purple", "accent-cyan", "accent-pink", "accent-green"];

const ENDPOINT_URL = process.env.NEXT_PUBLIC_API_URL || "https://solana-intelligence.vercel.app/api";

type MarketView = {
  solPrice: number | null;
  sol24h: number | null;
  sol7d: number | null;
  mktCap: number | null;
  mktCap24h: number | null;
  fearValue: number | null;
  fearLabel: string;
  btcDom: number | null;
  volUsd: number | null;
};

const isValidNum = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function MarketStatsBlock({
  marketView,
  formatPrice,
  formatDelta,
  formatDollarDelta,
  formatUsd,
  sol7dDollarDelta,
}: {
  marketView: MarketView;
  formatPrice: (value: number | null) => string;
  formatDelta: (value: number | null) => { text: string; cls: string };
  formatDollarDelta: (value: number | null) => string;
  formatUsd: (value: number | null) => string;
  sol7dDollarDelta: number | null;
}) {
  return (
    <section className="price-strip">
      <div className="market-metric-grid">
        <div className="market-metric">
          <div className="market-metric-label">SOL</div>
          <div className="market-metric-value">{marketView.solPrice !== null ? `$${formatPrice(marketView.solPrice)}` : "n/a"}</div>
          <div className={`market-metric-delta ${formatDelta(marketView.sol24h).cls}`}>
            {formatDelta(marketView.sol24h).text}
          </div>
        </div>
        <div className="market-metric">
          <div className="market-metric-label">7D</div>
          <div className={`market-metric-value ${formatDelta(marketView.sol7d).cls}`}>
            {sol7dDollarDelta !== null ? `$${formatDollarDelta(sol7dDollarDelta)}` : "n/a"}
          </div>
          <div className={`market-metric-delta ${formatDelta(marketView.sol7d).cls}`}>
            {formatDelta(marketView.sol7d).text}
          </div>
        </div>
        <div className="market-metric">
          <div className="market-metric-label">MKT CAP</div>
          <div className="market-metric-value">{formatUsd(marketView.mktCap)}</div>
          <div className={`market-metric-delta ${formatDelta(marketView.mktCap24h).cls}`}>
            {formatDelta(marketView.mktCap24h).text}
          </div>
        </div>
      </div>
      <div className="market-support-row">
        Fear &amp; Greed Index <span className="market-support-accent">{marketView.fearValue ?? "n/a"}</span> ({marketView.fearLabel ?? "n/a"})
      </div>
      <div className="market-support-row market-support-secondary">
        <span>BTC.D <strong>{marketView.btcDom?.toFixed(1) ?? "n/a"}%</strong></span>
        <span>VOL <strong>{marketView.volUsd !== null ? `$${formatUsd(marketView.volUsd)}` : "n/a"}</strong></span>
      </div>
      <div className="market-divider" />
    </section>
  );
}

// Main application component containing the full terminal interface
export default function Home() {
  const [theme, setTheme] = useState<"dark" | "darker" | "gossip">("darker");
  const [focusMode, setFocusMode] = useState(false);
  const isStaked = false;
  const [terminalData, setTerminalData] = useState<TerminalData | null>(null);

  const getCachedDaily = () => {
    if (typeof window !== "undefined") {
      try {
        const cached = window.sessionStorage.getItem("validator_daily_cache");
        if (cached) return JSON.parse(cached);
      } catch { }
    }
    return null;
  };
  const cachedDaily = getCachedDaily();

  const [signalBoardData, setSignalBoardData] = useState<SignalBoardPayload | null>(cachedDaily?.signalBoard || null);
  const [narrativesData, setNarrativesData] = useState<NarrativesPayload | null>(cachedDaily?.narratives || null);
  const [briefingData, setBriefingData] = useState<BriefingPayload | null>(cachedDaily?.briefing || null);
  const [newsCardsData, setNewsCardsData] = useState<NewsCardsPayload | null>(cachedDaily?.newsCards || null);
  const [marketContextData, setMarketContextData] = useState<MarketContextPayload | null>(null);

  const [storyMetrics, setStoryMetrics] = useState<any>(() => {
    if (typeof window !== "undefined") {
      try {
        const m = window.sessionStorage.getItem("validator_metrics_cache");
        if (m) return JSON.parse(m);
      } catch { }
    }
    return null;
  });

  const [marketCache, setMarketCache] = useState<MarketContextPayload | null>(null);
  const [activePanel, setActivePanel] = useState(0); // always default to the first page
  const [isSeeker, setIsSeeker] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.sessionStorage.getItem("gossip_onboarded") !== "true";
    }
    return true;
  });
  const [isAppReady, setIsAppReady] = useState(!!cachedDaily);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [activeStoryIndex, setActiveStoryIndex] = useState(-1);
  const [notifsEnabled, setNotifsEnabled] = useState(() =>
    typeof window !== "undefined" &&
    window.localStorage.getItem("gossip_notifications_enabled") === "true"
  );
  const { disconnect } = useWallet();
  const isSeekerConnected = typeof window !== "undefined" &&
    window.localStorage.getItem("gossip_seeker_verified") === "true";
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const hasRestoredScroll = useRef(false);

  const handleReplayOnboarding = () => {
    window.localStorage.removeItem("gossip_onboarded");
    window.location.reload();
  };

  const handleNotifToggle = async () => {
    if (!notifsEnabled) {
      const granted = await requestAndScheduleNotifications();
      if (granted) {
        localStorage.setItem("gossip_notifications_enabled", "true");
        setNotifsEnabled(true);
      }
    } else {
      await cancelNotifications();
      localStorage.setItem("gossip_notifications_enabled", "false");
      setNotifsEnabled(false);
    }
  };
  const panelRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const stored = window.localStorage.getItem("validator_theme");
    if (stored === "dark" || stored === "darker" || stored === "gossip") {
      setTheme(stored);
    }

    // Check onboarding asynchronously as a fallback (hydration mismatch safety)
    if (window.sessionStorage.getItem("gossip_onboarded") === "true" && showLoadingScreen) {
      setShowLoadingScreen(false);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("validator_theme", theme);
  }, [theme]);

  // Re-schedule notifications on app resume in case the OS cleared them (e.g. after reboot)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listener: any;
    App.addListener("resume", async () => {
      if (window.localStorage.getItem("gossip_notifications_enabled") === "true") {
        await requestAndScheduleNotifications();
      }
    }).then(l => { listener = l; });
    return () => { listener?.remove(); };
  }, []);

  useEffect(() => {
    const stored = window.sessionStorage.getItem("validator_focus_mode");
    if (stored === "1" || stored === "0") {
      setFocusMode(stored === "1");
      return;
    }
    // Default to focus OFF so pricing info is visible on Seeker
    setFocusMode(false);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("validator_focus_mode", focusMode ? "1" : "0");
    }
  }, [focusMode]);

  // Remove the `removeItem` hook that forcibly resets panel state on mount



  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("validator_market_cache");
      if (!raw) return;
      const parsed = JSON.parse(raw) as MarketContextPayload;
      if (isValidNum(parsed?.sol?.price) || isValidNum(parsed?.mkt_cap?.solana_mkt_cap_usd)) {
        setMarketCache(parsed);
      }
    } catch {
      // ignore cache parse issues
    }
  }, []);


  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/terminal");
        if (!res.ok) throw new Error("terminal data fetch failed");
        const json = (await res.json()) as TerminalData;
        if (active) {
          setTerminalData(json);
        }
      } catch {
        // Keep last good value on transient failures.
      } finally {
        // no-op
      }
    };
    fetchData();
    const interval = window.setInterval(fetchData, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);
  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const [res, metricsRes] = await Promise.all([
          fetch("/api/daily"),
          fetch("/api/metrics")
        ]);

        if (!res.ok) throw new Error("daily fetch failed");
        const daily = await res.json();

        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("validator_daily_cache", JSON.stringify(daily));
        }

        if (metricsRes.ok) {
          const metrics = await metricsRes.json();
          if (active) {
            setStoryMetrics(metrics);
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem("validator_metrics_cache", JSON.stringify(metrics));
            }
          }
        }

        if (!active) return;
        setSignalBoardData(daily.signalBoard);
        setNarrativesData(daily.narratives);
        setBriefingData(daily.briefing);
        setNewsCardsData(daily.newsCards);
        setIsAppReady(true);
      } catch (err) {
        if (process.env.NODE_ENV !== "production") console.warn("Error fetching daily data", err);
        setIsAppReady(true);
      }
    };
    run();
    const interval = window.setInterval(run, 30000);
    return () => { active = false; window.clearInterval(interval); };
  }, []);

  // Live pricing — independent refresh every 3 minutes from CoinGecko + Fear & Greed
  useEffect(() => {
    let active = true;
    const fetchPrices = async () => {
      try {
        const res = await fetch("/api/market-prices", { cache: "no-store" });
        if (!res.ok) throw new Error("market-prices fetch failed");
        const data = await res.json();
        if (!active) return;
        setMarketContextData(data);
      } catch (err) {
        if (process.env.NODE_ENV !== "production") console.warn("Live price fetch failed, keeping cached value:", err);
      }
    };
    fetchPrices();
    const interval = window.setInterval(fetchPrices, 3 * 60 * 1000); // every 3 min
    return () => { active = false; window.clearInterval(interval); };
  }, []);


  useEffect(() => {
    if (!marketContextData) return;
    if (!isValidNum(marketContextData?.sol?.price) && !isValidNum(marketContextData?.mkt_cap?.solana_mkt_cap_usd)) return;
    setMarketCache(marketContextData);
    try {
      window.localStorage.setItem("validator_market_cache", JSON.stringify(marketContextData));
    } catch {
      // ignore storage errors
    }
  }, [marketContextData]);

  const toggleLabel = useMemo(
    () => (theme === "darker" ? "Switch to Dark" : "Switch to Darker"),
    [theme]
  );

  // Restore scroll position on initial mount if we came back to a different panel
  useEffect(() => {
    if (isAppReady && !hasRestoredScroll.current) {
      if (activePanel > 0) {
        requestAnimationFrame(() => {
          const container = carouselRef.current;
          const node = panelRefs.current[activePanel];
          if (container && node) {
            container.scrollTo({
              left: node.offsetLeft,
              behavior: "instant",
            });
          }
          hasRestoredScroll.current = true;
        });
      } else {
        hasRestoredScroll.current = true;
      }
    }
  }, [isAppReady, activePanel]);

  const scrollToPanel = (index: number) => {
    const container = carouselRef.current;
    if (!container) return;
    const target = Math.max(0, Math.min(2, index));
    const node = panelRefs.current[target];
    const left = node ? node.offsetLeft : target * (container.clientWidth || 1);
    container.scrollTo({
      left,
      behavior: "smooth",
    });
    setActivePanel(target);
  };

  const handleCarouselScroll = () => {
    if (!hasRestoredScroll.current) return;
    const container = carouselRef.current;
    if (!container) return;
    const offsets = panelRefs.current.map((node, idx) => ({
      idx,
      left: node ? node.offsetLeft : idx * (container.clientWidth || 1),
    }));
    let boundedIdx = activePanel;
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of offsets) {
      const dist = Math.abs(container.scrollLeft - candidate.left);
      if (dist < best) {
        best = dist;
        boundedIdx = candidate.idx;
      }
    }
    if (boundedIdx !== activePanel) setActivePanel(boundedIdx);
  };

  const toFiniteNumber = (value: number | string | null | undefined) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  };

  const formatDelta = (value: number | null) => {
    const numeric = toFiniteNumber(value);
    if (numeric === null) {
      return { text: "n/a", cls: "delta-muted" };
    }
    if (numeric > 0) {
      return { text: `${numeric.toFixed(1)}%`, cls: "delta-up" };
    }
    if (numeric < 0) {
      return { text: `${numeric.toFixed(1)}%`, cls: "delta-down" };
    }
    return { text: "0.0%", cls: "delta-muted" };
  };

  const formatUsd = (value: number | null) => {
    const numeric = toFiniteNumber(value);
    if (numeric === null) return "n/a";
    if (numeric >= 1_000_000_000_000) {
      return `${(numeric / 1_000_000_000_000).toFixed(2)}T`;
    }
    if (numeric >= 1_000_000_000) {
      return `${(numeric / 1_000_000_000).toFixed(2)}B`;
    }
    return numeric.toFixed(2);
  };

  const formatPrice = (value: number | null) => {
    const numeric = toFiniteNumber(value);
    if (numeric === null) return "n/a";
    return numeric.toFixed(2);
  };

  const formatCompactNumber = (value: number | null | undefined) => {
    const numeric = toFiniteNumber(value ?? null);
    if (numeric === null) return "0";
    if (Math.abs(numeric) >= 1_000_000) return `${(numeric / 1_000_000).toFixed(1)}M`;
    if (Math.abs(numeric) >= 1_000) return `${(numeric / 1_000).toFixed(1)}K`;
    return `${Math.round(numeric)}`;
  };




  const formatDailyDate = (iso?: string | null) => {
    if (!iso) return "n/a";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "n/a";
    const day = String(date.getUTCDate()).padStart(2, "0");
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const month = months[date.getUTCMonth()] ?? "n/a";
    const year = date.getUTCFullYear();
    return `${day} ${month} ${year}`;
  };

  const formatShortDate = (value?: string | null) => {
    if (!value) return formatDailyDate(new Date().toISOString());
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-");
      return formatDailyDate(`${y}-${m}-${d}T00:00:00Z`);
    }
    return formatDailyDate(value);
  };

  const stripHandles = (value?: string | null) =>
    String(value || "").replace(/@\w+/g, "").replace(/\s+/g, " ").trim();

  const compactSentence = (value?: string | null, maxChars = 220) => {
    const text = stripHandles(value);
    if (!text) return "";
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" ");
    return sentences.length > maxChars ? `${sentences.slice(0, maxChars - 1).trimEnd()}…` : sentences;
  };

  const compactNarrative = (value?: string | null) => {
    const cleaned = stripHandles(value)
      .replace(/\b(the\s+recent\s+tweets?\s+from|tweets?\s+from)\b[^.]*\.\s*/i, "")
      .trim();
    return compactSentence(cleaned, 240);
  };

  const splitHookAndPremium = (text?: string | null) => {
    const normalized = String(text || "").trim();
    if (!normalized) return { hookText: "", premiumText: "" };

    const trigger = /broad market chatter/i;
    const triggerMatch = normalized.match(trigger);
    if (triggerMatch && triggerMatch.index !== undefined) {
      const idx = triggerMatch.index;
      return {
        hookText: normalized.slice(0, idx).trim().replace(/[,\s]+$/, "."),
        premiumText: normalized.slice(idx).trim(),
      };
    }

    const words = normalized.split(/\s+/);
    const splitAt = Math.min(24, Math.max(16, Math.floor(words.length * 0.4)));
    return {
      hookText: words.slice(0, splitAt).join(" ").trim(),
      premiumText: words.slice(splitAt).join(" ").trim(),
    };
  };

  const narrativeGeneratedDate =
    signalBoardData?.generated_at_utc ||
    signalBoardData?.date ||
    narrativesData?.generated_at ||
    narrativesData?.generatedAt ||
    null;

  const asList = <T,>(value?: T[] | null) => (Array.isArray(value) ? value : []);
  const stripSectionPrefix = (value?: string | null) =>
    String(value || "")
      .replace(/^\s*(price\s*check|this\s*week|next\s*week)\s*:\s*/i, "")
      .trim();

  const narrativePastWeek = asList<NarrativePastWeekItem>(narrativesData?.pastWeek?.bullets).slice(0, 3);
  const narrativeThisWeek = asList<NarrativeThisWeekItem>(narrativesData?.thisWeek?.watchlist).slice(0, 3);
  const narrativeWhatsHot = asList<NarrativeHotItem>(narrativesData?.whatsHot).slice(0, 5);

  const hasNarratives =
    narrativePastWeek.length > 0 || narrativeThisWeek.length > 0 || narrativeWhatsHot.length > 0;

  const signalPastWeek =
    signalBoardData?.pastWeek ||
    signalBoardData?.aiRead ||
    "SOL spent the week in risk-off posture, and flows stayed selective around majors.";
  const utcDay = new Date().getUTCDay(); // 0=Sun,1=Mon...6=Sat
  const signalShowPastWeek =
    typeof signalBoardData?.showPastWeek === "boolean"
      ? signalBoardData.showPastWeek
      : utcDay >= 0 && utcDay <= 2;
  const signalShowNextWeek =
    typeof signalBoardData?.showNextWeek === "boolean"
      ? signalBoardData.showNextWeek
      : utcDay >= 3;
  const signalPriceUpdate =
    signalBoardData?.priceUpdate ||
    stripSectionPrefix(signalBoardData?.priceUpdate) ||
    "24h and 7d are mixed; wait for cleaner confirmation before adding size.";
  const signalThisWeek =
    signalBoardData?.thisWeek ||
    stripSectionPrefix(signalBoardData?.thisWeek) ||
    stripSectionPrefix(signalBoardData?.narrativeShifts) ||
    "Watch whether fresh demand follows through on the most recent Solana headlines.";
  const signalNextWeek =
    signalBoardData?.nextWeek ||
    stripSectionPrefix(signalBoardData?.nextWeek) ||
    "Watch whether current leaders hold flow after first reaction.";

  const normalizeXHandle = (value?: string | null) =>
    String(value || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();

  const formatXHandle = (value?: string | null) => {
    const normalized = normalizeXHandle(value);
    return normalized ? `@${normalized}` : "";
  };

  const summarizeCtConversation = (
    pulses: Array<{ thought?: string }>,
    story?: { title?: string; narrative?: string; whyItMatters?: string; source?: string }
  ) => {
    const text = `${story?.title || ""} ${story?.narrative || ""} ${story?.whyItMatters || ""} ` +
      pulses
        .map((p) => String(p?.thought || ""))
        .join(" ")
        .toLowerCase();
    const source = String(story?.source || "").toLowerCase();

    const has = (pattern: RegExp) => pattern.test(text);

    if ((source.includes("coindesk") || source.includes("the block") || source.includes("decrypt")) &&
      has(/\b(etf|macro|inflows|outflows|dominance|risk off|risk-on)\b/)) {
      return "CT is reading this as a flow story first: macro headlines matter only if SOL demand follows.";
    }
    if ((source.includes("solana") || source.includes("blockworks")) &&
      has(/\b(gaming|seeker|mobile|wallet|consumer|app layer|launch|product)\b/)) {
      return "CT is treating this as an adoption signal, focused on whether product usage turns into sustained flow.";
    }
    if (source.includes("messari") &&
      has(/\b(staking|yield|validator|tvl|liquidity)\b/)) {
      return "CT is focused on structure here: yield quality, validator incentives, and where liquidity is concentrating.";
    }

    if (has(/\b(tokenomics|unlock|airdrop|tge|supply|emissions|vesting)\b/)) {
      return "CT is focused on token supply timing and how unlock flow could hit liquidity.";
    }
    if (has(/\b(perps|perp|dex|volume|liquidity|open interest|oi)\b/)) {
      return "CT is focused on trading flow quality: perps participation, spot depth, and follow-through.";
    }
    if (has(/\b(staking|yield|lst|restaking|validator)\b/)) {
      return "CT is focused on staking and yield rotation, especially where risk-adjusted carry is improving.";
    }
    if (has(/\b(rpc|firedancer|infra|latency|throughput|outage|congestion)\b/)) {
      return "CT is focused on infra reliability and execution quality, not just headline momentum.";
    }
    if (has(/\b(gaming|seeker|mobile|wallet|consumer|app layer)\b/)) {
      return "CT is focused on consumer adoption signals, with attention on mobile and product distribution.";
    }
    if (has(/\b(etf|macro|inflows|outflows|dominance|risk off|risk-on)\b/)) {
      return "CT is focused on whether macro flow can translate into sustained SOL demand.";
    }
    if (has(/\b(ai|agent|agents)\b/)) {
      return "CT is focused on whether AI-agent activity is real usage or just short-term narrative heat.";
    }

    return "CT is focused on near-term positioning and whether this narrative has real follow-through.";
  };

  const evidenceList = (evidence?: NarrativeEvidence[] | null) =>
    asList<NarrativeEvidence>(evidence)
      .map((item) => ({
        handle: item?.handle || "",
        link: item?.link || item?.tweetUrl || "",
      }))
      .filter((item) => item.handle);

  const pickMarket = (...values: Array<number | null | undefined>) => {
    for (const value of values) {
      const n = toFiniteNumber(value ?? null);
      if (n !== null) return n;
    }
    return null;
  };

  const marketView = {
    solPrice: pickMarket(marketContextData?.sol?.price, terminalData?.sol?.priceUsd, marketCache?.sol?.price),
    sol24h: pickMarket(marketContextData?.sol?.change_24h, terminalData?.sol?.change24hPct, marketCache?.sol?.change_24h),
    sol7d: pickMarket(marketContextData?.sol?.change_7d, terminalData?.sol?.change7dPct, marketCache?.sol?.change_7d),
    mktCap: pickMarket(
      marketContextData?.mkt_cap?.solana_mkt_cap_usd,
      terminalData?.marketCap?.totalUsd,
      marketCache?.mkt_cap?.solana_mkt_cap_usd,
    ),
    mktCap24h: pickMarket(marketContextData?.mkt_cap?.change_24h, terminalData?.marketCap?.change24hPct, marketCache?.mkt_cap?.change_24h),
    fearValue: pickMarket(marketContextData?.fear_greed?.value, terminalData?.fearGreed?.value, marketCache?.fear_greed?.value),
    fearLabel:
      marketContextData?.fear_greed?.label ||
      terminalData?.fearGreed?.classification ||
      marketCache?.fear_greed?.label ||
      "n/a",
    btcDom: pickMarket(marketContextData?.btc_dominance?.value, terminalData?.btcDominance?.valuePct, marketCache?.btc_dominance?.value),
    volUsd: pickMarket(marketContextData?.vol?.sol_24h_usd, marketCache?.vol?.sol_24h_usd),
    volChange24h: terminalData?.volume?.change24hPct ?? null,
  };

  const sol7dDollarDelta = (() => {
    const price = toFiniteNumber(marketView.solPrice);
    const pct = toFiniteNumber(marketView.sol7d);
    if (price === null || pct === null) return null;
    const base = price / (1 + pct / 100);
    if (!Number.isFinite(base)) return null;
    return price - base;
  })();

  const formatDollarDelta = (value: number | null) => {
    if (value === null || !Number.isFinite(value)) return "n/a";
    const sign = value >= 0 ? "" : "-";
    return `${sign}${Math.abs(value).toFixed(2)}`;
  };


  return (
    <>
      {showLoadingScreen && (
        <GossipLoadingScreen
          isAppReady={isAppReady}
          onFinished={() => setShowLoadingScreen(false)}
        />
      )}
      <main className="page terminal-surface">
        <header className="header header-terminal">
          <div className="hero-copy">
            <h1 className="title" aria-label="GOSSIP">
              <span className={`title-logo ${focusMode ? "title-logo-focus" : ""}`}>GOSSIP</span>
              <span className="logo-cursor" aria-hidden="true">_</span>
            </h1>
            <p className="subtitle">SOLANA INTELLIGENCE TERMINAL</p>
            {isStaked && activePanel !== 2 ? (
              <span className="staked-chip">Staked — Enhanced Signal</span>
            ) : null}
          </div>
          <div className="header-actions">
            <button
              className="theme-toggle-icon"
              onClick={() => setShowInfoModal(true)}
              aria-label="App Info"
            >
              <Info size={14} />
            </button>
            <button
              className={`focus-toggle ${focusMode ? "active" : ""}`}
              onClick={() => setFocusMode((prev) => !prev)}
              aria-label={focusMode ? "Disable Focus Mode" : "Enable Focus Mode"}
            >
              FOCUS
            </button>
            <button
              className="theme-toggle-icon"
              onClick={() => setTheme(theme === "darker" ? "gossip" : theme === "gossip" ? "dark" : "darker")}
              aria-label={toggleLabel}
            >
              {theme === "darker" ? "☾" : theme === "gossip" ? "✧" : "☼"}
            </button>
          </div>
        </header>


        <div className={`market-collapsible ${focusMode ? "collapsed" : ""}`}>
          <MarketStatsBlock
            marketView={marketView}
            formatPrice={formatPrice}
            formatDelta={formatDelta}
            formatDollarDelta={formatDollarDelta}
            formatUsd={formatUsd}
            sol7dDollarDelta={sol7dDollarDelta}
          />
        </div>

        <div className="panel-carousel-wrap">
          <div
            className="panel-carousel"
            ref={carouselRef}
            onScroll={handleCarouselScroll}
          >
            <div
              className="panel-slide panel-slide-signal"
              ref={(el) => {
                panelRefs.current[0] = el;
              }}
            >
              <section className="intelligence intel-card card--signal">
                <div className="intelligence-header">
                  <h2 className="intelligence-title">Signal Board</h2>
                </div>
                <div className="weekly-intel-head">
                  <div className="weekly-intel-title">Weekly Intelligence</div>
                  <div className="weekly-intel-date">
                    Generated {formatShortDate(narrativeGeneratedDate)}
                  </div>
                </div>
                <div className="terminal-divider" aria-hidden="true" />
                <div className="signal-brief">
                  <div className="signal-brief-body">
                    <div className="sb-list">
                      {signalBoardData?.ctxMarket && (
                        <div className={`sb-item ${PALETTE_1[0]}`}>
                          <div className="sb-item-head">
                            <span className="sb-item-label">
                              MARKET CONTEXT {narrativeGeneratedDate ? `(AS OF ${new Date(narrativeGeneratedDate).getUTCHours().toString().padStart(2, '0')}:${new Date(narrativeGeneratedDate).getUTCMinutes().toString().padStart(2, '0')} UTC)` : ''}
                            </span>
                          </div>
                          <p className="sb-item-copy">
                            {signalBoardData.ctxMarket}
                          </p>
                        </div>
                      )}

                      {signalBoardData?.ctxTalking && (
                        <div className={`sb-item ${PALETTE_1[1]}`}>
                          <div className="sb-item-head">
                            <span className="sb-item-label">WHAT PEOPLE ARE TALKING ABOUT</span>
                          </div>
                          <div className="sb-item-copy">
                            {signalBoardData.ctxTalking.split('\n').map((line, i) => (
                              <p key={i}>{line}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {signalBoardData?.ctxMatters && (
                        <div className={`sb-item ${PALETTE_1[2]}`}>
                          <div className="sb-item-head">
                            <span className="sb-item-label">WHY IT MATTERS</span>
                          </div>
                          <p className="sb-item-copy">
                            {signalBoardData.ctxMatters}
                          </p>
                        </div>
                      )}

                      {signalBoardData?.ctxSignal && (
                        <div className={`sb-item ${PALETTE_1[3]}`}>
                          <div className="sb-item-head">
                            <span className="sb-item-label">WHAT'S SIGNAL VS NOISE</span>
                          </div>
                          <div className="sb-item-copy">
                            {signalBoardData.ctxSignal.split('\n').map((line, i) => (
                              <p key={i}>{line}</p>
                            ))}
                          </div>
                        </div>
                      )}

                      {signalBoardData?.ctxGlossary && (
                        <div className={`sb-item ${PALETTE_1[0]}`}>
                          <div className="sb-item-head">
                            <span className="sb-item-label">GLOSSARY (1-LINERS)</span>
                          </div>
                          <div className="sb-item-copy glossary-text">
                            {signalBoardData.ctxGlossary.split('\n').map((line, i) => (
                              <p key={i}>{line}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
            <div
              className="panel-slide panel-slide-briefing"
              ref={(el) => {
                panelRefs.current[1] = el;
              }}
            >
              <section className="morning-open">
                <div className="morning-panel intel-card card--briefing">
                  <div className="morning-panel-header">
                    <h2 className="intelligence-title briefing-title-glitch">{briefingData?.title || "TODAY'S SOLANA BRIEFING"}</h2>
                  </div>
                  <div className="briefing-subhead-row">
                    <span className="briefing-subhead-line" />
                    <span className="briefing-subhead-text">{briefingData?.subtitle || "Top links from trusted desks"}</span>
                    <span className="briefing-subhead-line" />
                  </div>
                  <div className="briefing-card-stack">
                    {(() => {
                      const items = briefingData?.items || [];
                      const slots = [
                        { label: "NEED TO KNOW", icon: "⚡", tone: PALETTE_2[0], item: items[0] },
                        { label: "GOOD TO KNOW", icon: "↗", tone: PALETTE_2[1], item: items[1] },
                        { label: "KEEP AN EYE ON", icon: "◉", tone: PALETTE_2[2], item: items[2] },
                      ];
                      return slots.filter(slot => slot.item).map((slot, idx) => (
                        <div key={idx} className={`briefing-item ${slot.tone}`}>
                          <div className="briefing-item-head">
                            <span className="briefing-item-icon">{slot.icon}</span>
                            <span className="briefing-item-label">{slot.label}</span>
                          </div>
                          {slot.item?.url ? (
                            <a
                              href={slot.item.url}
                              target="_blank"
                              rel="noreferrer"
                              className="briefing-story-link"
                            >
                              {slot.item.title} <span className="briefing-story-arrow">↗</span>
                            </a>
                          ) : (
                            <p className="briefing-card-copy">
                              {slot.item?.title || "Refreshing high-signal picks…"}
                            </p>
                          )}
                          {slot.item?.source ? (
                            <div className="briefing-story-meta">
                              {slot.item.source}
                              {slot.item.date ? ` • ${formatShortDate(slot.item.date)}` : ""}
                            </div>
                          ) : null}
                          {slot.item?.whyYouShouldCare ? (
                            <p className="briefing-story-why">{slot.item.whyYouShouldCare}</p>
                          ) : null}
                        </div>
                      ));
                    })()}
                    {(!briefingData?.items || briefingData.items.length === 0) && (
                      <div className="text-white/40 text-sm italic p-4 text-center">Briefing generating...</div>
                    )}
                  </div>
                </div>
              </section>
            </div>

            <div
              className="panel-slide panel-slide-scroll"
              ref={(el) => {
                panelRefs.current[2] = el;
              }}
            >
              {(() => {
                const stories = (newsCardsData?.items || []).slice(0, 3);
                const globalMetrics = (newsCardsData as any)?.global_metrics || null;
                const lead = stories[0] || null;
                const moreStories = stories.slice(1, 3);
                const globalTweets = Number(globalMetrics?.total_tweets ?? stories.reduce((sum, item) => { const t = item?.metrics?.tweets ?? item?.stats?.total_tweets ?? 0; return sum + Number(t); }, 0));
                const globalEng = Number(globalMetrics?.total_engagement ?? stories.reduce((sum, item) => { const e = item?.metrics?.engagement ?? item?.stats?.total_engagement ?? 0; return sum + Number(e); }, 0));
                const globalTop = Number(globalMetrics?.top_tweet ?? Math.max(0, ...stories.map((item) => Number(item?.metrics?.topTweet ?? item?.stats?.top_engagement ?? 0))));
                const globalVoices = Number(globalMetrics?.unique_voices ?? stories.reduce((sum, item) => { const v = item?.metrics?.voices ?? item?.stats?.unique_users ?? 0; return sum + Number(v); }, 0));
                const leadCategory = String(lead?.category || "Daily Intel");
                const leadIsCritical = /security|risk|breach|exploit|hack/i.test(leadCategory);
                const leadIsAi = /ai|agent/i.test(leadCategory);
                const leadIsGaming = /gaming|game/i.test(leadCategory);
                const peekData = { lead, tweets: globalTweets, eng: globalEng, voices: globalVoices, topTweet: globalTop, stories };
                return (
                  <SeekerGuard peekData={peekData}>
                    {activeStoryIndex >= 0 && stories[activeStoryIndex] ? (
                      <StoryDetail
                        story={stories[activeStoryIndex]}
                        index={activeStoryIndex}
                        total={stories.length}
                        onBack={() => setActiveStoryIndex(-1)}
                        publishDate={newsCardsData?.date}
                      />
                    ) : (
                      <section className="morning-open" id="top-story-feed">
                        <div className="morning-panel intel-card card--briefing">
                          {(() => {
                            if (!lead) {
                              return (
                                <div className="news-empty">
                                  Run node scripts/runDaily.mjs to generate today’s stories.
                                </div>
                              );
                            }

                            return (
                              <>
                                <div className="morning-panel-header">
                                  <h2 className="intelligence-title briefing-title-glitch">SEEKER EXCLUSIVE INTEL</h2>
                                </div>
                                <div className="briefing-subhead-row">
                                  <span className="briefing-subhead-line" />
                                  <span className="briefing-subhead-text">Premium On-Chain Data Analysis</span>
                                  <span className="briefing-subhead-line" />
                                </div>

                                <div style={{ padding: "16px 18px 4px", marginBottom: "16px" }}>
                                  {(() => {
                                    const rawTweets = storyMetrics?.totals?.total_tweets || globalTweets || 0;
                                    const rawEng = storyMetrics?.totals?.total_engagement || globalEng || 0;
                                    const rawVoices = storyMetrics?.totals?.unique_users || globalVoices || 0;
                                    const rawTop = storyMetrics?.totals?.top_tweet_engagement || globalTop || 0;

                                    const chartItems = [
                                      { label: "Tweets Analyzed", value: Math.min(100, rawTweets / 500 * 100), formattedValue: String(rawTweets), raw: rawTweets, color: '#9945FF' },
                                      { label: "Total Engagement", value: Math.min(100, rawEng / 100000 * 100), formattedValue: formatCompactNumber(rawEng), raw: rawEng, color: '#14F195' },
                                      { label: "Unique Voices", value: Math.min(100, rawVoices / 200 * 100), formattedValue: String(rawVoices), raw: rawVoices, color: '#00C2FF' },
                                      { label: "Top Tweet", value: Math.min(100, rawTop / 20000 * 100), formattedValue: formatCompactNumber(rawTop), raw: rawTop, color: '#FF0080' }
                                    ].filter(item => item.value >= 15); // hide bars < 15% of expected scale

                                    return (
                                      <AnimatedEngagementChart
                                        title="GLOBAL NETWORK METRICS"
                                        maxValue={100}
                                        colors={chartItems.map(item => item.color)}
                                        items={chartItems}
                                      />
                                    );
                                  })()}
                                </div>

                                <div className="seeker-mag-divider" />

                                <div className="briefing-card-stack" style={{ padding: "0 18px 18px" }}>
                                  {stories.map((story, idx) => {
                                    let cat = String(story?.category || "Intel").toUpperCase();
                                    if (cat.includes("/")) {
                                      cat = cat.split("/")[0].trim();
                                    }

                                    const title = String(story?.title || "Untitled Intelligence");
                                    const preview = compactSentence(
                                      story?.content?.signal || story?.summary || story?.hook || story?.narrative || "",
                                      160,
                                    );

                                    const ROW_BANNER_COLORS = ["#9945FF", "#00C2FF", "#FF00FF", "#14F195"];
                                    const kickerCls = getKickerClass(cat);
                                    const bannerColor = kickerCls ? getKickerColor(cat) : ROW_BANNER_COLORS[idx % 4];

                                    return (
                                      <button
                                        type="button"
                                        key={`story-card-${idx}`}
                                        onClick={() => setActiveStoryIndex(idx)}
                                        className={`seeker-mag-item ${PALETTE_3[idx % 4]}`}
                                        style={{ border: "none", background: "transparent", cursor: "pointer", textAlign: "left", width: "100%", padding: 0 }}
                                      >
                                        <div className="seeker-mag-item-banner" style={{ overflow: "hidden" }}>
                                          <MatrixBanner color={bannerColor} />
                                        </div>

                                        <div className="seeker-mag-item-head">
                                          <span className={`seeker-mag-kicker ${kickerCls}`} style={{ padding: 0, fontSize: "0.6rem" }}>
                                            {cat}
                                          </span>
                                        </div>

                                        <h3 className="seeker-mag-item-title">
                                          {title}
                                        </h3>

                                        {preview && (
                                          <p className="seeker-mag-item-copy">
                                            {preview}
                                          </p>
                                        )}
                                      </button>
                                    );
                                  })}
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      </section>
                    )}
                  </SeekerGuard>
                );
              })()}
            </div>
          </div >
        </div >

      </main >

      {showInfoModal && (
        <div
          className="info-modal-overlay"
          onClick={() => setShowInfoModal(false)}
        >
          <div
            className="info-modal-content"
            onClick={e => e.stopPropagation()}
          >
            {/* Matrix banner header strip */}
            <div style={{ height: "48px", margin: "-32px -24px 24px", overflow: "hidden" }}>
              <MatrixBanner color="#14f195" />
            </div>

            <div className="info-modal-wordmark">
              <h2 className="info-modal-title">GOSSIP</h2>
              <p className="info-modal-subtitle">SOLANA INTELLIGENCE TERMINAL</p>
            </div>

            <div className="info-modal-meta-row">
              <span className="info-modal-badge">{`v${process.env.NEXT_PUBLIC_APP_VERSION}`}</span>
              <span className="info-modal-dot">·</span>
              <span className="info-modal-badge">2026</span>
            </div>

            <div className="info-modal-divider" />

            <div className="info-modal-dev">
              <span className="info-modal-dev-label">BUILT BY</span>
              <a href="https://x.com/chkndgtl" target="_blank" rel="noopener noreferrer" className="info-modal-dev-handle">
                @chkndgtl
              </a>
            </div>

            <div className="info-modal-divider" />

            {Capacitor.isNativePlatform() && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 0", marginBottom: "8px",
              }}>
                <span style={{ fontSize: "0.75rem", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.08em", color: "rgba(160,175,215,0.80)" }}>
                  STORY NOTIFICATIONS
                </span>
                <button
                  onClick={handleNotifToggle}
                  style={{
                    width: "44px", height: "24px", borderRadius: "12px", border: "none",
                    cursor: "pointer", position: "relative", transition: "background 0.22s",
                    background: notifsEnabled ? "#14F195" : "rgba(100,115,155,0.30)",
                  }}
                  aria-label={notifsEnabled ? "Disable notifications" : "Enable notifications"}
                >
                  <span style={{
                    position: "absolute", top: "3px",
                    left: notifsEnabled ? "23px" : "3px",
                    width: "18px", height: "18px", borderRadius: "50%",
                    background: notifsEnabled ? "#000" : "rgba(160,175,215,0.70)",
                    transition: "left 0.22s",
                  }} />
                </button>
              </div>
            )}

            <button
              onClick={handleReplayOnboarding}
              className="info-modal-btn-replay"
            >
              REPLAY TUTORIAL
            </button>

            {isSeekerConnected && (
              <button
                onClick={() => {
                  localStorage.removeItem("gossip_seeker_verified");
                  disconnect();
                  window.dispatchEvent(new Event("gossip:disconnect"));
                  setShowInfoModal(false);
                }}
                className="info-modal-btn-replay"
                style={{ color: "#ff4d4d", borderColor: "rgba(255,77,77,0.25)", marginBottom: "4px" }}
              >
                DISCONNECT WALLET
              </button>
            )}

            <button
              onClick={() => setShowInfoModal(false)}
              className="info-modal-btn-close"
            >
              CLOSE
            </button>
          </div>
        </div>
      )}

      {!showLoadingScreen && <OnboardingCarousel />}
    </>
  );
}
