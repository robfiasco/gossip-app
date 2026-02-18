"use client";

/**
 * Validator — Solana Intelligence Terminal
 * 
 * The main application shell that manages the three primary panels:
 * 1. Signal Board (Market data & weekly intel)
 * 2. Briefing (Daily curated news)
 * 3. Seeker Magazine (Long-form stories, gated by Seeker token)
 *
 * Handles global state, theme switching, and touch-based carousel navigation.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Brain, MessageCircle, Rocket, TrendingUp, Users } from "lucide-react";
import SeekerGuard from "./components/SeekerGuard";
import type { TerminalData } from "../lib/data/types";
import {
  loadDailyData,
  type BriefingPayload,
  type MarketContextPayload,
  type NarrativeEvidence,
  type NarrativeHotItem,
  type NarrativePastWeekItem,
  type NarrativeThisWeekItem,
  type NarrativesPayload,
  type NewsCardsPayload,
  type SignalBoardPayload,
} from "../src/lib/loadDailyData";

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
  const [theme, setTheme] = useState<"dark" | "darker">("darker");
  const [focusMode, setFocusMode] = useState(false);
  const isStaked = false;
  const [terminalData, setTerminalData] = useState<TerminalData | null>(null);
  const [signalBoardData, setSignalBoardData] = useState<SignalBoardPayload | null>(null);
  const [narrativesData, setNarrativesData] = useState<NarrativesPayload | null>(null);
  const [briefingData, setBriefingData] = useState<BriefingPayload | null>(null);
  const [newsCardsData, setNewsCardsData] = useState<NewsCardsPayload | null>(null);
  const [marketContextData, setMarketContextData] = useState<MarketContextPayload | null>(null);
  const [marketCache, setMarketCache] = useState<MarketContextPayload | null>(null);
  const [activePanel, setActivePanel] = useState(0);
  const [isSeeker, setIsSeeker] = useState(false);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const panelRefs = useRef<Array<HTMLDivElement | null>>([]);

  useEffect(() => {
    const stored = window.localStorage.getItem("validator_theme");
    if (stored === "dark" || stored === "darker") {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("validator_theme", theme);
  }, [theme]);

  useEffect(() => {
    const stored = window.localStorage.getItem("validator_focus_mode");
    if (stored === "1" || stored === "0") {
      setFocusMode(stored === "1");
      return;
    }
    // Default to focus OFF so pricing info is visible on Seeker
    setFocusMode(false);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("validator_focus_mode", focusMode ? "1" : "0");
  }, [focusMode]);

  // Always start on Signal Board (panel 0)
  useEffect(() => {
    window.localStorage.removeItem("validator-panel");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("validator-panel", String(activePanel));
  }, [activePanel]);

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
      const daily = await loadDailyData();
      if (!active) return;
      setSignalBoardData(daily.signalBoard);
      setNarrativesData(daily.narratives);
      setBriefingData(daily.briefing);
      setNewsCardsData(daily.newsCards);
      setMarketContextData(daily.marketContext);
    };
    run();
    const interval = window.setInterval(run, 30000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
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
    narrativesData?.generated_at ||
    narrativesData?.generatedAt ||
    narrativesData?.asOfUtc ||
    signalBoardData?.generated_at_utc ||
    signalBoardData?.date ||
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
      : utcDay >= 1 && utcDay <= 3;
  const signalShowNextWeek =
    typeof signalBoardData?.showNextWeek === "boolean"
      ? signalBoardData.showNextWeek
      : utcDay === 0 || utcDay >= 4;
  const signalPriceUpdate =
    stripSectionPrefix(signalBoardData?.priceUpdate) ||
    "24h and 7d are mixed; wait for cleaner confirmation before adding size.";
  const signalThisWeek =
    stripSectionPrefix(signalBoardData?.thisWeek) ||
    stripSectionPrefix(signalBoardData?.narrativeShifts) ||
    "Watch whether fresh demand follows through on the most recent Solana headlines.";
  const signalNextWeek =
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
    solPrice: pickMarket(marketContextData?.sol?.price, terminalData?.sol.priceUsd, marketCache?.sol?.price),
    sol24h: pickMarket(marketContextData?.sol?.change_24h, terminalData?.sol.change24hPct, marketCache?.sol?.change_24h),
    sol7d: pickMarket(marketContextData?.sol?.change_7d, terminalData?.sol.change7dPct, marketCache?.sol?.change_7d),
    mktCap: pickMarket(
      marketContextData?.mkt_cap?.solana_mkt_cap_usd,
      terminalData?.marketCap.totalUsd,
      marketCache?.mkt_cap?.solana_mkt_cap_usd,
    ),
    mktCap24h: pickMarket(marketContextData?.mkt_cap?.change_24h, terminalData?.marketCap.change24hPct, marketCache?.mkt_cap?.change_24h),
    fearValue: pickMarket(marketContextData?.fear_greed?.value, terminalData?.fearGreed.value, marketCache?.fear_greed?.value),
    fearLabel:
      marketContextData?.fear_greed?.label ||
      terminalData?.fearGreed.classification ||
      marketCache?.fear_greed?.label ||
      "n/a",
    btcDom: pickMarket(marketContextData?.btc_dominance?.value, terminalData?.btcDominance.valuePct, marketCache?.btc_dominance?.value),
    volUsd: pickMarket(marketContextData?.vol?.sol_24h_usd, marketCache?.vol?.sol_24h_usd),
    volChange24h: terminalData?.volume.change24hPct ?? null,
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
    <main className="page terminal-surface">
      <header className="header header-terminal">
        <div className="hero-copy">
          <h1 className="title" aria-label="VALIDATOR">
            <span className={`title-logo ${focusMode ? "title-logo-focus" : ""}`}>VALIDATOR</span>
            <span className="logo-cursor" aria-hidden="true">_</span>
          </h1>
          <p className="subtitle">
            {activePanel === 2 ? "PREMIUM INTELLIGENCE FOR SEEKER HOLDERS" : "SOLANA INTELLIGENCE TERMINAL"}
          </p>
          {isStaked && activePanel !== 2 ? (
            <span className="staked-chip">Staked — Enhanced Signal</span>
          ) : null}
        </div>
        <div className="header-actions">
          <button
            className={`focus-toggle ${focusMode ? "active" : ""}`}
            onClick={() => setFocusMode((prev) => !prev)}
            aria-label={focusMode ? "Disable Focus Mode" : "Enable Focus Mode"}
          >
            FOCUS
          </button>
          <button
            className="theme-toggle-icon"
            onClick={() => setTheme(theme === "darker" ? "dark" : "darker")}
            aria-label={toggleLabel}
          >
            {theme === "darker" ? "☾" : "☼"}
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
                    <div className="sb-item sb-item-price">
                      <div className="sb-item-head">
                        <span className="sb-item-label">MARKET CONTEXT</span>
                      </div>
                      <p className="sb-item-copy">
                        {signalPriceUpdate}
                      </p>
                    </div>
                    {signalShowPastWeek ? (
                      <div className="sb-item sb-item-past">
                        <div className="sb-item-head">
                          <span className="sb-item-label">PAST WEEK</span>
                        </div>
                        <p className="sb-item-copy">
                          {signalPastWeek}
                        </p>
                      </div>
                    ) : null}

                    <div className="sb-item sb-item-this">
                      <div className="sb-item-head">
                        <span className="sb-item-label">THIS WEEK</span>
                      </div>
                      <p className="sb-item-copy">
                        {signalThisWeek}
                      </p>
                    </div>

                    {signalShowNextWeek ? (
                      <div className="sb-item sb-item-next">
                        <div className="sb-item-head">
                          <span className="sb-item-label">NEXT WEEK</span>
                        </div>
                        <p className="sb-item-copy">
                          {signalNextWeek}
                        </p>
                      </div>
                    ) : null}
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
                      { label: "NEED TO KNOW", icon: "⚡", tone: "briefing-item-need", item: items[0] },
                      { label: "GOOD TO KNOW", icon: "↗", tone: "briefing-item-good", item: items[1] },
                      { label: "KEEP AN EYE ON", icon: "◉", tone: "briefing-item-keep", item: items[2] },
                    ];
                    return slots.map((slot, idx) => (
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
            <SeekerGuard>
              <section className="stories stories-seeker-fullscreen" id="top-story-feed">
                {(() => {
                  const stories = (newsCardsData?.items || []).slice(0, 3);
                  const globalMetrics = (newsCardsData as any)?.global_metrics || null;
                  const lead = stories[0];
                  const moreStories = stories.slice(1, 3);
                  const globalTweets = Number(
                    globalMetrics?.total_tweets ??
                    stories.reduce((sum, item) => {
                      const tweets = item?.metrics?.tweets ?? item?.stats?.total_tweets ?? 0;
                      return sum + Number(tweets);
                    }, 0)
                  );
                  const globalEng = Number(
                    globalMetrics?.total_engagement ??
                    stories.reduce((sum, item) => {
                      const engagement = item?.metrics?.engagement ?? item?.stats?.total_engagement ?? 0;
                      return sum + Number(engagement);
                    }, 0)
                  );
                  const globalTop = Number(
                    globalMetrics?.top_tweet ??
                    Math.max(
                      0,
                      ...stories.map((item) => Number(item?.metrics?.topTweet ?? item?.stats?.top_engagement ?? 0))
                    )
                  );
                  const globalVoices = Number(
                    globalMetrics?.unique_voices ??
                    stories.reduce((sum, item) => {
                      const voices = item?.metrics?.voices ?? item?.stats?.unique_users ?? 0;
                      return sum + Number(voices);
                    }, 0)
                  );

                  if (!lead) {
                    return (
                      <div className="news-empty">
                        Run node scripts/runDaily.mjs to generate today’s stories.
                      </div>
                    );
                  }

                  const leadCategory = String(lead?.category || "Daily Intel");
                  const leadIsCritical = /security|risk|breach|exploit|hack/i.test(leadCategory);
                  const leadIsAi = /ai|agent/i.test(leadCategory);
                  const leadIsGaming = /gaming|game/i.test(leadCategory);
                  return (
                    <div className="seeker-mag-shell">

                      <div className="seeker-mag-stats">
                        <div className="seeker-mag-stat">
                          <i><MessageCircle size={16} strokeWidth={1.8} /></i>
                          <strong>{globalTweets || 0}</strong>
                          <span>Tweets Analyzed</span>
                        </div>
                        <div className="seeker-mag-stat">
                          <i className="is-green"><TrendingUp size={16} strokeWidth={1.8} /></i>
                          <strong className="is-green">{formatCompactNumber(globalEng)}</strong>
                          <span>Total Engagement</span>
                        </div>
                        <div className="seeker-mag-stat">
                          <i><Users size={16} strokeWidth={1.8} /></i>
                          <strong>{globalVoices || 0}</strong>
                          <span>Unique Voices</span>
                        </div>
                        <div className="seeker-mag-stat">
                          <i className="is-purple"><Activity size={16} strokeWidth={1.8} /></i>
                          <strong className="is-purple">{formatCompactNumber(globalTop)}</strong>
                          <span>Top Tweet</span>
                        </div>
                      </div>

                      <div className="seeker-mag-divider" />

                      <div className="seeker-mag-kicker-row">
                        <span className={`seeker-mag-kicker ${leadIsCritical ? "critical" : leadIsAi ? "ai" : leadIsGaming ? "gaming" : ""}`}>
                          {String(lead.category || "Seeker Story").toUpperCase()}
                        </span>
                      </div>
                      <h2 className="seeker-mag-title">{lead.title}</h2>

                      <div className="seeker-mag-meta">
                        <span>By AI Validator News Desk</span>
                      </div>

                      <p className="seeker-mag-preview">
                        {compactSentence(
                          lead.content?.signal || lead.summary || lead.hook || lead.narrative || lead.title,
                          260,
                        )}
                      </p>

                      <div className="seeker-mag-cta-row">
                        <a
                          href="/seeker?story=0"
                          className={`seeker-mag-cta ${leadIsCritical ? "critical" : "primary"}`}
                        >
                          Read Full Story
                        </a>
                      </div>

                      {moreStories.length > 0 ? (
                        <div className="seeker-mag-more">
                          <h3>Featured Stories</h3>
                          <div className="seeker-mag-grid">
                            {moreStories.map((story, idx) => (
                              <a
                                key={`${story.title}-${idx}`}
                                href={`/seeker?story=${idx + 1}`}
                                className="seeker-mag-card"
                              >
                                <div className={`seeker-mag-thumb ${idx % 2 === 0 ? "live" : "alpha"}`}>
                                  {idx % 2 === 0 ? <Rocket size={38} /> : <Brain size={38} />}
                                </div>
                                <div className="seeker-mag-card-row">
                                  <span className={`seeker-mag-card-tag ${idx % 2 === 0 ? "live" : "alpha"}`}>
                                    {idx % 2 === 0 ? "LIVE" : "ALPHA"}
                                  </span>
                                  <span className="seeker-mag-card-time">
                                    {formatShortDate(story.timestamp || story.publishedAt || null)}
                                  </span>
                                </div>
                                <div className="seeker-mag-card-title">{story.title}</div>
                                <div className="seeker-mag-card-sub">
                                  {compactSentence(story.summary || story.hook || story.narrative || story.title, 85)}
                                </div>
                                <div className="seeker-mag-card-meta">
                                  {story?.metrics?.tweets ?? story?.stats?.total_tweets ?? 0} •{" "}
                                  {formatCompactNumber(story?.metrics?.engagement ?? story?.stats?.total_engagement ?? 0)}
                                </div>
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}

                    </div>
                  );
                })()}
              </section>
            </SeekerGuard>
          </div>
        </div >
      </div >

    </main >
  );
}
