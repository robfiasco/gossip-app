"use client";

import React from "react";
import { ChevronLeft } from "lucide-react";
import ReactMarkdown from "react-markdown";
import AnimatedEngagementChart from "./AnimatedEngagementChart";
import ScrollMatrixBackground from "./ScrollMatrixBackground";

type Story = any; // You can refine this using your existing Story type

export default function StoryDetail({ story, index, total, onBack }: { story: Story; index: number; total: number; onBack: () => void }) {
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

    const fullText = String(story?.content?.story || story?.story || story?.narrative || "").replace(/\[object Object\]/g, "");

    const chartItems = [
        { label: "Total Engagement", value: metrics.engagement },
        { label: "Top Tweet Volume", value: metrics.topTweet },
        { label: "Tweets Analyzed", value: metrics.tweets },
        { label: "Unique Voices", value: metrics.voices },
    ].filter(item => item.value >= 10);

    return (
        <div className="seeker-detail-shell" style={{ paddingBottom: "100px", zIndex: 9999, position: "relative" }} >
            <ScrollMatrixBackground color={getKickerColor(String(story?.category || ""))} />

            <button className="seeker-detail-back" onClick={onBack} type="button">
                <ChevronLeft size={16} /> Back
            </button>

            <div className="seeker-detail-header" style={{ paddingTop: '16px', display: 'flex', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <p className="seeker-detail-sub">Premium Intelligence • {formatShortDate(story?.timestamp || story?.publishedAt)}</p>
                </div>
            </div>

            <div className="seeker-detail-hero">
                <div className={`seeker-mag-kicker ${getKickerClass(String(story?.category || ""))}`}>
                    {String(story?.category || "Seeker Story").toUpperCase()}
                </div>
                <h2 className="seeker-detail-title">{story?.title || "Untitled"}</h2>
                <p className="seeker-detail-author">Analysis by AI Gossip News Desk</p>
            </div>

            <div style={{ marginTop: "24px", marginBottom: "32px", background: "rgba(10, 11, 14, 0.4)", border: "1px solid rgba(255, 255, 255, 0.05)", borderRadius: "16px", padding: "16px" }}>
                <AnimatedEngagementChart
                    title="SIGNAL STRENGTH"
                    items={chartItems}
                    colors={["#14F195", "#9945FF", "#00C2FF", "#F14CFF"]}
                />
            </div>

            {
                timeline.length > 0 ? (
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
                ) : null
            }

            {
                keyQuotes.length > 0 ? (
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
                ) : null
            }

            {
                keyPlayers.length > 0 ? (
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
                fullText ? (
                    <section className="seeker-editorial-body">
                        <ReactMarkdown>{fullText}</ReactMarkdown>
                    </section>
                ) : null
            }

            <div className="seeker-detail-disclaimer">
                AI-generated analysis from on-chain and social signal data. Verify critical claims with primary sources before acting.
            </div>
        </div >
    );
}

function getKickerClass(categoryRaw: string) {
    const category = String(categoryRaw || "").toLowerCase();
    if (/security|risk|breach|exploit|hack/.test(category)) return "critical";
    if (/ai|agent/.test(category)) return "ai";
    if (/gaming|game/.test(category)) return "gaming";
    if (/alpha/.test(category)) return "alpha";
    if (/mobile|seeker/.test(category)) return "mobile";
    if (/privacy|zk/.test(category)) return "privacy";
    return "";
}

function getKickerColor(categoryRaw: string) {
    const category = String(categoryRaw || "").toLowerCase();
    if (/security|risk|breach|exploit|hack/.test(category)) return "#ff7f86"; // critical
    if (/ai|agent/.test(category)) return "#ae88ff"; // ai/purple
    if (/gaming|game/.test(category)) return "#14f195"; // gaming/green
    if (/alpha/.test(category)) return "#14f195"; // alpha/green
    if (/mobile|seeker/.test(category)) return "#00c2ff"; // mobile/cyan
    if (/privacy|zk/.test(category)) return "#ef77c7"; // privacy/pink
    return "#00c2ff"; // default cyan
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

function formatShortDate(value?: string) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
