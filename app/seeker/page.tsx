"use client";

/**
 * Seeker Page (Token Gated)
 * 
 * Displays the "Gossip Magazine" interface — a premium content feed available
 * only to holders of the Seeker Genesis Token.
 * 
 * Features:
 * - Lazy loading of story content
 * - Specialized "Cover Story" layout for the lead item
 * - Grid layout for featured stories
 * - Deep-dive story detail view with timeline, quotes, and analysis
 */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  Brain,
  ChevronLeft,
  MessageCircle,
  Rocket,
  TrendingUp,
  Users,
} from "lucide-react";

type Story = {
  title?: string;
  category?: string;
  timestamp?: string;
  publishedAt?: string;
  url?: string;
  summary?: string;
  hook?: string;
  narrative?: string;
  story?: string;
  takeaways?: string[];
  metrics?: {
    tweets?: number;
    engagement?: number;
    voices?: number;
    topTweet?: number;
  };
  stats?: {
    total_tweets?: number;
    total_engagement?: number;
    unique_users?: number;
    top_tweet?: number;
  };
  content?: {
    signal?: string;
    story?: string;
  };
  sections?: Record<string, any>;
};

type StoryPayload = {
  stories?: Story[];
  items?: Story[];
  global_metrics?: {
    total_tweets?: number;
    total_engagement?: number;
    unique_voices?: number;
    top_tweet?: number;
  };
};

export default function SeekerPage() {
  return (
    <Suspense fallback={<div className="seeker-loading">Loading stories...</div>}>
      <SeekerPageInner />
    </Suspense>
  );
}

function SeekerPageInner() {
  const searchParams = useSearchParams();
  const [stories, setStories] = useState<Story[]>([]);
  const [globalMetrics, setGlobalMetrics] = useState<StoryPayload["global_metrics"]>({});
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/stories", { cache: "no-store" });
        const data: StoryPayload = await res.json();
        const list = (data.stories || data.items || []).filter(Boolean);
        setStories(list);
        setGlobalMetrics(data.global_metrics || {});
      } catch (err) {
        console.error("Failed to load seeker stories", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!stories.length) return;
    const raw = searchParams.get("story");
    if (raw === null) {
      setSelectedIndex(-1);
      return;
    }
    const idx = Number(raw);
    if (!Number.isFinite(idx)) return;
    const clamped = Math.max(0, Math.min(stories.length - 1, idx));
    setSelectedIndex(clamped);
  }, [searchParams, stories]);

  const computedGlobal = useMemo(() => {
    const totalTweets = Number(
      globalMetrics?.total_tweets ?? stories.reduce((s, item) => s + Number(item?.metrics?.tweets ?? item?.stats?.total_tweets ?? 0), 0),
    );
    const totalEngagement = Number(
      globalMetrics?.total_engagement ?? stories.reduce((s, item) => s + Number(item?.metrics?.engagement ?? item?.stats?.total_engagement ?? 0), 0),
    );
    const uniqueVoices = Number(
      globalMetrics?.unique_voices ?? stories.reduce((s, item) => s + Number(item?.metrics?.voices ?? item?.stats?.unique_users ?? 0), 0),
    );
    const topTweet = Number(
      globalMetrics?.top_tweet ?? Math.max(0, ...stories.map((item) => Number(item?.metrics?.topTweet ?? item?.stats?.top_tweet ?? 0))),
    );

    return {
      totalTweets,
      totalEngagement,
      uniqueVoices,
      topTweet,
    };
  }, [globalMetrics, stories]);

  if (loading) {
    return <div className="seeker-loading">Loading stories...</div>;
  }

  if (!stories.length) {
    return <div className="seeker-loading">No stories available.</div>;
  }

  const lead = stories[0];
  const current = selectedIndex >= 0 ? stories[selectedIndex] : null;

  return (
    <div className="seeker-page">
      {current ? (
        <StoryDetail
          story={current}
          index={selectedIndex}
          total={stories.length}
          onBack={() => setSelectedIndex(-1)}
        />
      ) : (
        <MagazineCover
          stories={stories}
          lead={lead}
          totals={computedGlobal}
          onOpenStory={(index) => setSelectedIndex(index)}
        />
      )}
    </div>
  );
}

