"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
          <div className="market-metric-value">{formatPrice(marketView.solPrice)}</div>
          <div className={`market-metric-delta ${formatDelta(marketView.sol24h).cls}`}>
            {formatDelta(marketView.sol24h).text}
          </div>
        </div>
        <div className="market-metric">
          <div className="market-metric-label">7D</div>
          <div className={`market-metric-value ${formatDelta(marketView.sol7d).cls}`}>
            {formatDollarDelta(sol7dDollarDelta)}
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

// Force refresh for Story Mode update
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
  const [activePanel, setActivePanel] = useState(0);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [isSeeker, setIsSeeker] = useState(false);
  const carouselRef = useRef<HTMLDivElement | null>(null);
  const panelRefs = useRef<Array<HTMLDivElement | null>>([]);

  // Navigation State
  const touchStart = useRef<number | null>(null);
  const touchEnd = useRef<number | null>(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    touchEnd.current = null;
    touchStart.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEnd.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    const distance = touchStart.current - touchEnd.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      nextStory();
    } else if (isRightSwipe) {
      prevStory();
    }
  };

  const nextStory = () => {
    setCurrentStoryIndex((prev) =>
      prev < (newsCardsData?.items?.length || 1) - 1 ? prev + 1 : 0
    );
  };

  const prevStory = () => {
    setCurrentStoryIndex((prev) =>
      prev > 0 ? prev - 1 : (newsCardsData?.items?.length || 1) - 1
    );
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activePanel !== 2) return; // Only if News panel is active (index 2)
      if (e.key === "ArrowLeft") prevStory();
      if (e.key === "ArrowRight") nextStory();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePanel, newsCardsData]);



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
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    setFocusMode(isMobile);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("validator_focus_mode", focusMode ? "1" : "0");
  }, [focusMode]);

  useEffect(() => {
    const stored = window.localStorage.getItem("validator-panel");
    const idx = stored ? Number(stored) : 0;
    if (!Number.isNaN(idx) && idx >= 0 && idx <= 2) {
      setActivePanel(idx);
      requestAnimationFrame(() => {
        const node = panelRefs.current[idx];
        if (node) {
          node.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
        }
      });
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("validator-panel", String(activePanel));
  }, [activePanel]);


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
    return () => {
      active = false;
    };
  }, []);

  const toggleLabel = useMemo(
    () => (theme === "darker" ? "Switch to Dark" : "Switch to Darker"),
    [theme]
  );


  const scrollToPanel = (index: number) => {
    const node = panelRefs.current[index];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
      setActivePanel(index);
    }
  };

  const handleCarouselScroll = () => {
    const container = carouselRef.current;
    if (!container) return;
    const slideWidth = panelRefs.current[0]?.clientWidth ?? container.clientWidth;
    const gap = 16;
    const idx = Math.round(container.scrollLeft / (slideWidth + gap));
    if (idx !== activePanel) {
      setActivePanel(idx);
    }
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
  const signalShowPastWeek =
    typeof signalBoardData?.showPastWeek === "boolean" ? signalBoardData.showPastWeek : true;
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

  const marketView = {
    solPrice: marketContextData?.sol?.price ?? terminalData?.sol.priceUsd ?? null,
    sol24h: marketContextData?.sol?.change_24h ?? terminalData?.sol.change24hPct ?? null,
    sol7d: marketContextData?.sol?.change_7d ?? terminalData?.sol.change7dPct ?? null,
    mktCap: marketContextData?.mkt_cap?.solana_mkt_cap_usd ?? terminalData?.marketCap.totalUsd ?? null,
    mktCap24h: marketContextData?.mkt_cap?.change_24h ?? terminalData?.marketCap.change24hPct ?? null,
    fearValue: marketContextData?.fear_greed?.value ?? terminalData?.fearGreed.value ?? null,
    fearLabel: marketContextData?.fear_greed?.label ?? terminalData?.fearGreed.classification ?? "n/a",
    btcDom: marketContextData?.btc_dominance?.value ?? terminalData?.btcDominance.valuePct ?? null,
    volUsd: marketContextData?.vol?.sol_24h_usd ?? null,
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
      {activePanel !== 2 && (
        <header className="header header-terminal">
          <div className="hero-copy">
            <h1 className="title" aria-label="VALIDATOR">
              <span className={`title-logo ${focusMode ? "title-logo-focus" : ""}`}>VALIDATOR</span>
              <span className="logo-cursor" aria-hidden="true">_</span>
            </h1>
            <p className="subtitle">
              SOLANA INTELLIGENCE TERMINAL{" "}
              <span className="subtitle-seeker">SEEKER EXCLUSIVE</span>
            </p>
            {isStaked ? (
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
      )}

      {activePanel !== 2 && (
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
      )}

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

                    <div className="sb-item sb-item-next">
                      <div className="sb-item-head">
                        <span className="sb-item-label">NEXT WEEK</span>
                      </div>
                      <p className="sb-item-copy">
                        {signalNextWeek}
                      </p>
                    </div>
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
                <h2 className="morning-panel-title">{briefingData?.title || "STORIES YOU MAY HAVE MISSED THIS WEEK"}</h2>
              </div>
                <div className="briefing-subhead-row">
                  <span className="briefing-subhead-line" />
                  <span className="briefing-subhead-text">{briefingData?.subtitle || "Curated from trusted RSS sources (Solana-focused)"}</span>
                  <span className="briefing-subhead-line" />
                </div>
                <div className="briefing-card-stack">
                  {(() => {
                    const items = briefingData?.items || [];
                    const slots = [
                      { label: "NEED TO KNOW", icon: "⚡", tone: "briefing-card-need", item: items[0] },
                      { label: "GOOD TO KNOW", icon: "↗", tone: "briefing-card-good", item: items[1] },
                      { label: "KEEP AN EYE ON", icon: "◉", tone: "briefing-card-keep", item: items[2] },
                    ];
                    return slots.map((slot, idx) => (
                      <div key={idx} className={`briefing-card ${slot.tone}`}>
                        <div className="briefing-card-head">
                          <span className="briefing-card-icon">{slot.icon}</span>
                          <span className="briefing-card-label">{slot.label}</span>
                        </div>
                        {slot.item?.url ? (
                          <a
                            href={slot.item.url}
                            target="_blank"
                            rel="noreferrer"
                            className="briefing-story-link"
                          >
                            {slot.item.title}
                          </a>
                        ) : (
                          <p className="briefing-card-copy">
                            {slot.item?.title || "No confirmed high-signal update yet."}
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
            <section className="stories stories-seeker-fullscreen" id="top-story-feed">
              <div
                className="story-reader-container"
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                {/* Desktop Edge Click Zones */}
                <div className="nav-edge-zone nav-zone-left" onClick={prevStory} />
                <div className="nav-edge-zone nav-zone-right" onClick={nextStory} />

                {(() => {
                  const items = newsCardsData?.items ?? [];
                  const stories = items.slice(0, 3);
                  const story = stories[currentStoryIndex];
                  const total = stories.length || 0;
                  const current = total > 0 ? currentStoryIndex + 1 : 0;

                  if (!story) {
                    return (
                      <div className="news-empty">
                        Run node scripts/runDaily.mjs to generate today’s stories.
                      </div>
                    );
                  }

                  const citations = story.citations || [];
                  const sectionBullets = {
                    happening: Array.isArray(story.sections?.whatsActuallyHappening)
                      ? story.sections.whatsActuallyHappening.slice(0, 6)
                      : [],
                    degensCare: Array.isArray(story.sections?.whyDegensCare)
                      ? story.sections.whyDegensCare.slice(0, 4)
                      : [],
                    watchNext: Array.isArray(story.sections?.whatToWatchNext)
                      ? story.sections.whatToWatchNext.slice(0, 3)
                      : [],
                  };
                  const smartMoney = Array.isArray(story.smartMoneyWatching)
                    ? story.smartMoneyWatching.slice(0, 5)
                    : [];
                  const headlineRaw = String(story.title || "").trim();
                  const isUpdateStory = /^update:/i.test(headlineRaw);
                  const displayHeadline = headlineRaw.replace(/^update:\s*/i, "") || "Seeker Story";
                  const hookSource = story.hook || story.narrative || story.summary || story.whyItMatters || story.title;
                  const { hookText, premiumText } = splitHookAndPremium(hookSource);
                  const premiumLead =
                    premiumText ||
                    compactSentence(story.narrative || story.marketStructure || story.summary, 280);
                  const inlineBlurLead = compactSentence(premiumLead, 170);
                  const storyParagraphs = String(
                    story.story ||
                    [story.narrative, story.marketStructure, story.smartMoney, story.positioning].filter(Boolean).join("\n\n")
                  )
                    .split(/\n{2,}/)
                    .map((p) => p.trim())
                    .filter(Boolean)
                    .slice(0, 5);
                  const takeaways = Array.isArray(story.takeaways) && story.takeaways.length > 0
                    ? story.takeaways.slice(0, 3)
                    : [
                      compactSentence(story.whyItMatters || story.positioningTake, 110),
                      ...sectionBullets.watchNext.slice(0, 2).map((s) => compactSentence(s, 100)),
                    ].filter(Boolean).slice(0, 3);
                  const whoToFollow = Array.isArray(story.whoToFollow) && story.whoToFollow.length > 0
                    ? story.whoToFollow.slice(0, 4)
                    : (story.ctPulse || []).map((p: any) => ({
                      handle: formatXHandle(p.handle),
                      role: "Community",
                      engagement: null,
                    })).slice(0, 4);
                  const stats = story.stats || {
                    total_tweets: (story.ctPulse || []).length,
                    total_engagement: null,
                    top_engagement: null,
                  };


                  const isLocked = !isSeeker;

                  return (
                    <>
                      {/* 1. READER HEADER */}
                      <div className="reader-header premium-header">
                        <div className="reader-brand">
                          <span className="title-logo seeker-brand-logo">VALIDATOR</span>
                          <span className="logo-cursor seeker-brand-cursor" aria-hidden="true">_</span>
                        </div>
                        <div className="reader-context">
                          <span className="seeker-context-label">SEEKER OWNERS ONLY</span>
                          <span className="seeker-context-progress">{current}/{total}</span>
                        </div>
                      </div>

                      <article className="story-card story-mode">
                        <div className="story-alert-row story-kicker-row">
                          <span className="story-alert-left story-kicker-pill">{isUpdateStory ? "UPDATE" : "DAILY INTEL"}</span>
                          <span className="story-alert-right story-kicker-meta">TODAY'S SEEKER STORY</span>
                        </div>

                        <a href={story.url} target="_blank" rel="noreferrer" className="story-main-link">
                          <h3 className="story-headline story-headline-large">{displayHeadline}</h3>
                        </a>

                        {/* 4. SECTIONS */}
                        <div className="briefing-grid space-y-6">
                          {/* HOOK (Free - Fully Visible) */}
                          <div className="briefing-section">
                            <div className="story-section-pill">THE SIGNAL</div>
                            <div className="briefing-content font-medium text-[15px] leading-relaxed">
                              {hookText || compactSentence(story.hook || story.title, 180)}
                            </div>
                            {isLocked && inlineBlurLead ? (
                              <div className="seeker-inline-blur">
                                {inlineBlurLead}
                              </div>
                            ) : null}
                          </div>

                          {isLocked ? (
                            <div className="seeker-teaser-stack">
                              <div className="seeker-premium-wrap">
                                <div className="seeker-gate-sticky">
                                  <div className="seeker-gate-card seeker-gate-card-overlay">
                                    <div className="seeker-gate-icon">⚡</div>
                                    <div className="seeker-gate-title">SEEKER ACCESS REQUIRED</div>
                                    <div className="seeker-gate-subtitle">Hardware-verified intelligence layer</div>
                                    <button
                                      className="seeker-gate-verify-btn"
                                      onClick={() => setIsSeeker(true)}
                                    >
                                      Verify Device →
                                    </button>
                                  </div>
                                </div>

                                <div className="seeker-premium-scrim" aria-hidden="true" />

                                <div className="seeker-premium-content">
                                  <div className="seeker-premium-block seeker-premium-lead">
                                    <p className="seeker-premium-paragraph">
                                      {premiumLead}
                                    </p>
                                  </div>

                                  <div className="seeker-premium-block">
                                    <div className="story-section-pill">THE NARRATIVE</div>
                                    <p className="seeker-premium-paragraph">
                                      {compactSentence(story.narrative || story.summary || story.marketStructure, 320)}
                                    </p>
                                    <p className="seeker-premium-paragraph">
                                      {compactSentence(story.marketStructure || story.whyItMatters || story.summary, 300)}
                                    </p>
                                  </div>

                                  <div className="seeker-premium-block">
                                    <div className="story-section-pill">WHY IT MATTERS</div>
                                    <p className="seeker-premium-paragraph">
                                      {compactSentence(story.whyItMatters || story.positioningTake || story.traderTake, 300)}
                                    </p>
                                    <p className="seeker-premium-paragraph">
                                      {compactSentence(story.smartMoney || story.bullCase || story.bearCase, 280)}
                                    </p>
                                  </div>

                                  <div className="seeker-premium-block">
                                    <div className="story-section-pill">WHAT TO WATCH</div>
                                    <ul className="seeker-premium-list">
                                      {(
                                        sectionBullets.watchNext.length > 0
                                          ? sectionBullets.watchNext
                                          : [
                                            story.whatToWatch,
                                            story.watchlist,
                                            story.positioningTake,
                                          ]
                                      )
                                        .filter(Boolean)
                                        .slice(0, 3)
                                        .map((item, i) => (
                                          <li key={i}>{compactSentence(String(item), 110)}</li>
                                        ))}
                                    </ul>
                                  </div>

                                  <div className="seeker-premium-block">
                                    <div className="story-section-pill">WHO'S TALKING</div>
                                    <p className="seeker-premium-paragraph">
                                      {story.ctPulse && story.ctPulse.length > 0
                                        ? `Mentioned by ${Array.from(
                                          new Set(
                                            story.ctPulse
                                              .map((pulse) => formatXHandle(pulse.handle))
                                              .filter(Boolean)
                                          )
                                        )
                                          .slice(0, 4)
                                          .join(", ")}. ${summarizeCtConversation(story.ctPulse, story)}`
                                        : "Builders and traders are signaling this theme as an active discussion point."}
                                    </p>
                                  </div>

                                  <div className="seeker-premium-block">
                                    <div className="story-section-pill">TRADER TAKE</div>
                                    <p className="seeker-premium-paragraph">
                                      {compactSentence(story.traderTake || story.positioningTake || story.bearCase, 220)}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {/* PREMIUM SECTIONS (Unified Container) */}
                          <div className="transition-all duration-500">

                            {!isLocked && (
                              <>
                                <div className="seeker-cards">
                                  <div className="seeker-card seeker-card-signal">
                                    <div className="seeker-card-label">The Signal</div>
                                    <p className="seeker-card-copy">{compactSentence(story.summary || story.hook || story.title, 220)}</p>
                                  </div>

                                  <div className="seeker-card seeker-card-stats">
                                    <div className="seeker-card-label">Stats</div>
                                    <div className="seeker-stats-grid">
                                      <div className="seeker-stat">
                                        <span className="seeker-stat-k">Tweets</span>
                                        <span className="seeker-stat-v">{stats.total_tweets ?? "n/a"}</span>
                                      </div>
                                      <div className="seeker-stat">
                                        <span className="seeker-stat-k">Engagement</span>
                                        <span className="seeker-stat-v">{stats.total_engagement ?? "n/a"}</span>
                                      </div>
                                      <div className="seeker-stat">
                                        <span className="seeker-stat-k">Top Tweet</span>
                                        <span className="seeker-stat-v">{stats.top_engagement ?? "n/a"}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="seeker-card seeker-card-story">
                                    <div className="seeker-card-label">Story</div>
                                    <div className="seeker-story-body">
                                      {storyParagraphs.map((paragraph, idx) => (
                                        <p key={idx}>{paragraph}</p>
                                      ))}
                                    </div>
                                  </div>

                                  {takeaways.length > 0 && (
                                    <div className="seeker-card seeker-card-takeaways">
                                      <div className="seeker-card-label">Takeaways</div>
                                      <ol className="seeker-takeaway-list">
                                        {takeaways.map((item, idx) => (
                                          <li key={idx}>{item}</li>
                                        ))}
                                      </ol>
                                    </div>
                                  )}

                                  {whoToFollow.length > 0 && (
                                    <div className="seeker-card seeker-card-follow">
                                      <div className="seeker-card-label">Who To Follow</div>
                                      <div className="seeker-follow-list">
                                        {whoToFollow.map((person: any, idx: number) => {
                                          const handle = formatXHandle(person.handle);
                                          const profile = handle ? `https://x.com/${normalizeXHandle(handle)}` : null;
                                          return (
                                            <div className="seeker-follow-row" key={`${handle}-${idx}`}>
                                              {profile ? (
                                                <a href={profile} target="_blank" rel="noreferrer" className="seeker-follow-handle">{handle}</a>
                                              ) : (
                                                <span className="seeker-follow-handle">{handle || "Unknown"}</span>
                                              )}
                                              <span className="seeker-follow-role">{person.role || "Community"}</span>
                                              <span className="seeker-follow-eng">{person.engagement ? `${person.engagement}` : "—"}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </>
                            )}

                          </div>

                        </div>

                        <div className="story-source-footnote">
                          Source: {story.source}
                        </div>
                      </article>
                    </>
                  );
                })()}

                <div className="reader-controls">
                  <button
                    className="reader-nav-btn"
                    onClick={prevStory}
                    aria-label="Previous Story"
                  >
                    ←
                  </button>
                  <div className="reader-dots">
                    {(newsCardsData?.items || []).map((_, idx) => (
                      <div key={idx} className={`reader-dot ${idx === currentStoryIndex ? 'active' : ''}`} />
                    ))}
                  </div>
                  <button
                    className="reader-nav-btn"
                    onClick={nextStory}
                    aria-label="Next Story"
                  >
                    →
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div >
        <div className="panel-dots">
          {[0, 1, 2].map((idx) => (
            <button
              key={idx}
              type="button"
              className={`panel-dot ${activePanel === idx ? "active" : ""}`}
              aria-label={`Go to panel ${idx + 1}`}
              onClick={() => scrollToPanel(idx)}
            />
          ))}
        </div>
      </div >

    </main >
  );
}
