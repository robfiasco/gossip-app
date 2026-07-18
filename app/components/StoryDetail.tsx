"use client";

import React from "react";
import { ChevronLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import ScrollMatrixBackground from "./ScrollMatrixBackground";
import { getKickerClass, getKickerColor, getSignalLabel } from "../lib/categories";

type Story = {
    category?: string;
    title?: string;
    timestamp?: string;
    publishedAt?: string;
    sections?: {
        timeline?: Array<{ date?: string; event?: string; impact?: string }>;
        keyQuotes?: Array<{ text?: string; author?: string; sentiment?: string }>;
        keyPlayers?: Array<{ name?: string; role?: string }>;
        [key: string]: unknown;
    };
    takeaways?: string[];
    watchTrigger?: string | null;
    content?: { story?: string; signal?: string };
    story?: string;
    narrative?: string;
    summary?: string;
    hook?: string;
    ctPulse?: Array<{ handle?: string; thought?: string; url?: string }>;
    whoToFollow?: Array<{ handle?: string; reason?: string; role?: string }>;
    narrativeStrength?: number;
    sourceUrl?: string | null;
    metrics?: { symbol?: string | null; tokenSymbol?: string | null; priceUsd?: number | null; tokenPriceUsd?: number | null };
};

const formatTokenPrice = (price: number) => {
    if (price >= 1) return `$${price.toFixed(2)}`;
    if (price >= 0.01) return `$${price.toFixed(4)}`;
    return `$${price.toPrecision(3)}`;
};

export default function StoryDetail({ story, index, total, onBack, publishDate }: { story: Story; index: number; total: number; onBack: () => void; publishDate?: string | null }) {
    const sections = (story?.sections && typeof story.sections === "object") ? story.sections : {};
    const timeline = Array.isArray(sections.timeline) ? sections.timeline : [];
    const keyQuotes = Array.isArray(sections.keyQuotes) ? sections.keyQuotes : [];
    const keyPlayers = Array.isArray(sections.keyPlayers) ? sections.keyPlayers : [];
    const takeaways = Array.isArray(story?.takeaways) ? story.takeaways : [];
    const tokenSymbol = story?.metrics?.tokenSymbol || story?.metrics?.symbol || null;
    const tokenPrice = story?.metrics?.tokenPriceUsd ?? story?.metrics?.priceUsd ?? null;
    const sourceUrl = story?.sourceUrl || null;

    const fullText = String(story?.content?.story || story?.story || story?.narrative || "")
        .replace(/\[object Object\]/g, "")
        .replace(/\\n/g, "\n"); // normalize literal \n from LLM output

    return (
        <div className="seeker-detail-shell" style={{ paddingBottom: "100px", zIndex: 9999, position: "relative" }} >
            <ScrollMatrixBackground color={getKickerColor(String(story?.category || ""))} />

            <button className="seeker-detail-back" onClick={onBack} type="button">
                <ChevronLeft size={16} /> Back
            </button>

            <div className="seeker-detail-hero">
                <div className={`seeker-mag-kicker ${getKickerClass(String(story?.category || ""))}`}>
                    <span className="seeker-signal-dot" style={{ background: getKickerColor(String(story?.category || "")) }} />
                    {getSignalLabel(String(story?.category || ""))}
                </div>

                <h2 className="seeker-detail-title">{story?.title || "Untitled"}</h2>

                <p className="seeker-detail-author">Signal analysis from Gossip</p>

                <p className="seeker-freshness">{formatFreshness(story?.timestamp || story?.publishedAt)}</p>

                {story?.narrativeStrength != null && (
                    <div className="seeker-signal-strength">
                        <span className="seeker-signal-strength-label">Signal Strength</span>
                        <span className="seeker-signal-strength-bar">
                            {"█".repeat(Math.round(story.narrativeStrength))}{"░".repeat(10 - Math.round(story.narrativeStrength))}
                        </span>
                        <span className="seeker-signal-strength-value">{story.narrativeStrength}/10</span>
                    </div>
                )}

                <div className="seeker-header-divider" />
            </div>

            {
                timeline.length > 0 ? (
                    <section className="seeker-detail-card">
                        <h3>Event Timeline</h3>
                        <div className="seeker-detail-timeline">
                            {timeline.map((event: { date?: string; event?: string; impact?: string }, idx: number) => (
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
                ) : null
            }

            {
                keyQuotes.length > 0 ? (
                    <section className="seeker-detail-card">
                        <h3>Key Voices</h3>
                        <div className="seeker-detail-quotes">
                            {keyQuotes.map((quote: { text?: string; author?: string; sentiment?: string }, idx: number) => (
                                <article key={`${quote?.author || "quote"}-${idx}`} className={`seeker-quote ${quoteColorClass(quote?.sentiment)}`}>
                                    <p>&ldquo;{String(quote?.text || "")}&rdquo;</p>
                                    <small>{String(quote?.author || "")}</small>
                                </article>
                            ))}
                        </div>
                    </section>
                ) : null
            }

            {
                keyPlayers.length > 0 ? (
                    <section className="seeker-detail-card">
                        <h3>Key Players</h3>
                        <div className="seeker-detail-players">
                            {keyPlayers.map((player: { name?: string; role?: string; stance?: string; influence?: string }, idx: number) => (
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
                ) : null
            }

            {
                story?.watchTrigger ? (
                    <section className="seeker-detail-card seeker-detail-watch-card">
                        <h3>Watch Trigger</h3>
                        <p>{story.watchTrigger}</p>
                    </section>
                ) : null
            }

            {
                takeaways.length > 0 ? (
                    <section className="seeker-detail-card seeker-detail-actions-card">
                        <h3>What To Do Now</h3>
                        <ul>
                            {takeaways.slice(0, 4).map((takeaway, idx) => (
                                <li key={`${takeaway}-${idx}`}>{takeaway}</li>
                            ))}
                        </ul>
                    </section>
                ) : null
            }

            {
                (tokenSymbol || sourceUrl) ? (
                    <section className="seeker-detail-card">
                        {tokenSymbol && (
                            <p>
                                <strong>{tokenSymbol}</strong>
                                {typeof tokenPrice === "number" && ` — ${formatTokenPrice(tokenPrice)}`}
                            </p>
                        )}
                        {sourceUrl && (
                            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="seeker-handle-chip">
                                View Source ↗
                            </a>
                        )}
                    </section>
                ) : null
            }

            {
                fullText ? (
                    <section className="seeker-editorial-body">
                        <ReactMarkdown>{fullText}</ReactMarkdown>
                    </section>
                ) : null
            }

            {(() => {
                const ctHandles = Array.isArray(story?.ctPulse)
                    ? [...new Set(story.ctPulse.map(p => p?.handle).filter(Boolean))] as string[]
                    : [];
                const followHandles = Array.isArray(story?.whoToFollow)
                    ? [...new Set(story.whoToFollow.map(p => p?.handle).filter(Boolean))] as string[]
                    : [];
                // Deduplicate: don't show whoToFollow handles already in ctPulse
                const extraFollows = followHandles.filter(h => !ctHandles.includes(h));

                if (ctHandles.length === 0 && extraFollows.length === 0) return null;

                const toHref = (h: string) => `https://x.com/${h.replace("@", "")}`;

                return (
                    <section className="seeker-detail-card">
                        {ctHandles.length > 0 && (
                            <>
                                <h3>Voices</h3>
                                <div className="seeker-handles-row">
                                    {ctHandles.map((handle, idx) => (
                                        <a key={idx} href={toHref(handle)} target="_blank" rel="noopener noreferrer" className="seeker-handle-chip">
                                            {handle.startsWith("@") ? handle : `@${handle}`}
                                        </a>
                                    ))}
                                </div>
                            </>
                        )}
                        {extraFollows.length > 0 && (
                            <>
                                <h3 style={{ marginTop: ctHandles.length > 0 ? "14px" : 0 }}>Who To Follow</h3>
                                <div className="seeker-handles-row">
                                    {extraFollows.map((handle, idx) => (
                                        <a key={idx} href={toHref(handle)} target="_blank" rel="noopener noreferrer" className="seeker-handle-chip seeker-handle-chip--follow">
                                            {handle.startsWith("@") ? handle : `@${handle}`}
                                        </a>
                                    ))}
                                </div>
                            </>
                        )}
                    </section>
                );
            })()}

            <div className="seeker-detail-disclaimer">
                AI-generated analysis from on-chain and social signal data. Verify critical claims with primary sources before acting.
            </div>
        </div >
    );
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

function formatFreshness(value?: string) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 60) return `Updated ${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Updated ${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `Updated ${diffDays}d ago`;
}

function formatShortDate(value?: string) {
    if (!value) return "";
    // "YYYY-MM-DD" strings parse as UTC midnight — in western timezones that rolls back
    // a day. Replace dashes with slashes so JS treats it as local midnight instead.
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replace(/-/g, "/") : value;
    const d = new Date(normalized);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