function MagazineCover({
  stories,
  lead,
  totals,
  onOpenStory,
}: {
  stories: Story[];
  lead: Story;
  totals: { totalTweets: number; totalEngagement: number; uniqueVoices: number; topTweet: number };
  onOpenStory: (index: number) => void;
}) {
  const leadCategory = String(lead?.category || "Daily Intel").toUpperCase();
  const leadColorClass = getKickerClass(leadCategory);

  // Logic to prioritize variety in Featured Stories
  // defined as: distinct categories from the lead story + distinct from each other
  const otherStories = stories.slice(1);
  const distinctStories: Story[] = [];
  const usedCategories = new Set([String(lead.category || "").split("/")[0].trim()]);

  // Pass 1: Find stories with unused categories
  for (const s of otherStories) {
    if (distinctStories.length >= 2) break;
    const cat = String(s.category || "").split("/")[0].trim();
    if (!usedCategories.has(cat)) {
      distinctStories.push(s);
      usedCategories.add(cat);
    }
  }

  // Pass 2: Fill remaining slots with whatever is available (skipping exact duplicates if possible)
  if (distinctStories.length < 2) {
    for (const s of otherStories) {
      if (distinctStories.length >= 2) break;
      if (!distinctStories.includes(s)) {
        distinctStories.push(s);
      }
    }
  }

  const moreStories = distinctStories;

  return (
    <div className="seeker-mag-shell">
      <div className="seeker-mag-header">
        <div>
          <h1 className="seeker-mag-logo">
            <span className="title-logo">GOSSIP</span>
            <span className="logo-cursor" aria-hidden="true">_</span>
          </h1>
          <p className="seeker-mag-sub">Premium Intelligence • {formatShortDate(lead?.timestamp || lead?.publishedAt)}</p>
        </div>
        <div className="seeker-mag-issue">
          <div className="seeker-mag-issue-label">Issue</div>
          <div className="seeker-mag-issue-value">#{Math.max(stories.length, 1)}</div>
        </div>
      </div>

      <div className="seeker-mag-stats seeker-mag-stats-compact">
        <div className="seeker-mag-stat">
          <i><MessageCircle size={14} strokeWidth={1.8} /></i>
          <strong>{totals.totalTweets || 0}</strong>
          <span>Tweets Analyzed</span>
        </div>
        <div className="seeker-mag-stat">
          <i className="is-green"><TrendingUp size={14} strokeWidth={1.8} /></i>
          <strong className="is-green">{formatCompactNumber(totals.totalEngagement)}</strong>
          <span>Total Engagement</span>
        </div>
        <div className="seeker-mag-stat">
          <i><Users size={14} strokeWidth={1.8} /></i>
          <strong>{totals.uniqueVoices || 0}</strong>
          <span>Unique Voices</span>
        </div>
        <div className="seeker-mag-stat">
          <i className="is-purple"><Activity size={14} strokeWidth={1.8} /></i>
          <strong className="is-purple">{formatCompactNumber(totals.topTweet)}</strong>
          <span>Top Tweet</span>
        </div>
      </div>

      <div className="seeker-mag-divider" />

      <div className="seeker-mag-kicker-row">
        <span className={`seeker-mag-kicker ${leadColorClass}`}>{leadCategory}</span>
      </div>

      <h2 className="seeker-mag-title seeker-mag-title-cover">{cleanTitle(lead?.title) || "Untitled"}</h2>

      <div className="seeker-mag-meta">
        <span>By AI Gossip News Desk</span>
      </div>

      <p className="seeker-mag-preview">
        {compactSentence(lead?.content?.signal || lead?.summary || lead?.hook || lead?.narrative || lead?.title || "", 450)}
      </p>

      <div className="seeker-mag-cta-row">
        <button className="seeker-mag-cta primary" onClick={() => onOpenStory(0)} type="button">
          Read Analysis
        </button>
      </div>

      {moreStories.length > 0 ? (
        <div className="seeker-mag-more">
          <h3>Featured Stories</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "20px" }}>
            {moreStories.map((story, idx) => {
              const category = String(story?.category || "Intel").split("/")[0].trim();
              const isAlert = /risk|security|alert/i.test(String(story?.category || ""));
              const signal = story?.content?.signal || story?.summary || story?.title || "";

              const dateRaw = new Date(story?.timestamp || story?.publishedAt || Date.now());
              const dateStr = dateRaw.toLocaleDateString("en-US", { day: "numeric", month: "short" });
              const title = cleanTitle(story?.title);

              return (
                <button
                  key={`${story?.title || "story"}-${idx}`}
                  className="group relative overflow-hidden transition-all active:scale-[0.98]"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "100%",
                    minHeight: "260px",
                    textAlign: "left",
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: "20px",
                    padding: "24px",
                  }}
                  onClick={() => onOpenStory(idx + 1)}
                  type="button"
                >
                  {/* Category Pill */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: "16px" }}>
                    <span style={{
                      fontSize: "11px",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      padding: "4px 8px",
                      borderRadius: "6px",
                      textTransform: "uppercase",
                      backgroundColor: isAlert ? "rgba(239, 68, 68, 0.15)" : "rgba(168, 85, 247, 0.15)",
                      color: isAlert ? "#fca5a5" : "#d8b4fe",
                      border: isAlert ? "1px solid rgba(239, 68, 68, 0.2)" : "1px solid rgba(168, 85, 247, 0.2)"
                    }}>
                      {category}
                    </span>
                    <span className="text-[11px] text-white/40 font-mono tracking-tight">
                      {dateStr}
                    </span>
                  </div>

                  {/* Title - Clamped to 3 lines */}
                  <h4 className="text-[15px] font-bold text-white/90 leading-snug mb-3" style={{
                    height: "66px",
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 3,
                    marginBottom: "12px"
                  }}>
                    {title}
                  </h4>

                  {/* Summary/Signal - Clamped to 5 lines */}
                  <p className="text-[13px] text-white/50 leading-relaxed" style={{
                    flex: 1,
                    overflow: "hidden",
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 5,
                    marginBottom: "16px"
                  }}>
                    {compactSentence(signal, 200)}
                  </p>

                  {/* Footer / Read More */}
                  <div className="flex items-center text-[10px] font-medium text-purple-400/80 group-hover:text-purple-300 transition-colors mt-auto uppercase tracking-wide">
                    Read Analysis <ChevronLeft className="rotate-180 ml-1 w-2.5 h-2.5 group-hover:translate-x-1 transition-transform" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StoryDetail({ story, index, total, onBack }: { story: Story; index: number; total: number; onBack: () => void }) {
  const metrics = {
    tweets: Number(story?.metrics?.tweets ?? story?.stats?.total_tweets ?? 0),
    engagement: Number(story?.metrics?.engagement ?? story?.stats?.total_engagement ?? 0),
    voices: Number(story?.metrics?.voices ?? story?.stats?.unique_users ?? 0),
    topTweet: Number(story?.metrics?.topTweet ?? story?.stats?.top_tweet ?? 0),
  };

  const sections = (story?.sections && typeof story.sections === "object") ? story.sections : {};
  const timeline = Array.isArray(sections.timeline) ? sections.timeline : [];
  const keyQuotes = Array.isArray(sections.keyQuotes) ? sections.keyQuotes : [];
  const keyPlayers = Array.isArray(sections.keyPlayers) ? sections.keyPlayers : [];
  const takeaways = Array.isArray(story?.takeaways) ? story.takeaways : [];

  const fullText = String(story?.content?.story || story?.story || story?.narrative || "").replace(/\[object Object\]/g, "").trim();
  const bodyParagraphs = fullText.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

  const analysisCards = [
    { title: "What Happened", value: sections.whatHappened || story?.narrative },
    { title: "Why It Matters", value: sections.whyItMatters || story?.summary },
    { title: "Market Impact", value: story?.content?.signal || sections.marketImpact },
    { title: "What to Watch", value: sections.whatToWatch || story?.hook },
  ].filter((item) => typeof item.value === "string" && item.value.trim().length > 0);

  return (
    <div className="seeker-detail-shell">
      <button className="seeker-detail-back" onClick={onBack} type="button">
        <ChevronLeft size={16} /> Back to Magazine
      </button>

      <div className="seeker-detail-header">
        <div>
          <h1 className="seeker-mag-logo seeker-detail-logo">
            <span className="title-logo">GOSSIP</span>
            <span className="logo-cursor" aria-hidden="true">_</span>
          </h1>
          <p className="seeker-detail-sub">Premium Intelligence • {formatShortDate(story?.timestamp || story?.publishedAt)}</p>
        </div>
        <div className="seeker-detail-issue">
          <div className="seeker-mag-issue-label">Issue</div>
          <div className="seeker-mag-issue-value seeker-detail-issue-value">#{Math.max(index + 1, 1)}</div>
          <div className="seeker-detail-count">{index + 1}/{Math.max(total, 1)}</div>
        </div>
      </div>

      <div className="seeker-detail-hero">
        <div className={`seeker-mag-kicker ${getKickerClass(String(story?.category || ""))}`}>
          {String(story?.category || "Seeker Story").toUpperCase()}
        </div>
        <h2 className="seeker-detail-title">{story?.title || "Untitled"}</h2>
        <p className="seeker-detail-author">Analysis by AI Gossip News Desk</p>
      </div>

      <div className="seeker-detail-metrics">
        <div className="seeker-detail-metric-card">
          <MessageCircle size={16} />
          <strong>{metrics.tweets}</strong>
          <span>Tweets</span>
        </div>
        <div className="seeker-detail-metric-card">
          <TrendingUp size={16} className="is-green" />
          <strong className="is-green">{formatCompactNumber(metrics.engagement)}</strong>
          <span>Engage</span>
        </div>
        <div className="seeker-detail-metric-card">
          <Users size={16} />
          <strong>{metrics.voices}</strong>
          <span>Voices</span>
        </div>
        <div className="seeker-detail-metric-card">
          <Activity size={16} className="is-purple" />
          <strong className="is-purple">{formatCompactNumber(metrics.topTweet)}</strong>
          <span>Top</span>
        </div>
      </div>

      {timeline.length > 0 ? (
        <section className="seeker-detail-card">
          <h3>Event Timeline</h3>
          <div className="seeker-detail-timeline">
            {timeline.map((event: any, idx: number) => (
              <div key={`${event?.date || "event"}-${idx}`} className="seeker-detail-timeline-row">
                <span className={`dot ${timelineDotClass(event?.impact)}`} />
                <div>
                  <small>{String(event?.date || "")}</small>
                  <p>{String(event?.event || "")}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {keyQuotes.length > 0 ? (
        <section className="seeker-detail-card">
          <h3>Key Voices</h3>
          <div className="seeker-detail-quotes">
            {keyQuotes.map((quote: any, idx: number) => (
              <article key={`${quote?.author || "quote"}-${idx}`} className={`seeker-quote ${quoteColorClass(quote?.sentiment)}`}>
                <p>&ldquo;{String(quote?.text || "")}&rdquo;</p>
                <small>{String(quote?.author || "")}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {keyPlayers.length > 0 ? (
        <section className="seeker-detail-card">
          <h3>Key Players</h3>
          <div className="seeker-detail-players">
            {keyPlayers.map((player: any, idx: number) => (
              <div key={`${player?.name || "player"}-${idx}`} className="seeker-detail-player-row">
                <div>
                  <p>{String(player?.name || "")}</p>
                  <small>{String(player?.role || "")}{player?.stance ? ` • ${player.stance}` : ""}</small>
                </div>
                <span>{String(player?.influence || "")}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {analysisCards.length > 0 ? (
        <section className="seeker-detail-card">
          <h3>Analysis</h3>
          <div className="seeker-detail-analysis-list">
            {analysisCards.map((card) => (
              <article key={card.title} className="seeker-detail-analysis-item">
                <h4>{card.title}</h4>
                <p>{String(card.value)}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {takeaways.length > 0 ? (
        <section className="seeker-detail-card seeker-detail-actions-card">
          <h3>What To Do Now</h3>
          <ul>
            {takeaways.slice(0, 4).map((takeaway, idx) => (
              <li key={`${takeaway}-${idx}`}>{takeaway}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {bodyParagraphs.length > 0 ? (
        <section className="seeker-detail-card">
          <h3>Full Story</h3>
          <div className="seeker-detail-body">
            {bodyParagraphs.map((p, idx) => (
              <p key={`${p.slice(0, 40)}-${idx}`}>{p}</p>
            ))}
          </div>
        </section>
      ) : null}

      <div className="seeker-detail-disclaimer">
        AI-generated analysis from on-chain and social signal data. Verify critical claims with primary sources before acting.
      </div>
    </div>
  );
}

function getKickerClass(categoryRaw: string) {
  const category = String(categoryRaw || "").toLowerCase();
  if (/security|risk|breach|exploit|hack/.test(category)) return "critical";
  if (/ai|agent/.test(category)) return "ai";
  if (/gaming|game/.test(category)) return "gaming";
  return "";
}

function timelineDotClass(impactRaw: unknown) {
  const impact = String(impactRaw || "").toLowerCase();
  if (impact === "high") return "high";
  if (impact === "medium") return "medium";
  return "low";
}

function quoteColorClass(sentimentRaw: unknown) {
  const sentiment = String(sentimentRaw || "").toLowerCase();
  if (sentiment === "negative") return "negative";
  if (sentiment === "positive") return "positive";
  return "neutral";
}

function formatCompactNumber(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return `${Math.round(value)}`;
}

function formatShortDate(value?: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function compactSentence(value: string, maxLen = 180) {
  const cleaned = String(value || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
}

function cleanTitle(title?: string) {
  if (!title) return "Untitled Intelligence";
  const cleaned = title
    .replace(/^RT\s+@[^:]+:?\s*/i, "") // Remove RT @user: prefix
    .replace(/https?:\/\/\S+/g, "")   // Remove URLs
    .replace(/\s+/g, " ")             // Normalize whitespace
    .trim();

  if (cleaned.length > 85) {
    return cleaned.slice(0, 85).trimEnd() + "…";
  }
  return cleaned;
}
