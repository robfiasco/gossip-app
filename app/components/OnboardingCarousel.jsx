"use client";
import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "gossip_onboarded";

const SLIDES = [
    {
        img: "/cat-welcome.png",
        overline: "WELCOME TO GOSSIP",
        headline: "Hey! I'm Gossip Cat.\nI'll show you around.",
        body: "Gossip is the Solana intelligence terminal. Real-time market data, AI briefings, and exclusive deep-dives — all in one place.",
        quip: "Gossip Cat, reporting for duty",
    },
    {
        img: "/cat-market.png",
        overline: "PANEL 1 — SIGNAL BOARD",
        headline: "I'm watching\nthe market for you.",
        body: "Live SOL price, 7-day delta, Fear & Greed, BTC dominance, and the week's dominant narratives ranked by CT engagement.",
        quip: "Gossip Cat sees all",
    },
    {
        img: "/cat-briefing.png",
        overline: "PANEL 2 — DAILY BRIEFING",
        headline: "AI intel, fresh\nevery morning.",
        body: "The pipeline reads thousands of tweets, clusters the narratives, and writes readable intelligence briefs. Daily at 7am UTC.",
        quip: "Gossip Cat read it first",
    },
    {
        img: "/cat-seeker.png",
        overline: "PANEL 3 — SEEKER STORIES",
        headline: "Unlock the\nexclusive stuff.",
        body: "Deep-dive analysis for Solana Seeker Genesis holders. Connect your wallet to verify your token and read today's full reports.",
        quip: "Gossip Cat found the key!",
    },
];

export default function OnboardingCarousel() {
    const [visible, setVisible] = useState(false);
    const [slide, setSlide] = useState(0);
    const [fading, setFading] = useState(true);

    useEffect(() => {
        try {
            if (!window.localStorage.getItem(STORAGE_KEY)) setVisible(true);
        } catch { /* ignore */ }
    }, []);

    const goTo = useCallback((idx) => {
        setFading(false);
        setTimeout(() => { setSlide(idx); setFading(true); }, 160);
    }, []);

    const dismiss = useCallback((permanent = true) => {
        setFading(false);
        setTimeout(() => setVisible(false), 250);
        if (permanent) {
            try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
        }
    }, []);

    const next = useCallback(() => {
        if (slide < SLIDES.length - 1) goTo(slide + 1);
        else dismiss(true);
    }, [slide, goTo, dismiss]);

    if (!visible) return null;

    const s = SLIDES[slide];
    const isLast = slide === SLIDES.length - 1;

    return (
        /* Backdrop */
        <div
            onClick={() => dismiss(false)}
            style={{
                position: "fixed", inset: 0, zIndex: 9999,
                background: "rgba(5, 7, 14, 0.45)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "16px",
                opacity: fading ? 1 : 0,
                transition: "opacity 0.25s ease",
            }}
        >
            {/* Card */}
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "100%", maxWidth: "380px",
                    background: "rgba(13, 17, 26, 0.98)",
                    border: "1px solid rgba(80, 95, 130, 0.35)",
                    borderRadius: "24px",
                    overflow: "hidden",
                    boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
                }}
            >
                {/* Cat image area */}
                <div style={{
                    height: "240px",
                    background: "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative",
                    borderBottom: "1px solid rgba(80, 95, 130, 0.15)",
                }}>
                    <img
                        key={s.img}
                        src={s.img}
                        alt=""
                        style={{
                            height: "220px", width: "220px",
                            objectFit: "contain",
                            opacity: fading ? 1 : 0,
                            transition: "opacity 0.16s ease",
                        }}
                    />
                    {/* Quip */}
                    <div style={{
                        position: "absolute", bottom: "12px",
                        background: "rgba(8,10,20,0.75)", backdropFilter: "blur(8px)",
                        border: "1px solid rgba(80,95,130,0.3)",
                        borderRadius: "999px", padding: "5px 14px",
                        display: "flex", alignItems: "center", gap: "6px",
                        opacity: fading ? 1 : 0, transition: "opacity 0.2s ease 0.05s",
                    }}>
                        <span style={{ fontSize: "0.72rem" }}>🐱</span>
                        <span style={{
                            fontSize: "0.62rem", fontFamily: "JetBrains Mono, monospace",
                            color: "#14f195", letterSpacing: "0.08em",
                            textTransform: "lowercase",
                        }}>{s.quip}</span>
                    </div>
                </div>

                {/* Text content */}
                <div style={{ padding: "22px 24px 24px" }}>
                    <p style={{
                        fontSize: "0.58rem", fontFamily: "JetBrains Mono, monospace",
                        letterSpacing: "0.14em", color: "rgba(130,145,180,0.6)",
                        textTransform: "uppercase", marginBottom: "7px",
                        opacity: fading ? 1 : 0, transition: "opacity 0.18s ease 0.04s",
                    }}>{s.overline}</p>

                    <h2 style={{
                        fontSize: "1.35rem", fontWeight: 800, color: "#eef2ff",
                        lineHeight: 1.2, marginBottom: "10px",
                        letterSpacing: "-0.01em", whiteSpace: "pre-line",
                        opacity: fading ? 1 : 0, transition: "opacity 0.18s ease 0.07s",
                    }}>{s.headline}</h2>

                    <p style={{
                        fontSize: "0.87rem", color: "rgba(160,172,210,0.75)",
                        lineHeight: 1.6, marginBottom: "20px",
                        opacity: fading ? 1 : 0, transition: "opacity 0.18s ease 0.1s",
                    }}>{s.body}</p>

                    {/* Dots */}
                    <div style={{ display: "flex", gap: "6px", marginBottom: "16px", alignItems: "center" }}>
                        {SLIDES.map((_, i) => (
                            <button key={i} onClick={() => goTo(i)} style={{
                                width: i === slide ? "20px" : "6px", height: "6px",
                                borderRadius: "999px",
                                background: i === slide ? "#14f195" : "rgba(100,120,160,0.25)",
                                border: "none", cursor: "pointer", padding: 0,
                                transition: "width 0.22s ease, background 0.22s ease",
                            }} />
                        ))}
                    </div>

                    {/* Buttons */}
                    <div style={{ display: "flex", gap: "8px" }}>
                        {slide > 0 && (
                            <button onClick={() => goTo(slide - 1)} style={{
                                flex: 1, padding: "12px", borderRadius: "12px",
                                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(80,95,130,0.3)",
                                color: "rgba(160,172,210,0.7)", fontSize: "0.88rem", fontWeight: 600,
                                cursor: "pointer",
                            }}>← Back</button>
                        )}
                        <button onClick={next} style={{
                            flex: 2, padding: "12px", borderRadius: "12px",
                            background: isLast ? "#14f195" : "rgba(20,241,149,0.12)",
                            border: `1px solid ${isLast ? "#14f195" : "rgba(20,241,149,0.3)"}`,
                            color: isLast ? "#000" : "#14f195",
                            fontSize: "0.9rem", fontWeight: 700, cursor: "pointer",
                            transition: "all 0.2s",
                        }}>{isLast ? "Let's go! 🐾" : "Next →"}</button>
                    </div>

                    <button onClick={() => dismiss(true)} style={{
                        display: "block", width: "100%", marginTop: "12px",
                        background: "none", border: "none", cursor: "pointer",
                        fontSize: "0.68rem", fontFamily: "JetBrains Mono, monospace",
                        color: "rgba(110,125,165,0.5)", letterSpacing: "0.08em",
                        textAlign: "center", padding: "4px",
                    }}>DON'T SHOW AGAIN</button>
                </div>
            </div>
        </div>
    );
}
